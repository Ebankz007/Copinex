/**
 * Admin audit trail (R27) — append-only record of every mutating admin action.
 *
 * Written AFTER the action succeeds, so the log reflects reality (no noise
 * from failed attempts). Fail-open by design: a broken audit write must never
 * block a money action — but the failure is logged loudly so ops notices.
 *
 * The `details` JSON is a snapshot of the request body (money amounts, notes,
 * payout txids, …) so a dispute can be reconstructed even if the live row
 * changes later. Never include secrets here — admin bodies are ids + amounts.
 */
import { desc, eq } from 'drizzle-orm';
import * as schema from '@copinex/database';
import { db } from '../db/drizzle.js';
import { logger } from '../config/logger.js';

export type AdminAuditAction =
  | 'PACKAGE_CREATE'
  | 'PACKAGE_UPDATE'
  | 'INVESTMENT_CLOSE'
  | 'WALLET_DEPOSIT'
  | 'WITHDRAWAL_APPROVE'
  | 'WITHDRAWAL_REJECT'
  | 'SETTLEMENT_RECORD'
  | 'MILESTONE_PAY'
  | 'LEADERSHIP_FULFILL'
  | 'BROKER_CREATE'
  | 'BROKER_DEACTIVATE'
  | 'MEMBER_ACTIVATE';

export interface AuditEntry {
  adminId: string;
  action: AdminAuditAction;
  targetType: string;
  /** The target row id — undefined when the action has no single target. */
  targetId: string | undefined;
  /** Request body snapshot — omit when the action carries no body. */
  details?: unknown;
  /** Client IP — undefined when Express cannot resolve one. */
  ip: string | undefined;
}

export async function logAdminAction(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(schema.adminAuditLog).values({
      adminId: entry.adminId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      details: entry.details === undefined ? null : entry.details,
      ip: entry.ip ?? 'unknown',
    });
  } catch (e) {
    logger.error({ err: e, action: entry.action }, 'admin audit log write failed');
  }
}

/** Most recent audit entries, newest first. Cap 500 — the trail is append-only. */
export async function listAuditLog(limit = 100): Promise<
  Array<{
    id: string;
    adminId: string;
    adminEmail: string | null;
    action: string;
    targetType: string;
    targetId: string | null;
    details: unknown;
    ip: string;
    createdAt: Date;
  }>
> {
  const capped = Math.min(Math.max(limit, 1), 500);
  const rows = await db
    .select({
      id: schema.adminAuditLog.id,
      adminId: schema.adminAuditLog.adminId,
      adminEmail: schema.users.email,
      action: schema.adminAuditLog.action,
      targetType: schema.adminAuditLog.targetType,
      targetId: schema.adminAuditLog.targetId,
      details: schema.adminAuditLog.details,
      ip: schema.adminAuditLog.ip,
      createdAt: schema.adminAuditLog.createdAt,
    })
    .from(schema.adminAuditLog)
    .leftJoin(schema.users, eq(schema.users.id, schema.adminAuditLog.adminId))
    .orderBy(desc(schema.adminAuditLog.createdAt))
    .limit(capped);
  return rows;
}