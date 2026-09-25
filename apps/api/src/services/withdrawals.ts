import { and, asc, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import * as schema from '@copinex/database';
import { db } from '../db/drizzle.js';
import { HttpError } from '../lib/http-error.js';
import { creditWallet, debitWallet, ensureWallets } from './wallets.js';

/** Sanity ceiling: $1,000,000 per withdrawal request (integer cents). */
const MAX_WITHDRAWAL_CENTS = 100_000_000;
const WALLET_TYPES = ['COPINEX', 'WITHDRAWAL'] as const;

type WalletType = (typeof WALLET_TYPES)[number];

function assertWalletType(value: unknown): asserts value is WalletType {
  if (typeof value !== 'string' || !(WALLET_TYPES as readonly string[]).includes(value)) {
    throw new HttpError(400, 'INVALID_WALLET', 'walletType must be COPINEX or WITHDRAWAL');
  }
}

// ── Member ─────────────────────────────────────────────

/**
 * Request a withdrawal. The funds are held immediately (debited from the
 * wallet) and the request enters PENDING — an admin approves (money leaves
 * the platform) or rejects (funds are refunded). No payment provider is
 * wired yet; approval is the manual payout trigger.
 */
export async function requestWithdrawal(userId: string, walletType: unknown, amountCents: number) {
  assertWalletType(walletType);
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > MAX_WITHDRAWAL_CENTS) {
    throw new HttpError(400, 'INVALID_AMOUNT', 'Amount must be a positive integer up to $1,000,000');
  }

  return db.transaction(async (tx) => {
    await ensureWallets(tx, userId);

    const requestId = randomUUID();
    const now = new Date();

    await debitWallet(
      tx,
      userId,
      walletType,
      amountCents,
      'WITHDRAWAL',
      'withdrawal',
      requestId,
      now,
    );

    const [request] = await tx
      .insert(schema.withdrawalRequests)
      .values({
        id: requestId,
        userId,
        walletType,
        amountCents,
        status: 'PENDING',
        createdAt: now,
      })
      .returning();
    if (!request) throw new HttpError(500, 'INTERNAL_ERROR', 'Failed to create withdrawal request');

    return request;
  });
}

export async function listMyWithdrawals(userId: string) {
  return db
    .select()
    .from(schema.withdrawalRequests)
    .where(eq(schema.withdrawalRequests.userId, userId))
    .orderBy(desc(schema.withdrawalRequests.createdAt));
}

/** Both wallet balances + the total held in pending withdrawals. */
export async function getWalletBalances(userId: string) {
  await ensureWallets(db, userId);

  const wallets = await db
    .select()
    .from(schema.wallets)
    .where(eq(schema.wallets.userId, userId))
    .orderBy(asc(schema.wallets.walletType));

  const pending = await db
    .select({ amountCents: schema.withdrawalRequests.amountCents })
    .from(schema.withdrawalRequests)
    .where(
      and(
        eq(schema.withdrawalRequests.userId, userId),
        eq(schema.withdrawalRequests.status, 'PENDING'),
      ),
    );

  const pendingWithdrawalCents = pending.reduce((sum, r) => sum + r.amountCents, 0);

  return {
    wallets: wallets.map((w) => ({
      walletType: w.walletType,
      balanceCents: w.balanceCents,
      currency: w.currency,
    })),
    pendingWithdrawalCents,
  };
}

// ── Admin ──────────────────────────────────────────────

/** Admin deposit: credits the member's COPINEX wallet (interim money rail). */
export async function adminDeposit(userId: string, amountCents: number, adminId: string, note?: string) {
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > MAX_WITHDRAWAL_CENTS) {
    throw new HttpError(400, 'INVALID_AMOUNT', 'Amount must be a positive integer up to $1,000,000');
  }

  return db.transaction(async (tx) => {
    await ensureWallets(tx, userId);

    const depositId = randomUUID();
    const now = new Date();

    await creditWallet(tx, userId, 'COPINEX', amountCents, 'DEPOSIT', 'admin_deposit', depositId, now);

    return { id: depositId, userId, amountCents, note: note ?? null, createdAt: now };
  });
}

export async function listWithdrawals(status?: string) {
  const where =
    typeof status === 'string' && ['PENDING', 'PAID', 'REJECTED'].includes(status)
      ? eq(schema.withdrawalRequests.status, status as 'PENDING' | 'PAID' | 'REJECTED')
      : undefined;
  return db
    .select({
      request: schema.withdrawalRequests,
      user: {
        id: schema.users.id,
        email: schema.users.email,
        fullName: schema.users.fullName,
      },
    })
    .from(schema.withdrawalRequests)
    .innerJoin(schema.users, eq(schema.withdrawalRequests.userId, schema.users.id))
    .where(where)
    .orderBy(desc(schema.withdrawalRequests.createdAt));
}

/** Approve a PENDING withdrawal: funds already left the wallet — this marks the manual payout done. */
export async function approveWithdrawal(requestId: string, adminId: string) {
  const [request] = await db
    .select()
    .from(schema.withdrawalRequests)
    .where(eq(schema.withdrawalRequests.id, requestId))
    .limit(1);
  if (!request) throw new HttpError(404, 'NOT_FOUND', 'Withdrawal request not found');
  if (request.status !== 'PENDING') {
    throw new HttpError(409, 'ALREADY_REVIEWED', `Withdrawal is already ${request.status}`);
  }

  const [updated] = await db
    .update(schema.withdrawalRequests)
    .set({ status: 'PAID', adminId, reviewedAt: new Date() })
    .where(eq(schema.withdrawalRequests.id, requestId))
    .returning();
  return updated;
}

/** Reject a PENDING withdrawal: refund the held funds to the wallet. */
export async function rejectWithdrawal(requestId: string, adminId: string) {
  return db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(schema.withdrawalRequests)
      .where(eq(schema.withdrawalRequests.id, requestId))
      .for('update')
      .limit(1);
    if (!request) throw new HttpError(404, 'NOT_FOUND', 'Withdrawal request not found');
    if (request.status !== 'PENDING') {
      throw new HttpError(409, 'ALREADY_REVIEWED', `Withdrawal is already ${request.status}`);
    }

    await creditWallet(
      tx,
      request.userId,
      request.walletType,
      request.amountCents,
      'WITHDRAWAL_REFUND',
      'withdrawal',
      requestId,
      new Date(),
    );

    const [updated] = await tx
      .update(schema.withdrawalRequests)
      .set({ status: 'REJECTED', adminId, reviewedAt: new Date() })
      .where(eq(schema.withdrawalRequests.id, requestId))
      .returning();
    return updated;
  });
}