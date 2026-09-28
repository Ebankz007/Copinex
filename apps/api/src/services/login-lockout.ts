import { eq } from 'drizzle-orm';
import * as schema from '@copinex/database';
import { db } from '../db/drizzle.js';
import { HttpError } from '../lib/http-error.js';

/**
 * Per-account login lockout with exponential backoff.
 *
 * Five consecutive failed passwords (or 2FA codes) lock the account: 5 min,
 * then 10, 20, 40, capped at 60. Any successful login resets the counter.
 * This is the credential-stuffing defence the shared IP rate limiter cannot
 * provide on its own — a botnet is not one IP.
 *
 * Known trade-off, stated plainly: an attacker who knows an address can lock
 * its owner out for up to an hour. That is the standard price of lockout
 * (and why the lock message names a retry time instead of failing silently).
 * Account recovery stays available via the password-reset flow, which is a
 * separate, email-gated channel.
 */

export const MAX_ATTEMPTS = 5;
export const MAX_LOCK_MINUTES = 60;

/** Lock length for the Nth consecutive failure (N >= MAX_ATTEMPTS). */
export function backoffMinutes(failures: number): number {
  return Math.min(5 * 2 ** (failures - MAX_ATTEMPTS), MAX_LOCK_MINUTES);
}

/** Throw 423 when the account is currently locked. Otherwise silent. */
export function assertNotLocked(user: {
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}): void {
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const mins = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000));
    throw new HttpError(
      423,
      'ACCOUNT_LOCKED',
      `Too many failed sign-in attempts. Try again in about ${mins} minute${mins === 1 ? '' : 's'}.`,
    );
  }
}

/**
 * Record a failed attempt. Returns the lock expiry when this failure tripped
 * the lock (the caller should answer 423 rather than 401 so the member knows
 * why), or null when the account is still merely counting.
 */
export async function recordFailure(userId: string, previousAttempts: number): Promise<Date | null> {
  const failures = previousAttempts + 1;
  if (failures >= MAX_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + backoffMinutes(failures) * 60_000);
    await db
      .update(schema.users)
      .set({ failedLoginAttempts: failures, lockedUntil, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));
    return lockedUntil;
  }
  await db
    .update(schema.users)
    .set({ failedLoginAttempts: failures, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
  return null;
}

/** Answer 423 with the retry time for a freshly-tripped lock. */
export function throwFreshLock(lockedUntil: Date): never {
  const mins = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000));
  throw new HttpError(
    423,
    'ACCOUNT_LOCKED',
    `Too many failed sign-in attempts. Try again in about ${mins} minute${mins === 1 ? '' : 's'}.`,
  );
}

/** A successful login wipes the slate. */
export async function recordSuccess(userId: string): Promise<void> {
  await db
    .update(schema.users)
    .set({ failedLoginAttempts: 0, lockedUntil: null, lastActivityAt: new Date() })
    .where(eq(schema.users.id, userId));
}
