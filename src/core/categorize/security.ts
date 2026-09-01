/**
 * Security screening for categorization: executable detection,
 * double-extension spoofing checks, and file-type validation.
 * Pure helpers + two async entry points with injected dependencies.
 */

import path from "path";
import { isExecutableSignature } from "../../constants/file-signatures.js";
import type { PathValidatorService } from "../../services/path-validator.service.js";
import { sniffFileType } from "./sniff.js";
import { getRealExtension } from "./extension.js";

export interface SecurityClassification {
  isExecutable: boolean;
  isSuspicious: boolean;
  threatLevel: "none" | "low" | "medium" | "high";
  reason?: string;
}

/**
 * Check if type represents executable content
 */
export function isExecutableType(detectedType: string): boolean {
  const executableTypes = new Set([
    "EXE",
    "ELF",
    "MACHO",
    "MSI",
    "PE",
    "PE32",
    "PE32+",
    "MACHO_32",
    "MACHO_64",
    "MACHO_FAT",
    "MACHO_SWAP",
    "CLASS",
    "JAVA_CLASS",
    "JAR",
    "WASM",
    "SWF",
    "SHELL",
    "SHEBANG",
    "BASH",
    "PYTHON",
    "PERL",
    "RUBY",
    "NODE",
  ]);
  const upper = detectedType.toUpperCase().trim();
  if (isExecutableSignature(upper) || executableTypes.has(upper)) {
    return true;
  }
  const tokens = upper.split(/[^A-Z0-9_+]+/);
  return tokens.some(
    (t) => t.length > 0 && (executableTypes.has(t) || isExecutableSignature(t)),
  );
}

/**
 * Check if extension is executable
 */
export function isExecutableExtension(extension: string): boolean {
  const exeExtensions = [
    ".exe",
    ".dll",
    ".bat",
    ".cmd",
    ".sh",
    ".msi",
    ".com",
    ".scr",
    ".pif",
  ];
  return exeExtensions.includes(extension.toLowerCase());
}

/**
 * Check if detected type is an executable disguised as document
 */
export function isExecutableDisguisedAsDocument(
  detectedType: string,
  fileName: string,
): boolean {
  const documentExtensions = [
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".txt",
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
  ];
  const extension = path.extname(fileName).toLowerCase();

  if (!documentExtensions.includes(extension)) {
    return false;
  }

  return isExecutableType(detectedType);
}

/**
 * Check for double extension patterns (e.g., file.jpg.exe)
 */
export function hasDoubleExtension(fileName: string): boolean {
  const timeout = 100;
  const startTime = Date.now();

  const name = path.basename(fileName).toLowerCase();
  if (name.length > 1000) {
    return false;
  }

  const result =
    /\.(jpg|jpeg|png|gif|bmp|pdf|doc|docx|txt|zip|rar)\.(exe|bat|cmd|scr|pif|com|msi|sh)$/i.test(
      name,
    );

  if (Date.now() - startTime > timeout) {
    return false;
  }

  return result;
}

/**
 * Get security classification for a file.
 * Extension-based first, then magic-byte content sniff.
 */
export async function classifySecurity(
  pathValidator: PathValidatorService,
  filePath: string,
): Promise<SecurityClassification> {
  const fileName = path.basename(filePath);
  const extension = path.extname(fileName).toLowerCase();

  // Default: no threat
  let result: SecurityClassification = {
    isExecutable: false,
    isSuspicious: false,
    threatLevel: "none",
  };

  // Check for double extensions
  if (hasDoubleExtension(fileName)) {
    result = {
      isExecutable: isExecutableExtension(getRealExtension(fileName)),
      isSuspicious: true,
      threatLevel: "high",
      reason: "Double extension detected - possible spoofing attempt",
    };
  }

  try {
    const sniff = await sniffFileType(pathValidator, filePath);

    // Check if executable disguised as document
    if (isExecutableDisguisedAsDocument(sniff.detectedType, fileName)) {
      return {
        isExecutable: true,
        isSuspicious: true,
        threatLevel: "high",
        reason: `Executable content (${sniff.detectedType}) disguised as ${extension} document`,
      };
    }

    // Check for mismatch
    if (!sniff.extensionMatch && sniff.detectedType !== "UNKNOWN") {
      return {
        isExecutable: isExecutableType(sniff.detectedType) || result.isExecutable,
        isSuspicious: true,
        threatLevel: result.threatLevel === "high" ? "high" : "low",
        reason:
          result.threatLevel === "high"
            ? `${result.reason}; Extension mismatch: declared ${extension}, actual ${sniff.detectedType}`
            : `Extension mismatch: declared ${extension}, actual ${sniff.detectedType}`,
      };
    }

    // Check if content is executable
    if (isExecutableType(sniff.detectedType)) {
      return {
        isExecutable: true,
        isSuspicious: result.isSuspicious,
        threatLevel: result.threatLevel === "high" ? "high" : "low",
        reason:
          result.threatLevel === "high"
            ? `${result.reason}; Executable file detected: ${sniff.detectedType}`
            : `Executable file detected: ${sniff.detectedType}`,
      };
    }
  } catch (error) {
    // Fall through to extension-based check
  }

  // Extension-based fallback
  if (isExecutableExtension(extension) && !result.isSuspicious) {
    result = {
      isExecutable: true,
      isSuspicious: false,
      threatLevel: "low",
      reason: `Executable extension: ${extension}`,
    };
  }

  return result;
}

/**
 * Check if file extension matches actual content.
 * Returns valid=true when the sniff fails or the type is unknown.
 */
export async function validateFileType(
  pathValidator: PathValidatorService,
  filePath: string,
): Promise<{
  valid: boolean;
  declaredExtension: string;
  actualType: string;
  mismatch: boolean;
}> {
  const declaredExtension = path.extname(filePath).toLowerCase();

  const defaultResponse = {
    valid: true,
    declaredExtension,
    actualType: "unknown",
    mismatch: false,
  };

  try {
    const sniff = await sniffFileType(pathValidator, filePath);
    if (sniff.detectedType === "UNKNOWN") {
      return defaultResponse;
    }
    return {
      valid: sniff.extensionMatch,
      declaredExtension,
      actualType: sniff.detectedType,
      mismatch: !sniff.extensionMatch,
    };
  } catch (error) {
    return defaultResponse;
  }
}
