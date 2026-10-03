/**
 * File System + Scan Types
 * Core file info, scan results, and organizer config
 */

import type { CategoryDefinition, CustomRule } from "./categories.js";

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
  /** Last access time. Absent when the producer did not stat the file. */
  accessed?: Date;
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
}

export interface ListResult extends PaginatedResult<BasicFileInfo> {
  directory: string;
}

/** Why a symlink was reported by the symlink audit. */
export type SymlinkIssueKind =
  /** The link's target does not exist. */
  | "dangling"
  /** The target exists but resolves outside the allowed directories. */
  | "escapes_allowed_roots"
  /** The link chain loops, so the target cannot be resolved at all. */
  | "circular";

export interface BrokenSymlinkFinding {
  /** The link itself, not its target. */
  path: string;
  /** Raw link value as stored on disk, so relative links stay readable. */
  link_target: string;
  kind: SymlinkIssueKind;
  detail: string;
  /**
   * Canonical absolute form of the target. Absent when the target could not be
   * resolved at all (a loop).
   */
  resolved_target?: string;
}

export interface BrokenSymlinkResult {
  directory: string;
  /** Symlinks examined. Not full coverage on its own — read `truncated`. */
  scanned_count: number;
  /** True when a subdirectory past the configured max scan depth was not walked. */
  truncated: boolean;
  total_count: number;
  dangling_count: number;
  escaping_count: number;
  circular_count: number;
  findings: BrokenSymlinkFinding[];
}

export interface EmptyDirectoryResult {
  /** The root that was walked. */
  directory: string;
  /** Directories whose entries were listed. */
  scanned_count: number;
  /** True when a subdirectory past the depth cap was not walked. */
  depth_limited: boolean;
  /** True when the result cap left a subdirectory unexplored. */
  result_limited: boolean;
  /** The result cap that applied, so the caller knows what bounded the list. */
  limit: number;
  /** Empty directories found. Sorted, so the order is stable. */
  total_count: number;
  empty_dirs: string[];
}

/** What kind of personal data a finding carries. Groups the EXIF tags. */
export type SensitiveFindingKind =
  /** Exact coordinates written by the camera. */
  | "gps_coordinates"
  /** Height above sea level, which helps reconstruct a place. */
  | "gps_altitude"
  /** When the GPS fix was taken. */
  | "gps_timestamp"
  /** A human name the camera owner stored. */
  | "owner_name"
  /** A camera or lens serial number, which identifies the physical device. */
  | "serial_number"
  /** Make/model strings that fingerprint the device and its software. */
  | "camera_device"
  /** A copyright line, which usually carries a name. */
  | "copyright"
  /** Editing or capture software, which can carry a user name. */
  | "software"
  /** Free-text notes, descriptions, or titles written by a person. */
  | "notes_or_comment";

/** Banded form of the 0-100 risk score, so callers do not hardcode cutoffs. */
export type SensitiveRiskLevel = "none" | "low" | "medium" | "high";

/** One EXIF tag that contributed to a file's risk score. */
export interface SensitiveReason {
  kind: SensitiveFindingKind;
  /** Points this reason added to the file's score. Sums to `risk_score`. */
  weight: number;
  /** Plain-English statement of what was found. */
  detail: string;
  /** The EXIF tag names behind this reason, so it can be traced to the file. */
  exif_tags: string[];
  /**
   * The detected value, capped in length. Present when the tag holds a simple
   * string or number, absent for structured tags this tool only detects the
   * presence of. Treat the scan output itself as sensitive.
   */
  value?: string;
}

/** Risk assessment for one file that carried analyzable metadata. */
export interface SensitiveFileFinding {
  path: string;
  name: string;
  /** Detected image format, e.g. `jpeg` or `tiff`. */
  format: string;
  /** 0 (nothing found) to 100 (capped). */
  risk_score: number;
  risk_level: SensitiveRiskLevel;
  /** Empty when nothing was found, so `risk_score` is 0. */
  reasons: SensitiveReason[];
}

/** A file the scan could not analyze, and why. */
export interface SensitiveSkippedFile {
  path: string;
  name: string;
  reason: "format_not_analyzed" | "unreadable";
  detail: string;
}

export interface SensitiveScanResult {
  directory: string;
  /** Files whose metadata was actually parsed. Not full coverage — read `limits`. */
  scanned_count: number;
  /** Files present but outside what this scan can analyze. */
  skipped_count: number;
  /** Scanned files carrying at least one finding. */
  flagged_count: number;
  /** Highest score seen, or 0 when nothing was scanned. */
  highest_risk_score: number;
  /** True when a subdirectory past the configured max scan depth was not walked. */
  truncated: boolean;
  /** Sorted by risk_score descending, then by path. */
  files: SensitiveFileFinding[];
  skipped: SensitiveSkippedFile[];
  /**
   * The coverage caveat, carried on every response so a caller that reads only
   * the findings still sees that a clean result is not a safe-to-share result.
   */
  limits: string[];
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
