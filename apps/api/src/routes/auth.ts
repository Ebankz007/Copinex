import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '@copinex/database';
import { db } from '../db/drizzle.js';
import { HttpError } from '../lib/http-error.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { signAuthToken, signTwoFactorChallenge, verifyTwoFactorChallenge } from '../lib/jwt.js';
import { requireAuth } from '../middleware/auth.js';
import { registerMember } from '../services/registration-service.js';
import { createSession, listSessions, revokeAllSessions, revokeSession } from '../services/sessions.js';
import {
  beginSetup,
  confirmSetup,
  disableTwoFactor,
  getTwoFactorState,
  verifyChallenge,
} from '../services/two-factor.js';
import { consumeEmailToken, issueEmailToken } from '../services/email-tokens.js';
import { createNotification, listNotifications, markAllNotificationsRead, markNotificationRead, unreadCount } from '../services/notifications.js';
import { sha256 } from '../lib/tokens.js';

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

const profileSchema = z.object({
  fullName: z.string().min(1).max(120).nullable().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

const resetPasswordSchema = z.object({
  token: z.string().min(10),
  newPassword: z.string().min(8).max(128),
});

/** Pull the raw bearer token off the request (requireAuth already validated it). */
function tokenFromRequest(req: { headers: Record<string, unknown> }): string {
  return String(req.headers.authorization ?? '').slice('Bearer '.length);
}

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
    emailVerifiedAt: u.emailVerifiedAt,
    totpEnabled: u.totpEnabled,
    createdAt: u.createdAt,
  };
}

function sessionInfo(req: { ip: string | undefined; headers: Record<string, unknown> }) {
  return {
    ip: typeof req.ip === 'string' ? req.ip : 'unknown',
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
  };
}

/**
 * Register a member. Runs the full compensation pipeline in one transaction:
 * registration → §2 allocation → §10 pool accrual → §3/§4 bonuses → §8 matrix
 * placement → team volume → §5 associate ranks (see registration-service).
 * Creates the login session and issues an email-verification token.
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
    await createSession(result.user.id, token, sessionInfo(req));

    await createNotification({
      userId: result.user.id,
      type: 'SYSTEM',
      title: 'Welcome to Copinex',
      body: 'Your account is ready. Activate your membership to unlock withdrawals, investments, and PAMM.',
      link: '/wallet',
    });

    // Verification link — dev transport echoes it in the response.
    let verification: { link: string } | undefined;
    try {
      const issued = await issueEmailToken(result.user.id, result.user.email, 'VERIFY_EMAIL');
      verification = { link: issued.link };
    } catch {
      // Mail failure must never block registration.
    }

    res.status(201).json({ token, user: publicUser(result.user), verification });
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
    if (user.status !== 'ACTIVE' || !user.isActive) {
      throw new HttpError(403, 'ACCOUNT_DISABLED', 'This account has been disabled. Contact support.');
    }

    // Enrolled in 2FA: the password only earns a 5-minute challenge, never a
    // session. The challenge exchanges for a session at POST /2fa/verify.
    if (user.totpEnabled) {
      const challenge = signTwoFactorChallenge(user.id);
      await db
        .update(schema.users)
        .set({ lastActivityAt: new Date() })
        .where(eq(schema.users.id, user.id));
      res.json({ requiresTwoFactor: true, challenge });
      return;
    }

    const token = signAuthToken({ sub: user.id, email: user.email, role: user.role });
    await createSession(user.id, token, sessionInfo(req));
    await db
      .update(schema.users)
      .set({ lastActivityAt: new Date() })
      .where(eq(schema.users.id, user.id));

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
    const unread = await unreadCount(user.id);
    res.json({ user: publicUser(user), unreadNotifications: unread });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/verify-email', async (req, res, next) => {
  try {
    const { token } = z.object({ token: z.string().min(10) }).parse(req.body);
    const userId = await consumeEmailToken(token, 'VERIFY_EMAIL');
    await db
      .update(schema.users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.users.id, userId));
    res.json({ verified: true });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/resend-verification', requireAuth, async (req, res, next) => {
  try {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, req.user!.id))
      .limit(1);
    if (!user) throw new HttpError(404, 'NOT_FOUND', 'User not found');
    if (user.emailVerifiedAt) {
      throw new HttpError(409, 'ALREADY_VERIFIED', 'Email is already verified');
    }
    const issued = await issueEmailToken(user.id, user.email, 'VERIFY_EMAIL');
    res.json({ verification: { link: issued.link } });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().email().max(254) }).parse(req.body);
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase()))
      .limit(1);
    // Always succeed (even for unknown emails) — never reveal account existence.
    if (user) {
      await issueEmailToken(user.id, user.email, 'RESET_PASSWORD');
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/reset-password', async (req, res, next) => {
  try {
    const body = resetPasswordSchema.parse(req.body);
    const userId = await consumeEmailToken(body.token, 'RESET_PASSWORD');
    await db
      .update(schema.users)
      .set({ passwordHash: hashPassword(body.newPassword), updatedAt: new Date() })
      .where(eq(schema.users.id, userId));
    // A reset is the account owner's "cut the intruder out" action: kill every
    // session, including any the intruder holds. The requester re-authenticates
    // with the new password.
    const revoked = await revokeAllSessions(userId);
    res.json({ ok: true, sessionsRevoked: revoked });
  } catch (e) {
    next(e);
  }
});

authRouter.patch('/profile', requireAuth, async (req, res, next) => {
  try {
    const body = profileSchema.parse(req.body);
    const [user] = await db
      .update(schema.users)
      .set({ fullName: body.fullName ?? null, updatedAt: new Date() })
      .where(eq(schema.users.id, req.user!.id))
      .returning();
    if (!user) throw new HttpError(404, 'NOT_FOUND', 'User not found');
    res.json({ user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const body = changePasswordSchema.parse(req.body);
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, req.user!.id))
      .limit(1);
    if (!user || !verifyPassword(body.currentPassword, user.passwordHash)) {
      throw new HttpError(400, 'INVALID_PASSWORD', 'Current password is incorrect');
    }
    await db
      .update(schema.users)
      .set({ passwordHash: hashPassword(body.newPassword), updatedAt: new Date() })
      .where(eq(schema.users.id, user.id));
    // Revoke every OTHER device. The caller keeps its current session (it proved
    // the current password), but a stolen token on another device dies here.
    const revoked = await revokeAllSessions(user.id, tokenFromRequest(req));
    res.json({ ok: true, sessionsRevoked: revoked });
  } catch (e) {
    next(e);
  }
});

/** Active sessions for the current member. */
authRouter.get('/sessions', requireAuth, async (req, res, next) => {
  try {
    const sessions = await listSessions(req.user!.id);
    res.json({ sessions });
  } catch (e) {
    next(e);
  }
});

/** Revoke one of the member's sessions (current token keeps working until logout). */
authRouter.post('/sessions/:id/revoke', requireAuth, async (req, res, next) => {
  try {
    const session = await revokeSession(req.user!.id, req.params.id!);
    if (!session) throw new HttpError(404, 'NOT_FOUND', 'Session not found');
    res.json({ session });
  } catch (e) {
    next(e);
  }
});

/** Logout — revokes the current session so the token stops working immediately. */
authRouter.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const header = req.headers.authorization!;
    const token = header.slice('Bearer '.length);
    const [session] = await db
      .select({ id: schema.sessions.id })
      .from(schema.sessions)
      .where(eq(schema.sessions.tokenHash, sha256(token)))
      .limit(1);
    if (session) await revokeSession(req.user!.id, session.id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ── Two-factor authentication (TOTP) ───────────────────────
// Enrolment is two-phase: setup returns the secret for scanning, enable
// flips the flag only after a live code proves possession. The verify
// endpoint sits behind the same auth rate limiter as /login.

/** Phase 1: store an unenrolled secret, return it for scanning into an app. */
authRouter.post('/2fa/setup', requireAuth, async (req, res, next) => {
  try {
    const [user] = await db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, req.user!.id))
      .limit(1);
    if (!user) throw new HttpError(404, 'NOT_FOUND', 'User not found');
    res.json(await beginSetup(req.user!.id, user.email));
  } catch (e) {
    next(e);
  }
});

/** Phase 2: confirm a live code → enable 2FA, receive single-use backup codes. */
authRouter.post('/2fa/enable', requireAuth, async (req, res, next) => {
  try {
    const { token } = z.object({ token: z.string().min(6).max(16) }).parse(req.body);
    res.json(await confirmSetup(req.user!.id, token));
  } catch (e) {
    next(e);
  }
});

/** Redeem a login challenge with a TOTP code or backup code → session. */
authRouter.post('/2fa/verify', async (req, res, next) => {
  try {
    const body = z
      .object({ challenge: z.string().min(10), token: z.string().min(6).max(16) })
      .parse(req.body);
    let sub: string;
    try {
      ({ sub } = verifyTwoFactorChallenge(body.challenge));
    } catch {
      throw new HttpError(401, 'INVALID_CHALLENGE', 'This verification has expired. Sign in again.');
    }
    const result = await verifyChallenge(sub, body.token);
    if (!result.ok) {
      throw new HttpError(401, 'INVALID_TWO_FACTOR_CODE', 'That code did not verify. Try again.');
    }
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, sub)).limit(1);
    if (!user || user.status !== 'ACTIVE' || !user.isActive) {
      throw new HttpError(403, 'ACCOUNT_DISABLED', 'This account has been disabled. Contact support.');
    }
    const token = signAuthToken({ sub: user.id, email: user.email, role: user.role });
    await createSession(user.id, token, sessionInfo(req));
    await db
      .update(schema.users)
      .set({ lastActivityAt: new Date() })
      .where(eq(schema.users.id, user.id));
    res.json({ token, user: publicUser(user), viaBackupCode: result.viaBackupCode });
  } catch (e) {
    next(e);
  }
});

/** 2FA state for the current member (profile UI). */
authRouter.get('/2fa/status', requireAuth, async (req, res, next) => {
  try {
    res.json(await getTwoFactorState(req.user!.id));
  } catch (e) {
    next(e);
  }
});

/** Disable 2FA after a password re-check; wipes the secret and all codes. */
authRouter.post('/2fa/disable', requireAuth, async (req, res, next) => {
  try {
    const { password } = z.object({ password: z.string().min(1).max(128) }).parse(req.body);
    await disableTwoFactor(req.user!.id, password);
    res.json({ disabled: true });
  } catch (e) {
    next(e);
  }
});

/** The member's notifications, newest first. */
authRouter.get('/notifications', requireAuth, async (req, res, next) => {
  try {
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
    const notifications = await listNotifications(req.user!.id, Number.isFinite(limit) ? limit : 50);
    const unread = await unreadCount(req.user!.id);
    res.json({ notifications, unread });
  } catch (e) {
    next(e);
  }
});

/** Mark one notification read. */
authRouter.post('/notifications/:id/read', requireAuth, async (req, res, next) => {
  try {
    const notification = await markNotificationRead(req.user!.id, req.params.id!);
    if (!notification) throw new HttpError(404, 'NOT_FOUND', 'Notification not found');
    res.json({ notification });
  } catch (e) {
    next(e);
  }
});

/** Mark all notifications read. */
authRouter.post('/notifications/read-all', requireAuth, async (req, res, next) => {
  try {
    const updated = await markAllNotificationsRead(req.user!.id);
    res.json({ updated });
  } catch (e) {
    next(e);
  }
});