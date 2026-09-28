/**
 * Shared integration-test helpers.
 *
 * loginWithEnrollment mirrors what the web client does: POST /login, and when
 * the account hits the staff 2FA-enrolment gate, complete setup+enable with a
 * live TOTP code and return the minted session. Test files must use this for
 * any ADMIN/SUPERADMIN login — a raw /login no longer yields a token for
 * unenrolled staff, and that is the behaviour under test, not an obstacle to
 * route around.
 */
import request from 'supertest';
import type { Express } from 'express';
import { totpCode } from '../src/lib/totp.js';

/**
 * Enrolled secrets seen during this process, keyed by email — the test
 * double of an authenticator app. Lets the helper complete the login flow
 * no matter which gate answers: plain session, first-time enrolment, or a
 * second-factor challenge for an already-enrolled account.
 */
const enrolledSecrets = new Map<string, string>();

export async function loginWithEnrollment(
  app: Express,
  email: string,
  password = 'password123',
): Promise<{ token: string }> {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  if (res.body.requiresEnrollment && res.body.challenge) {
    const bearer = { Authorization: `Bearer ${res.body.challenge as string}` };
    const setup = await request(app).post('/api/auth/2fa/setup').set(bearer);
    if (setup.status !== 200) {
      throw new Error(`enrolment setup failed: ${setup.status} ${JSON.stringify(setup.body)}`);
    }
    enrolledSecrets.set(email, setup.body.manualKey as string);
    const enable = await request(app)
      .post('/api/auth/2fa/enable')
      .set(bearer)
      .send({ token: totpCode(setup.body.manualKey) });
    if (enable.status !== 200 || !enable.body.token) {
      throw new Error(`enrolment enable failed: ${enable.status} ${JSON.stringify(enable.body)}`);
    }
    return { token: enable.body.token as string };
  }
  if (res.body.requiresTwoFactor && res.body.challenge) {
    const secret = enrolledSecrets.get(email);
    if (!secret) throw new Error(`login needs a second factor for ${email} with no known secret`);
    const verify = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ challenge: res.body.challenge, token: totpCode(secret) });
    if (verify.status !== 200 || !verify.body.token) {
      throw new Error(`2fa verify failed: ${verify.status} ${JSON.stringify(verify.body)}`);
    }
    return { token: verify.body.token as string };
  }
  if (!res.body.token) throw new Error(`login yielded no token: ${JSON.stringify(res.body)}`);
  return { token: res.body.token as string };
}
