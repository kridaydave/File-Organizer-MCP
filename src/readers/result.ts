/**
 * Result Type Implementation
 *
 * Implements the Result<T, E> pattern for explicit error handling.
 * Follows guardrails.md requirements for functional error handling.
 * Part of Layer 3 (Business Logic & Execution)
 */

/**
 * Successful result variant
 */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/**
 * Error result variant
 */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * Result type for explicit error handling
 * Use this instead of throwing exceptions for expected errors
 */
export type Result<T, E> = Ok<T> | Err<E>;

/**
 * Create a successful result
 * @param value - The success value
 * @returns Ok<T> result
 */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/**
 * Create an error result
 * @param error - The error value
 * @returns Err<E> result
 */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/**
 * Type guard to check if result is Ok
 * @param result - The result to check
 * @returns true if result is Ok<T>
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok === true;
}

/**
 * Type guard to check if result is Err
 * @param result - The result to check
 * @returns true if result is Err<E>
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result.ok === false;
}

/**
 * Unwrap a result, returning the value or throwing the error
 * @param result - The result to unwrap
 * @returns The value if Ok
 * @throws The error if Err
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (isOk(result)) {
    return result.value;
  }
  throw result.error;
}

/**
 * Unwrap a result with a default value
 * @param result - The result to unwrap
 * @param defaultValue - Value to return if Err
 * @returns The value if Ok, defaultValue if Err
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (isOk(result)) {
    return result.value;
  }
  return defaultValue;
}

/**
 * Map the success value of a result
 * @param result - The result to map
 * @param fn - Function to transform the value
 * @returns New result with transformed value
 */
export function map<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> {
  if (isOk(result)) {
    return ok(fn(result.value));
  }
  return result;
}

/**
 * Map the error value of a result
 * @param result - The result to map
 * @param fn - Function to transform the error
 * @returns New result with transformed error
 */
export function mapErr<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F,
): Result<T, F> {
  if (isErr(result)) {
    return err(fn(result.error));
  }
  return result;
}

/**
 * Flat map (chain) operations on results
 * @param result - The result to flatMap
 * @param fn - Function returning a Result
 * @returns Flattened Result
 */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  if (isOk(result)) {
    return fn(result.value);
  }
  return result;
}
