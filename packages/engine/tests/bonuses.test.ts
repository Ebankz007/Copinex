/**
 * §3 — Direct Referral Bonus & §4 — Generation Bonus, with §9.2 compression.
 * Extends §11 Test Case 1 (single direct referral) to the full bonus tree.
 */
import { describe, expect, it } from 'vitest';
import {
  computeDirectReferralAmountCents,
  computeDirectReferralPayout,
  computeGenerationAmountCents,
  computeGenerationPayouts,
} from '../src/bonuses.js';
import type { UplineMember } from '../src/types.js';

/** Build a chain: each entry is [level, isActive]; userId = `u${level}`. */
function chain(...members: Array<[level: number, isActive: boolean]>): UplineMember[] {
  return members.map(([level, isActive]) => ({ userId: `u${level}`, level, isActive }));
}

describe('§3 Direct Referral Bonus', () => {
  it('pays $15.00 (30% of the $50 fee) to the active direct sponsor', () => {
    const payout = computeDirectReferralPayout(chain([1, true]));
    expect(payout).toEqual({ recipientId: 'u1', amountCents: 15_00, compressed: false });
  });

  it('amount derives from the fee × 30%', () => {
    expect(computeDirectReferralAmountCents()).toBe(15_00);
    expect(computeDirectReferralAmountCents(10_000)).toBe(30_00);
  });

  it('compresses to the next qualified upline when the sponsor is inactive', () => {
    const payout = computeDirectReferralPayout(chain([1, false], [2, true]));
    expect(payout).toEqual({ recipientId: 'u2', amountCents: 15_00, compressed: true });
  });

  it('is not paid when no qualified upline exists within the window', () => {
    const payout = computeDirectReferralPayout(chain([1, false], [2, false]));
    expect(payout).toEqual({ recipientId: null, amountCents: 15_00, compressed: false });
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

  it('pays the full tree on a fully-active 6-level chain (TC1 extended)', () => {
    const payouts = computeGenerationPayouts(chain([1, true], [2, true], [3, true], [4, true], [5, true], [6, true]));
    expect(payouts).toEqual([
      { generation: 2, recipientId: 'u2', amountCents: 2_00, compressed: false },
      { generation: 3, recipientId: 'u3', amountCents: 1_00, compressed: false },
      { generation: 4, recipientId: 'u4', amountCents: 75, compressed: false },
      { generation: 5, recipientId: 'u5', amountCents: 75, compressed: false },
      { generation: 6, recipientId: 'u6', amountCents: 50, compressed: false },
    ]);
    // §12: generation pool = $5.00 exactly.
    const total = payouts.reduce((sum, p) => sum + p.amountCents, 0);
    expect(total).toBe(5_00);
  });

  it('leaves a tier unpaid (recipientId null) when no qualified upline exists', () => {
    const payouts = computeGenerationPayouts(chain([1, true]));
    expect(payouts).toHaveLength(5);
    for (const p of payouts) {
      expect(p.recipientId).toBeNull();
      expect(p.amountCents).toBeGreaterThan(0);
    }
  });

  it('compresses each tier to the Nth qualified upline', () => {
    // u2 inactive: Gen 2 → u3 (compressed), Gen 3 → u4 (compressed), Gen 4 → unpaid.
    const payouts = computeGenerationPayouts(chain([1, true], [2, false], [3, true], [4, true]));
    expect(payouts[0]).toEqual({ generation: 2, recipientId: 'u3', amountCents: 2_00, compressed: true });
    expect(payouts[1]).toEqual({ generation: 3, recipientId: 'u4', amountCents: 1_00, compressed: true });
    expect(payouts[2].recipientId).toBeNull();
  });

  it('reconciles: direct + full generation tree = 40% of the fee ($20.00)', () => {
    const direct = computeDirectReferralPayout(chain([1, true], [2, true], [3, true], [4, true], [5, true], [6, true]));
    const gens = computeGenerationPayouts(chain([1, true], [2, true], [3, true], [4, true], [5, true], [6, true]));
    const genTotal = gens.reduce((sum, p) => sum + p.amountCents, 0);
    expect(direct.amountCents + genTotal).toBe(20_00);
  });
});