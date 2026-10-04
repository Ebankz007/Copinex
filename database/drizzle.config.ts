import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load the workspace-root .env explicitly. pnpm --filter runs scripts with
// CWD set to the package dir, so a bare dotenv/config would look for
// database/.env (absent) and silently fall back to the dev default —
// which is how production migrate once aimed at the wrong port.
dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env'),
});

export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://copinex:copinex_dev_password@127.0.0.1:5433/copinex',
  },
  strict: true,
  verbose: true,
});