import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Load the workspace .env (platform/.env) regardless of CWD. Existing
// process env vars win — dotenv never overrides them.
dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env'),
});

/** Runtime-validated environment. Fails fast on missing required vars. */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  // No default: a missing secret must fail fast, never silently fall back to
  // a forgeable value. Generate with `openssl rand -base64 48`.
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  LOG_LEVEL: z.string().default('info'),
  // Public base URL used to build email links (verification, password reset).
  APP_URL: z.string().url().default('http://localhost:3000'),
  // Outbound email. Unset = dev transport: emails are logged to the console
  // and (development only) the API response carries the link so the full flow
  // is testable without a mail server. Set SMTP_URL for real delivery.
  SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().email().default('no-reply@copinex.com'),
  // Behind a reverse proxy (TLS terminates upstream), req.ip resolves to the
  // proxy unless Express trusts it — which collapses every member into one
  // rate-limit bucket and logs the proxy IP on every audit row. Set
  // TRUST_PROXY=1 in production. Leave 0 when the API is directly exposed,
  // or a client could spoof X-Forwarded-For past the limiters.
  TRUST_PROXY: z.coerce.boolean().default(false),
  // Pay2Crypto crypto payment rail (non-custodial, TRC20). Unset = mock mode:
  // createPayment returns a synthetic checkout URL and webhooks are simulated
  // in tests. Set all three for live operation.
  PAY2CRYPTO_API_URL: z.string().url().optional(),
  PAY2CRYPTO_TOKEN: z.string().min(1).optional(),
  PAY2CRYPTO_WEBHOOK_SECRET: z.string().min(16).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

/**
 * Production guard — refuse to boot on dev-only values. The cost of a
 * placeholder secret reaching production is forgeable tokens and fake
 * webhooks; the cost of a false boot failure is a visible crash. Fail loud.
 */
const DEV_PLACEHOLDERS: Array<{ name: string; value: string }> = [
  { name: 'JWT_SECRET', value: 'copinex-dev-secret-change-me-2026-09-25-32chars' },
  { name: 'PAY2CRYPTO_WEBHOOK_SECRET', value: 'copinex-dev-webhook-secret-0123456789' },
];

if (env.NODE_ENV === 'production') {
  const offenders = DEV_PLACEHOLDERS.filter((p) => process.env[p.name] === p.value);
  if (offenders.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      '❌ Refusing to boot in production with dev placeholder values:',
      offenders.map((o) => o.name).join(', '),
      '— generate real secrets (openssl rand -base64 48) and set them in the environment.',
    );
    process.exit(1);
  }
  // Mock payment mode must never serve real money. All three vars are required.
  if (!env.PAY2CRYPTO_API_URL || !env.PAY2CRYPTO_TOKEN) {
    // eslint-disable-next-line no-console
    console.error(
      '❌ Refusing to boot in production without the Pay2Crypto rail configured',
      '(PAY2CRYPTO_API_URL + PAY2CRYPTO_TOKEN). Mock mode is for development only.',
    );
    process.exit(1);
  }
}

export { env };