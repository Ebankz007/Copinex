/**
 * §5 — Associate Ranks (bottom-up, 40% leg cap, paid once).
 * §6 — Leadership Ranks (self-gate, 2 legs × 3 members, non-cash SKU).
 */
import { describe, expect, it } from 'vitest';
import {
  computeCappedTeamVolume,
  evaluateAssociateRanks,
  evaluateLeadershipRanks,
} from '../src/ranks.js';

describe('§5 computeCappedTeamVolume — 40% leg cap', () => {
  it('returns the uncapped total when no leg exceeds 40%', () => {
    expect(computeCappedTeamVolume([40_00, 40_00, 20_00])).toBe(100_00);
  });

  it('caps a dominant leg at 40% of the uncapped total', () => {
    // uncapped 10000, cap 4000 → 4000 + 1000 + 1000 = 6000
    expect(computeCappedTeamVolume([80_00, 10_00, 10_00])).toBe(60_00);
  });

  it('caps a single-leg team at 40% of itself', () => {
    expect(computeCappedTeamVolume([50_00])).toBe(20_00);
  });

  it('returns 0 for an empty team', () => {
    expect(computeCappedTeamVolume([])).toBe(0);
  });

  it('rejects fractional or negative volumes', () => {
    expect(() => computeCappedTeamVolume([10_00, 0.5])).toThrow();
    expect(() => computeCappedTeamVolume([-10_00])).toThrow();
  });
});

describe('§5 evaluateAssociateRanks — qualification', () => {
  it('qualifies rank 1 with 3 referrals and $12+ team volume', () => {
    const result = evaluateAssociateRanks({
      personalReferrals: 3,
      legVolumesCents: [60_00, 60_00], // uncapped 12000
      highestEarnedRank: 0,
    });
    expect(result).toEqual([{ rankId: 1, rewardCents: 35_00, flagged: false }]);
  });

  it('requires BOTH referrals and team volume', () => {
    expect(
      evaluateAssociateRanks({ personalReferrals: 2, legVolumesCents: [60_00], highestEarnedRank: 0 }),
    ).toEqual([]);
    expect(
      evaluateAssociateRanks({ personalReferrals: 3, legVolumesCents: [10_00], highestEarnedRank: 0 }),
    ).toEqual([]);
  });

  it('evaluates bottom-up and returns all newly-qualified ranks in order', () => {
    const result = evaluateAssociateRanks({
      personalReferrals: 15,
      legVolumesCents: [100_00, 100_00], // uncapped 20000
      highestEarnedRank: 0,
    });
    expect(result.map((r) => r.rankId)).toEqual([1, 2, 3]);
    expect(result.map((r) => r.rewardCents)).toEqual([35_00, 80_00, 250_00]);
  });

  it('never re-pays an already-earned rank', () => {
    // Rank 4 needs 25 referrals + $700 team volume. uncapped 1000_00, cap 400_00
    // → capped 800_00 ≥ 700_00. 25 refs < rank 5's 35, so only [4] qualifies.
    const result = evaluateAssociateRanks({
      personalReferrals: 25,
      legVolumesCents: [500_00, 500_00],
      highestEarnedRank: 3,
    });
    expect(result.map((r) => r.rankId)).toEqual([4]);
  });

  it('the 40% leg cap can block a rank that uncapped volume would allow', () => {
    // uncapped 20000 (would pass rank 3's $130 threshold), capped 8000 (fails it).
    const result = evaluateAssociateRanks({
      personalReferrals: 15,
      legVolumesCents: [200_00],
      highestEarnedRank: 0,
    });
    expect(result.map((r) => r.rankId)).toEqual([1, 2]);
  });
});

describe('§6 evaluateLeadershipRanks — qualification', () => {
  it('qualifies Bronze Leader with associate rank 3 + 2 legs × 3 members at rank 3+', () => {
    const result = evaluateLeadershipRanks({
      highestAssociateRank: 3,
      highestLeadershipRank: 0,
      legsMemberRanks: [
        [3, 3, 3],
        [3, 3, 3],
      ],
    });
    expect(result).toEqual([{ rankId: 1, rewardSku: 'SMARTPHONE' }]);
  });

  it('enforces the self-qualification gate (member must hold the required rank)', () => {
    expect(
      evaluateLeadershipRanks({
        highestAssociateRank: 2,
        highestLeadershipRank: 0,
        legsMemberRanks: [
          [3, 3, 3],
          [3, 3, 3],
        ],
      }),
    ).toEqual([]);
  });

  it('requires 2 qualifying legs — one strong leg is not enough', () => {
    expect(
      evaluateLeadershipRanks({
        highestAssociateRank: 3,
        highestLeadershipRank: 0,
        legsMemberRanks: [
          [3, 3, 3],
          [2, 2, 2],
        ],
      }),
    ).toEqual([]);
  });

  it('requires 3 members per leg — two is not enough', () => {
    expect(
      evaluateLeadershipRanks({
        highestAssociateRank: 3,
        highestLeadershipRank: 0,
        legsMemberRanks: [
          [3, 3],
          [3, 3, 3],
        ],
      }),
    ).toEqual([]);
  });

  it('is progressive: skips earned ranks, checks the next', () => {
    const result = evaluateLeadershipRanks({
      highestAssociateRank: 4,
      highestLeadershipRank: 1,
      legsMemberRanks: [
        [4, 4, 4],
        [4, 4, 4],
      ],
    });
    expect(result).toEqual([{ rankId: 2, rewardSku: 'LAPTOP' }]);
  });

  it('Crown Diamond requires associate rank 8', () => {
    const result = evaluateLeadershipRanks({
      highestAssociateRank: 8,
      highestLeadershipRank: 5,
      legsMemberRanks: [
        [8, 8, 8],
        [8, 8, 8],
      ],
    });
    expect(result).toEqual([{ rankId: 6, rewardSku: 'HOME_APARTMENT' }]);
  });
});