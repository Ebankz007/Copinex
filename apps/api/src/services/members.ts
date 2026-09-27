import { and, eq, ilike, or } from 'drizzle-orm';
import * as schema from '@copinex/database';
import { db } from '../db/drizzle.js';
import { HttpError } from '../lib/http-error.js';
import type { DbOrTx } from '../db/drizzle.js';

/**
 * The single column set every member-list surface returns (admin console,
 * search, filters). Kept here so the shapes cannot drift apart again.
 */
export const memberColumns = {
  id: schema.users.id,
  email: schema.users.email,
  fullName: schema.users.fullName,
  role: schema.users.role,
  status: schema.users.status,
  isActive: schema.users.isActive,
  membershipActivated: schema.users.membershipActivated,
  activatedAt: schema.users.activatedAt,
  emailVerifiedAt: schema.users.emailVerifiedAt,
  lastActivityAt: schema.users.lastActivityAt,
  createdAt: schema.users.createdAt,
};

/**
 * Members list for the admin ops rail.
 * `search` matches email or full name (case-insensitive, %substring%).
 * Results are capped so a broad query cannot pull the whole table.
 */
export async function listMembers(
  activated?: boolean,
  search?: string,
  limit = 100,
) {
  const conditions = [
    activated === undefined ? undefined : eq(schema.users.membershipActivated, activated),
    search
      ? or(
          ilike(schema.users.email, `%${search}%`),
          ilike(schema.users.fullName, `%${search}%`),
        )
      : undefined,
  ].filter((c) => c !== undefined);

  return db
    .select(memberColumns)
    .from(schema.users)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(schema.users.createdAt)
    .limit(limit);
}

/**
 * Apply membership activation inside a transaction — the $50 fee is paid.
 * Idempotent: safe to call from the payment webhook even if the member was
 * already activated by the admin rail.
 */
export async function applyActivation(tx: DbOrTx, userId: string, at: Date): Promise<void> {
  await tx
    .update(schema.users)
    .set({ membershipActivated: true, activatedAt: at, updatedAt: at })
    .where(eq(schema.users.id, userId));
  await tx
    .update(schema.registrations)
    .set({ status: 'PAID' })
    .where(eq(schema.registrations.userId, userId));
}

/**
 * Activate a member's membership (admin rail). Records the $50 activation fee
 * as paid. Same code path the payment-provider webhook uses.
 */
export async function activateMembership(userId: string) {
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user) throw new HttpError(404, 'NOT_FOUND', 'Member not found');
  if (user.membershipActivated) {
    throw new HttpError(409, 'ALREADY_ACTIVATED', 'Membership is already activated');
  }

  const at = new Date();
  await db.transaction(async (tx) => {
    await applyActivation(tx, user.id, at);
  });

  return {
    id: user.id,
    email: user.email,
    membershipActivated: true,
    activatedAt: at,
  };
}