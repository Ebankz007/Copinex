# Copinex API Reference

Base URL: `http://localhost:4000/api` (dev) — `https://<domain>/api` (production)

All responses are JSON. Errors always use the same shape:

```json
{ "error": "MACHINE_CODE", "message": "human readable detail" }
```

`message` is only for humans; branch on `error`. Validation failures from Zod
use `error: "VALIDATION_ERROR"` plus a `details` object of field errors.

## Authentication

Two mechanisms, used together:

- **Bearer JWT** — `Authorization: Bearer <token>`, 7-day expiry, carries `sub`,
  `email`, `role`, `jti`.
- **Server-side session row** — every issued token has a `sessions` row storing
  `sha256(token)`. `requireAuth` rejects a token whose session is revoked, so
  logout and "revoke this device" are immediate rather than "in 7 days".

Token without a session row is still accepted (legacy/tooling compatibility).

### Roles

`SUPERADMIN > ADMIN > MEMBER`, defined in `apps/api/src/lib/roles.ts`.

| Role | Console | Notes |
|---|---|---|
| `SUPERADMIN` | yes | Every ADMIN capability, **plus** the sole authority to grant, change or revoke a role and to edit a staff account. |
| `ADMIN` | yes | Every operational permission. A request carrying `role`, or targeting a staff account, is refused with 403. |
| `MEMBER` | no | Money actions additionally require `requireActivated` (the $50 fee). |

The `role` claim inside a JWT is **not** re-read on every request — a role change
revokes the target's sessions so the old token dies immediately rather than at
expiry.

### Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | – | `{ email, password, fullName?, sponsorId? }` → `201 { token, user, verification }`. `verification.link` is echoed **only** by the dev mail transport. `sponsorId` must be a real user UUID or the request 400s. |
| POST | `/api/auth/login` | – | `{ email, password }` → `{ token, user }`. |
| GET | `/api/auth/me` | member | `{ user, unreadNotifications }`. |
| POST | `/api/auth/verify-email` | – | `{ token }` → `{ verified: true }`. Single-use. |
| POST | `/api/auth/resend-verification` | member | Re-sends to the caller's own address. Does **not** invalidate an already-issued link. |
| POST | `/api/auth/forgot-password` | – | Always `{ ok: true }`, even for unknown addresses (no account enumeration). Sends a 1h link. |
| POST | `/api/auth/reset-password` | – | `{ token, newPassword }` → `{ ok, sessionsRevoked }`. Single-use; **revokes every session** for that user. |
| PATCH | `/api/auth/profile` | member | `{ fullName }` (nullable). |
| POST | `/api/auth/change-password` | member | `{ currentPassword, newPassword }` → `{ ok, sessionsRevoked }`. Revokes all *other* devices, keeps the caller's session. |
| GET | `/api/auth/sessions` | member | Active sessions with ip / userAgent / lastSeenAt. |
| POST | `/api/auth/sessions/:id/revoke` | member | Revoke one device. |
| POST | `/api/auth/logout` | member | Revokes the calling token. |
| GET | `/api/auth/notifications` | member | Notification list. |
| POST | `/api/auth/notifications/:id/read` | member | Mark one read. |
| POST | `/api/auth/notifications/read-all` | member | Mark all read. |

Email tokens are stored as `sha256(token)` in `email_tokens.token_hash`; the
plaintext only ever exists inside the email link. TTL: verification 24h, reset 1h.
Issuing a new reset link retires any outstanding one.

## Wallets

`walletsRouter.use(requireAuth)`, plus `requireActivated` (the $50 fee gates
money movement).

| Method | Path | Notes |
|---|---|---|
| GET | `/api/wallets` | Balances per wallet type. |
| POST | `/api/wallets/withdraw` | `{ amountCents, ... }` — funds are **held immediately**, request `PENDING`. |
| GET | `/api/wallets/withdrawals` | The member's own requests. |
| GET | `/api/wallets/ledger` | Append-only entries with `balance_after`. |

## Investments

`investmentsRouter.use(requireAuth)` — every route below requires a member
token; `POST /` additionally requires `requireActivated` (the $50 fee).

| Method | Path | Notes |
|---|---|---|
| GET | `/api/investments` | The member's positions. |
| POST | `/api/investments` | Open a position (requires activation). |
| GET | `/api/investments/:id` | Detail. |
| GET | `/api/investments/packages` | Package catalogue (member token required). |
| GET | `/api/investments/wallet` | Investment wallet. |

Settlement is **90 days** (`AVAILABLE_AFTER_DAYS` in
`packages/engine/src/constants.ts` is the only source of truth — no code reads a
settlement period from the `config` table).

## Payments (Q4 — Pay2Crypto)

`paymentsRouter.use(requireAuth)`. The webhook is the only unauthenticated
POST in the platform and is secret-gated instead.

| Method | Path | Notes |
|---|---|---|
| POST | `/api/payments/activate` | One-time $50 activation (guarded by `requireUnactivated`). |
| POST | `/api/payments/deposit` | Creates a crypto invoice. |
| GET | `/api/payments` | The member's payment history. |
| POST | `/api/webhooks/pay2crypto` | Provider callback. Secret-gated via `x-pay2crypto-secret` header or `?secret=`; idempotent; ref/amount verified. |

Production **refuses to boot** without `PAY2CRYPTO_API_URL`, `PAY2CRYPTO_TOKEN`
and `PAY2CRYPTO_WEBHOOK_SECRET` — mock mode is development-only.

## PAMM

| Method | Path | Notes |
|---|---|---|
| GET | `/api/brokers` | Broker directory. Public — no token required. |
| POST | `/api/pamm/connections` | Request a connection. `requireAuth` + `requireActivated`. |
| GET | `/api/pamm/connections` | The member's connections. `requireAuth`. |

Broker links are admin-managed. Placeholder links (`/private/copinex`) must be
replaced before launch; `infrastructure/cleanup/pre-pilot-cleanup.ps1` flags them.

## Jobs

`jobsRouter.use(requireAuth, requireAdmin)`. **Not** wired to a scheduler yet.

| Method | Path | Notes |
|---|---|---|
| POST | `/api/jobs/accrue-investments` | Daily accrual pass. |
| POST | `/api/jobs/evaluate-ranks` | Rank/milestone evaluation. |

## Admin

`requireAuth` + `requireAdmin`; specific routes also carry
`requirePermission(code)`. ADMIN implicitly holds every permission.

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/admin/overview` | – | Headline counters, pool balances, recent audit. |
| GET | `/api/admin/members` | – | `?search=&activated=&limit=`. Returns role/status/isActive/emailVerified/activity. |
| PATCH | `/api/admin/members/:id` | `members.manage` | `fullName` (nullable), `status`, `isActive`, `role`. **Any `role` change, or any edit to a staff (ADMIN/SUPERADMIN) account, is SUPERADMIN-only → 403 for an ADMIN.** Self-demote/disable/suspend → 400. A real role change revokes the target's sessions. |
| POST | `/api/admin/members/:id/activate` | `members.manage` | Marks the $50 fee paid. |
| GET | `/api/admin/announcements` | – | |
| POST | `/api/admin/announcements` | `content.manage` | `status: PUBLISHED` fans out a notification to every member. |
| PATCH | `/api/admin/announcements/:id` | `content.manage` | |
| DELETE | `/api/admin/announcements/:id` | `content.manage` | |
| GET | `/api/admin/settings` | – | All config rows. |
| PUT | `/api/admin/settings/:key` | `settings.manage` | Body is `{ value, description? }` — the key is the URL param, not a body field. |
| DELETE | `/api/admin/settings/:key` | `settings.manage` | |
| GET | `/api/admin/investments` | – | The book. |
| GET | `/api/admin/investments/packages` | – | |
| POST | `/api/admin/investments/packages` | – | |
| PATCH | `/api/admin/investments/packages/:id` | – | |
| POST | `/api/admin/investments/:id/close` | – | |
| POST | `/api/admin/wallets/deposit` | – | Manual credit (interim rail). |
| GET | `/api/admin/wallets/withdrawals` | – | The manual USDT queue. |
| POST | `/api/admin/wallets/withdrawals/:id/approve` | – | Marks `PAID`; record the `payoutTxid`. |
| POST | `/api/admin/wallets/withdrawals/:id/reject` | – | Refunds the hold (`WITHDRAWAL_REFUND`). |
| GET | `/api/admin/pools` | – | |
| GET/POST | `/api/admin/settlements` | – | List / record. |
| GET | `/api/admin/ranks/milestones` | – | |
| POST | `/api/admin/ranks/milestones/:id/pay` | – | |
| GET | `/api/admin/ranks/leadership` | – | |
| POST | `/api/admin/ranks/leadership/:id/fulfill` | – | |
| GET | `/api/admin/brokers` | – | |
| POST | `/api/admin/brokers` | – | |
| DELETE | `/api/admin/brokers/:id` | – | |
| GET | `/api/admin/pamm/connections` | – | |
| GET | `/api/admin/audit` | – | `?limit=` (default 100, max 500). Append-only. |

Every mutating admin route writes an audit row **after** the action succeeds.
Audit codes: `PACKAGE_CREATE`, `PACKAGE_UPDATE`, `INVESTMENT_CLOSE`,
`WALLET_DEPOSIT`, `WITHDRAWAL_APPROVE`, `WITHDRAWAL_REJECT`, `SETTLEMENT_RECORD`,
`MILESTONE_PAY`, `LEADERSHIP_FULFILL`, `BROKER_CREATE`, `BROKER_DEACTIVATE`,
`MEMBER_ACTIVATE`, `MEMBER_UPDATE`, `ANNOUNCEMENT_*`, `SETTING_UPDATE`,
`SETTING_DELETE`.

## Health

`GET /api/health` — DB reachability + wallet reconciliation status. Used by the
service supervisor and the watchdog.

## Rate limits

- Global: 300 requests / 15 min per IP
- `/api/auth/*`: 20 requests / 15 min per IP (disabled under `NODE_ENV=test`)

Both are in-memory, which means they reset on restart and are per-instance. A
multi-instance deployment needs a shared store.
