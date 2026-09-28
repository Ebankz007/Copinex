import { and, eq, isNull } from 'drizzle-orm';
import { timingSafeEqual } from 'node:crypto';
import * as schema from '@copinex/database';
import { db } from '../db/drizzle.js';
import { HttpError } from '../lib/http-error.js';
import { verifyPassword } from '../lib/password.js';
import { sha256 } from '../lib/tokens.js';
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateBackupCodes,
  generateTotpSecret,
  normaliseBackupCode,
  otpauthUrl,
  verifyTotp,
} from '../lib/totp.js';

/**
 * TOTP two-factor authentication (RFC 6238, authenticator-app compatible).
 *
 * Enrolment is two-phase on purpose: setup stores an *unenrolled* encrypted
 * secret and returns it for scanning; enable only flips the flag after the
 * member proves possession with a live code. A half-finished setup therefore
 * never locks anyone out and never weakens the login.
 *
 * Login flow for enrolled members: password check returns a 5-minute 2FA
 * challenge (NOT a session token) plus `requiresTwoFactor: true`; the
 * challenge exchanges for a real session at POST /2fa/verify with either a
 * live TOTP code or a single-use backup code.
 */

export async function getTwoFactorState(userId: string): Promise<{ enabled: boolean }> {
  const [user] = await db
    .select({ totpEnabled: schema.users.totpEnabled })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user) throw new HttpError(404, 'NOT_FOUND', 'User not found');
  return { enabled: user.totpEnabled };
}

/** Phase 1: store an unenrolled secret, return it for scanning. */
export async function beginSetup(
  userId: string,
  email: string,
): Promise<{ otpauthUrl: string; manualKey: string }> {
  const [user] = await db
    .select({ totpEnabled: schema.users.totpEnabled })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user) throw new HttpError(404, 'NOT_FOUND', 'User not found');
  if (user.totpEnabled) {
    throw new HttpError(400, 'TWO_FACTOR_ALREADY_ENABLED', 'Two-factor authentication is already enabled');
  }
  const secret = generateTotpSecret();
  await db
    .update(schema.users)
    .set({ totpSecretEncrypted: encryptTotpSecret(secret), updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
  return { otpauthUrl: otpauthUrl(email, secret), manualKey: secret };
}

/** Phase 2: prove possession with a live code → enable + mint backup codes. */
export async function confirmSetup(userId: string, code: string): Promise<{ backupCodes: string[] }> {
  const [user] = await db
    .select({ totpEnabled: schema.users.totpEnabled, totpSecretEncrypted: schema.users.totpSecretEncrypted })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user) throw new HttpError(404, 'NOT_FOUND', 'User not found');
  if (user.totpEnabled) {
    throw new HttpError(400, 'TWO_FACTOR_ALREADY_ENABLED', 'Two-factor authentication is already enabled');
  }
  if (!user.totpSecretEncrypted) {
    throw new HttpError(400, 'NO_PENDING_SETUP', 'Start setup before confirming a code');
  }
  const secret = decryptTotpSecret(user.totpSecretEncrypted);
  if (!verifyTotp(secret, code)) {
    throw new HttpError(400, 'INVALID_TWO_FACTOR_CODE', 'That code did not verify. Check your authenticator clock and try again.');
  }
  const backupCodes = generateBackupCodes();
  await db
    .update(schema.users)
    .set({ totpEnabled: true, totpEnabledAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
  // Re-enrolment starts from a clean slate: stale codes must not survive.
  await db.delete(schema.twoFactorBackupCodes).where(eq(schema.twoFactorBackupCodes.userId, userId));
  for (const code of backupCodes) {
    await db.insert(schema.twoFactorBackupCodes).values({ userId, codeHash: sha256(normaliseBackupCode(code)) });
  }
  return { backupCodes };
}

export type ChallengeResult =
  | { ok: true; userId: string; viaBackupCode: boolean }
  | { ok: false };

/**
 * Redeem a login challenge with a TOTP code or backup code. Backup codes are
 * single-use: a successful one is burned before returning.
 */
export async function verifyChallenge(userId: string, code: string): Promise<ChallengeResult> {
  const [user] = await db
    .select({ id: schema.users.id, totpEnabled: schema.users.totpEnabled, totpSecretEncrypted: schema.users.totpSecretEncrypted })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user || !user.totpEnabled || !user.totpSecretEncrypted) return { ok: false };

  try {
    if (verifyTotp(decryptTotpSecret(user.totpSecretEncrypted), code)) {
      return { ok: true, userId: user.id, viaBackupCode: false };
    }
  } catch {
    return { ok: false };
  }

  const normalised = normaliseBackupCode(code);
  if (!/^[A-Z2-9]{8}$/.test(normalised)) return { ok: false };
  const rows = await db
    .select({ id: schema.twoFactorBackupCodes.id, codeHash: schema.twoFactorBackupCodes.codeHash })
    .from(schema.twoFactorBackupCodes)
    .where(and(eq(schema.twoFactorBackupCodes.userId, user.id), isNull(schema.twoFactorBackupCodes.usedAt)));
  const wanted = Buffer.from(sha256(normalised), 'hex');
  for (const row of rows) {
    const candidate = Buffer.from(row.codeHash, 'hex');
    if (candidate.length === wanted.length && timingSafeEqual(candidate, wanted)) {
      await db
        .update(schema.twoFactorBackupCodes)
        .set({ usedAt: new Date() })
        .where(eq(schema.twoFactorBackupCodes.id, row.id));
      return { ok: true, userId: user.id, viaBackupCode: true };
    }
  }
  return { ok: false };
}

/** Disable 2FA after a password re-check; wipes the secret and all codes. */
export async function disableTwoFactor(userId: string, password: string): Promise<void> {
  const [user] = await db
    .select({ passwordHash: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid password');
  }
  await db.delete(schema.twoFactorBackupCodes).where(eq(schema.twoFactorBackupCodes.userId, userId));
  await db
    .update(schema.users)
    .set({ totpEnabled: false, totpEnabledAt: null, totpSecretEncrypted: null, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
}
