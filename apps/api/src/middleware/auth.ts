import type { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import * as schema from '@copinex/database';
import { db } from '../db/drizzle.js';
import { verifyAuthToken } from '../lib/jwt.js';
import { HttpError } from '../lib/http-error.js';

export interface AuthUser {
  id: string;
  email: string;
  role: 'MEMBER' | 'ADMIN';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new HttpError(401, 'UNAUTHORIZED', 'Missing bearer token'));
    return;
  }
  try {
    const payload = verifyAuthToken(header.slice('Bearer '.length));
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    next(new HttpError(401, 'UNAUTHORIZED', 'Invalid or expired token'));
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.role !== 'ADMIN') {
    next(new HttpError(403, 'FORBIDDEN', 'Admin role required'));
    return;
  }
  next();
}

/**
 * Active Member policy gate (2026-09-26): monetary activities (withdraw,
 * invest, PAMM) require the member to have paid the $50 activation fee.
 * The JWT only carries identity — activation state is read from the DB so a
 * fresh activation takes effect immediately, without re-login.
 */
export async function requireActivated(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const [user] = await db
      .select({ membershipActivated: schema.users.membershipActivated })
      .from(schema.users)
      .where(eq(schema.users.id, req.user!.id))
      .limit(1);
    if (!user?.membershipActivated) {
      next(new HttpError(403, 'MEMBERSHIP_NOT_ACTIVATED', 'Pay the $50 activation fee to unlock withdrawals, investments, and PAMM'));
      return;
    }
    next();
  } catch (e) {
    next(e);
  }
}

/** Inverse gate: only members who have NOT paid the $50 fee pass (one-time fee). */
export async function requireUnactivated(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const [user] = await db
      .select({ membershipActivated: schema.users.membershipActivated })
      .from(schema.users)
      .where(eq(schema.users.id, req.user!.id))
      .limit(1);
    if (user?.membershipActivated) {
      next(new HttpError(409, 'ALREADY_ACTIVATED', 'Membership is already activated'));
      return;
    }
    next();
  } catch (e) {
    next(e);
  }
}