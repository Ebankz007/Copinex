import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  // The test suite NEVER sends real mail, regardless of what sits in .env —
  // registration flows would otherwise hit the live relay on every run
  // (slow, flaky, and real sends to fake addresses). Live delivery is proven
  // by `pnpm smtp-verify` and the production boot probe instead. Same rule
  // as payment mock mode (see isMockMode in payment-service.ts).
  if (!env.SMTP_URL || env.NODE_ENV === 'test') return null;
  if (!transporter) {
    // Parsed explicitly (rather than handing nodemailer the URL string) so
    // socket timeouts are first-class typed options and a malformed URL
    // fails here with a clear message, not deep inside the transport.
    const url = new URL(env.SMTP_URL);
    const secure = url.protocol === 'smtps:';
    transporter = nodemailer.createTransport({
      host: url.hostname,
      port: url.port ? Number(url.port) : secure ? 465 : 587,
      secure,
      auth: {
        user: decodeURIComponent(url.username),
        pass: decodeURIComponent(url.password),
      },
      // A dead host must fail in seconds, not hang the request for minutes.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    // The pool emits async 'error' events (dropped connections) that would
    // otherwise crash the process as unhandled. Log them; sendMail/verify
    // still report failures through their own rejections.
    transporter.on('error', (err) => {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, 'SMTP pool error');
    });
  }
  return transporter;
}

/**
 * Send an email. Without SMTP_URL this is the dev transport: the message is
 * logged and, in development, the caller receives the rendered body back so
 * the API can echo the link (testable end-to-end with no mail server).
 * In production, SMTP_URL is required — a missing transport is a hard error.
 *
 * Delivery is retried (3 attempts, 1s/3s backoff) on TRANSIENT failures only
 * — dropped connections, timeouts, 4xx replies (greylisting). Authentication
 * failures and 5xx rejections never heal on retry, so they fail immediately
 * with an actionable message instead of burning 4 seconds pretending.
 */
export async function sendEmail(msg: EmailMessage): Promise<{ dev: boolean; body: string }> {
  const t = getTransporter();
  if (!t) {
    const body = msg.html ?? msg.text;
    logger.info({ to: msg.to, subject: msg.subject }, '[dev-mail] ' + msg.text);
    if (env.NODE_ENV === 'production') {
      throw new Error('SMTP_URL is not configured — cannot deliver email in production');
    }
    return { dev: true, body };
  }
  const mail = {
    from: env.EMAIL_FROM,
    ...(env.EMAIL_REPLY_TO ? { replyTo: env.EMAIL_REPLY_TO } : {}),
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
  };
  const delays = [1000, 3000];
  for (let attempt = 1; ; attempt++) {
    try {
      await t.sendMail(mail);
      if (attempt > 1) logger.info({ to: msg.to, attempt }, 'email delivered after retry');
      return { dev: false, body: msg.html ?? msg.text };
    } catch (err) {
      if (isPermanentSmtpFailure(err) || attempt > delays.length) {
        throw new Error(describeSmtpFailure(err, msg.to), { cause: err });
      }
      logger.warn(
        { to: msg.to, attempt, nextRetryMs: delays[attempt - 1] },
        'email send transient failure — retrying',
      );
      await sleep(delays[attempt - 1]!);
    }
  }
}

/** Auth failures and 5xx rejections: retrying cannot help. Everything else (dropped connections, timeouts, 4xx) may heal. */
function isPermanentSmtpFailure(err: unknown): boolean {
  const code = (err as { code?: unknown }).code;
  if (code === 'EAUTH') return true;
  const responseCode = (err as { responseCode?: unknown }).responseCode;
  return typeof responseCode === 'number' && responseCode >= 500;
}

/** Translate nodemailer errors into messages that name the fix, not the symptom. */
function describeSmtpFailure(err: unknown, to: string): string {
  const code = (err as { code?: unknown }).code;
  if (code === 'EAUTH') {
    return `SMTP authentication failed sending to ${to} — check SMTP_USER/SMTP_PASS (Mailgun: regenerate the per-domain SMTP password; SMTP.com: sender password, not the account password)`;
  }
  if (code === 'ECONNECTION' || code === 'ETIMEDOUT' || code === 'ESOCKET') {
    return `SMTP connection to the mail host failed sending to ${to} — check host/port/TLS combo (587 STARTTLS vs 465 implicit TLS) and outbound firewall`;
  }
  const response = (err as { response?: unknown }).response;
  const detail = typeof response === 'string' ? `: ${response.slice(0, 160)}` : '';
  return `Email to ${to} was rejected by the mail server${detail}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Boot-time SMTP check (production only): connect + authenticate BEFORE the
 * API accepts traffic, so a bad password or unreachable host is a loud crash
 * at deploy time, not a silent reset-email black hole discovered by the
 * first locked-out member. Returns true when there is nothing to check
 * (no SMTP_URL — the production env guard already refuses that case).
 */
export async function verifySmtpConnection(): Promise<boolean> {
  const t = getTransporter();
  if (!t) return true;
  await t.verify();
  logger.info('SMTP connection verified');
  return true;
}

/** Build an absolute link to the web app (verification, reset, etc.). */
export function appUrl(path: string): string {
  return `${env.APP_URL.replace(/\/$/, '')}${path}`;
}