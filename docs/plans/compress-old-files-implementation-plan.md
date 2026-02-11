# Compress Old Files - Implementation Plan

**Status:** Approved for Implementation  
**Version:** 1.0  
**Date:** February 10, 2026  
**Estimated Duration:** 19 days  
**Debate Consensus:** Approved by Multi-Shepherd Debate v3.1

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Phase-by-Phase Implementation](#3-phase-by-phase-implementation)
4. [File Structure](#4-file-structure)
5. [Testing Strategy](#5-testing-strategy)
6. [Security Checklist](#6-security-checklist)
7. [Rollback Plan](#7-rollback-plan)
8. [MCP Tools](#8-mcp-tools)
9. [Configuration](#9-configuration)
10. [Acceptance Criteria](#10-acceptance-criteria)

---

## 1. Overview

### 1.1 Feature Description

The "Compress Old Files" feature automatically identifies files that haven't been accessed for a configurable period and compresses them into space-efficient archives. This feature helps users reclaim disk space while maintaining access to older files through seamless decompression and restoration capabilities.

### 1.2 Goals

- **Space Reclamation:** Reduce storage usage by 40-70% for old files
- **Transparent Access:** Seamless restoration without manual archive management
- **Safety First:** Zero data loss through comprehensive validation and rollback
- **Performance:** Handle large archives (>10GB) without blocking operations
- **Flexibility:** Support multiple compression formats and age thresholds

### 1.3 Success Metrics

| Metric                   | Target                              |
| ------------------------ | ----------------------------------- |
| Compression Ratio        | 2:1 minimum (50% size reduction)    |
| Restoration Success Rate | 99.9%                               |
| Archive Creation Speed   | 120+ MB/s (zlib) / 300+ MB/s (ZSTD) |
| Memory Usage             | <500MB for 10GB archives            |
| False Positive Rate      | <0.1% (wrong files compressed)      |

### 1.4 User Stories

1. **As a developer,** I want log files older than 30 days automatically compressed so my project directories don't fill up with old logs.

2. **As a system administrator,** I want to compress old cache files while preserving the ability to restore them quickly if needed.

3. **As a data analyst,** I want to archive old datasets that haven't been accessed in 90 days but keep them easily accessible.

4. **As a security-conscious user,** I want compressed files to be verified with checksums and protected against zip bombs.

---

## 2. Architecture

### 2.1 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MCP Client (LLM)                                    │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │ JSON-RPC 2.0
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Tools Layer                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ compress_    │  │ restore_     │  │ list_        │  │ verify_      │    │
│  │ old_files    │  │ compressed   │  │ archives     │  │ archive      │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
└─────────┼─────────────────┼─────────────────┼─────────────────┼────────────┘
          │                 │                 │                 │
          └─────────────────┴────────┬────────┴─────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CompressionService                                   │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                     CompressionEngine (Abstraction)                   │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │  │
│  │  │ ZlibEngine  │  │ ZstdEngine  │  │ ZipEngine   │ (Optional)       │  │
│  │  │ (Default)   │  │ (Opt-in)    │  │ (Windows)   │                  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ FileScanner  │  │ Archive      │  │ Index        │  │ Restore      │    │
│  │ Service      │  │ Builder      │  │ Manager      │  │ Engine       │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
└──────────────────────────────────────┬────────────────────────────────────┘
                                       │
┌──────────────────────────────────────┼────────────────────────────────────┐
│                        Storage Layer │                                      │
│  ┌──────────────┐  ┌──────────────┐ │┌──────────────┐  ┌──────────────┐   │
│  │ .compressed/ │  │ compression. │ ││ Rollback     │  │ compression. │   │
│  │ (Archives)   │  │ db (SQLite)  │ ││ Service      │  │ log (Audit)  │   │
│  └──────────────┘  └──────────────┘ │└──────────────┘  └──────────────┘   │
└──────────────────────────────────────┴────────────────────────────────────┘
```

### 2.2 Core Components

#### 2.2.1 CompressionService

The main orchestrator coordinating all compression operations.

**Responsibilities:**

- Coordinate scan → compress → index workflow
- Manage worker thread pool (4-8 threads)
- Handle checkpointing and recovery
- Integrate with RollbackService

**Interface:**

```typescript
interface ICompressionService {
  // Core operations
  compressOldFiles(options: CompressOptions): Promise<CompressionResult>;
  restoreArchive(
    archiveId: string,
    options: RestoreOptions,
  ): Promise<RestoreResult>;

  // Query operations
  listArchives(filter?: ArchiveFilter): Promise<ArchiveSummary[]>;
  getArchiveInfo(archiveId: string): Promise<ArchiveInfo>;

  // Management
  deleteArchive(archiveId: string, options?: DeleteOptions): Promise<void>;
  verifyArchive(archiveId: string): Promise<VerificationResult>;

  // Checkpoint operations
  checkpoint(): Promise<CheckpointInfo>;
  resumeFromCheckpoint(checkpointId: string): Promise<void>;
}
```

#### 2.2.2 CompressionEngine (Abstract)

Abstraction layer supporting multiple compression backends.

```typescript
abstract class CompressionEngine {
  abstract readonly name: string;
  abstract readonly supportedFormats: CompressionFormat[];

  // Compression
  abstract compress(
    source: ReadableStream,
    destination: WritableStream,
    options: CompressionOptions,
  ): Promise<CompressionStats>;

  // Decompression
  abstract decompress(
    source: ReadableStream,
    destination: WritableStream,
  ): Promise<DecompressionStats>;

  // Capabilities
  abstract isAvailable(): Promise<boolean>;
  abstract getPerformanceMetrics(): Promise<PerformanceMetrics>;
}
```

#### 2.2.3 IndexManager

SQLite-based metadata tracking with WAL mode for concurrent access.

**Schema:**

```sql
-- Main archives table
CREATE TABLE archives (
  id TEXT PRIMARY KEY,
  archive_path TEXT NOT NULL,
  source_directory TEXT NOT NULL,
  compression_format TEXT NOT NULL,
  compression_level INTEGER NOT NULL,
  original_size INTEGER NOT NULL,
  compressed_size INTEGER NOT NULL,
  compression_ratio REAL NOT NULL,
  file_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_verified_at INTEGER,
  checksum TEXT NOT NULL,
  status TEXT DEFAULT 'active', -- active, restored, deleted, corrupted
  checkpoint_id TEXT
);

-- Individual files within archives
CREATE TABLE archived_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  archive_id TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  original_size INTEGER NOT NULL,
  compressed_size INTEGER,
  checksum TEXT NOT NULL,
  mtime INTEGER NOT NULL,
  atime INTEGER,
  permissions TEXT,
  FOREIGN KEY (archive_id) REFERENCES archives(id) ON DELETE CASCADE
);

-- Operation checkpoints
CREATE TABLE checkpoints (
  id TEXT PRIMARY KEY,
  operation_type TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  files_processed INTEGER DEFAULT 0,
  files_total INTEGER,
  status TEXT DEFAULT 'in_progress', -- in_progress, completed, failed
  error_message TEXT
);

-- Indexes
CREATE INDEX idx_archives_status ON archives(status);
CREATE INDEX idx_archives_created ON archives(created_at);
CREATE INDEX idx_archived_files_archive ON archived_files(archive_id);
CREATE INDEX idx_archived_files_path ON archived_files(relative_path);
CREATE VIRTUAL TABLE archive_search USING fts5(archive_path, source_directory);
```

#### 2.2.4 ArchiveBuilder

Handles streaming archive creation with tar.gz format.

**Key Features:**

- Streaming compression for files >10MB
- Parallel compression using worker threads
- Progress tracking and checkpointing
- Integrity verification during creation

**Implementation:**

```typescript
class ArchiveBuilder {
  private tarStream: tar.Pack;
  private gzipStream: zlib.Gzip;

  async addFile(filePath: string, stats: FileStats): Promise<void>;
  async addDirectory(dirPath: string): Promise<void>;
  async finalize(): Promise<ArchiveMetadata>;

  // Checkpointing
  checkpoint(): ArchiveCheckpoint;
  resumeFrom(checkpoint: ArchiveCheckpoint): Promise<void>;
}
```

#### 2.2.5 RestoreEngine

Handles archive extraction and restoration.

**Key Features:**

- Selective file extraction
- Integrity verification before extraction
- Conflict resolution strategies
- Rollback integration

**Interface:**

```typescript
class RestoreEngine {
  async restore(
    archiveId: string,
    options: RestoreOptions,
  ): Promise<RestoreResult>;

  async restoreFiles(
    archiveId: string,
    filePatterns: string[],
    options: RestoreOptions,
  ): Promise<RestoreResult>;

  async previewRestore(
    archiveId: string,
    options: RestoreOptions,
  ): Promise<RestorePreview>;
}
```

### 2.3 Compression Strategy

#### 2.3.1 Default Engine: Node.js Zlib

- **Format:** tar.gz
- **Speed:** ~120 MB/s
- **Compression Level:** 6 (balanced)
- **Worker Threads:** 4-8 (based on CPU cores)
- **Memory:** ~64MB per worker

#### 2.3.2 Opt-in Engine: ZSTD

- **Format:** tar.zst
- **Speed:** ~300+ MB/s
- **Requirement:** Runtime detection
- **Installation:** Optional peer dependency
- **Fallback:** Zlib if unavailable

#### 2.3.3 Windows Compatibility: ZIP

- **Format:** .zip
- **Use Case:** Cross-platform compatibility
- **Implementation:** Node.js native or adm-zip
- **Limitation:** No streaming for very large files

---

## 3. Phase-by-Phase Implementation

### Phase 1: Core Infrastructure (Days 1-5)

#### Day 1-2: Project Setup & Database

**Tasks:**

1. Create directory structure (see File Structure section)
2. Install dependencies:
   ```bash
   npm install better-sqlite3 tar-stream p-queue zod
   npm install --save-dev @types/tar-stream
   ```
3. Create SQLite schema and migration scripts
4. Implement IndexManager with WAL mode support
5. Create database connection pooling

**Deliverables:**

- `src/services/compression/index-manager.service.ts`
- `src/services/compression/database.schema.sql`
- Unit tests for IndexManager

**Success Criteria:**

- Database creation and migrations work
- CRUD operations on archives table pass tests
- WAL mode properly configured

#### Day 3-4: Compression Engine Foundation

**Tasks:**

1. Create CompressionEngine abstract class
2. Implement ZlibEngine (default)
3. Create streaming utilities for large files
4. Implement worker thread pool (4-8 threads)
5. Add progress tracking callbacks

**Deliverables:**

- `src/services/compression/engines/compression-engine.abstract.ts`
- `src/services/compression/engines/zlib.engine.ts`
- `src/services/compression/workers/compression.worker.ts`
- `src/services/compression/utils/streaming.utils.ts`

**Success Criteria:**

- Single file compression works
- Worker pool processes files concurrently
- Progress callbacks fire correctly
- Memory stays under 500MB for 1GB test file

#### Day 5: Integration & Checkpointing

**Tasks:**

1. Create ArchiveBuilder class
2. Implement checkpoint/resume logic
3. Integrate with RollbackService
4. Create compression manifest format
5. Add basic error handling

**Deliverables:**

- `src/services/compression/archive-builder.service.ts`
- `src/services/compression/checkpoint.service.ts`
- `src/services/compression/types/manifest.types.ts`

**Success Criteria:**

- Archive creation works end-to-end
- Checkpoints can be saved and resumed
- Integration with RollbackService tested

---

### Phase 2: Archive Operations (Days 6-9)

#### Day 6-7: File Scanner & Age Detection

**Tasks:**

1. Extend FileScannerService with age-based filtering
2. Implement file pattern matching (_.log, _.tmp, etc.)
3. Add exclusion patterns (\*.exe, system files)
4. Create age threshold calculator (30/60/90 days)
5. Add open file detection (skip files in use)

**Deliverables:**

- `src/services/compression/file-age-scanner.service.ts`
- `src/services/compression/patterns/file-patterns.config.ts`
- `src/services/compression/utils/age-calculator.utils.ts`

**Success Criteria:**

- Correctly identifies files older than threshold
- Pattern matching works for all defined patterns
- Exclusions prevent compression of system files
- Open files are skipped

#### Day 8-9: Archive Creation & Storage

**Tasks:**

1. Implement complete compression workflow
2. Create .compressed/ directory structure
3. Add archive naming convention
4. Implement compression ratio tracking
5. Add archive integrity verification

**Deliverables:**

- `src/services/compression/archive-storage.service.ts`
- `src/services/compression/compression-orchestrator.service.ts`
- `src/services/compression/utils/naming.utils.ts`

**Success Criteria:**

- Full compression workflow completes successfully
- Archives stored in correct location
- Naming convention follows specification
- Compression ratios calculated accurately

---

### Phase 3: Restore & Safety (Days 10-13)

#### Day 10-11: Restore Engine

**Tasks:**

1. Implement RestoreEngine class
2. Create streaming decompression
3. Add selective file extraction
4. Implement conflict resolution (rename/skip/overwrite)
5. Add integrity verification during restore

**Deliverables:**

- `src/services/compression/restore-engine.service.ts`
- `src/services/compression/utils/extraction.utils.ts`
- `src/services/compression/conflict-resolver.service.ts`

**Success Criteria:**

- Full archive restoration works
- Selective file extraction functions correctly
- Conflict resolution handles all strategies
- Integrity verification passes for restored files

#### Day 12-13: Rollback Integration

**Tasks:**

1. Integrate compression with RollbackService
2. Create compression-specific rollback manifests
3. Implement atomic operations (all-or-nothing)
4. Add recovery procedures for interrupted operations
5. Create rollback tests

**Deliverables:**

- Integration with existing RollbackService
- `src/services/compression/compression-rollback.service.ts`
- Comprehensive rollback integration tests

**Success Criteria:**

- Rollback restores original state after failed compression
- Interrupted operations can be recovered
- Atomic operations ensure data consistency

---

### Phase 4: Tooling & MCP Integration (Days 14-16)

#### Day 14-15: MCP Tool Implementation

**Tasks:**

1. Create `compress_old_files` tool
2. Create `restore_compressed_files` tool
3. Create `list_archives` tool
4. Create `verify_archive` tool
5. Add tool input validation with Zod schemas

**Deliverables:**

- `src/tools/compression.ts`
- `src/schemas/compression.schemas.ts`
- Tool registration in server.ts

**Success Criteria:**

- All tools registered and accessible via MCP
- Input validation rejects invalid parameters
- Tools return properly formatted responses

#### Day 16: Configuration & Defaults

**Tasks:**

1. Add compression settings to config schema
2. Create default configuration
3. Add configuration validation
4. Document all configuration options
5. Create example configurations

**Deliverables:**

- Updated `config.schema.json`
- `examples/config.compression.json`
- Configuration documentation

**Success Criteria:**

- Configuration loads and validates correctly
- Defaults are sensible and secure
- Documentation is complete

---

### Phase 5: Testing & Hardening (Days 17-19)

#### Day 17-18: Testing

**Tasks:**

1. Write 50 critical fuzz tests (security focus)
2. Write 100 integration tests
3. Add performance benchmarks
4. Create test fixtures for various file types
5. Add race condition tests

**Deliverables:**

- `tests/unit/services/compression/`
- `tests/integration/compression/`
- `tests/fuzz/compression/`
- Performance benchmark suite

**Success Criteria:**

- All tests pass
- Code coverage >90%
- Fuzz tests reveal no vulnerabilities
- Performance benchmarks meet targets

#### Day 19: Documentation & Polish

**Tasks:**

1. Write API documentation
2. Create user guide
3. Add troubleshooting section
4. Final code review
5. Update CHANGELOG.md

**Deliverables:**

- `docs/compression-api.md`
- `docs/compression-user-guide.md`
- Updated README.md
- Updated CHANGELOG.md

**Success Criteria:**

- Documentation is comprehensive
- Examples are clear and working
- Feature is ready for release

---

## 4. File Structure

### 4.1 Directory Layout

```
src/
├── services/
│   └── compression/
│       ├── index.ts                          # Public API exports
│       ├── compression.service.ts            # Main service
│       ├── compression-orchestrator.service.ts
│       │
│       ├── engines/
│       │   ├── compression-engine.abstract.ts
│       │   ├── zlib.engine.ts                # Default (Node.js native)
│       │   ├── zstd.engine.ts                # Optional (runtime detection)
│       │   └── zip.engine.ts                 # Windows compatibility
│       │
│       ├── workers/
│       │   └── compression.worker.ts         # Worker thread implementation
│       │
│       ├── index-manager.service.ts          # SQLite metadata
│       ├── archive-builder.service.ts        # Archive creation
│       ├── archive-storage.service.ts        # Storage management
│       ├── restore-engine.service.ts         # Extraction & restore
│       ├── checkpoint.service.ts             # Checkpoint/resume
│       ├── file-age-scanner.service.ts       # Age-based scanning
│       ├── conflict-resolver.service.ts      # Conflict handling
│       └── compression-rollback.service.ts   # Rollback integration
│
├── tools/
│   └── compression.ts                        # MCP tools
│
├── schemas/
│   └── compression.schemas.ts                # Zod schemas
│
└── types/
    └── compression.types.ts                  # TypeScript interfaces

storage/
└── .compressed/                              # Archive storage
    ├── .index/
    │   ├── compression.db                    # SQLite database
    │   ├── compression.db-wal                # Write-ahead log
    │   └── compression.db-shm                # Shared memory
    ├── .locks/
    │   └── compression.lock                  # Operation lock
    ├── by-date/
    │   └── 2026/
    │       └── 02/
    │           └── 2026-02-10_logs.tar.gz
    ├── by-category/
    │   ├── logs/
    │   ├── cache/
    │   └── temp/
    └── temp/
        └── compression_{timestamp}/          # Temporary files
```

### 4.2 Key Files

| File                         | Purpose             | Lines Est. |
| ---------------------------- | ------------------- | ---------- |
| `compression.service.ts`     | Main orchestration  | 400        |
| `index-manager.service.ts`   | Database operations | 350        |
| `archive-builder.service.ts` | Archive creation    | 300        |
| `restore-engine.service.ts`  | Restore operations  | 350        |
| `zlib.engine.ts`             | Zlib compression    | 200        |
| `compression.ts` (tools)     | MCP tools           | 400        |
| `compression.schemas.ts`     | Validation schemas  | 200        |
| `compression.types.ts`       | Type definitions    | 300        |

---

## 5. Testing Strategy

### 5.1 Test Pyramid

```
                    ┌─────────┐
                    │   E2E   │  10 tests
                    │  (5%)   │  Full workflows
                    ├─────────┤
                    │   Int   │  100 tests
                    │  (25%)  │  Service integration
                    ├─────────┤
                    │  Unit   │  200 tests
                    │  (50%)  │  Individual functions
                    ├─────────┤
                    │  Fuzz   │  50 tests (v3.0) / 150 (v3.1)
                    │  (20%)  │  Security & edge cases
                    └─────────┘
```

### 5.2 Critical Fuzz Tests (v3.0 - 50 tests)

#### Security Fuzz Tests (20 tests)

```typescript
// Path Traversal
fuzz("should reject path traversal in archive paths", async () => {
  const maliciousPaths = [
    "../../../etc/passwd",
    "..\\..\\windows\\system32",
    "....//....//etc/hosts",
    "%2e%2e%2f%2e%2e%2fsecret.txt",
  ];
  for (const path of maliciousPaths) {
    await expect(compress({ path })).rejects.toThrow(PathValidationError);
  }
});

// Zip Bomb Protection
fuzz("should detect and reject zip bombs", async () => {
  const zipBomb = createZipBomb({ ratio: 150 }); // >100:1
  await expect(compress({ source: zipBomb })).rejects.toThrow(ZipBombError);
});

// Null Byte Injection
fuzz("should reject paths with null bytes", async () => {
  const nullPaths = ["file.txt\x00.exe", "normal.txt\x00", "\x00hidden.exe"];
  for (const path of nullPaths) {
    await expect(compress({ path })).rejects.toThrow(ValidationError);
  }
});

// Symlink Attacks
fuzz("should handle symlink attacks safely", async () => {
  const scenarios = [
    { type: "symlink_to_parent", target: "../outside" },
    { type: "circular_symlink", target: "./loop" },
    { type: "symlink_to_root", target: "/" },
  ];
  for (const scenario of scenarios) {
    await expect(handleSymlink(scenario)).rejects.toThrow(SecurityError);
  }
});
```

#### Edge Case Fuzz Tests (30 tests)

```typescript
// File Size Edge Cases
fuzz("should handle edge case file sizes", async () => {
  const sizes = [0, 1, 1024, 1024 * 1024 * 1024, Number.MAX_SAFE_INTEGER];
  for (const size of sizes) {
    const result = await compress({ testFile: createFile(size) });
    expect(result).toBeDefined();
  }
});

// Filename Edge Cases
fuzz("should handle edge case filenames", async () => {
  const names = [
    "",
    ".",
    "..",
    " ",
    "  ",
    "normal.txt",
    ".hidden",
    "file:with:colons.txt",
    "file<with>brackets.txt",
    "unicode_文件_📄.txt",
    "a".repeat(255),
  ];
  for (const name of names) {
    await expect(compress({ name })).resolves.toBeDefined();
  }
});

// Concurrent Operations
fuzz("should handle concurrent compression operations", async () => {
  const promises = Array(10)
    .fill(null)
    .map(() => compress({ source: "test" }));
  const results = await Promise.allSettled(promises);
  expect(results.every((r) => r.status === "fulfilled")).toBe(true);
});

// Interrupted Operations
fuzz("should handle interrupted operations gracefully", async () => {
  const operation = compressLarge({ size: "10GB" });
  setTimeout(() => operation.cancel(), 1000);
  await expect(operation).rejects.toThrow(OperationCancelledError);
  // Verify cleanup
  expect(await tempFilesExist()).toBe(false);
});
```

### 5.3 Integration Tests (100 tests)

#### Archive Operations (40 tests)

```typescript
describe("Archive Creation", () => {
  test("creates archive from directory", async () => {
    const result = await compressOldFiles({
      source: "/test/project",
      age: 30,
    });
    expect(result.archivePath).toExist();
    expect(result.compressionRatio).toBeGreaterThan(1.5);
  });

  test("handles nested directories", async () => {
    const result = await compressOldFiles({
      source: "/test/nested/very/deep",
      age: 30,
    });
    expect(result.fileCount).toBe(50);
  });

  test("respects exclusion patterns", async () => {
    await compressOldFiles({ source: "/test", exclude: ["*.exe"] });
    const archive = await listArchiveContents();
    expect(archive.files.some((f) => f.endsWith(".exe"))).toBe(false);
  });
});

describe("Restore Operations", () => {
  test("restores complete archive", async () => {
    const archive = await createTestArchive();
    const result = await restoreArchive({ id: archive.id });
    expect(result.restoredFiles).toBe(archive.fileCount);
    expect(await verifyChecksums(result.files)).toBe(true);
  });

  test("restores selective files", async () => {
    await restoreArchive({
      id: "test-archive",
      filter: "*.log",
    });
    const restored = await listRestoredFiles();
    expect(restored.every((f) => f.endsWith(".log"))).toBe(true);
  });

  test("handles conflict resolution", async () => {
    // Create existing file
    await fs.writeFile("/test/file.txt", "existing");

    // Restore with overwrite
    await restoreArchive({
      id: "test-archive",
      conflictStrategy: "overwrite",
    });
    expect(await fs.readFile("/test/file.txt", "utf8")).toBe("archived");
  });
});
```

#### Checkpoint & Recovery (30 tests)

```typescript
describe("Checkpointing", () => {
  test("creates checkpoint after 50 files", async () => {
    const operation = compressOldFiles({ checkpointInterval: 50 });
    await advanceTime(1000);
    expect(await checkpointExists()).toBe(true);
  });

  test("resumes from checkpoint", async () => {
    // Create partial checkpoint
    const checkpoint = await createPartialCheckpoint({ filesProcessed: 25 });

    // Resume
    const result = await compressOldFiles({ resumeFrom: checkpoint.id });
    expect(result.filesProcessed).toBe(50); // Total
  });

  test("handles checkpoint corruption", async () => {
    await corruptCheckpoint("test-checkpoint");
    await expect(resumeFromCheckpoint("test-checkpoint")).rejects.toThrow(
      CorruptedCheckpointError,
    );
  });
});
```

#### Rollback Integration (30 tests)

```typescript
describe("Rollback Integration", () => {
  test("rolls back on compression failure", async () => {
    const files = await createTestFiles(10);

    try {
      await compressWithFailure({ failAt: 5 });
    } catch (e) {
      // Verify rollback
      expect(await filesExist(files)).toBe(true);
      expect(await archiveExists()).toBe(false);
    }
  });

  test("preserves data during restore rollback", async () => {
    const original = await fs.readFile("/test/important.txt");

    try {
      await restoreWithFailure({ target: "/test/important.txt" });
    } catch (e) {
      // Verify original preserved
      expect(await fs.readFile("/test/important.txt")).toEqual(original);
    }
  });
});
```

### 5.4 Unit Tests (200 tests)

Coverage targets by component:

| Component         | Tests | Coverage Target |
| ----------------- | ----- | --------------- |
| IndexManager      | 40    | 95%             |
| ZlibEngine        | 30    | 95%             |
| ArchiveBuilder    | 35    | 90%             |
| RestoreEngine     | 35    | 90%             |
| CheckpointService | 25    | 95%             |
| FileAgeScanner    | 20    | 90%             |
| ConflictResolver  | 15    | 95%             |

---

## 6. Security Checklist

### 6.1 All 5 Security Conditions

#### ✅ Condition 1: 8-Layer PathValidatorService Integration

**Implementation:**

```typescript
class CompressionService {
  constructor(
    private pathValidator: PathValidatorService,
    // ...
  ) {}

  async compressOldFiles(options: CompressOptions): Promise<CompressionResult> {
    // All paths validated through 8-layer pipeline
    const validatedSource = await this.pathValidator.validate(options.source, {
      mustExist: true,
      checkSymlinks: true,
    });

    const validatedDestination = await this.pathValidator.validate(
      options.destination,
      { mustExist: false, checkWriteAccess: true },
    );

    // Validate all archive contents before extraction
    for (const file of archiveContents) {
      await this.pathValidator.validate(path.join(extractPath, file.path), {
        preventTraversal: true,
      });
    }
  }
}
```

**Validation Layers:**

1. Type Validation (Zod Schema)
2. Null Byte & Basic Sanitization
3. Path Normalization & Windows Case Adjustment
4. Traversal Sequence Prevention (../)
5. Absolute Path Resolution
6. Security Check (Whitelist & Blacklist)
7. Symlink Resolution & Target Validation
8. Existence & Access Check

#### ✅ Condition 2: 100:1 Compression Ratio Limits (Zip Bomb Protection)

**Implementation:**

```typescript
class ArchiveBuilder {
  private readonly MAX_COMPRESSION_RATIO = 100;

  async addFile(filePath: string): Promise<void> {
    const stats = await fs.stat(filePath);
    const compressedSize = await this.compressFile(filePath);

    const ratio = stats.size / compressedSize;

    if (ratio > this.MAX_COMPRESSION_RATIO) {
      throw new ZipBombError(
        `Compression ratio ${ratio}:1 exceeds maximum ${this.MAX_COMPRESSION_RATIO}:1. ` +
          `File may be a zip bomb or contain highly compressible data.`,
      );
    }
  }
}
```

**Tests:**

```typescript
test("rejects files with compression ratio > 100:1", async () => {
  const zipBomb = createZipBomb({ ratio: 150 });
  await expect(builder.addFile(zipBomb)).rejects.toThrow(ZipBombError);
});
```

#### ✅ Condition 3: Streaming APIs Mandatory for Files >10MB

**Implementation:**

```typescript
class CompressionEngine {
  private readonly STREAMING_THRESHOLD = 10 * 1024 * 1024; // 10MB

  async compressFile(sourcePath: string, destPath: string): Promise<void> {
    const stats = await fs.stat(sourcePath);

    if (stats.size > this.STREAMING_THRESHOLD) {
      await this.streamCompress(sourcePath, destPath);
    } else {
      await this.bufferCompress(sourcePath, destPath);
    }
  }

  private async streamCompress(source: string, dest: string): Promise<void> {
    const readStream = createReadStream(source);
    const writeStream = createWriteStream(dest);
    const gzip = createGzip({ level: 6 });

    await pipeline(readStream, gzip, writeStream);
  }
}
```

**Enforcement:**

```typescript
// Static analysis rule
if (fileSize > 10MB && !usingStreamingAPI) {
  throw new SecurityError('Files >10MB must use streaming APIs');
}
```

#### ✅ Condition 4: Rollback System Integration

**Implementation:**

```typescript
class CompressionOrchestrator {
  constructor(
    private rollbackService: RollbackService,
    private compressionRollback: CompressionRollbackService,
  ) {}

  async compressWithRollback(
    options: CompressOptions,
  ): Promise<CompressionResult> {
    const rollbackId = await this.rollbackService.createCheckpoint({
      type: "compression",
      affectedPaths: options.sourcePaths,
    });

    try {
      const result = await this.compress(options);

      // Create rollback manifest for compressed files
      await this.compressionRollback.createManifest({
        rollbackId,
        compressedFiles: result.files,
        archivePath: result.archivePath,
      });

      return result;
    } catch (error) {
      // Automatic rollback on failure
      await this.rollbackService.rollback(rollbackId);
      throw error;
    }
  }
}
```

#### ✅ Condition 5: Testing Requirements

**v3.0 (Critical):**

- 50 fuzz tests covering security edge cases
- All tests must pass before merge

**v3.1 (Full):**

- 150 fuzz tests including race conditions
- Performance benchmarks
- Load testing

**Test Execution:**

```bash
# Security tests
npm run test:security

# Fuzz tests
npm run test:fuzz:compression

# All compression tests
npm run test:compression
```

### 6.2 Additional Security Measures

#### Symlink Handling

```typescript
async function safeExtract(
  archivePath: string,
  destPath: string,
): Promise<void> {
  const entries = await listArchiveEntries(archivePath);

  for (const entry of entries) {
    const extractPath = path.resolve(destPath, entry.path);

    // Verify extraction path is within destination
    if (!extractPath.startsWith(path.resolve(destPath))) {
      throw new SecurityError(`Path traversal detected: ${entry.path}`);
    }

    // Handle symlinks
    if (entry.isSymlink) {
      const target = await resolveSymlinkTarget(entry);

      // Reject symlinks pointing outside extraction directory
      if (!target.startsWith(path.resolve(destPath))) {
        throw new SecurityError(`Dangerous symlink detected: ${entry.path}`);
      }
    }
  }
}
```

#### Checksum Verification

```typescript
interface ArchiveVerification {
  archiveChecksum: string; // SHA-256 of entire archive
  fileChecksums: Map<string, string>; // SHA-256 of each file
}

async function verifyArchive(archiveId: string): Promise<boolean> {
  const archive = await indexManager.getArchive(archiveId);

  // Verify archive integrity
  const archiveHash = await calculateSHA256(archive.archivePath);
  if (archiveHash !== archive.checksum) {
    throw new CorruptedArchiveError("Archive checksum mismatch");
  }

  // Verify individual files
  for (const file of archive.files) {
    const fileHash = await calculateSHA256(file.path);
    if (fileHash !== file.checksum) {
      throw new CorruptedFileError(`File checksum mismatch: ${file.path}`);
    }
  }

  return true;
}
```

#### Rate Limiting

```typescript
class CompressionRateLimiter {
  private operations: Map<string, number[]> = new Map();
  private readonly MAX_OPS_PER_MINUTE = 10;

  async checkLimit(userId: string): Promise<void> {
    const now = Date.now();
    const userOps = this.operations.get(userId) || [];

    // Remove old entries
    const recent = userOps.filter((t) => now - t < 60000);

    if (recent.length >= this.MAX_OPS_PER_MINUTE) {
      throw new RateLimitError("Too many compression operations");
    }

    recent.push(now);
    this.operations.set(userId, recent);
  }
}
```

---

## 7. Rollback Plan

### 7.1 Rollback Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Rollback Flow                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Operation Start                                            │
│       │                                                     │
│       ▼                                                     │
│  ┌───────────────┐     Create checkpoint                    │
│  │  Checkpoint   │◄──── Save original state                 │
│  │   Creation    │                                         │
│  └───────┬───────┘                                         │
│          │                                                  │
│          ▼                                                  │
│  ┌───────────────┐                                          │
│  │   Execute     │◄──── Perform operation                   │
│  │  Operation    │                                         │
│  └───────┬───────┘                                         │
│          │                                                  │
│     ┌────┴────┐                                             │
│     │         │                                             │
│  Success   Failure                                          │
│     │         │                                             │
│     ▼         ▼                                             │
│  ┌──────┐  ┌──────────┐                                     │
│  │ Done │  │ Rollback │◄──── Restore original state         │
│  └──────┘  └──────────┘                                     │
│                 │                                           │
│                 ▼                                           │
│           ┌──────────┐                                      │
│           │ Cleanup  │◄──── Remove temp files               │
│           └──────────┘                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 Compression Rollback

#### Scenario: Failed Compression

**Before:**

```
/source/
  ├── file1.log (30 days old)
  ├── file2.log (30 days old)
  └── file3.txt (5 days old)
```

**Operation:**

```typescript
await compressOldFiles({
  source: "/source",
  age: 30, // Days
});
```

**Failure at step 3 (file2 compression fails):**

1. **Automatic Rollback Triggered:**

```typescript
async function rollbackCompression(checkpointId: string): Promise<void> {
  const checkpoint = await loadCheckpoint(checkpointId);

  // Remove partially created archive
  if (await fileExists(checkpoint.archivePath)) {
    await fs.unlink(checkpoint.archivePath);
  }

  // Restore any moved/deleted files
  for (const file of checkpoint.affectedFiles) {
    if (file.backupPath && (await fileExists(file.backupPath))) {
      await fs.rename(file.backupPath, file.originalPath);
    }
  }

  // Clean up temp files
  await cleanupTempFiles(checkpoint.tempDirectory);

  // Update index
  await indexManager.markOperationFailed(checkpointId);
}
```

**After Rollback:**

```
/source/
  ├── file1.log (30 days old) ✓ Restored
  ├── file2.log (30 days old) ✓ Preserved
  └── file3.txt (5 days old)  ✓ Never touched
```

#### Scenario: Restore Rollback

**Before:**

```
/source/
  └── existing.txt (current content)

/compressed/
  └── archive_2026-02-10.tar.gz
      └── existing.txt (archived content)
```

**Operation:**

```typescript
await restoreArchive({
  id: "archive_2026-02-10",
  conflictStrategy: "overwrite",
});
```

**Failure during restore:**

1. **Pre-restore Backup:**

```typescript
async function restoreWithRollback(archiveId: string): Promise<void> {
  // Create backup of files that will be overwritten
  const filesToBackup = await findConflictingFiles(archiveId);

  const backupId = await createBackup(filesToBackup);

  try {
    await performRestore(archiveId);
  } catch (error) {
    // Rollback to pre-restore state
    await restoreFromBackup(backupId);
    throw new RestoreError("Restore failed, rolled back to previous state");
  }

  // Clean up backup after successful restore
  await deleteBackup(backupId);
}
```

### 7.3 Manual Rollback Procedures

#### Emergency Rollback

If automatic rollback fails:

```bash
# 1. Stop all compression operations
npm run compression:stop

# 2. Check operation status
npm run compression:status

# 3. List checkpoints
npm run compression:checkpoints

# 4. Manual rollback to specific checkpoint
npm run compression:rollback --checkpoint=<checkpoint-id>

# 5. Verify integrity
npm run compression:verify --archive=<archive-id>
```

#### Data Recovery

If archives are corrupted:

```typescript
// Attempt repair
const repaired = await compressionService.attemptRepair(archiveId);

// If repair fails, extract what we can
const partial = await compressionService.extractPartial(archiveId, {
  skipCorrupted: true,
});
```

### 7.4 Rollback Testing

```typescript
describe("Rollback Scenarios", () => {
  test("rolls back on compression failure", async () => {
    const files = await createTestFiles(5);

    // Trigger failure mid-compression
    const result = await compressWithFailure({ failAt: 3 });

    // Verify no files lost
    for (const file of files) {
      expect(await fileExists(file)).toBe(true);
    }

    // Verify no partial archives
    expect(await listArchives()).toHaveLength(0);
  });

  test("rolls back on restore failure", async () => {
    const original = await fs.readFile("/test/file.txt", "utf8");

    // Trigger failure mid-restore
    await expect(restoreWithFailure({ failAt: 2 })).rejects.toThrow();

    // Verify original content preserved
    expect(await fs.readFile("/test/file.txt", "utf8")).toBe(original);
  });

  test("handles power failure simulation", async () => {
    // Start compression
    const operation = compressLarge({ size: "1GB" });

    // Simulate power failure (kill process)
    await killProcess(operation.pid);

    // Restart and resume
    const resumed = await resumeOperation();
    expect(resumed.status).toBe("completed");
  });
});
```

---

## 8. MCP Tools

### 8.1 Tool Definitions

#### `compress_old_files`

```typescript
{
  name: 'compress_old_files',
  description: 'Compress old files based on age threshold and file patterns',
  inputSchema: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        description: 'Source directory to scan for old files',
      },
      age: {
        type: 'number',
        description: 'Age threshold in days (30, 60, or 90)',
        enum: [30, 60, 90],
        default: 60,
      },
      patterns: {
        type: 'array',
        items: { type: 'string' },
        description: 'File patterns to include (e.g., *.log, *.tmp)',
        default: ['*.log', '*.tmp', '*.cache'],
      },
      exclude: {
        type: 'array',
        items: { type: 'string' },
        description: 'Patterns to exclude',
        default: ['*.exe', '*.dll', '*.sys'],
      },
      destination: {
        type: 'string',
        description: 'Destination directory for archives',
      },
      format: {
        type: 'string',
        enum: ['tar.gz', 'zip', 'tar.zst'],
        default: 'tar.gz',
      },
      level: {
        type: 'number',
        minimum: 1,
        maximum: 9,
        default: 6,
      },
      dryRun: {
        type: 'boolean',
        description: 'Preview what would be compressed without making changes',
        default: false,
      },
      deleteSource: {
        type: 'boolean',
        description: 'Delete source files after successful compression',
        default: true,
      },
    },
    required: ['source'],
  },
}
```

**Example Usage:**

```json
{
  "source": "/home/user/projects/myapp/logs",
  "age": 30,
  "patterns": ["*.log", "*.debug"],
  "exclude": ["current.log"],
  "dryRun": true
}
```

**Response:**

```typescript
{
  content: [
    {
      type: 'text',
      text: 'Compression completed successfully',
    },
    {
      type: 'json',
      json: {
        archiveId: 'arc_2026-02-10_logs',
        archivePath: '/home/user/.compressed/by-date/2026/02/2026-02-10_logs.tar.gz',
        sourceDirectory: '/home/user/projects/myapp/logs',
        filesCompressed: 45,
        originalSize: 157286400, // 150MB
        compressedSize: 52428800, // 50MB
        compressionRatio: 3.0,
        duration: 12500, // ms
        filesDeleted: 45,
        spaceReclaimed: 104857600, // 100MB
      },
    },
  ],
}
```

#### `restore_compressed_files`

```typescript
{
  name: 'restore_compressed_files',
  description: 'Restore files from a compressed archive',
  inputSchema: {
    type: 'object',
    properties: {
      archiveId: {
        type: 'string',
        description: 'ID of the archive to restore',
      },
      target: {
        type: 'string',
        description: 'Target directory for restored files (defaults to original location)',
      },
      filter: {
        type: 'array',
        items: { type: 'string' },
        description: 'File patterns to restore (e.g., *.log)',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific file paths to restore',
      },
      conflictStrategy: {
        type: 'string',
        enum: ['rename', 'skip', 'overwrite'],
        default: 'rename',
      },
      verify: {
        type: 'boolean',
        description: 'Verify checksums after restoration',
        default: true,
      },
    },
    required: ['archiveId'],
  },
}
```

**Example Usage:**

```json
{
  "archiveId": "arc_2026-02-10_logs",
  "filter": ["*.log"],
  "conflictStrategy": "rename",
  "verify": true
}
```

**Response:**

```typescript
{
  content: [
    {
      type: 'text',
      text: 'Restore completed successfully',
    },
    {
      type: 'json',
      json: {
        archiveId: 'arc_2026-02-10_logs',
        restoredFiles: 45,
        skippedFiles: 0,
        failedFiles: [],
        totalBytesRestored: 157286400,
        duration: 8200,
        targetDirectory: '/home/user/projects/myapp/logs',
      },
    },
  ],
}
```

#### `list_archives`

```typescript
{
  name: 'list_archives',
  description: 'List compressed archives with filtering options',
  inputSchema: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        description: 'Filter by source directory',
      },
      fromDate: {
        type: 'string',
        format: 'date',
        description: 'Filter archives created after this date',
      },
      toDate: {
        type: 'string',
        format: 'date',
        description: 'Filter archives created before this date',
      },
      status: {
        type: 'string',
        enum: ['active', 'restored', 'deleted', 'corrupted'],
      },
      limit: {
        type: 'number',
        default: 50,
      },
      offset: {
        type: 'number',
        default: 0,
      },
    },
  },
}
```

**Response:**

```typescript
{
  content: [
    {
      type: 'json',
      json: {
        total: 12,
        archives: [
          {
            id: 'arc_2026-02-10_logs',
            archivePath: '/home/user/.compressed/2026-02-10_logs.tar.gz',
            sourceDirectory: '/home/user/projects/myapp/logs',
            createdAt: '2026-02-10T14:30:00Z',
            fileCount: 45,
            originalSize: 157286400,
            compressedSize: 52428800,
            compressionRatio: 3.0,
            status: 'active',
          },
        ],
      },
    },
  ],
}
```

#### `verify_archive`

```typescript
{
  name: 'verify_archive',
  description: 'Verify integrity of a compressed archive',
  inputSchema: {
    type: 'object',
    properties: {
      archiveId: {
        type: 'string',
        description: 'ID of the archive to verify',
      },
      deep: {
        type: 'boolean',
        description: 'Verify individual file checksums (slower)',
        default: false,
      },
    },
    required: ['archiveId'],
  },
}
```

**Response:**

```typescript
{
  content: [
    {
      type: 'text',
      text: 'Archive verification completed',
    },
    {
      type: 'json',
      json: {
        archiveId: 'arc_2026-02-10_logs',
        status: 'valid',
        archiveChecksum: {
          expected: 'sha256:a1b2c3...',
          actual: 'sha256:a1b2c3...',
          match: true,
        },
        filesVerified: 45,
        filesCorrupted: 0,
        lastVerified: '2026-02-10T15:00:00Z',
      },
    },
  ],
}
```

#### `delete_archive`

```typescript
{
  name: 'delete_archive',
  description: 'Delete a compressed archive',
  inputSchema: {
    type: 'object',
    properties: {
      archiveId: {
        type: 'string',
        description: 'ID of the archive to delete',
      },
      force: {
        type: 'boolean',
        description: 'Delete without confirmation',
        default: false,
      },
    },
    required: ['archiveId'],
  },
}
```

### 8.2 Tool Registration

```typescript
// src/index.ts
import { registerCompressionTools } from "./tools/compression.js";

export function createServer() {
  const server = new Server({
    name: "file-organizer-mcp",
    version: VERSION,
  });

  // Existing tools
  registerFileTools(server);
  registerOrganizationTools(server);

  // Compression tools
  registerCompressionTools(server);

  return server;
}
```

---

## 9. Configuration

### 9.1 Configuration Schema

```json
{
  "compression": {
    "enabled": {
      "type": "boolean",
      "default": true,
      "description": "Enable compression feature"
    },
    "defaultAge": {
      "type": "number",
      "enum": [30, 60, 90],
      "default": 60,
      "description": "Default age threshold in days"
    },
    "defaultFormat": {
      "type": "string",
      "enum": ["tar.gz", "zip", "tar.zst"],
      "default": "tar.gz",
      "description": "Default compression format"
    },
    "defaultLevel": {
      "type": "number",
      "minimum": 1,
      "maximum": 9,
      "default": 6,
      "description": "Default compression level (1=fast, 9=best)"
    },
    "patterns": {
      "type": "array",
      "items": { "type": "string" },
      "default": ["*.log", "*.tmp", "*.cache", "*.old", "*.bak"],
      "description": "Default file patterns to compress"
    },
    "exclusions": {
      "type": "array",
      "items": { "type": "string" },
      "default": ["*.exe", "*.dll", "*.sys", "*.bin", "Thumbs.db", ".DS_Store"],
      "description": "File patterns to always exclude"
    },
    "destination": {
      "type": "string",
      "default": "~/.compressed",
      "description": "Default destination for archives"
    },
    "maxArchiveSize": {
      "type": "number",
      "default": 10737418240,
      "description": "Maximum archive size in bytes (10GB)"
    },
    "maxCompressionRatio": {
      "type": "number",
      "default": 100,
      "description": "Maximum allowed compression ratio (zip bomb protection)"
    },
    "streamingThreshold": {
      "type": "number",
      "default": 10485760,
      "description": "File size threshold for streaming (10MB)"
    },
    "workerThreads": {
      "type": "number",
      "minimum": 1,
      "maximum": 16,
      "default": 4,
      "description": "Number of worker threads for compression"
    },
    "checkpointInterval": {
      "type": "number",
      "default": 50,
      "description": "Create checkpoint every N files"
    },
    "retention": {
      "type": "object",
      "properties": {
        "maxArchives": {
          "type": "number",
          "default": 1000,
          "description": "Maximum number of archives to keep"
        },
        "maxAge": {
          "type": "number",
          "default": 365,
          "description": "Maximum age of archives in days"
        },
        "maxTotalSize": {
          "type": "number",
          "default": 107374182400,
          "description": "Maximum total archive size (100GB)"
        }
      }
    },
    "enableZstd": {
      "type": "boolean",
      "default": false,
      "description": "Enable ZSTD compression (requires optional dependency)"
    },
    "autoOrganize": {
      "type": "object",
      "properties": {
        "enabled": {
          "type": "boolean",
          "default": false,
          "description": "Automatically compress old files during auto-organize"
        },
        "schedule": {
          "type": "string",
          "default": "0 2 * * 0",
          "description": "Cron schedule for automatic compression"
        }
      }
    }
  }
}
```

### 9.2 Example Configurations

#### Conservative (Production Safe)

```json
{
  "compression": {
    "defaultAge": 90,
    "defaultLevel": 3,
    "patterns": ["*.log", "*.tmp"],
    "workerThreads": 2,
    "checkpointInterval": 25,
    "retention": {
      "maxArchives": 500,
      "maxAge": 180
    },
    "autoOrganize": {
      "enabled": false
    }
  }
}
```

#### Aggressive (Maximum Space Saving)

```json
{
  "compression": {
    "defaultAge": 30,
    "defaultLevel": 9,
    "patterns": ["*.log", "*.tmp", "*.cache", "*.old", "*.bak", "*.debug"],
    "workerThreads": 8,
    "enableZstd": true,
    "autoOrganize": {
      "enabled": true,
      "schedule": "0 2 * * *"
    }
  }
}
```

#### Windows Compatible

```json
{
  "compression": {
    "defaultFormat": "zip",
    "patterns": ["*.log", "*.tmp", "Thumbs.db"],
    "exclusions": ["*.exe", "*.dll", "*.sys", "desktop.ini"],
    "workerThreads": 4
  }
}
```

### 9.3 Environment Variables

| Variable                | Description                | Default                               |
| ----------------------- | -------------------------- | ------------------------------------- |
| `COMPRESSION_ENABLED`   | Enable/disable compression | `true`                                |
| `COMPRESSION_WORKERS`   | Number of worker threads   | `4`                                   |
| `COMPRESSION_DB_PATH`   | SQLite database location   | `~/.compressed/.index/compression.db` |
| `COMPRESSION_TEMP_DIR`  | Temporary file directory   | `~/.compressed/temp`                  |
| `COMPRESSION_MAX_RATIO` | Maximum compression ratio  | `100`                                 |
| `COMPRESSION_LOG_LEVEL` | Logging verbosity          | `info`                                |

---

## 10. Acceptance Criteria

### 10.1 Functional Requirements

#### Must Have (P0)

- [ ] Compress files older than configurable age (30/60/90 days)
- [ ] Support _.log, _.tmp, \*.cache patterns by default
- [ ] Create .tar.gz archives (default format)
- [ ] Calculate and store compression ratios
- [ ] Delete source files after successful compression (configurable)
- [ ] Restore complete archives
- [ ] List all archives with metadata
- [ ] Verify archive integrity with checksums
- [ ] Integrate with 8-layer PathValidatorService
- [ ] Implement 100:1 compression ratio limit
- [ ] Use streaming APIs for files >10MB
- [ ] Integrate with RollbackService
- [ ] 50 critical fuzz tests passing

#### Should Have (P1)

- [ ] Support .zip format for Windows
- [ ] Support .tar.zst format (opt-in)
- [ ] Selective file restoration
- [ ] Conflict resolution (rename/skip/overwrite)
- [ ] Checkpoint and resume functionality
- [ ] Dry-run mode
- [ ] Open file detection
- [ ] Progress reporting
- [ ] Auto-organize integration
- [ ] Retention policy management

#### Nice to Have (P2)

- [ ] Archive encryption
- [ ] Compression format plugins
- [ ] Parallel archive operations
- [ ] Advanced search/filtering
- [ ] Compression analytics dashboard
- [ ] Cloud storage integration

### 10.2 Performance Requirements

| Metric                      | Target    | Test Method          |
| --------------------------- | --------- | -------------------- |
| Compression Speed (Zlib)    | ≥120 MB/s | Benchmark 1GB file   |
| Compression Speed (ZSTD)    | ≥300 MB/s | Benchmark 1GB file   |
| Memory Usage (10GB archive) | <500MB    | Memory profiling     |
| Restore Speed               | ≥200 MB/s | Benchmark extraction |
| Concurrent Operations       | 4-8 files | Worker pool test     |
| Index Query (<10K archives) | <100ms    | Query benchmark      |
| Checkpoint Creation         | <50ms     | Timing test          |

### 10.3 Security Requirements

- [ ] All paths validated through 8-layer PathValidatorService
- [ ] Path traversal attacks rejected
- [ ] Zip bombs detected (ratio >100:1)
- [ ] Null byte injection prevented
- [ ] Symlink attacks mitigated
- [ ] Checksum verification for all archives
- [ ] Streaming for files >10MB
- [ ] No hardcoded secrets or credentials
- [ ] Rate limiting on operations
- [ ] Audit logging for all operations

### 10.4 Testing Requirements

- [ ] Unit test coverage >90%
- [ ] 50 critical fuzz tests passing
- [ ] 100 integration tests passing
- [ ] 10 E2E tests passing
- [ ] Security tests passing
- [ ] Performance benchmarks meeting targets
- [ ] Rollback tests passing
- [ ] Race condition tests passing
- [ ] Memory leak tests passing
- [ ] Cross-platform tests (Windows/Linux/Mac)

### 10.5 Documentation Requirements

- [ ] API documentation complete
- [ ] User guide with examples
- [ ] Security documentation
- [ ] Configuration reference
- [ ] Troubleshooting guide
- [ ] Architecture diagrams
- [ ] Changelog updated
- [ ] README updated

### 10.6 Definition of Done

A feature is considered complete when:

1. **Code Complete**
   - All P0 requirements implemented
   - Code follows project style guidelines
   - No TypeScript errors
   - ESLint passes

2. **Testing Complete**
   - All tests passing
   - Coverage targets met
   - Security tests passing
   - Performance benchmarks met

3. **Documentation Complete**
   - All documentation requirements met
   - Examples tested and working
   - API reference complete

4. **Review Complete**
   - Code review approved
   - Security review approved
   - Architecture review approved

5. **Integration Complete**
   - MCP tools registered and working
   - Configuration schema updated
   - Rollback integration tested
   - No breaking changes

6. **Release Ready**
   - CHANGELOG.md updated
   - Version bumped
   - Migration guide (if needed)
   - Release notes drafted

---

## Appendix

### A. Dependencies

```json
{
  "dependencies": {
    "better-sqlite3": "^9.4.0",
    "tar-stream": "^3.1.6",
    "p-queue": "^8.0.0",
    "zod": "^3.22.4"
  },
  "optionalDependencies": {
    "@mongodb-js/zstd": "^1.2.0"
  },
  "devDependencies": {
    "@types/tar-stream": "^3.1.3"
  }
}
```

### B. Migration Guide

For existing installations:

```bash
# 1. Install new dependencies
npm install

# 2. Initialize compression database
npm run compression:init

# 3. Run database migrations
npm run compression:migrate

# 4. Verify installation
npm run compression:verify
```

### C. Troubleshooting

| Issue                          | Solution                                               |
| ------------------------------ | ------------------------------------------------------ |
| "better-sqlite3 build failed"  | Install build tools: `npm install --build-from-source` |
| "ZSTD not available"           | Install optional: `npm install @mongodb-js/zstd`       |
| "Permission denied on archive" | Check directory permissions: `chmod 755 ~/.compressed` |
| "Out of memory"                | Reduce worker threads: `COMPRESSION_WORKERS=2`         |
| "Corrupted archive"            | Run verify: `compress verify_archive`                  |

### D. References

- [Auto-Archive Architecture](./auto-archive-architecture.md)
- [Security Documentation](../SECURITY.md)
- [API Documentation](../API.md)
- [Architecture Overview](../../ARCHITECTURE.md)

---

**Document Version:** 1.0  
**Last Updated:** February 10, 2026  
**Approved By:** Multi-Shepherd Debate Consensus  
**Next Review:** Post-implementation (Day 20)
