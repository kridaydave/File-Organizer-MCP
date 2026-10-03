/**
 * Category Types
 * Category definitions, stats, and content analysis types
 */

export interface CustomRule {
  category: string;
  extensions?: string[];
  filenamePattern?: string;
  priority: number;
}

export interface CategoryDefinition {
  name: string;
  extensions: string[];
}

export type CategoryName =
  | "Executables"
  | "Videos"
  | "Documents"
  | "Presentations"
  | "Spreadsheets"
  | "Images"
  | "Photos" // For photo organization
  | "Audio"
  | "Music" // For music organization
  | "Archives"
  | "Code"
  | "Installers"
  | "Ebooks"
  | "Fonts"
  | "Suspicious" // For files flagged by security screening
  | "Quarantine" // For files that failed security screening
  | "Tests" // For test files
  | "Logs" // For log files
  | "Demos" // For demo/sample files
  | "Scripts" // For script files
  | "Others";

export interface CategoryStats {
  count: number;
  total_size: number;
  total_size_readable?: string;
  files: string[];
}

export interface CategorizedResult {
  directory: string;
  categories: Partial<Record<CategoryName, CategoryStats>>;
}

/** Bytes and file count held by one category, plus its share of the total. */
export interface CategoryDiskUsage {
  /**
   * The category name the categorizer returned. A string, not `CategoryName`,
   * because custom rules can introduce categories the union does not list.
   */
  category: string;
  file_count: number;
  total_size: number;
  total_size_readable: string;
  /** Share of the total bytes, rounded to two decimals. */
  percent_of_total: number;
}

/** Per-category breakdown of a scanned set of files. */
export interface DiskUsageSummary {
  total_files: number;
  total_size: number;
  total_size_readable: string;
  /** Largest category first, ties broken by name so output order is stable. */
  categories: CategoryDiskUsage[];
}

export interface DiskUsageResult extends DiskUsageSummary {
  directory: string;
}

// ==================== Content Analysis Types ====================

export interface FileTypeDetection {
  type: string;
  mimeType: string;
  signatures: Buffer[];
  extensions: string[];
  category: ContentCategory;
}

export type ContentCategory =
  | "Document"
  | "Image"
  | "Executable"
  | "Archive"
  | "Audio"
  | "Video"
  | "Code"
  | "Unknown";

export interface FileSignature {
  type: string;
  mimeType: string;
  signatures: Buffer[];
  extensions: string[];
  category: ContentCategory;
  description: string;
  isExecutable: boolean;
}
