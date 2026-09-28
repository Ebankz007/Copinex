import type { Request, Response } from 'express';
import { env } from '../config/env.js';

/**
 * httpOnly session cookies — the token lives here, never in JavaScript.
 *
 * Two cookies are issued together on every session grant (register, login,
 * 2FA verify, 2FA-enrolment enable):
 *   copinex_token   — the JWT itself. httpOnly: document.cookie, devtools
 *                     console, and any injected script physically cannot read
 *                     it. This closes the localStorage-exfiltration hole the
 *                     security review flagged (CSP cannot stop navigation).
 *   copinex_authed  — a bare presence flag ('1'). Readable on purpose: the
 *                     web UI needs to know whether to render the demo persona
 *                     without spending a /me round-trip. It confers nothing —
 *                     every request is still authenticated against the token.
 *
 * Both are SameSite=Strict on the same-origin /api proxy, and every
 * state-changing route is POST/PUT/PATCH/DELETE (no mutating GETs), so a
 * cross-site request cannot carry the cookie on anything but a top-level
 * GET navigation — which cannot mutate. That is the CSRF posture, stated
 * plainly: Strict + same-origin + safe-methods, no token dance.
 *
 * `secure` follows NODE_ENV: browsers refuse Secure cookies over the
 * http://localhost dev setup, so it is production-only.
 */

export const SESSION_COOKIE = 'copinex_token';
export const AUTH_FLAG_COOKIE = 'copinex_authed';

/** 7 days — must stay in step with the JWT lifetime (JWT_EXPIRES_IN). */
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function baseOptions() {
  return {
    path: '/',
    sameSite: 'strict' as const,
    secure: env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE_MS,
  };
}

/** Issue (or refresh) the session pair for a freshly granted token. */
export function setSessionCookies(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, { ...baseOptions(), httpOnly: true });
  res.cookie(AUTH_FLAG_COOKIE, '1', baseOptions());
}

/** Drop both cookies (logout). Server-side revocation still applies. */
export function clearSessionCookies(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.clearCookie(AUTH_FLAG_COOKIE, { path: '/' });
}

/** Read the session token off the Cookie header. No cookie-parser dep needed. */
export function tokenFromCookies(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === SESSION_COOKIE) {
      const value = part.slice(idx + 1).trim();
      return value || null;
    }
  }
  return null;
}
