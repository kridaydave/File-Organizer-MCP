/**
 * Organize Types
 * Duplicate detection, organization plans/results, and content organization
 */

import type { CategoryName } from "./categories.js";
import type { PaginatedResult } from "./files.js";

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
  errorCount: number;
  successCount: number;
  aborted: boolean;
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

// ==================== Music / Photo Organization Configs ====================

export interface MusicOrganizationConfig {
  sourceDir: string;
  targetDir: string;
  structure: "artist/album" | "album" | "genre/artist" | "flat";
  filenamePattern: "{track} - {title}" | "{artist} - {title}" | "{title}";
  copyInsteadOfMove?: boolean;
  skipIfMissingMetadata?: boolean;
  variousArtistsAlbumName?: string;
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
