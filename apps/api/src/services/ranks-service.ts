/**
 * Copinex Ranks Service — §5 associate / §6 leadership evaluation + admin.
 *
 * Associate ranks are evaluated inline in the registration flow AND by the
 * catch-up job (evaluateAllRanks). Both paths share evaluateAndPayAssociateRanks
 * so the pool/flag/ledger logic can never diverge.
 *
 * §10 flag-not-pay: a FLAGGED milestone still advances highest_associate_rank —
 * the qualification stands, the payment is deferred to admin review
 * (payFlaggedMilestone).
 *
 * Leadership rewards are non-cash SKUs, created REVIEW and fulfilled by admin.
 */
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import {
  evaluateAssociateRanks,
  evaluateLeadershipRanks,
  resolvePoolPayout,
  type LeadershipReward,
  type RankMilestone,
} from '@copinex/engine';
import * as schema from '@copinex/database';
import { db, type DbOrTx, type Tx } from '../db/drizzle.js';
import { HttpError } from '../lib/http-error.js';
import { creditWallet } from './wallets.js';

// ── Shared associate evaluation ────────────────────────────────────────────

/**
 * Evaluate NEW associate ranks for a member against the RANK_BONUS pool.
 * Underfunded rewards are recorded FLAGGED (never paid beyond the balance).
 * The ledger credit references the milestone row itself (sourceType
 * 'rank_milestone') so every payout is traceable to its claim.
 */
export async function evaluateAndPayAssociateRanks(
  tx: Tx,
  memberId: string,
  at: Date,
): Promise<RankMilestone[]> {
  const [member] = await tx.select().from(schema.users).where(eq(schema.users.id, memberId)).limit(1);
  if (!member) return [];

  const refCount = await tx.execute<{ count: string }>(
    sql`SELECT COUNT(*)::text AS count FROM users WHERE sponsor_id = ${memberId}`,
  );
  const personalReferrals = Number(refCount.rows[0]?.count ?? 0);

  const [tv] = await tx.select().from(schema.teamVolume).where(eq(schema.teamVolume.userId, memberId)).limit(1);
  const legVolumesCents = tv ? Object.values(tv.legVolumes as Record<string, number>) : [];

  const milestones = evaluateAssociateRanks({
    personalReferrals,
    legVolumesCents,
    highestEarnedRank: member.highestAssociateRank,
  });
  if (milestones.length === 0) return [];

  const [pool] = await tx
    .select()
    .from(schema.pools)
    .where(eq(schema.pools.name, 'RANK_BONUS'))
    .for('update')
    .limit(1);
  if (!pool) throw new HttpError(500, 'INTERNAL_ERROR', 'RANK_BONUS pool missing');

  let poolBalance = pool.balanceCents;
  const results: RankMilestone[] = [];
  for (const m of milestones) {
    const decision = resolvePoolPayout(poolBalance, m.rewardCents);
    const [milestone] = await tx
      .insert(schema.rankMilestones)
      .values({
        userId: memberId,
        rankId: m.rankId,
        rewardCents: m.rewardCents,
        status: decision.payable ? 'PAID' : 'FLAGGED',
        createdAt: at,
      })
      .returning();
    if (decision.payable && milestone) {
      await creditWallet(
        tx,
        memberId,
        'COPINEX',
        m.rewardCents,
        'RANK_MILESTONE',
        'rank_milestone',
        milestone.id,
        at,
      );
    }
    poolBalance = decision.remainingBalanceCents;
    results.push({ ...m, flagged: !decision.payable });
  }

  if (poolBalance !== pool.balanceCents) {
    await tx
      .update(schema.pools)
      .set({ balanceCents: poolBalance, version: pool.version + 1, updatedAt: at })
      .where(eq(schema.pools.id, pool.id));
  }

  const newHighest = Math.max(member.highestAssociateRank, ...milestones.map((m) => m.rankId));
  if (newHighest > member.highestAssociateRank) {
    await tx
      .update(schema.users)
      .set({ highestAssociateRank: newHighest, updatedAt: at })
      .where(eq(schema.users.id, memberId));
  }

  return results;
}

// ── Leadership evaluation (§6) ─────────────────────────────────────────────

/**
 * Evaluate NEW leadership ranks for a member. Each direct leg contributes the
 * associate ranks of every member in that leg's subtree (the leg head included).
 * Rewards are non-cash SKUs recorded REVIEW for admin fulfillment.
 */
export async function evaluateLeadershipRanksForMember(
  tx: Tx,
  memberId: string,
  at: Date,
): Promise<LeadershipReward[]> {
  const [member] = await tx.select().from(schema.users).where(eq(schema.users.id, memberId)).limit(1);
  if (!member) return [];

  const legsMemberRanks = await loadLegsMemberRanks(tx, memberId);
  const rewards = evaluateLeadershipRanks({
    highestAssociateRank: member.highestAssociateRank,
    highestLeadershipRank: member.highestLeadershipRank,
    legsMemberRanks,
  });
  if (rewards.length === 0) return [];

  for (const r of rewards) {
    await tx.insert(schema.leadershipRewards).values({
      userId: memberId,
      rankId: r.rankId,
      rewardSku: r.rewardSku,
      status: 'REVIEW',
      createdAt: at,
    });
  }

  const newHighest = Math.max(member.highestLeadershipRank, ...rewards.map((r) => r.rankId));
  if (newHighest > member.highestLeadershipRank) {
    await tx
      .update(schema.users)
      .set({ highestLeadershipRank: newHighest, updatedAt: at })
      .where(eq(schema.users.id, memberId));
  }

  return rewards;
}

/** Per direct leg: the associate ranks of every member in that leg's subtree. */
async function loadLegsMemberRanks(tx: DbOrTx, memberId: string): Promise<number[][]> {
  const result = await tx.execute<{ leg_id: string; rank: number }>(sql`
    WITH RECURSIVE tree AS (
      SELECT id, placement_parent_id, id AS leg_id FROM users WHERE placement_parent_id = ${memberId}
      UNION ALL
      SELECT u.id, u.placement_parent_id, t.leg_id FROM users u JOIN tree t ON u.placement_parent_id = t.id
    )
    SELECT t.leg_id, u.highest_associate_rank AS rank
    FROM tree t
    JOIN users u ON u.id = t.id
    ORDER BY t.leg_id
  `);

  const legs = new Map<string, number[]>();
  for (const row of result.rows) {
    const list = legs.get(row.leg_id);
    if (list) list.push(row.rank);
    else legs.set(row.leg_id, [row.rank]);
  }
  return [...legs.values()];
}

// ── Catch-up job ───────────────────────────────────────────────────────────

/**
 * Re-evaluate associate + leadership ranks for EVERY member. A safety net for
 * qualifications that were missed (e.g. team volume changed outside the
 * registration flow). One transaction per member.
 */
export async function evaluateAllRanks(): Promise<{
  membersEvaluated: number;
  associateMilestones: number;
  associateFlagged: number;
  leadershipRewards: number;
}> {
  const users = await db.select().from(schema.users);
  let membersEvaluated = 0;
  let associateMilestones = 0;
  let associateFlagged = 0;
  let leadershipRewards = 0;

  for (const user of users) {
    await db.transaction(async (tx) => {
      const at = new Date();
      const assoc = await evaluateAndPayAssociateRanks(tx, user.id, at);
      const lead = await evaluateLeadershipRanksForMember(tx, user.id, at);
      membersEvaluated += 1;
      associateMilestones += assoc.length;
      associateFlagged += assoc.filter((m) => m.flagged).length;
      leadershipRewards += lead.length;
    });
  }

  return { membersEvaluated, associateMilestones, associateFlagged, leadershipRewards };
}

// ── Admin: FLAGGED milestone resolution (§10) ──────────────────────────────

export async function listFlaggedMilestones() {
  return db
    .select({
      id: schema.rankMilestones.id,
      userId: schema.rankMilestones.userId,
      email: schema.users.email,
      rankId: schema.rankMilestones.rankId,
      rewardCents: schema.rankMilestones.rewardCents,
      status: schema.rankMilestones.status,
      createdAt: schema.rankMilestones.createdAt,
    })
    .from(schema.rankMilestones)
    .innerJoin(schema.users, eq(schema.rankMilestones.userId, schema.users.id))
    .where(eq(schema.rankMilestones.status, 'FLAGGED'))
    .orderBy(asc(schema.rankMilestones.createdAt));
}

/**
 * Pay a FLAGGED milestone once the pool can cover it. Re-checks solvency under
 * lock — never pays beyond the balance, never double-pays.
 */
export async function payFlaggedMilestone(milestoneId: string) {
  return db.transaction(async (tx) => {
    const [milestone] = await tx
      .select()
      .from(schema.rankMilestones)
      .where(eq(schema.rankMilestones.id, milestoneId))
      .for('update')
      .limit(1);
    if (!milestone) throw new HttpError(404, 'NOT_FOUND', 'Milestone not found');
    if (milestone.status !== 'FLAGGED') {
      throw new HttpError(409, 'NOT_FLAGGED', 'Milestone is not FLAGGED');
    }

    const [pool] = await tx
      .select()
      .from(schema.pools)
      .where(eq(schema.pools.name, 'RANK_BONUS'))
      .for('update')
      .limit(1);
    if (!pool) throw new HttpError(500, 'INTERNAL_ERROR', 'RANK_BONUS pool missing');

    const decision = resolvePoolPayout(pool.balanceCents, milestone.rewardCents);
    if (!decision.payable) {
      throw new HttpError(409, 'POOL_INSUFFICIENT', 'Rank pool cannot cover this reward');
    }

    const at = new Date();
    await tx
      .update(schema.pools)
      .set({ balanceCents: decision.remainingBalanceCents, version: pool.version + 1, updatedAt: at })
      .where(eq(schema.pools.id, pool.id));
    await creditWallet(
      tx,
      milestone.userId,
      'COPINEX',
      milestone.rewardCents,
      'RANK_MILESTONE',
      'rank_milestone',
      milestone.id,
      at,
    );

    const [updated] = await tx
      .update(schema.rankMilestones)
      .set({ status: 'PAID' })
      .where(eq(schema.rankMilestones.id, milestone.id))
      .returning();
    return updated;
  });
}

// ── Admin: leadership fulfillment (§6) ─────────────────────────────────────

export async function listLeadershipRewards(status?: 'REVIEW' | 'PAID') {
  const where = status ? eq(schema.leadershipRewards.status, status) : undefined;
  return db
    .select({
      id: schema.leadershipRewards.id,
      userId: schema.leadershipRewards.userId,
      email: schema.users.email,
      rankId: schema.leadershipRewards.rankId,
      rewardSku: schema.leadershipRewards.rewardSku,
      status: schema.leadershipRewards.status,
      createdAt: schema.leadershipRewards.createdAt,
    })
    .from(schema.leadershipRewards)
    .innerJoin(schema.users, eq(schema.leadershipRewards.userId, schema.users.id))
    .where(where)
    .orderBy(desc(schema.leadershipRewards.createdAt));
}

/** Mark a REVIEW leadership reward as fulfilled (PAID). */
export async function fulfillLeadershipReward(rewardId: string) {
  const [row] = await db
    .update(schema.leadershipRewards)
    .set({ status: 'PAID' })
    .where(and(eq(schema.leadershipRewards.id, rewardId), eq(schema.leadershipRewards.status, 'REVIEW')))
    .returning();
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'REVIEW leadership reward not found');
  return row;
}