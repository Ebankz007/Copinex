import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createApp } from '../src/app.js';
import { loginWithEnrollment } from './helpers.js';

const app = createApp();
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function resetDb() {
  await pool.query(`
    TRUNCATE TABLE investment_commissions, investment_earnings, investments,
    investment_packages, ledger_entries, wallets, users, registrations, fee_allocations,
    bonus_payouts, rank_milestones, leadership_rewards, team_volume, trading_settlements,
    withdrawal_requests, admin_audit_log, config CASCADE
  `);
  await pool.query(
    `INSERT INTO investment_packages (tier, name, min_amount_cents, max_amount_cents, monthly_rate_bps, daily_rate_bps, status)
     VALUES (1, '10% Monthly', 5000, 49999, 1000, 33, 'ACTIVE')`,
  );
}

async function register(
  email: string,
  password = 'password123',
): Promise<{ token: string; user: { id: string; role: string } }> {
  const res = await request(app).post('/api/auth/register').send({ email, password });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

async function makeAdmin(userId: string) {
  await pool.query(`UPDATE users SET role = 'ADMIN' WHERE id = $1`, [userId]);
}

  async function login(email: string): Promise<{ token: string; user: { id: string } }> {
    const { token } = await loginWithEnrollment(app, email);
    const me = await request(app).get('/api/auth/me').set(auth(token));
    return { token, user: me.body.user };
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

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

beforeAll(async () => {
  await resetDb();
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await pool.end();
});

describe('wallet balances', () => {
  it('returns both wallets (zeroed) and no pending holds for a fresh member', async () => {
    const { token } = await register('wb@test.dev');
    const res = await request(app).get('/api/wallets').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.wallets).toHaveLength(2);
    expect(res.body.wallets).toMatchObject([
      { walletType: 'COPINEX', balanceCents: 0 },
      { walletType: 'WITHDRAWAL', balanceCents: 0 },
    ]);
    expect(res.body.pendingWithdrawalCents).toBe(0);
  });

  it('requires auth', async () => {
    const res = await request(app).get('/api/wallets');
    expect(res.status).toBe(401);
  });
});

describe('admin deposit', () => {
  it('credits the COPINEX wallet and writes a DEPOSIT ledger entry', async () => {
    const adminReg = await register('dep-admin@test.dev');
    await makeAdmin(adminReg.user.id);
    const admin = await login('dep-admin@test.dev');
    const member = await register('dep-member@test.dev');

    const res = await request(app)
      .post('/api/admin/wallets/deposit')
      .set(auth(admin.token))
      .send({ userId: member.user.id, amountCents: 50000, note: 'pilot top-up' });
    expect(res.status).toBe(201);
    expect(res.body.deposit.amountCents).toBe(50000);

    const wallet = await pool.query('SELECT balance_cents FROM wallets WHERE user_id = $1 AND wallet_type = $2', [
      member.user.id,
      'COPINEX',
    ]);
    expect(Number(wallet.rows[0].balance_cents)).toBe(50000);

    const ledger = await pool.query(
      'SELECT type, amount_cents, balance_after_cents, source_type FROM ledger_entries WHERE user_id = $1',
      [member.user.id],
    );
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0]).toMatchObject({
      type: 'DEPOSIT',
      amount_cents: '50000',
      balance_after_cents: '50000',
      source_type: 'admin_deposit',
    });
  });

  it('blocks members and rejects bad amounts', async () => {
    const member = await register('dep-member2@test.dev');
    const memberRes = await request(app)
      .post('/api/admin/wallets/deposit')
      .set(auth(member.token))
      .send({ userId: member.user.id, amountCents: 1000 });
    expect(memberRes.status).toBe(403);

    const adminReg = await register('dep-admin2@test.dev');
    await makeAdmin(adminReg.user.id);
    const admin = await login('dep-admin2@test.dev');

    const zero = await request(app)
      .post('/api/admin/wallets/deposit')
      .set(auth(admin.token))
      .send({ userId: member.user.id, amountCents: 0 });
    expect(zero.status).toBe(400);
  });
});

describe('withdrawal flow', () => {
  it('holds funds on request (PENDING), then approve marks it PAID', async () => {
    const adminReg = await register('wd-admin@test.dev');
    await makeAdmin(adminReg.user.id);
    const admin = await login('wd-admin@test.dev');
    const member = await register('wd-member@test.dev');
    await activate(member.user.id);
    await fundWallet(member.user.id, 'WITHDRAWAL', 10000);

    // Member requests $50 from the withdrawal wallet.
    const req = await request(app)
      .post('/api/wallets/withdraw')
      .set(auth(member.token))
      .send({ walletType: 'WITHDRAWAL', amountCents: 5000 });
    expect(req.status).toBe(201);
    expect(req.body.request.status).toBe('PENDING');
    const requestId = req.body.request.id as string;

    // Funds are held: balance 10000 â†’ 5000, ledger shows -5000 WITHDRAWAL.
    const wallet = await pool.query('SELECT balance_cents FROM wallets WHERE user_id = $1 AND wallet_type = $2', [
      member.user.id,
      'WITHDRAWAL',
    ]);
    expect(Number(wallet.rows[0].balance_cents)).toBe(5000);

    const ledger = await pool.query('SELECT type, amount_cents, balance_after_cents FROM ledger_entries WHERE user_id = $1', [
      member.user.id,
    ]);
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0]).toMatchObject({ type: 'WITHDRAWAL', amount_cents: '-5000', balance_after_cents: '5000' });

    // GET /api/wallets reflects the hold.
    const balances = await request(app).get('/api/wallets').set(auth(member.token));
    expect(balances.body.pendingWithdrawalCents).toBe(5000);
    const withdrawalWallet = balances.body.wallets.find((w: { walletType: string }) => w.walletType === 'WITHDRAWAL');
    expect(withdrawalWallet.balanceCents).toBe(5000);

    // Member's own list shows the request.
    const mine = await request(app).get('/api/wallets/withdrawals').set(auth(member.token));
    expect(mine.body.requests).toHaveLength(1);
    expect(mine.body.requests[0].status).toBe('PENDING');

    // Admin approves.
    const approved = await request(app)
      .post(`/api/admin/wallets/withdrawals/${requestId}/approve`)
      .set(auth(admin.token));
    expect(approved.status).toBe(200);
    expect(approved.body.request.status).toBe('PAID');
    expect(approved.body.request.adminId).toBe(admin.user.id);

    // Approving again conflicts.
    const again = await request(app)
      .post(`/api/admin/wallets/withdrawals/${requestId}/approve`)
      .set(auth(admin.token));
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('ALREADY_REVIEWED');
  });

  it('rejects a PENDING request and refunds the held funds', async () => {
    const adminReg = await register('wd-admin2@test.dev');
    await makeAdmin(adminReg.user.id);
    const admin = await login('wd-admin2@test.dev');
    const member = await register('wd-member2@test.dev');
    await activate(member.user.id);
    await fundWallet(member.user.id, 'WITHDRAWAL', 10000);

    const req = await request(app)
      .post('/api/wallets/withdraw')
      .set(auth(member.token))
      .send({ walletType: 'WITHDRAWAL', amountCents: 4000 });
    const requestId = req.body.request.id as string;

    const rejected = await request(app)
      .post(`/api/admin/wallets/withdrawals/${requestId}/reject`)
      .set(auth(admin.token));
    expect(rejected.status).toBe(200);
    expect(rejected.body.request.status).toBe('REJECTED');

    // Refund: balance back to 10000, ledger shows WITHDRAWAL_REFUND +4000.
    const wallet = await pool.query('SELECT balance_cents FROM wallets WHERE user_id = $1 AND wallet_type = $2', [
      member.user.id,
      'WITHDRAWAL',
    ]);
    expect(Number(wallet.rows[0].balance_cents)).toBe(10000);

    const ledger = await pool.query('SELECT type, amount_cents FROM ledger_entries WHERE user_id = $1 ORDER BY created_at', [
      member.user.id,
    ]);
    expect(ledger.rows).toHaveLength(2);
    expect(ledger.rows[0]).toMatchObject({ type: 'WITHDRAWAL', amount_cents: '-4000' });
    expect(ledger.rows[1]).toMatchObject({ type: 'WITHDRAWAL_REFUND', amount_cents: '4000' });

    // Pending hold is gone.
    const balances = await request(app).get('/api/wallets').set(auth(member.token));
    expect(balances.body.pendingWithdrawalCents).toBe(0);
  });

  it('rejects withdrawals above the balance, from both wallet types', async () => {
    const member = await register('wd-member3@test.dev');
    await activate(member.user.id);
    await fundWallet(member.user.id, 'COPINEX', 1000);

    const over = await request(app)
      .post('/api/wallets/withdraw')
      .set(auth(member.token))
      .send({ walletType: 'COPINEX', amountCents: 2000 });
    expect(over.status).toBe(400);
    expect(over.body.error).toBe('INSUFFICIENT_FUNDS');

    const empty = await request(app)
      .post('/api/wallets/withdraw')
      .set(auth(member.token))
      .send({ walletType: 'WITHDRAWAL', amountCents: 100 });
    expect(empty.status).toBe(400);
    expect(empty.body.error).toBe('INSUFFICIENT_FUNDS');

    const badWallet = await request(app)
      .post('/api/wallets/withdraw')
      .set(auth(member.token))
      .send({ walletType: 'SAVINGS', amountCents: 100 });
    expect(badWallet.status).toBe(400);
    expect(badWallet.body.error).toBe('VALIDATION_ERROR'); // zod gate rejects before the service
  });

  it('lists withdrawals for admin with user info, filtered by status', async () => {
    const adminReg = await register('wd-admin3@test.dev');
    await makeAdmin(adminReg.user.id);
    const admin = await login('wd-admin3@test.dev');
    const member = await register('wd-member4@test.dev');
    await activate(member.user.id);
    await fundWallet(member.user.id, 'WITHDRAWAL', 10000);

    await request(app)
      .post('/api/wallets/withdraw')
      .set(auth(member.token))
      .send({ walletType: 'WITHDRAWAL', amountCents: 3000 });

    const pending = await request(app).get('/api/admin/wallets/withdrawals?status=PENDING').set(auth(admin.token));
    expect(pending.status).toBe(200);
    expect(pending.body.withdrawals).toHaveLength(1);
    expect(pending.body.withdrawals[0].user.email).toBe('wd-member4@test.dev');
    expect(pending.body.withdrawals[0].request.amountCents).toBe(3000);

    const paid = await request(app).get('/api/admin/wallets/withdrawals?status=PAID').set(auth(admin.token));
    expect(paid.body.withdrawals).toHaveLength(0);
  });
});
