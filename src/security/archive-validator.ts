/**
 * File Organizer MCP Server v3.4.0
 * Archive Validation Utility
 *
 * Provides:
 * - Magic number verification for archive file types
 * - Zip-slip attack prevention
 * - Path containment verification
 */

import path from "path";
import fs from "fs";
import { SECURITY_LIMITS } from "./security-constants.js";
import { isSubPath } from "../utils/file-utils.js";

export interface ArchiveValidationResult {
  valid: boolean;
  format?: string;
  error?: string;
  entries?: number;
  totalSize?: number;
}

export interface EntryValidationResult {
  valid: boolean;
  entryName: string;
  error?: string;
  extractedPath?: string;
}

/**
 * Detect archive format by reading magic numbers
 */
export function detectArchiveFormat(filePath: string): ArchiveValidationResult {
  try {
    const buffer = Buffer.alloc(16);
    const fd = fs.openSync(filePath, "r");
    const bytesRead = fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    if (bytesRead < 4) {
      return { valid: false, error: "File too small to be an archive" };
    }

    const magicBytes = Array.from(buffer.subarray(0, bytesRead));

    // Check ZIP format (full 4-byte signature: 0x50 0x4B 0x03 0x04)
    if (
      bytesRead >= 4 &&
      magicBytes[0] ===
        SECURITY_LIMITS.archiveValidation.MAGIC_NUMBERS.zip[0] &&
      magicBytes[1] ===
        SECURITY_LIMITS.archiveValidation.MAGIC_NUMBERS.zip[1] &&
      magicBytes[2] ===
        SECURITY_LIMITS.archiveValidation.MAGIC_NUMBERS.zip[2] &&
      magicBytes[3] === SECURITY_LIMITS.archiveValidation.MAGIC_NUMBERS.zip[3]
    ) {
      return { valid: true, format: "zip" };
    }

    // Check GZIP format
    if (
      bytesRead >= 2 &&
      magicBytes[0] === SECURITY_LIMITS.archiveValidation.MAGIC_NUMBERS.gz[0] &&
      magicBytes[1] === SECURITY_LIMITS.archiveValidation.MAGIC_NUMBERS.gz[1]
    ) {
      return { valid: true, format: "gz" };
    }

    // Check BZIP2 format
    if (
      bytesRead >= 3 &&
      magicBytes[0] ===
        SECURITY_LIMITS.archiveValidation.MAGIC_NUMBERS.bz2[0] &&
      magicBytes[1] ===
        SECURITY_LIMITS.archiveValidation.MAGIC_NUMBERS.bz2[1] &&
      magicBytes[2] === SECURITY_LIMITS.archiveValidation.MAGIC_NUMBERS.bz2[2]
    ) {
      return { valid: true, format: "bz2" };
    }

    return { valid: false, error: "Unknown or unsupported archive format" };
  } catch (error) {
    return {
      valid: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown error during format detection",
    };
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
  const normalizedEntry = entryName.replace(/\\/g, "/");

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

  // Ensure the resolved path is still within the target directory
  const normalizedTarget = path.resolve(targetDirectory);

  if (!isSubPath(normalizedTarget, resolvedPath)) {
    return {
      valid: false,
      entryName,
      error: "Zip-slip attempt: extracted path escapes target directory",
    };
  }

  // Check for null bytes (deprecated but still check)
  if (entryName.includes("\0")) {
    return {
      valid: false,
      entryName,
      error: "Null byte detected in entry name",
    };
  }

  // Check for Windows reserved names
  const baseName = path.basename(normalizedEntry).toLowerCase();
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
  const fileNameWithoutExt = baseName.split(".")[0] ?? "";
  if (windowsReserved.includes(fileNameWithoutExt)) {
    return {
      valid: false,
      entryName,
      error: `Windows reserved filename detected: ${baseName}`,
    };
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
  entries: Array<{ name: string; size?: number }>,
  targetDirectory: string,
): { valid: boolean; invalidEntries: EntryValidationResult[] } {
  const invalidEntries: EntryValidationResult[] = [];
  const maxEntries = SECURITY_LIMITS.decompression.MAX_ENTRIES;

  if (entries.length > maxEntries) {
    return {
      valid: false,
      invalidEntries: [
        {
          valid: false,
          entryName: "",
          error: `Too many entries: ${entries.length} exceeds limit of ${maxEntries}`,
        },
      ],
    };
  }

  for (const entry of entries) {
    const validation = validateEntryPath(entry.name, targetDirectory);

    if (!validation.valid) {
      invalidEntries.push(validation);
      continue;
    }

    // Check individual file size limit
    if (
      entry.size &&
      entry.size > SECURITY_LIMITS.decompression.MAX_FILE_SIZE
    ) {
      invalidEntries.push({
        valid: false,
        entryName: entry.name,
        error: `File size ${entry.size} exceeds maximum allowed ${SECURITY_LIMITS.decompression.MAX_FILE_SIZE}`,
      });
    }
  }

  return {
    valid: invalidEntries.length === 0,
    invalidEntries,
  };
}

/**
 * Sanitize entry name to remove potentially dangerous characters
 */
export function sanitizeEntryName(entryName: string): string {
  // Normalize Unicode to prevent bypass with alternate representations
  let sanitized = entryName.normalize("NFC");

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, "");

  // Remove leading slashes and backslashes
  sanitized = sanitized.replace(/^[\/\\]+/, "");

  // Replace backslashes with forward slashes
  sanitized = sanitized.replace(/\\/g, "/");

  // Remove any parent directory references
  sanitized = sanitized
    .split("/")
    .filter((part) => part !== "..")
    .join("/");

  // Remove any null or control characters
  sanitized = sanitized.replace(/[\x00-\x1f\x7f]/g, "");

  return sanitized;
}
