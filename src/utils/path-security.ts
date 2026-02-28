/**
 * File Organizer MCP Server v3.4.1
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
 * Check if a path is within allowed directories
 */
export function isPathInAllowedDirectories(normalizedPath: string): boolean {
  const allowedDirs = [
    ...CONFIG.paths.defaultAllowed,
    ...CONFIG.paths.customAllowed,
  ];

  return allowedDirs.some((allowedDir) =>
    isSubPath(allowedDir, normalizedPath),
  );
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

  // Check if blocked first (always takes priority)
  if (isPathBlocked(normalizedRequestPath)) {
    return {
      allowed: false,
      reason:
        "Path matches blocked pattern (system directory or protected location)",
    };
  }

  // Check if path is within allowed directories
  if (!isPathInAllowedDirectories(normalizedRequestPath)) {
    return {
      allowed: false,
      reason: "Path is outside allowed directories",
      hint: "Add this directory to your configuration file to grant access",
    };
  }

  // Atomic symlink detection and validation
  try {
    // Use lstat to check if path is a symlink (without following)
    const lstats = await fs.lstat(normalizedRequestPath);

    if (lstats.isSymbolicLink()) {
      // Resolve symlink to real path
      const realPath = await fs.realpath(normalizedRequestPath);
      const normalizedRealPath = path.resolve(normalizePath(realPath));

      // Validate the real path (follow symlink only if real path is also allowed)
      if (isPathBlocked(normalizedRealPath)) {
        return {
          allowed: false,
          reason: "Symlink resolves to blocked path",
        };
      }

      if (!isPathInAllowedDirectories(normalizedRealPath)) {
        return {
          allowed: false,
          reason: "Symlink resolves to path outside allowed directories",
          hint: "Ensure symlink target is within allowed directories",
        };
      }
    }
  } catch (err) {
    // If path doesn't exist (ENOENT), skip symlink validation - path is still valid for access control
    // Non-existent paths can't be symlinks, so we allow them if they pass whitelist/blacklist checks
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

/**
 * Get a user-friendly list of blocked patterns (for documentation)
 */
function getBlockedPatternsDescription(): string {
  const platform = process.platform;
  const patterns: string[] = [];

  patterns.push("- node_modules directories");
  patterns.push("- .git directories");
  patterns.push("- .vscode, .idea directories");
  patterns.push("- dist, build directories");

  if (platform === "win32") {
    patterns.push("- C:\\Windows");
    patterns.push("- C:\\Program Files");
    patterns.push("- C:\\Program Files (x86)");
    patterns.push("- C:\\ProgramData");
    patterns.push("- AppData directories");
    patterns.push("- $Recycle.Bin");
  } else if (platform === "darwin") {
    patterns.push("- /System");
    patterns.push("- /Library");
    patterns.push("- /Applications");
    patterns.push("- /usr, /bin, /sbin, /opt, /private");
    patterns.push(
      "- Note: /Volumes is NOT in the blocked list. " +
      "External drives mounted under /Volumes are accessible by setting " +
      "allowExternalVolumes: true in your config and adding the volume path " +
      "to customAllowedDirectories.",
    );
  } else {
    patterns.push("- /etc, /usr, /bin, /sbin");
    patterns.push("- /sys, /proc");
    patterns.push("- /root, /var, /boot");
  }

  return patterns.join("\n");
}
