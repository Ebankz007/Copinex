/**
 * httpOnly session-cookie integration tests.
 *
 * The token must never be readable from JavaScript: login/register/verify
 * issue it as an httpOnly, SameSite=Strict cookie, the readable presence
 * flag carries no authority, and logout drops both cookies while revoking
 * the session. Bearer tokens keep working (tests, tooling, non-browser
 * clients) — the cookie is the browser path, not the only path.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
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
    withdrawal_requests, admin_audit_log, pools, config,
    notifications, announcements, email_tokens, sessions, role_permissions, permissions,
    two_factor_backup_codes
    CASCADE
  `);
}

beforeEach(resetDb);
afterAll(() => pool.end());

function setCookies(res: { headers: Record<string, string | string[]> }): string[] {
  const raw = res.headers['set-cookie'];
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}

describe('session cookies', () => {
  it('login issues an httpOnly SameSite=Strict session cookie plus a readable flag', async () => {
    await request(app).post('/api/auth/register').send({ email: 'u@t.dev', password: 'password123' });
    const login = await request(app).post('/api/auth/login').send({ email: 'u@t.dev', password: 'password123' });
    expect(login.status).toBe(200);

    const cookies = setCookies(login);
    const session = cookies.find((c) => c.startsWith('copinex_token='));
    expect(session).toBeTruthy();
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Strict/i);
    expect(session).not.toMatch(/Secure/i); // Secure is production-only (http dev)

    const flag = cookies.find((c) => c.startsWith('copinex_authed='));
    expect(flag).toBeTruthy();
    expect(flag).not.toMatch(/HttpOnly/i);
  });

  it('the cookie alone authenticates; no Authorization header needed', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'u@t.dev', password: 'password123' });
    await agent.post('/api/auth/login').send({ email: 'u@t.dev', password: 'password123' });
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('u@t.dev');
  });

  it('logout over the cookie revokes the session and drops both cookies', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'u@t.dev', password: 'password123' });
    const login = await agent.post('/api/auth/login').send({ email: 'u@t.dev', password: 'password123' });
    const bodyToken = login.body.token as string;

    const out = await agent.post('/api/auth/logout');
    expect(out.status).toBe(200);
    const cleared = setCookies(out).filter((c) => /copinex_(token|authed)=;/.test(c));
    expect(cleared.length).toBe(2);

    // The session is dead server-side: even the body token from login 401s.
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${bodyToken}`);
    expect(me.status).toBe(401);
  });

  it('a forged cookie authenticates nothing', async () => {
    const me = await request(app).get('/api/auth/me').set('Cookie', 'copinex_token=forged-token-value');
    expect(me.status).toBe(401);
  });
});
