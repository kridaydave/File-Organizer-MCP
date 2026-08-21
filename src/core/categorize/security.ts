/**
 * Security screening for categorization: executable detection,
 * double-extension spoofing checks, and file-type validation.
 * Pure helpers + two async entry points with injected dependencies.
 */

import path from "path";
import { isExecutableSignature } from "../../constants/file-signatures.js";
import type { PathValidatorService } from "../../services/path-validator.service.js";
import type { ContentAnalyzerService } from "../../services/content-analyzer.service.js";
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
  const executableTypes = [
    "EXE",
    "ELF",
    "MACHO",
    "MSI",
    "PE",
    "MACHO_32",
    "MACHO_64",
    "MACHO_SWAP",
    "CLASS",
    "WASM",
    "SWF",
    "SHELL",
    "BASH",
    "PYTHON",
    "PERL",
    "RUBY",
    "NODE",
  ];
  return (
    executableTypes.some((t) => detectedType.toUpperCase().includes(t)) ||
    isExecutableSignature(detectedType)
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

  const executableTypes = [
    "EXE",
    "ELF",
    "MACHO",
    "MSI",
    "PE",
    "MACHO_32",
    "MACHO_64",
    "MACHO_SWAP",
    "CLASS",
    "WASM",
  ];
  return executableTypes.some((t) => detectedType.toUpperCase().includes(t));
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
 * Extension-based first, then content analysis when a analyzer is provided.
 */
export async function classifySecurity(
  pathValidator: PathValidatorService,
  contentAnalyzer: ContentAnalyzerService | undefined,
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

  // If content analyzer available, do deeper analysis
  if (contentAnalyzer) {
    try {
      const validatedPath = await pathValidator.validatePath(filePath, {
        requireExists: true,
      });

      const analysis = await contentAnalyzer.analyze(validatedPath);

      // Check if executable disguised as document
      if (isExecutableDisguisedAsDocument(analysis.detectedType, fileName)) {
        return {
          isExecutable: true,
          isSuspicious: true,
          threatLevel: "high",
          reason: `Executable content (${analysis.detectedType}) disguised as ${extension} document`,
        };
      }

      // Check for mismatch
      if (!analysis.extensionMatch) {
        const severity: "high" | "medium" | "low" = analysis.warnings.some(
          (w) => w.includes("CRITICAL"),
        )
          ? "high"
          : analysis.warnings.some((w) => w.includes("HIGH"))
            ? "medium"
            : "low";

        return {
          isExecutable: isExecutableType(analysis.detectedType),
          isSuspicious: true,
          threatLevel: severity,
          reason: `Extension mismatch: declared ${extension}, actual ${analysis.detectedType}`,
        };
      }

      // Check if content is executable
      if (isExecutableType(analysis.detectedType)) {
        return {
          isExecutable: true,
          isSuspicious: false,
          threatLevel: "low",
          reason: `Executable file detected: ${analysis.detectedType}`,
        };
      }
    } catch (error) {
      // Fall through to extension-based check
    }
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
 * Returns valid=true when no analyzer is available or analysis fails.
 */
export async function validateFileType(
  pathValidator: PathValidatorService,
  contentAnalyzer: ContentAnalyzerService | undefined,
  filePath: string,
): Promise<{
  valid: boolean;
  declaredExtension: string;
  actualType: string;
  mismatch: boolean;
}> {
  const declaredExtension = path.extname(filePath).toLowerCase();

  // Default response if analysis fails
  const defaultResponse = {
    valid: true,
    declaredExtension,
    actualType: "unknown",
    mismatch: false,
  };

  if (!contentAnalyzer) {
    return defaultResponse;
  }

  try {
    const validatedPath = await pathValidator.validatePath(filePath, {
      requireExists: true,
    });

    const analysis = await contentAnalyzer.analyze(validatedPath);
    const mismatch = !analysis.extensionMatch;

    return {
      valid: !mismatch,
      declaredExtension,
      actualType: analysis.detectedType,
      mismatch,
    };
  } catch (error) {
    return defaultResponse;
  }
}
