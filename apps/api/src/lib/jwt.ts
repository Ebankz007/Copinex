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
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign({ ...payload, jti: generateToken(16) }, env.JWT_SECRET, {
    // env value is a valid ms string ('7d'); typed via NonNullable to satisfy
    // jsonwebtoken's SignOptions under exactOptionalPropertyTypes.
    expiresIn: env.JWT_EXPIRES_IN as unknown as NonNullable<jwt.SignOptions['expiresIn']>,
  });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
}