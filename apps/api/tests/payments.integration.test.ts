/**
 * Q4 payments integration tests (2026-09-26): Pay2Crypto crypto rail.
 *
 * Collection rail: ACTIVATION ($50 fee â†’ membership unlock) and DEPOSIT
 * (â†’ COPINEX wallet credit). The webhook is the money-confirming event â€”
 * secret-gated, idempotent, ref/amount-verified. Mock mode (no merchant
 * credentials in tests) returns synthetic checkout URLs.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createApp } from '../src/app.js';
import { loginWithEnrollment } from './helpers.js';
import { buildPaymentRequestBody, parsePaymentRequestResponse } from '../src/services/payment-service.js';

const app = createApp();
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const WEBHOOK_SECRET = process.env.PAY2CRYPTO_WEBHOOK_SECRET!;

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function resetDb() {
  await pool.query(`
    TRUNCATE TABLE pamm_connections, brokers,
    investment_commissions, investment_earnings, investments,
    investment_packages, ledger_entries, wallets, users, registrations, fee_allocations,
    bonus_payouts, rank_milestones, leadership_rewards, team_volume, trading_settlements,
    withdrawal_requests, admin_audit_log, payments, pools, config CASCADE
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

async function getWallet(userId: string, walletType: string): Promise<number> {
  const res = await pool.query(
    'SELECT balance_cents FROM wallets WHERE user_id = $1 AND wallet_type = $2',
    [userId, walletType],
  );
  return res.rows[0] ? Number(res.rows[0].balance_cents) : 0;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const webhook = (body: unknown, secret = WEBHOOK_SECRET) => ({
  ...(secret ? { 'x-pay2crypto-secret': secret } : {}),
});

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

describe('Q4 crypto payments â€” invoices', () => {
  it('unactivated member creates the $50 ACTIVATION invoice (mock checkout URL)', async () => {
    const member = await register('inv@test.dev');

    const res = await request(app)
      .post('/api/payments/activate')
      .set(auth(member.token))
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.payment.purpose).toBe('ACTIVATION');
    expect(res.body.payment.amountCents).toBe(5000);
    expect(res.body.payment.status).toBe('PENDING');
    expect(res.body.payment.paymentRef).toMatch(/^COP-/);
    expect(res.body.payment.paymentUrl).toContain('checkout.pay2crypto.com');
    expect(res.body.payment.gatewayTxid).toMatch(/^mock-/);
  });

  it('activated member creates a DEPOSIT invoice with a chosen amount', async () => {
    const member = await register('dep@test.dev');
    await pool.query(`UPDATE users SET membership_activated = true, activated_at = now() WHERE id = $1`, [member.user.id]);

    const res = await request(app)
      .post('/api/payments/deposit')
      .set(auth(member.token))
      .send({ amountCents: 25000 });
    expect(res.status).toBe(201);
    expect(res.body.payment.purpose).toBe('DEPOSIT');
    expect(res.body.payment.amountCents).toBe(25000);
    expect(res.body.payment.status).toBe('PENDING');
  });

  it('invalid deposit amount â†’ 400; unactivated deposit â†’ 403; double activation â†’ 409', async () => {
    const member = await register('guard@test.dev');

    // Invalid amount on an ACTIVATED member â†’ zod 400 (the 403 gate would mask it otherwise).
    const activated = await register('guard-active@test.dev');
    await pool.query(`UPDATE users SET membership_activated = true, activated_at = now() WHERE id = $1`, [activated.user.id]);
    const bad = await request(app)
      .post('/api/payments/deposit')
      .set(auth(activated.token))
      .send({ amountCents: -5 });
    expect(bad.status).toBe(400);

    const unactivatedDeposit = await request(app)
      .post('/api/payments/deposit')
      .set(auth(member.token))
      .send({ amountCents: 10000 });
    expect(unactivatedDeposit.status).toBe(403);
    expect(unactivatedDeposit.body.error).toBe('MEMBERSHIP_NOT_ACTIVATED');

    await request(app).post('/api/payments/activate').set(auth(member.token)).send({});
    const again = await request(app).post('/api/payments/activate').set(auth(member.token)).send({});
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('PENDING_PAYMENT_EXISTS');
  });

  it('GET /payments lists the memberâ€™s own payments, newest first', async () => {
    const member = await register('list@test.dev');
    await request(app).post('/api/payments/activate').set(auth(member.token)).send({});

    const res = await request(app).get('/api/payments').set(auth(member.token));
    expect(res.status).toBe(200);
    expect(res.body.payments).toHaveLength(1);
    expect(res.body.payments[0].purpose).toBe('ACTIVATION');
  });
});

describe('Q4 crypto payments — live request contract', () => {
  // Pins the exact POST /v1/payment-requests body from the merchant
  // integration snippet (2026-09-28): amount is a 2-decimal STRING, asset
  // USDT, network trc20. If Pay2Crypto renames a field, this fails first —
  // not a live member's checkout.
  it('builds the ACTIVATION body ($50.00 as a string)', () => {
    expect(
      buildPaymentRequestBody({
        paymentRef: 'COP-abc',
        amountCents: 5000,
        purpose: 'ACTIVATION',
        returnUrl: 'http://localhost:3000/wallet',
      }),
    ).toEqual({
      amount: '50.00',
      asset: 'USDT',
      network: 'trc20',
      reference: 'COP-abc',
      description: 'Copinex membership activation — $50.00',
      return_url: 'http://localhost:3000/wallet',
    });
  });

  it('builds the DEPOSIT body with exact cent formatting', () => {
    const body = buildPaymentRequestBody({
      paymentRef: 'COP-xyz',
      amountCents: 4999,
      purpose: 'DEPOSIT',
      returnUrl: 'http://localhost:3000/wallet',
    });
    expect(body.amount).toBe('49.99');
    expect(body.asset).toBe('USDT');
    expect(body.network).toBe('trc20');
    expect(body.description).toBe('Copinex wallet deposit — $49.99');
  });

  it('parses the real sandbox success body (verified live 2026-10-01)', () => {
    // Shape captured from a live 201 against the test key — gateway id is
    // `token`, the checkout link is `checkout_url`, amounts echo as strings.
    // Values below are redacted stand-ins; the SHAPE is the assertion.
    expect(
      parsePaymentRequestResponse({
        token: 'aa11bb22cc33',
        status: 'pending',
        settlement: null,
        amount: '1',
        asset: 'USDT',
        network: 'trc20',
        network_mode: 'fixed',
        mode: 'test',
        pay_address: 'TXXXredacted',
        reference: 'COP-CONTRACT-TEST-002',
        description: 'Copinex contract verification (test, unpaid)',
        checkout_url: 'https://checkout.pay2crypto.com/aa11bb22cc33',
        submitted_hash: null,
        expires_at: '2026-10-01T20:22:21+00:00',
        created_at: '2026-10-01T19:22:21+00:00',
        paid_at: null,
      }),
    ).toEqual({
      paymentUrl: 'https://checkout.pay2crypto.com/aa11bb22cc33',
      gatewayTxid: 'aa11bb22cc33',
    });
  });

  it('rejects bodies with no payable URL', () => {
    const err = (body: unknown) => {
      try {
        parsePaymentRequestResponse(body);
      } catch (e) {
        return e as { code?: string };
      }
      throw new Error('did not throw');
    };
    expect(err({ success: true }).code).toBe('PAYMENT_GATEWAY_ERROR');
    expect(err({ success: false, checkout_url: 'https://x' }).code).toBe('PAYMENT_GATEWAY_ERROR');
  });
});

describe('Q4 crypto payments â€” webhook', () => {
  it('ACTIVATION webhook activates the membership and flips registration to PAID', async () => {
    const member = await register('web-act@test.dev');
    const created = await request(app).post('/api/payments/activate').set(auth(member.token)).send({});
    const paymentRef = created.body.payment.paymentRef as string;

    const res = await request(app)
      .post('/api/webhooks/pay2crypto')
      .set(webhook({}))
      .send({
        payment_ref: paymentRef,
        payment_amount: 50,
        tx_hash: '0xabc123',
        status: 'confirmed',
      });
    expect(res.status).toBe(200);
    expect(res.body.applied).toBe(true);
    expect(res.body.purpose).toBe('ACTIVATION');

    const me = await request(app).get('/api/auth/me').set(auth(member.token));
    expect(me.body.user.membershipActivated).toBe(true);
    expect(me.body.user.activatedAt).toBeTruthy();

    const reg = await pool.query('SELECT status FROM registrations WHERE user_id = $1', [member.user.id]);
    expect(reg.rows[0].status).toBe('PAID');

    const payment = await pool.query('SELECT status, tx_hash FROM payments WHERE payment_ref = $1', [paymentRef]);
    expect(payment.rows[0].status).toBe('PAID');
    expect(payment.rows[0].tx_hash).toBe('0xabc123');

    // Gates open on the same token (DB lookup, not JWT).
    await fundWallet(member.user.id, 'COPINEX', 100000);
    const invest = await request(app)
      .post('/api/investments')
      .set(auth(member.token))
      .send({ amountCents: 10000 });
    expect(invest.status).toBe(201);
  });

  it('DEPOSIT webhook credits the COPINEX wallet with a ledger entry', async () => {
    const member = await register('web-dep@test.dev');
    await pool.query(`UPDATE users SET membership_activated = true, activated_at = now() WHERE id = $1`, [member.user.id]);
    const created = await request(app)
      .post('/api/payments/deposit')
      .set(auth(member.token))
      .send({ amountCents: 100000 });
    const paymentRef = created.body.payment.paymentRef as string;

    const res = await request(app)
      .post('/api/webhooks/pay2crypto')
      .set(webhook({}))
      .send({ payment_ref: paymentRef, payment_amount: 1000, status: 'confirmed' });
    expect(res.status).toBe(200);
    expect(res.body.applied).toBe(true);
    expect(res.body.purpose).toBe('DEPOSIT');

    expect(await getWallet(member.user.id, 'COPINEX')).toBe(100000);

    const ledger = await pool.query(
      'SELECT type, source_type, amount_cents FROM ledger_entries WHERE user_id = $1',
      [member.user.id],
    );
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0].type).toBe('DEPOSIT');
    expect(ledger.rows[0].source_type).toBe('crypto_payment');
    expect(Number(ledger.rows[0].amount_cents)).toBe(100000);
  });

  it('webhook is idempotent â€” a repeat confirmation does not double-credit', async () => {
    const member = await register('web-idem@test.dev');
    await pool.query(`UPDATE users SET membership_activated = true, activated_at = now() WHERE id = $1`, [member.user.id]);
    const created = await request(app)
      .post('/api/payments/deposit')
      .set(auth(member.token))
      .send({ amountCents: 50000 });
    const paymentRef = created.body.payment.paymentRef as string;

    const body = { payment_ref: paymentRef, payment_amount: 500, status: 'confirmed' };
    const first = await request(app).post('/api/webhooks/pay2crypto').set(webhook({})).send(body);
    expect(first.body.applied).toBe(true);

    const second = await request(app).post('/api/webhooks/pay2crypto').set(webhook({})).send(body);
    expect(second.status).toBe(200);
    expect(second.body.applied).toBe(false);
    expect(second.body.reason).toBe('already paid');

    expect(await getWallet(member.user.id, 'COPINEX')).toBe(50000);
  });

  it('non-final status (broadcast) is acknowledged but not applied', async () => {
    const member = await register('web-bcast@test.dev');
    const created = await request(app).post('/api/payments/activate').set(auth(member.token)).send({});
    const paymentRef = created.body.payment.paymentRef as string;

    const res = await request(app)
      .post('/api/webhooks/pay2crypto')
      .set(webhook({}))
      .send({ payment_ref: paymentRef, status: 'broadcast' });
    expect(res.status).toBe(200);
    expect(res.body.applied).toBe(false);

    const payment = await pool.query('SELECT status FROM payments WHERE payment_ref = $1', [paymentRef]);
    expect(payment.rows[0].status).toBe('PENDING');
  });

  it('string amounts verify like numbers (sandbox echoes "50", not 50)', async () => {
    const member = await register('web-str@test.dev');
    const created = await request(app).post('/api/payments/activate').set(auth(member.token)).send({});
    const paymentRef = created.body.payment.paymentRef as string;

    // Correct string amount applies.
    const good = await request(app)
      .post('/api/webhooks/pay2crypto')
      .set(webhook({}))
      .send({ payment_ref: paymentRef, payment_amount: '50', status: 'confirmed' });
    expect(good.status).toBe(200);
    expect(good.body.applied).toBe(true);

    // Wrong string amount is rejected, nothing applied.
    const member2 = await register('web-str2@test.dev');
    const created2 = await request(app).post('/api/payments/activate').set(auth(member2.token)).send({});
    const ref2 = created2.body.payment.paymentRef as string;
    const bad = await request(app)
      .post('/api/webhooks/pay2crypto')
      .set(webhook({}))
      .send({ payment_ref: ref2, payment_amount: '49.99', status: 'confirmed' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('AMOUNT_MISMATCH');
  });
});

describe('Q4 crypto payments â€” webhook forgery protection', () => {
  it('wrong or missing secret â†’ 401', async () => {
    const member = await register('forgery@test.dev');
    const created = await request(app).post('/api/payments/activate').set(auth(member.token)).send({});
    const paymentRef = created.body.payment.paymentRef as string;

    const wrong = await request(app)
      .post('/api/webhooks/pay2crypto')
      .set(webhook({}, 'wrong-secret'))
      .send({ payment_ref: paymentRef, status: 'confirmed' });
    expect(wrong.status).toBe(401);

    const missing = await request(app)
      .post('/api/webhooks/pay2crypto')
      .set(webhook({}, ''))
      .send({ payment_ref: paymentRef, status: 'confirmed' });
    expect(missing.status).toBe(401);
  });

  it('unknown payment_ref â†’ 404', async () => {
    const res = await request(app)
      .post('/api/webhooks/pay2crypto')
      .set(webhook({}))
      .send({ payment_ref: 'COP-does-not-exist', status: 'confirmed' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('amount mismatch â†’ 400 and nothing is applied', async () => {
    const member = await register('web-amt@test.dev');
    const created = await request(app).post('/api/payments/activate').set(auth(member.token)).send({});
    const paymentRef = created.body.payment.paymentRef as string;

    const res = await request(app)
      .post('/api/webhooks/pay2crypto')
      .set(webhook({}))
      .send({ payment_ref: paymentRef, payment_amount: 10, status: 'confirmed' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('AMOUNT_MISMATCH');

    const me = await request(app).get('/api/auth/me').set(auth(member.token));
    expect(me.body.user.membershipActivated).toBe(false);
  });
});

describe('Q4 crypto payments â€” withdrawal payout txid', () => {
  it('admin approval records the on-chain payout txid', async () => {
    const member = await register('payout@test.dev');
    await pool.query(`UPDATE users SET membership_activated = true, activated_at = now() WHERE id = $1`, [member.user.id]);
    await fundWallet(member.user.id, 'COPINEX', 20000);

    const wd = await request(app)
      .post('/api/wallets/withdraw')
      .set(auth(member.token))
      .send({ walletType: 'COPINEX', amountCents: 10000 });
    expect(wd.status).toBe(201);
    const requestId = wd.body.request.id as string;

    const adminUser = await register('payout-admin@test.dev');
    await makeAdmin(adminUser.user.id);
    const { token: adminToken } = await loginWithEnrollment(app, 'payout-admin@test.dev');

    const approve = await request(app)
      .post(`/api/admin/wallets/withdrawals/${requestId}/approve`)
      .set(auth(adminToken))
      .send({ payoutTxid: '0xTXID1234567890abcdef' });
    expect(approve.status).toBe(200);
    expect(approve.body.request.status).toBe('PAID');
    expect(approve.body.request.payoutTxid).toBe('0xTXID1234567890abcdef');

    const row = await pool.query('SELECT payout_txid FROM withdrawal_requests WHERE id = $1', [requestId]);
    expect(row.rows[0].payout_txid).toBe('0xTXID1234567890abcdef');
  });
});
