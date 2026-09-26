# Copinex - Deployment Runbook

Production target for the pilot: this Windows machine (PostgreSQL 16 on :5433,
API on :4000, web on :3000). This runbook is the operational contract for
going live with real money and real members.

## 1. Before go-live (the checklist)

- [ ] **Pay2Crypto merchant token** - create the merchant account at
      app.pay2crypto.com, connect a wallet, generate a scoped token. Set
      `PAY2CRYPTO_API_URL`, `PAY2CRYPTO_TOKEN`, `PAY2CRYPTO_WEBHOOK_SECRET`
      in `platform/.env`. The API **refuses to boot in production** without
      all three (mock mode is dev-only).
- [ ] **Real JWT secret** - `openssl rand -base64 48`. The API refuses to
      boot in production with the dev placeholder.
- [ ] **Production database** - dedicated credentials, not the dev password.
      Run `pnpm --filter @copinex/database migrate` against it, then seed
      (`pnpm --filter @copinex/database seed`).
- [ ] **Real broker PAMM links** - replace the PUPRIME/DERIV placeholders in
      the `brokers` table (admin UI or SQL) before members see them.
- [ ] **Pre-pilot cleanup** - run `infrastructure\cleanup\pre-pilot-cleanup.ps1`
      to remove test users (`e2e@test.dev`, `flow*@test.dev`) and any
      placeholder data from the production DB.
- [ ] **Webhook URL** - register `https://<domain>/api/webhooks/pay2crypto`
      with Pay2Crypto using the production webhook secret.
- [ ] **Domain + TLS** - terminate TLS at a reverse proxy (nginx/Caddy) or
      cloud load balancer in front of :3000/:4000. If the API sits behind a
      proxy, set `app.set('trust proxy', 1)` in `apps/api/src/app.ts` so
      `req.ip` (audit trail) records real client IPs.
- [ ] **Backup task headless** - from an ELEVATED shell (the current task
      runs only while a user is logged in):
      ```powershell
      schtasks /delete /tn "Copinex-DB-Backup" /f
      schtasks /create /tn "Copinex-DB-Backup" /tr "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\BerfamWorks\COPINEX\platform\infrastructure\backup\backup.ps1" /sc daily /st 02:00 /ru SYSTEM /f
      ```
      Same for the service tasks below if the machine must serve while nobody
      is logged in.

## 2. Deploying a release

```powershell
# 1. Pull + build (engine -> database -> api -> web)
git pull
pnpm --filter @copinex/engine build
pnpm --filter @copinex/database build
pnpm --filter @copinex/database migrate     # applies pending migrations
pnpm --filter @copinex/api build
pnpm --filter @copinex/web build

# 2. Run the test suite (engine + API integration)
pnpm --filter @copinex/engine test
pnpm --filter @copinex/api test

# 3. Restart services (supervisor kills old PIDs, health-checks the new ones)
.\infrastructure\service\copinex-service.ps1 restart
.\infrastructure\service\copinex-service.ps1 status
```

Rollback: `git checkout <previous-tag>` + rebuild + restart. The DB schema is
forward-only - a rollback that needs a migration reversal is a manual, careful
operation (see migration 0002 note: CHECKs/triggers live in SQL only).

## 3. Operations

| Concern | How |
|---|---|
| Health | `GET /api/health` (API) - DB + wallet reconciliation status |
| Logs | `infrastructure\logs\api.log` / `web.log` (rotated on restart) |
| Backups | Daily 02:00 `Copinex-DB-Backup` -> `infrastructure\backup\backups\` (14-day retention). Restore: `infrastructure\backup\restore.ps1` |
| Audit trail | `GET /api/admin/audit` - every mutating admin action, append-only |
| Money moves | Withdrawals are MANUAL USDT payouts - admin approves, records the txid. No automated payout rail (Q4 decision). |
| Watchdog | `Copinex-HealthWatch` task restarts a dead service every 5 min (interactive logon; upgrade to SYSTEM for headless) |

## 4. Known production decisions (do not "fix" without Henry)

- **No payout rail** - withdrawals are admin-approved manual USDT transfers
  (`payoutTxid` recorded). This is deliberate.
- **Every account earns regardless of Active status** (Q2) - `is_active` is
  administrative only. Deactivating a member does NOT stop earning.
- **Active = paid $50 fee** (Q1) - gates withdraw/invest/PAMM, never earning.
- **Settlement period = 90 days** (Q3) - daily credits unlock together at day 90.
- **`bonus_payouts.compressed` is vestigial** (always false) - kept for audit
  compatibility, no migration.

## 5. Security model (as shipped)

- scrypt password hashing (timing-safe compare), JWT expiry 7d
- Rate limiting: global 300/15min, auth 20/15min (in-memory - single instance)
- Helmet on API + CSP/security headers on web
- Production env guard: refuses dev placeholder secrets and mock payment mode
- Admin audit trail (R27) on all 12 mutating admin endpoints
- Webhook: secret-gated (`x-pay2crypto-secret` header or `?secret=`), idempotent,
  ref/amount-verified
- **Known trade-off**: bearer token in localStorage (XSS-exposed). Mitigated by
  CSP `connect-src 'self'`. Upgrade path: httpOnly cookie auth + CSRF protection.
  Recommended before a public launch with real balances.