/**
 * §7 — Trading settlement: 60/10/30 split, Active-gated sponsor override
 * (documented assumption), loss/breakeven pays nobody.
 */
import { describe, expect, it } from 'vitest';
import { computeSponsorOverridePayout, computeTradingSettlement } from '../src/settlements.js';
import type { UplineMember } from '../src/types.js';

/** Build a chain: each entry is [level, isActive]; userId = `u${level}`. */
function chain(...members: Array<[level: number, isActive: boolean]>): UplineMember[] {
  return members.map(([level, isActive]) => ({ userId: `u${level}`, level, isActive }));
}

describe('§7 computeSponsorOverridePayout — Active gate', () => {
  it('pays the active direct sponsor the full 10% share', () => {
    const payout = computeSponsorOverridePayout(20_00, chain([1, true]));
    expect(payout).toEqual({ recipientId: 'u1', amountCents: 20_00, compressed: false, unallocated: false });
  });

  it('compresses to the next qualified upline when the sponsor is inactive', () => {
    const payout = computeSponsorOverridePayout(20_00, chain([1, false], [2, true]));
    expect(payout).toEqual({ recipientId: 'u2', amountCents: 20_00, compressed: true, unallocated: false });
  });

  it('marks the share unallocated (reverts to company) when no qualified upline exists', () => {
    const payout = computeSponsorOverridePayout(20_00, chain([1, false], [2, false]));
    expect(payout).toEqual({ recipientId: null, amountCents: 20_00, compressed: false, unallocated: true });
  });

  it('requireActive=false pays the natural sponsor regardless of status', () => {
    const payout = computeSponsorOverridePayout(20_00, chain([1, false]), { requireActive: false });
    expect(payout).toEqual({ recipientId: 'u1', amountCents: 20_00, compressed: false, unallocated: false });
  });

  it('rejects a fractional share', () => {
    expect(() => computeSponsorOverridePayout(20.5, chain([1, true]))).toThrow();
  });
});

describe('§7 computeTradingSettlement — full split', () => {
  it('splits $200 realized profit 60/10/30 (TC2 extended)', () => {
    const settlement = computeTradingSettlement(20_000, chain([1, true]));
    expect(settlement).not.toBeNull();
    expect(settlement!.clientCents).toBe(120_00);
    expect(settlement!.sponsorOverride).toEqual({
      recipientId: 'u1',
      amountCents: 20_00,
      compressed: false,
      unallocated: false,
    });
    expect(settlement!.companyCents).toBe(60_00);
    // §12: 60 + 10 + 30 = 100% of the profit.
    const total = settlement!.clientCents + settlement!.sponsorOverride.amountCents + settlement!.companyCents;
    expect(total).toBe(20_000);
  });

  it('returns null on loss — no split, nobody paid', () => {
    expect(computeTradingSettlement(-50_00, chain([1, true]))).toBeNull();
    expect(computeTradingSettlement(0, chain([1, true]))).toBeNull();
  });

  it('compresses the sponsor share within a full settlement', () => {
    const settlement = computeTradingSettlement(20_000, chain([1, false], [2, true]));
    expect(settlement!.sponsorOverride.recipientId).toBe('u2');
    expect(settlement!.sponsorOverride.compressed).toBe(true);
  });

  it('flags an unallocated sponsor share for company capture', () => {
    const settlement = computeTradingSettlement(20_000, chain([1, false], [2, false]));
    expect(settlement!.sponsorOverride.unallocated).toBe(true);
    // Company's effective take = 30% + reverted 10% = $80.00.
    expect(settlement!.companyCents).toBe(60_00);
  });
});