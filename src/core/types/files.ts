/**
 * File System + Scan Types
 * Core file info, scan results, and organizer config
 */

import type { CategoryDefinition, CustomRule } from "./categories.js";
import type { ScreeningReport } from "./system.js";

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
  screening_report?: ScreeningReport;
}

export interface ListResult extends PaginatedResult<BasicFileInfo> {
  directory: string;
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
