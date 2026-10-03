/**
 * Email transport tests: reply-to wiring, SMTP failure propagation, retry
 * behavior, and the dev fallback. Nodemailer itself is mocked — these pin OUR
 * code (what we pass to sendMail, what we do when verify/connect fails), not
 * the library. The live handshake is proven by `pnpm smtp-verify` and the
 * production boot probe, both of which speak to a real server.
 *
 * The env module is mocked with a per-test object: these tests must NOT
 * depend on the ambient dev .env (which legitimately carries real Mailgun
 * credentials — a test asserting "no SMTP_URL" would otherwise see them
 * through dotenv and fail for the wrong reason).
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

const testEnv = vi.hoisted(() => ({
  // 'development', not 'test': production code deliberately refuses to build
  // a real transporter under NODE_ENV=test (the suite must never send real
  // mail). These tests simulate a non-test runtime to exercise the transport.
  env: {
    NODE_ENV: 'development',
    EMAIL_FROM: 'sender@test.dev',
    APP_URL: 'http://localhost:3000',
    LOG_LEVEL: 'silent',
  } as Record<string, string | undefined>,
}));

vi.mock('../src/config/env.js', () => ({ env: testEnv.env }));

async function freshEmail() {
  vi.resetModules();
  return import('../src/services/email.js');
}

beforeEach(() => {
  vi.clearAllMocks();
  testEnv.env.NODE_ENV = 'development';
  testEnv.env.SMTP_URL = undefined;
  testEnv.env.EMAIL_REPLY_TO = undefined;
  testEnv.env.EMAIL_FROM = 'sender@test.dev';
});

describe('email transport', () => {
  it('passes from + reply-to through to sendMail', async () => {
    testEnv.env.SMTP_URL = 'smtp://user:pass@127.0.0.1:9';
    testEnv.env.EMAIL_REPLY_TO = 'support@test.dev';
    const { sendEmail } = await freshEmail();
    await sendEmail({ to: 'member@test.dev', subject: 'hi', text: 'hello' });
    expect(mocks.createTransport).toHaveBeenCalledTimes(1);
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'sender@test.dev',
        replyTo: 'support@test.dev',
        to: 'member@test.dev',
      }),
    );
  });

  it('omits replyTo when EMAIL_REPLY_TO is unset', async () => {
    testEnv.env.SMTP_URL = 'smtp://user:pass@127.0.0.1:9';
    const { sendEmail } = await freshEmail();
    await sendEmail({ to: 'member@test.dev', subject: 'hi', text: 'hello' });
    const args = mocks.sendMail.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args).not.toHaveProperty('replyTo');
  });

  it('verifySmtpConnection propagates a dead server instead of swallowing it', async () => {
    testEnv.env.SMTP_URL = 'smtp://user:pass@127.0.0.1:9';
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

  it('retries transient failures, then delivers', async () => {
    testEnv.env.SMTP_URL = 'smtp://user:pass@127.0.0.1:9';
    const transient = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    mocks.sendMail.mockRejectedValueOnce(transient).mockRejectedValueOnce(transient);
    const { sendEmail } = await freshEmail();
    const res = await sendEmail({ to: 'member@test.dev', subject: 'hi', text: 'hello' });
    expect(res.dev).toBe(false);
    expect(mocks.sendMail).toHaveBeenCalledTimes(3);
  }, 15000);

  it('never retries authentication failures — they cannot heal', async () => {
    testEnv.env.SMTP_URL = 'smtp://user:pass@127.0.0.1:9';
    mocks.sendMail.mockRejectedValueOnce(
      Object.assign(new Error('Invalid login'), { code: 'EAUTH', responseCode: 535 }),
    );
    const { sendEmail } = await freshEmail();
    await expect(sendEmail({ to: 'member@test.dev', subject: 'hi', text: 'hello' })).rejects.toThrow(
      /check SMTP_USER\/SMTP_PASS/,
    );
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
  });

  it('never retries 5xx rejections', async () => {
    testEnv.env.SMTP_URL = 'smtp://user:pass@127.0.0.1:9';
    mocks.sendMail.mockRejectedValueOnce(
      Object.assign(new Error('mailbox unavailable'), { responseCode: 550, response: '550 mailbox unavailable' }),
    );
    const { sendEmail } = await freshEmail();
    await expect(sendEmail({ to: 'member@test.dev', subject: 'hi', text: 'hello' })).rejects.toThrow(
      /rejected by the mail server/,
    );
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
  });

  it('bounds socket lifetimes so a dead host fails in seconds', async () => {
    testEnv.env.SMTP_URL = 'smtp://user:pass@127.0.0.1:9';
    const { sendEmail } = await freshEmail();
    await sendEmail({ to: 'member@test.dev', subject: 'hi', text: 'hello' });
    const options = mocks.createTransport.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options.host).toBe('127.0.0.1');
    expect(options.port).toBe(9);
    expect(options.secure).toBe(false);
    expect(options.connectionTimeout).toBeLessThanOrEqual(10_000);
    expect(options.socketTimeout).toBeLessThanOrEqual(15_000);
  });

  it('maps smtps:// to implicit TLS on 465 by default', async () => {
    testEnv.env.SMTP_URL = 'smtps://user:pass@mail.example.com';
    const { sendEmail } = await freshEmail();
    await sendEmail({ to: 'member@test.dev', subject: 'hi', text: 'hello' });
    const options = mocks.createTransport.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options.host).toBe('mail.example.com');
    expect(options.port).toBe(465);
    expect(options.secure).toBe(true);
  });

  it('under NODE_ENV=test no transporter is built even with SMTP_URL set', async () => {
    // Regression pin: dev .env legitimately carries live Mailgun credentials,
    // and dotenv feeds them to the suite. Without this guard every register()
    // in every suite would hit the real relay (slow, flaky, real sends).
    testEnv.env.NODE_ENV = 'test';
    testEnv.env.SMTP_URL = 'smtp://user:pass@127.0.0.1:9';
    const { sendEmail } = await freshEmail();
    const res = await sendEmail({ to: 'member@test.dev', subject: 'hi', text: 'hello' });
    expect(res.dev).toBe(true);
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });
});
