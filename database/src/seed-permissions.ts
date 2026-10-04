/**
 * Seed — permission catalog ONLY (production-safe).
 *
 * Inserts the 8 permissions plus the ADMIN grants (everything except the
 * SUPERADMIN-only set) and the SUPERADMIN grants (everything). Creates NO
 * users, NO wallets, NO balances. Idempotent — safe to re-run.
 *
 * This exists because seed-users.ts (dev fixtures with published passwords)
 * must NEVER run against production. The permission catalog here mirrors it
 * deliberately: if the catalog in seed-users.ts changes, change it here too.
 *
 * Usage: pnpm --filter @copinex/database seed-permissions
 * Requires DATABASE_URL (the workspace-root .env, like every other script).
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env'),
});

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://copinex:copinex_dev_password@127.0.0.1:5433/copinex',
});

const db = drizzle(pool, { schema });

// Canonical catalog — mirrors seed-users.ts PERMISSIONS exactly.
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

  console.log(`Seeded ${PERMISSIONS.length} permissions + ADMIN/SUPERADMIN grants (no users touched).`);
  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
