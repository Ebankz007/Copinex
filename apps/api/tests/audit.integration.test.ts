/**
 * Admin audit trail (R27) integration tests.
 *
 * Every mutating admin action writes an append-only row (admin id, action,
 * target, request snapshot, ip). The trail is admin-readable via GET /admin/audit.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createApp } from '../src/app.js';

const app = createApp();
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

async function resetDb() {
  await pool.query(`
    TRUNCATE TABLE pamm_connections, brokers,
    investment_commissions, investment_earnings, investments,
    investment_packages, ledger_entries, wallets, users, registrations, fee_allocations,
    bonus_payouts, rank_milestones, leadership_rewards, team_volume, trading_settlements,
    withdrawal_requests, admin_audit_log, pools, config CASCADE
  `);
}

async function register(
  email: string,
): Promise<{ token: string; user: { id: string; role: string } }> {
  const res = await request(app).post('/api/auth/register').send({ email, password: 'password123' });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

async function makeAdmin(userId: string) {
  await pool.query(`UPDATE users SET role = 'ADMIN' WHERE id = $1`, [userId]);
}

/** The registration token carries role MEMBER - re-login after makeAdmin to get an ADMIN token. */
async function login(email: string): Promise<{ token: string }> {
  const res = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

/** Register, promote to ADMIN, and return a fresh ADMIN token. */
async function registerAdmin(email: string): Promise<{ token: string; user: { id: string } }> {
  const reg = await register(email);
  await makeAdmin(reg.user.id);
  const loginRes = await login(email);
  return { token: loginRes.token, user: reg.user };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function auditCount(): Promise<number> {
  const res = await pool.query('SELECT COUNT(*)::int AS n FROM admin_audit_log');
  return res.rows[0].n;
}

beforeAll(async () => {
  await resetDb();
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await pool.end();
});

describe('admin audit trail', () => {
  it('records MEMBER_ACTIVATE with admin id, target id and ip', async () => {
    const member = await register('member@test.dev');
    const admin = await registerAdmin('admin@test.dev');

    const res = await request(app)
      .post(`/api/admin/members/${member.user.id}/activate`)
      .set(auth(admin.token));
    expect(res.status).toBe(200);

    const rows = await pool.query(
      'SELECT action, target_type, target_id, admin_id, ip FROM admin_audit_log',
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0]).toMatchObject({
      action: 'MEMBER_ACTIVATE',
      target_type: 'member',
      target_id: member.user.id,
      admin_id: admin.user.id,
      ip: '::ffff:127.0.0.1',
    });
  });

  it('records WALLET_DEPOSIT with the request snapshot in details', async () => {
    const member = await register('member@test.dev');
    const admin = await registerAdmin('admin@test.dev');

    const res = await request(app)
      .post('/api/admin/wallets/deposit')
      .set(auth(admin.token))
      .send({ userId: member.user.id, amountCents: 5000, note: 'activation fee' });
    expect(res.status).toBe(201);

    const rows = await pool.query(
      "SELECT action, target_id, details FROM admin_audit_log WHERE action = 'WALLET_DEPOSIT'",
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].target_id).toBe(member.user.id);
    expect(rows.rows[0].details).toEqual({ amountCents: 5000, note: 'activation fee' });
  });

  it('records BROKER_CREATE and BROKER_DEACTIVATE', async () => {
    const admin = await registerAdmin('admin@test.dev');

    const created = await request(app)
      .post('/api/admin/brokers')
      .set(auth(admin.token))
      .send({ name: 'Test Broker', code: 'TB', pammLink: 'https://example.com/pamm' });
    expect(created.status).toBe(201);

    const deleted = await request(app)
      .delete(`/api/admin/brokers/${created.body.broker.id}`)
      .set(auth(admin.token));
    expect(deleted.status).toBe(200);

    const rows = await pool.query(
      'SELECT action, target_type, target_id FROM admin_audit_log ORDER BY created_at',
    );
    expect(rows.rowCount).toBe(2);
    expect(rows.rows[0].action).toBe('BROKER_CREATE');
    expect(rows.rows[1].action).toBe('BROKER_DEACTIVATE');
    expect(rows.rows[1].target_id).toBe(created.body.broker.id);
  });

  it('exposes the trail to admins, newest first, with the admin email joined', async () => {
    const member = await register('member@test.dev');
    const admin = await registerAdmin('admin@test.dev');

    await request(app)
      .post(`/api/admin/members/${member.user.id}/activate`)
      .set(auth(admin.token));
    await request(app)
      .post('/api/admin/wallets/deposit')
      .set(auth(admin.token))
      .send({ userId: member.user.id, amountCents: 1000 });

    const res = await request(app).get('/api/admin/audit').set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(2);
    // Newest first: the deposit happened after the activation.
    expect(res.body.entries[0].action).toBe('WALLET_DEPOSIT');
    expect(res.body.entries[1].action).toBe('MEMBER_ACTIVATE');
    expect(res.body.entries[0].adminEmail).toBe('admin@test.dev');
  });

  it('rejects non-admins with 403', async () => {
    const member = await register('member@test.dev');
    const res = await request(app).get('/api/admin/audit').set(auth(member.token));
    expect(res.status).toBe(403);
  });

  it('does not write an audit row for a failed action', async () => {
    const admin = await registerAdmin('admin@test.dev');

    // Activating a nonexistent member fails â€” nothing must be logged.
    const res = await request(app)
      .post('/api/admin/members/00000000-0000-0000-0000-000000000000/activate')
      .set(auth(admin.token));
    expect(res.status).toBe(404);
    expect(await auditCount()).toBe(0);
  });
});
