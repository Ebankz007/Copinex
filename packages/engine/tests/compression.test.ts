/**
 * §9.2 — Compression: skip inactive upline, next qualified, bounded by gen 6.
 */
import { describe, expect, it } from 'vitest';
import { resolveQualifiedUpline } from '../src/compression.js';
import { COMPRESSION_STOP_AT_GEN } from '../src/constants.js';
import type { UplineMember } from '../src/types.js';

/** Build a chain: each entry is [level, isActive]; userId = `u${level}`. */
function chain(...members: Array<[level: number, isActive: boolean]>): UplineMember[] {
  return members.map(([level, isActive]) => ({ userId: `u${level}`, level, isActive }));
}

describe('§9.2 resolveQualifiedUpline — basic resolution', () => {
  it('resolves gen 1 to the direct sponsor when active', () => {
    const result = resolveQualifiedUpline(chain([1, true], [2, true]), 1);
    expect(result).not.toBeNull();
    expect(result!.member.userId).toBe('u1');
    expect(result!.compressed).toBe(false);
    expect(result!.skippedInactiveCount).toBe(0);
  });

  it('resolves gen N to the Nth active member in a fully-active chain', () => {
    const c = chain([1, true], [2, true], [3, true], [4, true], [5, true], [6, true]);
    expect(resolveQualifiedUpline(c, 2)!.member.userId).toBe('u2');
    expect(resolveQualifiedUpline(c, 3)!.member.userId).toBe('u3');
    expect(resolveQualifiedUpline(c, 6)!.member.userId).toBe('u6');
  });
});

describe('§9.2 compression — skipping inactive upline', () => {
  it('skips an inactive gen-2 member: gen 2 resolves to gen 3, marked compressed', () => {
    const c = chain([1, true], [2, false], [3, true], [4, true]);
    const result = resolveQualifiedUpline(c, 2);
    expect(result).not.toBeNull();
    expect(result!.member.userId).toBe('u3');
    expect(result!.compressed).toBe(true);
    expect(result!.skippedInactiveCount).toBe(1);
  });

  it('compresses the direct-referral slot when the sponsor is inactive', () => {
    const c = chain([1, false], [2, true], [3, true]);
    const result = resolveQualifiedUpline(c, 1);
    expect(result!.member.userId).toBe('u2');
    expect(result!.compressed).toBe(true);
    expect(result!.skippedInactiveCount).toBe(1);
  });

  it('counts multiple skips', () => {
    const c = chain([1, true], [2, false], [3, false], [4, true]);
    const result = resolveQualifiedUpline(c, 2);
    expect(result!.member.userId).toBe('u4');
    expect(result!.skippedInactiveCount).toBe(2);
  });
});

describe('§9.2 bounds and edge cases', () => {
  it('returns null when fewer than targetGen active members exist', () => {
    const c = chain([1, true], [2, false], [3, true]);
    expect(resolveQualifiedUpline(c, 3)).toBeNull();
    expect(resolveQualifiedUpline(c, 4)).toBeNull();
  });

  it('returns null when no qualified upline exists at all', () => {
    expect(resolveQualifiedUpline(chain([1, false], [2, false]), 1)).toBeNull();
    expect(resolveQualifiedUpline([], 1)).toBeNull();
  });

  it('does not search beyond COMPRESSION_STOP_AT_GEN', () => {
    const c = chain(
      [1, false], [2, false], [3, false], [4, false], [5, false], [6, false], [7, true],
    );
    expect(resolveQualifiedUpline(c, 1)).toBeNull();
  });

  it('rejects targetGen outside 1..COMPRESSION_STOP_AT_GEN', () => {
    expect(() => resolveQualifiedUpline(chain([1, true]), 0)).toThrow();
    expect(() => resolveQualifiedUpline(chain([1, true]), COMPRESSION_STOP_AT_GEN + 1)).toThrow();
  });

  it('rejects a malformed chain with duplicate levels', () => {
    const dup = [
      { userId: 'a', level: 1, isActive: true },
      { userId: 'b', level: 1, isActive: true },
    ];
    expect(() => resolveQualifiedUpline(dup, 1)).toThrow();
  });

  it('works regardless of chain ordering (sorts by level)', () => {
    const unordered = [
      { userId: 'u3', level: 3, isActive: true },
      { userId: 'u1', level: 1, isActive: true },
      { userId: 'u2', level: 2, isActive: false },
    ];
    const result = resolveQualifiedUpline(unordered, 2);
    expect(result!.member.userId).toBe('u3');
    expect(result!.compressed).toBe(true);
  });
});