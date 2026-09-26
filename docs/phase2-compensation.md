# Phase 2 — Compensation Engine + API Wiring

Implemented 2026-09-26 per the spec analysis (`docs/project-analysis.md`, §2–§10). Engine-first: every money rule is a pure, integer-arithmetic engine function with spec test cases; the API is a thin transactional shell over it. Full suite green.

## What shipped

### 1. Engine — compensation core (`packages/engine/src`)

All money math is integer cents; all rates are basis points derived once from the spec floats (`constants.ts` is the single source of truth — spec mirror and integer arithmetic can never drift). `splitByBps` uses largest-remainder so buckets always reconcile to the cent.

| Module | Spec | Responsibility |
|---|---|---|
| `allocation.ts` | §2 | Five-bucket fee split: company 45% / community 55% (direct 30, gen 10, rank 8, leadership 7) |
| `compression.ts` | §9.2 | Qualified-upline resolution (1st/Nth Active member), bounded `COMPRESSION_STOP_AT_GEN = 6` |
| `bonuses.ts` | §3/§4 | Direct referral $15 + generation bonuses $2/$1/$0.75/$0.75/$0.50, compression-aware |
| `matrix.ts` | §8 | Placement: sponsor row left-to-right, spillover to least-populated leg, depth-guarded |
| `ranks.ts` | §5/§6 | Associate ranks 1–8 (referrals + capped team volume, bottom-up, paid once) + leadership ranks 1–6 (self-gate + 2 legs × 3 members, non-cash SKUs) |
| `pools.ts` | §10 | Pool payout decisions — flag-not-pay when the balance can't cover a reward |
| `settlements.ts` | §7 | Trading profit 60/10/30 split, sponsor share Active-gated + compressing |

### 2. Registration flow (`apps/api/src/services/registration-service.ts`)

One transaction, all-or-nothing: member + wallets → registration (PAID) → §2 allocation row → §10 pool accrual → §3/§4 bonuses (compression-aware) → §8 matrix placement → team-volume cache (+$50 per upline, leg-attributed) → §5 associate ranks for every upline member. `/api/auth/register` now runs the full pipeline.

### 3. Shared services

- `services/upline.ts` — recursive-CTE sponsor chain (level 0 = self), shared by registration, settlements, and the ranks job.
- `services/ranks-service.ts` — associate evaluation (registration + job share one implementation), leadership evaluation, catch-up job, admin resolution (flag payment, fulfillment).
- `services/settlement-service.ts` — record + process one client-period settlement, idempotent per `(period, client_id)`.

### 4. API surface (all admin-gated except auth)

| Endpoint | Behavior |
|---|---|
| `POST /api/admin/settlements` | Record + process a §7 settlement; 409 on duplicate (client, period); 400 on malformed period / non-positive profit |
| `GET /api/admin/settlements` | All settlements, newest-first |
| `GET /api/admin/pools` | RANK_BONUS + LEADERSHIP_BONUS balances |
| `GET /api/admin/ranks/milestones` | FLAGGED milestones awaiting pool-funded payment |
| `POST /api/admin/ranks/milestones/:id/pay` | Pay a FLAGGED milestone (409 POOL_INSUFFICIENT / NOT_FLAGGED, 404 unknown) |
| `GET /api/admin/ranks/leadership?status=` | Leadership rewards, optional status filter |
| `POST /api/admin/ranks/leadership/:id/fulfill` | REVIEW → PAID (fulfillment record) |
| `POST /api/jobs/evaluate-ranks` | Catch-up §5/§6 evaluation for every member; idempotent, one tx per member |

## Design decisions (flagged for the audit)

- **Fee collected on activation, not at registration (Active Member policy, 2026-09-26).** The registration row records `PENDING`; the $50 activation fee is collected out-of-band (admin interim rail today, payment-provider webhook later) and flips the row to `PAID` plus `users.membership_activated`. Members earn commissions before paying — the company carries the float — but withdraw/invest/PAMM are gated on activation (`requireActivated` middleware).
- **Team volume = Σ downline registration fees** ($50 per registration), attributed to the direct leg that leads to the new member. Leg volumes drive the §5 40% cap.
- **Unallocated shares stay in the community pool.** When no qualified upline exists within the compression window, the direct/generation share is not paid and is tracked via the `fee_allocations` row (no separate balance ledger).
- **FLAGGED milestones still advance `highest_associate_rank`.** Qualification stands; payment is deferred to admin review (§10 flag-not-pay). The ledger credit references the milestone row (`sourceType 'rank_milestone'`, `sourceId = milestone.id`).
- **Leadership rewards are non-cash SKUs**, created `REVIEW` and fulfilled by admin — no money moves.
- **Settlements: the client's 60% stays on their own funded account** — recorded for accounting, never credited to a platform wallet. The sponsor's 10% is Active-gated and compresses like the Direct Referral Bonus; when unallocated it reverts to the company bucket (row keeps the nominal sponsor share, `company_share_cents` absorbs the reversion — the row always reconciles to 100% of profit). Interim data source is the admin endpoint until the broker/trading-data integration lands.

## Verification

- Engine: **83/83** (compression duplicate-level validation moved to a full-chain pre-pass; allocation strict-ts fix) · build clean
- API: **62/62** — 18 investments + 10 compensation-admin + 9 registration + 8 wallets + 6 activation + 11 PAMM · build clean
- Registration tests pin the money math to the cent: allocation 2250/1500/500/400/350, direct 1500, gen 200/100/75/75/50, rank-1 3500, rank-2 8000, pool accrual 400/350 per reg, +5000 team volume per leg.

## Notes

- The migration `0002` CHECK constraints + fee-split trigger live in SQL only (not `schema.ts`) — drizzle-kit won't touch them; keep them there.
- pg `bigint` returns strings — wrap in `Number()`. API JSON is camelCase (drizzle), DB is snake_case.
- Engine is consumed via `dist/` — rebuild the engine before API tests pick up changes.
- Web/API prod processes are `next start` / `node dist` — kill + restart after rebuilds.
- e2e test users (`e2e@test.dev`, `flow*@test.dev`) remain in the dev DB — cleanup before any real pilot.

## Next

- Phase 7: CI (GitHub Actions lint → test → build) + automated backups.
- Re-audit after Phase 2 (spec compliance walkthrough).
- Live E2E of compensation flows on the dev DB (register → settle → flag → pay).