/**
 * Active Member policy integration tests (2026-09-26).
 *
 * Policy: a member is ACTIVE once the $50 activation fee is paid.
 * Until then they register (link or direct), earn commissions, and see the
 * whole site — but monetary activities (withdraw / invest / PAMM) are gated
 * with 403 MEMBERSHIP_NOT_ACTIVATED. Admin activates via the interim rail;
 * the payment-provider webhook will call the same service path later.
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
    TRUNCATE TABLE pamm_connections, brokers,
    investment_commissions, investment_earnings, investments,
    investment_packages, ledger_entries, wallets, users, registrations, fee_allocations,
    bonus_payouts, rank_milestones, leadership_rewards, team_volume, trading_settlements,
    withdrawal_requests, pools, config CASCADE
  `);
  await pool.query(
    `INSERT INTO investment_packages (tier, name, min_amount_cents, max_amount_cents, monthly_rate_bps, daily_rate_bps, status)
     VALUES (1, '10% Monthly', 5000, 49999, 1000, 33, 'ACTIVE')`,
  );
}

async function register(
  email: string,
  sponsorId?: string,
): Promise<{ token: string; user: { id: string; role: string } }> {
  const res = await request(app).post('/api/auth/register').send({ email, password: 'password123', sponsorId });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

async function makeAdmin(userId: string) {
  await pool.query(`UPDATE users SET role = 'ADMIN' WHERE id = $1`, [userId]);
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

async function addBroker(): Promise<string> {
  const adminUser = await register('act-admin@test.dev');
  await makeAdmin(adminUser.user.id);
  const login = await request(app).post('/api/auth/login').send({ email: 'act-admin@test.dev', password: 'password123' });
  const res = await request(app)
    .post('/api/admin/brokers')
    .set({ Authorization: `Bearer ${login.body.token}` })
    .send({ name: 'PUPRIME', code: 'PU', pammLink: 'https://pamm.puprime.com/private/copinex' });
  return res.body.broker.id as string;
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

describe('Active Member policy', () => {
  it('fresh member is unactivated: registration PENDING, /me exposes the state', async () => {
    const { token, user } = await register('fresh@test.dev');

    const me = await request(app).get('/api/auth/me').set(auth(token));
    expect(me.status).toBe(200);
    expect(me.body.user.membershipActivated).toBe(false);
    expect(me.body.user.activatedAt).toBeNull();

    const reg = await pool.query('SELECT status FROM registrations WHERE user_id = $1', [user.id]);
    expect(reg.rows[0].status).toBe('PENDING');
  });

  it('unactivated member earns commissions (registration pipeline runs), but cannot withdraw', async () => {
    const sponsor = await register('sponsor@test.dev');
    const member = await register('earner@test.dev');

    // Register again through the pipeline → sponsor earns direct bonus.
    await register('downline@test.dev', sponsor.user.id);

    const sponsorWallet = await pool.query(
      'SELECT balance_cents FROM wallets WHERE user_id = $1 AND wallet_type = $2',
      [sponsor.user.id, 'COPINEX'],
    );
    expect(Number(sponsorWallet.rows[0].balance_cents)).toBeGreaterThan(0); // 1500 direct bonus

    // The earner has a balance but the gate blocks withdrawal.
    await fundWallet(member.user.id, 'COPINEX', 5000);
    const res = await request(app)
      .post('/api/wallets/withdraw')
      .set(auth(member.token))
      .send({ walletType: 'COPINEX', amountCents: 1000 });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('MEMBERSHIP_NOT_ACTIVATED');
  });

  it('unactivated member cannot invest or request PAMM', async () => {
    const member = await register('blocked@test.dev');
    await fundWallet(member.user.id, 'COPINEX', 100000);
    const brokerId = await addBroker();

    const invest = await request(app)
      .post('/api/investments')
      .set(auth(member.token))
      .send({ amountCents: 10000 });
    expect(invest.status).toBe(403);
    expect(invest.body.error).toBe('MEMBERSHIP_NOT_ACTIVATED');

    const pamm = await request(app)
      .post('/api/pamm/connections')
      .set(auth(member.token))
      .send({ brokerId });
    expect(pamm.status).toBe(403);
    expect(pamm.body.error).toBe('MEMBERSHIP_NOT_ACTIVATED');
  });

  it('admin lists unactivated members and activates one → registration PAID, gates open', async () => {
    const adminUser = await register('act-admin@test.dev');
    await makeAdmin(adminUser.user.id);
    const adminLogin = await request(app).post('/api/auth/login').send({ email: 'act-admin@test.dev', password: 'password123' });
    const adminToken = adminLogin.body.token as string;

    const member = await register('paying@test.dev');
    await fundWallet(member.user.id, 'COPINEX', 100000);

    // List filter: unactivated only.
    const list = await request(app).get('/api/admin/members?activated=false').set(auth(adminToken));
    expect(list.status).toBe(200);
    const listed = list.body.members.find((m: { email: string }) => m.email === 'paying@test.dev');
    expect(listed).toBeTruthy();
    expect(listed.membershipActivated).toBe(false);

    // Activate.
    const act = await request(app)
      .post(`/api/admin/members/${member.user.id}/activate`)
      .set(auth(adminToken));
    expect(act.status).toBe(200);
    expect(act.body.member.membershipActivated).toBe(true);
    expect(act.body.member.activatedAt).toBeTruthy();

    // Registration flips to PAID.
    const reg = await pool.query('SELECT status FROM registrations WHERE user_id = $1', [member.user.id]);
    expect(reg.rows[0].status).toBe('PAID');

    // Gates open without re-login (DB lookup, not JWT).
    const invest = await request(app)
      .post('/api/investments')
      .set(auth(member.token))
      .send({ amountCents: 10000 });
    expect(invest.status).toBe(201);

    const withdraw = await request(app)
      .post('/api/wallets/withdraw')
      .set(auth(member.token))
      .send({ walletType: 'COPINEX', amountCents: 1000 });
    expect(withdraw.status).toBe(201);

    // /me reflects activation.
    const me = await request(app).get('/api/auth/me').set(auth(member.token));
    expect(me.body.user.membershipActivated).toBe(true);
  });

  it('activating twice → 409; non-admin cannot activate → 403', async () => {
    const adminUser = await register('act-admin@test.dev');
    await makeAdmin(adminUser.user.id);
    const adminLogin = await request(app).post('/api/auth/login').send({ email: 'act-admin@test.dev', password: 'password123' });
    const adminToken = adminLogin.body.token as string;

    const member = await register('twice@test.dev');

    const first = await request(app)
      .post(`/api/admin/members/${member.user.id}/activate`)
      .set(auth(adminToken));
    expect(first.status).toBe(200);

    const again = await request(app)
      .post(`/api/admin/members/${member.user.id}/activate`)
      .set(auth(adminToken));
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('ALREADY_ACTIVATED');

    const other = await register('other@test.dev');
    const forbidden = await request(app)
      .post(`/api/admin/members/${other.user.id}/activate`)
      .set(auth(other.token));
    expect(forbidden.status).toBe(403);
  });

  it('activating an unknown member → 404', async () => {
    const adminUser = await register('act-admin@test.dev');
    await makeAdmin(adminUser.user.id);
    const adminLogin = await request(app).post('/api/auth/login').send({ email: 'act-admin@test.dev', password: 'password123' });

    const res = await request(app)
      .post('/api/admin/members/00000000-0000-0000-0000-000000000000/activate')
      .set(auth(adminLogin.body.token));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });
});