/**
 * Helpers for reading a value the test suite just proved is present.
 *
 * `noUncheckedIndexedAccess` is on, so `entries[0]` and `record.metrics` are
 * `T | undefined` even after `expect(entries).toHaveLength(1)`. These helpers
 * turn that into a loud failure instead of a silent `undefined` that would let
 * an assertion pass vacuously — which is why they throw rather than assert.
 */

/**
 * The first element of `items`, or a thrown error when the array is empty.
 *
 * Prefer this over a non-null assertion: an empty array means the code under
 * test produced nothing, and that is a real failure worth naming.
 */
export function first<T>(items: readonly T[]): T {
  const item = items[0];
  if (item === undefined) {
    throw new Error("Expected at least one item, but the array was empty");
  }
  return item;
}

/**
 * The element at `index`, or a thrown error when it is out of range.
 */
export function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`Expected an item at index ${index}, but it was ${item}`);
  }
  return item;
}

/**
 * `value` narrowed to `NonNullable<T>`, or a thrown error when it is
 * `null`/`undefined`.
 *
 * Use for a property the test has already asserted is defined. It keeps the
 * assertion that matters and drops only the compile-time repeat of it.
 */
export function required<T>(value: T, label = "value"): NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${label} to be defined, but it was ${value}`);
  }
  return value as NonNullable<T>;
}