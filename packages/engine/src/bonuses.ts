/**
 * Copinex Compensation Engine — Direct Referral Bonus (§3) & Generation Bonus (§4)
 *
 * §3 — Direct Referral: 30% of the registration fee ($15.00), one level, once,
 *      paid to the direct sponsor. Never paid twice for the same registration.
 * §4 — Generation Bonus: 10% of the fee split across downline generations 2–6
 *      at 4/2/1.5/1.5/1% ($2.00/$1.00/$0.75/$0.75/$0.50). Each tier is paid to
 *      the natural member at that generation level.
 *
 * Earning rule (Henry, 2026-09-26): every account earns regardless of Active
 * status. No compression, no sponsor override — the natural recipient at each
 * level is paid. When no member exists at a level, that tier's share stays in
 * the community pool.
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
 * @returns recipientId = null when the member has no direct sponsor — the $15
 *          stays in the community pool.
 */
export function computeDirectReferralPayout(
  chain: UplineMember[],
  feeCents: number = REGISTRATION_FEE_CENTS,
): DirectReferralPayout {
  const amountCents = computeDirectReferralAmountCents(feeCents);
  const sponsor = chain.find((m) => m.level === 1);
  return sponsor
    ? { recipientId: sponsor.userId, amountCents }
    : { recipientId: null, amountCents };
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
 *          recipientId = null when the chain has no member at that level —
 *          that tier's share stays in the community pool.
 */
export function computeGenerationPayouts(
  chain: UplineMember[],
  feeCents: number = REGISTRATION_FEE_CENTS,
): GenerationPayout[] {
  return GENERATION_LEVELS.map((gen) => {
    const amountCents = computeGenerationAmountCents(gen, feeCents);
    const member = chain.find((m) => m.level === gen);
    return member
      ? { generation: gen, recipientId: member.userId, amountCents }
      : { generation: gen, recipientId: null, amountCents };
  });
}