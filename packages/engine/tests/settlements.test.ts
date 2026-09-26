/**
 * §7 — Trading settlement: 60/10/30 split, sponsor share paid to the natural
 * sponsor (Henry, 2026-09-26 — every account earns regardless of Active status),
 * loss/breakeven pays nobody.
 */
import { describe, expect, it } from 'vitest';
import { computeSponsorOverridePayout, computeTradingSettlement } from '../src/settlements.js';
import type { UplineMember } from '../src/types.js';

/** Build a chain: each entry is [level]; userId = `u${level}`. */
function chain(...levels: number[]): UplineMember[] {
  return levels.map((level) => ({ userId: `u${level}`, level }));
}

describe('§7 computeSponsorOverridePayout', () => {
  it('pays the direct sponsor the full 10% share', () => {
    const payout = computeSponsorOverridePayout(20_00, chain(1));
    expect(payout).toEqual({ recipientId: 'u1', amountCents: 20_00, unallocated: false });
  });

  it('marks the share unallocated (reverts to company) when the client has no sponsor', () => {
    const payout = computeSponsorOverridePayout(20_00, []);
    expect(payout).toEqual({ recipientId: null, amountCents: 20_00, unallocated: true });
  });

  it('rejects a fractional share', () => {
    expect(() => computeSponsorOverridePayout(20.5, chain(1))).toThrow();
  });
});

describe('§7 computeTradingSettlement — full split', () => {
  it('splits $200 realized profit 60/10/30 (TC2 extended)', () => {
    const settlement = computeTradingSettlement(20_000, chain(1));
    expect(settlement).not.toBeNull();
    expect(settlement!.clientCents).toBe(120_00);
    expect(settlement!.sponsorOverride).toEqual({
      recipientId: 'u1',
      amountCents: 20_00,
      unallocated: false,
    });
    expect(settlement!.companyCents).toBe(60_00);
    // §12: 60 + 10 + 30 = 100% of the profit.
    const total = settlement!.clientCents + settlement!.sponsorOverride.amountCents + settlement!.companyCents;
    expect(total).toBe(20_000);
  });

  it('returns null on loss — no split, nobody paid', () => {
    expect(computeTradingSettlement(-50_00, chain(1))).toBeNull();
    expect(computeTradingSettlement(0, chain(1))).toBeNull();
  });

  it('flags an unallocated sponsor share for company capture', () => {
    const settlement = computeTradingSettlement(20_000, []);
    expect(settlement!.sponsorOverride.unallocated).toBe(true);
    // Company's effective take = 30% + reverted 10% = $80.00.
    expect(settlement!.companyCents).toBe(60_00);
  });
});