/**
 * PAMM Service integration tests — broker directory (admin CRUD) and
 * connection requests (client select → request → redirect link).
 *
 * Flow under test: admin adds brokers → client sees the active list →
 * client submits a connection request → gets the broker's private PAMM
 * link; admin can remove a broker from the client-facing list (soft
 * deactivate, history preserved).
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
}

async function register(
  email: string,
): Promise<{ token: string; user: { id: string } }> {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'password123' });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

async function makeAdmin(userId: string) {
  await pool.query(`UPDATE users SET role = 'ADMIN' WHERE id = $1`, [userId]);
}

/** Active Member policy: mark the $50 activation fee paid. */
async function activate(userId: string) {
  await pool.query(
    `UPDATE users SET membership_activated = true, activated_at = now() WHERE id = $1`,
    [userId],
  );
}

async function login(email: string): Promise<{ token: string }> {
  const res = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const BROKER_INPUT = {
  name: 'PUPRIME',
  code: 'PU',
  pammLink: 'https://pamm.puprime.com/private/copinex',
};

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

describe('broker directory — admin CRUD', () => {
  it('public list is empty before any broker is added', async () => {
    const res = await request(app).get('/api/brokers');
    expect(res.status).toBe(200);
    expect(res.body.brokers).toEqual([]);
  });

  it('admin adds a broker → appears in the public list', async () => {
    const adminUser = await register('admin@test.dev');
    await makeAdmin(adminUser.user.id);
    const admin = await login('admin@test.dev');

    const create = await request(app)
      .post('/api/admin/brokers')
      .set(auth(admin.token))
      .send(BROKER_INPUT);
    expect(create.status).toBe(201);
    expect(create.body.broker).toMatchObject({
      name: 'PUPRIME',
      code: 'PU',
      pammLink: 'https://pamm.puprime.com/private/copinex',
      isActive: true,
    });

    const list = await request(app).get('/api/brokers');
    expect(list.status).toBe(200);
    expect(list.body.brokers).toHaveLength(1);
    // Public list must NOT leak the private link.
    expect(list.body.brokers[0]).not.toHaveProperty('pammLink');
  });

  it('duplicate broker code → 409', async () => {
    const adminUser = await register('admin@test.dev');
    await makeAdmin(adminUser.user.id);
    const admin = await login('admin@test.dev');

    await request(app).post('/api/admin/brokers').set(auth(admin.token)).send(BROKER_INPUT);
    const dup = await request(app)
      .post('/api/admin/brokers')
      .set(auth(admin.token))
      .send({ ...BROKER_INPUT, name: 'PUPRIME 2' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('BROKER_EXISTS');
  });

  it('invalid pamm link → 400', async () => {
    const adminUser = await register('admin@test.dev');
    await makeAdmin(adminUser.user.id);
    const admin = await login('admin@test.dev');

    const res = await request(app)
      .post('/api/admin/brokers')
      .set(auth(admin.token))
      .send({ ...BROKER_INPUT, pammLink: 'not-a-url' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_PAMM_LINK');
  });

  it('non-admin cannot add a broker → 403', async () => {
    const member = await register('member@test.dev');
    const res = await request(app)
      .post('/api/admin/brokers')
      .set(auth(member.token))
      .send(BROKER_INPUT);
    expect(res.status).toBe(403);
  });

  it('admin removes a broker → drops from public list, history preserved', async () => {
    const adminUser = await register('admin@test.dev');
    await makeAdmin(adminUser.user.id);
    const admin = await login('admin@test.dev');

    const create = await request(app)
      .post('/api/admin/brokers')
      .set(auth(admin.token))
      .send(BROKER_INPUT);
    const brokerId = create.body.broker.id;

    const remove = await request(app)
      .delete(`/api/admin/brokers/${brokerId}`)
      .set(auth(admin.token));
    expect(remove.status).toBe(200);
    expect(remove.body.broker.isActive).toBe(false);

    const pub = await request(app).get('/api/brokers');
    expect(pub.body.brokers).toHaveLength(0);

    const all = await request(app).get('/api/admin/brokers').set(auth(admin.token));
    expect(all.body.brokers).toHaveLength(1);
    expect(all.body.brokers[0].isActive).toBe(false);
  });
});

describe('PAMM connection requests', () => {
  it('client requests a connection → gets the broker private link, status REQUESTED', async () => {
    const adminUser = await register('admin@test.dev');
    await makeAdmin(adminUser.user.id);
    const admin = await login('admin@test.dev');
    const create = await request(app)
      .post('/api/admin/brokers')
      .set(auth(admin.token))
      .send(BROKER_INPUT);
    const brokerId = create.body.broker.id;

    const client = await register('client@test.dev');
    await activate(client.user.id);
    const res = await request(app)
      .post('/api/pamm/connections')
      .set(auth(client.token))
      .send({ brokerId });
    expect(res.status).toBe(201);
    expect(res.body.redirectUrl).toBe('https://pamm.puprime.com/private/copinex');
    expect(res.body.connection).toMatchObject({
      status: 'REQUESTED',
      brokerId,
    });
  });

  it('unauthenticated request → 401', async () => {
    const res = await request(app).post('/api/pamm/connections').send({ brokerId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(401);
  });

  it('unknown broker → 404', async () => {
    const client = await register('client@test.dev');
    await activate(client.user.id);
    const res = await request(app)
      .post('/api/pamm/connections')
      .set(auth(client.token))
      .send({ brokerId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('BROKER_NOT_FOUND');
  });

  it('removed (inactive) broker → 400 BROKER_INACTIVE', async () => {
    const adminUser = await register('admin@test.dev');
    await makeAdmin(adminUser.user.id);
    const admin = await login('admin@test.dev');
    const create = await request(app)
      .post('/api/admin/brokers')
      .set(auth(admin.token))
      .send(BROKER_INPUT);
    const brokerId = create.body.broker.id;
    await request(app).delete(`/api/admin/brokers/${brokerId}`).set(auth(admin.token));

    const client = await register('client@test.dev');
    await activate(client.user.id);
    const res = await request(app)
      .post('/api/pamm/connections')
      .set(auth(client.token))
      .send({ brokerId });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('BROKER_INACTIVE');
  });

  it('client sees only their own connections; admin sees all', async () => {
    const adminUser = await register('admin@test.dev');
    await makeAdmin(adminUser.user.id);
    const admin = await login('admin@test.dev');
    const create = await request(app)
      .post('/api/admin/brokers')
      .set(auth(admin.token))
      .send(BROKER_INPUT);
    const brokerId = create.body.broker.id;

    const c1 = await register('c1@test.dev');
    const c2 = await register('c2@test.dev');
    await activate(c1.user.id);
    await activate(c2.user.id);
    await request(app).post('/api/pamm/connections').set(auth(c1.token)).send({ brokerId });
    await request(app).post('/api/pamm/connections').set(auth(c2.token)).send({ brokerId });

    const mine = await request(app).get('/api/pamm/connections').set(auth(c1.token));
    expect(mine.status).toBe(200);
    expect(mine.body.connections).toHaveLength(1);
    expect(mine.body.connections[0].broker.name).toBe('PUPRIME');

    const all = await request(app).get('/api/admin/pamm/connections').set(auth(admin.token));
    expect(all.status).toBe(200);
    expect(all.body.connections).toHaveLength(2);
  });
});