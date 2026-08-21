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

// ==================== Content Analysis Types ====================

export interface ContentAnalysisResult {
  filePath: string;
  detectedType: string;
  mimeType: string;
  confidence: number; // 0-1 score
  extensionMatch: boolean;
  warnings: string[];
  scannedAt: Date;
}

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
