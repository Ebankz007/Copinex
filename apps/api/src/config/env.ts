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

export const env = parsed.data;