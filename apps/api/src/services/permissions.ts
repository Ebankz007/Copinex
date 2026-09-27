import { eq } from 'drizzle-orm';
import * as schema from '@copinex/database';
import { db } from '../db/drizzle.js';
import { SUPERADMIN_ONLY_PERMISSIONS, type UserRole } from '../lib/roles.js';

/**
 * Does the role hold this permission?
 *
 * ADMIN and SUPERADMIN sit at the top of the hierarchy and implicitly hold
 * every permission — the catalog (role_permissions) is the extension point for
 * future non-admin roles (support, finance, …). Failing open for staff means a
 * missing seed row can never lock an operator out of the console; MEMBER always
 * fails closed.
 *
 * The one exception is the SUPERADMIN-only list (currently `admins.manage`):
 * those are subtracted from ADMIN even though the seed grants ADMIN every other
 * row. Without this subtraction the new tier would be decorative — an ADMIN
 * could still mint peers through the same code path the tier was meant to gate.
 */
export async function roleHasPermission(role: UserRole, code: string): Promise<boolean> {
  if (role === 'SUPERADMIN') return true;
  if (role === 'ADMIN') return !SUPERADMIN_ONLY_PERMISSIONS.includes(code);
  const rows = await db
    .select({ permissionId: schema.rolePermissions.permissionId })
    .from(schema.rolePermissions)
    .innerJoin(
      schema.permissions,
      eq(schema.rolePermissions.permissionId, schema.permissions.id),
    )
    .where(eq(schema.permissions.code, code));
  return rows.length > 0;
}
