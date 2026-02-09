/**
 * File Reader Module
 *
 * Exports all file reader components following the 3-layer architecture:
 * - Layer 1: Input Validation & Sanitization
 * - Layer 2: Security & Resource Controls
 * - Layer 3: Business Logic & Execution
 *
 * @module readers
 * @version 3.2.0
 */

// Core reader - Layer 3
export { SecureFileReader } from "./secure-file-reader.js";
export type { IAuditLogger } from "./secure-file-reader.js";

// Factory - Layer 3
export { FileReaderFactory } from "./factory.js";
export type { ReaderOptions } from "./factory.js";

// Types - Layer 1 & 3
export type {
  FileReadOptions,
  FileReadResult,
  FileMetadata,
  IFileReader,
  FileReadOperation,
} from "./types.js";
export { DEFAULT_READ_OPTIONS, MIME_TYPE_MAP } from "./types.js";

// Errors - Layer 2
export {
  FileReadError,
  FileTooLargeError,
  PathValidationError,
  RateLimitError,
  FileAccessDeniedError,
  FileNotFoundError,
  FileReadAbortedError,
  InvalidEncodingError,
} from "./errors.js";

// Result Pattern - Layer 3
export type { Result, Ok, Err } from "./result.js";
export {
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  map,
  mapErr,
  flatMap,
} from "./result.js";

// Audit Logger Interface - Layer 2 (legacy compatibility)
export type {
  AuditLogEntry,
  IAuditLogger as LegacyAuditLogger,
  AuditLoggerOptions,
} from "./interfaces/audit-logger.js";
