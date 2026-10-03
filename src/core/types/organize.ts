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

/**
 * Why a file was left out of duplicate detection.
 *
 * Detection drops files it cannot compare. Every drop is recorded so the
 * caller can tell the user what was NOT analyzed, instead of the analysis
 * looking complete when it is not.
 */
export type SkipReason =
  /** Zero-byte file: content is identical to every other empty file, not a useful duplicate. */
  | "empty_file"
  /** Larger than the configured hash size cap. */
  | "exceeds_size_cap"
  /** Unreadable, or hashing threw. */
  | "hash_failed"
  /** Duplicate analysis ran past its timeout budget. */
  | "timed_out";

export interface SkippedFile {
  path: string;
  name: string;
  size_bytes: number;
  reason: SkipReason;
  /** Human-readable explanation, safe to show a user. */
  detail: string;
}

/**
 * Result of a duplicate scan. `skipped` is always present (possibly empty) so
 * a partial analysis is never reported as a complete one.
 */
export interface DuplicateScan {
  groups: DuplicateGroup[];
  skipped: SkippedFile[];
  /** Total bytes belonging to skipped files — the analysis blind spot. */
  skipped_bytes: number;
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
  /** Files that were not analyzed, with the reason for each. */
  skipped: SkippedFile[];
  skipped_bytes: number;
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

export interface OldFileInfo {
  name: string;
  path: string;
  size: number;
  size_readable: string;
  /** Whole days since the chosen timestamp (mtime by default, atime on request). */
  age_days: number;
  /** The timestamp the age was measured from. */
  accessed_or_modified: string;
}

export interface OldFilesResult {
  directory: string;
  /** Which timestamp the ages were measured from. */
  age_source: "mtime" | "atime";
  older_than_days: number;
  /** Files that matched, before top_n cut the list. */
  total_count: number;
  returned_count: number;
  old_files: OldFileInfo[];
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
  manifestId?: string;
}

export interface PhotoOrganizationResult {
  success: boolean;
  organizedFiles: number;
  skippedFiles: number;
  strippedGPSFiles: number;
  errors: Array<{ file: string; error: string }>;
  structure: Record<string, number>;
  manifestId?: string;
}
