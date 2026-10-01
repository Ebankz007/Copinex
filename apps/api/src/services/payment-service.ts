import { desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import * as schema from '@copinex/database';
import { db } from '../db/drizzle.js';
import { env } from '../config/env.js';
import { HttpError } from '../lib/http-error.js';
import { creditWallet, ensureWallets } from './wallets.js';
import { applyActivation } from './members.js';

/** The one-time membership activation fee (Active Member policy). */
export const ACTIVATION_FEE_CENTS = 5000;

const MAX_PAYMENT_CENTS = 100_000_000; // $1,000,000

const PURPOSES = ['ACTIVATION', 'DEPOSIT'] as const;
export type PaymentPurpose = (typeof PURPOSES)[number];

function isMockMode(): boolean {
  return !env.PAY2CRYPTO_API_URL || !env.PAY2CRYPTO_TOKEN;
}

/**
 * Create a crypto payment invoice via Pay2Crypto (non-custodial, TRC20).
 * Mock mode (no credentials configured) returns a synthetic checkout URL so
 * the full flow is testable before the merchant token exists.
 */
export interface Pay2CryptoRequestBody {
  amount: string;
  asset: 'USDT';
  network: 'trc20';
  reference: string;
  description: string;
  return_url: string;
}

/**
 * The exact POST /v1/payment-requests contract (pinned 2026-09-28 from the
 * merchant integration snippet — amount is a 2-decimal STRING, not a number).
 * Pure function so the contract is unit-pinned without touching the network.
 */
export function buildPaymentRequestBody(input: {
  paymentRef: string;
  amountCents: number;
  purpose: PaymentPurpose;
  returnUrl: string;
}): Pay2CryptoRequestBody {
  const dollars = (input.amountCents / 100).toFixed(2);
  const description =
    input.purpose === 'ACTIVATION'
      ? `Copinex membership activation — $${dollars}`
      : `Copinex wallet deposit — $${dollars}`;
  return {
    amount: dollars,
    asset: 'USDT',
    network: 'trc20',
    reference: input.paymentRef,
    description,
    return_url: input.returnUrl,
  };
}

export async function createPayment(userId: string, purpose: PaymentPurpose, amountCents?: number) {
  const cents = purpose === 'ACTIVATION' ? ACTIVATION_FEE_CENTS : amountCents;
  if (purpose === 'DEPOSIT' && (!Number.isInteger(cents) || (cents as number) <= 0 || (cents as number) > MAX_PAYMENT_CENTS)) {
    throw new HttpError(400, 'INVALID_AMOUNT', 'Deposit amount must be a positive integer up to $1,000,000');
  }

  const paymentRef = `COP-${randomUUID()}`;

  let gatewayTxid: string | null = null;
  let paymentUrl: string;

  if (isMockMode()) {
    gatewayTxid = `mock-${randomUUID()}`;
    paymentUrl = `https://checkout.pay2crypto.com/?txid=${gatewayTxid}&mock=1`;
  } else {
    const body = buildPaymentRequestBody({
      paymentRef,
      amountCents: cents as number,
      purpose,
      returnUrl: `${env.APP_URL}/wallet`,
    });
    const res = await fetch(`${env.PAY2CRYPTO_API_URL}/v1/payment-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.PAY2CRYPTO_TOKEN}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new HttpError(
        502,
        'PAYMENT_GATEWAY_ERROR',
        `Pay2Crypto payment request failed: ${res.status} ${text.slice(0, 200)}`,
      );
    }
    // Defensive parse: the documented invoice response carries payment_url +
    // txid/unique_id, but accept the neighbouring field names rather than
    // 500 on a rename.
    const data = (await res.json()) as Record<string, unknown>;
    const url =
      typeof data.payment_url === 'string'
        ? data.payment_url
        : typeof data.checkout_url === 'string'
          ? data.checkout_url
          : typeof data.url === 'string'
            ? data.url
            : null;
    if (data.success === false || !url) {
      throw new HttpError(502, 'PAYMENT_GATEWAY_ERROR', 'Pay2Crypto returned an invalid payment-request response');
    }
    const txid = [data.txid, data.unique_id, data.id].find((v) => typeof v === 'string') as string | undefined;
    gatewayTxid = txid ?? null;
    paymentUrl = url;
  }

  const [payment] = await db
    .insert(schema.payments)
    .values({
      userId,
      purpose,
      amountCents: cents as number,
      paymentRef,
      gatewayTxid,
      paymentUrl,
      status: 'PENDING',
    })
    .returning();
  return payment;
}

/** The member's own payment history, newest first. */
export async function listMyPayments(userId: string) {
  return db
    .select()
    .from(schema.payments)
    .where(eq(schema.payments.userId, userId))
    .orderBy(desc(schema.payments.createdAt));
}

/**
 * Pay2Crypto confirmation webhook. Idempotent: a PAID payment is a no-op.
 * The exact payload shape is pinned during sandbox testing — extraction is
 * deliberately defensive (payment_ref is the join key the gateway echoes).
 */
export async function handlePaymentWebhook(payload: unknown) {
  const body = (payload ?? {}) as Record<string, unknown>;
  const paymentRef = typeof body.payment_ref === 'string' ? body.payment_ref : undefined;
  const txHash = typeof body.tx_hash === 'string' ? body.tx_hash : undefined;
  const status = typeof body.status === 'string' ? body.status : undefined;

  if (!paymentRef) throw new HttpError(400, 'INVALID_WEBHOOK', 'Missing payment_ref');

  // Non-final statuses (broadcast, pending, etc.) are acknowledged, not applied.
  if (status && !['confirmed', 'paid', 'success', 'PAID', 'completed'].includes(status.toLowerCase())) {
    return { applied: false, reason: 'non-final status' };
  }

  const [payment] = await db
    .select()
    .from(schema.payments)
    .where(eq(schema.payments.paymentRef, paymentRef))
    .limit(1);
  if (!payment) throw new HttpError(404, 'NOT_FOUND', 'Unknown payment_ref');

  if (payment.status === 'PAID') return { applied: false, reason: 'already paid' };

  // Amount verification when the gateway echoes it back.
  if (typeof body.payment_amount === 'number') {
    const expected = payment.amountCents / 100;
    if (Math.abs(body.payment_amount - expected) > 0.01) {
      throw new HttpError(400, 'AMOUNT_MISMATCH', `Payment amount ${body.payment_amount} != expected ${expected}`);
    }
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(schema.payments)
      .set({ status: 'PAID', paidAt: now, txHash: txHash ?? null })
      .where(eq(schema.payments.id, payment.id));

    if (payment.purpose === 'ACTIVATION') {
      // Same code path as the admin activation rail.
      await applyActivation(tx, payment.userId, now);
    } else {
      await ensureWallets(tx, payment.userId);
      await creditWallet(
        tx,
        payment.userId,
        'COPINEX',
        payment.amountCents,
        'DEPOSIT',
        'crypto_payment',
        payment.id,
        now,
      );
    }
  });

  return { applied: true, purpose: payment.purpose, userId: payment.userId };
}