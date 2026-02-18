/**
 * File Organizer MCP Server v3.4.0
 * TypeScript Type Definitions
 */

// ==================== Configuration Types ====================

export interface ServerConfig {
  readonly MAX_FILE_SIZE: number;
  readonly MAX_FILES: number;
  readonly MAX_DEPTH: number;
  readonly VERSION: string;
}

// ==================== File System Types ====================

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  extension: string;
  created: Date;
  modified: Date;
}

export interface BasicFileInfo {
  name: string;
  path: string;
}

export interface FileWithSize {
  name: string;
  path: string;
  size: number;
  modified?: Date;
}

// ==================== Scan Types ====================

export interface ScanOptions {
  includeSubdirs?: boolean;
  maxDepth?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total_count: number;
  returned_count: number;
  offset: number;
  has_more: boolean;
  next_offset?: number;
}

export interface ScanResult extends PaginatedResult<FileInfo> {
  directory: string;
  total_size: number;
  total_size_readable: string;
  screening_report?: unknown;
}

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

export interface FileOrganizerConfig {
  security: {
    maxFileSize: number;
    maxFiles: number;
    maxDepth: number;
    allowedRoots?: string[];
  };
  performance: {
    hashingBatchSize: number;
    scanBatchSize: number;
    enableCaching: boolean;
    cacheMaxAge: number;
  };
  organization: {
    defaultCategories: CategoryDefinition[];
    customRules: CustomRule[];
    conflictResolution: "rename" | "skip" | "error";
  };
  output: {
    defaultFormat: "json" | "markdown";
    includeHiddenFiles: boolean;
    dateFormat: string;
  };
}

export interface ListResult extends PaginatedResult<BasicFileInfo> {
  directory: string;
}

// ==================== Category Types ====================

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

// ==================== Duplicate Types ====================

export interface DuplicateFile {
  name: string;
  path: string;
  size: number;
  modified?: Date;
}

export interface DuplicateGroup {
  hash: string;
  count: number;
  size: string;
  size_bytes: number;
  files: DuplicateFile[];
}

export interface OrganizationPlan {
  moves: {
    source: string;
    destination: string;
    category: string;
    hasConflict: boolean;
    conflictResolution?: "rename" | "skip" | "overwrite" | "overwrite_if_newer";
  }[];
  categoryCounts: Record<string, number>;
  conflicts: Array<{ file: string; reason: string }>;
  skippedFiles: { path: string; reason: string }[];
  estimatedDuration: number;
  warnings: string[];
}

export interface DuplicateResult extends PaginatedResult<DuplicateGroup> {
  directory: string;
  duplicate_groups: number;
  total_duplicate_files: number;
  wasted_space: string;
}

// ==================== Organize Types ====================

export interface OrganizeAction {
  file: string;
  from: string;
  to: string;
  category: CategoryName;
}

export interface OrganizeResult {
  directory: string;
  dry_run: boolean;
  total_files: number;
  statistics: Record<string, number>;
  actions: OrganizeAction[];
  errors: string[];
}

// ==================== Analysis Types ====================

export interface LargestFileInfo {
  name: string;
  path: string;
  size: number;
  size_readable: string;
}

export interface LargestFilesResult {
  directory: string;
  largest_files: LargestFileInfo[];
}

// ==================== Rollback Types ====================

export interface RollbackAction {
  type: "move" | "copy" | "delete" | "rename";
  originalPath: string;
  currentPath?: string; // For moves/copies
  backupPath?: string; // For deletions (where the file is temporarily stored)
  overwrittenBackupPath?: string; // If a move overwrote a file, this is where the ORIGINAL file is stored
  timestamp: number;
}

export interface RollbackManifest {
  id: string; // UUID or timestamp
  timestamp: number;
  description: string;
  actions: RollbackAction[];
  version: "1.0";
  hash?: string;
  signature?: string;
}

// ==================== Tool Types ====================

export interface ToolResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
  [key: string]: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  title?: string;
}

// ==================== Error Types ====================

export interface ValidationErrorDetails {
  field?: string;
  value?: unknown;
  constraint?: string;
}

export class AccessDeniedError extends Error {
  readonly code = "EACCES";
  constructor(
    public readonly requestedPath: string,
    reason = "Path is outside allowed directory",
  ) {
    super(`Access denied: ${reason}`);
    this.name = "AccessDeniedError";
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly details: ValidationErrorDetails = {},
  ) {
    super(message);
    this.name = "ValidationError";
  }
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

export interface ScreenResult {
  filePath: string;
  passed: boolean;
  threatLevel: ThreatLevel;
  detectedType: string;
  declaredExtension: string;
  issues: ScreenIssue[];
  timestamp: Date;
}

export type ThreatLevel = "none" | "low" | "medium" | "high" | "critical";

export interface ScreenIssue {
  type: IssueType;
  severity: "warning" | "error";
  message: string;
  details?: Record<string, unknown>;
}

export type IssueType =
  | "extension_mismatch"
  | "executable_disguised"
  | "suspicious_pattern"
  | "unknown_type"
  | "malicious_content"
  | "policy_violation";

export interface ContentScreeningConfig {
  checkExtensionMismatch: boolean;
  checkExecutableContent: boolean;
  checkSuspiciousPatterns: boolean;
  strictMode: boolean;
  allowedTypes?: string[];
  blockedTypes?: string[];
}

export interface FileSignature {
  type: string;
  mimeType: string;
  signatures: Buffer[];
  extensions: string[];
  category: ContentCategory;
  description: string;
  isExecutable: boolean;
}

// ==================== Metadata Extraction Types ====================

// Audio Metadata Types
export interface AudioMetadata {
  filePath: string;
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  composer?: string;
  genre?: string;
  year?: number;
  trackNumber?: number;
  totalTracks?: number;
  discNumber?: number;
  totalDiscs?: number;
  duration?: number;
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
  format: string;
  hasEmbeddedArtwork: boolean;
  extractedAt: Date;
}

export interface AudioMetadataOptions {
  extractArtwork?: boolean;
  extractLyrics?: boolean;
  cacheResults?: boolean;
}

export interface MusicOrganizationConfig {
  sourceDir: string;
  targetDir: string;
  structure: "artist/album" | "album" | "genre/artist" | "flat";
  filenamePattern: "{track} - {title}" | "{artist} - {title}" | "{title}";
  copyInsteadOfMove?: boolean;
  skipIfMissingMetadata?: boolean;
  variousArtistsAlbumName?: string;
}

// Image Metadata Types
export interface ImageMetadata {
  filePath: string;
  format: string;
  cameraMake?: string;
  cameraModel?: string;
  lensModel?: string;
  dateTaken?: Date;
  iso?: number;
  focalLength?: number;
  aperture?: number;
  shutterSpeed?: string;
  exposureCompensation?: number;
  flash?: boolean;
  orientation?: number;
  width?: number;
  height?: number;
  resolution?: number;
  colorSpace?: string;
  hasGPS: boolean;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  gpsTimestamp?: Date;
  software?: string;
  dateModified?: Date;
  dateCreated?: Date;
  extractedAt: Date;
}

export interface ImageMetadataOptions {
  extractGPS?: boolean;
  stripGPS?: boolean;
  extractThumbnail?: boolean;
}

export interface PhotoOrganizationConfig {
  sourceDir: string;
  targetDir: string;
  dateFormat: "YYYY/MM/DD" | "YYYY-MM-DD" | "YYYY/MM" | "YYYY";
  useDateCreated?: boolean;
  groupByCamera?: boolean;
  copyInsteadOfMove?: boolean;
  stripGPS?: boolean;
  unknownDateFolder?: string;
}

// Metadata Cache Types
export interface MetadataCache {
  version: string;
  createdAt: Date;
  updatedAt: Date;
  entries: MetadataCacheEntry[];
}

export interface MetadataCacheEntry {
  filePath: string;
  fileHash: string; // For cache invalidation
  lastModified: number;
  audioMetadata?: AudioMetadata;
  imageMetadata?: ImageMetadata;
  cachedAt: Date;
}

export interface MetadataCacheOptions {
  cacheDir?: string;
  maxAge?: number; // milliseconds
  maxEntries?: number;
}

// Organization Result Types
export interface MusicOrganizationResult {
  success: boolean;
  organizedFiles: number;
  skippedFiles: number;
  errors: Array<{ file: string; error: string }>;
  structure: Record<string, string[]>;
}

export interface PhotoOrganizationResult {
  success: boolean;
  organizedFiles: number;
  skippedFiles: number;
  strippedGPSFiles: number;
  errors: Array<{ file: string; error: string }>;
  structure: Record<string, number>;
}

// ==================== History Logging Types ====================

export interface HistoryEntry {
  id: string;
  timestamp: string;
  operation: string;
  source: "manual" | "scheduled";
  status: "success" | "error" | "partial";
  durationMs: number;
  filesProcessed?: number;
  filesSkipped?: number;
  details?: string;
  error?: {
    message: string;
    code?: string;
  };
}

export interface HistoryQuery {
  limit?: number;
  since?: string;
  until?: string;
  operation?: string;
  status?: "success" | "error" | "partial";
  source?: "manual" | "scheduled";
}

export interface HistoryResult {
  entries: HistoryEntry[];
  total: number;
  hasMore: boolean;
}

// ==================== System Organize Types ====================

export interface SystemDirs {
  music: string;
  documents: string;
  pictures: string;
  videos: string;
  downloads: string;
  desktop: string;
  temp: string;
}

export interface SystemOrganizeOptions {
  sourceDir: string;
  useSystemDirs?: boolean;
  createSubfolders?: boolean;
  fallbackToLocal?: boolean;
  localFallbackPrefix?: string;
  conflictStrategy?: "skip" | "rename" | "overwrite";
  dryRun?: boolean;
  copyInsteadOfMove?: boolean;
}

export interface SystemOrganizeResult {
  movedToSystem: number;
  organizedLocally: number;
  failed: number;
  details: Array<{
    file: string;
    destination: "system" | "local";
    targetPath: string;
    category: string;
  }>;
  undoManifest?: {
    manifestId: string;
    operations: Array<{ from: string; to: string; timestamp: string }>;
  };
}

export type PrivacyMode = "full" | "redacted" | "none";

// ==================== Smart Suggest Types ====================

export interface DirectoryHealthReport {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  metrics: {
    fileTypeEntropy: { score: number; details: string };
    namingConsistency: { score: number; details: string };
    depthBalance: { score: number; details: string };
    duplicateRatio: { score: number; details: string };
    misplacedFiles: { score: number; details: string };
  };
  suggestions: Array<{
    priority: "high" | "medium" | "low";
    message: string;
    suggestedTool?: string;
    suggestedArgs?: Record<string, unknown>;
  }>;
  quickWins?: Array<{
    action: string;
    estimatedScoreImprovement: number;
    tool: string;
    args: Record<string, unknown>;
  }>;
}

export interface SmartSuggestOptions {
  includeSubdirs?: boolean;
  includeDuplicates?: boolean;
  maxFiles?: number;
  timeoutSeconds?: number;
  sampleRate?: number;
  useCache?: boolean;
}
