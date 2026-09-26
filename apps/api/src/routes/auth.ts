import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '@copinex/database';
import { db } from '../db/drizzle.js';
import { HttpError } from '../lib/http-error.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { signAuthToken } from '../lib/jwt.js';
import { requireAuth } from '../middleware/auth.js';
import { registerMember } from '../services/registration-service.js';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  fullName: z.string().min(1).max(120).optional(),
  sponsorId: z.string().uuid().optional(),
});

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

function publicUser(u: typeof schema.users.$inferSelect) {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    status: u.status,
    sponsorId: u.sponsorId,
    membershipActivated: u.membershipActivated,
    activatedAt: u.activatedAt,
    createdAt: u.createdAt,
  };
}

/**
 * Register a member. Runs the full compensation pipeline in one transaction:
 * registration → §2 allocation → §10 pool accrual → §3/§4 bonuses → §8 matrix
 * placement → team volume → §5 associate ranks (see registration-service).
 */
authRouter.post('/register', async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);

    const result = await registerMember({
      email: body.email,
      passwordHash: hashPassword(body.password),
      fullName: body.fullName ?? null,
      sponsorId: body.sponsorId ?? null,
    });

    const token = signAuthToken({ sub: result.user.id, email: result.user.email, role: result.user.role });
    res.status(201).json({ token, user: publicUser(result.user) });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, body.email.toLowerCase()))
      .limit(1);

    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const token = signAuthToken({ sub: user.id, email: user.email, role: user.role });
    res.json({ token, user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, req.user!.id))
      .limit(1);
    if (!user) throw new HttpError(404, 'NOT_FOUND', 'User not found');
    res.json({ user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});