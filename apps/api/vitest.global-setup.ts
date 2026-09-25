import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://copinex:copinex_dev_password@127.0.0.1:5433/copinex_test';

/**
 * Runs before the test suite: applies migrations to the TEST database and
 * seeds packages + config using the real seed script.
 */
export default async function globalSetup() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = path.resolve(here, '../../database/migrations');
  const root = path.resolve(here, '../../..');

  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder });
  await pool.end();

  execSync('pnpm --filter @copinex/database seed', {
    cwd: root,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });
}