/**
 * Email transport tests: reply-to wiring, SMTP failure propagation, and the
 * dev fallback. Nodemailer itself is mocked — these pin OUR code (what we
 * pass to sendMail, what we do when verify/connect fails), not the library.
 * The live handshake is proven by `pnpm smtp-verify` and the production
 * boot probe, both of which speak to a real server.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(async () => ({})),
  verify: vi.fn(async () => true),
  createTransport: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: (...args: unknown[]) => {
      mocks.createTransport(...args);
      return { sendMail: mocks.sendMail, verify: mocks.verify, on: () => undefined };
    },
  },
}));

async function freshEmail() {
  vi.resetModules();
  return import('../src/services/email.js');
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SMTP_URL;
  delete process.env.EMAIL_REPLY_TO;
});

describe('email transport', () => {
  it('passes from + reply-to through to sendMail', async () => {
    process.env.SMTP_URL = 'smtp://user:pass@127.0.0.1:9';
    process.env.EMAIL_REPLY_TO = 'support@copinex.com';
    const { sendEmail } = await freshEmail();
    await sendEmail({ to: 'member@test.dev', subject: 'hi', text: 'hello' });
    expect(mocks.createTransport).toHaveBeenCalledTimes(1);
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: expect.stringContaining('no-reply@copinex.com'),
        replyTo: 'support@copinex.com',
        to: 'member@test.dev',
      }),
    );
  });

  it('omits replyTo when EMAIL_REPLY_TO is unset', async () => {
    process.env.SMTP_URL = 'smtp://user:pass@127.0.0.1:9';
    const { sendEmail } = await freshEmail();
    await sendEmail({ to: 'member@test.dev', subject: 'hi', text: 'hello' });
    const args = mocks.sendMail.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args).not.toHaveProperty('replyTo');
  });

  it('verifySmtpConnection propagates a dead server instead of swallowing it', async () => {
    process.env.SMTP_URL = 'smtp://user:pass@127.0.0.1:9';
    mocks.verify.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:9'));
    const { verifySmtpConnection } = await freshEmail();
    await expect(verifySmtpConnection()).rejects.toThrow('ECONNREFUSED');
  });

  it('without SMTP_URL the dev transport logs instead of sending', async () => {
    const { sendEmail, verifySmtpConnection } = await freshEmail();
    await expect(verifySmtpConnection()).resolves.toBe(true);
    const res = await sendEmail({ to: 'member@test.dev', subject: 'hi', text: 'hello' });
    expect(res.dev).toBe(true);
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });
});
