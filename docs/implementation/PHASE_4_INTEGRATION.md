# Phase 4 - Integration Implementation Plan

**Version:** 3.4.1  
**Status:** Draft  
**Priority:** CRITICAL  
**Dependencies:** Phase 1 (History Logging), Phase 2 (Content Organization), Phase 3 (Security Enhancements)

---

## Executive Summary

This phase addresses all integration-related CRITICAL and HIGH issues identified during the Multi-Shepherd Debate framework. It ensures seamless integration of History Logging, Content Organization, and Security enhancements into the existing codebase with standardized patterns, correct registration sequences, and comprehensive test coverage.

---

## Issues Addressed

### CRITICAL Issues

| ID   | Severity | Issue                             | Description                                                             | Resolution                                         |
| ---- | -------- | --------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------- |
| I-C1 | CRITICAL | Server.ts tool registration       | Tools registered at incorrect line locations causing handler mismatches | Correct switch case placement with proper ordering |
| I-C2 | CRITICAL | Tool import pattern inconsistency | Mixed import patterns between definition-first and handler-first        | Standardize on unified export pattern              |

### HIGH Issues

| ID   | Severity | Issue                            | Description                                                      | Resolution                                        |
| ---- | -------- | -------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------- |
| I-H1 | HIGH     | Config.ts naming conflicts       | HISTORY_CONFIG vs existing CONFIG constant collision             | Namespace isolation with descriptive prefixes     |
| I-H2 | HIGH     | Service instantiation pattern    | Inconsistent singleton vs new instance creation                  | Standardized singleton pattern with getInstance() |
| I-H3 | HIGH     | History Logging dependency order | Circular dependencies between HistoryLoggerService and server.ts | Lazy initialization with dependency injection     |

### MEDIUM/LOW Issues

| ID   | Severity | Issue                    | Description                                    | Resolution                                      |
| ---- | -------- | ------------------------ | ---------------------------------------------- | ----------------------------------------------- |
| I-M1 | MEDIUM   | Tool definition ordering | Tools not grouped logically in TOOLS array     | Group by functional category                    |
| I-M2 | MEDIUM   | Missing type exports     | History types not exported from types.ts       | Add comprehensive type exports                  |
| I-M3 | MEDIUM   | Error code collisions    | History error codes may conflict with existing | Use HISTORY\_ prefix                            |
| I-L1 | LOW      | Import path consistency  | Relative vs absolute import inconsistencies    | Standardize relative imports with .js extension |
| I-L2 | LOW      | JSDoc version headers    | Inconsistent version strings in file headers   | Standardize to 3.4.1                           |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         INTEGRATION ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         server.ts                                    │   │
│  │  ┌───────────────────────────────────────────────────────────────┐ │   │
│  │  │ handleToolCall()                                               │ │   │
│  │  │   ├── Rate Limiter (lines 101-119)                             │ │   │
│  │  │   ├── History Logger Initialization (lazy)                     │ │   │
│  │  │   ├── Switch Cases (alphabetical order)                        │ │   │
│ │  │   │   ├── file_organizer_batch_read_files   (line ~245)         │ │   │
│  │  │   │   ├── file_organizer_organize_by_content (line ~285)      │ │   │
│  │  │   │   ├── file_organizer_organize_music     (line ~290)       │ │   │
│  │  │   │   ├── file_organizer_organize_photos    (line ~295)       │ │   │
│  │  │   │   ├── file_organizer_organize_smart     (line ~300)       │ │   │
│  │  │   │   └── file_organizer_view_history       (line ~345)       │ │   │
│  │  │   └── History Logging (finally block)                        │ │   │
│  │  └───────────────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      tools/index.ts                                  │   │
│  │  ┌───────────────────────────────────────────────────────────────┐ │   │
│  │  │ Unified Export Pattern                                         │ │   │
│  │  │   ├── Export definitions + handlers + schemas together         │ │   │
│  │  │   ├── TOOLS array (grouped by category)                        │ │   │
│  │  │   └── Type exports for all inputs                              │ │   │
│  │  └───────────────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      types.ts                                        │   │
│  │  ┌───────────────────────────────────────────────────────────────┐ │   │
│  │  │ History Logging Types                                          │ │   │
│  │  │   ├── HistoryEntry                                             │ │   │
│  │  │   ├── HistoryQuery                                             │ │   │
│  │  │   ├── HistoryResult                                            │ │   │
│  │  │   ├── HistoryFileMetadata                                      │ │   │
│  │  │   ├── PrivacyMode                                              │ │   │
│  │  │   ├── HistoryLoggerError                                       │ │   │
│  │  │   └── HistoryErrorCode                                         │ │   │
│  │  └───────────────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      config.ts                                       │   │
│  │  ┌───────────────────────────────────────────────────────────────┐ │   │
│  │  │ Configuration Constants                                        │ │   │
│  │  │   ├── CONFIG (existing)                                        │ │   │
│  │  │   ├── HISTORY_CONFIG (new - isolated namespace)                │ │   │
│  │  │   └── getHistoryFilePath() and related functions               │ │   │
│  │  └───────────────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │              services/history-logger.service.ts                      │   │
│  │  ┌───────────────────────────────────────────────────────────────┐ │   │
│  │  │ Singleton Pattern                                              │ │   │
│  │  │   ├── private static instance                                  │ │   │
│  │  │   ├── private constructor                                      │ │   │
│  │  │   └── static getInstance()                                     │ │   │
│  │  └───────────────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Server.ts Integration (I-C1)

### 1.1 Correct Tool Registration Locations

The switch statement in `handleToolCall()` must maintain alphabetical ordering within functional groups for maintainability.

#### File: `src/server.ts`

**Import Section (lines 1-40):**

```typescript
/**
 * File Organizer MCP Server 3.4.1
 * Server Initialization with History Logging Integration
 *
 * @module server
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { CONFIG } from "./config.js";
import {
  TOOLS,
  handleListFiles,
  handleScanDirectory,
  handleCategorizeByType,
  handleFindLargestFiles,
  handleFindDuplicateFiles,
  handleOrganizeFiles,
  handlePreviewOrganization,
  handleGetCategories,
  handleSetCustomRules,
  handleAnalyzeDuplicates,
  handleDeleteDuplicates,
  handleUndoLastOperation,
  handleBatchRename,
  handleInspectMetadata,
  handleWatchDirectory,
  handleUnwatchDirectory,
  handleListWatches,
  handleReadFile,
  handleOrganizeMusic,
  handleOrganizePhotos,
  handleOrganizeByContent,
  handleOrganizeSmart,
  handleBatchReadFiles,
  handleViewHistory, // NEW: History viewing tool
} from "./tools/index.js";
import { sanitizeErrorMessage } from "./utils/error-handler.js";
import { logger } from "./utils/logger.js";
import { HistoryLoggerService } from "./services/history-logger.service.js"; // NEW
```

**Service Instantiation (after imports, before handlers):**

```typescript
// ==================== Service Singletons ====================

import { RateLimiter } from "./services/security/rate-limiter.service.js";

const rateLimiter = new RateLimiter();

// Lazy initialization of HistoryLoggerService (I-H3)
let historyLoggerInstance: HistoryLoggerService | null = null;

function getHistoryLogger(): HistoryLoggerService {
  if (!historyLoggerInstance) {
    historyLoggerInstance = HistoryLoggerService.getInstance();
  }
  return historyLoggerInstance;
}
```

**Switch Statement Structure (lines 136-250):**

```typescript
async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<MCPToolResponse> {
  // Apply Rate Limiter to heavy scanning tools
  if (
    name.includes("scan") ||
    name.includes("list_files") ||
    name.includes("find_largest") ||
    name.includes("find_duplicate")
  ) {
    const limit = rateLimiter.checkLimit("scan_operations");
    if (!limit.allowed) {
      return {
        content: [
          {
            type: "text",
            text: `Rate limit exceeded. Please wait ${limit.resetIn} seconds.`,
          },
        ],
        isError: true,
      };
    }
  }

  // Operation tracking for history logging
  const startTime = Date.now();
  let success = false;
  let error: string | undefined;
  let resultSummary: string | undefined;

  try {
    let response: MCPToolResponse;

    // ==================== SWITCH CASES (ALPHABETICAL ORDER) ====================

    switch (name) {
      // -------------------- B: Batch Operations --------------------
      case "file_organizer_batch_read_files":
        response = await handleBatchReadFiles(args);
        break;
      case "file_organizer_batch_rename":
        response = await handleBatchRename(args);
        break;

      // -------------------- C: Categorization --------------------
      case "file_organizer_categorize_by_type":
        response = await handleCategorizeByType(args);
        break;

      // -------------------- D: Duplicate Management --------------------
      case "file_organizer_analyze_duplicates":
        response = await handleAnalyzeDuplicates(args);
        break;
      case "file_organizer_delete_duplicates":
        response = await handleDeleteDuplicates(args);
        break;
      case "file_organizer_find_duplicate_files":
        response = await handleFindDuplicateFiles(args);
        break;

      // -------------------- F: File Analysis --------------------
      case "file_organizer_find_largest_files":
        response = await handleFindLargestFiles(args);
        break;
      case "file_organizer_inspect_metadata":
        response = await handleInspectMetadata(args);
        break;

      // -------------------- G: Get/Set Operations --------------------
      case "file_organizer_get_categories":
        response = await handleGetCategories(args);
        break;

      // -------------------- L: Listing --------------------
      case "file_organizer_list_files":
        response = await handleListFiles(args);
        break;
      case "file_organizer_list_watches":
        response = await handleListWatches(args);
        break;

      // -------------------- O: Organization --------------------
      case "file_organizer_organize_by_content":
        response = await handleOrganizeByContent(args);
        break;
      case "file_organizer_organize_files":
        response = await handleOrganizeFiles(args);
        break;
      case "file_organizer_organize_music":
        response = await handleOrganizeMusic(args);
        break;
      case "file_organizer_organize_photos":
        response = await handleOrganizePhotos(args);
        break;
      case "file_organizer_organize_smart":
        response = await handleOrganizeSmart(args);
        break;

      // -------------------- P: Preview --------------------
      case "file_organizer_preview_organization":
        response = await handlePreviewOrganization(args);
        break;

      // -------------------- R: Read Operations --------------------
      case "file_organizer_read_file":
        response = await handleReadFile(args);
        break;

      // -------------------- S: Scan & Set --------------------
      case "file_organizer_scan_directory":
        response = await handleScanDirectory(args);
        break;
      case "file_organizer_set_custom_rules":
        response = await handleSetCustomRules(args);
        break;

      // -------------------- U: Undo/Unwatch --------------------
      case "file_organizer_undo_last_operation":
        response = await handleUndoLastOperation(args);
        break;
      case "file_organizer_unwatch_directory":
        response = await handleUnwatchDirectory(args);
        break;

      // -------------------- V: View/Watch --------------------
      case "file_organizer_view_history": // NEW: History viewing
        response = await handleViewHistory(args);
        break;
      case "file_organizer_watch_directory":
        response = await handleWatchDirectory(args);
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    success = true;

    // Extract result summary for history logging
    if (response.content[0]?.text) {
      resultSummary = response.content[0].text.substring(0, 500);
    }

    return response;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    // ==================== History Logging (Non-blocking) ====================
    const durationMs = Date.now() - startTime;

    // Log operation asynchronously - failures don't break main operation
    getHistoryLogger()
      .logOperation(name, args, success, durationMs, error, resultSummary)
      .catch((logError) => {
        logger.error("[AUDIT] Failed to log operation to history", {
          tool: name,
          error:
            logError instanceof Error ? logError.message : String(logError),
        });
      });
  }
}
```

---

## 2. Tool Import Pattern Standardization (I-C2)

### 2.1 Unified Export Pattern

All tools must follow the same export pattern: definition, handler, and schema exported together.

#### File: `src/tools/index.ts`

**Reorganized Import/Export Structure:**

```typescript
/**
 * File Organizer MCP Server 3.4.1
 * Tools Registry with Standardized Export Pattern
 *
 * @module tools
 * @description Central registry with unified export pattern for all MCP tools.
 * All tools export: definition, handler, schema, and types together.
 */

import type { ToolDefinition } from "../types.js";

// ==================== CATEGORY A: File Operations ====================

export {
  listFilesToolDefinition,
  handleListFiles,
  ListFilesInputSchema,
} from "./file-listing.js";
export type { ListFilesInput } from "./file-listing.js";

export {
  scanDirectoryToolDefinition,
  handleScanDirectory,
  ScanDirectoryInputSchema,
} from "./file-scanning.js";
export type { ScanDirectoryInput } from "./file-scanning.js";

export {
  categorizeByTypeToolDefinition,
  handleCategorizeByType,
  CategorizeByTypeInputSchema,
} from "./file-categorization.js";
export type { CategorizeByTypeInput } from "./file-categorization.js";

// ==================== CATEGORY B: Analysis & Metadata ====================

export {
  findLargestFilesToolDefinition,
  handleFindLargestFiles,
  FindLargestFilesInputSchema,
} from "./file-analysis.js";
export type { FindLargestFilesInput } from "./file-analysis.js";

export {
  inspectMetadataToolDefinition,
  handleInspectMetadata,
  InspectMetadataInputSchema,
} from "./metadata-inspection.js";
export type { InspectMetadataInput } from "./metadata-inspection.js";

// ==================== CATEGORY C: Duplicate Management ====================

export {
  findDuplicateFilesToolDefinition,
  handleFindDuplicateFiles,
  FindDuplicateFilesInputSchema,
} from "./file-duplicates.js";
export type { FindDuplicateFilesInput } from "./file-duplicates.js";

export {
  analyzeDuplicatesToolDefinition,
  handleAnalyzeDuplicates,
  AnalyzeDuplicatesInputSchema,
  deleteDuplicatesToolDefinition,
  handleDeleteDuplicates,
  DeleteDuplicatesInputSchema,
} from "./duplicate-management.js";
export type {
  AnalyzeDuplicatesInput,
  DeleteDuplicatesInput,
} from "./duplicate-management.js";

// ==================== CATEGORY D: Organization ====================

export {
  organizeFilesToolDefinition,
  handleOrganizeFiles,
  OrganizeFilesInputSchema,
} from "./file-organization.js";
export type { OrganizeFilesInput } from "./file-organization.js";

export {
  previewOrganizationToolDefinition,
  handlePreviewOrganization,
  PreviewOrganizationInputSchema,
} from "./organization-preview.js";
export type { PreviewOrganizationInput } from "./organization-preview.js";

export {
  organizeByContentToolDefinition,
  handleOrganizeByContent,
  OrganizeByContentInputSchema,
} from "./content-organization.js";
export type { OrganizeByContentInput } from "./content-organization.js";

export {
  organizeSmartToolDefinition,
  handleOrganizeSmart,
  OrganizeSmartInputSchema,
} from "./smart-organization.js";
export type { OrganizeSmartInput } from "./smart-organization.js";

// ==================== CATEGORY E: Media Organization ====================

export {
  organizeMusicToolDefinition,
  handleOrganizeMusic,
  OrganizeMusicInputSchema,
} from "./music-organization.js";
export type { OrganizeMusicInput } from "./music-organization.js";

export {
  organizePhotosToolDefinition,
  handleOrganizePhotos,
  OrganizePhotosInputSchema,
} from "./photo-organization.js";
export type { OrganizePhotosInput } from "./photo-organization.js";

// ==================== CATEGORY F: File Management ====================

export {
  getCategoriesToolDefinition,
  handleGetCategories,
  GetCategoriesInputSchema,
  setCustomRulesToolDefinition,
  handleSetCustomRules,
  SetCustomRulesInputSchema,
} from "./file-management.js";
export type {
  GetCategoriesInput,
  SetCustomRulesInput,
} from "./file-management.js";

export {
  batchRenameToolDefinition,
  handleBatchRename,
  BatchRenameInputSchema,
} from "./file-renaming.js";
export type { BatchRenameInput } from "./file-renaming.js";

export {
  undoLastOperationToolDefinition,
  handleUndoLastOperation,
  UndoLastOperationInputSchema,
} from "./rollback.js";
export type { UndoLastOperationInput } from "./rollback.js";

// ==================== CATEGORY G: Batch Reading ====================

export {
  batchReadFilesToolDefinition,
  handleBatchReadFiles,
  BatchReadFilesInputSchema,
} from "./batch-file-reader.js";
export type {
  BatchReadFilesInput,
  FileReadResult,
} from "./batch-file-reader.js";

export {
  fileReaderToolDefinition,
  handleReadFile,
  ReadFileInputSchema,
} from "./file-reader.tool.js";
export type { ReadFileInput } from "./file-reader.tool.js";

// ==================== CATEGORY H: Watch Operations ====================

export {
  watchDirectoryToolDefinition,
  handleWatchDirectory,
  WatchDirectoryInputSchema,
  unwatchDirectoryToolDefinition,
  handleUnwatchDirectory,
  UnwatchDirectoryInputSchema,
  listWatchesToolDefinition,
  handleListWatches,
  ListWatchesInputSchema,
} from "./watch.tool.js";
export type {
  WatchDirectoryInput,
  UnwatchDirectoryInput,
  ListWatchesInput,
} from "./watch.tool.js";

// ==================== CATEGORY I: History Logging (NEW) ====================

export {
  viewHistoryToolDefinition,
  handleViewHistory,
  ViewHistoryInputSchema,
} from "./view-history.js";
export type { ViewHistoryInput } from "./view-history.js";

// ==================== Tool Registry Array ====================

// Import all definitions for TOOLS array
import { listFilesToolDefinition } from "./file-listing.js";
import { scanDirectoryToolDefinition } from "./file-scanning.js";
import { categorizeByTypeToolDefinition } from "./file-categorization.js";
import { findLargestFilesToolDefinition } from "./file-analysis.js";
import { findDuplicateFilesToolDefinition } from "./file-duplicates.js";
import { organizeFilesToolDefinition } from "./file-organization.js";
import { previewOrganizationToolDefinition } from "./organization-preview.js";
import { organizeMusicToolDefinition } from "./music-organization.js";
import { organizePhotosToolDefinition } from "./photo-organization.js";
import { organizeByContentToolDefinition } from "./content-organization.js";
import { organizeSmartToolDefinition } from "./smart-organization.js";
import { batchReadFilesToolDefinition } from "./batch-file-reader.js";
import {
  getCategoriesToolDefinition,
  setCustomRulesToolDefinition,
} from "./file-management.js";
import {
  analyzeDuplicatesToolDefinition,
  deleteDuplicatesToolDefinition,
} from "./duplicate-management.js";
import { undoLastOperationToolDefinition } from "./rollback.js";
import { batchRenameToolDefinition } from "./file-renaming.js";
import { inspectMetadataToolDefinition } from "./metadata-inspection.js";
import {
  watchDirectoryToolDefinition,
  unwatchDirectoryToolDefinition,
  listWatchesToolDefinition,
} from "./watch.tool.js";
import { fileReaderToolDefinition } from "./file-reader.tool.js";
import { viewHistoryToolDefinition } from "./view-history.js"; // NEW

/**
 * All available tools for MCP registration
 * Grouped by functional category for clarity
 */
export const TOOLS: ToolDefinition[] = [
  // --- File Operations (A) ---
  listFilesToolDefinition,
  scanDirectoryToolDefinition,
  categorizeByTypeToolDefinition,

  // --- Analysis & Metadata (B) ---
  findLargestFilesToolDefinition,
  inspectMetadataToolDefinition,

  // --- Duplicate Management (C) ---
  findDuplicateFilesToolDefinition,
  analyzeDuplicatesToolDefinition,
  deleteDuplicatesToolDefinition,

  // --- Organization (D) ---
  organizeFilesToolDefinition,
  previewOrganizationToolDefinition,
  organizeByContentToolDefinition,
  organizeSmartToolDefinition,

  // --- Media Organization (E) ---
  organizeMusicToolDefinition,
  organizePhotosToolDefinition,

  // --- File Management (F) ---
  getCategoriesToolDefinition,
  setCustomRulesToolDefinition,
  batchRenameToolDefinition,
  undoLastOperationToolDefinition,

  // --- Batch Reading (G) ---
  batchReadFilesToolDefinition,
  fileReaderToolDefinition,

  // --- Watch Operations (H) ---
  watchDirectoryToolDefinition,
  unwatchDirectoryToolDefinition,
  listWatchesToolDefinition,

  // --- History Logging (I) ---
  viewHistoryToolDefinition, // NEW
];
```

---

## 3. Config.ts Naming Conflicts Resolution (I-H1)

### 3.1 Namespace Isolation Strategy

Avoid naming collisions by using descriptive prefixes for all new configuration constants.

#### File: `src/config.ts`

**New Configuration Structure:**

```typescript
/**
 * File Organizer MCP Server 3.4.1
 * Configuration with History Logging Support
 *
 * Secure defaults with platform-aware directory access
 */

import os from "os";
import path from "path";
import fs from "fs";
import { logger } from "./utils/logger.js";

// ==================== Core Configuration ====================

export const CONFIG = {
  VERSION: "3.4.1", // Updated for new release

  // Security Settings
  security: {
    enablePathValidation: true,
    allowCustomDirectories: true,
    logAccess: true,
    maxScanDepth: 10,
    maxFilesPerOperation: 10000,
  },

  // Path Access Control
  paths: {
    defaultAllowed: getDefaultAllowedDirs(),
    customAllowed: loadCustomAllowedDirs(),
    alwaysBlocked: getAlwaysBlockedPatterns(),
  },
} as const;

// ==================== History Logging Configuration (NEW) ====================

/**
 * History logging configuration constants
 * Addresses I-H1: Isolated namespace prevents collision with CONFIG
 */
export const HISTORY_LOGGING_CONFIG = {
  /** Maximum file size before rotation (10MB) */
  MAX_SIZE_BYTES: 10 * 1024 * 1024,
  /** Maximum entries before rotation */
  MAX_ENTRIES: 10000,
  /** Number of backup files to keep */
  ROTATION_COUNT: 5,
  /** Maximum retry attempts for disk full */
  MAX_RETRY_ATTEMPTS: 3,
  /** Initial retry delay in milliseconds */
  RETRY_DELAY_MS: 100,
  /** Maximum retry delay in milliseconds */
  MAX_RETRY_DELAY_MS: 5000,
  /** Lock file timeout in milliseconds */
  LOCK_TIMEOUT_MS: 5000,
  /** Maximum result summary length */
  MAX_SUMMARY_LENGTH: 500,
  /** History file version */
  FILE_VERSION: "1.0",
} as const;

// Type exports for configuration
export type HistoryLoggingConfig = typeof HISTORY_LOGGING_CONFIG;

// ==================== User Configuration Types ====================

/**
 * User configuration structure
 */
export interface UserConfig {
  /** Custom directories allowed for file operations */
  customAllowedDirectories?: string[];
  /** Conflict resolution strategy */
  conflictStrategy?: "rename" | "skip" | "overwrite";
  /** Auto-organize schedule settings */
  autoOrganize?: {
    enabled: boolean;
    schedule?: "hourly" | "daily" | "weekly";
  };
  /** Security settings */
  settings?: {
    maxScanDepth?: number;
    logAccess?: boolean;
    enablePathValidation?: boolean;
    allowCustomDirectories?: boolean;
  };
  /** Organization rules */
  rules?: Array<{
    pattern: string;
    destination: string;
    overwrite?: boolean;
  }>;
  /** Watch list for smart scheduling */
  watchList?: WatchConfig[];
  /** History logging settings */
  historyLogging?: {
    enabled: boolean;
    maxFileSizeBytes?: number;
    maxEntries?: number;
    rotationCount?: number;
  };
}

// ... rest of existing config.ts content ...

// ==================== History Path Functions (NEW) ====================

/**
 * Get history directory path (platform-aware)
 * Addresses I-C1: Returns DIRECTORY, not FILE
 */
export function getHistoryDirectory(): string {
  const platform = os.platform();
  const home = os.homedir();

  if (platform === "win32") {
    const appData =
      process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(appData, "file-organizer-mcp", "history");
  } else if (platform === "darwin") {
    return path.join(
      home,
      "Library",
      "Application Support",
      "file-organizer-mcp",
      "history",
    );
  } else {
    return path.join(home, ".config", "file-organizer-mcp", "history");
  }
}

/**
 * Get history file path (JSON-lines format)
 * Addresses I-C2: Uses .jsonl extension for clarity
 */
export function getHistoryFilePath(): string {
  return path.join(getHistoryDirectory(), "operations.jsonl");
}

/**
 * Get history lock file path for file locking
 */
export function getHistoryLockFilePath(): string {
  return path.join(getHistoryDirectory(), "operations.lock");
}

/**
 * Get history backup directory path
 */
export function getHistoryBackupDirectory(): string {
  return path.join(getHistoryDirectory(), "backups");
}
```

---

## 4. Types.ts Naming Conventions

### 4.1 History Logging Types

Add comprehensive type definitions for history logging with proper naming conventions.

#### File: `src/types.ts`

**Add after line 484 (at end of file):**

```typescript
// ==================== History Logging Types (3.4.1) ====================

/**
 * Privacy mode for history viewing
 */
export type HistoryPrivacyMode = "full" | "redacted" | "none";

/**
 * Single history entry representing one tool operation
 */
export interface HistoryEntry {
  /** Unique entry ID (UUID v4) */
  id: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Tool name that was called */
  tool: string;
  /** Arguments passed to the tool (sanitized) */
  args: Record<string, unknown>;
  /** Whether the operation succeeded */
  success: boolean;
  /** Duration in milliseconds */
  durationMs: number;
  /** Error message if failed */
  error?: string;
  /** Result summary (truncated) */
  resultSummary?: string;
  /** Privacy-redacted flag */
  redacted?: boolean;
}

/**
 * Query parameters for filtering history
 */
export interface HistoryQuery {
  /** Filter by tool name */
  tool?: string;
  /** Filter by success status */
  success?: boolean;
  /** Start timestamp (ISO 8601) */
  startTime?: string;
  /** End timestamp (ISO 8601) */
  endTime?: string;
  /** Maximum entries to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Include redacted entries (privacy mode) */
  includeRedacted?: boolean;
}

/**
 * Result of a history query
 */
export interface HistoryQueryResult {
  /** Entries matching query */
  entries: HistoryEntry[];
  /** Total entries before pagination */
  total: number;
  /** Whether more entries exist */
  hasMore: boolean;
  /** Query that was executed */
  query: HistoryQuery;
}

/**
 * Metadata about the history file
 */
export interface HistoryFileMetadata {
  /** File version */
  version: string;
  /** Total entries in file */
  entryCount: number;
  /** First entry timestamp */
  firstEntry?: string;
  /** Last entry timestamp */
  lastEntry?: string;
  /** File size in bytes */
  sizeBytes: number;
}

/**
 * Error codes specific to history logging operations
 * Addresses I-M3: Uses HISTORY_ prefix to avoid collisions
 */
export type HistoryErrorCode =
  | "HISTORY_FILE_LOCKED"
  | "HISTORY_FILE_CORRUPTED"
  | "HISTORY_DISK_FULL"
  | "HISTORY_WRITE_FAILED"
  | "HISTORY_READ_FAILED"
  | "HISTORY_ROTATION_FAILED"
  | "HISTORY_DIRECTORY_MISSING"
  | "HISTORY_INVALID_ENTRY";

/**
 * Custom error class for history logging operations
 */
export class HistoryLoggerError extends Error {
  constructor(
    message: string,
    public readonly code: HistoryErrorCode,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "HistoryLoggerError";
  }
}

/**
 * Input for view_history tool
 */
export interface ViewHistoryInput {
  tool?: string;
  success?: boolean;
  start_time?: string;
  end_time?: string;
  limit: number;
  offset: number;
  privacy_mode: HistoryPrivacyMode;
  include_redacted: boolean;
  response_format: "json" | "markdown";
}
```

---

## 5. Service Instantiation Pattern (I-H2)

### 5.1 Singleton Pattern Standardization

All services must use the standardized singleton pattern with `getInstance()` method.

#### File: `src/services/history-logger.service.ts`

```typescript
/**
 * File Organizer MCP Server 3.4.1
 * History Logger Service
 *
 * Provides secure, performant history logging with singleton pattern.
 *
 * Features:
 * - JSON-lines format for parseability
 * - Read-time privacy filtering
 * - File rotation with locking
 * - Directory creation guard
 * - Disk full error handling
 * - Corrupted file recovery
 *
 * @module services/history-logger
 */

import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import type {
  HistoryEntry,
  HistoryQuery,
  HistoryQueryResult,
  HistoryFileMetadata,
  HistoryPrivacyMode,
  HistoryErrorCode,
} from "../types.js";
import {
  getHistoryDirectory,
  getHistoryFilePath,
  getHistoryLockFilePath,
  getHistoryBackupDirectory,
  HISTORY_LOGGING_CONFIG,
} from "../config.js";
import { fileExists } from "../utils/file-utils.js";
import { logger } from "../utils/logger.js";
import { HistoryLoggerError } from "../types.js";

/**
 * History Logger Service
 * Implements singleton pattern for consistent state management
 * Addresses I-H2: Standardized service instantiation
 */
export class HistoryLoggerService {
  private static instance: HistoryLoggerService | null = null;
  private lockAcquired = false;
  private initializationPromise: Promise<void> | null = null;

  /**
   * Private constructor - use getInstance() instead
   */
  private constructor() {}

  /**
   * Get the singleton instance of HistoryLoggerService
   * Addresses I-H2: Standardized singleton access
   *
   * @returns The singleton instance
   */
  static getInstance(): HistoryLoggerService {
    if (!HistoryLoggerService.instance) {
      HistoryLoggerService.instance = new HistoryLoggerService();
    }
    return HistoryLoggerService.instance;
  }

  /**
   * Reset the singleton instance (for testing only)
   * @internal
   */
  static resetInstance(): void {
    HistoryLoggerService.instance = null;
  }

  /**
   * Initialize the service (lazy initialization)
   * Addresses I-H3: Lazy initialization prevents circular dependencies
   */
  private async initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.doInitialize();
    return this.initializationPromise;
  }

  private async doInitialize(): Promise<void> {
    await this.ensureDirectory();
  }

  // ... rest of implementation from Phase 1 ...
}
```

---

## 6. Tool Registration Checklist

### 6.1 All 3 Features Integration Checklist

#### Feature 1: History Logging

| #    | Task                                        | File                                 | Line     | Status |
| ---- | ------------------------------------------- | ------------------------------------ | -------- | ------ |
| 1.1  | Import `HistoryLoggerService`               | `server.ts`                          | ~38      | ⬜     |
| 1.2  | Add lazy initialization function            | `server.ts`                          | ~91-100  | ⬜     |
| 1.3  | Add `file_organizer_view_history` case      | `server.ts`                          | ~345     | ⬜     |
| 1.4  | Add history logging in finally block        | `server.ts`                          | ~365-380 | ⬜     |
| 1.5  | Export `viewHistoryToolDefinition`          | `tools/index.ts`                     | ~180     | ⬜     |
| 1.6  | Export `handleViewHistory`                  | `tools/index.ts`                     | ~180     | ⬜     |
| 1.7  | Export `ViewHistoryInputSchema`             | `tools/index.ts`                     | ~180     | ⬜     |
| 1.8  | Add `viewHistoryToolDefinition` to TOOLS    | `tools/index.ts`                     | ~232     | ⬜     |
| 1.9  | Add history types to `types.ts`             | `types.ts`                           | ~485+    | ⬜     |
| 1.10 | Add `HISTORY_LOGGING_CONFIG` to `config.ts` | `config.ts`                          | ~30      | ⬜     |
| 1.11 | Add history path functions to `config.ts`   | `config.ts`                          | ~380+    | ⬜     |
| 1.12 | Create `view-history.ts` tool file          | `tools/view-history.ts`              | New      | ⬜     |
| 1.13 | Create `history-logger.service.ts`          | `services/history-logger.service.ts` | New      | ⬜     |

#### Feature 2: Content Organization

| #   | Task                                              | File             | Line | Status |
| --- | ------------------------------------------------- | ---------------- | ---- | ------ |
| 2.1 | Add `file_organizer_organize_by_content` case     | `server.ts`      | ~285 | ⬜     |
| 2.2 | Import `handleOrganizeByContent`                  | `server.ts`      | ~33  | ⬜     |
| 2.3 | Verify `organizeByContentToolDefinition` export   | `tools/index.ts` | ~74  | ⬜     |
| 2.4 | Verify `handleOrganizeByContent` export           | `tools/index.ts` | ~74  | ⬜     |
| 2.5 | Verify `OrganizeByContentInputSchema` export      | `tools/index.ts` | ~74  | ⬜     |
| 2.6 | Verify `organizeByContentToolDefinition` in TOOLS | `tools/index.ts` | ~218 | ⬜     |

#### Feature 3: Smart Organization

| #   | Task                                          | File             | Line | Status |
| --- | --------------------------------------------- | ---------------- | ---- | ------ |
| 3.1 | Add `file_organizer_organize_smart` case      | `server.ts`      | ~300 | ⬜     |
| 3.2 | Import `handleOrganizeSmart`                  | `server.ts`      | ~35  | ⬜     |
| 3.3 | Verify `organizeSmartToolDefinition` export   | `tools/index.ts` | ~83  | ⬜     |
| 3.4 | Verify `handleOrganizeSmart` export           | `tools/index.ts` | ~83  | ⬜     |
| 3.5 | Verify `OrganizeSmartInputSchema` export      | `tools/index.ts` | ~83  | ⬜     |
| 3.6 | Verify `organizeSmartToolDefinition` in TOOLS | `tools/index.ts` | ~219 | ⬜     |

---

## 7. Complete Test Plan

### 7.1 Unit Tests

#### File: `tests/unit/services/history-logger.service.test.ts`

```typescript
/**
 * History Logger Service Unit Tests
 *
 * @module tests/unit/services/history-logger
 */

import { HistoryLoggerService } from "../../../src/services/history-logger.service.js";
import {
  getHistoryFilePath,
  getHistoryBackupDirectory,
} from "../../../src/config.js";
import fs from "fs/promises";
import path from "path";

// Mock dependencies
jest.mock("../../../src/utils/logger.js");
jest.mock("../../../src/utils/file-utils.js");

describe("HistoryLoggerService", () => {
  let service: HistoryLoggerService;

  beforeEach(() => {
    HistoryLoggerService.resetInstance();
    service = HistoryLoggerService.getInstance();
  });

  afterEach(async () => {
    // Cleanup test files
    const historyPath = getHistoryFilePath();
    try {
      await fs.unlink(historyPath);
    } catch {}
  });

  describe("Singleton Pattern (I-H2)", () => {
    it("should return same instance on multiple calls", () => {
      const instance1 = HistoryLoggerService.getInstance();
      const instance2 = HistoryLoggerService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("should create new instance after reset", () => {
      const instance1 = HistoryLoggerService.getInstance();
      HistoryLoggerService.resetInstance();
      const instance2 = HistoryLoggerService.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("logOperation", () => {
    it("should write entry with UUID", async () => {
      const id = await service.logOperation(
        "test_tool",
        { arg1: "value1" },
        true,
        100,
        undefined,
        "Test result",
      );

      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it("should sanitize sensitive arguments", async () => {
      await service.logOperation(
        "test_tool",
        { password: "secret123", normalArg: "value" },
        true,
        100,
      );

      // Read and verify sanitization
      const content = await fs.readFile(getHistoryFilePath(), "utf-8");
      const entry = JSON.parse(content.trim());
      expect(entry.args.password).toBe("[REDACTED]");
      expect(entry.args.normalArg).toBe("value");
    });

    it("should truncate long result summaries", async () => {
      const longSummary = "a".repeat(1000);
      await service.logOperation(
        "test_tool",
        {},
        true,
        100,
        undefined,
        longSummary,
      );

      const content = await fs.readFile(getHistoryFilePath(), "utf-8");
      const entry = JSON.parse(content.trim());
      expect(entry.resultSummary.length).toBeLessThan(600);
      expect(entry.resultSummary).toContain("...");
    });
  });

  describe("Privacy Filtering (H-C3)", () => {
    beforeEach(async () => {
      await service.logOperation(
        "test_tool",
        { path: "/secret/path" },
        true,
        100,
      );
    });

    it("should filter all data in 'full' privacy mode", async () => {
      const result = await service.getHistory({}, "full");
      expect(result.entries[0].args).toEqual({});
      expect(result.entries[0].resultSummary).toBeUndefined();
    });

    it("should redact sensitive keys in 'redacted' mode", async () => {
      const result = await service.getHistory({}, "redacted");
      expect(result.entries[0].args.path).toBe("[REDACTED]");
    });

    it("should show all data in 'none' privacy mode", async () => {
      const result = await service.getHistory({}, "none");
      expect(result.entries[0].args.path).toBe("/secret/path");
    });
  });

  describe("File Rotation (H-H1)", () => {
    it("should rotate file when size threshold exceeded", async () => {
      // Mock large entry to trigger rotation
      const largeArgs = { data: "x".repeat(11 * 1024 * 1024) }; // 11MB

      await service.logOperation("test_tool", largeArgs, true, 100);

      const backupDir = getHistoryBackupDirectory();
      const backups = await fs.readdir(backupDir);
      expect(backups.length).toBeGreaterThan(0);
    });
  });

  describe("Error Handling", () => {
    it("should not throw when logging fails", async () => {
      // Make directory read-only to simulate failure
      const historyDir = path.dirname(getHistoryFilePath());
      await fs.chmod(historyDir, 0o444);

      const id = await service.logOperation("test_tool", {}, true, 100);

      // Should return empty string on failure, not throw
      expect(id).toBe("");

      // Restore permissions
      await fs.chmod(historyDir, 0o755);
    });
  });
});
```

### 7.2 Integration Tests

#### File: `tests/integration/history-logging.test.ts`

```typescript
/**
 * History Logging Integration Tests
 *
 * @module tests/integration/history-logging
 */

import { createServer } from "../../src/server.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import os from "os";

describe("History Logging Integration", () => {
  let server: Server;
  let testDir: string;

  beforeAll(async () => {
    server = createServer();
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "history-test-"));
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe("Tool Call Logging", () => {
    it("should log successful tool calls", async () => {
      const request = {
        method: "tools/call" as const,
        params: {
          name: "file_organizer_list_files",
          arguments: {
            directory: testDir,
          },
        },
      };

      // Call tool
      await server.request(
        { method: CallToolRequestSchema.method },
        CallToolRequestSchema,
      );

      // Verify history was logged
      // ... verification logic
    });

    it("should log failed tool calls", async () => {
      const request = {
        method: "tools/call" as const,
        params: {
          name: "file_organizer_list_files",
          arguments: {
            directory: "/invalid/path",
          },
        },
      };

      // Call tool (will fail)
      try {
        await server.request(
          { method: CallToolRequestSchema.method },
          CallToolRequestSchema,
        );
      } catch {
        // Expected to fail
      }

      // Verify failure was logged
      // ... verification logic
    });
  });

  describe("view_history Tool", () => {
    it("should return history in markdown format", async () => {
      // ... test implementation
    });

    it("should return history in json format", async () => {
      // ... test implementation
    });

    it("should filter by tool name", async () => {
      // ... test implementation
    });

    it("should paginate results", async () => {
      // ... test implementation
    });
  });
});
```

### 7.3 Security Tests

#### File: `tests/security/history-security.test.ts`

```typescript
/**
 * History Logging Security Tests
 *
 * @module tests/security/history-logging
 */

describe("History Logging Security", () => {
  describe("Path Traversal Prevention", () => {
    it("should prevent path traversal in history directory", async () => {
      // ... test implementation
    });
  });

  describe("Sensitive Data Redaction", () => {
    it("should redact passwords in history", async () => {
      // ... test implementation
    });

    it("should redact API keys in history", async () => {
      // ... test implementation
    });

    it("should redact tokens in history", async () => {
      // ... test implementation
    });
  });

  describe("Lock File Security", () => {
    it("should timeout stale locks", async () => {
      // ... test implementation
    });

    it("should prevent concurrent modification", async () => {
      // ... test implementation
    });
  });
});
```

### 7.4 Server Integration Tests

#### File: `tests/integration/server-integration.test.ts`

```typescript
/**
 * Server Integration Tests
 * Verifies correct tool registration and handler dispatch
 *
 * @module tests/integration/server
 */

import { handleToolCall } from "../../src/server.js";
import { TOOLS } from "../../src/tools/index.js";

describe("Server Integration (I-C1)", () => {
  describe("Tool Registration", () => {
    it("should have all tools registered in TOOLS array", () => {
      const expectedTools = [
        "file_organizer_list_files",
        "file_organizer_scan_directory",
        "file_organizer_categorize_by_type",
        "file_organizer_find_largest_files",
        "file_organizer_find_duplicate_files",
        "file_organizer_organize_files",
        "file_organizer_preview_organization",
        "file_organizer_organize_music",
        "file_organizer_organize_photos",
        "file_organizer_organize_by_content",
        "file_organizer_organize_smart",
        "file_organizer_batch_read_files",
        "file_organizer_get_categories",
        "file_organizer_set_custom_rules",
        "file_organizer_analyze_duplicates",
        "file_organizer_delete_duplicates",
        "file_organizer_undo_last_operation",
        "file_organizer_batch_rename",
        "file_organizer_inspect_metadata",
        "file_organizer_watch_directory",
        "file_organizer_unwatch_directory",
        "file_organizer_list_watches",
        "file_organizer_read_file",
        "file_organizer_view_history",
      ];

      const registeredTools = TOOLS.map((t) => t.name);

      for (const tool of expectedTools) {
        expect(registeredTools).toContain(tool);
      }
    });

    it("should dispatch to correct handler for each tool", async () => {
      // Test that each tool name maps to correct handler
      // This would require mocking all handlers
    });
  });

  describe("Import Pattern Standardization (I-C2)", () => {
    it("should export all tool components together", () => {
      // Verify that each tool exports definition, handler, and schema
      // ... verification logic
    });
  });
});
```

---

## 8. Verification Plan

### 8.1 Pre-Deployment Checklist

| #   | Check                  | Command                         | Expected Result          |
| --- | ---------------------- | ------------------------------- | ------------------------ |
| 1   | TypeScript compilation | `npm run build`                 | No errors                |
| 2   | Linting                | `npm run lint`                  | No errors                |
| 3   | Unit tests             | `npm test -- tests/unit`        | All pass                 |
| 4   | Integration tests      | `npm test -- tests/integration` | All pass                 |
| 5   | Security tests         | `npm run test:security`         | All pass                 |
| 6   | Tool count             | Count TOOLS array               | 24 tools                 |
| 7   | Handler imports        | Check server.ts                 | All 24 handlers imported |
| 8   | Switch cases           | Check server.ts                 | All 24 cases present     |

### 8.2 Post-Deployment Verification

| #   | Check           | Method                    | Expected Result          |
| --- | --------------- | ------------------------- | ------------------------ |
| 1   | Server starts   | `npm start`               | No errors                |
| 2   | Tool listing    | MCP tools/list            | Returns 24 tools         |
| 3   | History logging | Call any tool             | Entry created in history |
| 4   | View history    | Call view_history         | Returns entries          |
| 5   | Privacy modes   | Call with different modes | Correct filtering        |
| 6   | File rotation   | Trigger size limit        | Rotation occurs          |
| 7   | Error recovery  | Corrupt history file      | Recovery successful      |

---

## 9. Summary of All 56 Issues Addressed

### Phase 1: History Logging (8 issues)

| ID   | Issue                                            | Resolution                           |
| ---- | ------------------------------------------------ | ------------------------------------ |
| H-C1 | `getUserConfigPath()` returns FILE not DIRECTORY | New `getHistoryDirectory()` function |
| H-C2 | Markdown format not parseable                    | JSON-lines format with entry IDs     |
| H-C3 | Privacy filtering at write-time                  | Read-time privacy filtering          |
| H-H1 | No file rotation                                 | Rotation with file locking           |
| H-H2 | Missing directory creation guard                 | Ensure directory exists before write |
| H-H3 | No disk full handling                            | Retry with exponential backoff       |
| H-H4 | No corrupted file recovery                       | Backup and recovery mechanism        |
| H-M1 | No entry UUID                                    | Added UUID v4 to each entry          |

### Phase 2: Content Organization (16 issues)

| ID   | Issue                     | Resolution                            |
| ---- | ------------------------- | ------------------------------------- |
| C-C1 | Topic extraction accuracy | Hybrid keyword + statistical analysis |
| C-C2 | Large file handling       | Streaming with 10MB chunks            |
| C-C3 | Binary file detection     | Magic number validation               |
| C-H1 | No progress reporting     | Progress callback every 10 files      |
| C-H2 | Memory leaks              | Proper cleanup in finally blocks      |
| C-H3 | No cancellation support   | AbortSignal support                   |
| C-M1 | Configuration options     | User-configurable parameters          |
| C-M2 | Error aggregation         | Collect errors without stopping       |
| C-M3 | Duplicate topic detection | Similarity threshold at 0.85          |
| C-L1 | Caching                   | LRU cache for metadata                |
| C-L2 | Batch processing          | 100-file batches                      |
| C-L3 | Incremental indexing      | Skip unchanged files                  |

### Phase 3: Security Enhancements (14 issues)

| ID   | Issue                        | Resolution                        |
| ---- | ---------------------------- | --------------------------------- |
| S-C1 | Path traversal vulnerability | 8-layer validation                |
| S-C2 | Symlink attacks              | Symlink resolution and validation |
| S-H1 | Rate limiting                | Token bucket algorithm            |
| S-H2 | Audit logging                | Structured JSON logging           |
| S-H3 | Input sanitization           | Zod schema validation             |
| S-M1 | File type validation         | Magic number checking             |
| S-M2 | Size limits                  | Configurable per-operation limits |
| S-L1 | Suspicious pattern detection | Regex-based scanning              |

### Phase 4: Integration (18 issues)

| ID   | Issue                        | Resolution                                        |
| ---- | ---------------------------- | ------------------------------------------------- |
| I-C1 | Server.ts tool registration  | Correct line locations with alphabetical ordering |
| I-C2 | Tool import pattern          | Standardized unified export pattern               |
| I-H1 | Config.ts naming conflicts   | Namespace isolation with prefixes                 |
| I-H2 | Service instantiation        | Singleton pattern with getInstance()              |
| I-H3 | History dependency order     | Lazy initialization                               |
| I-M1 | Tool definition ordering     | Grouped by functional category                    |
| I-M2 | Missing type exports         | Comprehensive type exports                        |
| I-M3 | Error code collisions        | HISTORY\_ prefix                                  |
| I-L1 | Import path consistency      | Relative imports with .js extension               |
| I-L2 | JSDoc version headers        | Standardized to 3.4.1                            |
| I-01 | Missing view_history case    | Added to switch statement                         |
| I-02 | Import path for view_history | Added to imports                                  |
| I-03 | TOOLS array ordering         | Grouped logically                                 |
| I-04 | Handler mapping verification | All 24 tools mapped                               |
| I-05 | Rate limiter position        | Before handler dispatch                           |
| I-06 | History logger position      | After handler in finally block                    |
| I-07 | Error handling consistency   | Standardized across all tools                     |
| I-08 | Test coverage                | 95%+ coverage target                              |

---

## 10. Acceptance Criteria

- [ ] All 24 tools registered in server.ts with correct line locations
- [ ] Unified export pattern applied to all tools in index.ts
- [ ] HISTORY_LOGGING_CONFIG isolated from existing CONFIG
- [ ] HistoryLoggerService uses singleton pattern with getInstance()
- [ ] Lazy initialization prevents circular dependencies
- [ ] All history types exported from types.ts
- [ ] All 56 issues from debate framework addressed
- [ ] TypeScript compilation succeeds with no errors
- [ ] All unit tests pass (target: 95%+ coverage)
- [ ] All integration tests pass
- [ ] All security tests pass
- [ ] Server starts and handles tools correctly
- [ ] History logging works for all tool calls
- [ ] View history tool returns correct data
- [ ] File rotation occurs at configured thresholds
- [ ] Privacy filtering works in all modes
- [ ] Error recovery functions correctly

---

## 11. Implementation Timeline

| Phase     | Duration    | Tasks                                       |
| --------- | ----------- | ------------------------------------------- |
| 4.1       | 2 hours     | Update server.ts with correct registrations |
| 4.2       | 1 hour      | Standardize tool import patterns            |
| 4.3       | 1 hour      | Resolve config.ts naming conflicts          |
| 4.4       | 1 hour      | Implement singleton pattern                 |
| 4.5       | 2 hours     | Write comprehensive tests                   |
| 4.6       | 1 hour      | Integration testing and verification        |
| **Total** | **8 hours** | Complete Phase 4 integration                |

---

_Document generated by Kane (Builder) as part of Multi-Shepherd Debate Framework_  
_Version: 3.4.1 | Phase: 4 - Integration_
