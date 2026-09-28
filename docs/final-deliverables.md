# Copinex — Final Deliverables Report

Date: 2026-09-27
Scope: production readiness of the Copinex platform — marketing site, member
portal, admin console, backend, database, operations, and documentation.

Status legend: **Complete** = built, tested, and verified running.
**Ready, blocked on you** = built and verified, but a decision or credential
only Henry can supply. **Known gap** = deliberately not done; stated plainly.

---

## Summary

| # | Deliverable | Status |
|---|---|---|
| 1 | Public marketing site (6 pages, official design) | Complete |
| 2 | Authentication surface (register → verify → reset → sessions → 2FA) | Complete |
| 3 | Member portal (dashboard, wallet, invest, network, profile, notifications) | Complete |
| 4 | Admin console (8 sections incl. withdrawals, investments, content, settings, audit) | Complete |
| 5 | Backend API (71 endpoints, permission-gated, audited) | Complete |
| 6 | Database (28 tables, 10 migrations, DB-enforced money invariants) | Complete |
| 7 | Test suite (200 passing: 66 engine + 134 API) | Complete |
| 8 | Operations (service supervisor, backup, restore, cleanup) | Complete |
| 9 | Documentation (README, DEPLOYMENT, API reference, security review) | Complete |
| 10 | Production launch readiness | Ready, blocked on you |

---

## 1. Public marketing site — Complete

Six pages in the light official design system (`apps/web/app/(marketing)/`),
sharing a header, footer, risk-disclosure bar and landing page:

`/` · `/about` · `/services` · `/pricing` · `/faq` · `/contact`

Auth pages live in the same shell and are light, not the dark app theme.
Compliance language is present on every page that mentions returns: trading loss
is possible, broker custody is third-party, USDT settlement is manual, funds are
locked 90 days, and **no income or referral return is guaranteed**.

**Verified:** production build renders all 31 routes; every page returns 200
against the running server.

## 2. Authentication surface — Complete

Full credential lifecycle, not just a login form:

- Register with sponsor attribution (`/register?sponsor=<uuid>`, validated as a
  real user id)
- Email verification (24h token) + resend
- Password reset (1h token) and authenticated password change
- Device/session list with individual revocation and logout
- Profile update
- **TOTP two-factor** (profile page for members, mandatory enrolment for
  staff): QR enrolment, live-code confirm,
  ten single-use backup codes, password-gated disable. Enrolled logins return a
  5-minute challenge, never a session, until the second factor verifies.
- **15-minute portal idle timeout**: inactivity revokes the session server-side
  and returns the member to login with an explanation.

Security properties that are tested, not just claimed:

- Reset revokes **every** session, so a stolen token dies with the old password
- Password change revokes every *other* device, keeping the caller's session
- Email tokens are `sha256`-hashed, single-use, and time-boxed; a new reset
  retires the previous link
- `forgot-password` never reveals whether an account exists
- Tokens carry a `jti`; a revoked session is rejected on the very next request

**Verified live:** registered a member, held two sessions, ran the real emailed
reset token, confirmed `sessionsRevoked=2`, both old tokens returned 401, and
the new password logged in. Verification token set `emailVerifiedAt` and its
replay was rejected with 400.

## 3. Member portal — Complete

Dark app shell with the official design language:

- `/dashboard` — balances, position, team and network tiles, unread count
- `/wallet` — balances, deposit, withdraw, ledger
- `/invest` + `/invest/history` — packages, positions, 90-day availability shown
- `/network` — referral tree and generation volumes
- `/profile` — account details, password change, session management
- `/notifications` — announcements and system notices, read/unread

**Verified:** 200 against the running server; no token shows a clearly-badged
demo mode rather than a broken page.

## 4. Admin console — Complete

Eight sections behind `requireAdmin` + a permission catalog, with an audit trail
on every mutation:

- **Overview** — counters, pool balances, recent activity
- **Members** — search, activation filter, activate ($50), edit name/role/status
  (self-demote/disable/suspend blocked server-side)
- **Withdrawals** — the manual USDT queue: approve with `payoutTxid`, or reject
  and refund the hold
- **Investments** — the book and settlements (60/10/30 split)
- **Content** — announcements; publishing fans out a notification to every member
- **Settings** — JSON config with client-side validation
- **Audit** — append-only log of every mutating action
- **Brokers** — broker/PAMM directory

**Verified:** admin login → overview → member search/filter → settings CRUD →
announcement publish → notification received → audit entry present, all against
the live API.

## 5. Backend API — Complete

66 endpoints across auth, wallets, investments, payments, PAMM, jobs, webhooks
and admin. Uniform error envelope (`{ error, message }` with stable machine
codes). Global and auth-specific rate limits. Helmet on every response.

Money rails: Pay2Crypto deposit, admin credit, member withdrawal with immediate
hold, admin approve/reject with `payoutTxid` recorded. Production refuses to
boot without the Pay2Crypto merchant token, a real JWT secret, and SMTP.

**Verified:** 99 API integration tests green, including a dedicated
auth/security suite added in this pass.

## 6. Database — Complete

27 tables, 9 migrations, applied to both `copinex` and `copinex_test`.

The important part is what the database refuses to allow:

- `CHECK` constraints and a trigger keep wallets, pools and share columns
  non-negative — a service bug cannot mint money, only fail
- Every foreign key is `NO ACTION` **on purpose**, so a user can never be
  deleted out from under a ledger entry, payment or withdrawal
- Money is integer cents end to end; the `100%` fee and profit splits are
  asserted as tests

**Verified:** 66 engine tests covering allocation, bonuses, ranks, matrix
placement, pools, investment accrual, 90-day settlement and reconciliation.

## 7. Test suite — Complete

**200 passing** — 66 engine (Vitest unit) + 134 API (Supertest integration).

New in this pass: `apps/api/tests/auth-security.integration.test.ts` (19 cases)
covering session revocation on credential change, email-token single-use,
enumeration resistance, notification fan-out, and the admin content/settings/
member surfaces. It immediately caught two real defects (below) plus an audit
bug that had been silently dropping every settings audit row.
Newest: `apps/api/tests/two-factor.integration.test.ts` (11 cases) covering
TOTP enrolment, challenge login, backup-code single-use, the challenge-is-not-
a-session guard, and disable. It caught a real defect too (backup codes minted
at 6 chars against an 8-char verifier).

## 8. Operations — Complete

- **Service supervisor** (`copinex-service.ps1 start|stop|restart|status|watch`) —
  PID files, port checks, health checks, log rotation. Resolves Node to an
  absolute path so it also works under a SYSTEM scheduled task.
- **Backups** — daily 02:00, 14-day retention, currently producing dumps.
- **Restore — proven, not assumed.** The latest automated dump was restored into
  a scratch database: 27 tables, 4 users, 175 ledger rows came back intact.
- **Pre-pilot cleanup** — rewritten. It previously assumed CASCADE (which does
  not exist in this schema) and would have failed at go-live. It now deletes in
  dependency order and **refuses** to delete any account carrying money or audit
  history, reporting it for a human decision instead.

**Verified:** services running (API PID 43996, web PID 46212), both health
endpoints 200, backup and restore both exercised today.

## 9. Documentation — Complete

| Document | Contents |
|---|---|
| `README.md` | Stack, the two-shell web architecture, money rules, locked business rules, getting started, seeded accounts, how to verify a change |
| `DEPLOYMENT.md` | Pre-launch checklist, release procedure, operations table, the locked decisions, security model, and the elevated headless-task one-liner |
| `.env.production.example` | Every production variable including `SMTP_URL`, `EMAIL_FROM`, `APP_URL` |
| `docs/api-reference.md` | All 66 endpoints, auth model, error codes, rate limits, audit codes |
| `docs/security-review.md` | What is solid, what is weak ranked by severity, the defects found and fixed, and what is explicitly *not* covered |

## 10. Production launch readiness — blocked on you

The code is ready. Five things are not mine to do:

1. **Pay2Crypto merchant token** — required in production; the API refuses to
   boot without it. No withdrawal can move real money until it exists.
2. **SMTP + DNS** — `SMTP_URL`, and `EMAIL_FROM` on a domain with SPF/DKIM. The
   API refuses to boot without SMTP. Verify by resetting a real mailbox and
   checking the SPF/DKIM pass, not just that the mail arrived.
3. **Elevated headless tasks** — all three Copinex tasks are `Interactive only`,
   so after a reboot with nobody logged in nothing starts the platform. There is
   also no boot task at all. The exact elevated commands are in `DEPLOYMENT.md`
   §1; they need an administrator shell, which I cannot self-elevate to.
4. **Two tainted dev accounts** — `e2e@test.dev` (an **ADMIN** account holding
   175 money/audit rows) and `flow000400@test.dev` (3 rows). The cleanup script
   deliberately refuses to delete these because ledger history is append-only.
   My recommendation: this is a development database, so wipe and re-migrate
   before launch rather than trying to surgically remove them. That is your
   call, not mine to make unilaterally.
5. **Broker PAMM links** — the PUPRIME/DERIV entries are placeholders; replace them
   before members see the directory.

### Recommended before real funds (from `docs/security-review.md`)

Auth hardening landed 2026-09-28 in two passes: opt-in TOTP (migration
`0010`) plus a 15-minute portal idle timeout, then staff 2FA enforcement,
per-account login lockout (migration `0011`), httpOnly session cookies,
HS256 pinning, and env-gated `TRUST_PROXY`. Still open: nonce-based CSP,
lockout spike alerting, and setting `TRUST_PROXY=1` behind the real proxy. Also worth stating plainly: **there has
been no penetration test and no load test.** Everything above is source review
plus automated tests. An external pen test of the auth, admin and money paths
is the single best pre-launch spend.

---

## Verification commands

```powershell
cd C:\BerfamWorks\COPINEX\platform
pnpm -r test                                          # 200 tests
pnpm --filter @copinex/engine build
pnpm --filter @copinex/database build
pnpm --filter @copinex/api build
pnpm --filter @copinex/web build                      # 31 routes, includes typecheck
.\infrastructure\service\copinex-service.ps1 restart
.\infrastructure\service\copinex-service.ps1 status
```

Seeded accounts (repaired, not skipped, on every `seed-users` run):

| Email | Password | Role |
|---|---|---|
| `admin@copinex.com` | `Admin@12345` | ADMIN |
| `client@copinex.com` | `Client@12345` | MEMBER |

## Locked rules — do not change without Henry

- **Q1** Active = the paid $50 fee. It gates withdraw / invest / PAMM, and
  **never** gates earning.
- **Q2** No sponsor override: every account earns regardless of Active status.
- **Q3** Settlement = 90 days. `AVAILABLE_AFTER_DAYS` in
  `packages/engine/src/constants.ts` is the only source of truth; no code reads
  a settlement period from the `config` table.
- **Q4** Withdrawals are admin-approved manual USDT transfers, with the
  `payoutTxid` recorded. There is no automated payout rail.
