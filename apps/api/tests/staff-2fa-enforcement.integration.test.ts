/**
 * Staff 2FA-enforcement integration tests.
 *
 * Opt-in 2FA is decoration on the highest-value accounts unless login
 * requires it. Since enforcement day zero, staff (ADMIN/SUPERADMIN) without
 * an enrolled second factor get no session at all — only a 15-minute
 * enrolment challenge that authorises the setup/enable endpoints and nothing
 * else. Members are unaffected.
 *
 * Blocking outright would deadlock (nobody enrolled could ever enrol), so
 * the password login itself is the enrolment gate, and proving possession
 * mints the first session directly.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createApp } from '../src/app.js';
import { totpCode } from '../src/lib/totp.js';

const app = createApp();
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

async function resetDb() {
  await pool.query(`
    TRUNCATE TABLE pamm_connections, brokers,
    investment_commissions, investment_earnings, investments,
    investment_packages, ledger_entries, wallets, users, registrations, fee_allocations,
    bonus_payouts, rank_milestones, leadership_rewards, team_volume, trading_settlements,
    withdrawal_requests, admin_audit_log, pools, config,
    notifications, announcements, email_tokens, sessions, role_permissions, permissions,
    two_factor_backup_codes
    CASCADE
  `);
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function register(email: string, password = 'password123') {
  const res = await request(app).post('/api/auth/register').send({ email, password });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { token: string; user: { id: string } };
}

async function setRole(userId: string, role: 'ADMIN' | 'SUPERADMIN' | 'MEMBER') {
  await pool.query(`UPDATE users SET role = $2 WHERE id = $1`, [userId, role]);
}

beforeEach(resetDb);
afterAll(() => pool.end());

describe('staff enrolment gate', () => {
  it('unenrolled staff get an enrolment challenge, not a session; members are unaffected', async () => {
    const admin = await register('a@t.dev');
    const member = await register('m@t.dev');
    await setRole(admin.user.id, 'ADMIN');

    const al = await request(app).post('/api/auth/login').send({ email: 'a@t.dev', password: 'password123' });
    expect(al.status).toBe(200);
    expect(al.body.requiresEnrollment).toBe(true);
    expect(al.body.challenge).toBeTruthy();
    expect(al.body.token).toBeUndefined();

    const ml = await request(app).post('/api/auth/login').send({ email: 'm@t.dev', password: 'password123' });
    expect(ml.body.token).toBeTruthy();
    expect(ml.body.requiresEnrollment).toBeUndefined();
  });

  it('the enrolment challenge opens setup+enable and nothing else', async () => {
    const admin = await register('a@t.dev');
    await setRole(admin.user.id, 'ADMIN');
    const al = await request(app).post('/api/auth/login').send({ email: 'a@t.dev', password: 'password123' });
    const challenge = al.body.challenge as string;

    // Forbidden surfaces stay forbidden.
    expect((await request(app).get('/api/auth/me').set(auth(challenge))).status).toBe(401);
    expect((await request(app).get('/api/admin/overview').set(auth(challenge))).status).toBe(401);

    // The gate it does open.
    const setup = await request(app).post('/api/auth/2fa/setup').set(auth(challenge));
    expect(setup.status).toBe(200);
    expect(setup.body.manualKey).toBeTruthy();
  });

  it('proving possession mints the first session; the next login takes the 2FA path', async () => {
    const admin = await register('a@t.dev');
    await setRole(admin.user.id, 'ADMIN');
    const al = await request(app).post('/api/auth/login').send({ email: 'a@t.dev', password: 'password123' });

    const setup = await request(app).post('/api/auth/2fa/setup').set(auth(al.body.challenge));
    const enable = await request(app)
      .post('/api/auth/2fa/enable')
      .set(auth(al.body.challenge))
      .send({ token: totpCode(setup.body.manualKey) });
    expect(enable.status).toBe(200);
    expect(enable.body.backupCodes).toHaveLength(10);
    // No second round-trip: the enrolment path returns a working session.
    expect(enable.body.token).toBeTruthy();
    const me = await request(app).get('/api/auth/me').set(auth(enable.body.token));
    expect(me.status).toBe(200);

    // Enrolled now: password earns the 5-minute 2FA challenge, not enrolment.
    const again = await request(app).post('/api/auth/login').send({ email: 'a@t.dev', password: 'password123' });
    expect(again.body.requiresTwoFactor).toBe(true);
    expect(again.body.requiresEnrollment).toBeUndefined();
  });

  it('applies to SUPERADMIN identically', async () => {
    const s = await register('s@t.dev');
    await setRole(s.user.id, 'SUPERADMIN');
    const login = await request(app).post('/api/auth/login').send({ email: 's@t.dev', password: 'password123' });
    expect(login.body.requiresEnrollment).toBe(true);
    expect(login.body.token).toBeUndefined();
  });
});
