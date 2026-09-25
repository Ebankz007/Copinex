/**
 * Copinex Compensation Engine — Compression (§9.2)
 *
 * Rule: when resolving who receives a bonus at a given generation level, skip
 * INACTIVE upline members and pay the next qualified (Active) member. The search
 * is bounded by COMPRESSION_STOP_AT_GEN (6).
 *
 * Model used by every bonus type:
 *  - Direct Referral (§3): the 1st qualified member walking up the sponsor chain.
 *  - Generation Bonus Gen N (§4): the Nth qualified member walking up.
 *  - Sponsor Override (§7): the 1st qualified member (Active-gated).
 *
 * `compressed = true` means at least one inactive member was skipped to reach the
 * recipient — i.e. the recipient is NOT the natural member at that level.
 */
import { COMPRESSION_STOP_AT_GEN } from './constants.js';
import type { UplineMember } from './types.js';

/** A resolved bonus recipient after compression. */
export interface QualifiedUpline {
  member: UplineMember;
  /** True when at least one inactive member was skipped to reach this recipient. */
  compressed: boolean;
  /** Number of inactive members skipped on the way. */
  skippedInactiveCount: number;
}

/**
 * Resolve the `targetGen`-th qualified (Active) member walking up the sponsor chain.
 *
 * @param chain Sponsor chain, level 1 = direct sponsor, ascending. Must contain
 *              at most one member per level.
 * @param targetGen 1-indexed generation to resolve (1 = the direct-referral slot).
 * @returns the qualified member, or null when fewer than `targetGen` active
 *          members exist within levels 1..COMPRESSION_STOP_AT_GEN.
 * @throws on a malformed chain (duplicate/out-of-order levels) or invalid targetGen.
 */
export function resolveQualifiedUpline(
  chain: UplineMember[],
  targetGen: number,
): QualifiedUpline | null {
  if (!Number.isInteger(targetGen) || targetGen < 1) {
    throw new Error(`resolveQualifiedUpline: targetGen must be a positive integer, got ${targetGen}`);
  }
  if (targetGen > COMPRESSION_STOP_AT_GEN) {
    throw new Error(
      `resolveQualifiedUpline: targetGen ${targetGen} exceeds COMPRESSION_STOP_AT_GEN ${COMPRESSION_STOP_AT_GEN}`,
    );
  }

  const ordered = [...chain].sort((a, b) => a.level - b.level);

  // Full-chain validation pre-pass: levels must be positive integers with at
  // most one member per level. This runs BEFORE resolution so a malformed chain
  // always throws, even when the walk would short-circuit on an early return.
  const seenLevels = new Set<number>();
  for (const member of ordered) {
    if (!Number.isInteger(member.level) || member.level < 1) {
      throw new Error(
        `resolveQualifiedUpline: levels must be positive integers, got ${member.level}`,
      );
    }
    if (seenLevels.has(member.level)) {
      throw new Error(
        `resolveQualifiedUpline: chain has duplicate level ${member.level}`,
      );
    }
    seenLevels.add(member.level);
  }

  let qualifiedSeen = 0;
  let skippedInactive = 0;

  for (const member of ordered) {
    if (member.level > COMPRESSION_STOP_AT_GEN) break;
    if (!member.isActive) {
      skippedInactive += 1;
      continue;
    }
    qualifiedSeen += 1;
    if (qualifiedSeen === targetGen) {
      return { member, compressed: skippedInactive > 0, skippedInactiveCount: skippedInactive };
    }
  }
  return null;
}