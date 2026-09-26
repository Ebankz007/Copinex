/**
 * §3 — Direct Referral Bonus & §4 — Generation Bonus.
 * Extends §11 Test Case 1 (single direct referral) to the full bonus tree.
 *
 * Earning rule (Henry, 2026-09-26): every account earns regardless of Active
 * status — the natural recipient at each level is paid, no compression.
 */
import { describe, expect, it } from 'vitest';
import {
  computeDirectReferralAmountCents,
  computeDirectReferralPayout,
  computeGenerationAmountCents,
  computeGenerationPayouts,
} from '../src/bonuses.js';
import type { UplineMember } from '../src/types.js';

/** Build a chain: each entry is [level]; userId = `u${level}`. */
function chain(...levels: number[]): UplineMember[] {
  return levels.map((level) => ({ userId: `u${level}`, level }));
}

describe('§3 Direct Referral Bonus', () => {
  it('pays $15.00 (30% of the $50 fee) to the direct sponsor', () => {
    const payout = computeDirectReferralPayout(chain(1));
    expect(payout).toEqual({ recipientId: 'u1', amountCents: 15_00 });
  });

  it('amount derives from the fee × 30%', () => {
    expect(computeDirectReferralAmountCents()).toBe(15_00);
    expect(computeDirectReferralAmountCents(10_000)).toBe(30_00);
  });

  it('is not paid when the member has no direct sponsor', () => {
    const payout = computeDirectReferralPayout([]);
    expect(payout).toEqual({ recipientId: null, amountCents: 15_00 });
  });
});

describe('§4 Generation Bonus', () => {
  it('pays Gen 2–6 at 4/2/1.5/1.5/1% of the fee', () => {
    expect(computeGenerationAmountCents(2)).toBe(2_00);
    expect(computeGenerationAmountCents(3)).toBe(1_00);
    expect(computeGenerationAmountCents(4)).toBe(75);
    expect(computeGenerationAmountCents(5)).toBe(75);
    expect(computeGenerationAmountCents(6)).toBe(50);
  });

  it('rejects an unknown generation tier', () => {
    expect(() => computeGenerationAmountCents(1)).toThrow();
    expect(() => computeGenerationAmountCents(7)).toThrow();
  });

  it('pays the full tree on a 6-level chain (TC1 extended)', () => {
    const payouts = computeGenerationPayouts(chain(1, 2, 3, 4, 5, 6));
    expect(payouts).toEqual([
      { generation: 2, recipientId: 'u2', amountCents: 2_00 },
      { generation: 3, recipientId: 'u3', amountCents: 1_00 },
      { generation: 4, recipientId: 'u4', amountCents: 75 },
      { generation: 5, recipientId: 'u5', amountCents: 75 },
      { generation: 6, recipientId: 'u6', amountCents: 50 },
    ]);
    // §12: generation pool = $5.00 exactly.
    const total = payouts.reduce((sum, p) => sum + p.amountCents, 0);
    expect(total).toBe(5_00);
  });

  it('leaves a tier unpaid (recipientId null) when the chain has no member at that level', () => {
    const payouts = computeGenerationPayouts(chain(1));
    expect(payouts).toHaveLength(5);
    for (const p of payouts) {
      expect(p.recipientId).toBeNull();
      expect(p.amountCents).toBeGreaterThan(0);
    }
  });

  it('reconciles: direct + full generation tree = 40% of the fee ($20.00)', () => {
    const direct = computeDirectReferralPayout(chain(1, 2, 3, 4, 5, 6));
    const gens = computeGenerationPayouts(chain(1, 2, 3, 4, 5, 6));
    const genTotal = gens.reduce((sum, p) => sum + p.amountCents, 0);
    expect(direct.amountCents + genTotal).toBe(20_00);
  });
});