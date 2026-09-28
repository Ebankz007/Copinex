import type { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import * as schema from '@copinex/database';
import { db } from '../db/drizzle.js';
import { verifyAuthToken, verifyEnrollChallenge } from '../lib/jwt.js';
import { tokenFromCookies } from '../lib/cookies.js';
import { HttpError } from '../lib/http-error.js';
import { isTokenSessionValid, touchSession } from '../services/sessions.js';
import { roleHasPermission } from '../services/permissions.js';
import { isAdminRole, type UserRole } from '../lib/roles.js';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  // Bearer first (tests, tooling, and any non-browser client), then the
  // httpOnly session cookie the web app uses. Either way the value below is
  // a full session token subject to the same revocation check.
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : tokenFromCookies(req);
  if (!token) {
    next(new HttpError(401, 'UNAUTHORIZED', 'Missing bearer token'));
    return;
  }
  try {
    const payload = verifyAuthToken(token);
    // Purpose guard: a 2FA challenge (or any future single-purpose token)
    // must never authenticate as a session, even though it shares the
    // signing key. Session tokens never carry a purpose.
    if (payload.purpose) {
      next(new HttpError(401, 'UNAUTHORIZED', 'Invalid or expired token'));
      return;
    }
    // Logout revocation: a revoked session kills the token immediately.
    // Tokens without a session row (legacy/tooling) remain valid.
    if (!(await isTokenSessionValid(token))) {
      next(new HttpError(401, 'UNAUTHORIZED', 'Session revoked — please log in again'));
      return;
    }
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    // Fire-and-forget activity touch — never blocks the request.
    void touchSession(token);
    next();
  } catch {
    next(new HttpError(401, 'UNAUTHORIZED', 'Invalid or expired token'));
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!isAdminRole(req.user?.role)) {
    next(new HttpError(403, 'FORBIDDEN', 'Admin role required'));
    return;
  }
  next();
}

/**
 * Session bearer OR staff enrolment challenge. Used ONLY on the 2FA
 * setup/enable endpoints: a staff member with no second factor enrolled
 * holds no session, so the enrolment challenge (purpose '2fa-enroll',
 * issued at login) stands in for one. The user is loaded truthfully from
 * the database — the challenge carries no role claim. `req.enrollChallenge`
 * tells the handler which credential authorised the call, so enable can mint
 * the first session only for the enrolment path.
 */
export async function requireAuthOrEnrollChallenge(
  req: Request & { enrollChallenge?: boolean },
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new HttpError(401, 'UNAUTHORIZED', 'Missing bearer token'));
    return;
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyAuthToken(token);
    if (!payload.purpose) {
      if (!(await isTokenSessionValid(token))) {
        next(new HttpError(401, 'UNAUTHORIZED', 'Session revoked — please log in again'));
        return;
      }
      req.user = { id: payload.sub, email: payload.email, role: payload.role };
      void touchSession(token);
      next();
      return;
    }
  } catch {
    // Not a usable session token — fall through to the challenge check.
  }
  try {
    const { sub } = verifyEnrollChallenge(token);
    const [user] = await db
      .select({ id: schema.users.id, email: schema.users.email, role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, sub))
      .limit(1);
    if (!user) throw new Error('no such user');
    req.user = { id: user.id, email: user.email, role: user.role };
    req.enrollChallenge = true;
    next();
  } catch {
    next(new HttpError(401, 'UNAUTHORIZED', 'Invalid or expired token'));
  }
}

/**
 * Permission gate — checks the role_permissions catalog (seeded: ADMIN holds
 * every permission). Use on admin routes that need a specific capability.
 */
export function requirePermission(code: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !(await roleHasPermission(req.user.role, code))) {
        next(new HttpError(403, 'FORBIDDEN', `Permission required: ${code}`));
        return;
      }
      next();
    } catch (e) {
      next(e);
    }
  };
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