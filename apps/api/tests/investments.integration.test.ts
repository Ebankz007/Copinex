import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { addDays } from '@copinex/engine';
import { createApp } from '../src/app.js';

const app = createApp();
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

// ── Helpers ────────────────────────────────────────────

/** Mirror of the database seed — keeps each run fully deterministic. */
async function seedPackagesAndConfig() {
  const packages = [
    { tier: 1, name: '10% Monthly', minAmountCents: 5000, maxAmountCents: 49999, monthlyRateBps: 1000, dailyRateBps: 33 },
    { tier: 2, name: '11% Monthly', minAmountCents: 50000, maxAmountCents: 99999, monthlyRateBps: 1100, dailyRateBps: 37 },
    { tier: 3, name: '12% Monthly', minAmountCents: 100000, maxAmountCents: 199999, monthlyRateBps: 1200, dailyRateBps: 40 },
    { tier: 4, name: '13.5% Monthly', minAmountCents: 200000, maxAmountCents: 499999, monthlyRateBps: 1350, dailyRateBps: 45 },
    { tier: 5, name: '15% Monthly', minAmountCents: 500000, maxAmountCents: null, monthlyRateBps: 1500, dailyRateBps: 50 },
  ];
  for (const p of packages) {
    await pool.query(
      `INSERT INTO investment_packages (tier, name, min_amount_cents, max_amount_cents, monthly_rate_bps, daily_rate_bps, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')`,
      [p.tier, p.name, p.minAmountCents, p.maxAmountCents, p.monthlyRateBps, p.dailyRateBps],
    );
  }
}

async function resetDb() {
  await pool.query(`
    TRUNCATE TABLE investment_commissions, investment_earnings, investments,
    investment_packages, ledger_entries, wallets, users, registrations, fee_allocations,
    bonus_payouts, rank_milestones, leadership_rewards, team_volume, trading_settlements,
    withdrawal_requests, config CASCADE
  `);
  await seedPackagesAndConfig();
}

async function register(
  email: string,
  password = 'password123',
  sponsorId?: string,
): Promise<{ token: string; user: { id: string; role: string } }> {
  const res = await request(app).post('/api/auth/register').send({ email, password, sponsorId });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

async function fundWallet(userId: string, walletType: string, amountCents: number) {
  await pool.query(
    `INSERT INTO wallets (user_id, wallet_type, balance_cents)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, wallet_type)
     DO UPDATE SET balance_cents = wallets.balance_cents + EXCLUDED.balance_cents`,
    [userId, walletType, amountCents],
  );
}

/** Active Member policy: mark the $50 activation fee paid. */
async function activate(userId: string) {
  await pool.query(
    `UPDATE users SET membership_activated = true, activated_at = now() WHERE id = $1`,
    [userId],
  );
}

async function makeAdmin(userId: string) {
  await pool.query(`UPDATE users SET role = 'ADMIN' WHERE id = $1`, [userId]);
}

/** Login to get a fresh token (picks up role changes made after registration). */
async function login(email: string): Promise<{ token: string; user: { id: string } }> {
  const res = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

async function insertInvestment(userId: string, packageId: string, principalCents: number, startDate: Date) {
  const res = await pool.query(
    `INSERT INTO investments (user_id, package_id, principal_cents, status, start_date, accrual_end_date, available_date)
     VALUES ($1, $2, $3, 'ACTIVE', $4, $5, $6)
     RETURNING id`,
    [userId, packageId, principalCents, startDate, addDays(startDate, 90), addDays(startDate, 99)],
  );
  return res.rows[0].id as string;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

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

describe('auth', () => {
  it('registers a member and creates both wallets', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'alice@test.dev', password: 'password123', fullName: 'Alice' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.role).toBe('MEMBER');

    const wallets = await pool.query('SELECT wallet_type FROM wallets WHERE user_id = $1', [res.body.user.id]);
    expect(wallets.rows.map((r) => r.wallet_type).sort()).toEqual(['COPINEX', 'WITHDRAWAL']);
  });

  it('rejects duplicate email', async () => {
    await register('dup@test.dev');
    const res = await request(app).post('/api/auth/register').send({ email: 'dup@test.dev', password: 'password123' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EMAIL_TAKEN');
  });

  it('rejects unknown sponsor', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'x@test.dev', password: 'password123', sponsorId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_SPONSOR');
  });

  it('logs in and returns /me', async () => {
    await register('login@test.dev');
    const login = await request(app).post('/api/auth/login').send({ email: 'login@test.dev', password: 'password123' });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();

    const me = await request(app).get('/api/auth/me').set(auth(login.body.token));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('login@test.dev');
  });

  it('rejects wrong password and missing token', async () => {
    await register('bad@test.dev');
    const bad = await request(app).post('/api/auth/login').send({ email: 'bad@test.dev', password: 'wrong' });
    expect(bad.status).toBe(401);

    const noToken = await request(app).get('/api/auth/me');
    expect(noToken.status).toBe(401);
  });
});

describe('investment packages', () => {
  it('lists the 5 seeded active packages', async () => {
    const { token } = await register('pkg@test.dev');
    const res = await request(app).get('/api/investments/packages').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.packages).toHaveLength(5);
    expect(res.body.packages[0]).toMatchObject({ tier: 1, monthlyRateBps: 1000, dailyRateBps: 33 });
    expect(res.body.packages[4]).toMatchObject({ tier: 5, monthlyRateBps: 1500, dailyRateBps: 50 });
  });
});

describe('create investment', () => {
  it('requires auth', async () => {
    const res = await request(app).post('/api/investments').send({ amountCents: 10000 });
    expect(res.status).toBe(401);
  });

  it('rejects insufficient funds', async () => {
    const { token, user } = await register('poor@test.dev');
    await activate(user.id);
    const res = await request(app).post('/api/investments').set(auth(token)).send({ amountCents: 10000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INSUFFICIENT_FUNDS');
  });

  it('rejects amounts below $50 and non-integers', async () => {
    const { token, user } = await register('tiny@test.dev');
    await activate(user.id);
    const low = await request(app).post('/api/investments').set(auth(token)).send({ amountCents: 4999 });
    expect(low.status).toBe(400);
    const frac = await request(app).post('/api/investments').set(auth(token)).send({ amountCents: 10000.5 });
    expect(frac.status).toBe(400);
  });

  it('creates an investment, debits the COPINEX wallet, writes the ledger', async () => {
    const { token, user } = await register('investor@test.dev');
    await activate(user.id);
    await fundWallet(user.id, 'COPINEX', 100000); // $1,000

    const res = await request(app).post('/api/investments').set(auth(token)).send({ amountCents: 10000 });
    expect(res.status).toBe(201);
    expect(res.body.investment.principalCents).toBe(10000);
    expect(res.body.investment.packageId).toBeTruthy();
    expect(res.body.schedule.dailyCredits).toHaveLength(90);
    expect(res.body.schedule.dailyCredits[0].amountCents).toBe(33); // $100 × 0.33%
    expect(res.body.schedule.monthlyProfitCents).toBe(1000); // $100 × 10%

    const wallet = await pool.query('SELECT balance_cents FROM wallets WHERE user_id = $1 AND wallet_type = $2', [
      user.id,
      'COPINEX',
    ]);
    expect(Number(wallet.rows[0].balance_cents)).toBe(90000);

    const ledger = await pool.query('SELECT type, amount_cents, balance_after_cents FROM ledger_entries WHERE user_id = $1', [
      user.id,
    ]);
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0]).toMatchObject({ type: 'INVESTMENT_PRINCIPAL', amount_cents: '-10000', balance_after_cents: '90000' });
  });

  it('rejects investing more than the wallet holds', async () => {
    const { token, user } = await register('over@test.dev');
    await activate(user.id);
    await fundWallet(user.id, 'COPINEX', 5000);
    const res = await request(app).post('/api/investments').set(auth(token)).send({ amountCents: 5001 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INSUFFICIENT_FUNDS');
  });
});

describe('accrual job', () => {
  it('credits daily profit, unlocks at day 99, credits monthly profit + 20% upline commissions', async () => {
    // Chain: alice (admin) → bob → carol
    const alice = await register('alice@test.dev');
    const bob = await register('bob@test.dev', 'password123', alice.user.id);
    const carol = await register('carol@test.dev', 'password123', bob.user.id);
    await makeAdmin(alice.user.id);
    const admin = await login('alice@test.dev');

    // Carol invests $100 (tier 1) backdated so that, as of 2026-12-15:
    //   start = asOf - 120d → 90 daily credits done, available (start+99) passed,
    //   and one calendar-month boundary (Dec 1) has passed.
    const asOf = new Date('2026-12-15T00:00:00Z');
    const start = addDays(asOf, -120);
    const pkg = await pool.query('SELECT id FROM investment_packages WHERE tier = 1');
    const invId = await insertInvestment(carol.user.id, pkg.rows[0].id, 10000, start);

    const res = await request(app)
      .post('/api/jobs/accrue-investments?asOf=2026-12-15')
      .set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.dailyCredited).toBe(90);
    expect(res.body.unlocked).toBe(90);
    expect(res.body.monthlyCredited).toBe(1);
    expect(res.body.commissionsPaid).toBe(2);
    expect(res.body.investmentsProcessed).toBe(1);

    // Carol's withdrawal wallet: 90 × 33¢ daily + $10 monthly, all available.
    const wallet = await request(app).get('/api/investments/wallet').set(auth(carol.token));
    expect(wallet.body.wallet.availableCents).toBe(90 * 33 + 1000);
    expect(wallet.body.wallet.lockedCents).toBe(0);

    // Commissions: 20% of $10 = $2.00 → level1 (bob) 143¢, level2 (alice) 57¢.
    const comm = await pool.query('SELECT recipient_id, level, amount_cents FROM investment_commissions ORDER BY level');
    expect(comm.rows).toHaveLength(2);
    expect(comm.rows[0]).toMatchObject({ level: 1, amount_cents: 143 });
    expect(comm.rows[1]).toMatchObject({ level: 2, amount_cents: 57 });

    // bob's COPINEX wallet: $15 direct referral (carol's registration) + $1.43
    // upline commission (carol's monthly profit).
    const bobWallet = await pool.query('SELECT balance_cents FROM wallets WHERE user_id = $1 AND wallet_type = $2', [
      bob.user.id,
      'COPINEX',
    ]);
    expect(Number(bobWallet.rows[0].balance_cents)).toBe(1500 + 143);
    expect(invId).toBeTruthy();
  });

  it('keeps daily profit LOCKED before the availability date', async () => {
    const adminReg = await register('adm2@test.dev');
    const member = await register('mem2@test.dev', 'password123', adminReg.user.id);
    await makeAdmin(adminReg.user.id);
    const admin = await login('adm2@test.dev');

    const asOf = new Date('2026-10-15T00:00:00Z');
    const start = addDays(asOf, -10);
    const pkg = await pool.query('SELECT id FROM investment_packages WHERE tier = 1');
    await insertInvestment(member.user.id, pkg.rows[0].id, 10000, start);

    const res = await request(app)
      .post('/api/jobs/accrue-investments?asOf=2026-10-15')
      .set(auth(admin.token));
    expect(res.body.dailyCredited).toBe(10);
    expect(res.body.unlocked).toBe(0);
    expect(res.body.monthlyCredited).toBe(0);

    const wallet = await request(app).get('/api/investments/wallet').set(auth(member.token));
    expect(wallet.body.wallet.lockedCents).toBe(10 * 33);
    expect(wallet.body.wallet.availableCents).toBe(0);
  });

  it('is idempotent — a second run credits nothing new', async () => {
    const adminReg = await register('adm3@test.dev');
    const member = await register('mem3@test.dev', 'password123', adminReg.user.id);
    await makeAdmin(adminReg.user.id);
    const admin = await login('adm3@test.dev');

    const asOf = new Date('2026-10-15T00:00:00Z');
    const start = addDays(asOf, -10);
    const pkg = await pool.query('SELECT id FROM investment_packages WHERE tier = 1');
    await insertInvestment(member.user.id, pkg.rows[0].id, 10000, start);

    const first = await request(app)
      .post('/api/jobs/accrue-investments?asOf=2026-10-15')
      .set(auth(admin.token));
    expect(first.body.dailyCredited).toBe(10);

    const second = await request(app)
      .post('/api/jobs/accrue-investments?asOf=2026-10-15')
      .set(auth(admin.token));
    expect(second.body.dailyCredited).toBe(0);
    expect(second.body.unlocked).toBe(0);

    const earnings = await pool.query('SELECT COUNT(*)::int AS n FROM investment_earnings');
    expect(earnings.rows[0].n).toBe(10);
  });

  it('blocks members and requires a valid asOf', async () => {
    const member = await register('mem4@test.dev');
    const memberRun = await request(app)
      .post('/api/jobs/accrue-investments')
      .set(auth(member.token));
    expect(memberRun.status).toBe(403);

    const adminReg = await register('adm4@test.dev');
    await makeAdmin(adminReg.user.id);
    const admin = await login('adm4@test.dev');
    const badDate = await request(app)
      .post('/api/jobs/accrue-investments?asOf=not-a-date')
      .set(auth(admin.token));
    expect(badDate.status).toBe(400);
    expect(badDate.body.error).toBe('INVALID_DATE');
  });
});

describe('admin package management', () => {
  it('blocks members from admin routes', async () => {
    const { token } = await register('member5@test.dev');
    const res = await request(app).get('/api/admin/investments/packages').set(auth(token));
    expect(res.status).toBe(403);
  });

  it('creates, deactivates, and closes', async () => {
    const adminReg = await register('adm5@test.dev');
    await makeAdmin(adminReg.user.id);
    const admin = await login('adm5@test.dev');

    const created = await request(app)
      .post('/api/admin/investments/packages')
      .set(auth(admin.token))
      .send({
        tier: 6,
        name: '20% Monthly',
        minAmountCents: 1_000_000,
        maxAmountCents: null,
        monthlyRateBps: 2000,
        dailyRateBps: 66,
        status: 'ACTIVE',
      });
    expect(created.status).toBe(201);

    const dup = await request(app)
      .post('/api/admin/investments/packages')
      .set(auth(admin.token))
      .send({
        tier: 6,
        name: 'Duplicate',
        minAmountCents: 1_000_000,
        monthlyRateBps: 2000,
        dailyRateBps: 66,
      });
    expect(dup.status).toBe(409);

    // Deactivate tier 1 → member listing excludes it.
    const tier1 = await pool.query('SELECT id FROM investment_packages WHERE tier = 1');
    await request(app)
      .patch(`/api/admin/investments/packages/${tier1.rows[0].id}`)
      .set(auth(admin.token))
      .send({ status: 'INACTIVE' });

    const { token } = await register('member6@test.dev');
    const listing = await request(app).get('/api/investments/packages').set(auth(token));
    expect(listing.body.packages).toHaveLength(5); // 4 original + new tier 6, minus tier 1
    expect(listing.body.packages.some((p: { tier: number }) => p.tier === 1)).toBe(false);

    // Close an investment (tier 2 — tier 1 was deactivated above).
    const investor = await register('investor7@test.dev');
    await activate(investor.user.id);
    await fundWallet(investor.user.id, 'COPINEX', 100000);
    const inv = await request(app)
      .post('/api/investments')
      .set(auth(investor.token))
      .send({ amountCents: 50000 });
    const closed = await request(app)
      .post(`/api/admin/investments/${inv.body.investment.id}/close`)
      .set(auth(admin.token));
    expect(closed.status).toBe(200);
    expect(closed.body.investment.status).toBe('CLOSED');
  });
});

describe('investment detail', () => {
  it('returns the schedule for the owner, forbids others', async () => {
    const owner = await register('owner@test.dev');
    const stranger = await register('stranger@test.dev');
    await activate(owner.user.id);
    await fundWallet(owner.user.id, 'COPINEX', 10000);
    const inv = await request(app)
      .post('/api/investments')
      .set(auth(owner.token))
      .send({ amountCents: 10000 });

    const mine = await request(app).get(`/api/investments/${inv.body.investment.id}`).set(auth(owner.token));
    expect(mine.status).toBe(200);
    expect(mine.body.schedule.dailyCredits).toHaveLength(90);

    const theirs = await request(app).get(`/api/investments/${inv.body.investment.id}`).set(auth(stranger.token));
    expect(theirs.status).toBe(403);
  });
});