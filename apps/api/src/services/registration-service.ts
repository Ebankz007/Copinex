/**
 * Copinex Registration Flow — the §2→§10 compensation pipeline, one transaction.
 *
 * Order of operations (all-or-nothing):
 *   1. Create the member + both wallets.
 *   2. Registration row (fee assumed PAID out-of-band — the payment provider
 *      is an open question; the interim rail is the admin deposit endpoint).
 *   3. §2 fee allocation → fee_allocations row.
 *   4. §10 pool accrual → RANK_BONUS + LEADERSHIP_BONUS balances.
 *   5. §3 direct referral + §4 generation bonuses (compression-aware, §9.2).
 *   6. §8 matrix placement (recursive spillover, least-populated leg).
 *   7. Team volume cache update for every upline member (+$50, leg-attributed).
 *   8. §5 associate rank evaluation for every affected upline member, with the
 *      §10 flag-not-pay rule against the RANK_BONUS pool.
 *
 * Leadership SKUs (§6) are NOT evaluated here — they are non-cash, REVIEW-status
 * rewards handled by the admin/jobs surface (Phase 2, todo #11).
 *
 * Documented assumptions (flagged in the audit):
 *   - Team volume = sum of registration fees in the member's downline, $50 per
 *     registration, attributed to the direct leg that leads to the new member.
 *   - Unallocated direct/generation shares (no qualified upline within the
 *     compression window) stay in the community pool — tracked via the
 *     fee_allocations row; no separate balance ledger exists for them.
 *   - A FLAGGED rank milestone still advances highest_associate_rank: the
 *     qualification stands, the payment is deferred to admin review.
 */
import { eq, sql } from 'drizzle-orm';
import {
  COMPRESSION_STOP_AT_GEN,
  REGISTRATION_FEE_CENTS,
  allocateRegistrationFee,
  computeDirectReferralPayout,
  computeGenerationPayouts,
  placeInMatrix,
  type DirectReferralPayout,
  type FeeAllocation,
  type GenerationPayout,
  type MatrixLeg,
  type RankMilestone,
  type UplineMember,
} from '@copinex/engine';
import * as schema from '@copinex/database';
import { db, type Tx } from '../db/drizzle.js';
import { HttpError } from '../lib/http-error.js';
import { creditWallet, ensureWallets } from './wallets.js';
import { loadSponsorChain } from './upline.js';
import { evaluateAndPayAssociateRanks } from './ranks-service.js';

/** Guard: matrix spillover recursion cannot exceed this depth. */
const MAX_MATRIX_DEPTH = 50;

/** Bonus ledger type per generation tier (§4). */
const GENERATION_BONUS_TYPE = {
  2: 'GENERATION_BONUS_GEN2',
  3: 'GENERATION_BONUS_GEN3',
  4: 'GENERATION_BONUS_GEN4',
  5: 'GENERATION_BONUS_GEN5',
  6: 'GENERATION_BONUS_GEN6',
} as const;

export interface RegistrationResult {
  user: typeof schema.users.$inferSelect;
  registration: typeof schema.registrations.$inferSelect;
  allocation: FeeAllocation;
  directBonus: DirectReferralPayout;
  generationBonuses: GenerationPayout[];
  placementParentId: string | null;
  spilledOver: boolean;
  rankMilestones: RankMilestone[];
}

export async function registerMember(input: {
  email: string;
  passwordHash: string;
  fullName?: string | null;
  sponsorId?: string | null;
}): Promise<RegistrationResult> {
  return db.transaction(async (tx) => {
    const email = input.email.toLowerCase();

    const existing = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    if (existing.length > 0) throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists');

    const sponsorId = input.sponsorId ?? null;
    if (sponsorId) {
      const sponsor = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.id, sponsorId))
        .limit(1);
      if (sponsor.length === 0) throw new HttpError(400, 'INVALID_SPONSOR', 'Sponsor does not exist');
    }

    // Insert without a placement parent — the matrix decision is made below.
    const [user] = await tx
      .insert(schema.users)
      .values({
        email,
        passwordHash: input.passwordHash,
        fullName: input.fullName ?? null,
        sponsorId,
        placementParentId: null,
      })
      .returning();
    if (!user) throw new HttpError(500, 'INTERNAL_ERROR', 'Failed to create user');

    await ensureWallets(tx, user.id);
    const at = new Date();

    // ── 2. Registration ────────────────────────────────────────────────
    // Active Member policy (2026-09-26): the $50 activation fee is collected
    // separately — registration is PENDING until paid. The member earns
    // commissions immediately (the company carries the float), but monetary
    // activities (withdraw / invest / PAMM) are gated on activation.
    const [registration] = await tx
      .insert(schema.registrations)
      .values({ userId: user.id, feeCents: REGISTRATION_FEE_CENTS, status: 'PENDING' })
      .returning();
    if (!registration) throw new HttpError(500, 'INTERNAL_ERROR', 'Failed to create registration');

    // ── 3. §2 fee allocation ───────────────────────────────────────────
    const allocation = allocateRegistrationFee(REGISTRATION_FEE_CENTS);
    await tx.insert(schema.feeAllocations).values({
      registrationId: registration.id,
      companyReserveCents: allocation.companyReserveCents,
      directReferralPoolCents: allocation.directReferralPoolCents,
      generationPoolCents: allocation.generationPoolCents,
      rankPoolContributionCents: allocation.rankPoolContributionCents,
      leadershipPoolContributionCents: allocation.leadershipPoolContributionCents,
      createdAt: at,
    });

    // ── 4. §10 pool accrual ────────────────────────────────────────────
    await accruePool(tx, 'RANK_BONUS', allocation.rankPoolContributionCents, at);
    await accruePool(tx, 'LEADERSHIP_BONUS', allocation.leadershipPoolContributionCents, at);

    // ── 5. §3 direct + §4 generation bonuses ───────────────────────────
    const chain = await loadSponsorChain(tx, user.id, COMPRESSION_STOP_AT_GEN);
    const directBonus = computeDirectReferralPayout(chain);
    if (directBonus.recipientId) {
      await creditWallet(
        tx,
        directBonus.recipientId,
        'COPINEX',
        directBonus.amountCents,
        'DIRECT_REFERRAL_BONUS',
        'registration',
        registration.id,
        at,
      );
      await tx.insert(schema.bonusPayouts).values({
        recipientId: directBonus.recipientId,
        type: 'DIRECT_REFERRAL_BONUS',
        amountCents: directBonus.amountCents,
        sourceRegistrationId: registration.id,
        generation: null,
        compressed: directBonus.compressed,
        status: 'PAID',
        createdAt: at,
      });
    }

    const generationBonuses = computeGenerationPayouts(chain);
    for (const g of generationBonuses) {
      if (!g.recipientId) continue; // unallocated share stays in the community pool
      const type = GENERATION_BONUS_TYPE[g.generation as 2 | 3 | 4 | 5 | 6];
      await creditWallet(tx, g.recipientId, 'COPINEX', g.amountCents, type, 'registration', registration.id, at);
      await tx.insert(schema.bonusPayouts).values({
        recipientId: g.recipientId,
        type,
        amountCents: g.amountCents,
        sourceRegistrationId: registration.id,
        generation: g.generation,
        compressed: g.compressed,
        status: 'PAID',
        createdAt: at,
      });
    }

    // ── 6. §8 matrix placement ─────────────────────────────────────────
    let placementParentId: string | null = null;
    let spilledOver = false;
    if (sponsorId) {
      const placement = await resolveMatrixPlacement(tx, sponsorId, 0);
      placementParentId = placement.placementParentId;
      spilledOver = placement.spilledOver;
    }
    await tx
      .update(schema.users)
      .set({ placementParentId, updatedAt: at })
      .where(eq(schema.users.id, user.id));

    // ── 7+8. Team volume + §5 associate ranks for the upline ────────────
    const rankMilestones: RankMilestone[] = [];
    for (let i = 0; i < chain.length; i++) {
      const member = chain[i]!;
      // The leg through which the new member hangs under this upline member:
      // level 1 → the new member themselves; level N → the level-(N-1) member.
      const legId = i === 0 ? user.id : chain[i - 1]!.userId;
      await updateTeamVolumeForMember(tx, member, legId, at);
      const milestones = await evaluateAndPayAssociateRanks(tx, member.userId, at);
      rankMilestones.push(...milestones);
    }

    return {
      user,
      registration,
      allocation,
      directBonus,
      generationBonuses,
      placementParentId,
      spilledOver,
      rankMilestones,
    };
  });
}

// ── Matrix placement (§8) ─────────────────────────────────────────────────

/** Direct children of `parentId` with their subtree sizes (JS DFS on the flat CTE). */
async function loadMatrixLegs(tx: Tx, parentId: string): Promise<MatrixLeg[]> {
  const result = await tx.execute<{ id: string; parent_id: string | null }>(sql`
    WITH RECURSIVE tree AS (
      SELECT id, placement_parent_id FROM users WHERE placement_parent_id = ${parentId}
      UNION ALL
      SELECT u.id, u.placement_parent_id FROM users u JOIN tree t ON u.placement_parent_id = t.id
    )
    SELECT t.id, t.placement_parent_id AS parent_id
    FROM tree t
    JOIN users u ON u.id = t.id
    ORDER BY u.created_at, u.id
  `);

  const children = new Map<string, string[]>();
  const direct: string[] = [];
  for (const row of result.rows) {
    if (row.parent_id === null) continue; // defensive: never expected in this CTE
    if (row.parent_id === parentId) direct.push(row.id);
    const list = children.get(row.parent_id);
    if (list) list.push(row.id);
    else children.set(row.parent_id, [row.id]);
  }

  const sizeCache = new Map<string, number>();
  const subtreeSize = (id: string): number => {
    const cached = sizeCache.get(id);
    if (cached !== undefined) return cached;
    const kids = children.get(id) ?? [];
    const size = 1 + kids.reduce((sum, k) => sum + subtreeSize(k), 0);
    sizeCache.set(id, size);
    return size;
  };

  return direct.map((childId) => ({ childId, subtreeSize: subtreeSize(childId) }));
}

/**
 * Resolve the matrix placement parent for a new member under `sponsorId`.
 * Recurses down the spillover chain until a row with a free slot is found.
 */
async function resolveMatrixPlacement(tx: Tx, sponsorId: string, depth: number): Promise<{ placementParentId: string; spilledOver: boolean }> {
  if (depth > MAX_MATRIX_DEPTH) {
    throw new HttpError(500, 'MATRIX_TOO_DEEP', 'Matrix spillover exceeded maximum depth');
  }
  const legs = await loadMatrixLegs(tx, sponsorId);
  const decision = placeInMatrix(sponsorId, legs);
  if (!decision.spilledOver) return decision;
  return resolveMatrixPlacement(tx, decision.placementParentId, depth + 1);
}

// ── Pools (§10) ───────────────────────────────────────────────────────────

/** Add `amountCents` to a named pool, creating the row on first accrual. */
async function accruePool(tx: Tx, name: string, amountCents: number, at: Date): Promise<void> {
  const [pool] = await tx
    .select()
    .from(schema.pools)
    .where(eq(schema.pools.name, name))
    .for('update')
    .limit(1);
  if (!pool) {
    await tx.insert(schema.pools).values({ name, balanceCents: amountCents, updatedAt: at });
    return;
  }
  await tx
    .update(schema.pools)
    .set({ balanceCents: pool.balanceCents + amountCents, version: pool.version + 1, updatedAt: at })
    .where(eq(schema.pools.id, pool.id));
}

// ── Team volume (§5 cache) ────────────────────────────────────────────────

/**
 * Add one registration fee to an upline member's team volume, attributed to
 * the direct leg that leads to the new member (`legId`, resolved by the caller
 * from the sponsor chain).
 */
async function updateTeamVolumeForMember(tx: Tx, member: UplineMember, legId: string, at: Date): Promise<void> {
  const [tv] = await tx
    .select()
    .from(schema.teamVolume)
    .where(eq(schema.teamVolume.userId, member.userId))
    .for('update')
    .limit(1);

  if (!tv) {
    await tx.insert(schema.teamVolume).values({
      userId: member.userId,
      totalVolumeCents: REGISTRATION_FEE_CENTS,
      legVolumes: { [legId]: REGISTRATION_FEE_CENTS },
      updatedAt: at,
    });
    return;
  }

  const legVolumes = { ...(tv.legVolumes as Record<string, number>) };
  legVolumes[legId] = (legVolumes[legId] ?? 0) + REGISTRATION_FEE_CENTS;
  await tx
    .update(schema.teamVolume)
    .set({ totalVolumeCents: tv.totalVolumeCents + REGISTRATION_FEE_CENTS, legVolumes, updatedAt: at })
    .where(eq(schema.teamVolume.id, tv.id));
}