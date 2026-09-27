import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import * as schema from '@copinex/database';
import { db } from '../db/drizzle.js';
import { sha256 } from '../lib/tokens.js';

export interface SessionInfo {
  ip: string;
  userAgent?: string | null;
}

/** Record a login session for the raw auth token. */
export async function createSession(userId: string, token: string, info: SessionInfo) {
  const [row] = await db
    .insert(schema.sessions)
    .values({
      userId,
      tokenHash: sha256(token),
      ip: info.ip,
      userAgent: info.userAgent ? info.userAgent.slice(0, 300) : null,
    })
    .returning();
  return row;
}

/** The member's active sessions (for the session-management UI). */
export async function listSessions(userId: string) {
  return db
    .select()
    .from(schema.sessions)
    .where(and(eq(schema.sessions.userId, userId), isNull(schema.sessions.revokedAt)))
    .orderBy(desc(schema.sessions.lastSeenAt));
}

/** Revoke one session. Returns the revoked row or null if not found/active. */
export async function revokeSession(userId: string, sessionId: string) {
  const [row] = await db
    .update(schema.sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(schema.sessions.id, sessionId),
        eq(schema.sessions.userId, userId),
        isNull(schema.sessions.revokedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Revoke every active session for a user. Used when credentials change:
 * a password reset or change must not leave a stolen session alive for the
 * remaining 7 days of its JWT.
 *
 * @param exceptToken keep this one alive (the device that just changed its own
 *   password, so the user is not logged out of the browser they are using).
 * @returns the number of sessions revoked.
 */
export async function revokeAllSessions(userId: string, exceptToken?: string): Promise<number> {
  const conditions = [
    eq(schema.sessions.userId, userId),
    isNull(schema.sessions.revokedAt),
  ];
  if (exceptToken) {
    conditions.push(ne(schema.sessions.tokenHash, sha256(exceptToken)));
  }
  const rows = await db
    .update(schema.sessions)
    .set({ revokedAt: new Date() })
    .where(and(...conditions))
    .returning({ id: schema.sessions.id });
  return rows.length;
}

/**
 * Is this token's session still valid? Returns true when there is no session
 * row (legacy/tooling tokens) or the session is active; false only when the
 * session exists and is revoked. This makes logout real without breaking
 * tokens that were never session-tracked.
 */
export async function isTokenSessionValid(token: string): Promise<boolean> {
  const [row] = await db
    .select({ revokedAt: schema.sessions.revokedAt })
    .from(schema.sessions)
    .where(eq(schema.sessions.tokenHash, sha256(token)))
    .limit(1);
  if (!row) return true;
  return row.revokedAt === null;
}

/** Touch lastSeenAt (fire-and-forget; failures must never break requests). */
export async function touchSession(token: string): Promise<void> {
  try {
    await db
      .update(schema.sessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(schema.sessions.tokenHash, sha256(token)));
  } catch {
    // Non-critical; the request continues.
  }
}