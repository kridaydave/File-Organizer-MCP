/**
 * File Organizer MCP Server v5.0.0
 * Categorizer Service - thin facade over core/categorize modules.
 *
 * The actual logic lives in src/core/categorize/:
 * rules (validation), extension (pattern matching), content-map,
 * content (background analysis cache), security (screening).
 */

import type {
  CategoryName,
  CategoryStats,
  CustomRule,
  FileWithSize,
} from "../types.js";
import { CATEGORIES } from "../constants.js";
import { formatBytes } from "../utils/formatters.js";
import { PathValidatorService } from "./path-validator.service.js";
import { validateCategoryName, validateRegexPattern } from "../core/categorize/rules.js";
import { getCategoryByExtension } from "../core/categorize/extension.js";
import {
  getCategoryByContent,
} from "../core/categorize/content.js";
import { ContentAnalysisCache } from "../core/categorize/content-cache.js";
import {
  classifySecurity as classifySecurityFn,
  validateFileType as validateFileTypeFn,
} from "../core/categorize/security.js";
import { logger } from "../utils/logger.js";

/**
 * Categorizer Service - file categorization by type
 */
export class CategorizerService {
  private customRules: CustomRule[] = [];
  private pathValidator: PathValidatorService;
  private contentCache: ContentAnalysisCache;

  constructor(
    customRules: CustomRule[] = [],
    pathValidator?: PathValidatorService,
  ) {
    this.pathValidator = pathValidator ?? new PathValidatorService();
    this.contentCache = new ContentAnalysisCache(
      (filePath) => this.getCategoryByContent(filePath),
      (name) => this.getCategoryByExtension(name),
    );
    if (customRules.length > 0) {
      this.setCustomRules(customRules);
    }
  }

  /**
   * Stop cleanup interval (for testing)
   */
  public stopCleanupInterval(): void {
    this.contentCache.stopCleanupInterval();
  }

  /**
   * Clean up resources - stops the cleanup interval
   */
  public destroy(): void {
    this.contentCache.destroy();
  }

  /**
   * Set custom categorization rules
   * @returns Number of valid rules applied
   */
  setCustomRules(rules: CustomRule[]): number {
    // Validate rules
    const validRules: CustomRule[] = [];
    for (const rule of rules) {
      try {
        this.validateCategoryName(rule.category);

        // Security: Validate regex pattern to prevent ReDoS
        if (rule.filenamePattern) {
          this.validateRegexPattern(rule.filenamePattern, rule.category);
        }

        validRules.push(rule);
      } catch (error) {
        logger.error(
          `Skipping invalid rule for category '${rule.category}': ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Sort by priority (descending)
    this.customRules = [...validRules].sort((a, b) => b.priority - a.priority);
    return validRules.length;
  }

  /**
   * Validate regex pattern for security (prevent ReDoS)
   */
  validateRegexPattern(pattern: string, category: string): void {
    validateRegexPattern(pattern, category);
  }

  /**
   * Validate category name for security
   */
  validateCategoryName(name: string): void {
    validateCategoryName(name);
  }

  /**
   * Get category for a file
   * @param name - File name
   * @param useContentAnalysis - When true, verify extension matches content asynchronously
   * @param filePath - Optional file path for content analysis (required if useContentAnalysis is true)
   * @returns Category name
   */
  getCategory(
    name: string,
    useContentAnalysis?: boolean,
    filePath?: string,
  ): CategoryName {
    const extensionCategory = this.getCategoryByExtension(name);

    if (useContentAnalysis && filePath) {
      this.contentCache.trigger(name, filePath);
    }

    return extensionCategory;
  }

  /**
   * Get the updated category from background content analysis (if available)
   */
  getUpdatedCategory(name: string, filePath: string): CategoryName | undefined {
    return this.contentCache.getUpdated(name, filePath);
  }

  /**
   * Wait for content analysis to complete and get the final category
   */
  async waitForContentAnalysis(
    name: string,
    filePath: string,
  ): Promise<CategoryName> {
    return this.contentCache.waitFor(name, filePath);
  }

  /**
   * Clear content analysis cache for a specific file
   */
  clearContentAnalysisCache(filePath?: string): void {
    this.contentCache.clear(filePath);
  }

  /**
   * Get category by extension only (original logic)
   */
  private getCategoryByExtension(name: string): CategoryName {
    return getCategoryByExtension(name, this.customRules);
  }

  /**
   * Get category using content sniffing (more secure than extension-only)
   * Falls back to extension-based if content sniffing fails
   */
  async getCategoryByContent(filePath: string): Promise<{
    category: CategoryName;
    confidence: number;
    warnings: string[];
  }> {
    return getCategoryByContent(
      this.pathValidator,
      filePath,
      (name) => this.getCategoryByExtension(name),
    );
  }

  /**
   * Get security classification for a file
   */
  async classifySecurity(filePath: string): Promise<{
    isExecutable: boolean;
    isSuspicious: boolean;
    threatLevel: "none" | "low" | "medium" | "high";
    reason?: string;
  }> {
    return classifySecurityFn(this.pathValidator, filePath);
  }

  /**
   * Check if file extension matches actual content
   */
  async validateFileType(filePath: string): Promise<{
    valid: boolean;
    declaredExtension: string;
    actualType: string;
    mismatch: boolean;
  }> {
    return validateFileTypeFn(this.pathValidator, filePath);
  }

  /**
   * Categorize files by their type
   */
  categorizeFiles(
    files: FileWithSize[],
  ): Partial<Record<CategoryName, CategoryStats>> {
    const categorized: Record<CategoryName, CategoryStats> = {} as Record<
      CategoryName,
      CategoryStats
    >;

    // Initialize default categories
    for (const category of Object.keys(CATEGORIES) as CategoryName[]) {
      categorized[category] = {
        count: 0,
        total_size: 0,
        files: [],
      };
    }

    // Categorize each file (custom rules may introduce non-standard categories)
    for (const file of files) {
      const category = this.getCategory(file.name);

      if (!categorized[category]) {
        categorized[category] = {
          count: 0,
          total_size: 0,
          files: [],
        };
      }

      categorized[category].count++;
      categorized[category].total_size += file.size;
      categorized[category].files.push(file.name);
    }

    // Remove empty categories and add readable size
    const result: Partial<Record<string, CategoryStats>> = {};
    for (const [category, stats] of Object.entries(categorized)) {
      if (stats.count > 0) {
        result[category] = {
          ...stats,
          total_size_readable: formatBytes(stats.total_size),
        };
      }
    }

    return result;
  }
}
