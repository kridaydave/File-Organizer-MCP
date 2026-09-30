/**
 * Shared assertions for the skipped-file reporting introduced in #22.
 *
 * Several suites check the same two properties — nothing became a duplicate
 * group that should not have, and every excluded file carries the expected
 * reason — and repeating them inline meant a change to the contract had to be
 * made in several places, where it usually was not made at all.
 */

import type { SkipReason, SkippedFile } from "../../../src/types.js";

/** Assert that a scan produced no duplicate groups. */
export function expectNoDuplicateGroups(groups: unknown[]): void {
  expect(groups).toHaveLength(0);
}

/**
 * Assert every skipped file carries `reason`, and that there are `count` of
 * them. Both halves matter: a wrong reason and a wrong count are different
 * bugs, and checking only one hides the other.
 */
export function expectAllSkippedFor(
  skipped: SkippedFile[],
  reason: SkipReason,
  count: number,
): void {
  expect(skipped).toHaveLength(count);
  const wrong = skipped.filter((f) => f.reason !== reason);
  expect(wrong.map((f) => `${f.name}: ${f.reason}`)).toEqual([]);
}

/** Assert a path appears at most once in the skipped list, under any reason. */
export function expectNoDuplicateSkipPaths(skipped: SkippedFile[]): void {
  const paths = skipped.map((f) => f.path);
  expect(new Set(paths).size).toBe(paths.length);
}
