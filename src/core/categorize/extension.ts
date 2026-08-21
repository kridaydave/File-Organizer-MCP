/**
 * Extension and filename-pattern based categorization.
 * Pure functions over the file name - no filesystem access.
 */

import path from "path";
import type { CategoryName, CustomRule } from "../../types.js";
import { getCategory } from "../../constants.js";
import { safeRegexTest } from "./rules.js";

const regexCache = new Map<string, RegExp>();

function getCachedRegex(pattern: string): RegExp {
  if (!regexCache.has(pattern)) {
    regexCache.set(pattern, new RegExp(pattern, "i"));
  }
  return regexCache.get(pattern)!;
}

/**
 * Get real extension from files with double extensions
 */
export function getRealExtension(fileName: string): string {
  const match = /^.*?\.(.+)$/.exec(fileName);

  if (match && match[1]) {
    const extension = match[1].toLowerCase();
    const doubleExtensionMatch = /^.*?(\.[a-z0-9]{2,4})$/.exec(extension);

    if (doubleExtensionMatch && doubleExtensionMatch[1]) {
      return doubleExtensionMatch[1];
    }
    return `.${extension}`;
  }
  return "";
}

/**
 * Get category by extension and filename patterns.
 * Custom rules take priority, then hardcoded pattern fallbacks,
 * then the extension map from constants.
 */
export function getCategoryByExtension(
  name: string,
  customRules: CustomRule[],
): CategoryName {
  const ext = path.extname(name).toLowerCase();

  const lowerName = name.toLowerCase();

  // Check custom rules first (highest priority)
  for (const rule of customRules) {
    // Check extension match
    if (
      rule.extensions &&
      rule.extensions.some((e) => e.toLowerCase() === ext)
    ) {
      return rule.category as CategoryName;
    }

    // Check regex pattern match
    if (rule.filenamePattern) {
      try {
        const regex = getCachedRegex(rule.filenamePattern);
        if (safeRegexTest(regex, name)) {
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
    lowerName.includes("test") ||
    lowerName.includes("spec") ||
    lowerName.endsWith(".test.ts") ||
    lowerName.endsWith(".spec.ts")
  ) {
    return "Tests";
  }

  if (
    lowerName.includes("debug") ||
    lowerName.includes("log") ||
    lowerName.endsWith(".log")
  ) {
    return "Logs";
  }

  if (
    lowerName.includes("demo") ||
    lowerName.includes("sample") ||
    lowerName.includes("example")
  ) {
    return "Demos";
  }

  if (
    lowerName.includes("script") ||
    lowerName.endsWith(".sh") ||
    lowerName.endsWith(".bat")
  ) {
    return "Scripts";
  }

  return getCategory(ext);
}
