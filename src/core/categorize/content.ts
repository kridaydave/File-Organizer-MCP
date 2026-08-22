/**
 * Content-based categorization with extension fallback.
 * Detection is a local magic-byte sniff (see sniff.ts), no cache.
 */

import path from "path";
import { logger } from "../../utils/logger.js";
import type { CategoryName } from "../../types.js";
import type { PathValidatorService } from "../../services/path-validator.service.js";
import type { SniffResult } from "./sniff.js";
import { sniffFileType } from "./sniff.js";
import { mapContentTypeToCategory } from "./content-map.js";
import { isExecutableDisguisedAsDocument, hasDoubleExtension } from "./security.js";

export interface ContentCategoryResult {
  category: CategoryName;
  confidence: number;
  warnings: string[];
}

/**
 * Get category using content sniffing (more secure than extension-only).
 * Falls back to extension-based when the sniff fails or has low confidence.
 */
export async function getCategoryByContent(
  pathValidator: PathValidatorService,
  filePath: string,
  getExtensionCategory: (name: string) => CategoryName,
): Promise<ContentCategoryResult> {
  const warnings: string[] = [];

  const fileName = path.basename(filePath);
  const extensionCategory = getExtensionCategory(fileName);

  let sniff: SniffResult;
  try {
    sniff = await sniffFileType(pathValidator, filePath);
  } catch (error) {
    warnings.push(
      `Content sniff failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    logger.logMetadata(
      "error",
      "Content sniff failed",
      undefined,
      {
        filePath,
        category: extensionCategory,
        confidence: 0.4,
      },
    );
    return { category: extensionCategory, confidence: 0.4, warnings };
  }

  const contentCategory = mapContentTypeToCategory(
    sniff.detectedType,
    sniff.mimeType,
  );

  if (!sniff.extensionMatch) {
    warnings.push(
      `Extension mismatch: file claims to be "${path.extname(fileName)}" but content is "${sniff.detectedType}"`,
    );

    if (isExecutableDisguisedAsDocument(sniff.detectedType, fileName)) {
      warnings.push(
        "CRITICAL: Executable content disguised as document - potential security threat",
      );
      return { category: "Suspicious", confidence: 0.95, warnings };
    }
  }

  if (hasDoubleExtension(fileName)) {
    warnings.push("Double extension detected - potential spoofing attempt");
  }

  if (sniff.confidence >= 0.7) {
    logger.logMetadata(
      "info",
      "File categorized by content",
      undefined,
      {
        filePath,
        category: contentCategory,
        confidence: sniff.confidence,
        detectedType: sniff.detectedType,
      },
    );
    return { category: contentCategory, confidence: sniff.confidence, warnings };
  }

  warnings.push(
    "Low content confidence - falling back to extension-based categorization",
  );
  return { category: extensionCategory, confidence: 0.6, warnings };
}
