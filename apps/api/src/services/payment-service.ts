import { and, desc, eq } from 'drizzle-orm';
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
 * Parse a POST /v1/payment-requests success body. Shape verified live against
 * the sandbox 2026-10-01 (status 201): the checkout link is `checkout_url`
 * and the gateway-side id is `token`. Neighbouring names are accepted so a
 * rename fails loudly here (502) rather than storing a row with no way to
 * pay. Pure function — unit-pinned against the real payload shape.
 */
export function parsePaymentRequestResponse(data: unknown): {
  paymentUrl: string;
  gatewayTxid: string | null;
} {
  const body = (data ?? {}) as Record<string, unknown>;
  const url =
    typeof body.checkout_url === 'string'
      ? body.checkout_url
      : typeof body.payment_url === 'string'
        ? body.payment_url
        : typeof body.url === 'string'
          ? body.url
          : null;
  if (body.success === false || !url) {
    throw new HttpError(502, 'PAYMENT_GATEWAY_ERROR', 'Pay2Crypto returned an invalid payment-request response');
  }
  const txid = [body.token, body.txid, body.unique_id, body.id].find((v) => typeof v === 'string') as
    | string
    | undefined;
  return { paymentUrl: url, gatewayTxid: txid ?? null };
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
  const { gatewayTxid, paymentUrl } = await requestGatewayCheckout({
    paymentRef,
    amountCents: cents as number,
    purpose,
  });

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

/**
 * Call Pay2Crypto (or mock) for a checkout URL without touching the ledger.
 * Shared by creation and by checkout refresh so both paths speak the exact
 * same contract.
 */
async function requestGatewayCheckout(input: {
  paymentRef: string;
  amountCents: number;
  purpose: PaymentPurpose;
}): Promise<{ gatewayTxid: string | null; paymentUrl: string }> {
  if (isMockMode()) {
    const gatewayTxid = `mock-${randomUUID()}`;
    return { gatewayTxid, paymentUrl: `https://checkout.pay2crypto.com/?txid=${gatewayTxid}&mock=1` };
  }
  const body = buildPaymentRequestBody({
    paymentRef: input.paymentRef,
    amountCents: input.amountCents,
    purpose: input.purpose,
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
  // Shape verified live against the sandbox (see parsePaymentRequestResponse).
  const parsed = parsePaymentRequestResponse(await res.json());
  return { gatewayTxid: parsed.gatewayTxid, paymentUrl: parsed.paymentUrl };
}

/**
 * Checkout refresh: the button behind "Open checkout" calls the API first so
 * the member always lands on a LIVE checkout_url, never a stale stored one.
 *
 * Pay2Crypto requests expire after 1 hour, so a stored URL older than
 * CHECKOUT_FRESH_MINUTES is dead. A refresh issues a brand-new gateway
 * request (new reference — the old one expired server-side too) and updates
 * the SAME row: no duplicate PENDING rows, and the webhook join key stays
 * consistent because the row it joins on is rewritten, not forked.
 */
export const CHECKOUT_FRESH_MINUTES = 50;

export async function refreshCheckoutUrl(
  userId: string,
  paymentId: string,
): Promise<{ paymentUrl: string; refreshed: boolean }> {
  const [payment] = await db
    .select()
    .from(schema.payments)
    .where(and(eq(schema.payments.id, paymentId), eq(schema.payments.userId, userId)))
    .limit(1);
  if (!payment) throw new HttpError(404, 'NOT_FOUND', 'Payment not found');
  if (payment.status !== 'PENDING') {
    throw new HttpError(400, 'PAYMENT_NOT_PENDING', 'Only a pending payment can be checked out');
  }
  const ageMs = Date.now() - new Date(payment.createdAt).getTime();
  if (payment.paymentUrl && ageMs < CHECKOUT_FRESH_MINUTES * 60_000) {
    return { paymentUrl: payment.paymentUrl, refreshed: false };
  }
  const paymentRef = `COP-${randomUUID()}`;
  const { gatewayTxid, paymentUrl } = await requestGatewayCheckout({
    paymentRef,
    amountCents: payment.amountCents,
    purpose: payment.purpose as PaymentPurpose,
  });
  await db
    .update(schema.payments)
    .set({ paymentRef, gatewayTxid, paymentUrl })
    .where(eq(schema.payments.id, payment.id));
  return { paymentUrl, refreshed: true };
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

  // Amount verification when the gateway echoes it back. The sandbox echoes
  // a STRING ("1" for a $1 request), so accept numeric strings too — a
  // type-narrow check here would silently skip verification entirely.
  const echoed =
    typeof body.payment_amount === 'number'
      ? body.payment_amount
      : typeof body.payment_amount === 'string'
        ? Number(body.payment_amount)
        : NaN;
  if (Number.isFinite(echoed)) {
    const expected = payment.amountCents / 100;
    // Half-cent tolerance: float representation noise is ~1e-9, so anything
    // at or above this is a real discrepancy, not dust.
    if (Math.abs((echoed as number) - expected) >= 0.005) {
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