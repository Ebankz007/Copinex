import { and, eq } from 'drizzle-orm';
import * as schema from '@copinex/database';
import type { DbOrTx } from '../db/drizzle.js';
import { HttpError } from '../lib/http-error.js';

/** Ensure both wallets (COPINEX + WITHDRAWAL) exist for a user. Idempotent. */
export async function ensureWallets(tx: DbOrTx, userId: string): Promise<void> {
  await tx
    .insert(schema.wallets)
    .values([
      { userId, walletType: 'COPINEX', balanceCents: 0 },
      { userId, walletType: 'WITHDRAWAL', balanceCents: 0 },
    ])
    .onConflictDoNothing({ target: [schema.wallets.userId, schema.wallets.walletType] });
}

/**
 * Credit a wallet inside a transaction with a matching ledger entry.
 * Locks the wallet row (SELECT FOR UPDATE) to stay race-safe.
 */
export async function creditWallet(
  tx: DbOrTx,
  userId: string,
  walletType: 'COPINEX' | 'WITHDRAWAL',
  amountCents: number,
  type: (typeof schema.bonusTypeEnum.enumValues)[number],
  sourceType: string,
  sourceId: string,
  at: Date,
): Promise<void> {
  const [wallet] = await tx
    .select()
    .from(schema.wallets)
    .where(and(eq(schema.wallets.userId, userId), eq(schema.wallets.walletType, walletType)))
    .for('update')
    .limit(1);

  if (!wallet) {
    await tx.insert(schema.wallets).values({ userId, walletType, balanceCents: amountCents });
    await tx.insert(schema.ledgerEntries).values({
      userId,
      walletType,
      type,
      amountCents,
      balanceAfterCents: amountCents,
      sourceType,
      sourceId,
      createdAt: at,
    });
    return;
  }

  const newBalance = wallet.balanceCents + amountCents;
  await tx
    .update(schema.wallets)
    .set({ balanceCents: newBalance, version: wallet.version + 1 })
    .where(eq(schema.wallets.id, wallet.id));

  await tx.insert(schema.ledgerEntries).values({
    userId,
    walletType,
    type,
    amountCents,
    balanceAfterCents: newBalance,
    sourceType,
    sourceId,
    createdAt: at,
  });
}

/**
 * Debit a wallet inside a transaction with a matching ledger entry.
 * Locks the wallet row (SELECT FOR UPDATE) and refuses to go negative.
 */
export async function debitWallet(
  tx: DbOrTx,
  userId: string,
  walletType: 'COPINEX' | 'WITHDRAWAL',
  amountCents: number,
  type: (typeof schema.bonusTypeEnum.enumValues)[number],
  sourceType: string,
  sourceId: string,
  at: Date,
): Promise<void> {
  const [wallet] = await tx
    .select()
    .from(schema.wallets)
    .where(and(eq(schema.wallets.userId, userId), eq(schema.wallets.walletType, walletType)))
    .for('update')
    .limit(1);

  if (!wallet) throw new HttpError(409, 'WALLET_MISSING', `${walletType} wallet not found`);
  if (wallet.balanceCents < amountCents) {
    throw new HttpError(
      400,
      'INSUFFICIENT_FUNDS',
      `Insufficient ${walletType} balance ($${(wallet.balanceCents / 100).toFixed(2)} available)`,
    );
  }

  const newBalance = wallet.balanceCents - amountCents;
  await tx
    .update(schema.wallets)
    .set({ balanceCents: newBalance, version: wallet.version + 1 })
    .where(eq(schema.wallets.id, wallet.id));

  await tx.insert(schema.ledgerEntries).values({
    userId,
    walletType,
    type,
    amountCents: -amountCents,
    balanceAfterCents: newBalance,
    sourceType,
    sourceId,
    createdAt: at,
  });
}