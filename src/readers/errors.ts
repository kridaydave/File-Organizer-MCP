/**
 * File Reader Error Classes
 *
 * Extends base error classes for file reader specific errors.
 * Part of Layer 2 (Security & Resource Controls)
 */

import { FileOrganizerError } from "../errors.js";

/**
 * Base error for file read operations
 */
export class FileReadError extends FileOrganizerError {
  constructor(
    message: string,
    public readonly filePath: string,
    code = "FILE_READ_ERROR",
    suggestion?: string,
  ) {
    super(message, code, { filePath }, suggestion);
    this.name = "FileReadError";
  }
}

/**
 * Error thrown when file exceeds maximum size limit
 * Part of Layer 2 (Resource Controls)
 */
export class FileTooLargeError extends FileReadError {
  constructor(
    filePath: string,
    public readonly fileSize: number,
    public readonly maxAllowed: number,
  ) {
    super(
      `File size (${fileSize} bytes) exceeds maximum allowed (${maxAllowed} bytes)`,
      filePath,
      "FILE_TOO_LARGE",
      "Consider using readStream() for large files or increase maxBytes limit",
    );
    this.name = "FileTooLargeError";
  }
}

/**
 * Error thrown when path validation fails
 * Part of Layer 1 (Input Validation & Sanitization)
 */
export class PathValidationError extends FileReadError {
  constructor(
    filePath: string,
    public readonly reason: string,
    public readonly validationLayer: number,
  ) {
    super(
      `Path validation failed at layer ${validationLayer}: ${reason}`,
      filePath,
      "PATH_VALIDATION_FAILED",
      "Check the path format and ensure it is within allowed directories",
    );
    this.name = "PathValidationError";
  }
}

/**
 * Error thrown when rate limit is exceeded
 * Part of Layer 2 (Security & Resource Controls)
 */
export class RateLimitError extends FileReadError {
  constructor(
    filePath: string,
    public readonly retryAfter: number,
    public readonly limitType: "perMinute" | "perHour",
  ) {
    super(
      `Rate limit exceeded (${limitType}). Retry after ${retryAfter} seconds`,
      filePath,
      "RATE_LIMIT_EXCEEDED",
      `Wait ${retryAfter} seconds before retrying this operation`,
    );
    this.name = "RateLimitError";
  }
}

/**
 * Error thrown when file access is denied
 * Part of Layer 1 & 2 (Validation and Security)
 */
export class FileAccessDeniedError extends FileReadError {
  constructor(
    filePath: string,
    public readonly reason: string,
    public readonly resolvedPath?: string,
  ) {
    super(
      `Access denied: ${reason}`,
      filePath,
      "FILE_ACCESS_DENIED",
      "Verify you have permission to access this file and it is within allowed paths",
    );
    this.name = "FileAccessDeniedError";
  }
}

/**
 * Error thrown when file is not found
 */
export class FileNotFoundError extends FileReadError {
  constructor(filePath: string) {
    super(
      "File not found",
      filePath,
      "FILE_NOT_FOUND",
      "Verify the file path is correct and the file exists",
    );
    this.name = "FileNotFoundError";
  }
}

/**
 * Error thrown when read operation is aborted
 */
export class FileReadAbortedError extends FileReadError {
  constructor(
    filePath: string,
    public readonly abortReason?: string,
  ) {
    super(
      `Read operation aborted${abortReason ? `: ${abortReason}` : ""}`,
      filePath,
      "FILE_READ_ABORTED",
      "The operation was cancelled. Retry if needed.",
    );
    this.name = "FileReadAbortedError";
  }
}

/**
 * Error thrown when an invalid encoding is specified
 */
export class InvalidEncodingError extends FileReadError {
  constructor(
    filePath: string,
    public readonly encoding: string,
  ) {
    super(
      `Invalid or unsupported encoding: ${encoding}`,
      filePath,
      "INVALID_ENCODING",
      "Use a valid Node.js BufferEncoding (utf8, base64, binary, etc.)",
    );
    this.name = "InvalidEncodingError";
  }
}
