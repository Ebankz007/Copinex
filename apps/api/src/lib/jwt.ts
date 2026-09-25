import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: 'MEMBER' | 'ADMIN';
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    // env value is a valid ms string ('7d'); typed via NonNullable to satisfy
    // jsonwebtoken's SignOptions under exactOptionalPropertyTypes.
    expiresIn: env.JWT_EXPIRES_IN as unknown as NonNullable<jwt.SignOptions['expiresIn']>,
  });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
}