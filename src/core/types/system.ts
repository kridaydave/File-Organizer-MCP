/**
 * System Types
 * History, rollback, metadata extraction, health and privacy
 */

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
    suggestedArgs?: Record<string, unknown>; // Validated by caller
  }>;
  quickWins?: Array<{
    action: string;
    estimatedScoreImprovement: number;
    tool: string;
    args: Record<string, unknown>; // Validated via Zod schema in tool handlers
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
