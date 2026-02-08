/**
 * File Organizer MCP Server v3.1.3
 * Categorizer Service
 */

import path from 'path';
import type { FileWithSize, CategoryStats, CategoryName, CustomRule } from '../types.js';
import { CATEGORIES, getCategory } from '../constants.js';
import { formatBytes } from '../utils/formatters.js';

/**
 * Categorizer Service - file categorization by type
 */
export class CategorizerService {
  private customRules: CustomRule[] = [];

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

        // Security: Limit regex length to prevent ReDoS
        if (rule.filenamePattern && rule.filenamePattern.length > 50) {
          throw new Error(`Filename pattern for category '${rule.category}' exceeds 50 characters`);
        }

        validRules.push(rule);
      } catch (error) {
        console.error(
          `Skipping invalid rule for category '${rule.category}': ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Sort by priority (descending)
    this.customRules = [...validRules].sort((a, b) => b.priority - a.priority);
    return validRules.length;
  }

  /**
   * Validate category name for security
   */
  validateCategoryName(name: string): void {
    // 1. Block HTML/JS (XSS)
    if (/<[^>]*>|javascript:/i.test(name)) {
      throw new Error('Category name contains HTML/JS patterns');
    }

    // 2. Block Shell characters (Command Injection)
    // Block $, backticks, |, &, ;
    if (/[\$`|&;]/.test(name)) {
      throw new Error('Category name contains shell injection characters');
    }

    // 3. Block Path Separators & Absolute Paths
    if (/[\/\\]|:/.test(name)) {
      throw new Error('Category name contains path separators');
    }

    // 4. Block Windows Reserved Names
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(name)) {
      throw new Error('Category name is a reserved Windows filename');
    }
  }

  /**
   * Get category for a file
   */
  getCategory(name: string): CategoryName {
    const ext = path.extname(name).toLowerCase();

    const lowerName = name.toLowerCase();

    // Check custom rules first (highest priority)
    for (const rule of this.customRules) {
      // Check extension match
      if (rule.extensions && rule.extensions.some((e) => e.toLowerCase() === ext)) {
        return rule.category as CategoryName;
      }

      // Check regex pattern match
      if (rule.filenamePattern) {
        try {
          const regex = new RegExp(rule.filenamePattern, 'i');
          if (regex.test(name)) {
            return rule.category as CategoryName;
          }
        } catch (e) {
          // Ignore invalid regex
        }
      }
    }

    // Check Pattern-Based Rules (Hardcoded fallback)
    // Tests
    if (
      lowerName.includes('test') ||
      lowerName.includes('spec') ||
      lowerName.endsWith('.test.ts') ||
      lowerName.endsWith('.spec.ts')
    ) {
      // or create a new 'Tests' category if allowed? Re-reading task: "organize as test/debug code/script".
      // The user wants sub-organization or main categories?
      // "organize as test/debug code/script".
      // If I return a new string, it will create a new folder. Ideally I should allow it.
      // Actually, let's map them to subfolders of Code? Or just top level folders?
      // "test/debug code/script" implies maybe:
      // - Tests/
      // - Scripts/
      // - Debug/
      // But these are not in CategoryName enum.
      // If I cast to `as any` it will work because `categorizeFiles` uses string keys eventually.
      return 'Tests' as any;
    }

    if (lowerName.includes('debug') || lowerName.includes('log') || lowerName.endsWith('.log')) {
      return 'Logs' as any;
    }

    if (
      lowerName.includes('demo') ||
      lowerName.includes('sample') ||
      lowerName.includes('example')
    ) {
      return 'Demos' as any;
    }

    if (lowerName.includes('script') || lowerName.endsWith('.sh') || lowerName.endsWith('.bat')) {
      return 'Scripts' as any;
    }

    return getCategory(ext);
  }

  /**
   * Categorize files by their type
   */
  categorizeFiles(files: FileWithSize[]): Partial<Record<CategoryName, CategoryStats>> {
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

    // Initialize custom categories if any encountered in rules?
    // Actually, custom rules might introduce NEW categories not in CATEGORIES enum/object.
    // We should allow dynamic keys in 'categorized'.
    // But Typescript says Record<CategoryName...>.
    // For now, let's cast or assume CategoryName is string for custom ones.
    // But strict typing might bite us.
    // Let's stick to known categories OR allow string keys.
    // If the user adds "WorkProjects", we need to handle that.
    // For now, let's just initialize on demand for non-standard categories.

    // Categorize each file
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
    const result: Partial<Record<string, CategoryStats>> = {}; // Changed to string to allow custom
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
