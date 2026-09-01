/**
 * TTL cache for background content-analysis results, keyed by "path:name".
 * Owns its own cleanup interval; destroy() when done.
 */

import { logger } from "../../utils/logger.js";
import type { CategoryName } from "../../types.js";
import type { ContentCategoryResult } from "./content.js";

const CONTENT_ANALYSIS_TTL_MS = 5 * 60 * 1000;
const CONTENT_ANALYSIS_CLEANUP_INTERVAL_MS = 60 * 1000;

/**
 * Cache of in-flight and completed background analyses, keyed by "path:name".
 * Owns its own cleanup interval; destroy() when done.
 */
export class ContentAnalysisCache {
  private promises: Map<string, Promise<CategoryName>> = new Map();
  private results: Map<string, CategoryName> = new Map();
  private timestamps: Map<string, number> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    private analyze: (filePath: string) => Promise<ContentCategoryResult>,
    private getExtensionCategory: (name: string) => CategoryName,
  ) {
    this.startCleanupInterval();
  }

  /**
   * Start periodic cleanup interval for stale content analysis entries
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(async () => {
      try {
        this.cleanupStaleEntries();
      } catch (error) {
        logger.error("Content analysis cleanup failed:", error);
      }
    }, CONTENT_ANALYSIS_CLEANUP_INTERVAL_MS);

    this.cleanupInterval.unref();
  }

  /**
   * Clean up stale entries from content analysis Maps
   */
  private cleanupStaleEntries(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, timestamp] of this.timestamps.entries()) {
      if (now - timestamp > CONTENT_ANALYSIS_TTL_MS) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.promises.delete(key);
      this.results.delete(key);
      this.timestamps.delete(key);
    }

    if (keysToDelete.length > 0) {
      logger.debug(
        `Cleaned up ${keysToDelete.length} stale content analysis entries`,
      );
    }
  }

  /**
   * Stop cleanup interval (for testing)
   */
  stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Clean up resources - stops the cleanup interval
   */
  destroy(): void {
    this.stopCleanupInterval();
  }

  /**
   * Trigger async content analysis in the background
   */
  trigger(name: string, filePath: string): Promise<CategoryName> {
    const key = `${filePath}:${name}`;

    if (this.promises.has(key)) {
      return this.promises.get(key)!;
    }

    const analysisPromise = (async (): Promise<CategoryName> => {
      try {
        const result = await this.analyze(filePath);

        if (result.confidence >= 0.7) {
          this.results.set(key, result.category);
          this.timestamps.set(key, Date.now());
          logger.info("Content analysis updated category", {
            filePath,
            name,
            oldCategory: this.getExtensionCategory(name),
            newCategory: result.category,
            confidence: result.confidence,
          });
          return result.category;
        }

        return this.getExtensionCategory(name);
      } catch (error) {
        logger.error("Content analysis failed", {
          filePath,
          name,
          error: error instanceof Error ? error.message : String(error),
        });
        return this.getExtensionCategory(name);
      } finally {
        this.promises.delete(key);
        if (!this.results.has(key)) {
          this.timestamps.delete(key);
        }
      }
    })();

    this.promises.set(key, analysisPromise);
    this.timestamps.set(key, Date.now());
    return analysisPromise;
  }

  /**
   * Get the updated category from background content analysis (if available)
   */
  getUpdated(name: string, filePath: string): CategoryName | undefined {
    const key = `${filePath}:${name}`;
    return this.results.get(key);
  }

  /**
   * Wait for content analysis to complete and get the final category
   */
  async waitFor(name: string, filePath: string): Promise<CategoryName> {
    const key = `${filePath}:${name}`;
    const cachedResult = this.results.get(key);
    if (cachedResult) {
      return cachedResult;
    }

    const promise = this.promises.get(key);
    if (promise) {
      return promise;
    }

    return this.trigger(name, filePath);
  }

  /**
   * Clear content analysis cache for a specific file (or all)
   */
  clear(filePath?: string): void {
    if (filePath) {
      const allKeys = new Set([
        ...this.results.keys(),
        ...this.promises.keys(),
        ...this.timestamps.keys(),
      ]);
      const prefix = `${filePath}:`;
      for (const key of allKeys) {
        if (key === filePath || key.startsWith(prefix)) {
          this.results.delete(key);
          this.promises.delete(key);
          this.timestamps.delete(key);
        }
      }
    } else {
      this.results.clear();
      this.promises.clear();
      this.timestamps.clear();
    }
  }
}
