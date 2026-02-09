/**
 * File Organizer MCP Server v3.2.0
 * Sensitive File Patterns
 *
 * Defines patterns for identifying and blocking access to sensitive files.
 * SECURITY: All patterns must be checked BEFORE any file read operation.
 *
 * @module readers/security/sensitive-file-patterns
 * @security Shepherd-Gamma Approved
 */

import { FileOrganizerError } from "../../errors.js";

/**
 * Error thrown when attempting to access a sensitive file
 * @extends FileOrganizerError
 */
export class FileReadError extends FileOrganizerError {
  constructor(
    message: string,
    public readonly sensitivePath: string,
    public readonly patternMatched: string,
  ) {
    super(
      message,
      "E_SENSITIVE_FILE",
      { sensitivePath, patternMatched },
      "This file contains sensitive information and cannot be accessed",
    );
    this.name = "FileReadError";
  }
}

/**
 * Result type for operations that can succeed or fail
 * @template T Success value type
 * @template E Error type
 */
export type Result<T, E> =
  | { readonly success: true; readonly value: T }
  | { readonly success: false; readonly error: E };

/**
 * Success result factory
 * @param value - The successful value
 * @returns Result with success=true
 */
export function ok<T>(value: T): Result<T, never> {
  return { success: true, value };
}

/**
 * Error result factory
 * @param error - The error value
 * @returns Result with success=false
 */
export function err<E>(error: E): Result<never, E> {
  return { success: false, error };
}

/**
 * Sensitive file patterns that must be blocked from reading.
 * These patterns are checked BEFORE any file read operation.
 *
 * @security CRITICAL: Keep patterns in sync with security policy
 */
export const SENSITIVE_PATTERNS: RegExp[] = [
  // Environment files - contain secrets, API keys, database credentials
  /\.env$/i,
  /\.env\.local$/i,
  /\.env\.[a-z]+$/i, // .env.development, .env.production, etc.

  // SSH keys - private authentication credentials
  /\.ssh\//i,
  /id_rsa$/i,
  /id_ed25519$/i,
  /id_ecdsa$/i,
  /id_dsa$/i,
  /\.pem$/i,
  /\.key$/i,
  /ssh_key/i,
  /private.*key/i,

  // AWS credentials
  /\.aws\//i,
  /aws\/(credentials|config)$/i,

  // Docker configuration - may contain registry credentials
  /\.docker\/config\.json$/i,

  // Package manager configs - may contain auth tokens
  /\.npmrc$/i,
  /\.pypirc$/i,
  /\.gemrc$/i,

  // System password files
  /shadow$/i,
  /passwd$/i,
  /master\.passwd$/i,

  // Generic sensitive file patterns
  /password/i,
  /secret/i,
  /token/i,
  /credential/i,
  /api[_-]?key/i,
  /auth[_-]?token/i,
  /bearer/i,
  /private/i,
  /confidential/i,

  // Kubernetes secrets
  /kubeconfig$/i,
  /\.kube\/config$/i,

  // TLS/SSL private keys
  /\.pfx$/i,
  /\.p12$/i,
  /\.crt$/i,
  /\.cert$/i,
  /\.csr$/i,

  // Database files
  /\.sqlite$/i,
  /\.sqlite3$/i,
  /\.db$/i,

  // Common backup files that might contain sensitive data
  /\.bak$/i,
  /\.backup$/i,
  /\.old$/i,
  /\.orig$/i,

  // IDE/Editor config with potential credentials
  /\.vscode\/settings\.json$/i,
  /\.idea\/.*\.xml$/i,

  // CI/CD configs with secrets
  /\.github\/workflows\/.*\.yml$/i,
  /\.gitlab-ci\.yml$/i,
  /\.travis\.yml$/i,

  // Shell history files
  /\.bash_history$/i,
  /\.zsh_history$/i,
  /\.sh_history$/i,
];

/**
 * Additional directory patterns that should be completely blocked
 * @security These directories are recursively blocked
 */
export const SENSITIVE_DIRECTORIES: RegExp[] = [
  /\.ssh$/i,
  /\.aws$/i,
  /\.gnupg$/i,
  /\.kube$/i,
  /\.docker$/i,
  /etc\/shadow/i,
  /etc\/passwd/i,
  /System\/Keychains/i,
  /Keychains$/i,
];

/**
 * Checks if a file path matches any sensitive file pattern.
 * This is a simple boolean check for use in guards and filters.
 *
 * @param filePath - The file path to check
 * @returns True if the path matches a sensitive file pattern
 *
 * @example
 * ```typescript
 * if (isSensitiveFile('/home/user/.env')) {
 *   console.log('Blocked: sensitive file');
 * }
 * ```
 */
export function isSensitiveFile(filePath: string): boolean {
  if (!filePath || typeof filePath !== "string") {
    return false;
  }

  const normalizedPath = filePath.toLowerCase().replace(/\\/g, "/");

  // Check file patterns
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(normalizedPath)) {
      return true;
    }
  }

  // Check directory patterns
  for (const pattern of SENSITIVE_DIRECTORIES) {
    if (pattern.test(normalizedPath)) {
      return true;
    }
  }

  return false;
}

/**
 * Comprehensive check for sensitive files with detailed result.
 * Returns a Result type that includes error details if blocked.
 *
 * SECURITY: This function MUST be called BEFORE any file read operation.
 *
 * @param filePath - The file path to validate
 * @returns Result<void, FileReadError> - Success if not sensitive, error with details if sensitive
 *
 * @example
 * ```typescript
 * const result = checkSensitiveFile('/home/user/.env');
 * if (!result.success) {
 *   console.error(result.error.message);
 *   return;
 * }
 * // Safe to proceed with file read
 * ```
 */
export function checkSensitiveFile(
  filePath: string,
): Result<void, FileReadError> {
  if (!filePath || typeof filePath !== "string") {
    return err(
      new FileReadError(
        "Invalid file path provided",
        String(filePath),
        "INVALID_PATH",
      ),
    );
  }

  const normalizedPath = filePath.toLowerCase().replace(/\\/g, "/");

  // Check file patterns first
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(normalizedPath)) {
      return err(
        new FileReadError(
          `Access denied: File matches sensitive pattern ${pattern.source}`,
          filePath,
          pattern.source,
        ),
      );
    }
  }

  // Check directory patterns
  for (const pattern of SENSITIVE_DIRECTORIES) {
    if (pattern.test(normalizedPath)) {
      return err(
        new FileReadError(
          `Access denied: Path is within sensitive directory matching ${pattern.source}`,
          filePath,
          pattern.source,
        ),
      );
    }
  }

  return ok(undefined);
}

/**
 * Gets the first matching pattern for a sensitive file.
 * Useful for logging and debugging which pattern was matched.
 *
 * @param filePath - The file path to check
 * @returns The matched pattern string or null if not sensitive
 */
export function getMatchedPattern(filePath: string): string | null {
  if (!filePath || typeof filePath !== "string") {
    return null;
  }

  const normalizedPath = filePath.toLowerCase().replace(/\\/g, "/");

  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(normalizedPath)) {
      return pattern.source;
    }
  }

  for (const pattern of SENSITIVE_DIRECTORIES) {
    if (pattern.test(normalizedPath)) {
      return `directory:${pattern.source}`;
    }
  }

  return null;
}

/**
 * Sanitizes a file path for logging by redacting sensitive components.
 * Preserves structure but removes potentially sensitive filename details.
 *
 * @param filePath - The file path to sanitize
 * @returns Sanitized path safe for logging
 *
 * @example
 * ```typescript
 * sanitizePathForLogging('/home/user/.env')
 * // Returns: '/home/user/[REDACTED_SENSITIVE]'
 * ```
 */
export function sanitizePathForLogging(filePath: string): string {
  if (!filePath || typeof filePath !== "string") {
    return "[INVALID_PATH]";
  }

  if (isSensitiveFile(filePath)) {
    const dir =
      filePath.substring(0, filePath.lastIndexOf("/") + 1) ||
      filePath.substring(0, filePath.lastIndexOf("\\") + 1) ||
      "";
    return `${dir}[REDACTED_SENSITIVE]`;
  }

  return filePath;
}

/**
 * Extended pattern list for stricter security modes.
 * Includes additional patterns for high-security environments.
 */
export const STRICT_SENSITIVE_PATTERNS: RegExp[] = [
  ...SENSITIVE_PATTERNS,
  // Additional strict patterns
  /config\.json$/i,
  /settings\.json$/i,
  /\.htpasswd$/i,
  /\.netrc$/i,
  /_rsa$/i,
  /_dsa$/i,
  /_ecdsa$/i,
  /_ed25519$/i,
  /known_hosts$/i,
  /authorized_keys$/i,
  /identities$/i,
  /agents?\.json$/i,
  /vault/i,
  /keystore/i,
  /truststore/i,
];

/**
 * Performs strict sensitive file check with extended pattern list.
 * Use this for high-security environments or when handling untrusted paths.
 *
 * @param filePath - The file path to check
 * @returns Result<void, FileReadError> - Stricter check result
 */
export function checkSensitiveFileStrict(
  filePath: string,
): Result<void, FileReadError> {
  if (!filePath || typeof filePath !== "string") {
    return err(
      new FileReadError(
        "Invalid file path provided",
        String(filePath),
        "INVALID_PATH",
      ),
    );
  }

  const normalizedPath = filePath.toLowerCase().replace(/\\/g, "/");

  for (const pattern of STRICT_SENSITIVE_PATTERNS) {
    if (pattern.test(normalizedPath)) {
      return err(
        new FileReadError(
          `Access denied (strict mode): File matches sensitive pattern ${pattern.source}`,
          filePath,
          pattern.source,
        ),
      );
    }
  }

  return ok(undefined);
}
