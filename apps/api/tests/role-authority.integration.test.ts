/**
 * Role-authority integration tests (2026-09-27).
 *
 * SUPERADMIN (migration 0009) was added because staff authority was
 * self-service: any ADMIN could PATCH /admin/members/:id with role=ADMIN and
 * mint unlimited peers, and any ADMIN could suspend a fellow admin. These tests
 * pin the new hierarchy:
 *
 *   SUPERADMIN  all of ADMIN's powers + the sole authority over roles
 *   ADMIN       full operations, cannot grant/change/revoke a role, cannot
 *               touch a staff account
 *   MEMBER      no admin access
 *
 * The last two cases cover the subtle one: a role change MUST revoke the
 * target's sessions, because the JWT carries the role. Without that, a demoted
 * admin keeps the ability to mint admins for the remaining 7 days of the token
 * and the new gate is decorative.
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
    notifications, announcements, email_tokens, sessions, role_permissions, permissions
    CASCADE
  `);
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function register(email: string, password = 'password123') {
  const res = await request(app).post('/api/auth/register').send({ email, password });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { token: string; user: { id: string; role: string; email: string } };
}

async function setRole(userId: string, role: 'ADMIN' | 'SUPERADMIN') {
  await pool.query(`UPDATE users SET role = $2 WHERE id = $1`, [userId, role]);
}

/** Re-login so the fresh role is baked into the new token. */
async function login(email: string, password = 'password123') {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token as string;
}

const roleOf = async (userId: string) =>
  (await pool.query(`SELECT role::text FROM users WHERE id = $1`, [userId])).rows[0].role as string;

const activeSessions = async (userId: string) =>
  (await pool.query(
    `SELECT count(*)::int AS n FROM sessions WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  )).rows[0].n as number;

beforeEach(resetDb);
afterAll(() => pool.end());

describe('role hierarchy', () => {
  it('gives ADMIN and SUPERADMIN console access, MEMBER none', async () => {
    const admin = await register('a@t.dev');
    const superAdmin = await register('s@t.dev');
    const member = await register('m@t.dev');
    await setRole(admin.user.id, 'ADMIN');
    await setRole(superAdmin.user.id, 'SUPERADMIN');

    const at = await login('a@t.dev');
    const st = await login('s@t.dev');
    const mt = await login('m@t.dev');

    expect((await request(app).get('/api/admin/overview').set(auth(at))).status).toBe(200);
    expect((await request(app).get('/api/admin/overview').set(auth(st))).status).toBe(200);
    expect((await request(app).get('/api/admin/overview').set(auth(mt))).status).toBe(403);
  });

  it('is not a privilege escalation for ADMIN: granting ADMIN is refused', async () => {
    const admin = await register('a@t.dev');
    const victim = await register('v@t.dev');
    await setRole(admin.user.id, 'ADMIN');

    const res = await request(app)
      .patch(`/api/admin/members/${victim.user.id}`)
      .set(auth(await login('a@t.dev')))
      .send({ role: 'ADMIN' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
    expect(await roleOf(victim.user.id)).toBe('MEMBER');
  });

  it('refuses an ADMIN changing ANY role, including demoting a member', async () => {
    const admin = await register('a@t.dev');
    const target = await register('t@t.dev');
    await setRole(admin.user.id, 'ADMIN');
    const at = await login('a@t.dev');

    const res = await request(app)
      .patch(`/api/admin/members/${target.user.id}`)
      .set(auth(at))
      .send({ role: 'MEMBER' });

    expect(res.status).toBe(403);
  });

  it('refuses an ADMIN editing a staff account, so admins cannot disable each other', async () => {
    const admin = await register('a@t.dev');
    const superAdmin = await register('s@t.dev');
    await setRole(admin.user.id, 'ADMIN');
    await setRole(superAdmin.user.id, 'SUPERADMIN');
    const at = await login('a@t.dev');

    const suspend = await request(app)
      .patch(`/api/admin/members/${superAdmin.user.id}`)
      .set(auth(at))
      .send({ status: 'SUSPENDED' });
    expect(suspend.status).toBe(403);

    const rename = await request(app)
      .patch(`/api/admin/members/${superAdmin.user.id}`)
      .set(auth(at))
      .send({ fullName: 'Owned' });
    expect(rename.status).toBe(403);

    expect((await pool.query(`SELECT status::text FROM users WHERE id = $1`, [superAdmin.user.id]))
      .rows[0].status).toBe('ACTIVE');
  });

  it('still lets an ADMIN do ordinary member management', async () => {
    const admin = await register('a@t.dev');
    const target = await register('t@t.dev');
    await setRole(admin.user.id, 'ADMIN');

    // No `role` in the body, target is a MEMBER -> allowed.
    const renamed = await request(app)
      .patch(`/api/admin/members/${target.user.id}`)
      .set(auth(await login('a@t.dev')))
      .send({ fullName: 'Renamed Member' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.member.fullName).toBe('Renamed Member');

    const suspended = await request(app)
      .patch(`/api/admin/members/${target.user.id}`)
      .set(auth(await login('a@t.dev')))
      .send({ status: 'SUSPENDED' });
    expect(suspended.status).toBe(200);
  });

  it('lets a SUPERADMIN grant and revoke staff roles', async () => {
    const superAdmin = await register('s@t.dev');
    const target = await register('t@t.dev');
    await setRole(superAdmin.user.id, 'SUPERADMIN');
    const st = await login('s@t.dev');

    const promote = await request(app)
      .patch(`/api/admin/members/${target.user.id}`)
      .set(auth(st))
      .send({ role: 'ADMIN' });
    expect(promote.status).toBe(200);
    expect(await roleOf(target.user.id)).toBe('ADMIN');

    const elevate = await request(app)
      .patch(`/api/admin/members/${target.user.id}`)
      .set(auth(await login('s@t.dev')))
      .send({ role: 'SUPERADMIN' });
    expect(elevate.status).toBe(200);
    expect(await roleOf(target.user.id)).toBe('SUPERADMIN');

    const demote = await request(app)
      .patch(`/api/admin/members/${target.user.id}`)
      .set(auth(await login('s@t.dev')))
      .send({ role: 'MEMBER' });
    expect(demote.status).toBe(200);
    expect(await roleOf(target.user.id)).toBe('MEMBER');
  });

  it('revokes the target sessions on a role change, so old authority dies at once', async () => {
    const superAdmin = await register('s@t.dev');
    const target = await register('t@t.dev');
    await setRole(superAdmin.user.id, 'SUPERADMIN');
    await setRole(target.user.id, 'ADMIN');

    // The soon-to-be-demoted admin holds a live ADMIN token.
    const targetToken = await login('t@t.dev');
    expect((await request(app).get('/api/admin/overview').set(auth(targetToken))).status).toBe(200);
    expect(await activeSessions(target.user.id)).toBeGreaterThan(0);

    const res = await request(app)
      .patch(`/api/admin/members/${target.user.id}`)
      .set(auth(await login('s@t.dev')))
      .send({ role: 'MEMBER' });
    expect(res.status).toBe(200);
    expect(await activeSessions(target.user.id)).toBe(0);

    // The pre-demotion token must not still reach the console.
    const after = await request(app).get('/api/admin/overview').set(auth(targetToken));
    expect(after.status).toBe(401);
  });

  it('keeps sessions alive when the update is not a role change', async () => {
    const superAdmin = await register('s@t.dev');
    const target = await register('t@t.dev');
    await setRole(superAdmin.user.id, 'SUPERADMIN');
    const targetToken = await login('t@t.dev');

    await request(app)
      .patch(`/api/admin/members/${target.user.id}`)
      .set(auth(await login('s@t.dev')))
      .send({ fullName: 'Still Fine' });

    expect((await request(app).get('/api/auth/me').set(auth(targetToken))).status).toBe(200);
  });

  it('stops a superadmin from locking themselves out', async () => {
    const superAdmin = await register('s@t.dev');
    await setRole(superAdmin.user.id, 'SUPERADMIN');
    const st = await login('s@t.dev');

    const res = await request(app)
      .patch(`/api/admin/members/${superAdmin.user.id}`)
      .set(auth(st))
      .send({ role: 'ADMIN' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('SELF_DEMOTE');
  });

  it('audits a role change distinctly, recording the previous role', async () => {
    const superAdmin = await register('s@t.dev');
    const target = await register('t@t.dev');
    await setRole(superAdmin.user.id, 'SUPERADMIN');

    await request(app)
      .patch(`/api/admin/members/${target.user.id}`)
      .set(auth(await login('s@t.dev')))
      .send({ role: 'ADMIN' });

    const { rows } = await pool.query(
      `SELECT action, details FROM admin_audit_log WHERE target_id = $1`,
      [target.user.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('MEMBER_ROLE_CHANGE');
    expect(rows[0].details).toMatchObject({ role: 'ADMIN', previousRole: 'MEMBER' });
  });
});
