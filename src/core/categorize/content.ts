/**
 * Background content analysis: content-based categorization with
 * extension fallback. The TTL cache lives in content-cache.ts.
 */

import path from "path";
import { logger } from "../../utils/logger.js";
import type {
  AudioMetadata,
  CategoryName,
  ImageMetadata,
  MetadataCacheEntry,
} from "../../types.js";
import type { PathValidatorService } from "../../services/path-validator.service.js";
import type { ContentAnalyzerService } from "../../services/content-analyzer.service.js";
import type { MetadataCacheService } from "../../services/metadata-cache.service.js";
import { mapContentTypeToCategory } from "./content-map.js";
import { isExecutableDisguisedAsDocument, hasDoubleExtension } from "./security.js";

export interface ContentCategoryResult {
  category: CategoryName;
  confidence: number;
  warnings: string[];
  metadata?: AudioMetadata | ImageMetadata;
}


/**
 * Get category using content analysis (more secure than extension-only).
 * Falls back to extension-based when no analyzer is available or analysis fails.
 */
export async function getCategoryByContent(
  pathValidator: PathValidatorService,
  contentAnalyzer: ContentAnalyzerService | undefined,
  metadataCache: MetadataCacheService | undefined,
  filePath: string,
  getExtensionCategory: (name: string) => CategoryName,
): Promise<ContentCategoryResult> {
  const warnings: string[] = [];
  let confidence: number;
  let metadata: AudioMetadata | ImageMetadata | undefined;

  // First get extension-based category as fallback
  const fileName = path.basename(filePath);
  const extensionCategory = getExtensionCategory(fileName);

  // Check metadata cache first if available
  if (metadataCache) {
    const cacheEntry = (await metadataCache.get(
      filePath,
    )) as MetadataCacheEntry | null;
    if (cacheEntry) {
      metadata = cacheEntry.audioMetadata || cacheEntry.imageMetadata;
    }
  }

  // If content analyzer is not available, fall back to extension
  if (!contentAnalyzer) {
    warnings.push(
      "Content analyzer not available - using extension-based detection",
    );
    return {
      category: extensionCategory,
      confidence: 0.5,
      warnings,
      metadata,
    };
  }

  try {
    // Validate path first
    const validatedPath = await pathValidator.validatePath(filePath, {
      requireExists: true,
    });

    // Perform content analysis
    const analysis = await contentAnalyzer.analyze(validatedPath);

    // Map content type to category
    const contentCategory = mapContentTypeToCategory(
      analysis.detectedType,
      analysis.mimeType,
    );

    // Check for extension mismatch
    if (!analysis.extensionMatch) {
      warnings.push(
        `Extension mismatch: file claims to be "${path.extname(fileName)}" but content is "${analysis.detectedType}"`,
      );

      // High severity if executable disguised as document
      if (isExecutableDisguisedAsDocument(analysis.detectedType, fileName)) {
        warnings.push(
          "CRITICAL: Executable content disguised as document - potential security threat",
        );
        return {
          category: "Suspicious",
          confidence: 0.95,
          warnings,
          metadata,
        };
      }
    }

    // Check for suspicious patterns
    if (hasDoubleExtension(fileName)) {
      warnings.push("Double extension detected - potential spoofing attempt");
    }

    // Determine confidence
    confidence = analysis.confidence;

    // Return content-detected category if high confidence, otherwise extension
    if (confidence >= 0.7) {
      logger.logMetadata(
        "info",
        "File categorized by content",
        metadata as unknown as Record<string, unknown>,
        {
          filePath,
          category: contentCategory,
          confidence,
          detectedType: analysis.detectedType,
          mimeType: analysis.mimeType,
          warnings,
        },
      );
      return { category: contentCategory, confidence, warnings, metadata };
    } else {
      warnings.push(
        "Low content confidence - falling back to extension-based categorization",
      );
      logger.logMetadata(
        "warn",
        "File categorized by extension (low content confidence)",
        metadata as unknown as Record<string, unknown>,
        {
          filePath,
          category: extensionCategory,
          confidence: 0.6,
          detectedType: analysis.detectedType,
          mimeType: analysis.mimeType,
          warnings,
        },
      );
      return {
        category: extensionCategory,
        confidence: 0.6,
        warnings,
        metadata,
      };
    }
  } catch (error) {
    // On error, fall back to extension-based
    warnings.push(
      `Content analysis failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    logger.logMetadata(
      "error",
      "Content analysis failed",
      metadata as unknown as Record<string, unknown>,
      {
        filePath,
        category: extensionCategory,
        confidence: 0.4,
        warnings,
        error: error instanceof Error ? error.message : String(error),
      },
    );
    return {
      category: extensionCategory,
      confidence: 0.4,
      warnings,
      metadata,
    };
  }
}
