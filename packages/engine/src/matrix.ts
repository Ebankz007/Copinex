/**
 * Copinex Compensation Engine — Forced 3×3 Matrix Placement (§8)
 *
 * Every member occupies one position in a forced 3-wide × 3-deep matrix under
 * their sponsor. Placement rules:
 *  1. Fill the sponsor's direct row left-to-right (up to MATRIX_WIDTH = 3).
 *  2. When the sponsor's row is full, spill into the LEAST-POPULATED leg
 *     (the direct child with the smallest subtree). Tie-break: leftmost leg.
 *
 * The engine decides the placement parent for one row; when the chosen leg's
 * own row is also full, the API recurses with that leg as the new sponsor.
 * `spilledOver = true` marks a placement that did not land directly under the
 * natural sponsor — the member is placed under someone else's row.
 */
import { MATRIX_WIDTH } from './constants.js';
import type { MatrixPlacement } from './types.js';

/** One direct leg of a sponsor's matrix row. */
export interface MatrixLeg {
  /** The member at the head of this leg (a direct child of the sponsor). */
  childId: string;
  /** Total members in this leg's subtree, including the child itself. */
  subtreeSize: number;
}

/**
 * Decide where a new member is placed under a sponsor's matrix row.
 *
 * @param sponsorId The sponsor whose row receives the placement.
 * @param legs The sponsor's current direct children with subtree sizes.
 * @throws when a leg has a non-integer or negative subtree size.
 */
export function placeInMatrix(sponsorId: string, legs: MatrixLeg[]): MatrixPlacement {
  for (const leg of legs) {
    if (!Number.isInteger(leg.subtreeSize) || leg.subtreeSize < 0) {
      throw new Error(
        `placeInMatrix: subtreeSize must be a non-negative integer, got ${leg.subtreeSize} for leg ${leg.childId}`,
      );
    }
  }

  // Rule 1: a free slot in the sponsor's direct row → place under the sponsor.
  if (legs.length < MATRIX_WIDTH) {
    return { placementParentId: sponsorId, spilledOver: false };
  }

  // Rule 2: row full → spill to the least-populated leg (strictly-smaller keeps
  // the FIRST leg on ties — deterministic leftmost tie-break).
  const [first, ...rest] = legs;
  if (first === undefined) {
    // legs.length >= MATRIX_WIDTH (3) implies at least one leg exists; this
    // branch exists only to satisfy noUncheckedIndexedAccess.
    return { placementParentId: sponsorId, spilledOver: false };
  }
  let best = first;
  for (const leg of rest) {
    if (leg.subtreeSize < best.subtreeSize) best = leg;
  }
  return { placementParentId: best.childId, spilledOver: true };
}