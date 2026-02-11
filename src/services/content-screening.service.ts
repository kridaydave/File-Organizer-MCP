/**
 * Content Screening Service - Phase 1 Security Layer
 * Provides security checkpoint for inbound file processing with threat detection
 */

import * as fs from "fs/promises";
import * as path from "path";
import { logger } from "../utils/logger.js";

export interface ScreenOptions {
  checkExtensionMismatch?: boolean;
  checkExecutableContent?: boolean;
  checkSuspiciousPatterns?: boolean;
  strictMode?: boolean;
}

export interface ScreenIssue {
  type:
    | "extension_mismatch"
    | "executable_disguised"
    | "suspicious_pattern"
    | "unknown_type";
  severity: "warning" | "error";
  message: string;
  details?: Record<string, any>;
}

export interface ScreenResult {
  filePath: string;
  passed: boolean;
  threatLevel: "none" | "low" | "medium" | "high";
  detectedType: string;
  declaredExtension: string;
  issues: ScreenIssue[];
  timestamp: Date;
}

export interface ScreeningReport {
  totalFiles: number;
  passedCount: number;
  failedCount: number;
  threatSummary: {
    none: number;
    low: number;
    medium: number;
    high: number;
  };
  issuesByType: Record<string, number>;
  timestamp: Date;
  results: ScreenResult[];
}

interface FileSignature {
  magic: number[] | Buffer;
  mask?: number[] | Buffer;
  offset?: number;
  extension: string;
  type: string;
  category: "executable" | "document" | "image" | "archive" | "other";
}

const FILE_SIGNATURES: FileSignature[] = [
  // Executables
  {
    magic: [0x4d, 0x5a],
    extension: ".exe",
    type: "Windows Executable",
    category: "executable",
  },
  {
    magic: [0x5a, 0x4d],
    extension: ".exe",
    type: "Windows Executable (alternate)",
    category: "executable",
  },
  {
    magic: [0x4d, 0x5a],
    extension: ".dll",
    type: "Windows DLL",
    category: "executable",
  },
  {
    magic: [0x7f, 0x45, 0x4c, 0x46],
    extension: "",
    type: "ELF Executable",
    category: "executable",
  },
  {
    magic: [0xca, 0xfe, 0xba, 0xbe],
    extension: "",
    type: "Java Class/ Mach-O",
    category: "executable",
  },
  {
    magic: [0xcf, 0xfa, 0xed, 0xfe],
    extension: "",
    type: "Mach-O (64-bit)",
    category: "executable",
  },

  // Documents
  {
    magic: [0x25, 0x50, 0x44, 0x46],
    extension: ".pdf",
    type: "PDF Document",
    category: "document",
  },
  {
    magic: [0xd0, 0xcf, 0x11, 0xe0],
    extension: ".doc",
    type: "Microsoft Office (old)",
    category: "document",
  },
  {
    magic: [0x50, 0x4b, 0x03, 0x04],
    extension: ".docx",
    type: "Office Open XML",
    category: "document",
  },
  {
    magic: [0x50, 0x4b, 0x05, 0x06],
    extension: ".docx",
    type: "Office Open XML (empty)",
    category: "document",
  },

  // Images
  {
    magic: [0xff, 0xd8, 0xff],
    extension: ".jpg",
    type: "JPEG Image",
    category: "image",
  },
  {
    magic: [0x89, 0x50, 0x4e, 0x47],
    extension: ".png",
    type: "PNG Image",
    category: "image",
  },
  {
    magic: [0x47, 0x49, 0x46],
    extension: ".gif",
    type: "GIF Image",
    category: "image",
  },
  {
    magic: [0x42, 0x4d],
    extension: ".bmp",
    type: "BMP Image",
    category: "image",
  },
  {
    magic: [0x52, 0x49, 0x46, 0x46],
    extension: ".webp",
    type: "WebP Image",
    category: "image",
  },

  // Archives
  {
    magic: [0x50, 0x4b, 0x03, 0x04],
    extension: ".zip",
    type: "ZIP Archive",
    category: "archive",
  },
  {
    magic: [0x52, 0x61, 0x72, 0x21],
    extension: ".rar",
    type: "RAR Archive",
    category: "archive",
  },
  {
    magic: [0x37, 0x7a, 0xbc, 0xaf],
    extension: ".7z",
    type: "7-Zip Archive",
    category: "archive",
  },
  {
    magic: [0x1f, 0x8b],
    extension: ".gz",
    type: "GZip Archive",
    category: "archive",
  },

  // Scripts
  {
    magic: [0x23, 0x21],
    extension: ".sh",
    type: "Shell Script",
    category: "executable",
  },
  {
    magic: [0x40, 0x65, 0x63, 0x68],
    extension: ".bat",
    type: "Batch File",
    category: "executable",
  },
];

const SUSPICIOUS_PATTERNS = {
  doubleExtension: /\.[a-zA-Z0-9]+\.[a-zA-Z0-9]{2,4}$/,
  executableExtensions: [
    ".exe",
    ".dll",
    ".bat",
    ".cmd",
    ".sh",
    ".msi",
    ".scr",
    ".com",
  ],
  documentExtensions: [".pdf", ".doc", ".docx", ".txt", ".rtf", ".odt", ".md"],
  imageExtensions: [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".svg",
    ".ico",
    ".webp",
  ],
  dangerousInDocument: [".exe", ".dll", ".scr", ".com", ".bat", ".cmd"],
  dangerousInImage: [".exe", ".dll", ".scr", ".com", ".bat", ".cmd", ".sh"],
};

export class ContentScreeningService {
  private readonly maxHeaderBytes = 4096;

  /**
   * Screen a single file for security threats
   */
  async screen(
    filePath: string,
    options: ScreenOptions = {},
  ): Promise<ScreenResult> {
    const opts = {
      checkExtensionMismatch: true,
      checkExecutableContent: true,
      checkSuspiciousPatterns: true,
      strictMode: false,
      ...options,
    };

    const result: ScreenResult = {
      filePath,
      passed: true,
      threatLevel: "none",
      detectedType: "unknown",
      declaredExtension: path.extname(filePath).toLowerCase(),
      issues: [],
      timestamp: new Date(),
    };

    try {
      const header = await this.readFileHeader(filePath);

      if (header.length === 0) {
        result.issues.push({
          type: "unknown_type",
          severity: "warning",
          message: "Could not read file header or file is empty",
        });
        this.updateThreatLevel(result);
        return result;
      }

      // Detect actual file type from magic number
      const detected = this.detectFileType(header);
      result.detectedType = detected.type || "unknown";

      // Check 1: Extension Mismatch
      if (opts.checkExtensionMismatch && detected.extension) {
        this.checkExtensionMismatch(result, detected);
      }

      // Check 2: Executable Masquerading
      if (opts.checkExecutableContent) {
        this.checkExecutableMasquerading(result, detected);
      }

      // Check 3: Suspicious Patterns
      if (opts.checkSuspiciousPatterns) {
        this.checkSuspiciousPatterns(result);
      }

      // Check 4: Unknown Types
      if (!detected.type && result.declaredExtension) {
        result.issues.push({
          type: "unknown_type",
          severity: "warning",
          message: `Unknown file type with extension: ${result.declaredExtension}`,
          details: { extension: result.declaredExtension },
        });
      }

      this.updateThreatLevel(result);

      // In strict mode, any warning causes failure
      if (
        opts.strictMode &&
        result.issues.some((i) => i.severity === "warning")
      ) {
        result.passed = false;
      }

      // Log the screening result
      logger.info("File screened", {
        filePath,
        threatLevel: result.threatLevel,
        issues: result.issues.length,
        passed: result.passed,
      });
    } catch (error) {
      logger.error("Screening error", error, { filePath });
      result.issues.push({
        type: "unknown_type",
        severity: "error",
        message: `Screening failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      result.passed = false;
      result.threatLevel = "high";
    }

    return result;
  }

  /**
   * Screen multiple files in parallel
   */
  async screenBatch(
    filePaths: string[],
    options: ScreenOptions = {},
  ): Promise<ScreenResult[]> {
    logger.info(`Starting batch screening of ${filePaths.length} files`);

    const results = await Promise.all(
      filePaths.map((filePath) => this.screen(filePath, options)),
    );

    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.length - passedCount;

    logger.info("Batch screening complete", {
      total: filePaths.length,
      passed: passedCount,
      failed: failedCount,
    });

    return results;
  }

  /**
   * Check if a file is allowed based on type restrictions
   */
  async isAllowed(filePath: string, allowedTypes?: string[]): Promise<boolean> {
    if (!allowedTypes || allowedTypes.length === 0) {
      return true;
    }

    const result = await this.screen(filePath, {
      checkExtensionMismatch: true,
      checkExecutableContent: true,
      checkSuspiciousPatterns: true,
      strictMode: false,
    });

    // Check if file passed screening
    if (!result.passed && result.threatLevel === "high") {
      return false;
    }

    // Check if detected type is in allowed types
    const normalizedAllowedTypes = allowedTypes.map((t) => t.toLowerCase());
    const declaredExt = result.declaredExtension.toLowerCase();

    // If we have a detected extension, check it against allowed types
    const detectedExt = this.extractExtensionFromType(result.detectedType);

    return normalizedAllowedTypes.some(
      (type) =>
        declaredExt === type ||
        declaredExt === `.${type}` ||
        detectedExt === type ||
        detectedExt === `.${type}`,
    );
  }

  /**
   * Generate a comprehensive screening report
   */
  generateScreeningReport(results: ScreenResult[]): ScreeningReport {
    const threatSummary = {
      none: 0,
      low: 0,
      medium: 0,
      high: 0,
    };

    const issuesByType: Record<string, number> = {
      extension_mismatch: 0,
      executable_disguised: 0,
      suspicious_pattern: 0,
      unknown_type: 0,
    };

    for (const result of results) {
      threatSummary[result.threatLevel]++;

      for (const issue of result.issues) {
        issuesByType[issue.type] = (issuesByType[issue.type] || 0) + 1;
      }
    }

    const passedCount = results.filter((r) => r.passed).length;

    return {
      totalFiles: results.length,
      passedCount,
      failedCount: results.length - passedCount,
      threatSummary,
      issuesByType,
      timestamp: new Date(),
      results,
    };
  }

  /**
   * Read the header bytes of a file for magic number detection
   */
  private async readFileHeader(filePath: string): Promise<Buffer> {
    let handle: fs.FileHandle | undefined;

    try {
      handle = await fs.open(filePath, "r");
      const buffer = Buffer.alloc(this.maxHeaderBytes);
      const { bytesRead } = await handle.read(
        buffer,
        0,
        this.maxHeaderBytes,
        0,
      );
      return buffer.subarray(0, bytesRead);
    } finally {
      if (handle) {
        try {
          await handle.close();
        } catch {
          // Ignore close errors
        }
      }
    }
  }

  /**
   * Detect file type from magic number
   */
  private detectFileType(header: Buffer): {
    type: string;
    extension: string;
    category: string;
  } {
    for (const sig of FILE_SIGNATURES) {
      const offset = sig.offset || 0;
      const magicLen = sig.magic.length;

      if (header.length >= offset + magicLen) {
        const headerSlice = header.subarray(offset, offset + magicLen);
        let matches = true;

        if (sig.mask && sig.mask.length >= magicLen) {
          // Apply mask for complex signatures
          for (let i = 0; i < magicLen; i++) {
            const headerByte = headerSlice[i];
            const maskByte = sig.mask[i];
            const magicByte = sig.magic[i];
            if (
              headerByte === undefined ||
              maskByte === undefined ||
              magicByte === undefined
            ) {
              matches = false;
              break;
            }
            if ((headerByte & maskByte) !== magicByte) {
              matches = false;
              break;
            }
          }
        } else {
          // Direct comparison
          for (let i = 0; i < magicLen; i++) {
            const headerByte = headerSlice[i];
            const magicByte = sig.magic[i];
            if (headerByte === undefined || magicByte === undefined) {
              matches = false;
              break;
            }
            if (headerByte !== magicByte) {
              matches = false;
              break;
            }
          }
        }

        if (matches) {
          return {
            type: sig.type,
            extension: sig.extension,
            category: sig.category,
          };
        }
      }
    }

    return { type: "", extension: "", category: "other" };
  }

  /**
   * Check if file extension matches detected type
   */
  private checkExtensionMismatch(
    result: ScreenResult,
    detected: { type: string; extension: string; category: string },
  ): void {
    if (
      !detected.extension ||
      detected.extension === result.declaredExtension
    ) {
      return;
    }

    result.issues.push({
      type: "extension_mismatch",
      severity: "warning",
      message: `Extension mismatch: declared as "${result.declaredExtension}" but detected as "${detected.type}"`,
      details: {
        declaredExtension: result.declaredExtension,
        detectedExtension: detected.extension,
        detectedType: detected.type,
      },
    });
  }

  /**
   * Check for executable files masquerading as documents or images
   */
  private checkExecutableMasquerading(
    result: ScreenResult,
    detected: { type: string; extension: string; category: string },
  ): void {
    const declared = result.declaredExtension.toLowerCase();

    // Case 1: Document/Image extension but executable content
    if (detected.category === "executable") {
      const dangerousInDoc =
        SUSPICIOUS_PATTERNS.dangerousInDocument.includes(declared);
      const dangerousInImg =
        SUSPICIOUS_PATTERNS.dangerousInImage.includes(declared);

      if (
        SUSPICIOUS_PATTERNS.documentExtensions.includes(declared) ||
        dangerousInDoc
      ) {
        result.issues.push({
          type: "executable_disguised",
          severity: "error",
          message: `CRITICAL: Executable content detected inside ${declared} file! Possible malware.`,
          details: {
            declaredExtension: declared,
            detectedType: detected.type,
            detectedCategory: detected.category,
          },
        });
        result.passed = false;
      } else if (
        SUSPICIOUS_PATTERNS.imageExtensions.includes(declared) ||
        dangerousInImg
      ) {
        result.issues.push({
          type: "executable_disguised",
          severity: "error",
          message: `CRITICAL: Executable content detected inside ${declared} file! Possible malware.`,
          details: {
            declaredExtension: declared,
            detectedType: detected.type,
            detectedCategory: detected.category,
          },
        });
        result.passed = false;
      }
    }

    // Case 2: Check for embedded executable markers in non-executable files
    if (detected.category !== "executable" && result.declaredExtension) {
      // Additional heuristics for partial executable detection
      // This would require ContentAnalyzerService for deeper inspection
    }
  }

  /**
   * Check for suspicious filename patterns
   */
  private checkSuspiciousPatterns(result: ScreenResult): void {
    const filename = path.basename(result.filePath);

    // Check for double extensions (e.g., file.jpg.exe)
    const doubleExtMatch = filename.match(SUSPICIOUS_PATTERNS.doubleExtension);
    if (doubleExtMatch) {
      const fullMatch = doubleExtMatch[0];
      const parts = fullMatch.split(".");
      const lastPart = parts[parts.length - 1];
      const lastExt = lastPart ? "." + lastPart.toLowerCase() : "";

      if (SUSPICIOUS_PATTERNS.executableExtensions.includes(lastExt)) {
        result.issues.push({
          type: "suspicious_pattern",
          severity: "error",
          message: `Suspicious double extension detected: "${fullMatch}" - executable hidden in filename`,
          details: {
            pattern: "double_extension",
            filename,
            hiddenExecutable: lastExt,
          },
        });
        result.passed = false;
      } else {
        result.issues.push({
          type: "suspicious_pattern",
          severity: "warning",
          message: `Multiple extensions detected in filename: "${filename}"`,
          details: {
            pattern: "double_extension",
            filename,
          },
        });
      }
    }

    // Check for suspicious characters in filename
    if (/[\x00-\x1F]/.test(filename)) {
      result.issues.push({
        type: "suspicious_pattern",
        severity: "error",
        message:
          "Filename contains control characters - possible exploit attempt",
        details: { filename },
      });
      result.passed = false;
    }

    // Check for right-to-left override characters (spoofing)
    if (/[\u202E\u202D\u200E\u200F]/.test(filename)) {
      result.issues.push({
        type: "suspicious_pattern",
        severity: "error",
        message:
          "Filename contains bidirectional text override characters - possible spoofing",
        details: { filename },
      });
      result.passed = false;
    }

    // Check for excessive dots (obfuscation attempt)
    const dotCount = (filename.match(/\./g) || []).length;
    if (dotCount > 3) {
      result.issues.push({
        type: "suspicious_pattern",
        severity: "warning",
        message: `Filename contains ${dotCount} dots - possible obfuscation attempt`,
        details: { filename, dotCount },
      });
    }
  }

  /**
   * Update threat level based on issues
   */
  private updateThreatLevel(result: ScreenResult): void {
    const hasErrors = result.issues.some((i) => i.severity === "error");
    const hasWarnings = result.issues.some((i) => i.severity === "warning");

    if (hasErrors) {
      result.threatLevel = "high";
      result.passed = false;
    } else if (hasWarnings) {
      result.threatLevel = "medium";
    } else {
      result.threatLevel = "none";
      result.passed = true;
    }

    // Downgrade to low if only unknown_type warning
    const firstIssue = result.issues[0];
    if (
      result.threatLevel === "medium" &&
      result.issues.length === 1 &&
      firstIssue &&
      firstIssue.type === "unknown_type"
    ) {
      result.threatLevel = "low";
    }
  }

  /**
   * Extract extension from detected type string
   */
  private extractExtensionFromType(type: string): string {
    // Common mappings from detected type to extension
    const typeToExt: Record<string, string> = {
      "Windows Executable": ".exe",
      "Windows DLL": ".dll",
      "PDF Document": ".pdf",
      "JPEG Image": ".jpg",
      "PNG Image": ".png",
      "GIF Image": ".gif",
      "ZIP Archive": ".zip",
      "RAR Archive": ".rar",
      "7-Zip Archive": ".7z",
    };

    return typeToExt[type] || "";
  }
}

export const contentScreeningService = new ContentScreeningService();
