/**
 * 90-Day Investment Packages — engine tests.
 * Covers tier selection, daily/monthly math, the 90-day settlement schedule,
 * and the 20% upline commission (reconciliation to the cent).
 */
import { describe, expect, it } from 'vitest';
import {
  buildInvestmentSchedule,
  computeDailyProfitCents,
  computeMonthlyProfitCents,
  computeUplineCommissionPoolCents,
  distributeUplineCommission,
  getPackageForAmount,
} from '../src/investment.js';
import { AVAILABLE_AFTER_DAYS, DAILY_ACCRUAL_DAYS, INVESTMENT_PACKAGES } from '../src/constants.js';

const START = new Date('2026-09-25T00:00:00.000Z');

describe('tier selection', () => {
  it('maps every boundary amount to the correct tier', () => {
    expect(getPackageForAmount(50_00)!.tier).toBe(1); // $50
    expect(getPackageForAmount(499_99)!.tier).toBe(1); // $499.99
    expect(getPackageForAmount(500_00)!.tier).toBe(2); // $500
    expect(getPackageForAmount(999_99)!.tier).toBe(2); // $999.99
    expect(getPackageForAmount(1_000_00)!.tier).toBe(3); // $1,000
    expect(getPackageForAmount(1_999_99)!.tier).toBe(3); // $1,999.99
    expect(getPackageForAmount(2_000_00)!.tier).toBe(4); // $2,000
    expect(getPackageForAmount(4_999_99)!.tier).toBe(4); // $4,999.99
    expect(getPackageForAmount(5_000_00)!.tier).toBe(5); // $5,000
    expect(getPackageForAmount(1_000_000_00)!.tier).toBe(5); // $1M — no cap
  });

  it('rejects amounts below the minimum or invalid', () => {
    expect(getPackageForAmount(49_99)).toBeNull(); // $49.99
    expect(getPackageForAmount(0)).toBeNull();
    expect(getPackageForAmount(-100)).toBeNull();
    expect(getPackageForAmount(50.5)).toBeNull(); // fractional cents
  });

  it('daily rate matches round(monthly/30) — the spec’s ≈ values', () => {
    for (const p of INVESTMENT_PACKAGES) {
      expect(p.dailyRateBps).toBe(Math.round(p.monthlyRateBps / 30));
    }
    expect(INVESTMENT_PACKAGES.map((p) => p.dailyRateBps)).toEqual([33, 37, 40, 45, 50]);
  });
});

describe('profit math (integer cents)', () => {
  it('computes daily profit per tier', () => {
    expect(computeDailyProfitCents(50_00, 33)).toBe(16); // 16.5 → floor 16
    expect(computeDailyProfitCents(500_00, 37)).toBe(185);
    expect(computeDailyProfitCents(1_000_00, 40)).toBe(400);
    expect(computeDailyProfitCents(2_000_00, 45)).toBe(900);
    expect(computeDailyProfitCents(5_000_00, 50)).toBe(2_500);
  });

  it('computes monthly profit per tier', () => {
    expect(computeMonthlyProfitCents(50_00, 1000)).toBe(500); // 10% of $50
    expect(computeMonthlyProfitCents(500_00, 1100)).toBe(5_500); // 11% of $500
    expect(computeMonthlyProfitCents(1_000_00, 1200)).toBe(12_000); // 12% of $1,000
    expect(computeMonthlyProfitCents(2_000_00, 1350)).toBe(27_000); // 13.5% of $2,000
    expect(computeMonthlyProfitCents(5_000_00, 1500)).toBe(75_000); // 15% of $5,000
  });

  it('rejects invalid inputs', () => {
    expect(() => computeDailyProfitCents(50.5, 33)).toThrow();
    expect(() => computeDailyProfitCents(0, 33)).toThrow();
    expect(() => computeDailyProfitCents(50_00, 0)).toThrow();
    expect(() => computeMonthlyProfitCents(-50_00, 1000)).toThrow();
  });
});

describe('90-day settlement schedule', () => {
  const pkg = INVESTMENT_PACKAGES[0]; // 10% monthly
  const schedule = buildInvestmentSchedule(50_00, pkg, START);

  it('produces exactly 90 daily credits, all unlocking after the 90-day settlement period', () => {
    expect(schedule.dailyCredits).toHaveLength(DAILY_ACCRUAL_DAYS);
    for (const c of schedule.dailyCredits) {
      expect(c.amountCents).toBe(16);
      expect(c.availableAt.getTime()).toBe(START.getTime() + AVAILABLE_AFTER_DAYS * 86_400_000);
    }
    // First credit on day 1, last on day 90.
    expect(schedule.dailyCredits[0].day).toBe(1);
    expect(schedule.dailyCredits[89].day).toBe(90);
  });

  it('90-day total never exceeds the nominal monthly-rate total', () => {
    const total = schedule.dailyCredits.reduce((s, c) => s + c.amountCents, 0);
    // 90 days × 16¢ = 1440¢ vs 3 months × 500¢ = 1500¢ nominal → floor keeps us under.
    expect(total).toBe(1_440);
    expect(total).toBeLessThanOrEqual(3 * schedule.monthlyProfitCents);
  });

  it('monthly profit continues after the 90-day window (capital stays active)', () => {
    expect(schedule.monthlyProfitCents).toBe(500); // $5.00/month on $50
  });
});

describe('upline commission (20% of profit)', () => {
  it('pool = 20% of profit, floored', () => {
    expect(computeUplineCommissionPoolCents(500)).toBe(100); // $5 → $1
    expect(computeUplineCommissionPoolCents(333)).toBe(66); // 66.6 → floor 66
    expect(computeUplineCommissionPoolCents(0)).toBe(0);
    expect(() => computeUplineCommissionPoolCents(-5)).toThrow();
  });

  const fullChain = [1, 2, 3, 4, 5, 6].map((level) => ({
    userId: `u${level}`,
    level,
    isActive: true,
  }));

  it('splits a $100 pool across 6 active uplines: 50/20/10/7.5/7.5/5', () => {
    const payouts = distributeUplineCommission(100_00, fullChain);
    const byLevel = Object.fromEntries(payouts.map((p) => [p.level, p.amountCents]));
    expect(byLevel[1]).toBe(50_00);
    expect(byLevel[2]).toBe(20_00);
    expect(byLevel[3]).toBe(10_00);
    expect(byLevel[4]).toBe(7_50);
    expect(byLevel[5]).toBe(7_50);
    expect(byLevel[6]).toBe(5_00);
    expect(payouts.reduce((s, p) => s + p.amountCents, 0)).toBe(100_00);
  });

  it('reconciles to the exact pool even with floor rounding', () => {
    const payouts = distributeUplineCommission(100, fullChain); // $1 pool
    expect(payouts.reduce((s, p) => s + p.amountCents, 0)).toBe(100);
  });

  it('compresses inactive uplines — pool renormalized over qualified levels', () => {
    const chainWithInactiveSponsor = [
      { userId: 'u1', level: 1, isActive: false }, // inactive direct sponsor
      ...fullChain.slice(1),
    ];
    const payouts = distributeUplineCommission(100_00, chainWithInactiveSponsor);
    expect(payouts.find((p) => p.level === 1)).toBeUndefined();
    // Renormalized over gen2–6 (weights 20/10/7.5/7.5/5, sum 50):
    // gen2 gets 4000, gen3 2000, gen4 1500, gen5 1500, gen6 1000.
    const byLevel = Object.fromEntries(payouts.map((p) => [p.level, p.amountCents]));
    expect(byLevel[2]).toBe(40_00);
    expect(byLevel[3]).toBe(20_00);
    expect(byLevel[4]).toBe(15_00);
    expect(byLevel[5]).toBe(15_00);
    expect(byLevel[6]).toBe(10_00);
    expect(payouts.reduce((s, p) => s + p.amountCents, 0)).toBe(100_00);
  });

  it('renormalizes over a partial chain (only 2 uplines)', () => {
    const shortChain = fullChain.slice(0, 2);
    const payouts = distributeUplineCommission(100_00, shortChain);
    // weights 50/20, sum 70 → sponsor 7142.857…, gen2 2857.142…
    expect(payouts).toHaveLength(2);
    expect(payouts.reduce((s, p) => s + p.amountCents, 0)).toBe(100_00);
  });

  it('returns [] when no upline is active', () => {
    const inactive = fullChain.map((m) => ({ ...m, isActive: false }));
    expect(distributeUplineCommission(100_00, inactive)).toEqual([]);
  });

  it('returns [] for a zero pool', () => {
    expect(distributeUplineCommission(0, fullChain)).toEqual([]);
  });

  it('rejects fractional pools', () => {
    expect(() => distributeUplineCommission(10.5, fullChain)).toThrow();
  });
});