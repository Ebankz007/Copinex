/**
 * §11 — Worked Examples (Test Cases), transcribed from the spec.
 *
 * Test Case 1 — Single Direct Referral
 * Test Case 2 — Trading Profit Share (+ edge case: loss → no split)
 */
import { describe, expect, it } from 'vitest';
import {
  allocateRegistrationFee,
  distributeTradingProfitShare,
} from '../src/allocation.js';
import { REGISTRATION_FEE_CENTS } from '../src/constants.js';

describe('§11 Test Case 1 — Single Direct Referral', () => {
  it('splits the $50 fee exactly per the spec table', () => {
    const result = allocateRegistrationFee(REGISTRATION_FEE_CENTS);

    // Amaka (Sponsor) — Direct Referral Bonus: $15.00
    expect(result.directReferralPoolCents).toBe(15_00);
    // Company — Operating Reserve: $22.50
    expect(result.companyReserveCents).toBe(22_50);
    // Rank + Leadership Pools: $7.50 accrued (not yet paid out)
    expect(result.rankPoolContributionCents + result.leadershipPoolContributionCents).toBe(7_50);
    // Generation Pool (upline): $5.00 accrued across Gen 2–6
    expect(result.generationPoolCents).toBe(5_00);
    // TOTAL: $50.00
    const total =
      result.companyReserveCents +
      result.directReferralPoolCents +
      result.generationPoolCents +
      result.rankPoolContributionCents +
      result.leadershipPoolContributionCents;
    expect(total).toBe(REGISTRATION_FEE_CENTS);
  });

  it('rejects a non-integer or non-positive fee', () => {
    expect(() => allocateRegistrationFee(50.5)).toThrow();
    expect(() => allocateRegistrationFee(0)).toThrow();
    expect(() => allocateRegistrationFee(-100)).toThrow();
  });
});

describe('§11 Test Case 2 — Trading Profit Share', () => {
  it('splits $200 realized profit: 60/10/30', () => {
    const shares = distributeTradingProfitShare(20_000);
    expect(shares).not.toBeNull();
    // Chidi (Client): 60% = $120.00
    expect(shares!.clientCents).toBe(120_00);
    // Chidi's Sponsor: 10% = $20.00
    expect(shares!.sponsorCents).toBe(20_00);
    // Company: 30% = $60.00
    expect(shares!.companyCents).toBe(60_00);
    // TOTAL: $200.00
    expect(shares!.clientCents + shares!.sponsorCents + shares!.companyCents).toBe(20_000);
  });

  it('returns null on loss — no split, nobody paid', () => {
    const shares = distributeTradingProfitShare(-50_00);
    expect(shares).toBeNull();
  });

  it('returns null on breakeven — no split', () => {
    const shares = distributeTradingProfitShare(0);
    expect(shares).toBeNull();
  });

  it('rejects fractional cents', () => {
    expect(() => distributeTradingProfitShare(200.5)).toThrow();
  });
});