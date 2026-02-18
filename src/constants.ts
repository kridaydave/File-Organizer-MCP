/**
 * File Organizer MCP Server v3.4.0
 * File Category Constants
 */

import type { CategoryName } from "./types.js";

/**
 * File extension to category mappings
 */
export const CATEGORIES: Record<CategoryName, readonly string[]> = {
  Executables: [".exe", ".msi", ".bat", ".cmd", ".sh"],
  Videos: [".mp4", ".avi", ".mkv", ".mov", ".wmv", ".flv", ".webm", ".m4v"],
  Documents: [".pdf", ".doc", ".docx", ".txt", ".rtf", ".odt", ".md", ".tex"],
  Presentations: [".ppt", ".pptx", ".odp", ".key"],
  Spreadsheets: [".xls", ".xlsx", ".csv", ".ods"],
  Images: [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".svg", ".ico", ".webp"],
  Audio: [".mp3", ".flac", ".aac", ".ogg", ".wma", ".m4a", ".wav"],
  Music: [".flac", ".wav"], // For music organization (exclusive formats)
  Photos: [".tiff", ".heic"], // For photo organization (exclusive formats)
  Archives: [".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz"],
  Code: [
    ".py",
    ".js",
    ".ts",
    ".java",
    ".cpp",
    ".c",
    ".html",
    ".css",
    ".php",
    ".rb",
    ".go",
    ".json",
  ],
  Installers: [".dmg", ".pkg", ".deb", ".rpm", ".apk"],
  Ebooks: [".epub", ".mobi", ".azw", ".azw3"],
  Fonts: [".ttf", ".otf", ".woff", ".woff2"],
  Suspicious: [], // For files flagged by security screening
  Quarantine: [], // For files that failed security screening
  Tests: [".test.ts", ".spec.ts", ".test.js", ".spec.js"], // For test files
  Logs: [".log"], // For log files
  Demos: [], // For demo/sample files
  Scripts: [".sh", ".bat", ".ps1"], // For script files
  Others: [],
} as const;

/**
 * All category names as an array
 */
export const CATEGORY_NAMES: readonly CategoryName[] = Object.keys(
  CATEGORIES,
) as CategoryName[];

/**
 * Get category for a file extension
 * @param extension - File extension (with dot, e.g., '.pdf')
 * @returns Category name
 */
export function getCategory(extension: string): CategoryName {
  const ext = extension.toLowerCase();
  for (const [category, extensions] of Object.entries(CATEGORIES)) {
    if (extensions.includes(ext)) {
      return category as CategoryName;
    }
  }
  return "Others";
}
