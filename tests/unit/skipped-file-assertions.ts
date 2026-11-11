/**
 * Shared assertions for the skipped-file reporting introduced in #22.
 *
 * Several suites check the same two properties — nothing became a duplicate
 * group that should not have, and every excluded file carries the expected
 * reason — and repeating them inline meant a change to the contract had to be
 * made in several places, where it usually was not made at all.
 */

import type { SkipReason, SkippedFile } from "../../src/types.js";

/** Assert that a scan produced no duplicate groups. */
export function expectNoDuplicateGroups(groups: unknown[]): void {
  expect(groups).toHaveLength(0);
}

/**
 * Assert every skipped file carries `reason`, and that there are `count` of
 * them. Both halves matter: a wrong reason and a wrong count are different
 * bugs, and checking only one hides the other.
 *
 * Takes the two fields it reads rather than a whole `SkippedFile`, so a suite
 * holding a narrowed projection of the response can use it without a cast.
 */
export function expectAllSkippedFor(
  skipped: readonly Pick<SkippedFile, "name" | "reason">[],
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

/**
 * Assert the scan excluded exactly one file, and return its record.
 *
 * Also checks the two fields that must agree with it — the reported path and
 * the skipped-byte total — since those are what a caller reads to decide how
 * much of the scan to trust, and they were easy to assert inline and easy to
 * forget.
 */
export function expectSingleSkipFor(
  scan: { skipped: SkippedFile[]; skipped_bytes: number },
  path: string,
): SkippedFile {
  expect(scan.skipped).toHaveLength(1);
  const [only] = scan.skipped;
  expect(only?.path).toBe(path);
  expect(scan.skipped_bytes).toBe(only?.size_bytes);
  return only as SkippedFile;
}
