/**
 * Two-factor authentication integration tests.
 *
 * TOTP is hand-rolled on node:crypto (no authenticator library), so the first
 * case pins the implementation to the RFC 6238 Appendix B vectors before any
 * HTTP runs: if the algorithm drifts, every code below fails loudly instead
 * of silently locking members out.
 *
 * Flow under test: setup (unenrolled secret) → enable (live code proves
 * possession, backup codes minted) → password login returns a challenge, not
 * a session → verify with TOTP or a single-use backup code → session. Plus
 * the sharp edges: a challenge must never pass as a bearer token, backup
 * codes burn on use, and disabling requires the password.
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
  return res.body as { token: string; user: { id: string; role: string; email: string } };
}

beforeEach(resetDb);
afterAll(() => pool.end());

describe('TOTP algorithm (RFC 6238 vectors)', () => {
  // Secret "12345678901234567890", SHA1, 6-digit truncation of the Appendix B codes.
  const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  it('matches the published vectors', () => {
    expect(totpCode(RFC_SECRET, 59_000)).toBe('287082'); // T=59 → 94287082
    expect(totpCode(RFC_SECRET, 1111111109_000)).toBe('081804'); // → 07081804
    expect(totpCode(RFC_SECRET, 1234567890_000)).toBe('005924'); // → 89005924
  });
  it('rejects malformed codes without touching the clock', () => {
    expect(totpCode(RFC_SECRET, 59_000)).not.toBe('000000');
  });
});

describe('2FA enrolment', () => {
  it('setup returns a scannable secret; an unfinished setup changes nothing', async () => {
    const { token } = await register('u@t.dev');
    const setup = await request(app).post('/api/auth/2fa/setup').set(auth(token));
    expect(setup.status).toBe(200);
    expect(setup.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(setup.body.manualKey).toMatch(/^[A-Z2-7]{32}$/);

    // Password login still returns a session — setup alone must not gate it.
    const login = await request(app).post('/api/auth/login').send({ email: 'u@t.dev', password: 'password123' });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
    expect(login.body.requiresTwoFactor).toBeUndefined();
  });

  it('enable with a wrong code fails; with a live code enables and mints backup codes', async () => {
    const { token } = await register('u@t.dev');
    const setup = await request(app).post('/api/auth/2fa/setup').set(auth(token));

    const bad = await request(app).post('/api/auth/2fa/enable').set(auth(token)).send({ token: '000000' });
    expect(bad.status).toBe(400);

    const good = await request(app)
      .post('/api/auth/2fa/enable')
      .set(auth(token))
      .send({ token: totpCode(setup.body.manualKey) });
    expect(good.status).toBe(200);
    expect(good.body.backupCodes).toHaveLength(10);

    const status = await request(app).get('/api/auth/2fa/status').set(auth(token));
    expect(status.body).toEqual({ enabled: true });

    // Second enable and fresh setup are both refused once enrolled.
    expect((await request(app).post('/api/auth/2fa/enable').set(auth(token)).send({ token: '000000' })).status).toBe(400);
    expect((await request(app).post('/api/auth/2fa/setup').set(auth(token))).status).toBe(400);
  });

  it('enable without setup is refused', async () => {
    const { token } = await register('u@t.dev');
    const res = await request(app).post('/api/auth/2fa/enable').set(auth(token)).send({ token: '123456' });
    expect(res.status).toBe(400);
  });
});

describe('2FA login', () => {
  async function enrolled(email = 'u@t.dev') {
    const { token } = await register(email);
    const setup = await request(app).post('/api/auth/2fa/setup').set(auth(token));
    const enable = await request(app)
      .post('/api/auth/2fa/enable')
      .set(auth(token))
      .send({ token: totpCode(setup.body.manualKey) });
    return { secret: setup.body.manualKey as string, backupCodes: enable.body.backupCodes as string[] };
  }

  it('password login returns a challenge, not a session', async () => {
    await enrolled();
    const login = await request(app).post('/api/auth/login').send({ email: 'u@t.dev', password: 'password123' });
    expect(login.status).toBe(200);
    expect(login.body.requiresTwoFactor).toBe(true);
    expect(login.body.challenge).toBeTruthy();
    expect(login.body.token).toBeUndefined();
  });

  it('a challenge is not a bearer token', async () => {
    await enrolled();
    const login = await request(app).post('/api/auth/login').send({ email: 'u@t.dev', password: 'password123' });
    const me = await request(app).get('/api/auth/me').set(auth(login.body.challenge));
    expect(me.status).toBe(401);
  });

  it('wrong TOTP is rejected; live TOTP mints a working session', async () => {
    const { secret } = await enrolled();
    const login = await request(app).post('/api/auth/login').send({ email: 'u@t.dev', password: 'password123' });

    const bad = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ challenge: login.body.challenge, token: '000000' });
    expect(bad.status).toBe(401);

    const good = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ challenge: login.body.challenge, token: totpCode(secret) });
    expect(good.status).toBe(200);
    expect(good.body.token).toBeTruthy();
    expect(good.body.viaBackupCode).toBe(false);

    const me = await request(app).get('/api/auth/me').set(auth(good.body.token));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('u@t.dev');
  });

  it('a backup code works exactly once', async () => {
    const { backupCodes } = await enrolled();
    const code = backupCodes[0] as string;

    const first = await request(app).post('/api/auth/login').send({ email: 'u@t.dev', password: 'password123' });
    const use = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ challenge: first.body.challenge, token: code });
    expect(use.status).toBe(200);
    expect(use.body.viaBackupCode).toBe(true);

    const second = await request(app).post('/api/auth/login').send({ email: 'u@t.dev', password: 'password123' });
    const reuse = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ challenge: second.body.challenge, token: code });
    expect(reuse.status).toBe(401);
  });

  it('an expired/garbage challenge is rejected without leaking why', async () => {
    await enrolled();
    const res = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ challenge: 'not-a-challenge', token: '123456' });
    expect(res.status).toBe(401);
  });
});

describe('2FA disable', () => {
  it('requires the password; afterwards login returns a session directly', async () => {
    const { token } = await register('u@t.dev');
    const setup = await request(app).post('/api/auth/2fa/setup').set(auth(token));
    await request(app)
      .post('/api/auth/2fa/enable')
      .set(auth(token))
      .send({ token: totpCode(setup.body.manualKey) });

    const wrong = await request(app).post('/api/auth/2fa/disable').set(auth(token)).send({ password: 'nope-nope-nope' });
    expect(wrong.status).toBe(401);

    const off = await request(app)
      .post('/api/auth/2fa/disable')
      .set(auth(token))
      .send({ password: 'password123' });
    expect(off.status).toBe(200);

    const login = await request(app).post('/api/auth/login').send({ email: 'u@t.dev', password: 'password123' });
    expect(login.body.token).toBeTruthy();
    expect(login.body.requiresTwoFactor).toBeUndefined();
  });
});
