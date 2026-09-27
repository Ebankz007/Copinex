/**
 * Auth + session security integration tests (2026-09-27).
 *
 * Covers the credential lifecycle end to end: register -> session ->
 * change/reset password -> revocation, plus email-token single-use, account
 * enumeration resistance, notifications, and the admin content/settings/
 * member surfaces introduced with the member console.
 *
 * Two of these tests exist because of real defects found while writing the
 * docs: a password reset used to leave every existing session alive (a stolen
 * token survived a reset for the remaining 7 days of its JWT), and a second
 * reset request did not retire the first link.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createApp } from '../src/app.js';

// Capture the raw token out of the dev email transport. Only the hash is
// persisted, so this is the only way to drive the reset/verify flows.
const sentMail: { to: string; subject: string; text: string }[] = [];
vi.mock('../src/services/email.js', async () => {
  const actual = await vi.importActual<typeof import('../src/services/email.js')>(
    '../src/services/email.js',
  );
  return {
    ...actual,
    sendEmail: async (msg: { to: string; subject: string; text: string }) => {
      sentMail.push(msg);
      return { dev: true, body: msg.text };
    },
  };
});

const app = createApp();
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

// ── Helpers ────────────────────────────────────────────

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

async function register(
  email: string,
  password = 'password123',
): Promise<{ token: string; user: { id: string; role: string; email: string } }> {
  const res = await request(app).post('/api/auth/register').send({ email, password });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

async function login(email: string, password = 'password123') {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token as string;
}

async function makeAdmin(userId: string) {
  await pool.query(`UPDATE users SET role = 'ADMIN' WHERE id = $1`, [userId]);
}

/** Pull the newest link for a purpose out of the captured dev mail. */
function latestToken(subjectMatch: RegExp): string {
  const mail = [...sentMail].reverse().find((m) => subjectMatch.test(m.subject));
  if (!mail) throw new Error('no matching email was sent');
  const match = mail.text.match(/token=([A-Za-z0-9_-]+)/);
  if (!match) throw new Error(`no token in email body: ${mail.text}`);
  return match[1]!;
}

async function activeSessionCount(userId: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM sessions WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
  return rows[0].n as number;
}

// ── Tests ──────────────────────────────────────────────

beforeAll(resetDb);
beforeEach(async () => {
  sentMail.length = 0;
  await resetDb();
});
afterAll(async () => {
  await pool.end();
});

describe('password reset revokes sessions', () => {
  it('kills every existing session when the password is reset (defect fix)', async () => {
    const { user } = await register('victim@test.dev');
    const sessionA = await login('victim@test.dev');
    const sessionB = await login('victim@test.dev');
    expect(await activeSessionCount(user.id)).toBe(3);

    await request(app).post('/api/auth/forgot-password').send({ email: 'victim@test.dev' });
    const token = latestToken(/reset your copinex password/i);

    const reset = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'newpassword456' });
    expect(reset.status).toBe(200);
    expect(reset.body.ok).toBe(true);
    expect(reset.body.sessionsRevoked).toBe(3);
    expect(await activeSessionCount(user.id)).toBe(0);

    // The intruder token is dead immediately, not in 7 days.
    for (const stolen of [sessionA, sessionB]) {
      const probe = await request(app).get('/api/auth/me').set(auth(stolen));
      expect(probe.status).toBe(401);
    }

    // And the new password actually works.
    const fresh = await request(app)
      .post('/api/auth/login')
      .send({ email: 'victim@test.dev', password: 'newpassword456' });
    expect(fresh.status).toBe(200);
    const old = await request(app)
      .post('/api/auth/login')
      .send({ email: 'victim@test.dev', password: 'password123' });
    expect(old.status).toBe(401);
  });

  it('reset token is single-use', async () => {
    await register('once@test.dev');
    await request(app).post('/api/auth/forgot-password').send({ email: 'once@test.dev' });
    const token = latestToken(/reset your copinex password/i);

    const first = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'firstpassword1' });
    expect(first.status).toBe(200);

    const replay = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'secondpassword2' });
    expect(replay.status).toBe(400);
    expect(replay.body.error).toBe('TOKEN_USED');
  });

  it('requesting a new reset retires the previous link (defect fix)', async () => {
    await register('stale@test.dev');
    await request(app).post('/api/auth/forgot-password').send({ email: 'stale@test.dev' });
    const oldToken = latestToken(/reset your copinex password/i);

    await request(app).post('/api/auth/forgot-password').send({ email: 'stale@test.dev' });
    const newToken = latestToken(/reset your copinex password/i);
    expect(newToken).not.toBe(oldToken);

    // The older link in the earlier inbox must be dead.
    const viaOld = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: oldToken, newPassword: 'oldpassword123' });
    expect(viaOld.status).toBe(400);
    expect(viaOld.body.error).toBe('TOKEN_USED');

    const viaNew = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: newToken, newPassword: 'newpassword4567' });
    expect(viaNew.status).toBe(200);
  });

  it('rejects an unknown or malformed token without touching the account', async () => {
    const { user } = await register('intact@test.dev');
    const before = await pool.query('SELECT password_hash FROM users WHERE id = $1', [user.id]);

    for (const token of ['not-a-real-token', '', 'a'.repeat(64)]) {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token, newPassword: 'hijacked12345' });
      expect(res.status).toBe(400);
    }
    const after = await pool.query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
    expect(after.rows[0].password_hash).toBe(before.rows[0].password_hash);
  });

  it('does not reveal whether an account exists', async () => {
    await register('known@test.dev');
    const known = await request(app).post('/api/auth/forgot-password').send({ email: 'known@test.dev' });
    const unknown = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody-here@test.dev' });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
  });
});

describe('change password', () => {
  it('revokes other devices but keeps the caller signed in', async () => {
    const { user } = await register('multi@test.dev');
    const thisDevice = await login('multi@test.dev');
    const otherDevice = await login('multi@test.dev');

    const change = await request(app)
      .post('/api/auth/change-password')
      .set(auth(thisDevice))
      .send({ currentPassword: 'password123', newPassword: 'changedpass99' });
    expect(change.status).toBe(200);
    expect(change.body.sessionsRevoked).toBe(2);
    expect(await activeSessionCount(user.id)).toBe(1);

    expect((await request(app).get('/api/auth/me').set(auth(thisDevice))).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(auth(otherDevice))).status).toBe(401);
  });

  it('requires the correct current password', async () => {
    const token = await (async () => {
      await register('wrongpw@test.dev');
      return login('wrongpw@test.dev');
    })();
    const res = await request(app)
      .post('/api/auth/change-password')
      .set(auth(token))
      .send({ currentPassword: 'not-the-password', newPassword: 'changedpass99' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_PASSWORD');
  });
});

describe('session management', () => {
  it('logout revokes the token immediately, before the JWT expires', async () => {
    const token = await (async () => {
      await register('logout@test.dev');
      return login('logout@test.dev');
    })();
    expect((await request(app).get('/api/auth/me').set(auth(token))).status).toBe(200);

    const out = await request(app).post('/api/auth/logout').set(auth(token));
    expect(out.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(auth(token))).status).toBe(401);
  });

  it('lists sessions and can revoke one device', async () => {
    await register('devices@test.dev');
    const keep = await login('devices@test.dev');
    const drop = await login('devices@test.dev');

    const list = await request(app).get('/api/auth/sessions').set(auth(keep));
    expect(list.status).toBe(200);
    expect(list.body.sessions.length).toBe(3);

    const target = list.body.sessions.find(
      (s: { tokenHash: string }) => s.tokenHash !== list.body.sessions[0].tokenHash,
    );
    const revoke = await request(app)
      .post(`/api/auth/sessions/${target.id}/revoke`)
      .set(auth(keep));
    expect(revoke.status).toBe(200);

    const afterKeep = await request(app).get('/api/auth/me').set(auth(keep));
    expect([200, 401]).toContain(afterKeep.status);
    // Exactly one of the two tokens survives.
    const alive = [
      (await request(app).get('/api/auth/me').set(auth(keep))).status === 200,
      (await request(app).get('/api/auth/me').set(auth(drop))).status === 200,
    ];
    expect(alive.filter(Boolean).length).toBe(1);
  });

  it('refuses unauthenticated access to session and profile routes', async () => {
    for (const path of ['/api/auth/me', '/api/auth/sessions', '/api/auth/notifications']) {
      expect((await request(app).get(path)).status).toBe(401);
    }
    expect((await request(app).patch('/api/auth/profile').send({ fullName: 'x' })).status).toBe(401);
  });
});

describe('email verification', () => {
  it('verifies once, exposes the state, and is idempotent-safe', async () => {
    const { token, user } = await register('verify@test.dev');
    const res = await request(app).get('/api/auth/me').set(auth(token));
    expect(res.body.user.emailVerifiedAt).toBeNull();

    const verifyToken = latestToken(/verify your copinex email/i);
    const verified = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: verifyToken });
    expect(verified.status).toBe(200);
    expect(verified.body.verified).toBe(true);

    const after = await request(app).get('/api/auth/me').set(auth(token));
    expect(after.body.user.emailVerifiedAt).not.toBeNull();

    const row = await pool.query('SELECT email_verified_at FROM users WHERE id = $1', [user.id]);
    expect(row.rows[0].email_verified_at).not.toBeNull();
  });

  it('a resent verification link does not invalidate the one already in the inbox', async () => {
    const { token } = await register('resend@test.dev');

    // /resend-verification is authenticated and re-sends to the caller's own address.
    const resend = await request(app).post('/api/auth/resend-verification').set(auth(token));
    expect(resend.status).toBe(200);
    const firstToken = sentMail.filter((m) => /verify your copinex email/i.test(m.subject)).at(-1)!
      .text.match(/token=([A-Za-z0-9_-]+)/)![1]!;

    const again = await request(app).post('/api/auth/resend-verification').set(auth(token));
    expect(again.status).toBe(200);

    // The earlier link must still work - resending is not a reissue.
    const verified = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: firstToken });
    expect(verified.status).toBe(200);
  });

  it('rejects a garbage verification token', async () => {
    await register('badverify@test.dev');
    const res = await request(app).post('/api/auth/verify-email').send({ token: 'nope-not-a-token' });
    expect(res.status).toBe(400);
  });
});

describe('notifications', () => {
  it('registration greets the member and the list is readable/unread-aware', async () => {
    const { token } = await register('notify@test.dev');
    const list = await request(app).get('/api/auth/notifications').set(auth(token));
    expect(list.status).toBe(200);
    expect(list.body.notifications.length).toBeGreaterThan(0);
    expect(list.body.notifications.some((n: { readAt: string | null }) => n.readAt === null)).toBe(true);

    const readAll = await request(app).post('/api/auth/notifications/read-all').set(auth(token));
    expect(readAll.status).toBe(200);

    const after = await request(app).get('/api/auth/notifications').set(auth(token));
    expect(after.body.notifications.every((n: { readAt: string | null }) => n.readAt !== null)).toBe(true);
  });
});

describe('admin surface', () => {
  async function adminToken(): Promise<{ token: string; id: string }> {
    const { user } = await register('boss@test.dev');
    await makeAdmin(user.id);
    return { token: await login('boss@test.dev'), id: user.id };
  }

  /**
   * A SUPERADMIN caller. Role changes are SUPERADMIN-only (migration 0009), so
   * any test that exercises a `role` write must use one of these rather than an
   * ADMIN — see tests/role-authority.integration.test.ts for the gate itself.
   */
  async function superAdminToken(): Promise<{ token: string; id: string }> {
    const { user } = await register('root@test.dev');
    await pool.query(`UPDATE users SET role = 'SUPERADMIN' WHERE id = $1`, [user.id]);
    return { token: await login('root@test.dev'), id: user.id };
  }

  it('a member cannot reach any admin endpoint', async () => {
    const { token } = await register('nosy@test.dev');
    for (const [method, path] of [
      ['get', '/api/admin/overview'],
      ['get', '/api/admin/members'],
      ['get', '/api/admin/audit'],
      ['get', '/api/admin/settings'],
      ['get', '/api/admin/withdrawals'],
    ] as const) {
      const res = await request(app)[method](path).set(auth(token));
      expect(res.status).toBe(403);
    }
  });

  it('publishing an announcement fans out a notification to every member', async () => {
    const admin = await adminToken();
    const { token: memberToken } = await register('fanout@test.dev');

    const created = await request(app)
      .post('/api/admin/announcements')
      .set(auth(admin.token))
      .send({ title: 'Heads up', body: 'Maintenance at 02:00 UTC.', status: 'PUBLISHED' });
    expect(created.status).toBe(201);

    const list = await request(app).get('/api/auth/notifications').set(auth(memberToken));
    expect(
      list.body.notifications.some((n: { title: string }) => n.title === 'Heads up'),
    ).toBe(true);

    // A draft must NOT notify anyone.
    await request(app)
      .post('/api/admin/announcements')
      .set(auth(admin.token))
      .send({ title: 'Silent draft', body: 'Not yet.', status: 'DRAFT' });
    const after = await request(app).get('/api/auth/notifications').set(auth(memberToken));
    expect(after.body.notifications.some((n: { title: string }) => n.title === 'Silent draft')).toBe(false);
  });

  it('settings round-trip: write, read, delete', async () => {
    const admin = await adminToken();
    const write = await request(app)
      .put('/api/admin/settings/support.email')
      .set(auth(admin.token))
      .send({ value: 'support@copinex.com' });
    expect(write.status).toBe(200);

    const list = await request(app).get('/api/admin/settings').set(auth(admin.token));
    const found = list.body.settings.find((s: { key: string }) => s.key === 'support.email');
    expect(found?.value).toBe('support@copinex.com');

    const del = await request(app)
      .delete('/api/admin/settings/support.email')
      .set(auth(admin.token));
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(true);
  });

  it('member list supports search and activation filtering, and blocks self-demotion', async () => {
    const admin = await adminToken();
    await register('findme@test.dev');
    const target = await register('other@test.dev');

    const found = await request(app)
      .get('/api/admin/members?search=findme')
      .set(auth(admin.token));
    expect(found.status).toBe(200);
    expect(found.body.members).toHaveLength(1);
    expect(found.body.members[0].email).toBe('findme@test.dev');
    // fullName is nullable in the DB; the list must not explode on a null name.
    expect(found.body.members[0].fullName).toBeNull();

    const onlyActive = await request(app)
      .get('/api/admin/members?activated=true')
      .set(auth(admin.token));
    expect(onlyActive.status).toBe(200);
    expect(onlyActive.body.members).toHaveLength(0);

    // A superadmin still cannot demote themself — that is the lockout guard, and
    // it is checked after the authority gate so it only ever fires for a caller
    // who actually holds the power.
    const root = await superAdminToken();
    const selfDemote = await request(app)
      .patch(`/api/admin/members/${root.id}`)
      .set(auth(root.token))
      .send({ role: 'MEMBER' });
    expect(selfDemote.status).toBe(400);
    expect(selfDemote.body.message).toMatch(/cannot demote/i);

    // Editing a member's name works, including clearing it back to null.
    const named = await request(app)
      .patch(`/api/admin/members/${target.user.id}`)
      .set(auth(admin.token))
      .send({ fullName: 'Renamed Person' });
    expect(named.status).toBe(200);
    expect(named.body.member.fullName).toBe('Renamed Person');

    const cleared = await request(app)
      .patch(`/api/admin/members/${target.user.id}`)
      .set(auth(admin.token))
      .send({ fullName: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.member.fullName).toBeNull();
  });

  it('every mutating admin action is audited', async () => {
    const admin = await adminToken();
    await request(app)
      .put('/api/admin/settings/audit.probe')
      .set(auth(admin.token))
      .send({ value: '1' });
    await request(app)
      .post('/api/admin/announcements')
      .set(auth(admin.token))
      .send({ title: 'Audited', body: 'x', status: 'DRAFT' });

    const audit = await request(app).get('/api/admin/audit').set(auth(admin.token));
    expect(audit.status).toBe(200);
    const actions = audit.body.entries.map((e: { action: string }) => e.action);
    expect(actions).toContain('SETTING_UPDATE');
    expect(actions).toContain('ANNOUNCEMENT_CREATE');
  });
});
