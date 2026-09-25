/**
 * Shared upline-chain loader (recursive CTE over the sponsor tree).
 * Used by the registration flow, settlements, and the ranks job.
 */
import { sql } from 'drizzle-orm';
import type { UplineMember } from '@copinex/engine';
import type { DbOrTx } from '../db/drizzle.js';

/**
 * Upline chain via recursive CTE: the member at level 0, sponsor at level 1 …
 * Returns members ascending by level, including INACTIVE members — compression
 * (engine §9.2) decides who actually gets paid.
 */
export async function loadSponsorChain(tx: DbOrTx, userId: string, maxLevel: number): Promise<UplineMember[]> {
  const result = await tx.execute<{ id: string; level: number; is_active: boolean }>(sql`
    WITH RECURSIVE chain AS (
      SELECT id, sponsor_id, is_active, 0 AS level
      FROM users WHERE id = ${userId}
      UNION ALL
      SELECT u.id, u.sponsor_id, u.is_active, c.level + 1
      FROM users u
      JOIN chain c ON u.id = c.sponsor_id
      WHERE c.level < ${maxLevel} AND c.sponsor_id IS NOT NULL
    )
    SELECT id, level, is_active FROM chain WHERE level > 0 ORDER BY level
  `);
  return result.rows.map((r) => ({ userId: r.id, level: r.level, isActive: r.is_active }));
}