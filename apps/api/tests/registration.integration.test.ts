/**
 * Registration flow integration tests — the full §2→§10 compensation pipeline.
 *
 * Money math (per $50 registration, integer cents):
 *   allocation: company 2250 / direct 1500 / generation 500 / rank 400 / leadership 350
 *   direct bonus: 1500 · generation: gen2 200, gen3 100, gen4 75, gen5 75, gen6 50
 *   rank 1 reward: 3500 · rank 2 reward: 8000
 *   team volume: +5000 per registration, attributed to the sponsor-chain leg
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createApp } from '../src/app.js';

const app = createApp();
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

// ── Helpers ────────────────────────────────────────────

async function resetDb() {
  await pool.query(`
    TRUNCATE TABLE investment_commissions, investment_earnings, investments,
    investment_packages, ledger_entries, wallets, users, registrations, fee_allocations,
    bonus_payouts, rank_milestones, leadership_rewards, team_volume, trading_settlements,
    withdrawal_requests, pools, config CASCADE
  `);
}

async function register(
  email: string,
  sponsorId?: string,
): Promise<{ token: string; user: { id: string } }> {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'password123', sponsorId });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

/** Mark a member inactive (triggers §9.2 compression on the next registration). */
async function setInactive(userId: string) {
  await pool.query(`UPDATE users SET is_active = false, status = 'INACTIVE' WHERE id = $1`, [userId]);
}

async function walletBalance(userId: string, walletType = 'COPINEX'): Promise<number> {
  const res = await pool.query(
    'SELECT balance_cents FROM wallets WHERE user_id = $1 AND wallet_type = $2',
    [userId, walletType],
  );
  return Number(res.rows[0]?.balance_cents ?? 0);
}

async function poolBalance(name: string): Promise<number> {
  const res = await pool.query('SELECT balance_cents FROM pools WHERE name = $1', [name]);
  return Number(res.rows[0]?.balance_cents ?? 0);
}

async function bonusRows(registrationUserId: string): Promise<Record<string, unknown>[]> {
  const res = await pool.query(
    `SELECT bp.type, bp.amount_cents, bp.compressed, bp.generation, bp.recipient_id, u.email AS recipient_email
     FROM bonus_payouts bp
     JOIN registrations r ON r.id = bp.source_registration_id
     JOIN users u ON u.id = bp.recipient_id
     WHERE r.user_id = $1
     ORDER BY bp.created_at`,
    [registrationUserId],
  );
  return res.rows;
}

// ── Tests ──────────────────────────────────────────────

beforeAll(async () => {
  await resetDb();
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await pool.end();
});

describe('§2 fee allocation + §10 pool accrual', () => {
  it('splits the $50 fee into the five buckets and accrues both pools', async () => {
    const alice = await register('alice@test.dev');

    const alloc = await pool.query(
      `SELECT company_reserve_cents, direct_referral_pool_cents, generation_pool_cents,
              rank_pool_contribution_cents, leadership_pool_contribution_cents
       FROM fee_allocations fa JOIN registrations r ON r.id = fa.registration_id
       WHERE r.user_id = $1`,
      [alice.user.id],
    );
    const a = alloc.rows[0];
    expect(a).toMatchObject({
      company_reserve_cents: 2250,
      direct_referral_pool_cents: 1500,
      generation_pool_cents: 500,
      rank_pool_contribution_cents: 400,
      leadership_pool_contribution_cents: 350,
    });
    // §12: the five buckets reconcile to the full fee, to the cent.
    expect(
      a.company_reserve_cents + a.direct_referral_pool_cents + a.generation_pool_cents +
      a.rank_pool_contribution_cents + a.leadership_pool_contribution_cents,
    ).toBe(5000);

    expect(await poolBalance('RANK_BONUS')).toBe(400);
    expect(await poolBalance('LEADERSHIP_BONUS')).toBe(350);

    // Root member: no upline → no bonuses, no matrix parent.
    expect(await bonusRows(alice.user.id)).toHaveLength(0);
    const placement = await pool.query('SELECT placement_parent_id FROM users WHERE id = $1', [alice.user.id]);
    expect(placement.rows[0].placement_parent_id).toBeNull();
  });
});

describe('§3 direct referral bonus', () => {
  it('pays the active sponsor $15 on the first referral', async () => {
    const alice = await register('alice@test.dev');
    const bob = await register('bob@test.dev', alice.user.id);

    expect(await walletBalance(alice.user.id)).toBe(1500);

    const rows = await bonusRows(bob.user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'DIRECT_REFERRAL_BONUS',
      amount_cents: 1500,
      compressed: false,
      generation: null,
      recipient_email: 'alice@test.dev',
    });
  });
});

describe('§4 generation bonuses', () => {
  it('pays gen 2 ($2) to the sponsor of the sponsor', async () => {
    const alice = await register('alice@test.dev');
    const bob = await register('bob@test.dev', alice.user.id);
    const carol = await register('carol@test.dev', bob.user.id);

    // carol's registration: bob +$15 direct, alice +$2 gen2.
    const rows = await bonusRows(carol.user.id);
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'DIRECT_REFERRAL_BONUS', amount_cents: 1500, recipient_email: 'bob@test.dev' }),
        expect.objectContaining({ type: 'GENERATION_BONUS_GEN2', amount_cents: 200, generation: 2, recipient_email: 'alice@test.dev' }),
      ]),
    );

    // alice: $15 (bob's reg) + $2 (carol's reg).
    expect(await walletBalance(alice.user.id)).toBe(1700);
  });
});

describe('§9.2 compression', () => {
  it('compresses the direct bonus to the next active upline when the sponsor is inactive', async () => {
    const alice = await register('alice@test.dev');
    const bob = await register('bob@test.dev', alice.user.id);
    await setInactive(bob.user.id);
    const carol = await register('carol@test.dev', bob.user.id);

    // bob is inactive → the $15 goes to alice, marked compressed. Gen 2 has no
    // second qualified member in the window → unallocated (no row).
    const rows = await bonusRows(carol.user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'DIRECT_REFERRAL_BONUS',
      amount_cents: 1500,
      compressed: true,
      recipient_email: 'alice@test.dev',
    });
    expect(await walletBalance(alice.user.id)).toBe(3000); // $15 bob + $15 carol
    expect(await walletBalance(bob.user.id)).toBe(0);
  });
});

describe('§8 matrix placement', () => {
  it('fills the sponsor row left-to-right, then spills to the least-populated leg', async () => {
    const alice = await register('alice@test.dev');
    const bob = await register('bob@test.dev', alice.user.id);
    const carol = await register('carol@test.dev', alice.user.id);
    const dave = await register('dave@test.dev', alice.user.id);

    // First three land directly under alice.
    for (const child of [bob, carol, dave]) {
      const res = await pool.query('SELECT placement_parent_id FROM users WHERE id = $1', [child.user.id]);
      expect(res.rows[0].placement_parent_id).toBe(alice.user.id);
    }

    // 4th referral: alice's row is full → spill to the leftmost least-populated
    // leg (bob — all three legs have subtree size 1, leftmost wins).
    const eve = await register('eve@test.dev', alice.user.id);
    const res = await pool.query('SELECT placement_parent_id FROM users WHERE id = $1', [eve.user.id]);
    expect(res.rows[0].placement_parent_id).toBe(bob.user.id);
  });
});

describe('team volume cache', () => {
  it('attributes $50 per registration to the correct sponsor-chain leg', async () => {
    const alice = await register('alice@test.dev');
    const bob = await register('bob@test.dev', alice.user.id);
    const carol = await register('carol@test.dev', bob.user.id);

    // alice: bob's $50 (leg = bob) + carol's $50 (leg = bob, via the chain).
    const aliceTv = await pool.query('SELECT total_volume_cents, leg_volumes FROM team_volume WHERE user_id = $1', [
      alice.user.id,
    ]);
    expect(Number(aliceTv.rows[0].total_volume_cents)).toBe(10000);
    expect(aliceTv.rows[0].leg_volumes).toEqual({ [bob.user.id]: 10000 });

    // bob: carol's $50 (leg = carol).
    const bobTv = await pool.query('SELECT total_volume_cents, leg_volumes FROM team_volume WHERE user_id = $1', [
      bob.user.id,
    ]);
    expect(Number(bobTv.rows[0].total_volume_cents)).toBe(5000);
    expect(bobTv.rows[0].leg_volumes).toEqual({ [carol.user.id]: 5000 });
  });
});

describe('§5 associate ranks + §10 flag-not-pay', () => {
  it('flags rank 1 when the pool is underfunded, and still advances the rank', async () => {
    const alice = await register('alice@test.dev');
    await register('bob@test.dev', alice.user.id);
    await register('carol@test.dev', alice.user.id);
    await register('dave@test.dev', alice.user.id);

    // 4 registrations → pool 1600 < rank-1 reward 3500 → FLAGGED, not paid.
    const milestone = await pool.query('SELECT rank_id, reward_cents, status FROM rank_milestones WHERE user_id = $1', [
      alice.user.id,
    ]);
    expect(milestone.rows).toHaveLength(1);
    expect(milestone.rows[0]).toMatchObject({ rank_id: 1, reward_cents: 3500, status: 'FLAGGED' });

    expect(await poolBalance('RANK_BONUS')).toBe(1600);
    expect(await walletBalance(alice.user.id)).toBe(4500); // 3 × $15 direct, no rank payout

    const user = await pool.query('SELECT highest_associate_rank FROM users WHERE id = $1', [alice.user.id]);
    expect(Number(user.rows[0].highest_associate_rank)).toBe(1);
  });

  it('pays rank 1 from the pool once it is funded', async () => {
    // 9 registrations fund the pool to 3600; alice qualifies at her 3rd direct
    // referral (dave) when the pool can cover the $35 reward.
    const alice = await register('alice@test.dev');
    const bob = await register('bob@test.dev', alice.user.id);
    const c1 = await register('c1@test.dev', bob.user.id);
    const c2 = await register('c2@test.dev', c1.user.id);
    const c3 = await register('c3@test.dev', c2.user.id);
    const c4 = await register('c4@test.dev', c3.user.id);
    const c5 = await register('c5@test.dev', c4.user.id);
    await register('carol@test.dev', alice.user.id);
    await register('dave@test.dev', alice.user.id);

    const milestone = await pool.query('SELECT rank_id, reward_cents, status FROM rank_milestones WHERE user_id = $1', [
      alice.user.id,
    ]);
    expect(milestone.rows).toHaveLength(1);
    expect(milestone.rows[0]).toMatchObject({ rank_id: 1, reward_cents: 3500, status: 'PAID' });

    expect(await poolBalance('RANK_BONUS')).toBe(100); // 3600 − 3500

    const ledger = await pool.query(
      `SELECT type, amount_cents FROM ledger_entries WHERE user_id = $1 AND type = 'RANK_MILESTONE'`,
      [alice.user.id],
    );
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0].type).toBe('RANK_MILESTONE');
    expect(Number(ledger.rows[0].amount_cents)).toBe(3500);

    const user = await pool.query('SELECT highest_associate_rank FROM users WHERE id = $1', [alice.user.id]);
    expect(Number(user.rows[0].highest_associate_rank)).toBe(1);
    expect(c1.user.id).toBeTruthy();
    expect(c5.user.id).toBeTruthy();
  });
});

describe('atomicity', () => {
  it('rolls back the whole pipeline when registration fails', async () => {
    const alice = await register('alice@test.dev');
    await register('dup@test.dev', alice.user.id);

    const before = await pool.query('SELECT COUNT(*)::int AS n FROM registrations');
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@test.dev', password: 'password123', sponsorId: alice.user.id });
    expect(res.status).toBe(409);

    // Nothing new was written: no registration, no allocation, no bonus, no pool delta.
    const after = await pool.query('SELECT COUNT(*)::int AS n FROM registrations');
    expect(after.rows[0].n).toBe(before.rows[0].n);
    expect(await poolBalance('RANK_BONUS')).toBe(2 * 400); // only the two successful regs
  });
});