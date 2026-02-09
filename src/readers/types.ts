/**
 * File Reader Types
 *
 * Defines core types and interfaces for the file reading system.
 * Implements the 3-layer security architecture:
 * - Layer 1: Input Validation & Sanitization
 * - Layer 2: Security & Resource Controls
 * - Layer 3: Business Logic & Execution
 */

import { Readable } from "stream";

/**
 * Options for reading a file
 * Used in Layer 1 (Input Validation) and Layer 3 (Execution)
 */
export interface FileReadOptions {
  /** File encoding (e.g., 'utf-8', 'base64', 'binary') */
  readonly encoding: BufferEncoding | null;

  /** Maximum bytes to read (security limit) */
  readonly maxBytes: number;

  /** Offset to start reading from */
  readonly offset: number;

  /** AbortSignal for cancellation */
  readonly signal: AbortSignal | null;
}

/**
 * File system metadata for a read operation
 * Used in Layer 3 (Execution results)
 */
export interface FileMetadata {
  /** Resolved absolute path of the file */
  readonly path: string;

  /** MIME type of the file */
  readonly mimeType: string;

  /** Total file size in bytes */
  readonly size: number;

  /** Timestamp when the file was read */
  readonly readAt: Date;

  /** SHA-256 checksum of the read content */
  readonly checksum?: string;

  /** Encoding used for the read operation */
  readonly encoding?: string;
}

/**
 * Result of a file read operation
 * Generic T represents the data type (string for text, Buffer for binary)
 * Used in Layer 3 (Business Logic & Execution)
 */
export interface FileReadResult {
  /** The file data (string for text, Buffer for binary) */
  readonly data: string | Buffer;

  /** Number of bytes actually read */
  readonly bytesRead: number;

  /** File metadata */
  readonly metadata: FileMetadata;
}

/**
 * File Reader interface
 * Defines the contract for file reading operations
 * Implements Layer 3 (Business Logic & Execution)
 */
export interface IFileReader {
  /**
   * Read a file completely into memory
   * @param filePath - Path to the file to read
   * @param options - Read options
   * @returns Promise resolving to FileReadResult
   */
  read(
    filePath: string,
    options?: Partial<FileReadOptions>,
  ): Promise<FileReadResult>;

  /**
   * Create a readable stream for a file
   * @param filePath - Path to the file to stream
   * @param options - Read options
   * @returns Readable stream
   */
  readStream(filePath: string, options?: Partial<FileReadOptions>): Readable;
}

/**
 * Default read options
 */
export const DEFAULT_READ_OPTIONS: Readonly<FileReadOptions> = {
  encoding: "utf-8",
  maxBytes: 10 * 1024 * 1024, // 10MB default
  offset: 0,
  signal: null,
} as const;

/**
 * Supported MIME types for common file extensions
 */
export const MIME_TYPE_MAP: Readonly<Record<string, string>> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
  ".js": "application/javascript",
  ".ts": "application/typescript",
  ".html": "text/html",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
} as const;

/**
 * File read operation types for audit logging
 */
export type FileReadOperation = "read" | "readStream" | "readPartial";
