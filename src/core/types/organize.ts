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

// ==================== Plan Validation Types ====================

export type PlanFindingKind =
  /** Two or more sources resolved to one destination name. */
  | "destination_name_collision"
  /** A planned destination is already occupied on disk. */
  | "destination_exists"
  /** Source and destination sit on different devices. */
  | "cross_device_move"
  /** The sensitive-file gate would refuse this source. */
  | "sensitive_source"
  /** The planner gave up part-way, so this plan is not the whole run. */
  | "incomplete_plan";

export type PlanFindingSeverity = "error" | "warning";

export interface PlanFinding {
  kind: PlanFindingKind;
  severity: PlanFindingSeverity;
  /** Files involved, in plan order. */
  sources: string[];
  /** Destinations involved, in plan order. */
  destinations: string[];
  detail: string;
}

export interface PlanValidationResult {
  directory: string;
  /** False when any finding has severity `error`. */
  ok: boolean;
  moves_checked: number;
  counts: {
    error: number;
    warning: number;
  };
  findings: PlanFinding[];
  /** What this check actually looked at. */
  checked: string[];
  /** What it did not look at, so a clean run is not read as a guarantee. */
  not_checked: string[];
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
  /**
   * Rollback manifest id for this batch, as a wire field (`manifest_id`, not
   * `manifestId`). Absent on a dry run and when no manifest could be written.
   * It is the id `undo_last_operation` takes, so returning it is what makes a
   * later selective undo reachable at all.
   */
  manifest_id?: string;
}

// ==================== Quarantine Types ====================

/**
 * One file in a quarantine or restore report. `from` is where the file was
 * read from, `to` is where it was (or would be) written, so the same shape
 * describes both directions.
 */
export interface QuarantineItem {
  file: string;
  from: string;
  to: string;
}

export interface QuarantineResult {
  /** Validated directory the files were taken from. */
  directory: string;
  /** Validated directory the files were (or would be) moved into. */
  quarantine_dir: string;
  dry_run: boolean;
  /** How many file paths the caller asked for. */
  requested: number;
  /** How many files have a destination. On a dry run this is the whole plan. */
  planned: number;
  /** Files actually moved. Always 0 on a dry run. */
  quarantined: number;
  /** The plan on a dry run, the moves that landed otherwise. */
  items: QuarantineItem[];
  skipped: { path: string; reason: string }[];
  errors: string[];
  /** Rollback manifest covering the moves, so undo_last_operation can reverse them. */
  manifest_id?: string;
  /** Caller-supplied note recorded in the manifest description. */
  reason?: string;
}

export interface RestoreResult {
  dry_run: boolean;
  /** Quarantine manifest this restore reads. */
  quarantine_id: string;
  /** Moves recorded in that manifest. */
  requested: number;
  planned: number;
  /** Files actually put back. Always 0 on a dry run. */
  restored: number;
  /** The plan on a dry run, the moves that landed otherwise. */
  items: QuarantineItem[];
  errors: string[];
  /** Rollback manifest covering the restore, so the restore is itself undoable. */
  manifest_id?: string;
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
