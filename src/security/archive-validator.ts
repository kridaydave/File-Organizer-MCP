/**
 * File Organizer MCP Server v5.0.0
 * Archive Validation Utility
 *
 * Provides:
 * - Zip-slip attack prevention
 * - Path containment verification
 */

import fs from "fs";
import path from "path";
import { SECURITY_LIMITS } from "./security-constants.js";
import { isSubPath } from "../utils/file-utils.js";

export interface EntryValidationResult {
  valid: boolean;
  entryName: string;
  extractedPath?: string;
  error?: string;
}

/**
 * Resolve the nearest existing ancestor of a path and re-append the
 * non-existent tail. Mirrors the ancestor walk in resolveSymlinks
 * (path-validator.service.ts) so containment is checked against real
 * paths, not just lexical ones. Returns null on resolution failure
 * (e.g. symlink loop) so callers can fail closed.
 */
function resolveNearestExistingAncestor(targetPath: string): string | null {
  let current = targetPath;
  const tail: string[] = [];
  while (true) {
    try {
      const realPath =
        typeof fs.realpathSync?.native === "function"
          ? fs.realpathSync.native(current)
          : fs.realpathSync(current);
      return tail.length > 0 ? path.join(realPath, ...tail) : realPath;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") {
        return null;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        return targetPath;
      }
      tail.unshift(path.basename(current));
      current = parent;
    }
  }
}

/**
 * Validate an archive entry path for zip-slip vulnerability
 * Returns the safe extraction path if valid, or error if invalid
 */
export function validateEntryPath(
  entryName: string,
  targetDirectory: string,
): EntryValidationResult {
  // Check for null bytes first
  if (entryName.includes("\0")) {
    return {
      valid: false,
      entryName,
      error: "Null byte detected in entry name",
    };
  }

  // Check for Alternate Data Streams or Windows drive letters
  if (entryName.includes(":") || /^[a-zA-Z]:/.test(entryName)) {
    return {
      valid: false,
      entryName,
      error: "Invalid characters or drive specifier in archive entry",
    };
  }

  const normalizedEntry = entryName.replace(/\\/g, "/");

  // Check for path traversal components
  if (/(^|\/)\.\.(\/|$)/.test(normalizedEntry)) {
    return {
      valid: false,
      entryName,
      error: `Path traversal attempt detected: ${entryName}`,
    };
  }

  // Check for blocked patterns
  for (const pattern of SECURITY_LIMITS.archiveValidation.BLOCKED_PATTERNS) {
    if (pattern.test(normalizedEntry)) {
      return {
        valid: false,
        entryName,
        error: `Path traversal attempt detected: ${entryName}`,
      };
    }
  }

  // Check path length
  if (
    normalizedEntry.length > SECURITY_LIMITS.archiveValidation.MAX_PATH_LENGTH
  ) {
    return {
      valid: false,
      entryName,
      error: `Path too long: ${normalizedEntry.length} characters (max: ${SECURITY_LIMITS.archiveValidation.MAX_PATH_LENGTH})`,
    };
  }

  // Resolve the potential extraction path
  const resolvedPath = path.resolve(targetDirectory, normalizedEntry);

  // Ensure the resolved path is still within the target directory and does not resolve to target itself
  const normalizedTarget = path.resolve(targetDirectory);

  // Resolve symlinks to prevent zip-slip via pre-existing symlinks
  const realTarget = resolveNearestExistingAncestor(normalizedTarget);
  if (realTarget === null) {
    return {
      valid: false,
      entryName,
      error: "Zip-slip attempt: extracted path escapes target directory",
    };
  }
  const realResolvedPath = resolveNearestExistingAncestor(resolvedPath);
  if (realResolvedPath === null) {
    return {
      valid: false,
      entryName,
      error: "Zip-slip attempt: extracted path escapes target directory",
    };
  }

  if (
    !isSubPath(realTarget, realResolvedPath) ||
    realResolvedPath === realTarget ||
    normalizedEntry === "." ||
    normalizedEntry === ""
  ) {
    return {
      valid: false,
      entryName,
      error: "Zip-slip attempt: extracted path escapes target directory",
    };
  }

  // Check all path components for Windows reserved names
  const components = normalizedEntry.split(/[\/\\]/);
  const windowsReserved = [
    "con",
    "prn",
    "aux",
    "nul",
    "com1",
    "com2",
    "com3",
    "com4",
    "com5",
    "com6",
    "com7",
    "com8",
    "com9",
    "lpt1",
    "lpt2",
    "lpt3",
    "lpt4",
    "lpt5",
    "lpt6",
    "lpt7",
    "lpt8",
    "lpt9",
  ];
  for (const part of components) {
    const partWithoutExt = part.split(".")[0]?.toLowerCase() ?? "";
    if (windowsReserved.includes(partWithoutExt)) {
      return {
        valid: false,
        entryName,
        error: `Windows reserved filename detected: ${part}`,
      };
    }
  }

  return {
    valid: true,
    entryName,
    extractedPath: resolvedPath,
  };
}

/**
 * Validate all entries in an archive before extraction
 * Returns list of invalid entries with reasons
 */
export function validateArchiveEntries(
  entries: Array<{ name: string; size?: number; uncompressedSize?: number }>,
  targetDirectory: string,
  archiveCompressedSize?: number,
): { valid: boolean; invalidEntries: EntryValidationResult[]; errors: string[] } {
  const invalidEntries: EntryValidationResult[] = [];
  const maxEntries = SECURITY_LIMITS.decompression.MAX_ENTRIES;
  const maxAbsoluteBytes = SECURITY_LIMITS.decompression.MAX_ABSOLUTE_BYTES;
  const maxRatio = SECURITY_LIMITS.decompression.MAX_RATIO;

  if (entries.length > maxEntries) {
    const errorMsg = `Too many entries: ${entries.length} exceeds limit of ${maxEntries}`;
    return {
      valid: false,
      invalidEntries: [
        {
          valid: false,
          entryName: "",
          error: errorMsg,
        },
      ],
      errors: [errorMsg],
    };
  }

  let totalUncompressedSize = 0;
  for (const entry of entries) {
    const entrySize = entry.uncompressedSize ?? entry.size ?? 0;
    if (entrySize < 0) {
      invalidEntries.push({
        valid: false,
        entryName: entry.name,
        error: `Negative file size reported for ${entry.name}`,
      });
      continue;
    }
    totalUncompressedSize += entrySize;

    const validation = validateEntryPath(entry.name, targetDirectory);

    if (!validation.valid) {
      invalidEntries.push(validation);
      continue;
    }

    // Check individual file size limit
    if (entrySize > SECURITY_LIMITS.decompression.MAX_FILE_SIZE) {
      invalidEntries.push({
        valid: false,
        entryName: entry.name,
        error: `File size ${entrySize} exceeds maximum allowed ${SECURITY_LIMITS.decompression.MAX_FILE_SIZE}`,
      });
    }
  }

  if (totalUncompressedSize > maxAbsoluteBytes) {
    const errorMsg = `Cumulative uncompressed size ${totalUncompressedSize} exceeds maximum allowed ${maxAbsoluteBytes}`;
    invalidEntries.push({
      valid: false,
      entryName: "",
      error: errorMsg,
    });
  }

  let effectiveCompressedSize = archiveCompressedSize;
  if (typeof effectiveCompressedSize !== "number" || effectiveCompressedSize <= 0) {
    let sumCompressed = 0;
    let hasCompressed = false;
    for (const entry of entries) {
      const c =
        (entry as any).compressedSize ??
        (entry as any).compressed ??
        (entry as any).sizeCompressed;
      if (typeof c === "number" && c > 0) {
        sumCompressed += c;
        hasCompressed = true;
      }
    }
    if (hasCompressed && sumCompressed > 0) {
      effectiveCompressedSize = sumCompressed;
    } else {
      effectiveCompressedSize = 1;
    }
  }

  if (totalUncompressedSize / effectiveCompressedSize > maxRatio) {
    const errorMsg = `Decompression ratio ${(totalUncompressedSize / effectiveCompressedSize).toFixed(1)} exceeds safety limit of ${maxRatio}x`;
    invalidEntries.push({
      valid: false,
      entryName: "",
      error: errorMsg,
    });
  }

  return {
    valid: invalidEntries.length === 0,
    invalidEntries,
    errors: invalidEntries.map((e) => e.error ?? "Invalid entry"),
  };
}

/**
 * Sanitize entry name to remove potentially dangerous characters
 */
export function sanitizeEntryName(entryName: string): string {
  // Normalize Unicode to prevent bypass with alternate representations
  let sanitized = entryName.normalize("NFC");

  // Remove any null or control characters FIRST before path splitting
  sanitized = sanitized.replace(/[\x00-\x1f\x7f]/g, "");

  // Remove leading slashes and backslashes
  sanitized = sanitized.replace(/^[\/\\]+/, "");

  // Replace backslashes with forward slashes
  sanitized = sanitized.replace(/\\/g, "/");

  // Remove any parent directory references
  sanitized = sanitized
    .split("/")
    .filter((part) => part !== ".." && part !== ".")
    .join("/");

  return sanitized;
}
