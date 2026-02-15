# Phase 1 - History Logging Implementation Plan

**Version:** 3.3.5  
**Status:** Draft  
**Priority:** CRITICAL

---

## Executive Summary

This phase addresses CRITICAL/HIGH issues in the history logging system, introducing a robust, secure, and performant logging infrastructure for audit trails and operation history.

---

## Issues Addressed

| ID   | Severity | Issue                                            | Resolution                           |
| ---- | -------- | ------------------------------------------------ | ------------------------------------ |
| H-C1 | CRITICAL | `getUserConfigPath()` returns FILE not DIRECTORY | New `getHistoryFilePath()` function  |
| H-C2 | CRITICAL | Markdown format not parseable                    | JSON-lines format with entry IDs     |
| H-C3 | CRITICAL | Privacy filtering at write-time                  | Read-time privacy filtering          |
| H-H1 | HIGH     | No file rotation                                 | Rotation with file locking           |
| H-H2 | HIGH     | Missing directory creation guard                 | Ensure directory exists before write |
| H-H3 | HIGH     | No disk full handling                            | Retry with exponential backoff       |
| H-H4 | HIGH     | No corrupted file recovery                       | Backup and recovery mechanism        |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        server.ts                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ handleToolCall()                                         │   │
│  │   ├── HistoryLoggerService.logOperation()               │   │
│  │   └── handleViewHistory() (new tool)                    │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              history-logger.service.ts (NEW)                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Core Methods:                                            │   │
│  │   ├── logOperation()        - Write entry               │   │
│  │   ├── getHistory()          - Read with privacy filter  │   │
│  │   ├── rotateIfNeeded()      - File rotation             │   │
│  │   └── recoverCorrupted()    - Backup recovery           │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Internal:                                                │   │
│  │   ├── acquireLock()         - File locking              │   │
│  │   ├── releaseLock()         - Release lock              │   │
│  │   ├── ensureDirectory()     - Directory guard           │   │
│  │   └── writeWithRetry()      - Retry logic               │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         config.ts                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ New Functions:                                           │   │
│  │   ├── getHistoryFilePath()   - Returns history file path│   │
│  │   └── getHistoryDirectory() - Returns history directory│   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ New Constants:                                           │   │
│  │   ├── HISTORY_MAX_SIZE_BYTES  - 10MB default            │   │
│  │   ├── HISTORY_MAX_ENTRIES     - 10000 default           │   │
│  │   └── HISTORY_ROTATION_COUNT  - 5 backup files          │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. New Types (types.ts)

### 1.1 History Entry Types

```typescript
// ==================== History Logging Types ====================

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

export interface HistoryResult {
  /** Entries matching query */
  entries: HistoryEntry[];
  /** Total entries before pagination */
  total: number;
  /** Whether more entries exist */
  hasMore: boolean;
  /** Query that was executed */
  query: HistoryQuery;
}

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

export type PrivacyMode = "full" | "redacted" | "none";
```

### 1.2 Error Types

```typescript
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

export type HistoryErrorCode =
  | "HISTORY_FILE_LOCKED"
  | "HISTORY_FILE_CORRUPTED"
  | "HISTORY_DISK_FULL"
  | "HISTORY_WRITE_FAILED"
  | "HISTORY_READ_FAILED"
  | "HISTORY_ROTATION_FAILED"
  | "HISTORY_DIRECTORY_MISSING";
```

---

## 2. Config Modifications (config.ts)

### 2.1 New Functions

```typescript
/**
 * Get history directory path (platform-aware)
 * Addresses H-C1: Returns DIRECTORY, not FILE
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
 * Addresses H-C2: Uses .jsonl extension for clarity
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

### 2.2 New Constants

```typescript
export const HISTORY_CONFIG = {
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
} as const;
```

---

## 3. History Logger Service (history-logger.service.ts)

### 3.1 Service Class Structure

```typescript
/**
 * File Organizer MCP Server v3.3.5
 * History Logger Service
 *
 * Provides secure, performant history logging with:
 * - JSON-lines format for parseability (H-C2)
 * - Read-time privacy filtering (H-C3)
 * - File rotation with locking (H-H1)
 * - Directory creation guard (H-H2)
 * - Disk full error handling (H-H3)
 * - Corrupted file recovery (H-H4)
 */

import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import type {
  HistoryEntry,
  HistoryQuery,
  HistoryResult,
  HistoryFileMetadata,
  PrivacyMode,
} from "../types.js";
import {
  getHistoryDirectory,
  getHistoryFilePath,
  getHistoryLockFilePath,
  getHistoryBackupDirectory,
  HISTORY_CONFIG,
} from "../config.js";
import { fileExists } from "../utils/file-utils.js";
import { logger } from "../utils/logger.js";

export class HistoryLoggerService {
  private static instance: HistoryLoggerService;
  private lockAcquired = false;
  private lockPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): HistoryLoggerService {
    if (!HistoryLoggerService.instance) {
      HistoryLoggerService.instance = new HistoryLoggerService();
    }
    return HistoryLoggerService.instance;
  }

  // ... implementation details below
}
```

### 3.2 Core Methods

#### 3.2.1 Directory Guard (H-H2)

```typescript
/**
 * Ensure history directory exists before any operation
 * Addresses H-H2: Directory creation guard
 */
private async ensureDirectory(): Promise<void> {
  const historyDir = getHistoryDirectory();

  try {
    await fs.access(historyDir);
  } catch {
    // Directory doesn't exist, create it
    await fs.mkdir(historyDir, { recursive: true });
    logger.info(`Created history directory: ${historyDir}`);
  }
}
```

#### 3.2.2 File Locking (H-H1)

```typescript
/**
 * Acquire exclusive lock for history file operations
 * Addresses H-H1: File locking for rotation safety
 */
private async acquireLock(): Promise<void> {
  if (this.lockAcquired) return;

  const lockPath = getHistoryLockFilePath();
  await this.ensureDirectory();

  const startTime = Date.now();
  const lockTimeout = HISTORY_CONFIG.LOCK_TIMEOUT_MS;

  while (Date.now() - startTime < lockTimeout) {
    try {
      // Attempt to create lock file exclusively
      const handle = await fs.open(lockPath, "wx");
      await handle.write(Buffer.from(`${process.pid}\n${Date.now()}`));
      await handle.close();
      this.lockAcquired = true;
      return;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "EEXIST") {
        // Lock exists, check if stale
        try {
          const lockContent = await fs.readFile(lockPath, "utf-8");
          const [pid, timestamp] = lockContent.split("\n");
          const lockAge = Date.now() - parseInt(timestamp, 10);

          // If lock is older than timeout, it's stale - remove it
          if (lockAge > lockTimeout) {
            await fs.unlink(lockPath);
            continue;
          }
        } catch {
          // Lock file unreadable, try to remove
          try {
            await fs.unlink(lockPath);
          } catch {}
        }

        // Wait briefly before retry
        await new Promise(resolve => setTimeout(resolve, 50));
        continue;
      }
      throw error;
    }
  }

  throw new HistoryLoggerError(
    "Failed to acquire history file lock",
    "HISTORY_FILE_LOCKED"
  );
}

/**
 * Release the history file lock
 */
private async releaseLock(): Promise<void> {
  if (!this.lockAcquired) return;

  const lockPath = getHistoryLockFilePath();
  try {
    await fs.unlink(lockPath);
  } catch {}
  this.lockAcquired = false;
}
```

#### 3.2.3 Write with Retry (H-H3)

```typescript
/**
 * Write entry with retry logic for disk full scenarios
 * Addresses H-H3: Disk full error handling
 */
private async writeWithRetry(entry: HistoryEntry): Promise<void> {
  const historyPath = getHistoryFilePath();
  let lastError: Error | null = null;
  let delay = HISTORY_CONFIG.RETRY_DELAY_MS;

  for (let attempt = 0; attempt < HISTORY_CONFIG.MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      await this.ensureDirectory();

      // Append entry as JSON line
      const line = JSON.stringify(entry) + "\n";
      await fs.appendFile(historyPath, line, "utf-8");
      return;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      lastError = error as Error;

      // Check for disk full errors
      if (err.code === "ENOSPC" || err.code === "EDQUOT") {
        logger.warn(`Disk full, retrying write (attempt ${attempt + 1}/${HISTORY_CONFIG.MAX_RETRY_ATTEMPTS})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, HISTORY_CONFIG.MAX_RETRY_DELAY_MS);
        continue;
      }

      // For other errors, throw immediately
      throw new HistoryLoggerError(
        `Failed to write history entry: ${err.message}`,
        "HISTORY_WRITE_FAILED",
        error as Error
      );
    }
  }

  throw new HistoryLoggerError(
    `Failed to write history after ${HISTORY_CONFIG.MAX_RETRY_ATTEMPTS} attempts: ${lastError?.message}`,
    "HISTORY_DISK_FULL",
    lastError ?? undefined
  );
}
```

#### 3.2.4 File Rotation (H-H1)

```typescript
/**
 * Rotate history file if needed
 * Addresses H-H1: File rotation
 */
private async rotateIfNeeded(): Promise<boolean> {
  const historyPath = getHistoryFilePath();

  if (!(await fileExists(historyPath))) {
    return false;
  }

  try {
    const stats = await fs.stat(historyPath);

    // Check size threshold
    if (stats.size >= HISTORY_CONFIG.MAX_SIZE_BYTES) {
      await this.performRotation();
      return true;
    }

    // Check entry count threshold
    const metadata = await this.getFileMetadata();
    if (metadata.entryCount >= HISTORY_CONFIG.MAX_ENTRIES) {
      await this.performRotation();
      return true;
    }

    return false;
  } catch (error) {
    logger.error("Failed to check rotation criteria", { error });
    return false;
  }
}

/**
 * Perform the actual file rotation
 */
private async performRotation(): Promise<void> {
  const historyPath = getHistoryFilePath();
  const backupDir = getHistoryBackupDirectory();

  // Ensure backup directory exists
  await fs.mkdir(backupDir, { recursive: true });

  // Rotate existing backups
  for (let i = HISTORY_CONFIG.ROTATION_COUNT - 1; i >= 1; i--) {
    const oldBackup = path.join(backupDir, `operations.${i}.jsonl`);
    const newBackup = path.join(backupDir, `operations.${i + 1}.jsonl`);

    if (await fileExists(oldBackup)) {
      if (i === HISTORY_CONFIG.ROTATION_COUNT - 1) {
        // Delete oldest backup
        await fs.unlink(oldBackup);
      } else {
        await fs.rename(oldBackup, newBackup);
      }
    }
  }

  // Move current file to backup.1
  const backupPath = path.join(backupDir, "operations.1.jsonl");
  await fs.rename(historyPath, backupPath);

  logger.info("History file rotated", { backupPath });
}
```

#### 3.2.5 Log Operation (Main Entry Point)

```typescript
/**
 * Log an operation to history
 * @param tool - Tool name
 * @param args - Tool arguments (will be sanitized)
 * @param success - Whether operation succeeded
 * @param durationMs - Operation duration
 * @param error - Error message if failed
 * @param resultSummary - Result summary (will be truncated)
 */
public async logOperation(
  tool: string,
  args: Record<string, unknown>,
  success: boolean,
  durationMs: number,
  error?: string,
  resultSummary?: string
): Promise<string> {
  const entry: HistoryEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    tool,
    args: this.sanitizeArgs(args),
    success,
    durationMs,
    error,
    resultSummary: this.truncateSummary(resultSummary),
  };

  try {
    await this.acquireLock();

    // Check for rotation before write
    await this.rotateIfNeeded();

    // Write entry
    await this.writeWithRetry(entry);

    return entry.id;
  } catch (err) {
    logger.error("Failed to log operation to history", {
      tool,
      error: (err as Error).message
    });
    // Don't throw - logging failures shouldn't break operations
    return "";
  } finally {
    await this.releaseLock();
  }
}

/**
 * Sanitize arguments for privacy
 */
private sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  const sensitiveKeys = ["password", "token", "secret", "key", "credential", "api_key"];

  for (const [key, value] of Object.entries(args)) {
    const lowerKey = key.toLowerCase();

    // Redact sensitive keys
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      sanitized[key] = "[REDACTED]";
      continue;
    }

    // Truncate long strings
    if (typeof value === "string" && value.length > 200) {
      sanitized[key] = value.substring(0, 200) + "...[truncated]";
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}

/**
 * Truncate result summary
 */
private truncateSummary(summary?: string): string | undefined {
  if (!summary) return undefined;
  if (summary.length <= HISTORY_CONFIG.MAX_SUMMARY_LENGTH) {
    return summary;
  }
  return summary.substring(0, HISTORY_CONFIG.MAX_SUMMARY_LENGTH) + "...";
}
```

### 3.3 Read Methods with Privacy Filter (H-C3)

#### 3.3.1 Get History with Privacy Mode

```typescript
/**
 * Get history entries with privacy filtering
 * Addresses H-C3: Privacy mode filtering at READ-time
 */
public async getHistory(
  query: HistoryQuery,
  privacyMode: PrivacyMode = "redacted"
): Promise<HistoryResult> {
  const historyPath = getHistoryFilePath();

  try {
    if (!(await fileExists(historyPath))) {
      return {
        entries: [],
        total: 0,
        hasMore: false,
        query
      };
    }

    // Read and parse entries
    const entries = await this.readEntries(historyPath);

    // Apply filters
    let filtered = this.applyFilters(entries, query);

    // Apply privacy mode at READ-time (not write-time)
    filtered = this.applyPrivacyFilter(filtered, privacyMode, query.includeRedacted);

    const total = filtered.length;
    const limit = query.limit ?? 100;
    const offset = query.offset ?? 0;

    // Apply pagination
    const paginated = filtered.slice(offset, offset + limit);

    return {
      entries: paginated,
      total,
      hasMore: offset + limit < total,
      query
    };
  } catch (error) {
    throw new HistoryLoggerError(
      "Failed to read history",
      "HISTORY_READ_FAILED",
      error as Error
    );
  }
}

/**
 * Read entries from JSON-lines file
 */
private async readEntries(filePath: string): Promise<HistoryEntry[]> {
  const content = await fs.readFile(filePath, "utf-8");
  const lines = content.trim().split("\n");
  const entries: HistoryEntry[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as HistoryEntry);
    } catch {
      // Skip corrupted lines - handled by recovery mechanism
      logger.warn("Skipping corrupted history line");
    }
  }

  return entries;
}

/**
 * Apply query filters
 */
private applyFilters(entries: HistoryEntry[], query: HistoryQuery): HistoryEntry[] {
  return entries.filter(entry => {
    // Filter by tool
    if (query.tool && entry.tool !== query.tool) {
      return false;
    }

    // Filter by success
    if (query.success !== undefined && entry.success !== query.success) {
      return false;
    }

    // Filter by time range
    if (query.startTime && entry.timestamp < query.startTime) {
      return false;
    }
    if (query.endTime && entry.timestamp > query.endTime) {
      return false;
    }

    return true;
  });
}

/**
 * Apply privacy filter at READ-time
 * Addresses H-C3: Privacy filtering at read-time
 */
private applyPrivacyFilter(
  entries: HistoryEntry[],
  privacyMode: PrivacyMode,
  includeRedacted: boolean = false
): HistoryEntry[] {
  if (privacyMode === "none") {
    return entries;
  }

  return entries.map(entry => {
    if (privacyMode === "full") {
      // Full privacy: Redact all arguments
      return {
        ...entry,
        args: {},
        resultSummary: undefined,
        redacted: true
      };
    }

    // Redacted mode: Keep structure, redact sensitive values
    return {
      ...entry,
      args: this.redactSensitiveValues(entry.args),
      redacted: entry.redacted ?? false
    };
  }).filter(entry => includeRedacted || !entry.redacted);
}

/**
 * Redact sensitive values in arguments
 */
private redactSensitiveValues(args: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  const sensitiveKeys = ["password", "token", "secret", "key", "credential", "api_key", "path"];

  for (const [key, value] of Object.entries(args)) {
    const lowerKey = key.toLowerCase();

    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      redacted[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      redacted[key] = this.redactSensitiveValues(value as Record<string, unknown>);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}
```

### 3.4 Recovery Mechanism (H-H4)

```typescript
/**
 * Recover from corrupted history file
 * Addresses H-H4: Corrupted file recovery
 */
public async recoverCorrupted(): Promise<{
  recovered: number;
  lost: number;
  backupUsed: boolean;
}> {
  const historyPath = getHistoryFilePath();
  const backupDir = getHistoryBackupDirectory();

  try {
    // Attempt to read current file
    const entries = await this.readEntries(historyPath);

    // If we can read entries, file might be partially corrupted
    // Try to repair by rewriting
    await this.rewriteEntries(historyPath, entries);

    return {
      recovered: entries.length,
      lost: 0,
      backupUsed: false
    };
  } catch (error) {
    logger.error("History file corrupted, attempting backup recovery", { error });

    // Try to recover from backup
    for (let i = 1; i <= HISTORY_CONFIG.ROTATION_COUNT; i++) {
      const backupPath = path.join(backupDir, `operations.${i}.jsonl`);

      if (await fileExists(backupPath)) {
        try {
          const backupEntries = await this.readEntries(backupPath);

          // Restore from backup
          await this.rewriteEntries(historyPath, backupEntries);

          logger.info("History recovered from backup", { backupPath, entries: backupEntries.length });

          return {
            recovered: backupEntries.length,
            lost: 0,
            backupUsed: true
          };
        } catch {
          continue;
        }
      }
    }

    // No recoverable backup found
    logger.error("No recoverable backup found, starting fresh history");

    // Create empty history file
    await this.ensureDirectory();
    await fs.writeFile(historyPath, "", "utf-8");

    return {
      recovered: 0,
      lost: 1, // Lost the corrupted file
      backupUsed: false
    };
  }
}

/**
 * Rewrite entries to file (for repair)
 */
private async rewriteEntries(filePath: string, entries: HistoryEntry[]): Promise<void> {
  await this.acquireLock();
  try {
    const content = entries.map(e => JSON.stringify(e)).join("\n");
    await fs.writeFile(filePath, content + "\n", "utf-8");
  } finally {
    await this.releaseLock();
  }
}

/**
 * Get metadata about the history file
 */
public async getFileMetadata(): Promise<HistoryFileMetadata> {
  const historyPath = getHistoryFilePath();

  if (!(await fileExists(historyPath))) {
    return {
      version: "1.0",
      entryCount: 0,
      sizeBytes: 0
    };
  }

  const stats = await fs.stat(historyPath);
  const entries = await this.readEntries(historyPath);

  return {
    version: "1.0",
    entryCount: entries.length,
    firstEntry: entries[0]?.timestamp,
    lastEntry: entries[entries.length - 1]?.timestamp,
    sizeBytes: stats.size
  };
}
```

---

## 4. View History Tool (view-history.ts)

### 4.1 Tool Definition

```typescript
/**
 * File Organizer MCP Server v3.3.5
 * view_history Tool
 *
 * @module tools/view-history
 */

import { z } from "zod";
import type { ToolDefinition, ToolResponse } from "../types.js";
import { HistoryLoggerService } from "../services/history-logger.service.js";
import { createErrorResponse } from "../utils/error-handler.js";

export const ViewHistoryInputSchema = z.object({
  tool: z.string().optional().describe("Filter by tool name"),
  success: z.boolean().optional().describe("Filter by success status"),
  start_time: z.string().optional().describe("Start timestamp (ISO 8601)"),
  end_time: z.string().optional().describe("End timestamp (ISO 8601)"),
  limit: z
    .number()
    .min(1)
    .max(1000)
    .default(100)
    .describe("Maximum entries to return"),
  offset: z.number().min(0).default(0).describe("Offset for pagination"),
  privacy_mode: z
    .enum(["full", "redacted", "none"])
    .default("redacted")
    .describe("Privacy mode for sensitive data"),
  include_redacted: z
    .boolean()
    .default(false)
    .describe("Include entries that have been redacted"),
  response_format: z.enum(["json", "markdown"]).default("markdown"),
});

export type ViewHistoryInput = z.infer<typeof ViewHistoryInputSchema>;

export const viewHistoryToolDefinition: ToolDefinition = {
  name: "file_organizer_view_history",
  title: "View History",
  description:
    "View operation history with optional filtering and privacy modes. " +
    "Use 'full' privacy mode to hide all arguments, 'redacted' to show non-sensitive data, " +
    "or 'none' to show all data.",
  inputSchema: {
    type: "object",
    properties: {
      tool: { type: "string", description: "Filter by tool name" },
      success: { type: "boolean", description: "Filter by success status" },
      start_time: { type: "string", description: "Start timestamp (ISO 8601)" },
      end_time: { type: "string", description: "End timestamp (ISO 8601)" },
      limit: { type: "number", description: "Maximum entries", default: 100 },
      offset: { type: "number", description: "Pagination offset", default: 0 },
      privacy_mode: {
        type: "string",
        enum: ["full", "redacted", "none"],
        default: "redacted",
        description: "Privacy mode for sensitive data",
      },
      include_redacted: { type: "boolean", default: false },
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        default: "markdown",
      },
    },
    required: [],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

export async function handleViewHistory(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = ViewHistoryInputSchema.safeParse(args);
    if (!parsed.success) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
          },
        ],
      };
    }

    const service = HistoryLoggerService.getInstance();
    const result = await service.getHistory(
      {
        tool: parsed.data.tool,
        success: parsed.data.success,
        startTime: parsed.data.start_time,
        endTime: parsed.data.end_time,
        limit: parsed.data.limit,
        offset: parsed.data.offset,
        includeRedacted: parsed.data.include_redacted,
      },
      parsed.data.privacy_mode,
    );

    if (parsed.data.response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    // Markdown format
    let markdown = `### Operation History\n\n`;
    markdown += `**Total Entries:** ${result.total}\n`;
    markdown += `**Showing:** ${result.entries.length} (offset: ${parsed.data.offset})\n`;
    markdown += `**Privacy Mode:** ${parsed.data.privacy_mode}\n\n`;

    if (result.entries.length === 0) {
      markdown += "*No entries found matching criteria.*\n";
    } else {
      markdown += "| Timestamp | Tool | Status | Duration | Error |\n";
      markdown += "|-----------|------|--------|----------|-------|\n";

      for (const entry of result.entries) {
        const status = entry.success ? "✓" : "✗";
        const error = entry.error ? entry.error.substring(0, 30) + "..." : "-";
        markdown += `| ${entry.timestamp} | ${entry.tool} | ${status} | ${entry.durationMs}ms | ${error} |\n`;
      }

      if (result.hasMore) {
        const nextOffset = parsed.data.offset + parsed.data.limit;
        markdown += `\n*More entries available. Use offset=${nextOffset} to view more.*\n`;
      }
    }

    return {
      content: [{ type: "text", text: markdown }],
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}
```

---

## 5. Server Integration (server.ts)

### 5.1 Modified handleToolCall

```typescript
import { HistoryLoggerService } from "./services/history-logger.service.js";

const historyLogger = HistoryLoggerService.getInstance();

async function handleToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<MCPToolResponse> {
  const startTime = Date.now();
  let success = false;
  let error: string | undefined;
  let resultSummary: string | undefined;

  try {
    let response: MCPToolResponse;

    // ... existing switch statement ...

    // Add case for view_history tool
    case "file_organizer_view_history":
      response = await handleViewHistory(args);
      break;

    // ... rest of switch ...

    success = true;

    // Extract summary for history logging
    if (response.content[0]?.text) {
      resultSummary = response.content[0].text.substring(0, 500);
    }

    return response;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    // Log to history (non-blocking, failures don't break operation)
    const durationMs = Date.now() - startTime;

    historyLogger.logOperation(
      name,
      args,
      success,
      durationMs,
      error,
      resultSummary
    ).catch(err => {
      logger.error("Failed to log to history", { error: err.message });
    });
  }
}
```

### 5.2 Register Tool

Add to `TOOLS` array in `tools/index.ts`:

```typescript
import { viewHistoryToolDefinition } from "./view-history.js";

export const TOOLS: ToolDefinition[] = [
  // ... existing tools ...
  viewHistoryToolDefinition,
];
```

---

## 6. JSON-Lines Entry Format

### 6.1 Entry Structure

Each entry is a single JSON object per line:

```json
{"id":"550e8400-e29b-41d4-a716-446655440000","timestamp":"2024-01-15T10:30:00.000Z","tool":"file_organizer_organize_files","args":{"directory":"/Users/test/Downloads","dry_run":true},"success":true,"durationMs":1250,"resultSummary":"Processed 50 files..."}
{"id":"550e8400-e29b-41d4-a716-446655440001","timestamp":"2024-01-15T10:31:00.000Z","tool":"file_organizer_scan_directory","args":{"path":"/Users/test/Documents"},"success":false,"durationMs":50,"error":"Access denied: Path outside allowed directory"}
```

### 6.2 Benefits

- **Parseable**: Each line is valid JSON, can be streamed
- **Append-only**: No need to rewrite entire file for new entries
- **Recoverable**: Single corrupted line doesn't affect others
- **Efficient**: Can read last N lines without parsing entire file

---

## 7. Privacy Mode Details (H-C3)

### 7.1 Privacy Modes

| Mode       | Description     | Args                    | Summary   | Paths    |
| ---------- | --------------- | ----------------------- | --------- | -------- |
| `full`     | Maximum privacy | `{}`                    | Removed   | Removed  |
| `redacted` | Balanced        | Sensitive keys redacted | Truncated | Redacted |
| `none`     | No filtering    | Full                    | Full      | Full     |

### 7.2 Sensitive Keys

The following key patterns are always redacted:

- `password`, `passwd`, `pwd`
- `token`, `access_token`, `refresh_token`
- `secret`, `secret_key`, `client_secret`
- `key`, `api_key`, `private_key`
- `credential`, `credentials`
- `path` (when `privacy_mode` is `full` or `redacted`)

---

## 8. Error Handling Patterns

### 8.1 Error Categories

```typescript
// History-specific errors
try {
  await historyLogger.logOperation(...);
} catch (error) {
  if (error instanceof HistoryLoggerError) {
    switch (error.code) {
      case "HISTORY_FILE_LOCKED":
        // Lock timeout - non-critical
        logger.warn("History logging skipped: file locked");
        break;
      case "HISTORY_DISK_FULL":
        // Disk space issue - alert user
        logger.error("History logging failed: disk full");
        break;
      case "HISTORY_FILE_CORRUPTED":
        // Corruption detected - trigger recovery
        await historyLogger.recoverCorrupted();
        break;
    }
  }
}
```

### 8.2 Graceful Degradation

History logging failures should **never** break the main operation:

```typescript
// In server.ts handleToolCall
} finally {
  // Non-blocking history log with catch
  historyLogger.logOperation(...)
    .catch(() => {}); // Silent fail - logging is secondary
}
```

---

## 9. Test Requirements

### 9.1 Unit Tests

- `tests/unit/services/history-logger.service.test.ts`
  - Entry creation and sanitization
  - Privacy filtering logic
  - File rotation trigger conditions
  - Lock acquisition and timeout
  - Retry logic for disk full

### 9.2 Integration Tests

- `tests/integration/history-logging.test.ts`
  - End-to-end logging from tool call
  - History query and filtering
  - Recovery from corrupted file
  - Rotation with multiple backup files

### 9.3 Security Tests

- `tests/security/history-security.test.ts`
  - Path traversal prevention
  - Sensitive data redaction verification
  - Lock file timeout enforcement

---

## 10. Migration Plan

### 10.1 Backward Compatibility

- Existing markdown history files are **not migrated**
- New JSON-lines format starts fresh
- Old history can be manually reviewed if needed

### 10.2 Deployment Steps

1. Deploy `config.ts` with new functions
2. Deploy `types.ts` with new types
3. Deploy `history-logger.service.ts`
4. Deploy `view-history.ts` tool
5. Update `server.ts` with integration
6. Update `tools/index.ts` with exports

---

## 11. Configuration Summary

```typescript
// Default configuration values
const HISTORY_CONFIG = {
  MAX_SIZE_BYTES: 10 * 1024 * 1024, // 10 MB
  MAX_ENTRIES: 10000, // 10,000 entries
  ROTATION_COUNT: 5, // Keep 5 backups
  MAX_RETRY_ATTEMPTS: 3, // 3 retries for disk full
  RETRY_DELAY_MS: 100, // 100ms initial delay
  MAX_RETRY_DELAY_MS: 5000, // 5s max delay
  LOCK_TIMEOUT_MS: 5000, // 5s lock timeout
  MAX_SUMMARY_LENGTH: 500, // 500 char summary
};
```

---

## 12. Acceptance Criteria

- [ ] `getHistoryFilePath()` returns correct path for all platforms
- [ ] History entries are written in JSON-lines format
- [ ] Privacy mode filters sensitive data at read-time
- [ ] File rotation occurs when size or entry limit reached
- [ ] Directory is created automatically if missing
- [ ] Disk full errors trigger retry with exponential backoff
- [ ] Corrupted files can be recovered from backup
- [ ] History logging never blocks or fails main operations
- [ ] `view_history` tool returns paginated, filtered results
- [ ] All tests pass: unit, integration, security
