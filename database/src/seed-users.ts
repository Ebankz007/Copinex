/**
 * Seed — platform accounts + permission catalog.
 *
 * Creates the SUPERADMIN, ADMIN and demo MEMBER accounts with scrypt-hashed
 * passwords (same scheme the API verifies: scrypt$salt$hash), the permission
 * catalog, and the role grants. Idempotent — safe to re-run.
 *
 * The seeded accounts are FIXTURES this script owns: re-running RESETS their
 * password to the documented value and repairs their role/status. A
 * skip-if-exists seed silently leaves stale credentials behind and locks
 * everyone out of the console.
 *
 * Usage: pnpm --filter @copinex/database seed-users
 * Requires DATABASE_URL (defaults to the local dev DB on :5433).
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://copinex:copinex_dev_password@127.0.0.1:5433/copinex',
});

const db = drizzle(pool, { schema });

/**
 * Matches apps/api/src/lib/password.ts EXACTLY — scrypt$<salt-hex>$<hash-hex>.
 *
 * The salt must be the hex STRING, not the raw bytes: the API re-hashes using
 * `scrypt$<salt-hex>` parsed back out of the column, so hashing here with a
 * Buffer produces a hash no login can ever verify.
 */
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt}$${hash.toString('hex')}`;
}

/**
 * Same contract as the API's verifyPassword. Asserted on every run so a drift
 * between the two implementations fails the seed loudly instead of quietly
 * producing accounts nobody can sign into.
 */
function assertVerifiable(password: string, stored: string): void {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) {
    throw new Error(`seed hash is malformed: ${stored.slice(0, 20)}...`);
  }
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) {
    throw new Error('seed hash failed self-verification — hash/verify implementations have drifted');
  }
}

const PERMISSIONS = [
  { code: 'members.view', description: 'View member list and profiles' },
  { code: 'members.manage', description: 'Edit members, activate/deactivate accounts' },
  { code: 'investments.manage', description: 'Manage investment packages and close investments' },
  { code: 'wallets.manage', description: 'Admin deposits, withdrawal approvals and rejections' },
  { code: 'content.manage', description: 'Create and publish announcements' },
  { code: 'settings.manage', description: 'Read and update platform settings' },
  { code: 'system.view', description: 'View audit log and system status' },
  { code: 'admins.manage', description: 'SUPERADMIN only — grant, change or revoke staff roles' },
];

/** Grants SUPERADMIN holds that ADMIN must NOT. Mirrors apps/api/src/lib/roles.ts. */
const SUPERADMIN_ONLY = new Set(['admins.manage']);

async function main() {
  // ── Permission catalog ───────────────────────────────
  const permissionIds: Record<string, string> = {};
  for (const p of PERMISSIONS) {
    await db
      .insert(schema.permissions)
      .values(p)
      .onConflictDoNothing({ target: schema.permissions.code });
    const [row] = await db
      .select({ id: schema.permissions.id })
      .from(schema.permissions)
      .where(eq(schema.permissions.code, p.code))
      .limit(1);
    if (row) permissionIds[p.code] = row.id;
  }

  // ADMIN holds every permission EXCEPT the SUPERADMIN-only set;
  // SUPERADMIN holds all of them; MEMBER holds none (member access is
  // role-gated at the route level, not permission-gated).
  for (const code of Object.keys(permissionIds)) {
    if (!SUPERADMIN_ONLY.has(code)) {
      await db
        .insert(schema.rolePermissions)
        .values({ role: 'ADMIN', permissionId: permissionIds[code]! })
        .onConflictDoNothing({ target: [schema.rolePermissions.role, schema.rolePermissions.permissionId] });
    }
  }
  for (const code of Object.keys(permissionIds)) {
    await db
      .insert(schema.rolePermissions)
      .values({ role: 'SUPERADMIN', permissionId: permissionIds[code]! })
      .onConflictDoNothing({ target: [schema.rolePermissions.role, schema.rolePermissions.permissionId] });
  }

  // ── Seeded accounts ─────────────────────────────────
  // These are fixtures, not real members. The helper repairs them in place so
  // the documented credentials always work after a re-run.
  //
  // DEV CREDENTIALS — every one of these is a known, published password. Delete
  // or rotate all of them before the platform takes real money; the SUPERADMIN
  // one especially.
  interface SeedWallet {
    walletType: 'COPINEX' | 'WITHDRAWAL';
    balanceCents: number;
  }

  async function ensureSeedUser(input: {
    email: string;
    password: string;
    fullName: string;
    role: 'MEMBER' | 'ADMIN' | 'SUPERADMIN';
    wallets?: SeedWallet[];
  }): Promise<void> {
    const [existing] = await db
      .select({ id: schema.users.id, activatedAt: schema.users.activatedAt })
      .from(schema.users)
      .where(eq(schema.users.email, input.email))
      .limit(1);

    const passwordHash = hashPassword(input.password);
    assertVerifiable(input.password, passwordHash);
    let userId: string;

    if (!existing) {
      const [row] = await db
        .insert(schema.users)
        .values({
          email: input.email,
          passwordHash,
          fullName: input.fullName,
          role: input.role,
          status: 'ACTIVE',
          isActive: true,
          membershipActivated: true,
          activatedAt: new Date(),
        })
        .returning({ id: schema.users.id });
      if (!row) throw new Error(`${input.email} insert failed`);
      userId = row.id;
      console.log(`Created ${input.role.toLowerCase()} account: ${input.email}`);
    } else {
      userId = existing.id;
      await db
        .update(schema.users)
        .set({
          passwordHash,
          fullName: input.fullName,
          role: input.role,
          status: 'ACTIVE',
          isActive: true,
          membershipActivated: true,
          activatedAt: existing.activatedAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, userId));
      console.log(`Repaired ${input.email} — password reset to the seeded value`);
    }

    // The $50 registration fee, already PAID. registrations has no unique
    // constraint on user_id, so check before inserting.
    const [existingReg] = await db
      .select({ id: schema.registrations.id })
      .from(schema.registrations)
      .where(eq(schema.registrations.userId, userId))
      .limit(1);
    if (!existingReg) {
      await db.insert(schema.registrations).values({
        userId,
        feeCents: 5000,
        status: 'PAID',
      });
    }

    // Demo balances. wallets is unique on (userId, walletType) — do nothing wins.
    for (const w of input.wallets ?? []) {
      await db
        .insert(schema.wallets)
        .values({ userId, walletType: w.walletType, balanceCents: w.balanceCents })
        .onConflictDoNothing();
    }
  }

  // 1. SUPERADMIN — top of the hierarchy. The ONLY role that can grant, change
  //    or revoke ADMIN/SUPERADMIN, and the only one that can edit a staff
  //    account. Operationally identical to ADMIN everywhere else.
  await ensureSeedUser({
    email: 'superadmin@copinex.com',
    password: 'SuperAdmin@12345',
    fullName: 'Copinex Super Administrator',
    role: 'SUPERADMIN',
  });

  // 2. ADMIN — full operational access, cannot mint another admin.
  await ensureSeedUser({
    email: 'admin@copinex.com',
    password: 'Admin@12345',
    fullName: 'Copinex Administrator',
    role: 'ADMIN',
  });

  // 3. CLIENT — the demo member. Kept for the marketing walkthrough.
  await ensureSeedUser({
    email: 'client@copinex.com',
    password: 'Client@12345',
    fullName: 'Demo Client',
    role: 'MEMBER',
    // Demo balances so the portal shows real numbers.
    wallets: [
      { walletType: 'COPINEX', balanceCents: 50000 },
      { walletType: 'WITHDRAWAL', balanceCents: 12000 },
    ],
  });

  // 4. CLIENTTEST — a second, disposable member for exercising member journeys
  //    (deposit → invest → withdraw) without disturbing the demo client above.
  await ensureSeedUser({
    email: 'clienttest@copinex.com',
    password: 'ClientTest@12345',
    fullName: 'Client Test',
    role: 'MEMBER',
    wallets: [
      { walletType: 'COPINEX', balanceCents: 25000 },
      { walletType: 'WITHDRAWAL', balanceCents: 5000 },
    ],
  });

  console.log(`Seeded ${PERMISSIONS.length} permissions + ADMIN grants.`);
  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});