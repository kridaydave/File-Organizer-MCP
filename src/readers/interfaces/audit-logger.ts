/**
 * Audit Logger Interface
 *
 * Defines the contract for audit logging of file read operations.
 * Part of Layer 2 (Security & Resource Controls)
 */

import { FileReadOperation } from "../types.js";

/**
 * Audit log entry for a file read operation
 */
export interface AuditLogEntry {
  /** ISO timestamp of the operation */
  readonly timestamp: string;

  /** Type of read operation performed */
  readonly operation: FileReadOperation;

  /** File path that was accessed */
  readonly path: string;

  /** User identifier (if available) */
  readonly user: string | null;

  /** Result of the operation ('success' or error code) */
  readonly result: string;

  /** Number of bytes read (0 if failed) */
  readonly bytesRead: number;

  /** Optional additional context */
  readonly context?: Readonly<Record<string, unknown>>;
}

/**
 * Audit logger interface for file operations
 * Implementations should persist audit logs for security compliance
 */
export interface IAuditLogger {
  /**
   * Log a file read operation
   * @param entry - The audit log entry to record
   * @returns Promise that resolves when log is persisted
   */
  log(entry: AuditLogEntry): Promise<void>;

  /**
   * Log a successful file read
   * @param operation - Type of operation
   * @param path - File path accessed
   * @param bytesRead - Number of bytes read
   * @param context - Optional context data
   */
  logSuccess(
    operation: FileReadOperation,
    path: string,
    bytesRead: number,
    context?: Record<string, unknown>,
  ): Promise<void>;

  /**
   * Log a failed file read
   * @param operation - Type of operation
   * @param path - File path accessed
   * @param errorCode - Error code or message
   * @param context - Optional context data
   */
  logFailure(
    operation: FileReadOperation,
    path: string,
    errorCode: string,
    context?: Record<string, unknown>,
  ): Promise<void>;

  /**
   * Query audit logs (for admin/review purposes)
   * @param startTime - Start of time range
   * @param endTime - End of time range
   * @param pathFilter - Optional path filter
   * @returns Array of matching audit log entries
   */
  query(
    startTime: Date,
    endTime: Date,
    pathFilter?: string,
  ): Promise<AuditLogEntry[]>;
}

/**
 * Options for creating an audit logger
 */
export interface AuditLoggerOptions {
  /** Maximum number of entries to keep in memory */
  readonly maxEntries?: number;

  /** Whether to include file content hashes in logs */
  readonly includeHashes?: boolean;

  /** User identifier for all operations */
  readonly defaultUser?: string;

  /** External log destination (e.g., syslog, SIEM) */
  readonly externalEndpoint?: string;
}
