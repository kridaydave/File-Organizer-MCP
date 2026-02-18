/**
 * File Organizer MCP Server v3.4.0
 * Security Module Index
 *
 * Central export point for all file reader security modules.
 * SECURITY: All security controls are enforced through these exports.
 *
 * @module readers/security
 * @security Shepherd-Gamma Approved
 */

// ============================================================================
// Sensitive File Pattern Detection
// ============================================================================

export {
  /** Core sensitive file patterns - MUST be checked before any read */
  SENSITIVE_PATTERNS,
  /** Extended patterns for high-security environments */
  STRICT_SENSITIVE_PATTERNS,
  /** Sensitive directory patterns */
  SENSITIVE_DIRECTORIES,
  /** Error class for sensitive file access attempts */
  FileReadError,
  /** Success result factory */
  ok,
  /** Error result factory */
  err,
  /** Check if path matches sensitive patterns (boolean) */
  isSensitiveFile,
  /** Check sensitive file with detailed Result */
  checkSensitiveFile,
  /** Check with extended strict patterns */
  checkSensitiveFileStrict,
  /** Get the pattern that matched a sensitive file */
  getMatchedPattern,
  /** Sanitize path for safe logging */
  sanitizePathForLogging,
} from "./sensitive-file-patterns.js";

export type {
  /** Result type for sensitive file checks */
  Result,
} from "./sensitive-file-patterns.js";

// ============================================================================
// Audit Logging
// ============================================================================

export {
  /** Main audit logger implementation */
  AuditLoggerService,
  /** Default singleton audit logger instance */
  defaultAuditLogger,
  /** Factory for creating component-specific loggers */
  createAuditLogger,
} from "./audit-logger.service.js";

export type {
  /** Audit logger interface - all loggers must implement this */
  IAuditLogger,
  /** Audit log entry structure */
  AuditLogEntry,
  /** Audit operation types */
  AuditOperation,
  /** Audit result statuses */
  AuditResult,
} from "./audit-logger.service.js";

// ============================================================================
// Rate Limited Reading
// ============================================================================

export {
  /** Error thrown when rate limit is exceeded */
  RateLimitError,
  /** Main rate limited reader implementation */
  RateLimitedReader,
  /** Default singleton rate limited reader instance */
  defaultRateLimitedReader,
  /** Factory for creating configured rate limited readers */
  createRateLimitedReader,
  /** HOF for applying rate limiting to any function */
  withRateLimit,
} from "./rate-limited-reader.js";

export type {
  /** Configuration options for rate limited reader */
  RateLimitedReaderOptions,
} from "./rate-limited-reader.js";

// ============================================================================
// Security Re-exports from Core Services
// ============================================================================

export {
  /** Rate limiter from core services - for advanced use */
  RateLimiter,
} from "../../services/security/rate-limiter.service.js";

export {
  /** Base path validation function */
  validatePathBase,
  /** Strict path validation (CWD-only) */
  validateStrictPath,
  /** Path validator service class */
  PathValidatorService,
  /** Access checking function */
  checkAccess,
} from "../../services/path-validator.service.js";

export type {
  /** Path validation options */
  ValidatePathOptions,
} from "../../services/path-validator.service.js";

// ============================================================================
// Security Utilities
// ============================================================================

export {
  /** Check if path is within allowed directory */
  isSubPath,
  /** Normalize path (expand env vars, home, etc) */
  normalizePath,
} from "../../utils/file-utils.js";

export {
  /** Check if path is allowed by security policy */
  isPathAllowed,
  /** Format access denied message */
  formatAccessDeniedMessage,
} from "../../utils/path-security.js";

export {
  /** Structured logger class */
  Logger,
  /** Default logger instance */
  logger,
} from "../../utils/logger.js";

// ============================================================================
// Security Error Types
// ============================================================================

export {
  /** Access denied error */
  AccessDeniedError,
  /** Validation error */
  ValidationError,
} from "../../types.js";

export {
  /** Base file organizer error */
  FileOrganizerError,
} from "../../errors.js";

// ============================================================================
// Security Constants
// ============================================================================

/**
 * Default rate limits as per security policy.
 * @security These defaults align with Shepherd-Gamma requirements
 */
export const DEFAULT_RATE_LIMITS = {
  /** Maximum requests per minute per session */
  MAX_REQUESTS_PER_MINUTE: 100,
  /** Maximum requests per hour per session */
  MAX_REQUESTS_PER_HOUR: 500,
} as const;

/**
 * Security validation levels.
 */
export const SECURITY_LEVELS = {
  /** Standard security - basic sensitive file blocking */
  STANDARD: "standard",
  /** Strict security - extended patterns and additional checks */
  STRICT: "strict",
  /** Maximum security - all checks enabled, audit everything */
  MAXIMUM: "maximum",
} as const;

/**
 * Type for security levels.
 */
export type SecurityLevel =
  (typeof SECURITY_LEVELS)[keyof typeof SECURITY_LEVELS];

/**
 * Security configuration interface.
 */
export interface SecurityConfig {
  /** Security level to apply */
  level: SecurityLevel;
  /** Whether to enable audit logging */
  auditLogging: boolean;
  /** Whether to enable rate limiting */
  rateLimiting: boolean;
  /** Whether to check sensitive files */
  sensitiveFileCheck: boolean;
  /** Custom rate limits (optional) */
  rateLimits?: {
    perMinute?: number;
    perHour?: number;
  };
}

/**
 * Default security configuration.
 * @security Aligns with Shepherd-Gamma requirements
 */
export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  level: SECURITY_LEVELS.STANDARD,
  auditLogging: true,
  rateLimiting: true,
  sensitiveFileCheck: true,
  rateLimits: {
    perMinute: DEFAULT_RATE_LIMITS.MAX_REQUESTS_PER_MINUTE,
    perHour: DEFAULT_RATE_LIMITS.MAX_REQUESTS_PER_HOUR,
  },
};

/**
 * Creates a security configuration with merged defaults.
 *
 * @param config - Partial configuration to merge
 * @returns Complete security configuration
 */
export function createSecurityConfig(
  config: Partial<SecurityConfig> = {},
): SecurityConfig {
  return {
    ...DEFAULT_SECURITY_CONFIG,
    ...config,
    rateLimits: {
      ...DEFAULT_SECURITY_CONFIG.rateLimits,
      ...config.rateLimits,
    },
  };
}
