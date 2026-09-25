/**
 * §10 — Pool solvency: pay only within the accrued balance, flag-not-pay.
 */
import { describe, expect, it } from 'vitest';
import {
  LEADERSHIP_POOL_ACCRUAL_CENTS,
  RANK_POOL_ACCRUAL_CENTS,
  checkPoolSolvency,
  resolvePoolPayout,
} from '../src/pools.js';

describe('§10 pool accrual per registration', () => {
  it('rank pool accrues $4.00 (8%) and leadership pool $3.50 (7%)', () => {
    expect(RANK_POOL_ACCRUAL_CENTS).toBe(4_00);
    expect(LEADERSHIP_POOL_ACCRUAL_CENTS).toBe(3_50);
  });
});

describe('§10 checkPoolSolvency', () => {
  it('is true when the balance covers the reward', () => {
    expect(checkPoolSolvency(4_00, 4_00)).toBe(true);
    expect(checkPoolSolvency(100_00, 35_00)).toBe(true);
  });

  it('is false when the balance is short, to the cent', () => {
    expect(checkPoolSolvency(34_99, 35_00)).toBe(false);
    expect(checkPoolSolvency(0, 35_00)).toBe(false);
  });

  it('rejects invalid inputs', () => {
    expect(() => checkPoolSolvency(-1, 35_00)).toThrow();
    expect(() => checkPoolSolvency(10_00, 0)).toThrow();
    expect(() => checkPoolSolvency(10_00, -5)).toThrow();
  });
});

describe('§10 resolvePoolPayout — flag-not-pay rule', () => {
  it('pays and debits the pool when solvent', () => {
    const decision = resolvePoolPayout(50_00, 35_00);
    expect(decision).toEqual({ payable: true, flagged: false, remainingBalanceCents: 15_00 });
  });

  it('flags for admin review and does NOT debit when underfunded', () => {
    const decision = resolvePoolPayout(20_00, 35_00);
    expect(decision).toEqual({ payable: false, flagged: true, remainingBalanceCents: 20_00 });
  });
});