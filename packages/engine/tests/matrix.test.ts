/**
 * §8 — Forced 3×3 matrix placement: fill the row, then spill to the
 * least-populated leg (leftmost on ties).
 */
import { describe, expect, it } from 'vitest';
import { placeInMatrix } from '../src/matrix.js';
import type { MatrixLeg } from '../src/matrix.js';

describe('§8 placeInMatrix — direct row placement', () => {
  it('places under the sponsor when the row is empty', () => {
    expect(placeInMatrix('sponsor', [])).toEqual({ placementParentId: 'sponsor', spilledOver: false });
  });

  it('places under the sponsor while the row has a free slot (left-to-right fill)', () => {
    const legs: MatrixLeg[] = [{ childId: 'a', subtreeSize: 1 }];
    expect(placeInMatrix('sponsor', legs)).toEqual({ placementParentId: 'sponsor', spilledOver: false });

    const two: MatrixLeg[] = [
      { childId: 'a', subtreeSize: 5 },
      { childId: 'b', subtreeSize: 2 },
    ];
    expect(placeInMatrix('sponsor', two)).toEqual({ placementParentId: 'sponsor', spilledOver: false });
  });
});

describe('§8 placeInMatrix — spillover', () => {
  it('spills to the least-populated leg when the row is full', () => {
    const legs: MatrixLeg[] = [
      { childId: 'a', subtreeSize: 5 },
      { childId: 'b', subtreeSize: 2 },
      { childId: 'c', subtreeSize: 9 },
    ];
    expect(placeInMatrix('sponsor', legs)).toEqual({ placementParentId: 'b', spilledOver: true });
  });

  it('breaks ties toward the leftmost leg (deterministic)', () => {
    const legs: MatrixLeg[] = [
      { childId: 'a', subtreeSize: 4 },
      { childId: 'b', subtreeSize: 4 },
      { childId: 'c', subtreeSize: 7 },
    ];
    expect(placeInMatrix('sponsor', legs)).toEqual({ placementParentId: 'a', spilledOver: true });
  });

  it('picks the first leg when all legs are equal', () => {
    const legs: MatrixLeg[] = [
      { childId: 'a', subtreeSize: 3 },
      { childId: 'b', subtreeSize: 3 },
      { childId: 'c', subtreeSize: 3 },
    ];
    expect(placeInMatrix('sponsor', legs)).toEqual({ placementParentId: 'a', spilledOver: true });
  });

  it('rejects a non-integer subtree size', () => {
    const legs: MatrixLeg[] = [{ childId: 'a', subtreeSize: 1.5 }];
    expect(() => placeInMatrix('sponsor', legs)).toThrow();
  });
});