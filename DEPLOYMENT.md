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
      Run `pnpm --filter @copinex/database migrate` against it, then
      `pnpm --filter @copinex/database seed-users` (idempotent, and it repairs
      the two fixture accounts' credentials rather than skipping them).
- [ ] **Transactional email (SMTP)** - set `SMTP_URL` (`smtps://user:pass@host:465`,
      percent-encode a password containing `@` or `/`), `EMAIL_FROM` (a sender on a
      domain with SPF/DKIM) and `APP_URL` (`https://www.copinex.com`, no trailing
      slash). The API **throws on boot in production without `SMTP_URL`**:
      password reset and address verification are unusable without it, and a
      silently-skipped email is worse than a failed boot. Verify by requesting a
      reset for a real mailbox and confirming delivery + SPF/DKIM pass.
- [ ] **Real broker PAMM links** - replace the placeholder broker links in
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
- [ ] **Headless tasks (run once, ELEVATED)** - all three Copinex tasks
      currently log on "Interactive only", so they run *only while a user is
      logged in*. After a reboot with nobody signed in, nothing starts the
      platform. From an **elevated** PowerShell, recreate all three as SYSTEM:
      ```powershell
      $svc = 'C:\BerfamWorks\COPINEX\platform\infrastructure\service\copinex-service.ps1'
      $bak = 'C:\BerfamWorks\COPINEX\platform\infrastructure\backup\backup.ps1'
      $ps  = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File'

      # boot: start API + web (AT STARTUP, no user logon needed)
      schtasks /delete /tn "Copinex-ServiceStart" /f 2>$null
      schtasks /create /tn "Copinex-ServiceStart" /tr "$ps $svc start" /sc onstart /ru SYSTEM /rl HIGHEST /f

      # watchdog: restart a dead service every 5 min
      schtasks /delete /tn "Copinex-HealthWatch" /f
      schtasks /create /tn "Copinex-HealthWatch" /tr "$ps $svc watch" /sc minute /mo 5 /ru SYSTEM /rl HIGHEST /f

      # backup: daily 02:00
      schtasks /delete /tn "Copinex-DB-Backup" /f
      schtasks /create /tn "Copinex-DB-Backup" /tr "$ps $bak" /sc daily /st 02:00 /ru SYSTEM /rl HIGHEST /f
      ```
      Verify: `schtasks /query /fo LIST /v | findstr /i "copinex logon"` - every
      Copinex line must read `Logon Mode: Run whether user is logged on or not`.
      Then reboot and confirm `GET /api/health` returns 200 with no login.

      > The supervisor resolves the Node executable to an absolute path before
      > launching, because a SYSTEM process gets a minimal PATH. Do not change
      > that back to a bare `node` or the headless tasks will fail silently.

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

> **Order matters, and green tests do not prove what is running.**
>
> - `@copinex/database` must be **built** before the API is built or typechecked.
>   The API resolves `@copinex/database` to its `dist/*.d.ts`, so a schema change
>   without a rebuild produces phantom type errors against the *old* types.
> - `tsc --noEmit` does not emit. Only `pnpm --filter @copinex/api build`
>   refreshes `dist/`, which is what the supervisor actually runs
>   (`node dist/index.js`).
> - The test suite compiles from `src/`. **A passing suite says nothing about the
>   running service.** Always restart and re-verify live after a change.

## 3. Operations

| Concern | How |
|---|---|
| Health | `GET /api/health` (API) - DB + wallet reconciliation status |
| Logs | `infrastructure\logs\api.log` / `web.log` (rotated on restart) |
| Backups | Daily 02:00 `Copinex-DB-Backup` -> `infrastructure\backup\backups\` (14-day retention). Restore: `infrastructure\backup\restore.ps1` |
| Audit trail | `GET /api/admin/audit` - every mutating admin action, append-only |
| Money moves | Withdrawals are MANUAL USDT payouts - admin approves, records the txid. No automated payout rail (Q4 decision). |
| Watchdog | `Copinex-HealthWatch` task restarts a dead service every 5 min (recreate as SYSTEM - see §1) |
| Boot | `Copinex-ServiceStart` task (ON STARTUP, SYSTEM) starts API + web after a reboot with nobody logged in |

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

- scrypt password hashing (timing-safe compare), JWT expiry 7d, every token carries a `jti`
- **Server-side sessions**: `sessions` stores `sha256(token)` with `revokedAt` +
  `lastSeenAt`. Logout, "revoke this device", and (defensively) a
  revoked-token check on each authenticated request, so revocation is
  immediate rather than "eventually, when the JWT expires".
- **Email tokens are hashed too**: `email_tokens.token_hash` = `sha256(token)`;
  the plaintext exists only inside the email link. Verification TTL 24h, reset
  TTL 1h, single-use (consumed on use), and a new reset request invalidates the
  previous one.
- Password reset / verification emails are a hard boot requirement in
  production (`SMTP_URL`) rather than a silent no-op.
- Rate limiting: global 300/15min, auth 20/15min (in-memory - single instance)
- Helmet on API + CSP/security headers on web
- Production env guard: refuses dev placeholder secrets and mock payment mode
- **Permissions**: `permissions` / `role_permissions` tables; `requirePermission()`
  middleware; ADMIN implicitly holds every permission, so the hierarchy is
  role-based now and grantable later. Self-demotion, self-disable and
  self-suspension are blocked server-side (you cannot lock yourself out).
- Admin audit trail (R27) on all mutating admin endpoints
- Webhook: secret-gated (`x-pay2crypto-secret` header or `?secret=`), idempotent,
  ref/amount-verified
- Money invariants are DB-enforced, not application-enforced: `CHECK`
  constraints and a trigger in migration `0002` keep wallets, pools and share
  columns non-negative, and those live in SQL only (not in `schema.ts`).
- **Known trade-off**: bearer token in localStorage (XSS-exposed). Mitigated by
  CSP `connect-src 'self'`. Upgrade path: httpOnly cookie auth + CSRF protection.
  Recommended before a public launch with real balances.

Full honest review, including what is *not* covered: `docs/security-review.md`.
