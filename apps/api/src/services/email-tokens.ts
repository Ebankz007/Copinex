import { and, eq, isNull } from 'drizzle-orm';
import * as schema from '@copinex/database';
import { db } from '../db/drizzle.js';
import { HttpError } from '../lib/http-error.js';
import { generateToken, safeEqual, sha256 } from '../lib/tokens.js';
import { appUrl, sendEmail } from './email.js';

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const RESET_TTL_MS = 60 * 60 * 1000; // 1h

/**
 * Create a single-use email token (VERIFY_EMAIL | RESET_PASSWORD) and deliver
 * it by email. Returns the raw token so the dev transport can echo the link.
 */
export async function issueEmailToken(userId: string, email: string, purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD') {
  const raw = generateToken();
  const ttl = purpose === 'VERIFY_EMAIL' ? VERIFY_TTL_MS : RESET_TTL_MS;

  // Only one live link per purpose. Issuing a new reset link retires any
  // outstanding one, so a leaked older email stops working the moment the
  // member asks for a fresh link. (Verification links are idempotent, so
  // resending must NOT retire the one already sitting in their inbox.)
  if (purpose === 'RESET_PASSWORD') {
    await db
      .update(schema.emailTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(schema.emailTokens.userId, userId),
          eq(schema.emailTokens.purpose, purpose),
          isNull(schema.emailTokens.usedAt),
        ),
      );
  }

  await db.insert(schema.emailTokens).values({
    userId,
    purpose,
    tokenHash: sha256(raw),
    expiresAt: new Date(Date.now() + ttl),
  });

  const path =
    purpose === 'VERIFY_EMAIL'
      ? `/verify-email?token=${raw}`
      : `/reset-password?token=${raw}`;
  const link = appUrl(path);

  const subject =
    purpose === 'VERIFY_EMAIL' ? 'Verify your Copinex email' : 'Reset your Copinex password';
  const text =
    purpose === 'VERIFY_EMAIL'
      ? `Verify your Copinex account email:\n\n${link}\n\nThis link expires in 24 hours.`
      : `Reset your Copinex password:\n\n${link}\n\nThis link expires in 1 hour. If you did not request this, you can safely ignore it.`;

  await sendEmail({ to: email, subject, text });
  return { raw, link };
}

/**
 * Consume a token: verifies hash + purpose + expiry + single-use, then marks
 * it used. Throws 400 on any mismatch. Returns the owning user id.
 */
export async function consumeEmailToken(
  raw: string,
  purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD',
): Promise<string> {
  const hash = sha256(raw);
  const [row] = await db
    .select()
    .from(schema.emailTokens)
    .where(and(eq(schema.emailTokens.tokenHash, hash), eq(schema.emailTokens.purpose, purpose)))
    .limit(1);

  if (!row || !safeEqual(row.tokenHash, hash)) {
    throw new HttpError(400, 'INVALID_TOKEN', 'This link is invalid.');
  }
  if (row.usedAt) {
    throw new HttpError(400, 'TOKEN_USED', 'This link has already been used.');
  }
  if (row.expiresAt.getTime() < Date.now()) {
    throw new HttpError(400, 'TOKEN_EXPIRED', 'This link has expired. Request a new one.');
  }

  await db
    .update(schema.emailTokens)
    .set({ usedAt: new Date() })
    .where(eq(schema.emailTokens.id, row.id));
  return row.userId;
}