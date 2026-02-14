/**
 * File Organizer MCP Server v3.2.0
 * Rate Limited Reader
 *
 * Wrapper that applies rate limiting to all file read operations.
 * SECURITY: All file reads MUST pass through rate limiting.
 *
 * @module readers/security/rate-limited-reader
 * @security Shepherd-Gamma Approved
 */

import { RateLimiter } from "../../services/security/rate-limiter.service.js";
import { FileOrganizerError } from "../../errors.js";
import { IAuditLogger, AuditLoggerService } from "./audit-logger.service.js";

/**
 * Error thrown when rate limit is exceeded.
 * Includes reset time for client handling.
 *
 * @extends FileOrganizerError
 */
export class RateLimitError extends FileOrganizerError {
  constructor(
    public readonly identifier: string,
    public readonly resetIn: number,
    public readonly limitType: "minute" | "hour" = "minute",
  ) {
    super(
      `Rate limit exceeded: Try again in ${resetIn} seconds`,
      "E_RATE_LIMIT",
      {
        identifier,
        resetIn,
        limitType,
        retryAfter: resetIn,
      },
      `Wait ${resetIn} seconds before retrying this operation`,
    );
    this.name = "RateLimitError";
  }
}

/**
 * Configuration options for RateLimitedReader.
 */
export interface RateLimitedReaderOptions {
  /** Maximum requests per minute (default: 100) */
  maxRequestsPerMinute?: number;

  /** Maximum requests per hour (default: 500) */
  maxRequestsPerHour?: number;

  /** Custom rate limiter instance (optional) */
  rateLimiter?: RateLimiter;

  /** Custom audit logger instance (optional) */
  auditLogger?: IAuditLogger;

  /** Component name for logging (default: 'RateLimitedReader') */
  component?: string;
}

/**
 * Type for rate-limited function wrapper.
 */
type RateLimitedFunction<T extends unknown[], R> = (
  identifier: string,
  ...args: T
) => Promise<R>;

/**
 * Rate Limited Reader wrapper.
 * Applies token bucket rate limiting to all file operations.
 *
 * SECURITY: This wrapper MUST be used for all file read operations
 * to enforce rate limiting policies.
 *
 * @example
 * ```typescript
 * const reader = new RateLimitedReader({
 *   maxRequestsPerMinute: 100,
 *   maxRequestsPerHour: 500
 * });
 *
 * // Apply rate limiting to a file read operation
 * const content = await reader.execute('user123', async () => {
 *   return fs.readFile('/path/to/file.txt');
 * });
 * ```
 */
export class RateLimitedReader {
  private readonly rateLimiter: RateLimiter;
  private readonly auditLogger: IAuditLogger;
  private readonly component: string;

  constructor(options: RateLimitedReaderOptions = {}) {
    this.rateLimiter =
      options.rateLimiter ||
      new RateLimiter(
        options.maxRequestsPerMinute ?? 100,
        options.maxRequestsPerHour ?? 500,
      );
    this.auditLogger =
      options.auditLogger ||
      new AuditLoggerService(options.component || "RateLimitedReader");
    this.component = options.component || "RateLimitedReader";
  }

  /**
   * Check rate limit for an identifier without recording a request.
   * Useful for pre-flight checks.
   *
   * @param identifier - User or session identifier
   * @returns Object with allowed status and reset time if limited
   */
  checkLimit(identifier: string): { allowed: boolean; resetIn?: number } {
    return this.rateLimiter.checkLimit(identifier);
  }

  /**
   * Execute a function with rate limiting.
   * The function will only execute if rate limit is not exceeded.
   *
   * SECURITY: The operation callback should only contain pre-validated operations.
   * Path validation is performed by callers (e.g., PathValidatorService) before
   * passing paths to this method.
   *
   * @param identifier - User or session identifier for rate limiting
   * @param operation - Async function to execute if allowed
   * @param context - Additional context for audit logging
   * @returns Result of the operation
   * @throws RateLimitError if rate limit is exceeded
   *
   * @example
   * ```typescript
   * const result = await reader.execute(
   *   'user123',
   *   async () => fs.readFile('file.txt'),
   *   { path: 'file.txt', operation: 'FILE_READ' }
   * );
   * ```
   */
  async execute<T>(
    identifier: string,
    operation: () => Promise<T> | T,
    context?: {
      path?: string;
      operation?: string;
      userId?: string;
    },
  ): Promise<T> {
    // Check rate limit
    const limitCheck = this.rateLimiter.checkLimit(identifier);

    if (!limitCheck.allowed) {
      const resetIn = limitCheck.resetIn ?? 60;
      const limitType = this.detectLimitType(resetIn);

      // Log rate limit event
      this.auditLogger.logRateLimitExceeded(identifier, resetIn);

      throw new RateLimitError(identifier, resetIn, limitType);
    }

    // Execute the operation
    const startTime = Date.now();
    try {
      const result = await operation();

      // Log successful operation
      if (context) {
        this.logSuccess(context, identifier, Date.now() - startTime);
      }

      return result;
    } catch (error) {
      // Log failure but still throw
      if (context) {
        this.logFailure(context, identifier, error);
      }
      throw error;
    }
  }

  /**
   * Execute a file read operation with comprehensive rate limiting and audit logging.
   * This is the primary method for rate-limited file reads.
   *
   * SECURITY: Path validation is performed by callers (e.g., PathValidatorService)
   * before being passed to this method. The filePath parameter is logged but not
   * directly used for file operations - the readOperation callback handles that.
   *
   * TYPE SAFETY: The generic type parameter T is used solely for return type inference.
   * It does not involve external deserialization or user-controlled type parsing,
   * making it safe from type confusion attacks. The caller provides both the type
   * annotation and the implementation via readOperation.
   *
   * @param identifier - User or session identifier
   * @param filePath - Path of file being read (validated by callers)
   * @param readOperation - Function that performs the actual read
   * @param userId - Optional user ID override
   * @returns File read result
   * @throws RateLimitError if rate limit exceeded
   *
   * @example
   * ```typescript
   * const content = await reader.readFile(
   *   'session-123',
   *   '/docs/file.txt',
   *   async () => fs.readFile('/docs/file.txt')
   * );
   * ```
   */
  async readFile<T>(
    identifier: string,
    filePath: string,
    readOperation: () => Promise<T>,
    userId?: string,
  ): Promise<T> {
    // Check rate limit first
    const limitCheck = this.rateLimiter.checkLimit(identifier);

    if (!limitCheck.allowed) {
      const resetIn = limitCheck.resetIn ?? 60;

      // Log to audit logger
      this.auditLogger.logRateLimitExceeded(identifier, resetIn);

      // Log to general logger
      throw new RateLimitError(identifier, resetIn);
    }

    // Log operation start
    const startTime = Date.now();
    const auditService =
      this.auditLogger instanceof AuditLoggerService
        ? this.auditLogger
        : undefined;

    if (auditService?.logOperationStart) {
      auditService.logOperationStart(filePath, "FILE_READ");
    }

    try {
      const result = await readOperation();

      // Log successful completion
      if (auditService?.logOperationComplete) {
        auditService.logOperationComplete(startTime, {
          operation: "FILE_READ",
          path: filePath,
          userId: userId || identifier,
          result: "SUCCESS",
          bytesRead: 0, // Will be updated by actual reader
        });
      }

      return result;
    } catch (error) {
      // Log error
      if (auditService?.logError) {
        auditService.logError(filePath, error, "FILE_READ");
      }

      throw error;
    }
  }

  /**
   * Create a wrapped version of a function that applies rate limiting.
   * The wrapped function will check rate limits before executing.
   *
   * SECURITY: The wrapped function should only be used with pre-validated operations.
   * Path validation is performed by callers before invoking the wrapped function.
   *
   * @param fn - Function to wrap with rate limiting
   * @param getIdentifier - Function to extract identifier from arguments
   * @returns Rate-limited wrapper function
   *
   * @example
   * ```typescript
   * const readFile = reader.wrap(
   *   (path: string) => fs.readFile(path),
   *   (path) => getUserFromPath(path)
   * );
   *
   * const content = await readFile('/docs/file.txt'); // Rate limited
   * ```
   */
  wrap<T extends unknown[], R>(
    fn: (...args: T) => Promise<R>,
    getIdentifier: (...args: T) => string = () => "default",
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      const identifier = getIdentifier(...args);
      return this.execute(identifier, () => fn(...args));
    };
  }

  /**
   * Create a session-specific rate limited reader.
   * All operations will use the same session identifier.
   *
   * TYPE SAFETY: Generic type parameters are used solely for return type inference.
   * No external deserialization occurs - the type is only used to infer the return
   * type from the operation callback provided by the caller.
   *
   * @param sessionId - Session identifier for all operations
   * @param userId - Optional user ID for audit logging
   * @returns Session-bound rate limited operations
   */
  forSession(
    sessionId: string,
    userId?: string,
  ): {
    execute: <T>(
      operation: () => Promise<T>,
      context?: { path?: string; operation?: string },
    ) => Promise<T>;
    readFile: <T>(
      filePath: string,
      readOperation: () => Promise<T>,
    ) => Promise<T>;
    checkLimit: () => { allowed: boolean; resetIn?: number };
  } {
    const effectiveUserId = userId || sessionId;

    return {
      execute: <T>(
        operation: () => Promise<T>,
        context?: { path?: string; operation?: string },
      ) =>
        this.execute(sessionId, operation, {
          ...context,
          userId: effectiveUserId,
        }),

      readFile: <T>(filePath: string, readOperation: () => Promise<T>) =>
        this.readFile(sessionId, filePath, readOperation, effectiveUserId),

      checkLimit: () => this.checkLimit(sessionId),
    };
  }

  /**
   * Get current rate limit status for an identifier.
   *
   * @param identifier - User or session identifier
   * @returns Current rate limit status
   */
  getStatus(identifier: string): {
    allowed: boolean;
    resetIn?: number;
    remaining?: number;
  } {
    const check = this.rateLimiter.checkLimit(identifier);

    // If allowed, calculate approximate remaining
    if (check.allowed) {
      // This is approximate since we just recorded the request
      return {
        allowed: true,
        remaining: undefined, // Would need internal access to calculate accurately
      };
    }

    return {
      allowed: false,
      resetIn: check.resetIn,
    };
  }

  /**
   * Detect which rate limit (minute or hour) was exceeded based on reset time.
   */
  private detectLimitType(resetIn: number): "minute" | "hour" {
    // Hourly limits reset at > 60 seconds
    return resetIn > 60 ? "hour" : "minute";
  }

  /**
   * Log successful operation to audit logger.
   */
  private logSuccess(
    context: { path?: string; operation?: string; userId?: string },
    identifier: string,
    durationMs: number,
  ): void {
    if (!context.path) return;

    const entry = this.auditLogger.createEntry({
      operation: (context.operation as any) || "FILE_READ",
      path: context.path,
      userId: context.userId || identifier,
      result: "SUCCESS",
      bytesRead: 0,
      durationMs,
    });

    this.auditLogger.logFileRead(entry);
  }

  /**
   * Log failed operation to audit logger.
   */
  private logFailure(
    context: { path?: string; operation?: string; userId?: string },
    identifier: string,
    error: unknown,
  ): void {
    if (!context.path) return;

    const errorMessage = error instanceof Error ? error.message : String(error);

    const entry = this.auditLogger.createEntry({
      operation: (context.operation as any) || "FILE_READ",
      path: context.path,
      userId: context.userId || identifier,
      result: "ERROR",
      bytesRead: 0,
      errorMessage,
    });

    this.auditLogger.logFileRead(entry);
  }
}

/**
 * Default rate limited reader instance.
 * Uses default rate limits: 100 req/min, 500 req/hour
 */
export const defaultRateLimitedReader = new RateLimitedReader({
  maxRequestsPerMinute: 100,
  maxRequestsPerHour: 500,
});

/**
 * Factory function for creating configured rate limited readers.
 *
 * @param options - Configuration options
 * @returns Configured RateLimitedReader instance
 */
export function createRateLimitedReader(
  options?: RateLimitedReaderOptions,
): RateLimitedReader {
  return new RateLimitedReader(options);
}

/**
 * Higher-order function for applying rate limiting to any async function.
 *
 * @param fn - Function to rate limit
 * @param options - Rate limiting options
 * @returns Rate-limited version of the function
 *
 * @example
 * ```typescript
 * const readFile = withRateLimit(
 *   fs.promises.readFile,
 *   { maxRequestsPerMinute: 50 }
 * );
 *
 * const content = await readFile('file.txt');
 * ```
 */
export function withRateLimit<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  options?: RateLimitedReaderOptions & {
    getIdentifier?: (...args: T) => string;
  },
): (...args: T) => Promise<R> {
  const reader = new RateLimitedReader(options);
  const getIdentifier = options?.getIdentifier || (() => "default");

  return reader.wrap(fn, getIdentifier);
}
