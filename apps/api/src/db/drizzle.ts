import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '@copinex/database';
import { pool } from './pool.js';

/** Drizzle instance bound to the shared pg pool and full schema. */
export const db = drizzle(pool, { schema });

/** The transaction type used by db.transaction callbacks. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Either the pool-backed db or a transaction — for helpers usable in both. */
export type DbOrTx = typeof db | Tx;