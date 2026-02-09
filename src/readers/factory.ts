/**
 * File Reader Factory
 *
 * Factory for creating configured SecureFileReader instances.
 * Provides sensible defaults and dependency injection support.
 *
 * @module FileReaderFactory
 * @version 3.2.0
 */

import { PathValidatorService } from "../services/path-validator.service.js";
import { RateLimiter } from "../services/security/rate-limiter.service.js";
import { SecureFileReader, IAuditLogger } from "./secure-file-reader.js";
import { logger } from "../utils/logger.js";

/**
 * Options for creating a SecureFileReader
 */
export interface ReaderOptions {
  /** Maximum file size to read (default: 10MB) */
  maxReadSize?: number;

  /** Rate limiter instance or configuration */
  rateLimiter?: RateLimiter;
  maxRequestsPerMinute?: number;
  maxRequestsPerHour?: number;

  /** Custom audit logger (default: console logger) */
  auditLogger?: IAuditLogger;

  /** Base path for path validation */
  basePath?: string;

  /** Allowed paths for validation */
  allowedPaths?: string[];
}

/**
 * Default audit logger implementation using console
 * Logs to stderr in JSON format for structured logging
 */
class ConsoleAuditLogger implements IAuditLogger {
  logOperationStart(
    operation: string,
    path: string,
    context?: Record<string, unknown>,
  ): void {
    logger.info(`File operation started: ${operation}`, {
      operation,
      path,
      ...context,
    });
  }

  logOperationSuccess(
    operation: string,
    path: string,
    result: Record<string, unknown>,
  ): void {
    logger.info(`File operation completed: ${operation}`, {
      operation,
      path,
      status: "success",
      ...result,
    });
  }

  logOperationFailure(operation: string, path: string, error: Error): void {
    logger.error(`File operation failed: ${operation}`, error, {
      operation,
      path,
      status: "failure",
    });
  }
}

/**
 * Factory for creating SecureFileReader instances
 *
 * @example
 * ```typescript
 * // Create with defaults
 * const reader = FileReaderFactory.createDefault();
 *
 * // Create with custom options
 * const reader = FileReaderFactory.createWithOptions({
 *   maxReadSize: 5 * 1024 * 1024, // 5MB
 *   maxRequestsPerMinute: 30,
 *   basePath: '/allowed/directory'
 * });
 * ```
 */
export class FileReaderFactory {
  private static defaultAuditLogger: IAuditLogger = new ConsoleAuditLogger();

  /**
   * Create a SecureFileReader with default configuration
   *
   * Default configuration:
   * - maxReadSize: 10MB
   * - maxRequestsPerMinute: 60
   * - maxRequestsPerHour: 500
   * - auditLogger: Console logger
   * - basePath: process.cwd()
   *
   * @returns Configured SecureFileReader instance
   */
  static createDefault(): SecureFileReader {
    return this.createWithOptions({});
  }

  /**
   * Create a SecureFileReader with custom options
   *
   * @param options - Configuration options
   * @returns Configured SecureFileReader instance
   */
  static createWithOptions(options: ReaderOptions): SecureFileReader {
    // Create path validator
    const pathValidator = new PathValidatorService(
      options.basePath,
      options.allowedPaths,
    );

    // Create or use provided rate limiter
    const rateLimiter =
      options.rateLimiter ??
      new RateLimiter(
        options.maxRequestsPerMinute ?? 60,
        options.maxRequestsPerHour ?? 500,
      );

    // Use provided or default audit logger
    const auditLogger = options.auditLogger ?? this.defaultAuditLogger;

    // Determine max read size
    const maxReadSize = options.maxReadSize ?? 10 * 1024 * 1024; // 10MB default

    return new SecureFileReader(
      pathValidator,
      rateLimiter,
      auditLogger,
      maxReadSize,
    );
  }

  /**
   * Set the default audit logger for all future created readers
   *
   * @param auditLogger - The audit logger to use as default
   */
  static setDefaultAuditLogger(auditLogger: IAuditLogger): void {
    this.defaultAuditLogger = auditLogger;
  }
}
