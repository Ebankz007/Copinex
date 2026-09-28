/**
 * Login lockout integration tests.
 *
 * The shared IP rate limiter cannot stop a botnet, so failed passwords (and
 * failed second factors) count per account: five consecutive failures lock
 * the account on an exponential backoff (5/10/20/40/60 min cap), and any
 * successful login resets the counter. The lock message names a retry time
 * instead of failing silently.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createApp } from '../src/app.js';
import { backoffMinutes } from '../src/services/login-lockout.js';
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

const failCount = async (email: string) =>
  (await pool.query(`SELECT failed_login_attempts AS n FROM users WHERE email = $1`, [email])).rows[0].n as number;

beforeEach(resetDb);
afterAll(() => pool.end());

describe('backoff schedule', () => {
  it('5/10/20/40 then capped at 60 minutes', () => {
    expect(backoffMinutes(5)).toBe(5);
    expect(backoffMinutes(6)).toBe(10);
    expect(backoffMinutes(7)).toBe(20);
    expect(backoffMinutes(8)).toBe(40);
    expect(backoffMinutes(9)).toBe(60);
    expect(backoffMinutes(50)).toBe(60);
  });
});

describe('password lockout', () => {
  it('four failures are 401s, the fifth locks, the right password stays locked', async () => {
    await register('u@t.dev');
    for (let i = 0; i < 4; i++) {
      const r = await request(app).post('/api/auth/login').send({ email: 'u@t.dev', password: 'wrong' });
      expect(r.status).toBe(401);
      expect(r.body.error).toBe('INVALID_CREDENTIALS');
    }
    const fifth = await request(app).post('/api/auth/login').send({ email: 'u@t.dev', password: 'wrong' });
    expect(fifth.status).toBe(423);
    expect(fifth.body.error).toBe('ACCOUNT_LOCKED');

    const right = await request(app).post('/api/auth/login').send({ email: 'u@t.dev', password: 'password123' });
    expect(right.status).toBe(423);
    expect(await failCount('u@t.dev')).toBe(5);
  });

  it('a success resets the counter', async () => {
    await register('u@t.dev');
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/auth/login').send({ email: 'u@t.dev', password: 'wrong' });
    }
    expect(await failCount('u@t.dev')).toBe(3);
    const ok = await request(app).post('/api/auth/login').send({ email: 'u@t.dev', password: 'password123' });
    expect(ok.status).toBe(200);
    expect(await failCount('u@t.dev')).toBe(0);
    // Four more failures are still 401s — the slate was wiped, not paused.
    for (let i = 0; i < 4; i++) {
      const r = await request(app).post('/api/auth/login').send({ email: 'u@t.dev', password: 'wrong' });
      expect(r.status).toBe(401);
    }
    expect(await failCount('u@t.dev')).toBe(4);
  });

  it('the lock lifts after expiry', async () => {
    await register('u@t.dev');
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login').send({ email: 'u@t.dev', password: 'wrong' });
    }
    await pool.query(`UPDATE users SET locked_until = now() - interval '1 minute' WHERE email = 'u@t.dev'`);
    const ok = await request(app).post('/api/auth/login').send({ email: 'u@t.dev', password: 'password123' });
    expect(ok.status).toBe(200);
    expect(await failCount('u@t.dev')).toBe(0);
  });

  it('unknown addresses stay a plain 401 with no counter to poison', async () => {
    const r = await request(app).post('/api/auth/login').send({ email: 'ghost@t.dev', password: 'wrong' });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('INVALID_CREDENTIALS');
  });
});

describe('second-factor failures count too', () => {
  it('five wrong codes lock the account; the right code stays locked', async () => {
    const { token } = await register('u@t.dev');
    const setup = await request(app).post('/api/auth/2fa/setup').set(auth(token));
    await request(app)
      .post('/api/auth/2fa/enable')
      .set(auth(token))
      .send({ token: totpCode(setup.body.manualKey) });

    const login = await request(app).post('/api/auth/login').send({ email: 'u@t.dev', password: 'password123' });
    for (let i = 0; i < 4; i++) {
      const r = await request(app)
        .post('/api/auth/2fa/verify')
        .send({ challenge: login.body.challenge, token: '000000' });
      expect(r.status).toBe(401);
    }
    const fifth = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ challenge: login.body.challenge, token: '000000' });
    expect(fifth.status).toBe(423);

    const right = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ challenge: login.body.challenge, token: totpCode(setup.body.manualKey) });
    expect(right.status).toBe(423);
  });
});
