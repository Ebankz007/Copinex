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
 *
 * Self-sufficient: creates the test database if it does not exist (fresh
 * machines, CI service containers that only provision the primary DB).
 */
export default async function globalSetup() {
  await ensureTestDatabase();

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

/** Create the test database if missing (connect via the `postgres` maintenance DB). */
async function ensureTestDatabase() {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);
  if (!/^[a-z_][a-z0-9_]*$/.test(dbName)) {
    throw new Error(`Unsafe database name in TEST_DATABASE_URL: ${dbName}`);
  }

  const maintenanceUrl = new URL(TEST_DATABASE_URL);
  maintenanceUrl.pathname = '/postgres';
  const admin = new Pool({ connectionString: maintenanceUrl.toString() });
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount === 0) {
      await admin.query(`CREATE DATABASE ${dbName}`);
    }
  } finally {
    await admin.end();
  }
}