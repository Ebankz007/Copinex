/**
 * SMTP credential check without booting the API.
 *
 * Usage: pnpm --filter @copinex/api smtp-verify
 *
 * Loads the same env validation as production, prints the connection summary
 * with credentials REDACTED (scheme/host/port/TLS only — the username and
 * password never touch stdout), then runs the same connect+auth verification
 * the production boot performs. Exit 0 = mail will flow; exit 1 = it won't,
 * with the reason.
 */
import { env } from '../config/env.js';
import { verifySmtpConnection } from '../services/email.js';

async function main(): Promise<void> {
  if (!env.SMTP_URL) {
    console.log('No SMTP_URL configured — dev transport active (mail is logged, not sent).');
    return;
  }
  const url = new URL(env.SMTP_URL);
  const tls = url.protocol === 'smtps:' ? 'implicit TLS' : 'STARTTLS';
  console.log(`Checking ${url.protocol}//${url.host} (${tls}) as ${url.username || '(no username)'} …`);
  console.log(`From: ${env.EMAIL_FROM}${env.EMAIL_REPLY_TO ? ` | Reply-To: ${env.EMAIL_REPLY_TO}` : ' | Reply-To: (unset — replies bounce)'}`);
  await verifySmtpConnection();
  console.log('OK — SMTP connect + auth succeeded.');
}

main().catch((err: unknown) => {
  console.error(`FAIL — ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
