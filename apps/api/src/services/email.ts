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
  if (!env.SMTP_URL) return null;
  if (!transporter) transporter = nodemailer.createTransport(env.SMTP_URL);
  return transporter;
}

/**
 * Send an email. Without SMTP_URL this is the dev transport: the message is
 * logged and, in development, the caller receives the rendered body back so
 * the API can echo the link (testable end-to-end with no mail server).
 * In production, SMTP_URL is required — a missing transport is a hard error.
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
  await t.sendMail({
    from: env.EMAIL_FROM,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
  });
  return { dev: false, body: msg.html ?? msg.text };
}

/** Build an absolute link to the web app (verification, reset, etc.). */
export function appUrl(path: string): string {
  return `${env.APP_URL.replace(/\/$/, '')}${path}`;
}