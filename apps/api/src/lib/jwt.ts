import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { generateToken } from './tokens.js';
import type { UserRole } from './roles.js';

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  /** Unique token id — makes every JWT distinct even within the same second. */
  jti?: string;
  /**
   * Purpose marker. Session tokens never set it; the 2FA challenge sets
   * `purpose: '2fa'`, and requireAuth rejects ANY token carrying a purpose so
   * a challenge can never be mistaken for a session.
   */
  purpose?: string;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign({ ...payload, jti: generateToken(16) }, env.JWT_SECRET, {
    // env value is a valid ms string ('7d'); typed via NonNullable to satisfy
    // jsonwebtoken's SignOptions under exactOptionalPropertyTypes.
    expiresIn: env.JWT_EXPIRES_IN as unknown as NonNullable<jwt.SignOptions['expiresIn']>,
    // Pinned: with a symmetric secret the risk is low, but the allow-list
    // removes algorithm-confusion as a question entirely.
    algorithm: 'HS256',
  });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as AuthTokenPayload;
}

/**
 * Two-factor login challenge: proves "password correct, second factor still
 * owed" for 5 minutes. It is NOT a session — it carries no role, creates no
 * session row, and requireAuth rejects it (see the purpose guard).
 */
export function signTwoFactorChallenge(sub: string): string {
  return jwt.sign({ sub, purpose: '2fa', jti: generateToken(16) }, env.JWT_SECRET, {
    expiresIn: '5m',
    algorithm: 'HS256',
  });
}

export function verifyTwoFactorChallenge(token: string): { sub: string } {
  const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as AuthTokenPayload;
  if (payload.purpose !== '2fa' || !payload.sub) {
    throw new Error('Not a two-factor challenge');
  }
  return { sub: payload.sub };
}

/**
 * Staff 2FA-enrolment challenge: for ADMIN/SUPERADMIN accounts with no second
 * factor enrolled. Authorises ONLY the setup/enable endpoints (via
 * requireAuthOrEnrollChallenge), for 15 minutes — enrolment means scanning a
 * code and typing, which takes longer than a login. It is never a session.
 */
export function signEnrollChallenge(sub: string): string {
  return jwt.sign({ sub, purpose: '2fa-enroll', jti: generateToken(16) }, env.JWT_SECRET, {
    expiresIn: '15m',
    algorithm: 'HS256',
  });
}

export function verifyEnrollChallenge(token: string): { sub: string } {
  const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as AuthTokenPayload;
  if (payload.purpose !== '2fa-enroll' || !payload.sub) {
    throw new Error('Not an enrolment challenge');
  }
  return { sub: payload.sub };
}