/**
 * Shared upline-chain loader (recursive CTE over the sponsor tree).
 * Used by the registration flow, settlements, and the accrual job.
 */
import { sql } from 'drizzle-orm';
import type { UplineMember } from '@copinex/engine';
import type { DbOrTx } from '../db/drizzle.js';

/**
 * Upline chain via recursive CTE: the member at level 0, sponsor at level 1 …
 * Returns members ascending by level. Every member is paid — earning is not
 * gated on Active status (Henry, 2026-09-26).
 */
export async function loadSponsorChain(tx: DbOrTx, userId: string, maxLevel: number): Promise<UplineMember[]> {
  const result = await tx.execute<{ id: string; level: number }>(sql`
    WITH RECURSIVE chain AS (
      SELECT id, sponsor_id, 0 AS level
      FROM users WHERE id = ${userId}
      UNION ALL
      SELECT u.id, u.sponsor_id, c.level + 1
      FROM users u
      JOIN chain c ON u.id = c.sponsor_id
      WHERE c.level < ${maxLevel} AND c.sponsor_id IS NOT NULL
    )
    SELECT id, level FROM chain WHERE level > 0 ORDER BY level
  `);
  return result.rows.map((r) => ({ userId: r.id, level: r.level }));
}