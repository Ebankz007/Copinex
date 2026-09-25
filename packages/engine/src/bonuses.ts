/**
 * Copinex Compensation Engine — Direct Referral Bonus (§3) & Generation Bonus (§4)
 *
 * §3 — Direct Referral: 30% of the registration fee ($15.00), one level, once,
 *      paid to the direct sponsor if Active, else compressed to the next
 *      qualified upline (§9.2). Never paid twice for the same registration.
 * §4 — Generation Bonus: 10% of the fee split across downline generations 2–6
 *      at 4/2/1.5/1.5/1% ($2.00/$1.00/$0.75/$0.75/$0.50). Each tier is paid to
 *      the Nth qualified (Active) upline, compression applied.
 *
 * Money rule: integer cents. All amounts derive from the fee × the spec rates,
 * so they can never drift from the §12 reconciliation invariants.
 */
import {
  COMMUNITY_POOL_SPLIT,
  GENERATION_LEVELS,
  GENERATION_RATES,
  REGISTRATION_FEE_CENTS,
} from './constants.js';
import { resolveQualifiedUpline } from './compression.js';
import type { DirectReferralPayout, GenerationPayout, UplineMember } from './types.js';

/** §3 — Direct Referral amount: 30% of the fee. */
export function computeDirectReferralAmountCents(feeCents: number = REGISTRATION_FEE_CENTS): number {
  if (!Number.isInteger(feeCents) || feeCents <= 0) {
    throw new Error(`computeDirectReferralAmountCents: feeCents must be a positive integer, got ${feeCents}`);
  }
  return feeCents * COMMUNITY_POOL_SPLIT.directReferral;
}

/**
 * §3 — Decide the Direct Referral payout for a registration.
 *
 * @param chain The new member's sponsor chain (level 1 = direct sponsor).
 * @returns recipientId = null when no qualified upline exists within the
 *          compression window — the $15 stays in the community pool.
 */
export function computeDirectReferralPayout(
  chain: UplineMember[],
  feeCents: number = REGISTRATION_FEE_CENTS,
): DirectReferralPayout {
  const amountCents = computeDirectReferralAmountCents(feeCents);
  const qualified = resolveQualifiedUpline(chain, 1);
  if (!qualified) return { recipientId: null, amountCents, compressed: false };
  return { recipientId: qualified.member.userId, amountCents, compressed: qualified.compressed };
}

/** §4 — Generation Bonus amount for one tier: fee × GENERATION_RATES[gen]. */
export function computeGenerationAmountCents(gen: number, feeCents: number = REGISTRATION_FEE_CENTS): number {
  const rate = GENERATION_RATES[gen];
  if (rate === undefined) {
    throw new Error(`computeGenerationAmountCents: no generation rate for gen ${gen}`);
  }
  if (!Number.isInteger(feeCents) || feeCents <= 0) {
    throw new Error(`computeGenerationAmountCents: feeCents must be a positive integer, got ${feeCents}`);
  }
  return feeCents * rate;
}

/**
 * §4 — Decide all Generation Bonus payouts (Gen 2–6) for a registration.
 *
 * @returns one payout per generation tier, in ascending generation order.
 *          recipientId = null when no qualified upline exists for that tier —
 *          that tier's share stays in the community pool.
 */
export function computeGenerationPayouts(
  chain: UplineMember[],
  feeCents: number = REGISTRATION_FEE_CENTS,
): GenerationPayout[] {
  return GENERATION_LEVELS.map((gen) => {
    const amountCents = computeGenerationAmountCents(gen, feeCents);
    const qualified = resolveQualifiedUpline(chain, gen);
    if (!qualified) return { generation: gen, recipientId: null, amountCents, compressed: false };
    return { generation: gen, recipientId: qualified.member.userId, amountCents, compressed: qualified.compressed };
  });
}