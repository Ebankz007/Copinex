import { defineConfig } from 'vitest/config';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://copinex:copinex_dev_password@127.0.0.1:5433/copinex_test';

export default defineConfig({
  test: {
    globalSetup: './vitest.global-setup.ts',
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-at-least-32-characters-long!!',
      PAY2CRYPTO_WEBHOOK_SECRET: 'test-webhook-secret-0123456789',
      LOG_LEVEL: 'error',
    },
    // Shared test DB — serialize files to avoid truncation collisions.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});