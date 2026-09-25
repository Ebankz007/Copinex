import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '@copinex/database';
import { db } from '../db/drizzle.js';
import { HttpError } from '../lib/http-error.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { signAuthToken } from '../lib/jwt.js';
import { requireAuth } from '../middleware/auth.js';
import { ensureWallets } from '../services/wallets.js';

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
    createdAt: u.createdAt,
  };
}

/** Register a member. Creates both wallets (COPINEX + WITHDRAWAL). */
authRouter.post('/register', async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const email = body.email.toLowerCase();

    const existing = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    if (existing.length > 0) throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists');

    if (body.sponsorId) {
      const sponsor = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.id, body.sponsorId))
        .limit(1);
      if (sponsor.length === 0) throw new HttpError(400, 'INVALID_SPONSOR', 'Sponsor does not exist');
    }

    const [user] = await db
      .insert(schema.users)
      .values({
        email,
        passwordHash: hashPassword(body.password),
        fullName: body.fullName ?? null,
        sponsorId: body.sponsorId ?? null,
        placementParentId: body.sponsorId ?? null,
      })
      .returning();
    if (!user) throw new HttpError(500, 'INTERNAL_ERROR', 'Failed to create user');

    await ensureWallets(db, user.id);

    const token = signAuthToken({ sub: user.id, email: user.email, role: user.role });
    res.status(201).json({ token, user: publicUser(user) });
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