/**
 * File Organizer MCP Server v5.0.0
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
  uncompressedSize?: number;
  compressedSize?: number;
  ratio?: number;
}

export interface EntryValidationResult {
  valid: boolean;
  entryName: string;
  extractedPath?: string;
  error?: string;
}

/**
 * Detect archive format by reading magic numbers
 */
export function detectArchiveFormat(filePath: string): ArchiveValidationResult {
  try {
    const buffer = Buffer.alloc(512);
    const flags =
      (fs.constants?.O_RDONLY ?? 0) |
      (process.platform !== "win32" ? (fs.constants?.O_NOFOLLOW ?? 0) : 0);
    const fd = fs.openSync(filePath, flags);
    let bytesRead = 0;
    try {
      bytesRead = fs.readSync(fd, buffer, 0, 512, 0);
    } finally {
      fs.closeSync(fd);
    }

    if (bytesRead < 2) {
      return { valid: false, error: "File too small to be an archive" };
    }

    const magicBytes = Array.from(buffer.subarray(0, bytesRead));

    // Check ZIP format (standard PK.. or empty PK..)
    if (
      bytesRead >= 4 &&
      magicBytes[0] === 0x50 &&
      magicBytes[1] === 0x4b &&
      ((magicBytes[2] === 0x03 && magicBytes[3] === 0x04) ||
        (magicBytes[2] === 0x05 && magicBytes[3] === 0x06))
    ) {
      return { valid: true, format: "zip" };
    }

    // Check 7Z format
    if (
      bytesRead >= 6 &&
      magicBytes[0] === 0x37 &&
      magicBytes[1] === 0x7a &&
      magicBytes[2] === 0xbc &&
      magicBytes[3] === 0xaf &&
      magicBytes[4] === 0x27 &&
      magicBytes[5] === 0x1c
    ) {
      return { valid: true, format: "7z" };
    }

    // Check XZ format
    if (
      bytesRead >= 6 &&
      magicBytes[0] === 0xfd &&
      magicBytes[1] === 0x37 &&
      magicBytes[2] === 0x7a &&
      magicBytes[3] === 0x58 &&
      magicBytes[4] === 0x5a &&
      magicBytes[5] === 0x00
    ) {
      return { valid: true, format: "xz" };
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

    // Check TAR POSIX format (magic 'ustar' at offset 257)
    if (bytesRead >= 262) {
      const tarMagic = buffer.subarray(257, 262).toString("ascii");
      if (tarMagic === "ustar") {
        return { valid: true, format: "tar" };
      }
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

  if (
    !isSubPath(normalizedTarget, resolvedPath) ||
    resolvedPath === normalizedTarget ||
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

  if (
    typeof archiveCompressedSize === "number" &&
    archiveCompressedSize > 0 &&
    totalUncompressedSize / archiveCompressedSize > maxRatio
  ) {
    const errorMsg = `Decompression ratio ${(totalUncompressedSize / archiveCompressedSize).toFixed(1)} exceeds safety limit of ${maxRatio}x`;
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
