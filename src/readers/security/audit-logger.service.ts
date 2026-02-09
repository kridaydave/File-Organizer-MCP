/**
 * File Organizer MCP Server v3.2.0
 * Audit Logger Service
 *
 * Comprehensive audit logging for all file read operations.
 * SECURITY: Every file read MUST be logged through this service.
 *
 * @module readers/security/audit-logger.service
 * @security Shepherd-Gamma Approved
 */

import { logger } from "../../utils/logger.js";

/**
 * Valid audit log operation types
 */
export type AuditOperation =
  | "FILE_READ"
  | "FILE_READ_CHUNK"
  | "FILE_STAT"
  | "FILE_VALIDATE"
  | "FILE_ACCESS_CHECK"
  | "DIRECTORY_LIST"
  | "VALIDATION_FAILURE"
  | "RATE_LIMIT_EXCEEDED";

/**
 * Valid audit log result statuses
 */
export type AuditResult =
  | "SUCCESS"
  | "FAILURE"
  | "BLOCKED"
  | "RATE_LIMITED"
  | "ERROR";

/**
 * Audit log entry structure.
 * All file read operations must create and log one of these entries.
 */
export interface AuditLogEntry {
  /** ISO 8601 timestamp of the operation */
  readonly timestamp: string;

  /** Type of operation performed */
  readonly operation: AuditOperation;

  /** File or directory path (sanitized for sensitive patterns) */
  readonly path: string;

  /** User or session identifier */
  readonly userId: string;

  /** Result status of the operation */
  readonly result: AuditResult;

  /** Number of bytes read (0 for non-read operations) */
  readonly bytesRead: number;

  /** SHA-256 checksum of file content (if applicable) */
  readonly checksum?: string;

  /** Additional context and metadata */
  readonly metadata?: Record<string, unknown>;

  /** Error message if result is FAILURE or ERROR */
  readonly errorMessage?: string;

  /** Duration of operation in milliseconds */
  readonly durationMs?: number;

  /** Session identifier for grouping related operations */
  readonly sessionId?: string;

  /** Client IP or identifier */
  readonly clientId?: string;
}

/**
 * Interface for audit logger implementations.
 * All file readers must use an implementation of this interface.
 */
export interface IAuditLogger {
  /**
   * Log a file read operation.
   * This method MUST be called for every file read.
   *
   * @param entry - Complete audit log entry
   */
  logFileRead(entry: AuditLogEntry): void;

  /**
   * Log a validation failure.
   * Convenience method for logging security validation failures.
   *
   * @param path - The path that failed validation
   * @param reason - Human-readable failure reason
   * @param metadata - Additional context
   */
  logValidationFailure(
    path: string,
    reason: string,
    metadata?: Record<string, unknown>,
  ): void;

  /**
   * Log a rate limit exceeded event.
   *
   * @param identifier - The rate limit identifier (user/session)
   * @param resetIn - Seconds until rate limit resets
   */
  logRateLimitExceeded(identifier: string, resetIn: number): void;

  /**
   * Create a new audit log entry with current timestamp.
   * Utility method for building entries.
   *
   * @param partialEntry - Partial entry without timestamp
   * @returns Complete audit log entry
   */
  createEntry(partialEntry: Omit<AuditLogEntry, "timestamp">): AuditLogEntry;
}

/**
 * Sanitizes a path for audit logging by redacting sensitive components.
 *
 * @param path - Raw file path
 * @returns Sanitized path safe for logging
 */
function sanitizeAuditPath(path: string): string {
  if (!path || typeof path !== "string") {
    return "[INVALID_PATH]";
  }

  // Check for sensitive patterns
  const sensitivePatterns = [
    /\.env/i,
    /\.ssh/i,
    /id_rsa/i,
    /id_ed25519/i,
    /\.pem/i,
    /\.key/i,
    /password/i,
    /secret/i,
    /token/i,
    /credential/i,
    /\.aws/i,
    /\.docker/i,
    /shadow/i,
    /passwd/i,
  ];

  const lowerPath = path.toLowerCase();
  for (const pattern of sensitivePatterns) {
    if (pattern.test(lowerPath)) {
      // Extract directory and redact filename
      const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
      if (lastSlash >= 0) {
        return path.substring(0, lastSlash + 1) + "[REDACTED_SENSITIVE]";
      }
      return "[REDACTED_SENSITIVE]";
    }
  }

  return path;
}

/**
 * Default user/session ID extractor.
 * Attempts to get user from environment or returns system default.
 */
function getDefaultUserId(): string {
  return (
    process.env.USER || process.env.USERNAME || process.env.LOGNAME || "system"
  );
}

/**
 * Audit Logger Service implementation.
 * Provides structured JSON logging for all file operations.
 *
 * @example
 * ```typescript
 * const auditLogger = new AuditLoggerService();
 *
 * // Log a successful file read
 * auditLogger.logFileRead(auditLogger.createEntry({
 *   operation: 'FILE_READ',
 *   path: '/docs/report.pdf',
 *   userId: 'user123',
 *   result: 'SUCCESS',
 *   bytesRead: 1024,
 *   checksum: 'abc123...'
 * }));
 *
 * // Log a validation failure
 * auditLogger.logValidationFailure('/etc/shadow', 'Sensitive file access blocked');
 * ```
 */
export class AuditLoggerService implements IAuditLogger {
  private readonly defaultUserId: string;
  private readonly sessionId: string;

  constructor(
    private readonly component: string = "FileReader",
    private readonly options: {
      /** Include full stack traces in error logs */
      includeStackTrace?: boolean;
      /** Redact sensitive paths in logs */
      redactSensitivePaths?: boolean;
    } = {},
  ) {
    this.defaultUserId = getDefaultUserId();
    this.sessionId = this.generateSessionId();
  }

  /**
   * Generate a unique session identifier.
   */
  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Log a complete audit entry.
   * All file read operations MUST call this method.
   *
   * @param entry - The audit log entry to record
   */
  logFileRead(entry: AuditLogEntry): void {
    const sanitizedEntry =
      this.options.redactSensitivePaths !== false
        ? { ...entry, path: sanitizeAuditPath(entry.path) }
        : entry;

    logger.info("AUDIT_LOG", {
      type: "audit",
      component: this.component,
      sessionId: this.sessionId,
      ...sanitizedEntry,
    });
  }

  /**
   * Log a validation failure event.
   * Use this when security validation prevents a file operation.
   *
   * @param path - The path that failed validation
   * @param reason - Human-readable failure reason
   * @param metadata - Additional context
   */
  logValidationFailure(
    path: string,
    reason: string,
    metadata?: Record<string, unknown>,
  ): void {
    const entry = this.createEntry({
      operation: "VALIDATION_FAILURE",
      path,
      userId: this.defaultUserId,
      result: "BLOCKED",
      bytesRead: 0,
      errorMessage: reason,
      metadata: {
        ...metadata,
        validationType: "security",
      },
    });

    this.logFileRead(entry);

    // Also log as warning for immediate visibility
    logger.warn("Security validation failure", {
      path: sanitizeAuditPath(path),
      reason,
      component: this.component,
    });
  }

  /**
   * Log a rate limit exceeded event.
   *
   * @param identifier - The rate limit identifier (user/session)
   * @param resetIn - Seconds until rate limit resets
   */
  logRateLimitExceeded(identifier: string, resetIn: number): void {
    const entry = this.createEntry({
      operation: "RATE_LIMIT_EXCEEDED",
      path: "[N/A]",
      userId: identifier,
      result: "RATE_LIMITED",
      bytesRead: 0,
      metadata: {
        resetInSeconds: resetIn,
        rateLimitType: "per_session",
      },
    });

    this.logFileRead(entry);

    logger.warn("Rate limit exceeded", {
      identifier,
      resetIn,
      component: this.component,
    });
  }

  /**
   * Create a new audit log entry with current timestamp.
   * Helper method for building complete entries.
   *
   * @param partialEntry - Entry data without timestamp
   * @returns Complete audit log entry with timestamp
   */
  createEntry(partialEntry: Omit<AuditLogEntry, "timestamp">): AuditLogEntry {
    return {
      timestamp: new Date().toISOString(),
      ...partialEntry,
      sessionId: partialEntry.sessionId || this.sessionId,
    };
  }

  /**
   * Log file read start (async operations).
   * Use for long-running operations to track start time.
   *
   * @param path - File being read
   * @param operation - Type of operation
   * @returns Start time marker for calculating duration
   */
  logOperationStart(path: string, operation: AuditOperation): number {
    const startTime = Date.now();

    logger.debug("Operation started", {
      type: "audit_start",
      component: this.component,
      operation,
      path: sanitizeAuditPath(path),
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
    });

    return startTime;
  }

  /**
   * Log file read completion with duration.
   * Use with logOperationStart for accurate timing.
   *
   * @param startTime - Value returned by logOperationStart
   * @param entry - Complete audit entry
   */
  logOperationComplete(
    startTime: number,
    entry: Omit<AuditLogEntry, "timestamp" | "durationMs">,
  ): void {
    const durationMs = Date.now() - startTime;

    this.logFileRead(
      this.createEntry({
        ...entry,
        durationMs,
      }),
    );
  }

  /**
   * Log file read error with full context.
   *
   * @param path - File path
   * @param error - Error that occurred
   * @param operation - Type of operation that failed
   */
  logError(
    path: string,
    error: Error | unknown,
    operation: AuditOperation = "FILE_READ",
  ): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    const entry = this.createEntry({
      operation,
      path,
      userId: this.defaultUserId,
      result: "ERROR",
      bytesRead: 0,
      errorMessage,
      metadata:
        this.options.includeStackTrace && errorStack
          ? { stackTrace: errorStack }
          : undefined,
    });

    this.logFileRead(entry);

    logger.error("File operation error", error, {
      path: sanitizeAuditPath(path),
      operation,
      component: this.component,
    });
  }

  /**
   * Get current session ID for correlation.
   */
  getSessionId(): string {
    return this.sessionId;
  }
}

/**
 * Singleton audit logger instance for default use.
 * Applications can create custom instances for different components.
 */
export const defaultAuditLogger = new AuditLoggerService("FileReader", {
  redactSensitivePaths: true,
});

/**
 * Factory function for creating component-specific audit loggers.
 *
 * @param component - Component name for log attribution
 * @param options - Logger configuration options
 * @returns Configured AuditLoggerService instance
 */
export function createAuditLogger(
  component: string,
  options?: {
    includeStackTrace?: boolean;
    redactSensitivePaths?: boolean;
  },
): AuditLoggerService {
  return new AuditLoggerService(component, options);
}
