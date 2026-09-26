# COPINEX — Post-Phase-2 Re-Audit & Spec Compliance Walkthrough

**Auditor:** Kairos · **Date:** 2026-09-26 · **Scope:** spec compliance (per `docs/project-analysis.md`, derived from the Copinex Calculation Spec PDF) against the built engine, API, DB, and web — plus the four open business questions.
**Method:** read of every engine module, the registration pipeline, all migrations, the API route surface, the rate-limit/auth middleware, the schema, and the audit baseline (`docs/project-audit.md`, 2026-09-25). CI run #4 green (test + build-web) at time of writing.
**Baseline:** the 2026-09-25 audit scored the product ~4/10 ("solid foundation, pre-alpha") with the compensation engine at ~15% implemented. This re-audit measures the delta.

---

## 1. SPEC COMPLIANCE MATRIX

### §1 — Global constants (R1, R28) — ✅ COMPLIANT
`REGISTRATION_FEE_CENTS = 5000`, `MIN_FUNDING_CENTS = 5000`, `MATRIX_WIDTH = 3`, `MATRIX_DEPTH = 3`, `GENERATION_LEVELS [2..6]`, `MAX_LEG_CONTRIBUTION = 0.4`. All present in `constants.ts`, all integer cents.

### §2 — Fee allocation 45/55 + 30/10/8/7 (R2, R3) — ✅ COMPLIANT
`allocation.ts` splits via largest-remainder (buckets always reconcile to the cent). §12 invariant enforced in-code with a throw. **DB-level:** migration 0002 adds bucket non-negativity CHECKs and the `fee_allocation_sum_check` trigger (split must equal the registration fee). The audit's "zero CHECK constraints" (HIGH) is closed.

### §3 — Direct Referral $15 (R4) — ✅ COMPLIANT
`bonuses.ts`: 30% of fee, one level, once, Active-gated + compression (§9.2). Wired in the registration pipeline: wallet credit + ledger entry + `bonus_payouts` row with `compressed` flag. Unallocated share (no qualified upline) stays in the community pool — tracked on the `fee_allocations` row.

### §4 — Generation Bonus Gen 2–6 (R6) — ✅ COMPLIANT
`4/2/1.5/1.5/1%` → $2/$1/$0.75/$0.75/$0.50. Nth-qualified-upline resolution, compression-aware, one payout per tier. Same wallet/ledger/payouts wiring as §3.

### §5 — Associate Ranks 1–8 + Rank Pool (R7, R8, R9) — ✅ COMPLIANT
- Rank pool accrual `+$4/reg` **derived from `allocateRegistrationFee()`** — the accrual can never drift from the allocation.
- Ranks 1–8: `minPersonalReferrals AND minTeamVolume`, bottom-up, paid once (progressive above `highestEarnedRank`).
- 40% leg cap: `computeCappedTeamVolume` caps each leg at 40% of the **uncapped** total.
- Pool solvency applied at payout time (§10 flag-not-pay); FLAGGED milestones still advance the rank (qualification stands, payment deferred to admin).
- Team volume = Σ downline registration fees ($50/reg), leg-attributed — a documented assumption, not a spec number.

### §6 — Leadership Ranks 1–6 + Leadership Pool (R11, R12, R13) — ✅ COMPLIANT
- Leadership pool `+$3.50/reg` (derived from allocation).
- Ranks 1–6: self-qualification gate (member must hold the required associate rank) + 2 legs × 3 members at that rank.
- Non-cash SKU model (`SMARTPHONE → HOME_APARTMENT`); rewards created `REVIEW`, admin-fulfilled — no money moves.

### §7 — Trading Profit Share 60/10/30 (R14, R26) — ✅ ENGINE / ⚠️ OPERATIONS
- Split 60/10/30, **only on realized profit > 0**; loss/breakeven pays nobody. In-code reconciliation throw.
- Sponsor Override: Active-gated + compresses like Direct Referral, **config-driven** (`requireActive`, default true). Unallocated share reverts to the company bucket (row always reconciles to 100%).
- Client's 60% stays on their own broker-funded account — recorded, never platform-credited. Correct per the custody model.
- **Gap:** the data source is the admin endpoint (interim). No scheduled settlement job, no broker/PAMM profit feed. **This is now the #1 integration gap after the PAMM pivot** (see §5 below).

### §8 — Matrix 3×3 + spillover (R15, R16) — ✅ COMPLIANT
`matrix.ts` decides placement (row left-to-right → least-populated leg, leftmost tie-break); the API recurses down the spillover chain with a depth guard. Recursive-CTE subtree sizing.

### §9 — Compression + Active policy + rank maintenance (R5, R17, R18) — ⚠️ PARTIAL
- §9.2 compression: ✅ fully implemented (skip inactive, next qualified, bounded `COMPRESSION_STOP_AT_GEN = 6`, malformed-chain validation).
- §9.1 Active Member policy: ❌ **the engine is correct but the policy doesn't exist.** `is_active` defaults `true`, `last_activity_at` exists in the schema but **nothing writes it**. Compression is currently decorative — every member is Active, so bonuses always land on the natural upline. This is business question Q1.
- §9.3 rank maintenance: ✅ highest rank permanent (progressive evaluation); ⚠️ "perks gated" beyond rewards is not modeled (no perk system).

### §10 — Pool solvency (R10) — ✅ COMPLIANT
`resolvePoolPayout` flag-not-pay; API applies it atomically with `SELECT … FOR UPDATE` on the pool row (registration pipeline + milestone pay endpoint).

### §11 — Spec test cases (R20) — ✅ COMPLIANT
TC1/TC2 pinned in engine tests; registration integration tests pin the money math to the cent (allocation 2250/1500/500/400/350, direct 1500, gen 200/100/75/75/50, rank-1 3500, rank-2 8000).

### §12 — Reconciliation invariants (R19) — ✅ COMPLIANT
`FEE_SPLIT_TOTAL`/`PROFIT_SPLIT_TOTAL` compile-time checks + in-code throws + DB trigger. 45+30+10+8+7=100 and 60+10+30=100 hold.

### 90-Day Investment Package (added 2026-09-25) — ✅ COMPLIANT
Full stack, 25 engine + 18 API tests, live E2E reconciled. `UPLINE_COMMISSION_SPLIT` sums exactly to 10000 bps.

### Requirements R21–R28
| Req | Verdict | Notes |
|---|---|---|
| R21 Wallet + ledger | ✅ | balance_after trail, FOR UPDATE, now with deposit/withdraw rails |
| R22 Admin review queue | ✅ | FLAGGED milestones + pay, leadership fulfill, withdrawal approve/reject |
| R23 Auth + RBAC | ✅ | JWT, requireAuth/requireAdmin, rate-limited |
| R24 Member dashboard | ⚠️ | login/register UI exists; dashboard still partially demo/hardcoded |
| R25 Admin dashboard | ❌ | API-only (brokers page is the only admin UI) |
| R26 Settlements job | ⚠️ | admin endpoint + idempotent; no scheduler, no feed |
| R27 Audit logging | ⚠️ | ledger for money movement; **no admin-action audit table** |
| R28 MIN_FUNDING | ✅ | constant present |

---

## 2. DELTA SINCE THE 2026-09-25 AUDIT

### Closed since baseline
| Audit finding | Status |
|---|---|
| C1 — one commit, all work uncommitted | ✅ 10 commits, all pushed, CI green |
| S1 — no rate limiting | ✅ global 300/15min + auth 20/15min (express-rate-limit) |
| S2 — JWT fallback secret | ✅ removed; fails fast on missing secret |
| P0 — deposit/withdraw rails | ✅ admin deposit, member withdraw, admin approve/reject |
| P0 — login/register UI | ✅ `/login` + `/register` (AuthForm wired to API) |
| P1 — DB CHECK constraints | ✅ migration 0002 + fee-split trigger |
| P1 — CI/CD | ✅ GitHub Actions (lint→build→test, build-web) |
| P1 — backups | ✅ nightly pg_dump scheduled task + restore scripts |
| P0 — compensation engine absent | ✅ **the core product now exists** (see matrix) |
| P2 — connect flow dead-end | ✅ replaced by the live PAMM service |

### Still open (unchanged from baseline)
- S3 admin 2FA · S4 email verify/password reset · S5 security headers · S6 user enumeration · S7/A5 admin audit trail
- R25 admin dashboard UI · R26 settlement scheduler + feed
- A1 accrual job batching (~370 queries/investment) · A2/A3 N+1 · bigint `mode:'string'`
- Notifications · referral-link UI (sponsor_id is register-time only) · Redis (declared, unused)

---

## 3. UPDATED SCORECARD (baseline → now)

| Dimension | 09-25 | Now | Driver |
|---|---|---|---|
| Product completeness | 2 | **6** | compensation engine + PAMM live; auth UI, admin UI, feed still missing |
| Frontend | 6 | **6** | login/register + real connect flow; dashboard still partially demo |
| Backend | 5 | **7** | full compensation API, 56 integration tests |
| Database | 6 | **8** | CHECKs + fee-split trigger |
| Security | 3 | **4** | rate limit + JWT fail-fast; 2FA/headers/verify still absent |
| Authentication | 5 | **5** | unchanged |
| Authorization | 7 | **7** | unchanged |
| Performance | 5 | **5** | accrual loop + N+1 unchanged |
| Scalability | 4 | **4** | unchanged |
| Testing | 5 | **7** | 83 engine + 56 API (was 43 total); CI-gated |
| DevOps | 1 | **6** | CI green, backups scheduled, compose aligned |
| Infrastructure | 2 | **4** | compose fixed to :5433; Docker daemon still down |
| Monitoring | 2 | **2** | unchanged |
| Documentation | 5 | **7** | phase1/phase2/pamm docs |
| Accessibility | 4 | **4** | unchanged |
| UX/UI | 7 | **8** | dead CTAs largely replaced by real flows |
| Data integrity | 6 | **8** | DB-level enforcement added |
| Disaster recovery | 1 | **4** | nightly dump + restore scripts (untested restore drill) |
| **Overall** | **~4** | **~6** | "pre-alpha" → "compensation core complete, operations layer missing" |

---

## 4. THE FOUR BUSINESS QUESTIONS

### Q1 — Active Member policy (§9.1): what makes a member "active"?
**Spec:** "numeric thresholds not defined" — explicitly deferred.
**Built:** `is_active` boolean (default true), `last_activity_at` column exists but is never written. Compression reads `is_active` correctly.
**The stakes:** until this is answered, compression is decorative — every member is Active, bonuses always pay the natural upline, and the §9.2 machinery never engages.
**Options:**
- **(a) Activity window:** touch `last_activity_at` on login/invest/referral; a sweep job flips `is_active=false` after a configurable window (default 90 days). Compression becomes real, automatically.
- **(b) Funding-based:** Active = funded broker account ≥ $50. Aligns earning with participation but harshly couples the referral layer to the trading side.
- **(c) Manual:** admin deactivation only (fraud/compliance). Weakest — requires human attention forever.
**Decision (2026-09-26, Henry):** **Active = the $50 activation fee is paid.** Two distinct concepts, kept deliberately separate:
- **`membership_activated`** (NEW) — the paid gate. A member registers (link or direct), earns commissions immediately, and sees the whole site, but **cannot withdraw, invest, or connect PAMM** until the fee is collected. Gated by the `requireActivated` middleware (DB lookup, so activation applies without re-login) on POST `/wallets/withdraw`, POST `/investments`, POST `/pamm/connections`. Admin interim rail: GET `/admin/members` (filterable) + POST `/admin/members/:id/activate` (sets `membership_activated`, `activated_at`, flips the registration `PENDING` → `PAID`). The payment-provider webhook will call the same service path.
- **`is_active`** (existing) — the administrative compression gate, unchanged. Manual deactivation only (option c) for now; an activity-window sweep (option a) can be layered on later without touching the engine.
- **Accepted consequence:** bonuses are paid from pools funded by fees that may arrive later — the company carries the float on unactivated members. This is a deliberate product decision, not an accident.
- **Test coverage:** 6 new integration tests (`tests/activation.integration.test.ts`) — fresh member PENDING/unactivated, commissions still flow pre-payment, all three gates 403 `MEMBERSHIP_NOT_ACTIVATED`, admin list + activate → gates open without re-login, 409 on double-activation, 403 for non-admins. Suite: 62 API + 83 engine = 145, green.

### Q2 — Sponsor Override Active-gate (§7): does the 10% sponsor share require Active?
**Spec:** flagged ambiguous.
**Built:** `requireActive = true` by default — the sponsor share compresses exactly like the Direct Referral Bonus, and the gate is config-driven (flipping is a data edit).
**Recommendation:** **keep the mirror.** If an inactive sponsor doesn't earn $15 on a referral, they shouldn't earn 10% of trading profit either — consistency is the defensible position, and it's already the default. Confirm with compliance, but no code change is needed.
**Related (the real gap):** who sets `sponsor_id`? Today it's register-time only, if the client passes it. No referral-link UI, no admin override. Referral links (code → sponsorId) are needed before launch; admin override needs the audit table (R27) to exist first.

### Q3 — Settlement period: the 99 vs 90 gap
**Spec:** monthly settlement "assumed"; the investment package locks daily credits until day 99 (90 accrual + 9 settlement).
**Built:** `AVAILABLE_AFTER_DAYS = 99`; after day 99, profit credits monthly at calendar boundaries.
**The question:** is the 9-day gap the intended settlement window, or should credits unlock at day 90?
**Decision (Henry, 2026-09-26):** **the settlement period is 90 days.** After 90 days, the locked accrued interest from the invested capital becomes available for withdrawal from the client wallet. `AVAILABLE_AFTER_DAYS` changed 99 → 90: daily credits (days 1–90) unlock together at day 90; monthly profit credits start the day after. No separate 9-day float — the 90-day accrual period IS the settlement period.

### Q4 — Payment provider: who collects the $50, and who pays out?
**Spec:** TBD. **Built:** registration fee assumed PAID out-of-band; admin deposit endpoint is the interim rail; withdrawals exist (request/approve/reject) but no real payout rail.
**The stakes:** this is the last true business blocker. The engine doesn't care (fee assumed paid) — but the product cannot collect a dollar without it.
**Decision (Henry, 2026-09-26):** **Pay2Crypto** — non-custodial crypto payment gateway (TRC20 USDT). Collection rail only: the client wallet page generates a checkout invoice for the $50 activation fee and for deposits; the confirmation webhook activates the membership or credits the COPINEX wallet. **No payout rail** (non-custodial): withdrawals remain manual USDT transfers by admin, with the on-chain `payoutTxid` recorded on approval.
**Built (2026-09-26):** `payments` table + migration 0005; `POST /api/payments/activate` ($50, one pending at a time, unactivated only) and `POST /api/payments/deposit` (activated only, credits COPINEX on confirmation); `POST /api/webhooks/pay2crypto` (secret-gated, idempotent, ref/amount-verified); client `/wallet` page (balances, deposit/withdraw, payments + ledger activity, 5s poll while a payment is pending). Mock mode when `PAY2CRYPTO_TOKEN` is unset — the full flow is testable before the merchant token exists. Webhook payload shape to be pinned during Pay2Crypto sandbox testing; extraction is deliberately defensive.
**Remaining:** Henry to create the Pay2Crypto account + scoped token (`app.pay2crypto.com`), then set `PAY2CRYPTO_API_URL`/`PAY2CRYPTO_TOKEN`/`PAY2CRYPTO_WEBHOOK_SECRET` and sandbox the live webhook.

---

## 5. THE REAL GAP THE PAMM PIVOT EXPOSED

The §7 trading profit share needs **realized profit per client per period**. With PAMM, that profit lives broker-side. The current admin endpoint is a manual feed. The honest options:

1. **Broker PAMM API/statement integration** (best — automated, but per-broker work: PUPRIME, DERIV, …).
2. **Client self-report + admin review** (fast, fraud-prone — needs the review queue).
3. **Manual admin entry** (current — fine for pilot, dies at scale).

This is the natural Phase 4 work and the single biggest unknown between "the platform pays people" and "the platform is a real business." It also determines whether `LINKED` PAMM connections (reserved status) become meaningful.

---

## 6. REMAINING GAPS, PRIORITIZED

**P0 (go-live blockers):**
1. ~~Q1 Active Member policy~~ — **RESOLVED (2026-09-26):** Active = $50 fee paid; `membership_activated` gate + admin rail shipped, tested, documented above.
2. ~~Q4 Payment provider~~ — **RESOLVED (2026-09-26):** Pay2Crypto crypto rail shipped (invoices, webhook, wallet page, mock mode); live token + sandbox webhook pinning pending Henry's merchant account.
3. Settlement profit feed (PAMM/broker data source for §7).
4. Security: admin 2FA, email verification/password reset, security headers.

**P1:**
5. Admin audit trail (R27) — "who changed the rate and when" must be answerable.
6. Admin dashboard UI (R25).
7. Accrual job batching (A1) — fine for 100 users, dies at 10k.
8. Referral-link UI (sponsor_id).

**P2:**
9. N+1 fixes (A2/A3) · bigint `mode:'string'` · notifications · Redis (wire or drop).

---

## 7. VERDICT

**The compensation product the spec describes is now built and tested.** §2–§12 are implemented engine-first with spec test cases, DB-level integrity, and a CI-gated suite (145 tests, green). Phase 1 security basics (rate limits, JWT fail-fast) and Phase 7 (CI, backups) landed. Score: **~6/10 — "compensation core complete; operations layer missing."**

**What it still is not:** launchable. Two gates stand between here and go-live — the settlement profit feed and the security hardening (2FA/verify/headers). The payment rail (Q4) is built and mock-tested; only the live Pay2Crypto credentials and a sandbox webhook pinning remain. None of the remaining gates require redesign; all of them are completion work on a sound architecture.