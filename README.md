# Copinex Platform

Compensation engine + platform for Copinex, an AI-assisted copy-trading ecosystem with a network-marketing compensation layer.

## Stack

- **Engine** — pure TypeScript domain core (`packages/engine`), framework-agnostic, integer-cents money math
- **API** — Node.js + Express + TypeScript (`apps/api`)
- **Frontend** — Next.js App Router + Tailwind (`apps/web`)
- **Database** — PostgreSQL 16 + Drizzle ORM
- **Tests** — Vitest (engine unit + API integration via Supertest)

## Monorepo layout

```
platform/
├── apps/
│   ├── api/          # Express API (auth, wallets, investments, PAMM, admin, jobs)
│   └── web/          # Next.js app — two shells (see below)
├── packages/
│   └── engine/       # THE compensation engine — pure TS, no framework deps
├── database/         # Drizzle schema + migrations + seeds
├── infrastructure/   # service supervisor, backup, cleanup, logs
└── docs/             # analysis, decisions, reports
```

## The two web shells

`apps/web/app` is split by route group, and this split is the whole design:

| Group | Shell | Routes |
|---|---|---|
| `(marketing)` | Light official design (`marketing.css`) — risk bar, sticky header, navy footer | `/` `/about` `/services` `/pricing` `/faq` `/contact` `/login` `/register` `/forgot-password` `/reset-password` `/verify-email` |
| `(portal)` | Dark navy app shell (`bg-night` + `app-glow`) — everything behind a session | `/dashboard` `/wallet` `/invest` `/invest/history` `/connect` `/network` `/profile` `/notifications` |
| `(portal)/admin` | Dark shell + admin tab bar | `/admin` → `/admin/{overview,members,withdrawals,investments,content,settings,audit,brokers}` |

`app/(marketing)/layout.tsx` and `app/(portal)/layout.tsx` own the chrome; the
root layout only supplies fonts + metadata so both shells can coexist.

## Money rule

All monetary values are **integer cents** (`bigint`/`number` cents) end-to-end. Never floats. The spec's reconciliation invariants are enforced as automated tests on every deploy:

- Fee split: `45 + 30 + 10 + 8 + 7 = 100%`
- Profit split: `60 + 10 + 30 = 100%`

Money can never go negative: wallets, pools, and share columns are guarded by DB `CHECK` constraints (migration 0002), and every movement writes an append-only ledger entry with `balance_after`.

## Locked business rules

These are decisions, not configuration. Changing any of them is a product change, not a fix.

- **Q1 — Active = paid $50 fee.** Activation gates withdraw / invest / PAMM. It never gates *earning*.
- **Q2 — No sponsor override.** Every account earns regardless of Active status.
- **Q3 — Settlement = 90 days** (`AVAILABLE_AFTER_DAYS` in `packages/engine/src/constants.ts` is the single source of truth; daily credits unlock together at day 90).
- **Q4 — Pay2Crypto rail only, no payout rail.** Withdrawals are admin-approved manual USDT transfers; the admin records the `payoutTxid`.
- `bonus_payloads.compressed` is vestigial (always false), kept for audit compatibility.

Engine constants are authoritative. The `config` table mirrors some of them for display, but **no code path reads settlement/accrual periods from `config`** — a stale row there cannot change settlement math. (A `investment.availableAfterDays=99` row once sat in the dev DB contradicting Q3; it was deleted.)

## Money rails

- **Deposit** — `POST /api/wallets/deposit` (Pay2Crypto invoice) or `POST /api/admin/wallets/deposit` (admin credit; ledger `DEPOSIT`)
- **Withdrawal** — `POST /api/wallets/withdraw` (member requests; funds are **held immediately**, request enters `PENDING`)
- **Review** — `POST /api/admin/wallets/withdrawals/:id/approve` (marks `PAID`, records the txid) or `/reject` (refunds the hold, ledger `WITHDRAWAL_REFUND`)

## Auth

- Register/login return a JWT (7d, `JWT_SECRET` required — the API **fails fast** if missing, no fallback). Every token carries a `jti`.
- Sessions are stored server-side as `sha256(token)` with `revokedAt`, so logout and "revoke this device" take effect immediately. `GET /api/auth/sessions` lists them; `POST /api/auth/sessions/:id/revoke` kills one.
- Full account surface: email verification, resend, forgot/reset password (1h TTL), profile update, change password, session list/revoke, notifications.
- Transactional email via `SMTP_URL` (required in production) — verification (24h TTL) and reset (1h TTL) links. Without SMTP the API **throws on boot** rather than pretending reset works.
- Rate limiting: 300 req/15min global, 20 req/15min on `/api/auth` (skipped in test env).
- Web: the token lives in `localStorage` (`copinex_token`). No token → clearly-badged demo mode. See the known trade-off in `DEPLOYMENT.md` §5.

## Admin console

Permission-gated, audit-logged. `ADMIN` implicitly holds every permission (role hierarchy); the permission catalog (`permissions` / `role_permissions`) exists for future non-ADMIN roles.

- **Overview** — headline numbers, pool balances, recent audit
- **Members** — search, activation filter, activate ($50), edit name/role/status (self-demote is blocked server-side)
- **Withdrawals** — the manual USDT queue: approve with txid / reject (refunds the hold)
- **Investments** — the book plus settlements with the 60/10/30 split
- **Content** — announcements (draft vs publish; publishing fans out a notification to every member)
- **Settings** — JSON config with client-side validation before send
- **Audit** — immutable trail of every mutating admin action

## Getting started

```bash
pnpm install
cp .env.example .env          # then set JWT_SECRET: openssl rand -base64 48
pnpm --filter @copinex/database migrate
pnpm --filter @copinex/database seed-users
pnpm --filter @copinex/engine build
pnpm --filter @copinex/api build
pnpm --filter @copinex/web build
.\infrastructure\service\copinex-service.ps1 start
```

Postgres 16 runs as the native Windows service `postgresql-x64-16` on
`127.0.0.1:5433` (no Docker). `copinex-service.ps1` supervises the API (`:4000`)
and web (`:3000`) via PID files + health checks; `status`, `watch`, `restart`.

### Seeded accounts

`pnpm --filter @copinex/database seed-users` is **idempotent and self-repairing**:
the accounts below are fixtures the seed owns, so re-running resets their
passwords to these values and repairs their role/status.

| Email | Password | Role | State |
|---|---|---|---|
| `superadmin@copinex.com` | `SuperAdmin@12345` | SUPERADMIN | activated, all permissions + the sole authority over roles |
| `admin@copinex.com` | `Admin@12345` | ADMIN | activated, all permissions except role management |
| `client@copinex.com` | `Client@12345` | MEMBER | activated, $500 COPINEX + $120 WITHDRAWAL demo balances |
| `clienttest@copinex.com` | `ClientTest@12345` | MEMBER | activated, $250 COPINEX + $50 WITHDRAWAL — a disposable account for exercising member journeys |

> **These are published dev passwords.** Delete or rotate all four before the
> platform takes real money, `superadmin@copinex.com` first.

### Roles

`SUPERADMIN > ADMIN > MEMBER`. ADMIN and SUPERADMIN both reach the console;
MEMBER does not. The single difference is staff authority:

- **SUPERADMIN** is the only role that can grant, change, or revoke a role, and
  the only one that can edit another staff account. Without it, any ADMIN could
  mint unlimited admins or disable a peer.
- **ADMIN** has every operational permission and manages ordinary members
  (name, status, activation) — but any request that includes `role`, or that
  targets a staff account, is refused with 403.
- A role change **revokes the target's sessions**, so old authority dies
  immediately rather than at JWT expiry.
- Nobody can demote, disable, or suspend their own account — a superadmin
  included, so the last superadmin cannot be locked out.

The vocabulary lives in one place, `apps/api/src/lib/roles.ts`, mirrored by
`apps/web/lib/api.ts`; migration `0009` adds the enum value.

> The seed hashes with the **hex-string** salt, exactly as `apps/api/src/lib/password.ts`
> verifies, and self-verifies on every run. An earlier version hashed with a raw
> byte salt, which produced accounts that could never sign in — the seed is the
> only place that can go wrong, so it now asserts its own output.

## Verifying a change

```bash
pnpm -r test                                        # 66 engine + 80 API = 146
pnpm --filter @copinex/api build                    # tsc, strict
pnpm --filter @copinex/web build                    # next build (includes typecheck)
.\infrastructure\service\copinex-service.ps1 restart
```

`next build` is the web typecheck — it fails on any type error, so a green web
build is a green typecheck. `apps/web` also exposes `pnpm --filter @copinex/web typecheck`.

## Source of truth

`docs/project-analysis.md` — full requirements analysis, architecture, DB design, API spec, roadmap, and risks. The calculation logic is extracted from the *Copinex Business Plan & Compensation Plan* (Sections 7, 9–16).

## Reports

- `docs/project-audit.md` — full audit, gap analysis, scorecard, and the phased production-readiness roadmap
- `docs/investment-package.md` — the 90-Day Investment Package (engine → DB → API → web → E2E)
- `docs/phase1-foundation.md` — Phase 1 (security + money rails + auth UI) implementation notes
- `docs/re-audit-phase2.md` — re-audit after the compensation + investment phases
- `docs/ui-implementation.md` — the two-shell UI plan and route map
- `docs/api-reference.md` — every endpoint, grouped by surface
- `docs/security-review.md` — the shipped security posture, reviewed honestly
