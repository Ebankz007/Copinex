/**
 * Compensation admin + jobs integration tests — §7 settlements, §10 flagged
 * milestone resolution, §6 leadership fulfillment, and the evaluate-ranks job.
 *
 * Money math (per $100 realized profit, integer cents):
 *   client 6000 / sponsor 1000 / company 3000 — §7 split.
 *   An unallocated sponsor share (no qualified upline) reverts to the company:
 *   company_share_cents = 3000 + 1000 = 4000 (nominal sponsor share preserved).
 *
 * Rank pool: +400 per registration; rank-1 reward 3500.
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

async function makeAdmin(userId: string) {
  await pool.query(`UPDATE users SET role = 'ADMIN' WHERE id = $1`, [userId]);
}

async function login(email: string): Promise<{ token: string }> {
  const res = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function walletBalance(userId: string): Promise<number> {
  const res = await pool.query('SELECT balance_cents FROM wallets WHERE user_id = $1 AND wallet_type = $2', [
    userId,
    'COPINEX',
  ]);
  return Number(res.rows[0]?.balance_cents ?? 0);
}

async function poolBalance(name: string): Promise<number> {
  const res = await pool.query('SELECT balance_cents FROM pools WHERE name = $1', [name]);
  return Number(res.rows[0]?.balance_cents ?? 0);
}

async function setInactive(userId: string) {
  await pool.query(`UPDATE users SET is_active = false, status = 'INACTIVE' WHERE id = $1`, [userId]);
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

describe('§7 settlements — record + process', () => {
  it('splits $100 profit 60/10/30 and credits the active sponsor 10%', async () => {
    const alice = await register('alice@test.dev');
    const bob = await register('bob@test.dev', alice.user.id);
    await makeAdmin(alice.user.id);
    const admin = await login('alice@test.dev');

    const res = await request(app)
      .post('/api/admin/settlements')
      .set(auth(admin.token))
      .send({ clientId: bob.user.id, period: '2026-09', realizedProfitCents: 10000 });
    expect(res.status).toBe(201);

    const s = res.body.settlement;
    expect(s).toMatchObject({
      period: '2026-09',
      clientId: bob.user.id,
      realizedProfitCents: 10000,
      clientShareCents: 6000,
      sponsorShareCents: 1000,
      companyShareCents: 3000,
      status: 'PROCESSED',
    });

    // The sponsor's 10% lands in the COPINEX wallet with a traceable ledger row.
    // alice: $15 direct referral (bob's registration) + $10 settlement share.
    expect(await walletBalance(alice.user.id)).toBe(2500);
    const ledger = await pool.query(
      `SELECT type, amount_cents, source_type, source_id FROM ledger_entries
       WHERE user_id = $1 AND type = 'TRADING_PERFORMANCE_SHARE'`,
      [alice.user.id],
    );
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0].source_type).toBe('settlement');
    expect(ledger.rows[0].source_id).toBe(s.id);
    expect(Number(ledger.rows[0].amount_cents)).toBe(1000);

    // The client's 60% stays on the client's own account — no platform credit.
    expect(await walletBalance(bob.user.id)).toBe(0);
  });

  it('compresses the sponsor share to the next active upline', async () => {
    const alice = await register('alice@test.dev');
    const bob = await register('bob@test.dev', alice.user.id);
    const carol = await register('carol@test.dev', bob.user.id);
    await setInactive(bob.user.id);
    await makeAdmin(alice.user.id);
    const admin = await login('alice@test.dev');

    const res = await request(app)
      .post('/api/admin/settlements')
      .set(auth(admin.token))
      .send({ clientId: carol.user.id, period: '2026-09', realizedProfitCents: 10000 });
    expect(res.status).toBe(201);

    // bob is inactive → alice receives the 10% share.
    expect(res.body.settlement.sponsorShareCents).toBe(1000);
    // alice: $15 direct (bob) + $2 gen2 (carol) + $10 settlement share.
    expect(await walletBalance(alice.user.id)).toBe(2700);
    // bob keeps his earned $15 direct bonus but gets NO settlement share.
    expect(await walletBalance(bob.user.id)).toBe(1500);
  });

  it('reverts an unallocated sponsor share to the company (no upline)', async () => {
    const alice = await register('alice@test.dev');
    await makeAdmin(alice.user.id);
    const admin = await login('alice@test.dev');

    const res = await request(app)
      .post('/api/admin/settlements')
      .set(auth(admin.token))
      .send({ clientId: alice.user.id, period: '2026-09', realizedProfitCents: 10000 });
    expect(res.status).toBe(201);

    // Nominal sponsor share preserved on the row; the company absorbs it.
    expect(res.body.settlement).toMatchObject({
      sponsorShareCents: 1000,
      companyShareCents: 4000,
    });
    expect(await walletBalance(alice.user.id)).toBe(0); // nothing credited
  });

  it('rejects a duplicate (client, period) settlement', async () => {
    const alice = await register('alice@test.dev');
    const bob = await register('bob@test.dev', alice.user.id);
    await makeAdmin(alice.user.id);
    const admin = await login('alice@test.dev');

    const body = { clientId: bob.user.id, period: '2026-09', realizedProfitCents: 10000 };
    await request(app).post('/api/admin/settlements').set(auth(admin.token)).send(body);
    const dup = await request(app).post('/api/admin/settlements').set(auth(admin.token)).send(body);
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('SETTLEMENT_EXISTS');
  });

  it('rejects malformed periods and non-positive profit', async () => {
    const alice = await register('alice@test.dev');
    await makeAdmin(alice.user.id);
    const admin = await login('alice@test.dev');

    const badPeriod = await request(app)
      .post('/api/admin/settlements')
      .set(auth(admin.token))
      .send({ clientId: alice.user.id, period: '2026-9', realizedProfitCents: 10000 });
    expect(badPeriod.status).toBe(400);
    // The route's zod gate rejects the malformed period before the service's
    // INVALID_PERIOD guard (which stays as defense in depth for direct calls).
    expect(badPeriod.body.error).toBe('VALIDATION_ERROR');

    const noProfit = await request(app)
      .post('/api/admin/settlements')
      .set(auth(admin.token))
      .send({ clientId: alice.user.id, period: '2026-09', realizedProfitCents: 0 });
    expect(noProfit.status).toBe(400);
  });

  it('lists settlements newest-first', async () => {
    const alice = await register('alice@test.dev');
    const bob = await register('bob@test.dev', alice.user.id);
    await makeAdmin(alice.user.id);
    const admin = await login('alice@test.dev');

    await request(app)
      .post('/api/admin/settlements')
      .set(auth(admin.token))
      .send({ clientId: bob.user.id, period: '2026-08', realizedProfitCents: 5000 });
    await request(app)
      .post('/api/admin/settlements')
      .set(auth(admin.token))
      .send({ clientId: bob.user.id, period: '2026-09', realizedProfitCents: 10000 });

    const res = await request(app).get('/api/admin/settlements').set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.settlements.map((s: { period: string }) => s.period)).toEqual(['2026-09', '2026-08']);
  });
});

describe('§10 flagged milestone resolution', () => {
  it('flags when underfunded, refuses to overpay, then pays once funded', async () => {
    // 5 registrations → pool 2000 < rank-1 reward 3500 → FLAGGED.
    const alice = await register('alice@test.dev');
    await register('bob@test.dev', alice.user.id);
    await register('carol@test.dev', alice.user.id);
    await register('dave@test.dev', alice.user.id);
    await register('eve@test.dev', alice.user.id);
    await makeAdmin(alice.user.id);
    const admin = await login('alice@test.dev');

    const list = await request(app).get('/api/admin/ranks/milestones').set(auth(admin.token));
    expect(list.status).toBe(200);
    expect(list.body.milestones).toHaveLength(1);
    expect(list.body.milestones[0]).toMatchObject({ rankId: 1, rewardCents: 3500, status: 'FLAGGED' });
    const milestoneId = list.body.milestones[0].id;

    // Pool still cannot cover it → 409, nothing paid.
    const early = await request(app)
      .post(`/api/admin/ranks/milestones/${milestoneId}/pay`)
      .set(auth(admin.token));
    expect(early.status).toBe(409);
    expect(early.body.error).toBe('POOL_INSUFFICIENT');
    expect(await poolBalance('RANK_BONUS')).toBe(2000);
    expect(await walletBalance(alice.user.id)).toBe(6000); // 4 × $15 direct only

    // Fund the pool (simulates accumulated registrations) → pay succeeds.
    await pool.query(`UPDATE pools SET balance_cents = 3600 WHERE name = 'RANK_BONUS'`);
    const pay = await request(app)
      .post(`/api/admin/ranks/milestones/${milestoneId}/pay`)
      .set(auth(admin.token));
    expect(pay.status).toBe(200);
    expect(pay.body.milestone.status).toBe('PAID');
    expect(await poolBalance('RANK_BONUS')).toBe(100); // 3600 − 3500
    expect(await walletBalance(alice.user.id)).toBe(9500); // +3500 rank payout

    const ledger = await pool.query(
      `SELECT type, amount_cents, source_id FROM ledger_entries
       WHERE user_id = $1 AND type = 'RANK_MILESTONE'`,
      [alice.user.id],
    );
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0].source_id).toBe(milestoneId);
    expect(Number(ledger.rows[0].amount_cents)).toBe(3500);

    // Already paid → 409 NOT_FLAGGED. Unknown id → 404.
    const again = await request(app)
      .post(`/api/admin/ranks/milestones/${milestoneId}/pay`)
      .set(auth(admin.token));
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('NOT_FLAGGED');

    const missing = await request(app)
      .post('/api/admin/ranks/milestones/00000000-0000-0000-0000-000000000000/pay')
      .set(auth(admin.token));
    expect(missing.status).toBe(404);
  });
});

describe('§6 leadership rewards + the evaluate-ranks job', () => {
  /** alice ← 2 matrix legs (bob, carol), 3 members each — all at associate rank 3. */
  async function buildLeadershipTree(): Promise<{ alice: { id: string }; adminToken: string }> {
    const alice = await register('alice@test.dev');
    const bob = await register('bob@test.dev', alice.user.id);
    const carol = await register('carol@test.dev', alice.user.id);
    const b1 = await register('b1@test.dev', bob.user.id);
    const b1a = await register('b1a@test.dev', b1.user.id);
    const c1 = await register('c1@test.dev', carol.user.id);
    const c1a = await register('c1a@test.dev', c1.user.id);

    // Simulate the team having earned associate rank 3 (milestone flow is
    // covered elsewhere; the job reads the stored rank).
    const ids = [alice, bob, carol, b1, b1a, c1, c1a].map((u) => u.user.id);
    await pool.query(`UPDATE users SET highest_associate_rank = 3 WHERE id = ANY($1)`, [ids]);

    await makeAdmin(alice.user.id);
    const admin = await login('alice@test.dev');
    return { alice, adminToken: admin.token };
  }

  it('creates a REVIEW leadership reward for a qualified member and fulfills it', async () => {
    const { alice, adminToken } = await buildLeadershipTree();

    const job = await request(app).post('/api/jobs/evaluate-ranks').set(auth(adminToken));
    expect(job.status).toBe(200);
    expect(job.body.leadershipRewards).toBe(1); // only alice qualifies

    const rewards = await request(app).get('/api/admin/ranks/leadership').set(auth(adminToken));
    expect(rewards.status).toBe(200);
    expect(rewards.body.rewards).toHaveLength(1);
    expect(rewards.body.rewards[0]).toMatchObject({
      userId: alice.user.id,
      rankId: 1,
      rewardSku: 'SMARTPHONE',
      status: 'REVIEW',
    });
    const rewardId = rewards.body.rewards[0].id;

    // Status filter works.
    const paidOnly = await request(app)
      .get('/api/admin/ranks/leadership?status=PAID')
      .set(auth(adminToken));
    expect(paidOnly.body.rewards).toHaveLength(0);

    // Fulfill → PAID; fulfilling again → 404 (no longer REVIEW).
    const fulfill = await request(app)
      .post(`/api/admin/ranks/leadership/${rewardId}/fulfill`)
      .set(auth(adminToken));
    expect(fulfill.status).toBe(200);
    expect(fulfill.body.reward.status).toBe('PAID');

    const again = await request(app)
      .post(`/api/admin/ranks/leadership/${rewardId}/fulfill`)
      .set(auth(adminToken));
    expect(again.status).toBe(404);

    const user = await pool.query('SELECT highest_leadership_rank FROM users WHERE id = $1', [alice.user.id]);
    expect(Number(user.rows[0].highest_leadership_rank)).toBe(1);
  });

  it('is idempotent — a second run creates nothing new', async () => {
    const { adminToken } = await buildLeadershipTree();

    await request(app).post('/api/jobs/evaluate-ranks').set(auth(adminToken));
    const second = await request(app).post('/api/jobs/evaluate-ranks').set(auth(adminToken));

    expect(second.status).toBe(200);
    expect(second.body.associateMilestones).toBe(0);
    expect(second.body.leadershipRewards).toBe(0);

    const rewards = await pool.query('SELECT COUNT(*)::int AS n FROM leadership_rewards');
    expect(rewards.rows[0].n).toBe(1);
  });
});

describe('access control', () => {
  it('rejects unauthenticated and non-admin callers', async () => {
    const alice = await register('alice@test.dev');
    const bob = await register('bob@test.dev', alice.user.id);

    const anon = await request(app).post('/api/admin/settlements').send({
      clientId: bob.user.id,
      period: '2026-09',
      realizedProfitCents: 10000,
    });
    expect(anon.status).toBe(401);

    const member = await login('bob@test.dev');
    const forbidden = await request(app)
      .post('/api/admin/settlements')
      .set(auth(member.token))
      .send({ clientId: bob.user.id, period: '2026-09', realizedProfitCents: 10000 });
    expect(forbidden.status).toBe(403);

    const job = await request(app).post('/api/jobs/evaluate-ranks').set(auth(member.token));
    expect(job.status).toBe(403);
  });
});