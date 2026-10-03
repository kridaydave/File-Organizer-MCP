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
