# Phase 1 — Foundation: Security, Money Rails, Auth UI

Implemented 2026-09-26 per the approved audit (`docs/project-audit.md`). Every change tested; full suite green.

## What shipped

### 1. Git hygiene (P0)
- The entire working tree (API, web, database, docs — 59 files, 9,070 insertions) was uncommitted behind a single `8bde2d6`. Committed as `06e3600`.

### 2. JWT fail-fast (P0)
- `apps/api/src/config/env.ts`: removed the hardcoded fallback secret. `JWT_SECRET` is now required (min 32 chars) — the API refuses to boot without it. No forgeable default exists anymore.

### 3. Rate limiting (P0)
- `express-rate-limit@8.7.0`, wired in `apps/api/src/middleware/rate-limit.ts` + `app.ts`:
  - Global: 300 req / 15 min per IP on `/api/*`
  - Auth: 20 req / 15 min per IP on `/api/auth` (the brute-force surface)
  - Skipped when `NODE_ENV === 'test'` so the integration suite stays fast
  - In-memory store — swap for Redis before running multiple API instances

### 4. Money rails (P0)
New schema (migration `0002_right_ikaris.sql`):
- `withdrawal_requests` table (PENDING → PAID/REJECTED, admin + reviewed_at audit fields)
- `bonus_type` enum extended: `DEPOSIT`, `WITHDRAWAL`, `WITHDRAWAL_REFUND`

New endpoints:
| Endpoint | Role | Behavior |
|---|---|---|
| `GET /api/wallets` | member | Both wallet balances + pending holds (deterministic order) |
| `POST /api/wallets/withdraw` | member | Holds funds immediately (debit + ledger `WITHDRAWAL`), creates PENDING request |
| `GET /api/wallets/withdrawals` | member | Own requests |
| `POST /api/admin/wallets/deposit` | admin | Credits COPINEX wallet, ledger `DEPOSIT` (interim rail — no provider yet) |
| `GET /api/admin/wallets/withdrawals?status=` | admin | All requests + user info |
| `POST /api/admin/wallets/withdrawals/:id/approve` | admin | PENDING → PAID (manual payout trigger) |
| `POST /api/admin/wallets/withdrawals/:id/reject` | admin | PENDING → REJECTED + refund (ledger `WITHDRAWAL_REFUND`) |

Design: **flag-not-pay**. Funds leave the member's wallet only when a request is created; approval is the payout record. Rejection refunds atomically. `debitWallet` (new, mirrors `creditWallet`) locks the row `FOR UPDATE` and refuses to go negative.

### 5. DB CHECK constraints + trigger (P1)
Migration 0002 adds 11 CHECK constraints (wallets/pools non-negative, ledger amounts non-zero, investment principal ≥ $50, package ranges/rates sane, earnings/commissions positive, settlement shares non-negative, withdrawal amounts positive) plus a trigger enforcing the §2 fee-split invariant: the five allocation buckets must sum to the registration fee. Existing data verified compliant on apply.

### 6. Auth UI (P0)
- `/login` and `/register` pages (shared `AuthForm` client component, dark theme, error + busy states)
- `lib/api.ts`: `login`, `register`, `logout`, `fetchMe`; token in `localStorage` (`copinex_token`)
- `DashboardHeader`: real member (name, ID, avatar, ADMIN badge) when a session exists; demo persona + **Sign in** affordance otherwise; **Sign out** clears the session
- Invest page demo badge now links to `/login`

## Verification

- Engine: 25/25 · API: 26/26 (18 original + 8 new wallet tests) · Web build: 11/11 pages
- Live E2E (dev DB): register → admin deposit $500 → member withdraw $200 → admin approve. Ledger chains exactly: `DEPOSIT(+50000 → 50000)`, `WITHDRAWAL(-20000 → 30000)`; request PAID with admin id. Wallet `CHECK` + reconciliation invariants pass on `/api/health`.

## Notes

- `withdrawal_requests` was added to the test suite's TRUNCATE list.
- The `@types/express-rate-limit` package is deprecated (v7+ bundles types) — do not reinstall.
- Member-facing Deposit/Withdraw buttons on the dashboard still link to `#` — the withdraw UI is a Phase 2/3 item (the API rails are live and tested).
- e2e test users (`e2e@test.dev`, `flow*@test.dev`) remain in the dev DB — cleanup before any real pilot.

## Next

Phase 2 (the product): registration flow → bonuses → matrix → ranks → pools → settlements, engine-first with the spec's test cases. Then Phase 7 items pulled early: CI (GitHub Actions: lint → test → build) + automated backups.