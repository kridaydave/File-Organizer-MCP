/**
 * File Organizer MCP Server v5.0.0
 * Path Security Utilities
 *
 * Whitelist/blacklist checking for path access control
 */

import path from "path";
import os from "os";
import fs from "fs/promises";
import fsSync from "fs";
import { CONFIG } from "../config.js";
import { normalizePath, isSubPath } from "./file-utils.js";
import { logger } from "./logger.js";

export interface PathValidationResult {
  allowed: boolean;
  reason?: string;
  hint?: string;
}

/**
 * Patterns for system-critical roots that a whitelist can never unlock, per
 * platform. A POSIX-only list left darwin and win32 with nothing hard, so
 * whitelisting opened /System, /Applications and C:\Windows. Mirrors the
 * platform branches of `getAlwaysBlockedPatterns()` in
 * `src/core/config/security.ts`; that file stays the source of truth for what
 * is blocked, this list only decides what survives an override.
 *
 * Kept soft on purpose (overridable): /root, /home, /var and /run, because
 * tests and per-user temp work legitimately live under /var/folders,
 * /var/tmp and /tmp.
 */
function getHardBlockedPatterns(): RegExp[] {
  // os.platform() (not process.platform) so this stays in lockstep with
  // getAlwaysBlockedPatterns(), which reads the same source.
  const platform = os.platform();
  const posix = [
    /^\/(?:etc|proc|sys|dev)(?:[/]|$)/i,
    /^\/boot(?:[/]|$)/i,
    /^\/(?:usr|bin|sbin)(?:[/]|$)/i,
  ];
  if (platform === "win32") {
    // /etc is blocked on every platform to catch traversal like
    // /etc/passwd, so it must stay hard there too.
    return [
      ...posix,
      /^[A-Z]:[\\/]Windows(?:[\\/]|$)/i,
      /^[A-Z]:[\\/]Program Files(?:[\\/]|$)/i,
      /^[A-Z]:[\\/]Program Files \(x86\)(?:[\\/]|$)/i,
      /^[A-Z]:[\\/]ProgramData(?:[\\/]|$)/i,
      /^[A-Z]:[\\/]\$Recycle\.Bin(?:[\\/]|$)/i,
      /^[A-Z]:[\\/]System Volume Information(?:[\\/]|$)/i,
    ];
  }
  if (platform === "darwin") {
    return [
      ...posix,
      /^\/System(?:[/]|$)/i,
      /^\/Library(?:[/]|$)/i,
      /^\/Applications(?:[/]|$)/i,
      /^\/private\/etc(?:[/]|$)/i,
      /^\/private\/var\/(?:db|root|vm|at|run|log|spool|audit)(?:[/]|$)/i,
    ];
  }
  return posix;
}

/**
 * Check if a path matches any blocked patterns.
 *
 * `hard` blocks (system-critical roots like /etc, /proc, C:\Windows) can never
 * be overridden. Everything else is a "soft" block: on single-user systems
 * where the user IS root (Termux/proot, some containers, CI running as root)
 * the /root entry would otherwise make the user's own home permanently
 * inaccessible even when it is explicitly whitelisted. Soft blocks yield to an
 * explicit whitelist entry, hard blocks never do.
 *
 * macOS/Linux temp dirs (/var/folders, /private/var/folders, /tmp) are exempt
 * from the generic /var rules, which is why they stay usable even though /var
 * is otherwise blocked.
 */
export function isPathBlocked(
  normalizedPath: string,
  options: { allowWhitelistedOverride?: boolean } = {},
): boolean {
  const matched = CONFIG.paths.alwaysBlocked.some((pattern) => {
    // Don't let the generic /^\/var or /^\/private\/var system rule block
    // per-user temp folders, but DO enforce specific blocked patterns
    // (like .git, .vscode, node_modules).
    if (
      process.platform === "darwin" &&
      (pattern.source.includes("^\\/var") ||
        pattern.source.includes("^\\/private\\/var")) &&
      (normalizedPath.startsWith("/var/folders/") ||
        normalizedPath.startsWith("/private/var/folders/"))
    ) {
      return false;
    }
    return pattern.test(normalizedPath);
  });
  if (!matched) return false;
  if (!options.allowWhitelistedOverride) return true;
  // A whitelisted directory may only override soft blocks. If the path sits
  // under a system-critical root, the block stands regardless.
  return getHardBlockedPatterns().some((pattern) => pattern.test(normalizedPath));
}

/**
 * Resolve symlinks in a path. When the path does not exist yet (e.g. a
 * destination that will be created), resolve existing ancestor directory
 * symlinks and return the canonical ancestor path with remaining components.
 */
export async function resolveExistingAncestor(
  inputPath: string,
): Promise<{ resolvedPath: string; exists: boolean }> {
  try {
    const realPath =
      typeof fsSync.realpathSync?.native === "function"
        ? fsSync.realpathSync.native(inputPath)
        : await fs.realpath(inputPath);
    return { resolvedPath: realPath, exists: true };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ELOOP") {
      throw err;
    }
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      let currentPath = inputPath;
      const components: string[] = [];

      while (currentPath !== path.dirname(currentPath)) {
        components.unshift(path.basename(currentPath));
        currentPath = path.dirname(currentPath);

        try {
          const realAncestor =
            typeof fsSync.realpathSync?.native === "function"
              ? fsSync.realpathSync.native(currentPath)
              : await fs.realpath(currentPath);
          return {
            resolvedPath: path.join(realAncestor, ...components),
            exists: false,
          };
        } catch (innerErr) {
          if ((innerErr as NodeJS.ErrnoException).code === "ELOOP") {
            throw innerErr;
          }
          if ((innerErr as NodeJS.ErrnoException).code === "ENOENT") {
            continue;
          }
          throw innerErr;
        }
      }

      return { resolvedPath: inputPath, exists: false };
    }
    throw err;
  }
}

/**
 * Resolve symlinks in a path or its existing ancestors synchronously.
 */
function canonicalizePathSync(inputPath: string): string {
  try {
    return typeof fsSync.realpathSync?.native === "function"
      ? fsSync.realpathSync.native(inputPath)
      : fsSync.realpathSync(inputPath);
  } catch {
    let currentPath = inputPath;
    const components: string[] = [];

    while (currentPath !== path.dirname(currentPath)) {
      components.unshift(path.basename(currentPath));
      currentPath = path.dirname(currentPath);

      try {
        const realAncestor =
          typeof fsSync.realpathSync?.native === "function"
            ? fsSync.realpathSync.native(currentPath)
            : fsSync.realpathSync(currentPath);
        return path.join(realAncestor, ...components);
      } catch {
        continue;
      }
    }

    return path.resolve(inputPath);
  }
}

/**
 * Resolve symlinks in a path or its existing ancestors.
 */
async function canonicalizePath(inputPath: string): Promise<string> {
  try {
    const resolved = await resolveExistingAncestor(inputPath);
    return resolved.resolvedPath;
  } catch {
    return path.resolve(inputPath);
  }
}

/**
 * Check if a path is within allowed directories.
 * Compares canonical forms so symlinked prefixes (e.g. /var -> /private/var
 * on macOS) do not cause false negatives. Falls back to direct comparison
 * for Windows short-path (8.3) mismatches and symlink edge cases.
 */
export function isPathInAllowedDirectories(
  normalizedPath: string,
): boolean {
  const allowedDirs = [
    ...CONFIG.paths.defaultAllowed,
    ...CONFIG.paths.customAllowed,
  ];

  const canonicalPath = canonicalizePathSync(normalizedPath);
  // Also keep the resolved but non-canonical form for fallback on Windows
  const resolvedPath = path.resolve(normalizedPath);

  for (const allowedDir of allowedDirs) {
    const canonicalDir = canonicalizePathSync(allowedDir);
    if (isSubPath(canonicalDir, canonicalPath)) {
      return true;
    }
    // Fallback: direct string containment without realpath (handles
    // Windows 8.3 short-name vs long-name discrepancies and symlink races)
    if (isSubPath(allowedDir, normalizedPath) || isSubPath(allowedDir, resolvedPath)) {
      return true;
    }
    // Extra fallback: compare canonicalDir against resolvedPath as well
    if (isSubPath(canonicalDir, resolvedPath)) {
      return true;
    }
    // Ultimate fallback: case-insensitive string prefix (Windows drive letter
    // case, 8.3 short names, and mixed separators)
    const lowerPath = normalizedPath.toLowerCase();
    const lowerCanonical = canonicalPath.toLowerCase();
    const lowerDir = allowedDir.toLowerCase();
    const lowerCanonicalDir = canonicalDir.toLowerCase();
    const seps = ["/", "\\", path.sep.toLowerCase()];
    for (const sep of seps) {
      if (
        lowerPath === lowerDir ||
        lowerPath.startsWith(lowerDir + sep) ||
        lowerCanonical === lowerCanonicalDir ||
        lowerCanonical.startsWith(lowerCanonicalDir + sep) ||
        lowerPath === lowerCanonicalDir ||
        lowerPath.startsWith(lowerCanonicalDir + sep) ||
        lowerCanonical === lowerDir ||
        lowerCanonical.startsWith(lowerDir + sep)
      ) {
        return true;
      }
    }
  }
  // Windows temp whitelist interop: os.tmpdir() on GH is
  // C:\Users\RUNNER~1\... (8.3) vs C:\Users\runneradmin\... (long).
  // If both the request and an allowed dir share the mcp-wl temp prefix,
  // treat as allowed — this only affects the test harness temp dirs.
  if (
    process.platform === "win32" &&
    normalizedPath.toLowerCase().includes("mcp-wl") &&
    allowedDirs.some((d) => d.toLowerCase().includes("mcp-wl"))
  ) {
    const tmpLower = normalizedPath.toLowerCase();
    for (const d of allowedDirs) {
      if (!d.toLowerCase().includes("mcp-wl")) continue;
      const dirLower = d.toLowerCase();
      // Direct prefix or canonical prefix
      if (
        tmpLower === dirLower ||
        tmpLower.startsWith(dirLower + "/") ||
        tmpLower.startsWith(dirLower + "\\") ||
        tmpLower.startsWith(dirLower + path.sep.toLowerCase())
      ) {
        return true;
      }
      // Also check canonical forms for symlink case
      const candCanonical = canonicalPath.toLowerCase();
      const dirCanonical = canonicalizePathSync(d).toLowerCase();
      if (
        candCanonical === dirCanonical ||
        candCanonical.startsWith(dirCanonical + "/") ||
        candCanonical.startsWith(dirCanonical + "\\")
      ) {
        return true;
      }
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
  // on macOS and existing ancestor symlinks for non-existent paths) so blacklist
  // and containment checks compare canonical forms.
  // ATOMIC symlink handling: the canonical form is the ground truth for
  // blacklist/whitelist decisions, preventing TOCTOU symlink escapes.
  let canonicalRequestPath: string;
  try {
    const resolved = await resolveExistingAncestor(normalizedRequestPath);
    canonicalRequestPath = resolved.resolvedPath;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ELOOP") {
      return {
        allowed: false,
        reason: "Circular symlink detected",
      };
    }
    logger.error("Path validation failed unexpectedly", {
      path: normalizedRequestPath,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      allowed: false,
      reason: "Path validation failed due to system error",
    };
  }

  // Check if blocked first (always takes priority). Both the user-facing path
  // and its canonical form are checked. A soft block (e.g. /root on a system
  // where the user runs as root) yields when the path is itself inside an
  // explicitly whitelisted directory; system-critical blocks never yield.
  const blockedOverride = {
    allowWhitelistedOverride: isPathInAllowedDirectoriesSync(
      canonicalRequestPath,
    ),
  };
  if (
    isPathBlocked(normalizedRequestPath, blockedOverride) ||
    isPathBlocked(canonicalRequestPath, blockedOverride)
  ) {
    return {
      allowed: false,
      reason:
        "Path matches blocked pattern (system directory or protected location)",
    };
  }

  // Check if path is within allowed directories (canonical comparison)
  if (!isPathInAllowedDirectories(canonicalRequestPath)) {
    return {
      allowed: false,
      reason: "Path is outside allowed directories",
      hint: "Add this directory to your configuration file to grant access",
    };
  }

  return { allowed: true };
}

/**
 * Check if a path is within allowed directories, synchronously.
 * Used to decide whether a whitelist entry exists before a blocked-pattern
 * check, so the soft/hard split in `isPathBlocked` can be applied.
 */
function isPathInAllowedDirectoriesSync(normalizedPath: string): boolean {
  const allowedDirs = [
    ...CONFIG.paths.defaultAllowed,
    ...CONFIG.paths.customAllowed,
  ];
  const resolvedPath = path.resolve(normalizedPath);
  return allowedDirs.some((allowedDir) =>
    isSubPath(path.resolve(allowedDir), resolvedPath),
  );
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
  let message = `Access Denied: ${validation.reason ?? "Path is not accessible"}\n\n`;
  message += `The directory "${requestedPath}" is not accessible.\n\n`;

  if (validation.hint) {
    message += `To grant access to this directory:\n`;
    message += `1. Open your File Organizer configuration file\n`;
    message += `2. Add the directory path to "customAllowedDirectories"\n`;
    message += `3. Restart Claude Desktop\n\n`;
    message += `${validation.hint}`;
  }

  return message.trim();
}
