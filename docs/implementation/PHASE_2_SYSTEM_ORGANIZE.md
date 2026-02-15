# Phase 2 - System Organize Implementation Plan

**Version:** 3.4.0  
**Status:** Draft  
**Priority:** CRITICAL/HIGH  
**Target:** System directory organization with rollback support

---

## Executive Summary

This phase addresses CRITICAL and HIGH priority issues in the system organization feature, enabling safe file organization across system directories (Desktop, Downloads, Documents, etc.) with comprehensive rollback capabilities, atomic operations, and cross-platform directory detection.

---

## Issues Addressed

| ID   | Severity | Issue                                    | Resolution                                   |
| ---- | -------- | ---------------------------------------- | -------------------------------------------- |
| S-C2 | CRITICAL | RollbackService restricted to cwd/tmpdir | Extend with configurable allowed roots       |
| S-C3 | CRITICAL | No atomic write verification             | Lock file + atomic rename pattern            |
| S-H1 | HIGH     | macOS Movies vs Videos naming            | Platform-aware SystemDirs interface          |
| S-H2 | HIGH     | Fallback path collision check            | Pre-flight destination validation            |
| S-H3 | HIGH     | File-in-use/locked detection             | EPERM/EBUSY handling with retry              |
| S-H4 | HIGH     | Batch move error handling                | Per-file error collection + partial rollback |
| S-H5 | HIGH     | No disk space check                      | Pre-flight space verification                |
| S-H8 | HIGH     | Incomplete SystemDirs                    | Desktop, Temp, Linux XDG support             |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         server.ts                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ handleToolCall()                                                 │   │
│  │   └── file_organizer_system_organization                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              system-organization.ts (NEW TOOL)                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Input Validation:                                                │   │
│  │   - Zod schema validation                                        │   │
│  │   - System directory selection                                   │   │
│  │   - Conflict resolution strategy                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Execution Flow:                                                  │   │
│  │   1. Detect system directories                                   │   │
│  │   2. Validate paths via PathValidatorService                     │   │
│  │   3. Check disk space (S-H5)                                     │   │
│  │   4. Create rollback manifest                                    │   │
│  │   5. Execute batch moves with per-file handling (S-H4)           │   │
│  │   6. Atomic write verification (S-C3)                            │   │
│  │   7. Handle locked files (S-H3)                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│           system-organize.service.ts (NEW SERVICE)                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Core Methods:                                                    │   │
│  │   - organizeSystemDirectory()    - Main orchestration           │   │
│  │   - detectSystemDirectories()    - Cross-platform detection     │   │
│  │   - checkDiskSpace()             - Pre-flight check (S-H5)      │   │
│  │   - checkDestinationCollisions() - Path collision check (S-H2)  │   │
│  │   - executeAtomicMove()          - Atomic rename (S-C3)         │   │
│  │   - handleLockedFile()           - EPERM/EBUSY retry (S-H3)     │   │
│  │   - executeBatchMoves()          - Per-file error handling (S-H4)│  │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Platform Handlers:                                               │   │
│  │   - getWindowsSystemDirs()       - Known Folder IDs             │   │
│  │   - getMacOSSystemDirs()         - NSSearchPathForDirectories   │   │
│  │   - getLinuxSystemDirs()         - XDG Base Directory spec      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌─────────────────────────────────┐    ┌─────────────────────────────────┐
│   rollback.service.ts           │    │   path-validator.service.ts     │
│   (MODIFIED)                    │    │   (EXISTING)                    │
│  ┌─────────────────────────────┐│    │  ┌─────────────────────────────┐│
│  │ - Extended allowed roots    ││    │  │ - 8-layer validation          ││
│  │ - System directory support  ││    │  │ - Whitelist/blacklist         ││
│  │ (S-C2)                      ││    │  │ - Symlink resolution          ││
│  └─────────────────────────────┘│    │  └─────────────────────────────┘│
└─────────────────────────────────┘    └─────────────────────────────────┘
```

---

## 1. New Types (types.ts)

### 1.1 System Directory Types

```typescript
// ==================== System Organization Types ====================

/**
 * Supported system directories for organization
 * Platform-aware naming (S-H1: macOS Movies vs Videos)
 */
export type SystemDirectory =
  | "Desktop"
  | "Documents"
  | "Downloads"
  | "Pictures"
  | "Music"
  | "Videos" // Windows/Linux
  | "Movies" // macOS alias for Videos
  | "Photos" // macOS Photos Library
  | "Trash"
  | "Temp"
  | "Home";

/**
 * Detected system directory paths
 * Populated based on platform (S-H8)
 */
export interface SystemDirs {
  /** User's home directory */
  home: string;
  /** Desktop path */
  desktop: string;
  /** Documents path */
  documents: string;
  /** Downloads path */
  downloads: string;
  /** Pictures/Images path */
  pictures: string;
  /** Music/Audio path */
  music: string;
  /** Videos path (platform-aware) */
  videos: string;
  /** Movies path (macOS only) - alias to videos */
  movies?: string;
  /** Photos Library path (macOS only) */
  photos?: string;
  /** Trash/Recycle Bin path */
  trash: string;
  /** Temp directory path */
  temp: string;
  /** Linux XDG directories */
  xdg?: {
    config?: string;
    data?: string;
    cache?: string;
    state?: string;
  };
}

/**
 * Configuration for system organization
 */
export interface SystemOrganizeConfig {
  /** Target system directory to organize */
  targetDir: SystemDirectory;
  /** Organization strategy */
  strategy: "byCategory" | "byDate" | "byType" | "bySize";
  /** Date format for byDate strategy */
  dateFormat?: "YYYY/MM" | "YYYY-MM" | "YYYY";
  /** Size thresholds for bySize strategy (in MB) */
  sizeThresholds?: number[];
  /** Conflict resolution strategy */
  conflictResolution: "rename" | "skip" | "overwrite" | "overwriteIfNewer";
  /** Create rollback manifest */
  createRollback: boolean;
  /** Dry run mode */
  dryRun: boolean;
  /** Categories to organize (empty = all) */
  categories?: CategoryName[];
  /** Minimum file age in days (skip newer files) */
  minFileAgeDays?: number;
  /** Include hidden files */
  includeHidden: boolean;
}

/**
 * Result of system organization operation
 */
export interface SystemOrganizeResult {
  success: boolean;
  /** Total files processed */
  totalFiles: number;
  /** Successfully moved files */
  movedFiles: number;
  /** Skipped files */
  skippedFiles: number;
  /** Files with errors */
  errorFiles: number;
  /** Per-file results */
  files: SystemOrganizeFileResult[];
  /** Rollback manifest ID (if created) */
  rollbackManifestId?: string;
  /** Errors encountered */
  errors: SystemOrganizeError[];
  /** Duration in milliseconds */
  durationMs: number;
  /** Disk space freed/used (bytes) */
  spaceDelta: number;
}

/**
 * Per-file organization result
 */
export interface SystemOrganizeFileResult {
  source: string;
  destination: string;
  success: boolean;
  action: "moved" | "skipped" | "error" | "locked";
  category: CategoryName;
  /** Error message if failed */
  error?: string;
  /** Retry attempts for locked files */
  retryAttempts?: number;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * System organization error details
 */
export interface SystemOrganizeError {
  file: string;
  error: string;
  code: SystemOrganizeErrorCode;
  recoverable: boolean;
}

export type SystemOrganizeErrorCode =
  | "FILE_LOCKED" // S-H3: File in use
  | "PERMISSION_DENIED" // Access denied
  | "INSUFFICIENT_SPACE" // S-H5: Disk full
  | "DESTINATION_EXISTS" // S-H2: Collision
  | "PATH_NOT_FOUND" // Source path missing
  | "DESTINATION_NOT_FOUND" // Target directory missing
  | "ATOMIC_WRITE_FAILED" // S-C3: Atomic rename failed
  | "ROLLBACK_FAILED"; // Rollback creation failed

/**
 * Disk space information
 */
export interface DiskSpaceInfo {
  /** Total space in bytes */
  total: number;
  /** Free space in bytes */
  free: number;
  /** Available space in bytes (for non-root) */
  available: number;
  /** Path being checked */
  path: string;
}

/**
 * Lock file information for atomic operations (S-C3)
 */
export interface LockFileInfo {
  path: string;
  acquired: boolean;
  timestamp: number;
  pid: number;
}
```

### 1.2 Extended Rollback Types

```typescript
/**
 * Extended rollback action for system organization
 */
export interface ExtendedRollbackAction extends RollbackAction {
  /** Whether this action was atomic verified */
  atomicVerified?: boolean;
  /** Lock file path used (S-C3) */
  lockFilePath?: string;
  /** Retry count for locked files (S-H3) */
  retryCount?: number;
}

/**
 * Rollback configuration for system operations
 */
export interface RollbackConfig {
  /** Allowed root paths for rollback operations */
  allowedRoots: string[];
  /** Enable strict path validation */
  strictValidation: boolean;
  /** Storage directory for manifests */
  storageDir?: string;
}
```

---

## 2. System Organization Service (system-organize.service.ts)

### 2.1 Service Class Structure

```typescript
/**
 * File Organizer MCP Server v3.4.0
 * System Organize Service
 *
 * Provides safe file organization across system directories with:
 * - Cross-platform system directory detection (S-H1, S-H8)
 * - Pre-flight disk space checking (S-H5)
 * - Destination collision detection (S-H2)
 * - Atomic write verification (S-C3)
 * - Locked file handling with retry (S-H3)
 * - Per-file error handling in batch operations (S-H4)
 */

import fs from "fs/promises";
import { constants } from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import type {
  SystemDirectory,
  SystemDirs,
  SystemOrganizeConfig,
  SystemOrganizeResult,
  SystemOrganizeFileResult,
  SystemOrganizeError,
  SystemOrganizeErrorCode,
  DiskSpaceInfo,
  LockFileInfo,
  CategoryName,
  FileInfo,
} from "../types.js";
import { RollbackService } from "./rollback.service.js";
import { PathValidatorService } from "./path-validator.service.js";
import { CategorizerService } from "./categorizer.service.js";
import { FileScannerService } from "./file-scanner.service.js";
import { logger } from "../utils/logger.js";
import { fileExists, isSubPath, normalizePath } from "../utils/file-utils.js";
import { CONFIG } from "../config.js";

export interface SystemOrganizeOptions {
  rollbackService?: RollbackService;
  pathValidator?: PathValidatorService;
  maxRetries?: number;
  retryDelayMs?: number;
  lockTimeoutMs?: number;
}

export class SystemOrganizeService {
  private rollbackService: RollbackService;
  private pathValidator: PathValidatorService;
  private categorizer: CategorizerService;
  private scanner: FileScannerService;
  private options: Required<SystemOrganizeOptions>;

  constructor(options: SystemOrganizeOptions = {}) {
    this.options = {
      rollbackService: options.rollbackService ?? new RollbackService(),
      pathValidator: options.pathValidator ?? new PathValidatorService(),
      maxRetries: options.maxRetries ?? 3,
      retryDelayMs: options.retryDelayMs ?? 500,
      lockTimeoutMs: options.lockTimeoutMs ?? 5000,
    };

    this.rollbackService = this.options.rollbackService;
    this.pathValidator = this.options.pathValidator;
    this.categorizer = new CategorizerService();
    this.scanner = new FileScannerService();
  }

  // ... implementation details below
}
```

### 2.2 System Directory Detection (S-H1, S-H8)

```typescript
/**
 * Detect system directories for current platform
 * Addresses S-H1 (macOS Movies vs Videos) and S-H8 (complete SystemDirs)
 */
async detectSystemDirectories(): Promise<SystemDirs> {
  const platform = os.platform();

  switch (platform) {
    case "win32":
      return this.getWindowsSystemDirs();
    case "darwin":
      return this.getMacOSSystemDirs();
    case "linux":
      return this.getLinuxSystemDirs();
    default:
      // Fallback to generic Unix paths
      return this.getGenericUnixDirs();
  }
}

/**
 * Windows: Use environment variables and Known Folders
 */
private async getWindowsSystemDirs(): Promise<SystemDirs> {
  const home = os.homedir();
  const userProfile = process.env.USERPROFILE || home;

  const dirs: SystemDirs = {
    home,
    desktop: path.join(userProfile, "Desktop"),
    documents: path.join(userProfile, "Documents"),
    downloads: path.join(userProfile, "Downloads"),
    pictures: path.join(userProfile, "Pictures"),
    music: path.join(userProfile, "Music"),
    videos: path.join(userProfile, "Videos"),
    trash: path.join("C:", "$Recycle.Bin"), // Note: Requires special handling
    temp: os.tmpdir(),
  };

  // Verify directories exist
  for (const [key, dirPath] of Object.entries(dirs)) {
    if (key === "trash") continue; // Skip trash check
    if (!(await fileExists(dirPath))) {
      logger.warn(`Windows system directory not found: ${key} at ${dirPath}`);
    }
  }

  return dirs;
}

/**
 * macOS: Use NSSearchPath convention (S-H1: Movies vs Videos)
 */
private async getMacOSSystemDirs(): Promise<SystemDirs> {
  const home = os.homedir();

  const dirs: SystemDirs = {
    home,
    desktop: path.join(home, "Desktop"),
    documents: path.join(home, "Documents"),
    downloads: path.join(home, "Downloads"),
    pictures: path.join(home, "Pictures"),
    music: path.join(home, "Music"),
    // S-H1: macOS uses "Movies" folder
    videos: path.join(home, "Movies"),
    movies: path.join(home, "Movies"), // Alias for clarity
    // Photos Library is a special bundle
    photos: path.join(home, "Pictures", "Photos Library.photoslibrary"),
    trash: path.join(home, ".Trash"),
    temp: os.tmpdir(),
  };

  // Verify directories
  for (const [key, dirPath] of Object.entries(dirs)) {
    if (key === "photos") {
      // Photos Library is a bundle (directory)
      try {
        const stat = await fs.stat(dirPath);
        if (!stat.isDirectory()) {
          logger.warn(`macOS Photos Library not found at ${dirPath}`);
        }
      } catch {
        logger.warn(`macOS Photos Library not accessible at ${dirPath}`);
      }
      continue;
    }
    if (!(await fileExists(dirPath))) {
      logger.warn(`macOS system directory not found: ${key} at ${dirPath}`);
    }
  }

  return dirs;
}

/**
 * Linux: Use XDG Base Directory Specification (S-H8)
 */
private async getLinuxSystemDirs(): Promise<SystemDirs> {
  const home = os.homedir();

  // XDG environment variables with fallbacks
  const xdgConfigHome = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  const xdgDataHome = process.env.XDG_DATA_HOME || path.join(home, ".local", "share");
  const xdgCacheHome = process.env.XDG_CACHE_HOME || path.join(home, ".cache");
  const xdgStateHome = process.env.XDG_STATE_HOME || path.join(home, ".local", "state");

  // XDG user directories
  const xdgUserDirs = await this.readXDGUserDirs(home);

  const dirs: SystemDirs = {
    home,
    desktop: xdgUserDirs.DESKTOP || path.join(home, "Desktop"),
    documents: xdgUserDirs.DOCUMENTS || path.join(home, "Documents"),
    downloads: xdgUserDirs.DOWNLOAD || path.join(home, "Downloads"),
    pictures: xdgUserDirs.PICTURES || path.join(home, "Pictures"),
    music: xdgUserDirs.MUSIC || path.join(home, "Music"),
    videos: xdgUserDirs.VIDEOS || path.join(home, "Videos"),
    trash: xdgUserDirs.TRASH || path.join(home, ".local", "share", "Trash"),
    temp: os.tmpdir(),
    xdg: {
      config: xdgConfigHome,
      data: xdgDataHome,
      cache: xdgCacheHome,
      state: xdgStateHome,
    },
  };

  return dirs;
}

/**
 * Read XDG user-dirs.dirs file for localized paths
 */
private async readXDGUserDirs(home: string): Promise<Record<string, string>> {
  const userDirsPath = path.join(home, ".config", "user-dirs.dirs");
  const dirs: Record<string, string> = {};

  try {
    const content = await fs.readFile(userDirsPath, "utf-8");
    const lines = content.split("\n");

    for (const line of lines) {
      const match = line.match(/^XDG_(\w+)_DIR="(.+)"$/);
      if (match) {
        const [, name, value] = match;
        // Expand $HOME variable
        dirs[name] = value.replace("$HOME", home);
      }
    }
  } catch {
    // File doesn't exist or is unreadable, use defaults
    logger.debug("XDG user-dirs.dirs not found, using defaults");
  }

  return dirs;
}

/**
 * Generic Unix fallback
 */
private async getGenericUnixDirs(): Promise<SystemDirs> {
  const home = os.homedir();

  return {
    home,
    desktop: path.join(home, "Desktop"),
    documents: path.join(home, "Documents"),
    downloads: path.join(home, "Downloads"),
    pictures: path.join(home, "Pictures"),
    music: path.join(home, "Music"),
    videos: path.join(home, "Videos"),
    trash: path.join(home, ".Trash"),
    temp: os.tmpdir(),
  };
}

/**
 * Get path for a specific system directory
 */
async getSystemDirectoryPath(dir: SystemDirectory): Promise<string | null> {
  const dirs = await this.detectSystemDirectories();

  switch (dir) {
    case "Desktop":
      return dirs.desktop;
    case "Documents":
      return dirs.documents;
    case "Downloads":
      return dirs.downloads;
    case "Pictures":
      return dirs.pictures;
    case "Music":
      return dirs.music;
    case "Videos":
      return dirs.videos;
    case "Movies":
      return dirs.movies || dirs.videos;
    case "Photos":
      return dirs.photos || null;
    case "Trash":
      return dirs.trash;
    case "Temp":
      return dirs.temp;
    case "Home":
      return dirs.home;
    default:
      return null;
  }
}
```

### 2.3 Disk Space Checking (S-H5)

```typescript
/**
 * Check available disk space
 * Addresses S-H5: Pre-flight disk space check
 */
async checkDiskSpace(targetPath: string): Promise<DiskSpaceInfo> {
  try {
    // Use platform-specific methods
    if (os.platform() === "win32") {
      return this.checkWindowsDiskSpace(targetPath);
    }
    return this.checkUnixDiskSpace(targetPath);
  } catch (error) {
    logger.error("Failed to check disk space", { targetPath, error });
    throw new Error(`Cannot verify disk space for ${targetPath}: ${(error as Error).message}`);
  }
}

/**
 * Windows disk space check using wmic
 */
private async checkWindowsDiskSpace(targetPath: string): Promise<DiskSpaceInfo> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  const drive = path.parse(targetPath).root;

  try {
    const { stdout } = await execAsync(
      `wmic logicaldisk where "DeviceID='${drive.replace("\\", "")}'" get Size,FreeSpace /value`
    );

    const freeMatch = stdout.match(/FreeSpace=(\d+)/);
    const sizeMatch = stdout.match(/Size=(\d+)/);

    const free = freeMatch ? parseInt(freeMatch[1], 10) : 0;
    const total = sizeMatch ? parseInt(sizeMatch[1], 10) : 0;

    return {
      total,
      free,
      available: free, // On Windows, free ~= available for non-root
      path: targetPath,
    };
  } catch {
    // Fallback: try fs.statfs if available (Node 18.15+)
    return this.checkUnixDiskSpace(targetPath);
  }
}

/**
 * Unix disk space check using statfs
 */
private async checkUnixDiskSpace(targetPath: string): Promise<DiskSpaceInfo> {
  // Check if statfs is available (Node.js 18.15+)
  if ("statfs" in fs) {
    const stats = await (fs as any).statfs(targetPath);
    const blockSize = stats.bsize;
    const total = stats.blocks * blockSize;
    const free = stats.bfree * blockSize;
    const available = stats.bavail * blockSize;

    return {
      total,
      free,
      available,
      path: targetPath,
    };
  }

  // Fallback to df command
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  try {
    const { stdout } = await execAsync(`df -k "${targetPath}"`);
    const lines = stdout.trim().split("\n");
    if (lines.length >= 2) {
      const parts = lines[1].trim().split(/\s+/);
      // df output: filesystem, 1K-blocks, used, available, use%, mount
      const total = parseInt(parts[1], 10) * 1024;
      const available = parseInt(parts[3], 10) * 1024;

      return {
        total,
        free: available, // Approximation
        available,
        path: targetPath,
      };
    }
  } catch (error) {
    logger.error("df command failed", { error });
  }

  throw new Error("Unable to determine disk space");
}

/**
 * Verify sufficient disk space for operation
 */
async verifySufficientSpace(
  sourcePath: string,
  targetPath: string,
  safetyFactor: number = 1.1
): Promise<{ sufficient: boolean; required: number; available: number }> {
  // Calculate total size of files to move
  const stats = await this.calculateDirectorySize(sourcePath);
  const requiredSpace = Math.floor(stats.totalSize * safetyFactor);

  // Check available space on target
  const diskSpace = await this.checkDiskSpace(targetPath);

  return {
    sufficient: diskSpace.available >= requiredSpace,
    required: requiredSpace,
    available: diskSpace.available,
  };
}

/**
 * Calculate total size of directory
 */
private async calculateDirectorySize(dirPath: string): Promise<{ totalSize: number; fileCount: number }> {
  let totalSize = 0;
  let fileCount = 0;

  async function walk(currentPath: string): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const stats = await fs.stat(fullPath);
        totalSize += stats.size;
        fileCount++;
      }
    }
  }

  await walk(dirPath);
  return { totalSize, fileCount };
}
```

### 2.4 Destination Collision Detection (S-H2)

```typescript
/**
 * Check for path collisions before move
 * Addresses S-H2: Fallback path collision check
 */
async checkDestinationCollisions(
  moves: { source: string; destination: string }[],
): Promise<{
  collisions: Array<{ source: string; destination: string; reason: string }>;
  safe: boolean;
}> {
  const collisions: Array<{ source: string; destination: string; reason: string }> = [];
  const destinationSet = new Set<string>();

  for (const move of moves) {
    const { source, destination } = move;

    // Check if destination already exists
    if (await fileExists(destination)) {
      collisions.push({
        source,
        destination,
        reason: "Destination path already exists",
      });
      continue;
    }

    // Check for duplicate destinations in the move set
    const normalizedDest = path.normalize(destination).toLowerCase();
    if (destinationSet.has(normalizedDest)) {
      collisions.push({
        source,
        destination,
        reason: "Multiple sources targeting same destination",
      });
      continue;
    }
    destinationSet.add(normalizedDest);

    // Check for path traversal within destinations
    const parentDir = path.dirname(destination);
    if (!(await fileExists(parentDir))) {
      // Parent doesn't exist - will be created
      continue;
    }
  }

  return {
    collisions,
    safe: collisions.length === 0,
  };
}

/**
 * Generate unique destination path if collision detected
 */
async generateUniqueDestination(
  destination: string,
  conflictResolution: "rename" | "skip" | "overwrite" | "overwriteIfNewer",
): Promise<string | null> {
  if (conflictResolution === "skip") {
    return null;
  }

  if (conflictResolution === "overwrite" || conflictResolution === "overwriteIfNewer") {
    return destination;
  }

  // rename strategy: append timestamp or counter
  const dir = path.dirname(destination);
  const ext = path.extname(destination);
  const base = path.basename(destination, ext);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  let counter = 0;
  let newDestination = path.join(dir, `${base}_${timestamp}${ext}`);

  while (await fileExists(newDestination)) {
    counter++;
    newDestination = path.join(dir, `${base}_${timestamp}_${counter}${ext}`);
  }

  return newDestination;
}
```

### 2.5 Atomic Write Operations (S-C3)

```typescript
/**
 * Acquire lock file for atomic operations
 * Addresses S-C3: Atomic write check with lock file
 */
async acquireLockFile(lockDir: string, operationId: string): Promise<LockFileInfo> {
  const lockPath = path.join(lockDir, `.file-organizer-lock-${operationId}`);
  const startTime = Date.now();

  while (Date.now() - startTime < this.options.lockTimeoutMs) {
    try {
      // Try to create lock file exclusively
      const handle = await fs.open(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL);
      const lockInfo: LockFileInfo = {
        path: lockPath,
        acquired: true,
        timestamp: Date.now(),
        pid: process.pid,
      };

      await handle.write(JSON.stringify(lockInfo));
      await handle.close();

      return lockInfo;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "EEXIST") {
        // Lock exists, check if stale
        try {
          const content = await fs.readFile(lockPath, "utf-8");
          const existingLock: LockFileInfo = JSON.parse(content);

          // Check if lock is stale (older than timeout)
          if (Date.now() - existingLock.timestamp > this.options.lockTimeoutMs) {
            logger.warn("Removing stale lock file", { lockPath });
            await fs.unlink(lockPath);
            continue;
          }
        } catch {
          // Lock file unreadable, try to remove
          try {
            await fs.unlink(lockPath);
          } catch {}
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        throw error;
      }
    }
  }

  throw new Error(`Failed to acquire lock file in ${this.options.lockTimeoutMs}ms`);
}

/**
 * Release lock file
 */
async releaseLockFile(lockPath: string): Promise<void> {
  try {
    await fs.unlink(lockPath);
  } catch (error) {
    logger.warn("Failed to release lock file", { lockPath, error });
  }
}

/**
 * Execute atomic file move with verification
 * Addresses S-C3: Atomic write check
 */
async executeAtomicMove(
  source: string,
  destination: string,
  operationId: string,
): Promise<{ success: boolean; verified: boolean; error?: string }> {
  const destDir = path.dirname(destination);
  const lockInfo = await this.acquireLockFile(destDir, operationId);

  try {
    // Create parent directories
    await fs.mkdir(destDir, { recursive: true });

    // Use atomic rename for the move
    await fs.rename(source, destination);

    // Verify the move succeeded
    const sourceExists = await fileExists(source);
    const destExists = await fileExists(destination);

    if (sourceExists) {
      return {
        success: false,
        verified: false,
        error: "Source file still exists after move",
      };
    }

    if (!destExists) {
      return {
        success: false,
        verified: false,
        error: "Destination file not found after move",
      };
    }

    // Verify file integrity (size match)
    const destStat = await fs.stat(destination);
    if (destStat.size === 0) {
      return {
        success: false,
        verified: false,
        error: "Destination file has zero size",
      };
    }

    return { success: true, verified: true };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    return {
      success: false,
      verified: false,
      error: `Atomic move failed: ${err.message} (code: ${err.code})`,
    };
  } finally {
    await this.releaseLockFile(lockInfo.path);
  }
}
```

### 2.6 Locked File Handling (S-H3)

```typescript
/**
 * Handle locked/busy files with retry
 * Addresses S-H3: File-in-use/locked detection (EPERM, EBUSY handling)
 */
async handleLockedFile<T>(
  operation: () => Promise<T>,
  filePath: string,
): Promise<{ result: T | null; success: boolean; retryAttempts: number; error?: string }> {
  let lastError: Error | null = null;
  let retryAttempts = 0;

  for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
    try {
      const result = await operation();
      return {
        result,
        success: true,
        retryAttempts,
      };
    } catch (error) {
      lastError = error as Error;
      const err = error as NodeJS.ErrnoException;

      // Check for lock-related errors
      const isLockedError =
        err.code === "EPERM" ||    // Permission denied (often locked on Windows)
        err.code === "EBUSY" ||    // Resource busy
        err.code === "EACCES" ||   // Access denied
        err.code === "ETXTBSY" ||  // Text file busy (Linux)
        err.code === "EAGAIN" ||   // Resource temporarily unavailable
        (err.message && (
          err.message.includes("locked") ||
          err.message.includes("in use") ||
          err.message.includes("being used")
        ));

      if (isLockedError && attempt < this.options.maxRetries) {
        retryAttempts++;
        const delay = this.options.retryDelayMs * Math.pow(2, attempt); // Exponential backoff
        logger.warn(`File locked, retrying in ${delay}ms`, { filePath, attempt: attempt + 1 });
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Not a lock error or max retries exceeded
      return {
        result: null,
        success: false,
        retryAttempts,
        error: `${err.message} (code: ${err.code})`,
      };
    }
  }

  return {
    result: null,
    success: false,
    retryAttempts,
    error: lastError?.message || "Max retries exceeded",
  };
}

/**
 * Check if file is locked before operation
 */
async isFileLocked(filePath: string): Promise<boolean> {
  try {
    // Try to open file exclusively
    const handle = await fs.open(filePath, constants.O_RDONLY);
    await handle.close();
    return false;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (
      err.code === "EPERM" ||
      err.code === "EBUSY" ||
      err.code === "EACCES" ||
      err.code === "ETXTBSY"
    ) {
      return true;
    }
    // File doesn't exist or other error
    return false;
  }
}
```

### 2.7 Batch Move with Per-File Error Handling (S-H4)

```typescript
/**
 * Execute batch file moves with per-file error handling
 * Addresses S-H4: Batch move with per-file error handling
 */
async executeBatchMoves(
  moves: Array<{
    source: string;
    destination: string;
    category: CategoryName;
  }>,
  config: {
    conflictResolution: "rename" | "skip" | "overwrite" | "overwriteIfNewer";
    createRollback: boolean;
    dryRun: boolean;
  },
): Promise<SystemOrganizeResult> {
  const startTime = Date.now();
  const results: SystemOrganizeFileResult[] = [];
  const errors: SystemOrganizeError[] = [];
  let rollbackManifestId: string | undefined;

  // Check for destination collisions first
  const collisionCheck = await this.checkDestinationCollisions(
    moves.map(m => ({ source: m.source, destination: m.destination }))
  );

  if (!collisionCheck.safe) {
    logger.warn("Destination collisions detected", { count: collisionCheck.collisions.length });
  }

  // Create rollback manifest if requested
  if (config.createRollback && !config.dryRun) {
    const rollbackActions = moves.map(move => ({
      type: "move" as const,
      originalPath: move.source,
      currentPath: move.destination,
      timestamp: Date.now(),
    }));

    rollbackManifestId = await this.rollbackService.createManifest(
      `System organize: ${moves.length} files`,
      rollbackActions
    );
  }

  // Process each move individually
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const fileStartTime = Date.now();

    try {
      // Validate paths
      const validatedSource = await this.pathValidator.validatePath(move.source, {
        requireExists: true,
        checkWrite: false,
      });

      let destination = move.destination;

      // Handle collision if detected
      const collision = collisionCheck.collisions.find(c => c.source === move.source);
      if (collision) {
        const newDest = await this.generateUniqueDestination(
          destination,
          config.conflictResolution
        );
        if (!newDest) {
          // Skip this file
          results.push({
            source: move.source,
            destination,
            success: true,
            action: "skipped",
            category: move.category,
            durationMs: Date.now() - fileStartTime,
          });
          continue;
        }
        destination = newDest;
      }

      if (config.dryRun) {
        results.push({
          source: move.source,
          destination,
          success: true,
          action: "skipped",
          category: move.category,
          durationMs: Date.now() - fileStartTime,
        });
        continue;
      }

      // Check if file is locked
      if (await this.isFileLocked(validatedSource)) {
        logger.warn(`File is locked, attempting retry`, { source: move.source });
      }

      // Execute move with locked file handling
      const operationId = `sys-org-${Date.now()}-${i}`;
      const moveResult = await this.handleLockedFile(
        () => this.executeAtomicMove(validatedSource, destination, operationId),
        validatedSource
      );

      if (moveResult.success && moveResult.result) {
        results.push({
          source: move.source,
          destination,
          success: true,
          action: "moved",
          category: move.category,
          retryAttempts: moveResult.retryAttempts,
          durationMs: Date.now() - fileStartTime,
        });
      } else {
        const errorCode: SystemOrganizeErrorCode = moveResult.retryAttempts > 0
          ? "FILE_LOCKED"
          : "ATOMIC_WRITE_FAILED";

        results.push({
          source: move.source,
          destination,
          success: false,
          action: "error",
          category: move.category,
          retryAttempts: moveResult.retryAttempts,
          error: moveResult.error,
          durationMs: Date.now() - fileStartTime,
        });

        errors.push({
          file: move.source,
          error: moveResult.error || "Unknown error",
          code: errorCode,
          recoverable: errorCode === "FILE_LOCKED",
        });
      }
    } catch (error) {
      const errorMsg = (error as Error).message;
      logger.error(`Failed to move file`, { source: move.source, error: errorMsg });

      results.push({
        source: move.source,
        destination: move.destination,
        success: false,
        action: "error",
        category: move.category,
        error: errorMsg,
        durationMs: Date.now() - fileStartTime,
      });

      errors.push({
        file: move.source,
        error: errorMsg,
        code: "ATOMIC_WRITE_FAILED",
        recoverable: false,
      });
    }
  }

  // Calculate statistics
  const movedCount = results.filter(r => r.action === "moved").length;
  const skippedCount = results.filter(r => r.action === "skipped").length;
  const errorCount = results.filter(r => r.action === "error" || r.action === "locked").length;

  return {
    success: errorCount === 0,
    totalFiles: moves.length,
    movedFiles: movedCount,
    skippedFiles: skippedCount,
    errorFiles: errorCount,
    files: results,
    rollbackManifestId,
    errors,
    durationMs: Date.now() - startTime,
    spaceDelta: 0, // TODO: Calculate actual space delta
  };
}
```

### 2.8 Main Organization Method

```typescript
/**
 * Main entry point for system directory organization
 */
async organizeSystemDirectory(config: SystemOrganizeConfig): Promise<SystemOrganizeResult> {
  const startTime = Date.now();

  try {
    // 1. Detect system directories (S-H1, S-H8)
    const systemDirs = await this.detectSystemDirectories();
    const targetPath = await this.getSystemDirectoryPath(config.targetDir);

    if (!targetPath) {
      throw new Error(`System directory '${config.targetDir}' not found on this platform`);
    }

    // 2. Validate target directory
    const validatedTarget = await this.pathValidator.validatePath(targetPath, {
      requireExists: true,
      checkWrite: true,
    });

    logger.info(`Starting system organization`, {
      target: config.targetDir,
      path: validatedTarget,
      strategy: config.strategy,
    });

    // 3. Scan files in target directory
    const files = await this.scanner.scan(validatedTarget, {
      recursive: config.strategy !== "byCategory", // Flat scan for simple categorization
      includeHidden: config.includeHidden,
    });

    if (files.length === 0) {
      return {
        success: true,
        totalFiles: 0,
        movedFiles: 0,
        skippedFiles: 0,
        errorFiles: 0,
        files: [],
        errors: [],
        durationMs: Date.now() - startTime,
        spaceDelta: 0,
      };
    }

    // 4. Filter by minimum file age if specified
    let filteredFiles = files;
    if (config.minFileAgeDays && config.minFileAgeDays > 0) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - config.minFileAgeDays);

      filteredFiles = files.filter(f => f.modified < cutoffDate);
      logger.info(`Filtered by age: ${filteredFiles.length}/${files.length} files`);
    }

    // 5. Check disk space (S-H5)
    const spaceCheck = await this.verifySufficientSpace(validatedTarget, validatedTarget, 1.5);
    if (!spaceCheck.sufficient) {
      logger.error(`Insufficient disk space`, {
        required: spaceCheck.required,
        available: spaceCheck.available,
      });

      return {
        success: false,
        totalFiles: filteredFiles.length,
        movedFiles: 0,
        skippedFiles: 0,
        errorFiles: filteredFiles.length,
        files: [],
        errors: [{
          file: validatedTarget,
          error: `Insufficient disk space: ${spaceCheck.required} required, ${spaceCheck.available} available`,
          code: "INSUFFICIENT_SPACE",
          recoverable: false,
        }],
        durationMs: Date.now() - startTime,
        spaceDelta: 0,
      };
    }

    // 6. Generate organization plan
    const moves = await this.generateOrganizationPlan(filteredFiles, validatedTarget, config);

    // 7. Execute batch moves with per-file handling (S-H4)
    const result = await this.executeBatchMoves(moves, {
      conflictResolution: config.conflictResolution,
      createRollback: config.createRollback,
      dryRun: config.dryRun,
    });

    logger.info(`System organization complete`, {
      total: result.totalFiles,
      moved: result.movedFiles,
      skipped: result.skippedFiles,
      errors: result.errorFiles,
      duration: result.durationMs,
    });

    return result;
  } catch (error) {
    logger.error(`System organization failed`, { error });

    return {
      success: false,
      totalFiles: 0,
      movedFiles: 0,
      skippedFiles: 0,
      errorFiles: 0,
      files: [],
      errors: [{
        file: config.targetDir,
        error: (error as Error).message,
        code: "DESTINATION_NOT_FOUND",
        recoverable: false,
      }],
      durationMs: Date.now() - startTime,
      spaceDelta: 0,
    };
  }
}

/**
 * Generate organization plan based on strategy
 */
private async generateOrganizationPlan(
  files: FileInfo[],
  targetDir: string,
  config: SystemOrganizeConfig,
): Promise<Array<{ source: string; destination: string; category: CategoryName }>> {
  const moves: Array<{ source: string; destination: string; category: CategoryName }> = [];

  for (const file of files) {
    const category = this.categorizer.categorize(file.name);

    // Filter by categories if specified
    if (config.categories && config.categories.length > 0) {
      if (!config.categories.includes(category)) {
        continue;
      }
    }

    let destDir: string;

    switch (config.strategy) {
      case "byCategory":
        destDir = path.join(targetDir, category);
        break;
      case "byDate": {
        const date = config.dateFormat === "YYYY"
          ? file.modified.getFullYear().toString()
          : `${file.modified.getFullYear()}-${String(file.modified.getMonth() + 1).padStart(2, "0")}`;
        destDir = path.join(targetDir, date);
        break;
      }
      case "byType": {
        const ext = file.extension.toLowerCase() || "no-extension";
        destDir = path.join(targetDir, ext);
        break;
      }
      case "bySize": {
        const sizeMB = file.size / (1024 * 1024);
        if (sizeMB < 1) {
          destDir = path.join(targetDir, "small");
        } else if (sizeMB < 100) {
          destDir = path.join(targetDir, "medium");
        } else {
          destDir = path.join(targetDir, "large");
        }
        break;
      }
      default:
        destDir = path.join(targetDir, category);
    }

    moves.push({
      source: file.path,
      destination: path.join(destDir, file.name),
      category,
    });
  }

  return moves;
}
```

---

## 3. Rollback Service Modifications (rollback.service.ts)

### 3.1 Extended Rollback Service

```typescript
/**
 * Extended RollbackService with system directory support (S-C2)
 *
 * MODIFICATIONS from original:
 * - Configurable allowed roots instead of hardcoded cwd/tmpdir
 * - Support for system directory operations
 * - Extended validation for rollback actions
 */

// ==================== NEW: Configurable allowed roots (S-C2) ====================

export interface RollbackServiceConfig {
  /** Storage directory for manifests */
  storageDir: string;
  /** Allowed root paths for rollback operations */
  allowedRoots: string[];
  /** Enable strict path validation */
  strictValidation: boolean;
}

// Modified constructor to accept configuration
export class RollbackService {
  private storageDir: string;
  private allowedRoots: string[];
  private strictValidation: boolean;

  constructor(config?: Partial<RollbackServiceConfig>) {
    // Default storage location
    this.storageDir =
      config?.storageDir ??
      path.join(process.cwd(), ".file-organizer-rollbacks");

    // S-C2: Configurable allowed roots instead of hardcoded cwd/tmpdir
    if (config?.allowedRoots && config.allowedRoots.length > 0) {
      this.allowedRoots = config.allowedRoots;
    } else {
      // Default: CWD + home directory
      this.allowedRoots = [process.cwd(), os.homedir(), os.tmpdir()];
    }

    this.strictValidation = config?.strictValidation ?? true;
  }

  /**
   * MODIFIED: isValidPath now uses configurable allowed roots
   * Addresses S-C2: Extend RollbackService for system directories
   */
  private isValidPath(filePath: string): boolean {
    if (!filePath || typeof filePath !== "string") return false;

    // Prevent path traversal
    const resolved = path.resolve(filePath);

    // Check against allowed roots
    return this.allowedRoots.some((root) => {
      const resolvedRoot = path.resolve(root);
      return (
        resolved.startsWith(resolvedRoot) || isSubPath(resolvedRoot, resolved)
      );
    });
  }

  /**
   * NEW: Add allowed root path dynamically
   */
  addAllowedRoot(rootPath: string): void {
    const resolved = path.resolve(rootPath);
    if (!this.allowedRoots.includes(resolved)) {
      this.allowedRoots.push(resolved);
      logger.info(`Added allowed root for rollback: ${resolved}`);
    }
  }

  /**
   * NEW: Remove allowed root path
   */
  removeAllowedRoot(rootPath: string): void {
    const resolved = path.resolve(rootPath);
    this.allowedRoots = this.allowedRoots.filter((r) => r !== resolved);
    logger.info(`Removed allowed root for rollback: ${resolved}`);
  }

  /**
   * NEW: Get current allowed roots
   */
  getAllowedRoots(): string[] {
    return [...this.allowedRoots];
  }

  /**
   * MODIFIED: rollback method with extended validation
   */
  async rollback(
    manifestId: string,
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    // Validate ID format (UUID)
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        manifestId,
      )
    ) {
      throw new Error(`Invalid manifest ID format: ${manifestId}`);
    }

    await this.ensureStorage();
    const filePath = path.join(this.storageDir, `${manifestId}.json`);

    if (!(await fileExists(filePath))) {
      throw new Error(`Manifest ${manifestId} not found`);
    }

    let manifest: RollbackManifest;
    try {
      const content = await fs.readFile(filePath, "utf-8");
      manifest = JSON.parse(content);
    } catch (error) {
      throw new Error(
        `Failed to parse manifest ${manifestId}: ${(error as Error).message}`,
      );
    }

    const results = { success: 0, failed: 0, errors: [] as string[] };
    const reverseActions = [...manifest.actions].reverse();

    for (const action of reverseActions) {
      try {
        // Validate paths using new isValidPath
        if (action.originalPath && !this.isValidPath(action.originalPath)) {
          throw new Error(
            `Invalid original path: ${action.originalPath}. ` +
              `Allowed roots: ${this.allowedRoots.join(", ")}`,
          );
        }
        if (action.currentPath && !this.isValidPath(action.currentPath)) {
          throw new Error(
            `Invalid current path: ${action.currentPath}. ` +
              `Allowed roots: ${this.allowedRoots.join(", ")}`,
          );
        }

        // ... rest of rollback logic remains the same ...
        // (move/copy/delete handling from original implementation)

        if (
          (action.type === "move" || action.type === "rename") &&
          action.currentPath
        ) {
          try {
            await fs.access(action.currentPath);
          } catch {
            throw new Error(`Current file not found: ${action.currentPath}`);
          }

          await fs.mkdir(path.dirname(action.originalPath), {
            recursive: true,
          });

          try {
            await fs.rename(action.currentPath, action.originalPath);
          } catch (e) {
            const err = e as NodeJS.ErrnoException;
            if (err.code === "EEXIST") {
              throw new Error(
                `Destination already exists: ${action.originalPath}`,
              );
            }
            if (err.code === "EPERM" || err.code === "EBUSY") {
              throw new Error(`File locked or in use: ${action.currentPath}`);
            }
            throw e;
          }

          if (action.overwrittenBackupPath) {
            try {
              await fs.rename(action.overwrittenBackupPath, action.currentPath);
            } catch (e) {
              const err = e as NodeJS.ErrnoException;
              if (err.code === "ENOENT") {
                results.errors.push(
                  `Backup missing: ${action.overwrittenBackupPath}`,
                );
                results.failed++;
                continue;
              }
              throw e;
            }
          }

          results.success++;
        } else if (action.type === "copy" && action.currentPath) {
          try {
            await fs.access(action.currentPath);
            await fs.unlink(action.currentPath);
            results.success++;
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code === "ENOENT") {
              results.errors.push(`File not found: ${action.currentPath}`);
              results.failed++;
            } else {
              throw e;
            }
          }
        } else if (action.type === "delete") {
          if (!action.backupPath) {
            results.failed++;
            results.errors.push(`No backup path for deleted file`);
            continue;
          }

          await fs.mkdir(path.dirname(action.originalPath), {
            recursive: true,
          });

          try {
            await fs.rename(action.backupPath, action.originalPath);
          } catch (e) {
            const err = e as NodeJS.ErrnoException;
            if (err.code === "ENOENT") {
              results.failed++;
              results.errors.push(`Backup not found: ${action.backupPath}`);
              continue;
            }
            if (err.code === "EEXIST") {
              throw new Error(`Destination exists: ${action.originalPath}`);
            }
            throw e;
          }
          results.success++;
        }
      } catch (error) {
        results.failed++;
        results.errors.push(
          `Failed to undo ${action.type}: ${(error as Error).message}`,
        );
      }
    }

    // Cleanup manifest
    try {
      await fs.unlink(filePath);
    } catch (e) {
      throw new Error(
        `Rollback completed but failed to delete manifest: ${(e as Error).message}`,
      );
    }

    return results;
  }
}
```

---

## 4. System Organization Tool (system-organization.ts)

### 4.1 Tool Definition

```typescript
/**
 * File Organizer MCP Server v3.4.0
 * System Organization Tool
 *
 * @module tools/system-organization
 */

import { z } from "zod";
import type { ToolDefinition, ToolResponse } from "../types.js";
import { SystemOrganizeService } from "../services/system-organize.service.js";
import { createErrorResponse } from "../utils/error-handler.js";

export const SystemOrganizationInputSchema = z.object({
  target_directory: z
    .enum([
      "Desktop",
      "Documents",
      "Downloads",
      "Pictures",
      "Music",
      "Videos",
      "Movies",
      "Photos",
      "Trash",
      "Temp",
      "Home",
    ])
    .describe("System directory to organize"),

  strategy: z
    .enum(["byCategory", "byDate", "byType", "bySize"])
    .default("byCategory")
    .describe("Organization strategy"),

  date_format: z
    .enum(["YYYY/MM", "YYYY-MM", "YYYY"])
    .optional()
    .describe("Date format for byDate strategy"),

  size_thresholds: z
    .array(z.number())
    .optional()
    .describe("Size thresholds for bySize strategy (in MB)"),

  conflict_resolution: z
    .enum(["rename", "skip", "overwrite", "overwriteIfNewer"])
    .default("rename")
    .describe("How to handle file name conflicts"),

  create_rollback: z
    .boolean()
    .default(true)
    .describe("Create rollback manifest for undo"),

  dry_run: z
    .boolean()
    .default(false)
    .describe("Preview changes without executing"),

  categories: z
    .array(z.string())
    .optional()
    .describe("Categories to organize (empty = all)"),

  min_file_age_days: z
    .number()
    .min(0)
    .optional()
    .describe("Skip files newer than N days"),

  include_hidden: z.boolean().default(false).describe("Include hidden files"),

  response_format: z
    .enum(["json", "markdown"])
    .default("markdown")
    .describe("Response format"),
});

export type SystemOrganizationInput = z.infer<
  typeof SystemOrganizationInputSchema
>;

export const systemOrganizationToolDefinition: ToolDefinition = {
  name: "file_organizer_system_organization",
  title: "System Organization",
  description:
    "Organize files within system directories (Desktop, Downloads, Documents, etc.) " +
    "with automatic rollback support and cross-platform compatibility. " +
    "Supports organization by category, date, file type, or size.",
  inputSchema: {
    type: "object",
    properties: {
      target_directory: {
        type: "string",
        enum: [
          "Desktop",
          "Documents",
          "Downloads",
          "Pictures",
          "Music",
          "Videos",
          "Movies",
          "Photos",
          "Trash",
          "Temp",
          "Home",
        ],
        description: "System directory to organize",
      },
      strategy: {
        type: "string",
        enum: ["byCategory", "byDate", "byType", "bySize"],
        default: "byCategory",
        description: "Organization strategy",
      },
      date_format: {
        type: "string",
        enum: ["YYYY/MM", "YYYY-MM", "YYYY"],
        description: "Date format for byDate strategy",
      },
      size_thresholds: {
        type: "array",
        items: { type: "number" },
        description: "Size thresholds for bySize strategy (in MB)",
      },
      conflict_resolution: {
        type: "string",
        enum: ["rename", "skip", "overwrite", "overwriteIfNewer"],
        default: "rename",
        description: "How to handle file name conflicts",
      },
      create_rollback: {
        type: "boolean",
        default: true,
        description: "Create rollback manifest for undo",
      },
      dry_run: {
        type: "boolean",
        default: false,
        description: "Preview changes without executing",
      },
      categories: {
        type: "array",
        items: { type: "string" },
        description: "Categories to organize (empty = all)",
      },
      min_file_age_days: {
        type: "number",
        minimum: 0,
        description: "Skip files newer than N days",
      },
      include_hidden: {
        type: "boolean",
        default: false,
        description: "Include hidden files",
      },
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        default: "markdown",
        description: "Response format",
      },
    },
    required: ["target_directory"],
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
};
```

### 4.2 Tool Handler

```typescript
export async function handleSystemOrganization(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = SystemOrganizationInputSchema.safeParse(args);
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

    const service = new SystemOrganizeService();

    // Map input to config
    const config = {
      targetDir: parsed.data.target_directory,
      strategy: parsed.data.strategy,
      dateFormat: parsed.data.date_format,
      sizeThresholds: parsed.data.size_thresholds,
      conflictResolution: parsed.data.conflict_resolution,
      createRollback: parsed.data.create_rollback,
      dryRun: parsed.data.dry_run,
      categories: parsed.data.categories as any,
      minFileAgeDays: parsed.data.min_file_age_days,
      includeHidden: parsed.data.include_hidden,
    };

    const result = await service.organizeSystemDirectory(config);

    if (parsed.data.response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    // Markdown format
    let markdown = `### System Organization Results\n\n`;
    markdown += `**Target:** ${parsed.data.target_directory}\n`;
    markdown += `**Strategy:** ${parsed.data.strategy}\n`;
    markdown += `**Status:** ${result.success ? "✓ Success" : "✗ Failed"}\n\n`;

    markdown += `#### Statistics\n\n`;
    markdown += `- **Total Files:** ${result.totalFiles}\n`;
    markdown += `- **Moved:** ${result.movedFiles}\n`;
    markdown += `- **Skipped:** ${result.skippedFiles}\n`;
    markdown += `- **Errors:** ${result.errorFiles}\n`;
    markdown += `- **Duration:** ${(result.durationMs / 1000).toFixed(2)}s\n`;

    if (result.rollbackManifestId) {
      markdown += `- **Rollback ID:** \`${result.rollbackManifestId}\`\n`;
    }

    if (result.errors.length > 0) {
      markdown += `\n#### Errors\n\n`;
      markdown += "| File | Error | Code |\n";
      markdown += "|------|-------|------|\n";

      for (const error of result.errors.slice(0, 10)) {
        const fileName = error.file.split("/").pop() || error.file;
        markdown += `| ${fileName} | ${error.error.substring(0, 40)}... | ${error.code} |\n`;
      }

      if (result.errors.length > 10) {
        markdown += `\n*... and ${result.errors.length - 10} more errors*\n`;
      }
    }

    if (result.files.length > 0) {
      markdown += `\n#### Sample Operations\n\n`;
      markdown += "| Source | Destination | Action |\n";
      markdown += "|--------|-------------|--------|\n";

      const sampleFiles = result.files.slice(0, 5);
      for (const file of sampleFiles) {
        const sourceName = file.source.split("/").pop() || file.source;
        const destName = file.destination.split("/").pop() || file.destination;
        const action =
          file.action === "moved" ? "✓" : file.action === "skipped" ? "○" : "✗";
        markdown += `| ${sourceName} | ${destName} | ${action} |\n`;
      }

      if (result.files.length > 5) {
        markdown += `\n*... and ${result.files.length - 5} more files*\n`;
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

## 5. Server Integration

### 5.1 Register Tool

Add to `src/tools/index.ts`:

```typescript
import {
  systemOrganizationToolDefinition,
  handleSystemOrganization,
} from "./system-organization.js";

export const TOOLS: ToolDefinition[] = [
  // ... existing tools ...
  systemOrganizationToolDefinition,
];

export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  switch (name) {
    // ... existing cases ...
    case "file_organizer_system_organization":
      return handleSystemOrganization(args);
    // ...
  }
}
```

---

## 6. Test Requirements

### 6.1 Unit Tests

- `tests/unit/services/system-organize.service.test.ts`
  - System directory detection per platform
  - Disk space calculation accuracy
  - Collision detection logic
  - Atomic move verification
  - Locked file retry mechanism
  - Batch move error handling

### 6.2 Integration Tests

- `tests/integration/system-organization.test.ts`
  - End-to-end organization flow
  - Cross-platform directory detection
  - Rollback after system organization
  - Disk space pre-flight checks

### 6.3 Security Tests

- `tests/security/system-organization.test.ts`
  - Path validation for system directories
  - Lock file security (no stale locks)
  - Permission escalation prevention

---

## 7. Configuration Summary

```typescript
// System organization configuration
const SYSTEM_ORGANIZE_CONFIG = {
  // Retry configuration for locked files (S-H3)
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 500,
  RETRY_BACKOFF_MULTIPLIER: 2,

  // Lock file configuration (S-C3)
  LOCK_TIMEOUT_MS: 5000,
  LOCK_FILE_PREFIX: ".file-organizer-lock-",

  // Disk space safety factor (S-H5)
  DISK_SPACE_SAFETY_FACTOR: 1.5,

  // Batch processing
  BATCH_SIZE: 100,

  // Default strategies
  DEFAULT_STRATEGY: "byCategory",
  DEFAULT_CONFLICT_RESOLUTION: "rename",
};

// Extended rollback configuration (S-C2)
const ROLLBACK_CONFIG = {
  DEFAULT_ALLOWED_ROOTS: [process.cwd(), os.homedir(), os.tmpdir()],
  STRICT_VALIDATION: true,
};
```

---

## 8. Acceptance Criteria

- [ ] S-H1: macOS Movies folder correctly detected and used
- [ ] S-H8: All system directories detected on Windows, macOS, and Linux
- [ ] S-H5: Disk space check prevents operations with insufficient space
- [ ] S-H2: Path collisions detected before move operations
- [ ] S-H3: Locked files trigger retry with exponential backoff
- [ ] S-C3: Atomic moves verified with lock files
- [ ] S-C2: Rollback works for system directories outside cwd/tmpdir
- [ ] S-H4: Batch operations report per-file status
- [ ] Tool returns markdown summary with rollback ID
- [ ] All tests pass: unit, integration, security

---

## 9. Migration Plan

### 9.1 Backward Compatibility

- Existing `RollbackService` usage continues to work
- New extended constructor is optional
- Original `isValidPath` behavior preserved when no config provided

### 9.2 Deployment Steps

1. Update `types.ts` with new System Directory types
2. Create `system-organize.service.ts`
3. Modify `rollback.service.ts` (S-C2)
4. Create `system-organization.ts` tool
5. Update `tools/index.ts` with new exports
6. Update `server.ts` with tool handler
7. Run full test suite

---

_End of Phase 2 Implementation Plan_
