# Phase 3 - Smart Suggest Implementation Plan

**Version:** 3.4.0  
**Status:** Draft  
**Priority:** CRITICAL/HIGH

---

## Executive Summary

This phase implements the Smart Suggest feature for directory health analysis, addressing critical and high-priority issues related to graceful degradation, performance protection, mathematical edge cases, and intelligent context detection.

---

## Issues Addressed

| ID    | Severity | Issue                                         | Resolution                                        |
| ----- | -------- | --------------------------------------------- | ------------------------------------------------- |
| SS-C1 | CRITICAL | HashCalculatorService failures crash analysis | Graceful degradation with fallback scoring        |
| SS-C2 | CRITICAL | No checkpoint/resume for long operations      | Progress checkpoint system with resume capability |
| SS-C3 | CRITICAL | Cache versioning without mutex                | Async mutex with versioned cache keys             |
| SS-H1 | HIGH     | Log(0) in Shannon entropy calculation         | Epsilon fallback for zero probabilities           |
| SS-H4 | HIGH     | Division by zero for empty directories        | Guard clauses with early returns                  |
| SS-H2 | HIGH     | Mixed naming patterns not detected            | Multi-pattern detection with confidence scoring   |
| SS-H3 | HIGH     | No project detection confidence threshold     | Confidence scoring with marker-based detection    |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           server.ts                                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ handleToolCall()                                                 │   │
│  │   └── handleSmartSuggest()                                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    smart-suggest.service.ts (NEW)                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Core Analysis Methods:                                           │   │
│  │   ├── analyzeHealth()           - Main entry point               │   │
│  │   ├── calculateFileTypeEntropy() - Shannon entropy (SS-H1 fix)  │   │
│  │   ├── calculateNamingConsistency() - Multi-pattern (SS-H2 fix)  │   │
│  │   ├── calculateDepthBalance()   - Directory depth scoring        │   │
│  │   ├── calculateDuplicateRatio() - With graceful fallback(SS-C1) │   │
│  │   └── calculateMisplacedFiles() - Project detection (SS-H3 fix) │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Protection & State:                                              │   │
│  │   ├── CheckpointManager         - Progress tracking (SS-C2)     │   │
│  │   ├── CacheManager              - Versioned with mutex (SS-C3)  │   │
│  │   └── TimeoutGuard              - Operation timeouts             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
        ┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
        │ HashCalculator  │ │ FileScanner │ │ MetadataService │
        │    Service      │ │   Service   │ │                 │
        └─────────────────┘ └─────────────┘ └─────────────────┘
```

---

## 1. New Types (types.ts)

### 1.1 Smart Suggest Types

```typescript
// ==================== Smart Suggest Types ====================

/**
 * Directory health grade based on weighted score
 */
export type HealthGrade = "A" | "B" | "C" | "D" | "F";

/**
 * Naming convention patterns
 */
export type NamingPattern =
  | "camelCase"
  | "kebab-case"
  | "snake_case"
  | "PascalCase"
  | "lowercase"
  | "UPPERCASE"
  | "mixed";

/**
 * Directory context type for misplaced file detection
 */
export type DirectoryContext =
  | "project" // Project directory (mixed types expected)
  | "thematic" // Thematic directory (some mixing expected)
  | "standard" // Standard directory (organized expected)
  | "empty"; // Empty or minimal directory

/**
 * Individual metric result with score and details
 */
export interface HealthMetric {
  /** Score 0-100 */
  score: number;
  /** Human-readable description */
  details: string;
  /** Raw data for debugging */
  raw?: unknown;
  /** Whether metric calculation had errors */
  hasErrors?: boolean;
}

/**
 * All five health metrics
 */
export interface HealthMetrics {
  fileTypeEntropy: HealthMetric;
  namingConsistency: HealthMetric;
  depthBalance: HealthMetric;
  duplicateRatio: HealthMetric;
  misplacedFiles: HealthMetric;
}

/**
 * Actionable suggestion with priority
 */
export interface Suggestion {
  /** Priority level */
  priority: "high" | "medium" | "low";
  /** Human-readable message */
  message: string;
  /** Related tool to fix the issue */
  suggestedTool?: string;
  /** Arguments for the suggested tool */
  suggestedArgs?: Record<string, unknown>;
  /** Expected score improvement */
  estimatedImprovement?: number;
}

/**
 * Quick win action that can be executed immediately
 */
export interface QuickWin {
  /** Description of the action */
  action: string;
  /** Expected score improvement */
  estimatedScoreImprovement: number;
  /** Tool to execute */
  tool: string;
  /** Arguments for the tool */
  args: Record<string, unknown>;
}

/**
 * Complete directory health report
 */
export interface DirectoryHealthReport {
  /** Overall health score 0-100 */
  score: number;
  /** Letter grade */
  grade: HealthGrade;
  /** Individual metrics */
  metrics: HealthMetrics;
  /** Actionable suggestions */
  suggestions: Suggestion[];
  /** Quick win actions */
  quickWins: QuickWin[];
  /** Analysis metadata */
  metadata: {
    directory: string;
    analyzedAt: string;
    fileCount: number;
    directoryCount: number;
    totalSizeBytes: number;
    durationMs: number;
    wasCached: boolean;
    sampleRate?: number;
  };
}

/**
 * Options for health analysis
 */
export interface SmartSuggestOptions {
  /** Include subdirectories in analysis */
  includeSubdirs?: boolean;
  /** Include duplicate detection (slower) */
  includeDuplicates?: boolean;
  /** Maximum files to analyze */
  maxFiles?: number;
  /** Timeout in seconds */
  timeoutSeconds?: number;
  /** Sample rate for large directories (0.1 = 10%) */
  sampleRate?: number;
  /** Use cached results */
  useCache?: boolean;
  /** Cache TTL in minutes */
  cacheTtlMinutes?: number;
}

/**
 * Checkpoint for resumable operations
 */
export interface AnalysisCheckpoint {
  /** Unique checkpoint ID */
  id: string;
  /** Directory being analyzed */
  directory: string;
  /** Current phase of analysis */
  phase: AnalysisPhase;
  /** Files processed so far */
  processedFiles: number;
  /** Total files discovered */
  totalFiles: number;
  /** Intermediate results */
  partialResults?: Partial<HealthMetrics>;
  /** Timestamp of checkpoint */
  timestamp: string;
  /** Estimated completion percentage */
  percentComplete: number;
}

/**
 * Analysis phases for checkpoint tracking
 */
export type AnalysisPhase =
  | "scanning"
  | "calculating_entropy"
  | "calculating_naming"
  | "calculating_depth"
  | "calculating_duplicates"
  | "calculating_misplaced"
  | "generating_suggestions"
  | "complete";

/**
 * Cache entry with versioning
 */
export interface SmartSuggestCacheEntry {
  /** Cache version for invalidation */
  version: number;
  /** Cached report */
  report: DirectoryHealthReport;
  /** Expiration timestamp */
  expiresAt: number;
  /** Cache key components */
  key: {
    directory: string;
    includeSubdirs: boolean;
    includeDuplicates: boolean;
    sampleRate: number;
  };
}

/**
 * Naming pattern detection result
 */
export interface NamingPatternResult {
  /** Detected pattern */
  pattern: NamingPattern;
  /** Confidence 0-1 */
  confidence: number;
  /** Percentage of files matching */
  coverage: number;
  /** Example filenames */
  examples: string[];
}

/**
 * Project detection result with confidence
 */
export interface ProjectDetectionResult {
  /** Whether directory is a project */
  isProject: boolean;
  /** Detection confidence 0-1 */
  confidence: number;
  /** Matched markers */
  matchedMarkers: string[];
  /** Context type */
  context: DirectoryContext;
}
```

### 1.2 Error Types

```typescript
/**
 * Smart Suggest specific errors
 */
export class SmartSuggestError extends Error {
  constructor(
    message: string,
    public readonly code: SmartSuggestErrorCode,
    public readonly checkpointId?: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "SmartSuggestError";
  }
}

export type SmartSuggestErrorCode =
  | "SS_TIMEOUT"
  | "SS_MAX_FILES_EXCEEDED"
  | "SS_CHECKPOINT_FAILED"
  | "SS_CACHE_ERROR"
  | "SS_HASH_FAILED"
  | "SS_INVALID_DIRECTORY"
  | "SS_RESUME_FAILED";
```

---

## 2. Configuration (config.ts)

### 2.1 Smart Suggest Constants

```typescript
/**
 * Smart Suggest configuration constants
 */
export const SMART_SUGGEST_CONFIG = {
  /** Default weights for scoring (must sum to 1.0) */
  WEIGHTS: {
    fileTypeEntropy: 0.25,
    namingConsistency: 0.2,
    depthBalance: 0.15,
    duplicateRatio: 0.2,
    misplacedFiles: 0.2,
  } as const,

  /** Analysis limits */
  DEFAULT_MAX_FILES: 10000,
  DEFAULT_TIMEOUT_SECONDS: 60,
  DEFAULT_SAMPLE_RATE: 1.0,

  /** Cache settings */
  DEFAULT_CACHE_TTL_MINUTES: 30,
  CACHE_VERSION: 1,
  MAX_CACHE_ENTRIES: 100,

  /** Checkpoint settings */
  CHECKPOINT_INTERVAL_MS: 5000, // Save every 5 seconds
  CHECKPOINT_MAX_AGE_MS: 3600000, // 1 hour max checkpoint age

  /** Mathematical guards */
  EPSILON: 1e-10, // For log(0) prevention
  MIN_FILES_FOR_ANALYSIS: 1,

  /** Project detection markers */
  PROJECT_MARKERS: [
    "package.json",
    ".git",
    "Makefile",
    "requirements.txt",
    "Cargo.toml",
    "pom.xml",
    "build.gradle",
    "CMakeLists.txt",
    "setup.py",
    "go.mod",
    "composer.json",
    "Gemfile",
    "pubspec.yaml",
    "pom.xml",
    "build.sbt",
    ".npmrc",
    ".yarnrc",
    "tsconfig.json",
    "webpack.config.js",
    "vite.config.ts",
    "Dockerfile",
    "docker-compose.yml",
    ".github",
    ".gitlab-ci.yml",
    "Jenkinsfile",
  ] as const,

  /** Thematic directory keywords */
  THEMATIC_KEYWORDS: [
    "project",
    "projects",
    "work",
    "personal",
    "temp",
    "temporary",
    "archive",
    "archives",
    "backup",
    "backups",
    "misc",
    "miscellaneous",
    " assorted",
    "various",
  ] as const,

  /** Optimal depth range */
  OPTIMAL_DEPTH_MIN: 2,
  OPTIMAL_DEPTH_MAX: 4,
  MAX_PENALTY_DEPTH: 6,

  /** Naming pattern thresholds */
  NAMING_CONSISTENCY_THRESHOLD: 0.8, // 80% for "consistent"
  PROJECT_CONFIDENCE_THRESHOLD: 0.7, // 70% confidence for project detection
} as const;

/**
 * Grade boundaries
 */
export const GRADE_BOUNDARIES = {
  A: 90,
  B: 75,
  C: 50,
  D: 25,
} as const;
```

---

## 3. Smart Suggest Service (smart-suggest.service.ts)

### 3.1 Service Structure

```typescript
/**
 * File Organizer MCP Server v3.4.0
 * Smart Suggest Service
 *
 * Provides directory health analysis with:
 * - Graceful degradation on HashCalculator failures (SS-C1)
 * - Checkpoint/resume for long operations (SS-C2)
 * - Versioned cache with mutex (SS-C3)
 * - Log(0) protection with epsilon (SS-H1)
 * - Multi-pattern naming detection (SS-H2)
 * - Project detection with confidence (SS-H3)
 * - Division by zero guards (SS-H4)
 */

import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import type {
  DirectoryHealthReport,
  HealthMetrics,
  HealthMetric,
  SmartSuggestOptions,
  AnalysisCheckpoint,
  AnalysisPhase,
  NamingPattern,
  NamingPatternResult,
  ProjectDetectionResult,
  DirectoryContext,
  QuickWin,
  Suggestion,
  SmartSuggestCacheEntry,
} from "../types.js";
import { SmartSuggestError } from "../types.js";
import { SMART_SUGGEST_CONFIG, GRADE_BOUNDARIES } from "../config.js";
import { HashCalculatorService } from "./hash-calculator.service.js";
import { FileScannerService } from "./file-scanner.service.js";
import { CategorizerService } from "./categorizer.service.js";
import { logger } from "../utils/logger.js";
import { fileExists } from "../utils/file-utils.js";

/**
 * Async mutex for cache operations
 */
class AsyncMutex {
  private promise: Promise<void> = Promise.resolve();

  async acquire(): Promise<() => void> {
    let release: () => void;
    const newPromise = new Promise<void>((resolve) => {
      release = resolve;
    });
    const wait = this.promise;
    this.promise = this.promise.then(() => newPromise);
    await wait;
    return () => release();
  }
}

/**
 * Checkpoint manager for resumable operations
 */
class CheckpointManager {
  private checkpoints = new Map<string, AnalysisCheckpoint>();

  async saveCheckpoint(
    directory: string,
    phase: AnalysisPhase,
    processedFiles: number,
    totalFiles: number,
    partialResults?: Partial<HealthMetrics>,
  ): Promise<string> {
    const id = randomUUID();
    const checkpoint: AnalysisCheckpoint = {
      id,
      directory,
      phase,
      processedFiles,
      totalFiles,
      partialResults,
      timestamp: new Date().toISOString(),
      percentComplete: totalFiles > 0 ? (processedFiles / totalFiles) * 100 : 0,
    };

    this.checkpoints.set(id, checkpoint);
    logger.debug("Checkpoint saved", {
      id,
      phase,
      percentComplete: checkpoint.percentComplete,
    });
    return id;
  }

  async getCheckpoint(id: string): Promise<AnalysisCheckpoint | null> {
    const checkpoint = this.checkpoints.get(id);
    if (!checkpoint) return null;

    // Check if checkpoint is still valid
    const age = Date.now() - new Date(checkpoint.timestamp).getTime();
    if (age > SMART_SUGGEST_CONFIG.CHECKPOINT_MAX_AGE_MS) {
      this.checkpoints.delete(id);
      return null;
    }

    return checkpoint;
  }

  async deleteCheckpoint(id: string): Promise<void> {
    this.checkpoints.delete(id);
  }

  async resumeFromCheckpoint(
    id: string,
  ): Promise<{
    checkpoint: AnalysisCheckpoint;
    resumePhase: AnalysisPhase;
  } | null> {
    const checkpoint = await this.getCheckpoint(id);
    if (!checkpoint) return null;

    return {
      checkpoint,
      resumePhase: checkpoint.phase,
    };
  }
}

/**
 * Versioned cache manager with mutex protection
 */
class CacheManager {
  private cache = new Map<string, SmartSuggestCacheEntry>();
  private mutex = new AsyncMutex();
  private currentVersion = SMART_SUGGEST_CONFIG.CACHE_VERSION;

  private getCacheKey(directory: string, options: SmartSuggestOptions): string {
    return `${directory}:${JSON.stringify({
      includeSubdirs: options.includeSubdirs ?? true,
      includeDuplicates: options.includeDuplicates ?? true,
      sampleRate: options.sampleRate ?? 1.0,
    })}`;
  }

  async get(
    directory: string,
    options: SmartSuggestOptions,
  ): Promise<DirectoryHealthReport | null> {
    const release = await this.mutex.acquire();
    try {
      const key = this.getCacheKey(directory, options);
      const entry = this.cache.get(key);

      if (!entry) return null;

      // Check version
      if (entry.version !== this.currentVersion) {
        this.cache.delete(key);
        return null;
      }

      // Check expiration
      if (Date.now() > entry.expiresAt) {
        this.cache.delete(key);
        return null;
      }

      logger.debug("Cache hit", { directory, version: entry.version });
      return entry.report;
    } finally {
      release();
    }
  }

  async set(
    directory: string,
    options: SmartSuggestOptions,
    report: DirectoryHealthReport,
    ttlMinutes: number,
  ): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      // Enforce max entries
      if (this.cache.size >= SMART_SUGGEST_CONFIG.MAX_CACHE_ENTRIES) {
        // Remove oldest entry
        const oldest = Array.from(this.cache.entries()).sort(
          (a, b) => a[1].expiresAt - b[1].expiresAt,
        )[0];
        if (oldest) {
          this.cache.delete(oldest[0]);
        }
      }

      const key = this.getCacheKey(directory, options);
      const entry: SmartSuggestCacheEntry = {
        version: this.currentVersion,
        report,
        expiresAt: Date.now() + ttlMinutes * 60 * 1000,
        key: {
          directory,
          includeSubdirs: options.includeSubdirs ?? true,
          includeDuplicates: options.includeDuplicates ?? true,
          sampleRate: options.sampleRate ?? 1.0,
        },
      };

      this.cache.set(key, entry);
      logger.debug("Cache set", { directory, version: this.currentVersion });
    } finally {
      release();
    }
  }

  async invalidateVersion(): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      this.currentVersion++;
      this.cache.clear();
      logger.info("Cache invalidated", { newVersion: this.currentVersion });
    } finally {
      release();
    }
  }

  async clear(): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      this.cache.clear();
    } finally {
      release();
    }
  }
}

/**
 * Timeout guard for operation cancellation
 */
class TimeoutGuard {
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  start(timeoutMs: number, onTimeout: () => void): void {
    this.timeoutId = setTimeout(() => {
      logger.warn("Operation timed out");
      onTimeout();
    }, timeoutMs);
  }

  clear(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}

/**
 * Main Smart Suggest Service
 */
export class SmartSuggestService {
  private static instance: SmartSuggestService;
  private hashCalculator: HashCalculatorService;
  private fileScanner: FileScannerService;
  private categorizer: CategorizerService;
  private checkpointManager: CheckpointManager;
  private cacheManager: CacheManager;

  private constructor() {
    this.hashCalculator = new HashCalculatorService();
    this.fileScanner = new FileScannerService();
    this.categorizer = new CategorizerService();
    this.checkpointManager = new CheckpointManager();
    this.cacheManager = new CacheManager();
  }

  static getInstance(): SmartSuggestService {
    if (!SmartSuggestService.instance) {
      SmartSuggestService.instance = new SmartSuggestService();
    }
    return SmartSuggestService.instance;
  }

  // ... implementation methods below
}
```

### 3.2 Main Analysis Method

```typescript
/**
   * Analyze directory health with full protection mechanisms
   * @param directory - Directory to analyze
   * @param options - Analysis options
   * @param resumeCheckpointId - Optional checkpoint to resume from
   * @returns Directory health report
   */
public async analyzeHealth(
  directory: string,
  options: SmartSuggestOptions = {},
  resumeCheckpointId?: string,
): Promise<DirectoryHealthReport> {
  const startTime = Date.now();
  const resolvedOptions = this.resolveOptions(options);

  // SS-C2: Check for resume checkpoint
  if (resumeCheckpointId) {
    const resume = await this.checkpointManager.resumeFromCheckpoint(resumeCheckpointId);
    if (resume) {
      logger.info("Resuming analysis from checkpoint", {
        checkpointId: resumeCheckpointId,
        phase: resume.resumePhase,
      });
      return this.resumeAnalysis(directory, resolvedOptions, resume.checkpoint);
    }
  }

  // SS-C3: Check cache first
  if (resolvedOptions.useCache) {
    const cached = await this.cacheManager.get(directory, resolvedOptions);
    if (cached) {
      return {
        ...cached,
        metadata: {
          ...cached.metadata,
          wasCached: true,
        },
      };
    }
  }

  // Set up timeout guard
  const timeoutGuard = new TimeoutGuard();
  let isTimedOut = false;

  timeoutGuard.start(resolvedOptions.timeoutSeconds! * 1000, () => {
    isTimedOut = true;
  });

  try {
    // Validate directory
    if (!(await fileExists(directory))) {
      throw new SmartSuggestError(
        `Directory does not exist: ${directory}`,
        "SS_INVALID_DIRECTORY",
      );
    }

    // Scan directory
    const scanResult = await this.scanWithTimeout(
      directory,
      resolvedOptions,
      () => isTimedOut,
    );

    // SS-H4: Guard empty directory
    if (scanResult.files.length === 0) {
      return this.createEmptyDirectoryReport(directory, startTime);
    }

    // Calculate metrics in parallel with checkpointing
    const metrics = await this.calculateMetrics(
      scanResult,
      resolvedOptions,
      () => isTimedOut,
    );

    // Generate suggestions and quick wins
    const suggestions = this.generateSuggestions(metrics, scanResult);
    const quickWins = this.generateQuickWins(metrics, scanResult);

    // Calculate final score
    const score = this.calculateWeightedScore(metrics);
    const grade = this.scoreToGrade(score);

    const report: DirectoryHealthReport = {
      score,
      grade,
      metrics,
      suggestions,
      quickWins,
      metadata: {
        directory,
        analyzedAt: new Date().toISOString(),
        fileCount: scanResult.files.length,
        directoryCount: scanResult.directories.length,
        totalSizeBytes: scanResult.totalSize,
        durationMs: Date.now() - startTime,
        wasCached: false,
        sampleRate: resolvedOptions.sampleRate,
      },
    };

    // SS-C3: Cache the result
    if (resolvedOptions.useCache) {
      await this.cacheManager.set(
        directory,
        resolvedOptions,
        report,
        resolvedOptions.cacheTtlMinutes!,
      );
    }

    return report;
  } catch (error) {
    if (isTimedOut) {
      throw new SmartSuggestError(
        `Analysis timed out after ${resolvedOptions.timeoutSeconds} seconds`,
        "SS_TIMEOUT",
      );
    }
    throw error;
  } finally {
    timeoutGuard.clear();
  }
}

/**
 * Resolve options with defaults
 */
private resolveOptions(options: SmartSuggestOptions): Required<SmartSuggestOptions> {
  return {
    includeSubdirs: options.includeSubdirs ?? true,
    includeDuplicates: options.includeDuplicates ?? true,
    maxFiles: options.maxFiles ?? SMART_SUGGEST_CONFIG.DEFAULT_MAX_FILES,
    timeoutSeconds: options.timeoutSeconds ?? SMART_SUGGEST_CONFIG.DEFAULT_TIMEOUT_SECONDS,
    sampleRate: options.sampleRate ?? SMART_SUGGEST_CONFIG.DEFAULT_SAMPLE_RATE,
    useCache: options.useCache ?? true,
    cacheTtlMinutes: options.cacheTtlMinutes ?? SMART_SUGGEST_CONFIG.DEFAULT_CACHE_TTL_MINUTES,
  };
}

/**
 * Create report for empty directory (SS-H4 fix)
 */
private createEmptyDirectoryReport(
  directory: string,
  startTime: number,
): DirectoryHealthReport {
  return {
    score: 100,  // Empty directory is "perfect"
    grade: "A",
    metrics: {
      fileTypeEntropy: { score: 100, details: "Empty directory - no files to analyze" },
      namingConsistency: { score: 100, details: "Empty directory - no files to analyze" },
      depthBalance: { score: 100, details: "Empty directory - no depth to analyze" },
      duplicateRatio: { score: 100, details: "Empty directory - no duplicates possible" },
      misplacedFiles: { score: 100, details: "Empty directory - no files to analyze" },
    },
    suggestions: [],
    quickWins: [],
    metadata: {
      directory,
      analyzedAt: new Date().toISOString(),
      fileCount: 0,
      directoryCount: 0,
      totalSizeBytes: 0,
      durationMs: Date.now() - startTime,
      wasCached: false,
    },
  };
}
```

### 3.3 Scanning with Checkpoint Support

```typescript
/**
 * Scan result structure
 */
private interface ScanResult {
  files: Array<{
    name: string;
    path: string;
    size: number;
    extension: string;
    depth: number;
    directory: string;
  }>;
  directories: string[];
  totalSize: number;
  fileTypes: Map<string, number>;
  maxDepth: number;
}

/**
 * Scan directory with timeout and limit checks
 */
private async scanWithTimeout(
  directory: string,
  options: Required<SmartSuggestOptions>,
  isTimedOut: () => boolean,
): Promise<ScanResult> {
  const files: ScanResult["files"] = [];
  const directories: string[] = [];
  let totalSize = 0;
  const fileTypes = new Map<string, number>();
  let maxDepth = 0;

  const scanDir = async (dir: string, depth: number): Promise<void> => {
    if (isTimedOut()) return;

    // Track max depth
    maxDepth = Math.max(maxDepth, depth);

    // Check file limit
    if (files.length >= options.maxFiles) {
      throw new SmartSuggestError(
        `Maximum file limit (${options.maxFiles}) exceeded`,
        "SS_MAX_FILES_EXCEEDED",
      );
    }

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;  // Skip inaccessible directories
    }

    for (const entry of entries) {
      if (isTimedOut()) return;

      if (entry.name.startsWith(".")) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isFile()) {
        // Apply sampling if needed
        if (options.sampleRate < 1.0 && Math.random() > options.sampleRate) {
          continue;
        }

        try {
          const stats = await fs.stat(fullPath);
          const extension = path.extname(entry.name).toLowerCase() || "(no extension)";

          files.push({
            name: entry.name,
            path: fullPath,
            size: stats.size,
            extension,
            depth,
            directory: dir,
          });

          totalSize += stats.size;
          fileTypes.set(extension, (fileTypes.get(extension) || 0) + 1);
        } catch {
          // Skip inaccessible files
        }
      } else if (entry.isDirectory() && options.includeSubdirs) {
        directories.push(fullPath);
        await scanDir(fullPath, depth + 1);
      }
    }
  };

  await scanDir(directory, 0);

  return { files, directories, totalSize, fileTypes, maxDepth };
}
```

### 3.4 Shannon Entropy with Log(0) Protection (SS-H1 Fix)

```typescript
/**
 * Calculate Shannon entropy of file types with log(0) protection
 * SS-H1: Uses EPSILON fallback when probability is 0
 *
 * Formula: H = -Σ(p × log₂(p))
 * Normalized: score = 100 × (1 - H / log₂(uniqueTypes))
 */
private calculateFileTypeEntropy(
  fileTypes: Map<string, number>,
  totalFiles: number,
): HealthMetric {
  // SS-H4: Guard empty directory
  if (totalFiles === 0 || fileTypes.size === 0) {
    return {
      score: 100,
      details: "No files to analyze",
      raw: { entropy: 0, uniqueTypes: 0 },
    };
  }

  // SS-H4: Guard single file
  if (fileTypes.size === 1) {
    return {
      score: 100,
      details: "Single file type - perfectly organized",
      raw: { entropy: 0, uniqueTypes: 1 },
    };
  }

  let entropy = 0;
  const epsilon = SMART_SUGGEST_CONFIG.EPSILON;

  for (const [, count] of fileTypes) {
    const probability = count / totalFiles;

    // SS-H1: Guard log(0) with epsilon fallback
    // When probability is 0 or very small, use epsilon to avoid log(0)
    const safeProbability = probability < epsilon ? epsilon : probability;
    entropy -= safeProbability * Math.log2(safeProbability);
  }

  // Normalize entropy: max entropy is log2(uniqueTypes) when uniform
  const maxEntropy = Math.log2(fileTypes.size);
  const normalizedEntropy = entropy / maxEntropy;

  // Invert: uniform distribution (high entropy) = disorganized = low score
  // Concentrated distribution (low entropy) = organized = high score
  const score = Math.round((1 - normalizedEntropy) * 100);

  let details: string;
  if (score >= 90) {
    details = `Excellent file type concentration (${fileTypes.size} types)`;
  } else if (score >= 70) {
    details = `Good file type organization (${fileTypes.size} types)`;
  } else if (score >= 50) {
    details = `Moderate type mixing (${fileTypes.size} types)`;
  } else {
    details = `High type entropy - consider organizing by type (${fileTypes.size} types)`;
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    details,
    raw: { entropy, maxEntropy, normalizedEntropy, uniqueTypes: fileTypes.size },
  };
}
```

### 3.5 Multi-Pattern Naming Detection (SS-H2 Fix)

```typescript
/**
 * Detect naming pattern in filename
 */
private detectNamingPattern(filename: string): NamingPattern {
  const name = path.basename(filename, path.extname(filename));

  // Empty or special cases
  if (!name || name.length === 0) return "mixed";

  // Check for each pattern
  const patterns: Array<{ pattern: NamingPattern; regex: RegExp; match: () => boolean }> = [
    {
      pattern: "kebab-case",
      regex: /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/,
      match: () => name.includes("-") && /^[a-z]/.test(name),
    },
    {
      pattern: "snake_case",
      regex: /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/,
      match: () => name.includes("_") && /^[a-z]/.test(name) && !name.includes("-"),
    },
    {
      pattern: "camelCase",
      regex: /^[a-z][a-zA-Z0-9]*$/,
      match: () => /^[a-z]/.test(name) && /[A-Z]/.test(name) && !name.includes("-") && !name.includes("_"),
    },
    {
      pattern: "PascalCase",
      regex: /^[A-Z][a-zA-Z0-9]*$/,
      match: () => /^[A-Z]/.test(name) && !name.includes("-") && !name.includes("_"),
    },
    {
      pattern: "lowercase",
      regex: /^[a-z0-9]+$/,
      match: () => /^[a-z0-9]+$/.test(name) && !name.includes("-") && !name.includes("_"),
    },
    {
      pattern: "UPPERCASE",
      regex: /^[A-Z0-9_]+$/,
      match: () => /^[A-Z0-9_]+$/.test(name),
    },
  ];

  for (const { pattern, match } of patterns) {
    if (match()) return pattern;
  }

  return "mixed";
}

/**
 * Calculate naming consistency with multi-pattern detection
 * SS-H2: Detects mixed patterns across directories with confidence scoring
 */
private calculateNamingConsistency(
  files: ScanResult["files"],
): HealthMetric {
  // SS-H4: Guard empty/single file
  if (files.length === 0) {
    return { score: 100, details: "No files to analyze" };
  }
  if (files.length === 1) {
    return { score: 100, details: "Single file - naming consistent" };
  }

  // Group files by directory
  const filesByDir = new Map<string, typeof files>();
  for (const file of files) {
    const dirFiles = filesByDir.get(file.directory) || [];
    dirFiles.push(file);
    filesByDir.set(file.directory, dirFiles);
  }

  // Calculate pattern distribution per directory
  const dirScores: number[] = [];
  const patternBreakdown: Array<{ directory: string; dominantPattern: string; coverage: number }> = [];

  for (const [dir, dirFiles] of filesByDir) {
    if (dirFiles.length < 2) {
      dirScores.push(100);  // Single file = consistent
      continue;
    }

    // Count patterns
    const patternCounts = new Map<NamingPattern, number>();
    for (const file of dirFiles) {
      const pattern = this.detectNamingPattern(file.name);
      patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);
    }

    // Find dominant pattern
    let dominantPattern: NamingPattern = "mixed";
    let dominantCount = 0;
    for (const [pattern, count] of patternCounts) {
      if (count > dominantCount) {
        dominantCount = count;
        dominantPattern = pattern;
      }
    }

    // Calculate coverage (files matching dominant pattern)
    const coverage = dominantCount / dirFiles.length;
    const dirScore = Math.round(coverage * 100);
    dirScores.push(dirScore);

    patternBreakdown.push({
      directory: path.basename(dir),
      dominantPattern,
      coverage: Math.round(coverage * 100),
    });
  }

  // Average scores across directories
  const avgScore = Math.round(dirScores.reduce((a, b) => a + b, 0) / dirScores.length);

  // Detect mixed naming across project
  const allPatterns = new Set<NamingPattern>();
  for (const breakdown of patternBreakdown) {
    if (breakdown.coverage < 100) {
      allPatterns.add(breakdown.dominantPattern as NamingPattern);
    }
  }

  let details: string;
  if (avgScore >= 90) {
    details = `Excellent naming consistency across ${filesByDir.size} directories`;
  } else if (avgScore >= 70) {
    details = `Good naming consistency (${avgScore}% average coverage)`;
  } else if (avgScore >= 50) {
    details = `Mixed naming patterns detected - consider standardizing`;
  } else {
    details = `Inconsistent naming - strong recommendation to standardize`;
  }

  return {
    score: avgScore,
    details,
    raw: {
      directoryCount: filesByDir.size,
      patternBreakdown,
      mixedPatterns: allPatterns.size > 1,
    },
  };
}
```

### 3.6 Depth Balance Calculation

```typescript
/**
 * Calculate depth balance score
 * Optimal depth: 2-4 levels
 * Penalty for >6 or all-in-root
 */
private calculateDepthBalance(
  maxDepth: number,
  fileCount: number,
): HealthMetric {
  // SS-H4: Guard empty/single file
  if (fileCount <= 1) {
    return {
      score: 100,
      details: "Insufficient data for depth analysis",
      raw: { maxDepth: 0 },
    };
  }

  const { OPTIMAL_DEPTH_MIN, OPTIMAL_DEPTH_MAX, MAX_PENALTY_DEPTH } = SMART_SUGGEST_CONFIG;

  // Calculate deviation from optimal
  let deviation = 0;
  if (maxDepth < OPTIMAL_DEPTH_MIN) {
    deviation = OPTIMAL_DEPTH_MIN - maxDepth;
  } else if (maxDepth > OPTIMAL_DEPTH_MAX) {
    deviation = maxDepth - OPTIMAL_DEPTH_MAX;
  }

  // Score: 100 - (deviation × 15), clamped to 0-100
  const score = Math.max(0, Math.min(100, 100 - deviation * 15));

  let details: string;
  if (maxDepth === 0) {
    details = "All files in root - consider organizing into subdirectories";
  } else if (maxDepth < OPTIMAL_DEPTH_MIN) {
    details = `Shallow structure (${maxDepth} levels) - consider more organization`;
  } else if (maxDepth <= OPTIMAL_DEPTH_MAX) {
    details = `Optimal depth (${maxDepth} levels)`;
  } else if (maxDepth <= MAX_PENALTY_DEPTH) {
    details = `Deep structure (${maxDepth} levels) - some nesting may be excessive`;
  } else {
    details = `Very deep structure (${maxDepth} levels) - consider flattening`;
  }

  return {
    score,
    details,
    raw: { maxDepth, deviation, optimal: [OPTIMAL_DEPTH_MIN, OPTIMAL_DEPTH_MAX] },
  };
}
```

### 3.7 Duplicate Ratio with Graceful Degradation (SS-C1 Fix)

```typescript
/**
 * Calculate duplicate ratio with graceful degradation
 * SS-C1: Handles HashCalculatorService failures gracefully
 */
private async calculateDuplicateRatio(
  files: ScanResult["files"],
  options: Required<SmartSuggestOptions>,
  isTimedOut: () => boolean,
): Promise<HealthMetric> {
  // SS-H4: Guard empty/single file
  if (files.length <= 1) {
    return {
      score: 100,
      details: "No duplicates possible with < 2 files",
      raw: { duplicateCount: 0, totalFiles: files.length },
    };
  }

  // Skip if duplicates not requested
  if (!options.includeDuplicates) {
    return {
      score: 100,
      details: "Duplicate analysis skipped (include_duplicates: false)",
      raw: { skipped: true },
    };
  }

  const hashMap = new Map<string, number>();
  let processedCount = 0;
  let errorCount = 0;
  const maxErrors = Math.max(5, Math.floor(files.length * 0.05));  // 5% error tolerance

  for (const file of files) {
    if (isTimedOut()) {
      // SS-C1: Return partial result on timeout
      return {
        score: 100,
        details: "Duplicate analysis incomplete (timeout) - assuming no duplicates",
        hasErrors: true,
        raw: { incomplete: true, processed: processedCount },
      };
    }

    try {
      // SS-C1: HashCalculator may fail - wrap in try-catch
      const hash = await this.hashCalculator.calculateHash(file.path);
      hashMap.set(hash, (hashMap.get(hash) || 0) + 1);
      processedCount++;
    } catch (error) {
      errorCount++;
      logger.warn(`Failed to hash file: ${file.name}`, { error: (error as Error).message });

      // SS-C1: If too many errors, degrade gracefully
      if (errorCount >= maxErrors) {
        logger.error("Too many hash failures, returning fallback score");
        return {
          score: 100,
          details: "Duplicate analysis unavailable (hash failures) - assuming no duplicates",
          hasErrors: true,
          raw: { errorCount, maxErrors },
        };
      }
    }
  }

  // Count duplicates
  let duplicateCount = 0;
  for (const [, count] of hashMap) {
    if (count > 1) {
      duplicateCount += count - 1;
    }
  }

  // SS-H4: Guard division by zero
  const duplicateRatio = files.length > 0 ? duplicateCount / files.length : 0;
  const score = Math.round((1 - duplicateRatio) * 100);

  let details: string;
  if (duplicateCount === 0) {
    details = "No duplicates found";
  } else if (duplicateRatio < 0.1) {
    details = `Low duplicate count (${duplicateCount} files)`;
  } else if (duplicateRatio < 0.3) {
    details = `Moderate duplicates (${duplicateCount} files) - consider deduplication`;
  } else {
    details = `High duplicate ratio (${Math.round(duplicateRatio * 100)}%) - deduplication recommended`;
  }

  return {
    score,
    details,
    raw: { duplicateCount, totalFiles: files.length, duplicateRatio, processedCount, errorCount },
  };
}
```

### 3.8 Project Detection with Confidence (SS-H3 Fix)

```typescript
/**
 * Detect if directory is a project with confidence scoring
 * SS-H3: Uses marker-based detection with confidence threshold
 */
private async detectProjectContext(
  directory: string,
  files: ScanResult["files"],
): Promise<ProjectDetectionResult> {
  const markers = SMART_SUGGEST_CONFIG.PROJECT_MARKERS;
  const matchedMarkers: string[] = [];
  let confidence = 0;

  // Check for project marker files
  for (const marker of markers) {
    const markerPath = path.join(directory, marker);
    if (await fileExists(markerPath)) {
      matchedMarkers.push(marker);
      confidence += 0.15;  // Each marker adds 15% confidence
    }
  }

  // Check directory name for thematic keywords
  const dirName = path.basename(directory).toLowerCase();
  const isThematic = SMART_SUGGEST_CONFIG.THEMATIC_KEYWORDS.some(
    keyword => dirName.includes(keyword),
  );

  if (isThematic) {
    confidence += 0.20;  // Thematic keyword adds 20%
  }

  // Cap confidence at 1.0
  confidence = Math.min(1.0, confidence);

  // Check if confidence meets threshold
  const isProject = confidence >= SMART_SUGGEST_CONFIG.PROJECT_CONFIDENCE_THRESHOLD;

  let context: DirectoryContext;
  if (isProject) {
    context = "project";
  } else if (isThematic) {
    context = "thematic";
  } else if (files.length === 0) {
    context = "empty";
  } else {
    context = "standard";
  }

  return {
    isProject,
    confidence,
    matchedMarkers,
    context,
  };
}

/**
 * Calculate misplaced files metric with project detection
 * SS-H3: Projects auto-score 100, thematic score 85 baseline
 */
private async calculateMisplacedFiles(
  files: ScanResult["files"],
  fileTypes: Map<string, number>,
  directory: string,
): Promise<HealthMetric> {
  // SS-H4: Guard empty directory
  if (files.length === 0) {
    return {
      score: 100,
      details: "No files to analyze",
      raw: { context: "empty" },
    };
  }

  // Detect project context
  const projectContext = await this.detectProjectContext(directory, files);

  // SS-H3: Projects get auto-perfect score
  if (projectContext.context === "project") {
    return {
      score: 100,
      details: `Project directory (${Math.round(projectContext.confidence * 100)}% confidence) - mixed types expected`,
      raw: {
        context: "project",
        confidence: projectContext.confidence,
        markers: projectContext.matchedMarkers,
      },
    };
  }

  // SS-H3: Thematic directories get 85 baseline
  if (projectContext.context === "thematic") {
    // Still check for obviously misplaced files
    const uniqueTypes = fileTypes.size;
    const totalFiles = files.length;

    // If all files are same type in thematic dir, that's actually good
    // If extreme mixing, slightly reduce score
    const typeRatio = uniqueTypes / totalFiles;
    const adjustedScore = Math.round(85 - (typeRatio * 10));

    return {
      score: Math.max(70, adjustedScore),
      details: "Thematic directory - some type mixing expected",
      raw: {
        context: "thematic",
        uniqueTypes,
        typeRatio,
      },
    };
  }

  // Standard directories: calculate based on type concentration
  const uniqueTypes = fileTypes.size;
  const totalFiles = files.length;

  // SS-H4: Guard division by zero
  if (totalFiles === 0) {
    return { score: 100, details: "No files to analyze" };
  }

  // Score based on dominant type percentage
  let maxTypeCount = 0;
  for (const count of fileTypes.values()) {
    maxTypeCount = Math.max(maxTypeCount, count);
  }

  const dominantTypeRatio = maxTypeCount / totalFiles;
  const score = Math.round(dominantTypeRatio * 100);

  let details: string;
  if (score >= 90) {
    details = `Well-organized by type (${Math.round(dominantTypeRatio * 100)}% dominant type)`;
  } else if (score >= 70) {
    details = `Good type organization (${Math.round(dominantTypeRatio * 100)}% dominant type)`;
  } else if (score >= 50) {
    details = `Moderate type mixing - consider better organization`;
  } else {
    details = `High type mixing - organization recommended`;
  }

  return {
    score,
    details,
    raw: {
      context: "standard",
      uniqueTypes,
      dominantTypeRatio,
    },
  };
}
```

### 3.9 Metrics Calculation with Checkpointing

```typescript
/**
 * Calculate all metrics with checkpoint support
 * SS-C2: Saves checkpoints during long operations
 */
private async calculateMetrics(
  scanResult: ScanResult,
  options: Required<SmartSuggestOptions>,
  isTimedOut: () => boolean,
): Promise<HealthMetrics> {
  const checkpointId = randomUUID();
  let processedPhase = 0;
  const totalPhases = 5;

  // Phase 1: File Type Entropy
  const fileTypeEntropy = this.calculateFileTypeEntropy(
    scanResult.fileTypes,
    scanResult.files.length,
  );
  processedPhase++;

  // SS-C2: Save checkpoint after each major phase
  await this.checkpointManager.saveCheckpoint(
    scanResult.files[0]?.directory || "",
    "calculating_entropy",
    processedPhase,
    totalPhases,
    { fileTypeEntropy },
  );

  // Phase 2: Naming Consistency
  const namingConsistency = this.calculateNamingConsistency(scanResult.files);
  processedPhase++;

  await this.checkpointManager.saveCheckpoint(
    scanResult.files[0]?.directory || "",
    "calculating_naming",
    processedPhase,
    totalPhases,
    { fileTypeEntropy, namingConsistency },
  );

  // Phase 3: Depth Balance
  const depthBalance = this.calculateDepthBalance(
    scanResult.maxDepth,
    scanResult.files.length,
  );
  processedPhase++;

  await this.checkpointManager.saveCheckpoint(
    scanResult.files[0]?.directory || "",
    "calculating_depth",
    processedPhase,
    totalPhases,
    { fileTypeEntropy, namingConsistency, depthBalance },
  );

  // Phase 4: Duplicate Ratio
  const duplicateRatio = await this.calculateDuplicateRatio(
    scanResult.files,
    options,
    isTimedOut,
  );
  processedPhase++;

  await this.checkpointManager.saveCheckpoint(
    scanResult.files[0]?.directory || "",
    "calculating_duplicates",
    processedPhase,
    totalPhases,
    { fileTypeEntropy, namingConsistency, depthBalance, duplicateRatio },
  );

  // Phase 5: Misplaced Files
  const misplacedFiles = await this.calculateMisplacedFiles(
    scanResult.files,
    scanResult.fileTypes,
    scanResult.files[0]?.directory || "",
  );

  return {
    fileTypeEntropy,
    namingConsistency,
    depthBalance,
    duplicateRatio,
    misplacedFiles,
  };
}

/**
 * Resume analysis from checkpoint
 * SS-C2: Resume capability for interrupted operations
 */
private async resumeAnalysis(
  directory: string,
  options: Required<SmartSuggestOptions>,
  checkpoint: AnalysisCheckpoint,
): Promise<DirectoryHealthReport> {
  logger.info("Resuming analysis", { checkpointId: checkpoint.id, phase: checkpoint.phase });

  // Re-scan directory
  const scanResult = await this.scanWithTimeout(
    directory,
    options,
    () => false,
  );

  // Continue from checkpoint phase
  const partialMetrics = checkpoint.partialResults || {};

  // Re-calculate remaining metrics based on phase
  const metrics: HealthMetrics = {
    fileTypeEntropy: partialMetrics.fileTypeEntropy ||
      this.calculateFileTypeEntropy(scanResult.fileTypes, scanResult.files.length),
    namingConsistency: partialMetrics.namingConsistency ||
      this.calculateNamingConsistency(scanResult.files),
    depthBalance: partialMetrics.depthBalance ||
      this.calculateDepthBalance(scanResult.maxDepth, scanResult.files.length),
    duplicateRatio: partialMetrics.duplicateRatio ||
      await this.calculateDuplicateRatio(scanResult.files, options, () => false),
    misplacedFiles: partialMetrics.misplacedFiles ||
      await this.calculateMisplacedFiles(scanResult.files, scanResult.fileTypes, directory),
  };

  // Generate suggestions and score
  const suggestions = this.generateSuggestions(metrics, scanResult);
  const quickWins = this.generateQuickWins(metrics, scanResult);
  const score = this.calculateWeightedScore(metrics);
  const grade = this.scoreToGrade(score);

  // Clean up checkpoint
  await this.checkpointManager.deleteCheckpoint(checkpoint.id);

  return {
    score,
    grade,
    metrics,
    suggestions,
    quickWins,
    metadata: {
      directory,
      analyzedAt: new Date().toISOString(),
      fileCount: scanResult.files.length,
      directoryCount: scanResult.directories.length,
      totalSizeBytes: scanResult.totalSize,
      durationMs: 0,  // Can't calculate accurately on resume
      wasCached: false,
      sampleRate: options.sampleRate,
    },
  };
}
```

### 3.10 Scoring and Grading

```typescript
/**
 * Calculate weighted overall score
 */
private calculateWeightedScore(metrics: HealthMetrics): number {
  const weights = SMART_SUGGEST_CONFIG.WEIGHTS;

  const weightedScore =
    metrics.fileTypeEntropy.score * weights.fileTypeEntropy +
    metrics.namingConsistency.score * weights.namingConsistency +
    metrics.depthBalance.score * weights.depthBalance +
    metrics.duplicateRatio.score * weights.duplicateRatio +
    metrics.misplacedFiles.score * weights.misplacedFiles;

  return Math.round(weightedScore);
}

/**
 * Convert numeric score to letter grade
 */
private scoreToGrade(score: number): import("../types.js").HealthGrade {
  if (score >= GRADE_BOUNDARIES.A) return "A";
  if (score >= GRADE_BOUNDARIES.B) return "B";
  if (score >= GRADE_BOUNDARIES.C) return "C";
  if (score >= GRADE_BOUNDARIES.D) return "D";
  return "F";
}
```

### 3.11 Suggestion Generation

```typescript
/**
 * Generate actionable suggestions based on metrics
 */
private generateSuggestions(
  metrics: HealthMetrics,
  scanResult: ScanResult,
): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // File type entropy suggestions
  if (metrics.fileTypeEntropy.score < 70) {
    suggestions.push({
      priority: "high",
      message: "High file type mixing detected. Consider organizing files by category using organize_files tool.",
      suggestedTool: "file_organizer_organize_files",
      suggestedArgs: { directory: scanResult.files[0]?.directory, dry_run: true },
      estimatedImprovement: Math.round((70 - metrics.fileTypeEntropy.score) * 0.25),
    });
  }

  // Naming consistency suggestions
  if (metrics.namingConsistency.score < 70) {
    suggestions.push({
      priority: "medium",
      message: "Inconsistent naming patterns detected. Consider standardizing file naming conventions.",
      suggestedTool: "file_organizer_batch_rename",
      suggestedArgs: { directory: scanResult.files[0]?.directory },
      estimatedImprovement: Math.round((70 - metrics.namingConsistency.score) * 0.20),
    });
  }

  // Depth balance suggestions
  if (metrics.depthBalance.score < 60) {
    const isShallow = metrics.depthBalance.raw &&
      (metrics.depthBalance.raw as { maxDepth: number }).maxDepth < 2;

    if (isShallow) {
      suggestions.push({
        priority: "low",
        message: "Files are all in root directory. Consider creating subdirectories for better organization.",
      });
    } else {
      suggestions.push({
        priority: "low",
        message: "Directory structure is very deep. Consider flattening some subdirectories.",
      });
    }
  }

  // Duplicate suggestions
  if (metrics.duplicateRatio.score < 80 && !metrics.duplicateRatio.hasErrors) {
    suggestions.push({
      priority: "high",
      message: "Duplicate files detected. Consider running duplicate detection to free up space.",
      suggestedTool: "file_organizer_find_duplicates",
      suggestedArgs: { directory: scanResult.files[0]?.directory },
      estimatedImprovement: Math.round((100 - metrics.duplicateRatio.score) * 0.20),
    });
  }

  // Misplaced files suggestions
  if (metrics.misplacedFiles.score < 70) {
    const context = metrics.misplacedFiles.raw?.context;
    if (context !== "project" && context !== "thematic") {
      suggestions.push({
        priority: "medium",
        message: "Files of different types are mixed together. Consider organizing by file type.",
        suggestedTool: "file_organizer_organize_by_type",
        suggestedArgs: { directory: scanResult.files[0]?.directory },
        estimatedImprovement: Math.round((70 - metrics.misplacedFiles.score) * 0.20),
      });
    }
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return suggestions;
}

/**
 * Generate quick win actions
 */
private generateQuickWins(
  metrics: HealthMetrics,
  scanResult: ScanResult,
): QuickWin[] {
  const quickWins: QuickWin[] = [];

  // Quick win: Remove duplicates if found
  if (metrics.duplicateRatio.score < 90 && !metrics.duplicateRatio.hasErrors) {
    const duplicateCount = metrics.duplicateRatio.raw?.duplicateCount as number || 0;
    if (duplicateCount > 0) {
      quickWins.push({
        action: `Remove ${duplicateCount} duplicate files`,
        estimatedScoreImprovement: Math.min(20, Math.round(duplicateCount * 2)),
        tool: "file_organizer_remove_duplicates",
        args: { directory: scanResult.files[0]?.directory, dry_run: true },
      });
    }
  }

  // Quick win: Organize files if entropy is low
  if (metrics.fileTypeEntropy.score < 60) {
    quickWins.push({
      action: "Organize files by type",
      estimatedScoreImprovement: Math.round((70 - metrics.fileTypeEntropy.score) * 0.5),
      tool: "file_organizer_organize_files",
      args: { directory: scanResult.files[0]?.directory, dry_run: true },
    });
  }

  return quickWins.slice(0, 3);  // Limit to top 3 quick wins
}
```

---

## 4. Smart Suggest Tool (smart-suggest.ts)

```typescript
/**
 * File Organizer MCP Server v3.4.0
 * Smart Suggest Tool
 *
 * @module tools/smart-suggest
 */

import { z } from "zod";
import type { ToolDefinition, ToolResponse } from "../types.js";
import { SmartSuggestService } from "../services/smart-suggest.service.js";
import { SmartSuggestError } from "../types.js";
import { logger } from "../utils/logger.js";

export const SmartSuggestInputSchema = z.object({
  directory: z.string().min(1).describe("Directory path to analyze"),
  include_subdirs: z.boolean().default(true).describe("Include subdirectories"),
  include_duplicates: z
    .boolean()
    .default(true)
    .describe("Include duplicate detection (slower)"),
  max_files: z
    .number()
    .min(1)
    .max(50000)
    .default(10000)
    .describe("Maximum files to analyze"),
  timeout_seconds: z
    .number()
    .min(5)
    .max(300)
    .default(60)
    .describe("Timeout in seconds"),
  sample_rate: z
    .number()
    .min(0.01)
    .max(1.0)
    .default(1.0)
    .describe("Sample rate for large directories"),
  use_cache: z.boolean().default(true).describe("Use cached results"),
  cache_ttl_minutes: z
    .number()
    .min(1)
    .max(1440)
    .default(30)
    .describe("Cache TTL in minutes"),
  resume_checkpoint: z
    .string()
    .optional()
    .describe("Checkpoint ID to resume from"),
  response_format: z.enum(["json", "markdown"]).default("markdown"),
});

export type SmartSuggestInput = z.infer<typeof SmartSuggestInputSchema>;

export const smartSuggestToolDefinition: ToolDefinition = {
  name: "file_organizer_smart_suggest",
  title: "Smart Suggest",
  description:
    "Analyze directory health and receive actionable suggestions for organization. " +
    "Computes a health score (0-100) based on file type entropy, naming consistency, " +
    "depth balance, duplicate ratio, and misplaced files detection. " +
    "Returns grade (A-F), detailed metrics, and quick win actions.",
  inputSchema: {
    type: "object",
    properties: {
      directory: {
        type: "string",
        description: "Directory path to analyze",
      },
      include_subdirs: {
        type: "boolean",
        default: true,
        description: "Include subdirectories in analysis",
      },
      include_duplicates: {
        type: "boolean",
        default: true,
        description: "Include duplicate detection (slower operation)",
      },
      max_files: {
        type: "number",
        default: 10000,
        description: "Maximum files to analyze",
      },
      timeout_seconds: {
        type: "number",
        default: 60,
        description: "Timeout in seconds",
      },
      sample_rate: {
        type: "number",
        default: 1.0,
        description: "Sample rate for large directories (0.1 = 10% sampling)",
      },
      use_cache: {
        type: "boolean",
        default: true,
        description: "Use cached results if available",
      },
      cache_ttl_minutes: {
        type: "number",
        default: 30,
        description: "Cache time-to-live in minutes",
      },
      resume_checkpoint: {
        type: "string",
        description: "Checkpoint ID to resume from a previous analysis",
      },
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        default: "markdown",
        description: "Response format",
      },
    },
    required: ["directory"],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

export async function handleSmartSuggest(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = SmartSuggestInputSchema.safeParse(args);
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

    const service = SmartSuggestService.getInstance();
    const report = await service.analyzeHealth(
      parsed.data.directory,
      {
        includeSubdirs: parsed.data.include_subdirs,
        includeDuplicates: parsed.data.include_duplicates,
        maxFiles: parsed.data.max_files,
        timeoutSeconds: parsed.data.timeout_seconds,
        sampleRate: parsed.data.sample_rate,
        useCache: parsed.data.use_cache,
        cacheTtlMinutes: parsed.data.cache_ttl_minutes,
      },
      parsed.data.resume_checkpoint,
    );

    if (parsed.data.response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
      };
    }

    // Markdown format
    let markdown = `# Directory Health Report\n\n`;
    markdown += `**Directory:** \`${report.metadata.directory}\`\n`;
    markdown += `**Overall Score:** ${report.score}/100\n`;
    markdown += `**Grade:** ${report.grade}\n`;
    markdown += `**Analyzed:** ${new Date(report.metadata.analyzedAt).toLocaleString()}\n`;
    markdown += `**Files:** ${report.metadata.fileCount.toLocaleString()} | **Directories:** ${report.metadata.directoryCount}\n\n`;

    // Grade badge
    const gradeEmoji =
      report.grade === "A"
        ? "✨"
        : report.grade === "B"
          ? "✅"
          : report.grade === "C"
            ? "⚠️"
            : report.grade === "D"
              ? "🔶"
              : "🚨";
    markdown += `## ${gradeEmoji} Grade ${report.grade} (${report.score}/100)\n\n`;

    // Metrics table
    markdown += `## Health Metrics\n\n`;
    markdown += `| Metric | Score | Details |\n`;
    markdown += `|--------|-------|---------|\n`;
    markdown += `| 📁 File Type Entropy | ${report.metrics.fileTypeEntropy.score}/100 | ${report.metrics.fileTypeEntropy.details} |\n`;
    markdown += `| 📝 Naming Consistency | ${report.metrics.namingConsistency.score}/100 | ${report.metrics.namingConsistency.details} |\n`;
    markdown += `| 📂 Depth Balance | ${report.metrics.depthBalance.score}/100 | ${report.metrics.depthBalance.details} |\n`;
    markdown += `| 🔁 Duplicate Ratio | ${report.metrics.duplicateRatio.score}/100 | ${report.metrics.duplicateRatio.details} |\n`;
    markdown += `| 📍 Misplaced Files | ${report.metrics.misplacedFiles.score}/100 | ${report.metrics.misplacedFiles.details} |\n`;
    markdown += `\n`;

    // Suggestions
    if (report.suggestions.length > 0) {
      markdown += `## Suggestions\n\n`;
      for (const suggestion of report.suggestions) {
        const priorityEmoji =
          suggestion.priority === "high"
            ? "🔴"
            : suggestion.priority === "medium"
              ? "🟡"
              : "🔵";
        markdown += `${priorityEmoji} **${suggestion.priority.toUpperCase()}:** ${suggestion.message}\n`;
        if (suggestion.estimatedImprovement) {
          markdown += `   💡 Estimated improvement: +${suggestion.estimatedImprovement} points\n`;
        }
        if (suggestion.suggestedTool) {
          markdown += `   🔧 Suggested tool: \`${suggestion.suggestedTool}\`\n`;
        }
        markdown += `\n`;
      }
    }

    // Quick Wins
    if (report.quickWins.length > 0) {
      markdown += `## Quick Wins\n\n`;
      for (let i = 0; i < report.quickWins.length; i++) {
        const win = report.quickWins[i];
        markdown += `${i + 1}. **${win.action}** (+${win.estimatedScoreImprovement} points)\n`;
        markdown += `   - Tool: \`${win.tool}\`\n`;
      }
      markdown += `\n`;
    }

    // Metadata
    markdown += `## Analysis Metadata\n\n`;
    markdown += `- **Duration:** ${report.metadata.durationMs}ms\n`;
    markdown += `- **Cached Result:** ${report.metadata.wasCached ? "Yes" : "No"}\n`;
    markdown += `- **Total Size:** ${formatBytes(report.metadata.totalSizeBytes)}\n`;
    if (report.metadata.sampleRate && report.metadata.sampleRate < 1.0) {
      markdown += `- **Sample Rate:** ${(report.metadata.sampleRate * 100).toFixed(0)}%\n`;
    }

    return {
      content: [{ type: "text", text: markdown }],
    };
  } catch (error) {
    if (error instanceof SmartSuggestError) {
      return {
        content: [
          {
            type: "text",
            text: `Smart Suggest Error (${error.code}): ${error.message}${
              error.checkpointId ? `\nCheckpoint ID: ${error.checkpointId}` : ""
            }`,
          },
        ],
      };
    }

    logger.error("Unexpected error in smart suggest", { error });
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
```

---

## 5. Server Integration

### 5.1 Tool Registration

Add to `src/tools/index.ts`:

```typescript
import { smartSuggestToolDefinition } from "./smart-suggest.js";

export const TOOLS: ToolDefinition[] = [
  // ... existing tools ...
  smartSuggestToolDefinition,
];
```

### 5.2 Server Handler

Add to `src/server.ts` in `handleToolCall`:

```typescript
import { handleSmartSuggest } from "./tools/smart-suggest.js";

// In handleToolCall switch statement:
case "file_organizer_smart_suggest":
  response = await handleSmartSuggest(args);
  break;
```

---

## 6. Test Requirements

### 6.1 Unit Tests

Create `tests/unit/services/smart-suggest.test.ts`:

```typescript
describe("SmartSuggestService", () => {
  let service: SmartSuggestService;

  beforeEach(() => {
    service = SmartSuggestService.getInstance();
  });

  describe("Shannon Entropy (SS-H1)", () => {
    it("should handle single file type without log(0)", async () => {
      // Single type = perfect score
    });

    it("should handle empty directory without log(0)", async () => {
      // Empty = perfect score
    });

    it("should use epsilon for zero probabilities", async () => {
      // Internal test of epsilon usage
    });

    it("should calculate correct entropy for uniform distribution", async () => {
      // 10 types equally distributed
    });

    it("should calculate correct entropy for concentrated distribution", async () => {
      // 1 dominant type
    });
  });

  describe("Division by Zero Guards (SS-H4)", () => {
    it("should handle empty directory", async () => {
      // All metrics should return 100
    });

    it("should handle single file directory", async () => {
      // All metrics should handle gracefully
    });

    it("should handle zero total size", async () => {
      // Division guards
    });
  });

  describe("HashCalculator Graceful Degradation (SS-C1)", () => {
    it("should continue analysis when hash calculator fails", async () => {
      // Mock hash failure
    });

    it("should return fallback score when too many hash failures", async () => {
      // >5% error rate
    });

    it("should report hasErrors flag on degradation", async () => {
      // Check hasErrors field
    });
  });

  describe("Checkpoint/Resume (SS-C2)", () => {
    it("should save checkpoints during analysis", async () => {
      // Verify checkpoint created
    });

    it("should resume from valid checkpoint", async () => {
      // Resume flow
    });

    it("should reject expired checkpoint", async () => {
      // >1 hour old
    });

    it("should clean up checkpoint after resume", async () => {
      // Verify deletion
    });
  });

  describe("Cache with Mutex (SS-C3)", () => {
    it("should cache results with version", async () => {
      // Verify cache entry
    });

    it("should reject stale version on invalidation", async () => {
      // Version bump
    });

    it("should use mutex for concurrent access", async () => {
      // Concurrent read/write
    });

    it("should expire cache after TTL", async () => {
      // TTL expiration
    });
  });

  describe("Multi-Pattern Naming (SS-H2)", () => {
    it("should detect camelCase pattern", () => {
      // Pattern detection
    });

    it("should detect kebab-case pattern", () => {
      // Pattern detection
    });

    it("should detect mixed patterns across directories", async () => {
      // Multi-directory analysis
    });

    it("should calculate per-directory consistency", async () => {
      // Consistency scoring
    });
  });

  describe("Project Detection (SS-H3)", () => {
    it("should detect project with high confidence", async () => {
      // package.json + .git = project
    });

    it("should auto-score project directories 100 on misplaced", async () => {
      // Project = 100
    });

    it("should score thematic directories 85 baseline", async () => {
      // Thematic = 85
    });

    it("should respect confidence threshold (70%)", async () => {
      // Single marker = not project
    });

    it("should detect directory by name", async () => {
      // "Projects" folder
    });
  });

  describe("Timeout Handling", () => {
    it("should timeout after specified seconds", async () => {
      // Timeout test
    });

    it("should return partial results on timeout", async () => {
      // Partial results
    });
  });

  describe("Grade Calculation", () => {
    it("should map 95 to grade A", () => {
      // Grade boundary
    });

    it("should map 80 to grade B", () => {
      // Grade boundary
    });

    it("should map 60 to grade C", () => {
      // Grade boundary
    });

    it("should map 40 to grade D", () => {
      // Grade boundary
    });

    it("should map 20 to grade F", () => {
      // Grade boundary
    });
  });
});
```

### 6.2 Integration Tests

Create `tests/integration/smart-suggest.test.ts`:

```typescript
describe("Smart Suggest Integration", () => {
  it("should analyze known organized directory and score 90+", async () => {
    // Well-organized directory
  });

  it("should analyze messy directory and score <40", async () => {
    // Disorganized directory
  });

  it("should handle 10,000 files within timeout", async () => {
    // Performance test
  });

  it("should respect sample_rate parameter", async () => {
    // 10% sampling
  });

  it("should return cached result on second call", async () => {
    // Cache hit
  });
});
```

---

## 7. Migration Plan

### 7.1 Deployment Steps

1. Deploy `config.ts` with new constants
2. Deploy `types.ts` with new types
3. Deploy `smart-suggest.service.ts`
4. Deploy `smart-suggest.ts` tool
5. Update `tools/index.ts` with exports
6. Update `server.ts` with tool handler

### 7.2 Backward Compatibility

- No breaking changes to existing APIs
- New tool is additive only
- Existing tools unaffected

---

## 8. Configuration Summary

| Config                         | Default | Description                   |
| ------------------------------ | ------- | ----------------------------- |
| `WEIGHTS.fileTypeEntropy`      | 0.25    | Weight for file type entropy  |
| `WEIGHTS.namingConsistency`    | 0.20    | Weight for naming consistency |
| `WEIGHTS.depthBalance`         | 0.15    | Weight for depth balance      |
| `WEIGHTS.duplicateRatio`       | 0.20    | Weight for duplicate ratio    |
| `WEIGHTS.misplacedFiles`       | 0.20    | Weight for misplaced files    |
| `DEFAULT_MAX_FILES`            | 10000   | Maximum files to analyze      |
| `DEFAULT_TIMEOUT_SECONDS`      | 60      | Default timeout               |
| `DEFAULT_CACHE_TTL_MINUTES`    | 30      | Cache TTL                     |
| `EPSILON`                      | 1e-10   | Log(0) prevention             |
| `PROJECT_CONFIDENCE_THRESHOLD` | 0.70    | Project detection threshold   |
| `NAMING_CONSISTENCY_THRESHOLD` | 0.80    | Naming consistency threshold  |
| `CHECKPOINT_INTERVAL_MS`       | 5000    | Checkpoint save interval      |
| `CHECKPOINT_MAX_AGE_MS`        | 3600000 | Max checkpoint age (1 hour)   |

---

## 9. Acceptance Criteria

- [ ] Shannon entropy handles log(0) with epsilon (SS-H1)
- [ ] Division by zero guarded for empty dirs (SS-H4)
- [ ] HashCalculator failures degrade gracefully (SS-C1)
- [ ] Checkpoints saved during analysis (SS-C2)
- [ ] Resume from checkpoint works correctly (SS-C2)
- [ ] Cache uses versioning with mutex (SS-C3)
- [ ] Multi-pattern naming detection works (SS-H2)
- [ ] Project detection uses confidence threshold (SS-H3)
- [ ] Project directories auto-score 100 on misplaced (SS-H3)
- [ ] Thematic directories score 85 baseline (SS-H3)
- [ ] Timeout aborts after configured seconds
- [ ] Grade mapping correct (A=90+, B=75+, C=50+, D=25+, F=<25)
- [ ] Suggestions generated for low-scoring metrics
- [ ] Quick wins generated for actionable improvements
- [ ] All tests pass: unit, integration
- [ ] No lint errors
- [ ] TypeScript compilation succeeds
