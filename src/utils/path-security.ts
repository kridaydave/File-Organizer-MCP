/**
 * File Organizer MCP Server v5.0.0
 * Path Security Utilities
 *
 * Whitelist/blacklist checking for path access control
 */

import path from "path";
import fs from "fs/promises";
import { CONFIG } from "../config.js";
import { normalizePath, isSubPath } from "./file-utils.js";
import { logger } from "./logger.js";

export interface PathValidationResult {
  allowed: boolean;
  reason?: string;
  hint?: string;
}

/**
 * Check if a path matches any blocked patterns
 */
export function isPathBlocked(normalizedPath: string): boolean {
  return CONFIG.paths.alwaysBlocked.some((pattern) =>
    pattern.test(normalizedPath),
  );
}

/**
 * Resolve symlinks in a path. When the path does not exist yet (e.g. a
 * destination that will be created), fall back to the normalized absolute form.
 */
async function canonicalizePath(inputPath: string): Promise<string> {
  try {
    return await fs.realpath(inputPath);
  } catch {
    return path.resolve(inputPath);
  }
}

/**
 * Check if a path is within allowed directories.
 * Compares canonical forms so symlinked prefixes (e.g. /var -> /private/var
 * on macOS) do not cause false negatives.
 */
async function isPathInAllowedDirectories(
  normalizedPath: string,
): Promise<boolean> {
  const allowedDirs = [
    ...CONFIG.paths.defaultAllowed,
    ...CONFIG.paths.customAllowed,
  ];

  const canonicalPath = await canonicalizePath(normalizedPath);

  for (const allowedDir of allowedDirs) {
    const canonicalDir = await canonicalizePath(allowedDir);
    if (isSubPath(canonicalDir, canonicalPath)) {
      return true;
    }
  }
  return false;
}

/**
 * Main function to check if a path is allowed
 * Applies both blacklist and whitelist checks
 * Uses atomic validation with symlink detection to prevent race conditions
 */
export async function isPathAllowed(
  requestedPath: string,
): Promise<PathValidationResult> {
  // First, normalize the requested path
  const normalizedRequestPath = path.resolve(normalizePath(requestedPath));

  // Resolve symlinks (including intermediate ones such as /var -> /private/var
  // on macOS) so blacklist and containment checks compare canonical forms.
  // ATOMIC symlink handling: the canonical form is the ground truth for
  // blacklist/whitelist decisions, preventing TOCTOU symlink escapes.
  let canonicalRequestPath: string;
  try {
    canonicalRequestPath = await fs.realpath(normalizedRequestPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.error("Path validation failed unexpectedly", {
        path: normalizedRequestPath,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        allowed: false,
        reason: "Path validation failed due to system error",
      };
    }
    // Non-existent paths can't be symlinks, so fall back to the normalized form.
    canonicalRequestPath = normalizedRequestPath;
  }

  // Check if blocked first (always takes priority). Both the user-facing path
  // and its canonical form are checked.
  if (
    isPathBlocked(normalizedRequestPath) ||
    isPathBlocked(canonicalRequestPath)
  ) {
    return {
      allowed: false,
      reason:
        "Path matches blocked pattern (system directory or protected location)",
    };
  }

  // Check if path is within allowed directories (canonical comparison)
  if (!(await isPathInAllowedDirectories(canonicalRequestPath))) {
    return {
      allowed: false,
      reason: "Path is outside allowed directories",
      hint: "Add this directory to your configuration file to grant access",
    };
  }

  return { allowed: true };
}

/**
 * Get list of all allowed directories (for user info)
 */
export function getAllowedDirectories(): string[] {
  return [...CONFIG.paths.defaultAllowed, ...CONFIG.paths.customAllowed];
}

/**
 * Format a helpful access denied message with actionable information
 */
export function formatAccessDeniedMessage(
  requestedPath: string,
  validation: PathValidationResult,
): string {
  const allowedDirs = getAllowedDirectories();

  let message = `Access Denied: ${validation.reason}\n\n`;
  message += `The directory "${requestedPath}" is not accessible.\n\n`;
  message += `Current allowed directories:\n`;
  message += allowedDirs.map((d) => `  - ${d}`).join("\n");
  message += "\n\n";

  if (validation.hint) {
    message += `To grant access to this directory:\n`;
    message += `1. Open your File Organizer configuration file\n`;
    message += `2. Add the directory path to "customAllowedDirectories"\n`;
    message += `3. Restart Claude Desktop\n\n`;
    message += `${validation.hint}`;
  }

  return message.trim();
}
