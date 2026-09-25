import type { NextFunction, Request, Response } from 'express';
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