import { Pool } from 'pg';
import { env } from '../config/env.js';

/** PostgreSQL connection pool. max=10 (burst ceiling per MMITPS learnings). */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Unexpected PG pool error:', err);
});