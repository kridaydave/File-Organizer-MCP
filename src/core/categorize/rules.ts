/**
 * Custom rule validation and ReDoS-safe regex helpers.
 * Pure functions - no filesystem or instance state.
 */

import { logger } from "../../utils/logger.js";

/**
 * Validate category name for security
 */
export function validateCategoryName(name: string): void {
  // 0. Reject empty/whitespace names
  if (!name || !name.trim()) {
    throw new Error("Category name is empty");
  }

  // 1. Block HTML/JS (XSS)
  if (/<[^>]*>|javascript:/i.test(name)) {
    throw new Error("Category name contains HTML/JS patterns");
  }

  // 2. Block Shell characters (Command Injection)
  // Block $, backticks, |, &, ;
  if (/[\$`|&;]/.test(name)) {
    throw new Error("Category name contains shell injection characters");
  }

  // 3. Block Path Separators & Absolute Paths
  if (/[\/\\]|:/.test(name)) {
    throw new Error("Category name contains path separators");
  }

  // 4. Block Windows Reserved Names
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(name)) {
    throw new Error("Category name is a reserved Windows filename");
  }
}

/**
 * Validate regex pattern for security (prevent ReDoS)
 */
export function validateRegexPattern(pattern: string, category: string): void {
  // 1. Length check (more restrictive than before)
  if (pattern.length > 30) {
    throw new Error(
      `Filename pattern for category '${category}' exceeds 30 characters`,
    );
  }

  // 2. Block patterns that can cause catastrophic backtracking
  const catastrophicPatterns = [
    // Nested quantifiers with overlap (e.g., (a+)+)
    /\(\s*\w*\s*\+\s*\)\+/,
    /\(\s*\w*\s*\*\s*\)\+/,
    /\(\s*\w*\s*\+\s*\)\*/,
    // Repeated groups with alternations
    /\(\w+\|\w+\)\+/,
    /\(\w\|\w+\)\+/,
    // Deeply nested groups with quantifiers
    /\(\s*\(\s*\w*\s*[+*]\s*\)\s*[+*]\s*\)/,
  ];

  for (const catPattern of catastrophicPatterns) {
    if (catPattern.test(pattern)) {
      throw new Error(
        `Filename pattern for category '${category}' contains potentially harmful regex patterns`,
      );
    }
  }

  // 3. Limit allowed regex features to prevent complex patterns
  const disallowedFeatures = [
    // Backreferences
    /\\\d/,
    // Lookahead/lookbehind assertions
    /\(\?=.*?\)/,
    /\(\?!.*?\)/,
    /\(\?<=.*?\)/,
    /\(\?<!.*?\)/,
    // Atomic groups
    /\(?>.*?\)/,
    // Comments
    /\(\?#.*?\)/,
    // Conditional patterns
    /\(\?\(.*?\)/,
  ];

  for (const disallowed of disallowedFeatures) {
    if (disallowed.test(pattern)) {
      throw new Error(
        `Filename pattern for category '${category}' contains disallowed regex features`,
      );
    }
  }

  // 4. Test pattern validity
  try {
    new RegExp(pattern);
  } catch (error) {
    throw new Error(
      `Filename pattern for category '${category}' is not a valid regular expression`,
      { cause: error },
    );
  }
}

/**
 * Safe regex test with ReDoS protection
 * Note: timeout parameter is not currently implemented - uses string length limiting instead
 */
export function safeRegexTest(
  regex: RegExp,
  string: string,
  timeout: number = 100,
): boolean {
  if (string.length > 1000) {
    return false;
  }

  let result: boolean;

  try {
    result = regex.test(string);
  } catch (error) {
    logger.warn(`Regex test failed: ${(error as Error).message}`);
    result = false;
  }

  return result;
}
