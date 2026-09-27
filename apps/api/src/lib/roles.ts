/**
 * Role vocabulary — the single source of truth for the platform's role
 * hierarchy. Imported by the API middleware, JWT payload, permission service,
 * admin routes and the web client so the union type can never drift between
 * them (it was previously inlined in four places).
 *
 * Hierarchy, most privileged first:
 *
 *   SUPERADMIN  everything ADMIN can do, PLUS the sole authority to grant or
 *               revoke ADMIN/SUPERADMIN. Added by migration 0009.
 *   ADMIN       every operational permission. Cannot mint another admin.
 *   MEMBER      no admin permissions. Money actions are separately gated by
 *               requireActivated (the $50 activation fee).
 *
 * The point of SUPERADMIN is that staff authority stops being self-service.
 * Before it, any ADMIN could PATCH /admin/members/:id with role=ADMIN.
 */
export type UserRole = 'MEMBER' | 'ADMIN' | 'SUPERADMIN';

/** Roles that may enter the admin console (requireAdmin). */
export const ADMIN_ROLES: readonly UserRole[] = ['ADMIN', 'SUPERADMIN'];

/** True for ADMIN and SUPERADMIN — i.e. "may enter the admin console". */
export function isAdminRole(role: string | undefined | null): boolean {
  return role === 'ADMIN' || role === 'SUPERADMIN';
}

/** True only for SUPERADMIN. */
export function isSuperAdmin(role: string | undefined | null): boolean {
  return role === 'SUPERADMIN';
}

/**
 * Roles a caller must hold to change someone's role. Granting ADMIN is a
 * privilege escalation, so it is SUPERADMIN-only; demoting anyone at all also
 * requires SUPERADMIN, otherwise a plain ADMIN could demote a peer.
 */
export const MANAGEABLE_ROLES: readonly UserRole[] = ['MEMBER', 'ADMIN', 'SUPERADMIN'];

/** Permission code that only SUPERADMIN holds. */
export const SUPERADMIN_ONLY_PERMISSIONS: readonly string[] = ['admins.manage'];
