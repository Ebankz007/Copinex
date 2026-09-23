/**
 * §12 — Consolidated Reconciliation Check.
 * "Run these two invariants as automated sanity checks on every deploy / config change.
 *  Both must hold exactly (to the cent) for the plan to be internally consistent."
 */
import { describe, expect, it } from 'vitest';
import { FEE_SPLIT_TOTAL, PROFIT_SPLIT_TOTAL } from '../src/allocation.js';

describe('§12 Consolidated Reconciliation Check', () => {
  it('fee split reconciles to 100%: 45 + 30 + 10 + 8 + 7 = 100', () => {
    expect(FEE_SPLIT_TOTAL).toBeCloseTo(1.0, 10);
    expect(Math.round(FEE_SPLIT_TOTAL * 100)).toBe(100);
  });

  it('profit split reconciles to 100%: 60 + 10 + 30 = 100', () => {
    expect(PROFIT_SPLIT_TOTAL).toBeCloseTo(1.0, 10);
    expect(Math.round(PROFIT_SPLIT_TOTAL * 100)).toBe(100);
  });
});