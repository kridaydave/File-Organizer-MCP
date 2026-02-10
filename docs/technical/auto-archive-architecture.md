# Auto-Archive & Compression Feature - Architectural Proposal

**Author:** ARCHITECT-SHEPHERD  
**Date:** February 9, 2026  
**Version:** 1.0

---

## 1. Executive Summary

This document proposes an architectural design for the Auto-Archive & Compression feature, enabling intelligent archival of files based on configurable rules, compression optimization, and seamless restoration capabilities.

---

## 2. Core Components

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Auto-Archive Architecture                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                │
│  │ Archive      │     │ Compression  │     │ Index        │                │
│  │ Scheduler    │────▶│ Engine       │────▶│ Manager      │                │
│  │ Service      │     │              │     │              │                │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘                │
│         │                    │                    │                         │
│         ▼                    ▼                    ▼                         │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      Archive Storage Layer                           │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │ Archives/   │  │ Metadata/   │  │ Index/      │  │ Logs/       │  │   │
│  │  │ .arc/       │  │ .archive.db │  │ archive.idx │  │ archive.log │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│                                    ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                       Restore Engine                                 │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │ Extraction  │  │ Metadata    │  │ Integrity   │  │ Placement   │  │   │
│  │  │ Service     │  │ Resolver    │  │ Validator   │  │ Service     │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Component Descriptions

| Component                     | Responsibility                                                   | Dependencies                              |
| ----------------------------- | ---------------------------------------------------------------- | ----------------------------------------- |
| **Archive Scheduler Service** | Triggers archival based on cron rules, file age, size thresholds | FileScannerService, SchedulerStateService |
| **Compression Engine**        | Handles format conversion, optimization, streaming compression   | node:fs streams, zlib                     |
| **Index Manager**             | Maintains searchable archive inventory, metadata mapping         | SQLite/WAL mode                           |
| **Archive Storage Layer**     | Physical archive organization, deduplication                     | node:fs                                   |
| **Restore Engine**            | Selective extraction, integrity verification                     | CompressionEngine, IndexManager           |

---

## 3. Compression Format Strategy

### 3.1 Format Comparison

| Format       | Compression Ratio | Speed  | Memory | Multi-file | Standalone | Platform  |
| ------------ | ----------------- | ------ | ------ | ---------- | ---------- | --------- |
| **.tar.gz**  | Good              | Fast   | Low    | Yes        | Yes        | Universal |
| **.tar.zst** | Better            | Fast   | Low    | Yes        | Yes\*      | Universal |
| **.7z**      | Best              | Slow   | High   | Yes        | Yes\*      | Mixed     |
| **.zip**     | Good              | Fast   | Low    | Yes        | Yes        | Universal |
| **.tar.xz**  | Better            | Medium | Medium | Yes        | Yes\*      | Universal |

\*Requires external tool on some platforms

### 3.2 Recommended Strategy

**Primary Format:** `.tar.gz`

- Universal compatibility (Node.js native `zlib`)
- Streaming support for large files
- Preserves directory structure
- Tool-independent

**Optional Formats:**

- `.zip` - For user-facing archives (explorer compatibility)
- `.tar.zst` - For maximum compression (when available)

### 3.3 Compression Configuration Interface

```typescript
interface CompressionConfig {
  format: "tar.gz" | "zip" | "tar.zst";
  level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9; // 1=fastest, 9=best
  streaming: boolean; // Process in chunks
  chunkSize: number; // e.g., 64KB for streaming
}
```

---

## 4. Metadata Storage Strategy

### 4.1 Hybrid Approach: SQLite + JSON Fallback

```
.metadata/
├── archive.db           # SQLite WAL mode for high-frequency writes
├── archive.db-wal       # Write-Ahead Log
├── archive.db-shm      # Shared memory
└── archive.json         # Backup/portable export
```

### 4.2 SQLite Schema

```sql
-- Core archives table
CREATE TABLE archives (
  id TEXT PRIMARY KEY,
  archive_name TEXT NOT NULL,
  source_path TEXT NOT NULL,
  compression_format TEXT NOT NULL,
  original_size INTEGER NOT NULL,
  compressed_size INTEGER NOT NULL,
  compression_ratio REAL,
  file_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  checksum TEXT NOT NULL, -- SHA-256 of entire archive
  status TEXT DEFAULT 'active' -- active, partial, corrupted
);

-- Files within archives
CREATE TABLE archive_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  archive_id TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  original_size INTEGER,
  compressed_size INTEGER,
  checksum TEXT, -- SHA-256 of individual file
  mtime INTEGER,
  permissions TEXT,
  FOREIGN KEY (archive_id) REFERENCES archives(id)
);

-- Searchable metadata
CREATE VIRTUAL TABLE archive_metadata USING fts5(
  tags,
  description,
  source_directory
);

-- Indexes
CREATE INDEX idx_archives_created ON archives(created_at);
CREATE INDEX idx_archives_status ON archives(status);
CREATE INDEX idx_archive_files_archive ON archive_files(archive_id);
```

### 4.3 JSON Export Schema (portable)

```json
{
  "version": "1.0",
  "exported_at": "2026-02-09T00:00:00Z",
  "archives": [
    {
      "id": "uuid-v4",
      "archive_name": "documents_2026-02_backup.tar.gz",
      "source_path": "/Users/docs",
      "files": [
        {
          "relative_path": "report.pdf",
          "size": 1048576,
          "mtime": 1700000000000,
          "checksum": "sha256..."
        }
      ]
    }
  ]
}
```

---

## 5. Archive Folder Structure

### 5.1 Recommended Layout

```
.archives/
├── by-date/
│   └── 2026/
│       └── 02/
│           └── 2026-02-09_documents.tar.gz
│           └── 2026-02-09_downloads.tar.gz
├── by-category/
│   ├── documents/
│   │   └── 2026-02-09_backup.tar.gz
│   └── downloads/
│       └── 2026-02-09_backup.tar.gz
├── by-tag/
│   ├── important/
│   └── temporary/
├── .index/
│   ├── archive.db
│   ├── archive.db-wal
│   └── archive.db-shm
└── .locks/
    └── archive.lock
```

### 5.2 Naming Convention

```
{type}_{source}_{YYYY-MM-DD}[_{counter}].{ext}

Examples:
- daily_docs_2026-02-09.tar.gz
- weekly_backup_2026-02-08.tar.gz
- monthly_archive_2026-02-01.tar.gz
- incremental_2026-02-09_003.tar.gz
```

---

## 6. File Indexing System

### 6.1 Index Entry Structure

```typescript
interface ArchiveIndexEntry {
  // Identification
  archiveId: string;
  archivePath: string;

  // Archive metadata
  format: "tar.gz" | "zip" | "tar.zst";
  createdAt: Date;
  checksum: string;

  // Source information
  sourceRoot: string;
  files: IndexedFile[];

  // Statistics
  totalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

interface IndexedFile {
  path: string; // Relative to archive root
  originalSize: number;
  compressedSize: number;
  checksum: string; // SHA-256
  mtime: Date;
  atime?: Date;
  permissions?: string;
}
```

### 6.2 Index Query API

```typescript
class ArchiveIndexService {
  // Search by content
  async searchByChecksum(checksum: string): Promise<IndexedFile[]>;

  // Find archives containing file
  async findArchivesContainingFile(filePath: string): Promise<string[]>;

  // List archives by date range
  async listArchivesByDateRange(
    start: Date,
    end: Date,
  ): Promise<ArchiveIndexEntry[]>;

  // Get storage statistics
  async getStorageStats(): Promise<{
    totalArchives: number;
    totalOriginalSize: number;
    totalCompressedSize: number;
    averageCompressionRatio: number;
  }>;
}
```

---

## 7. Restore Mechanism Design

### 7.1 Restore Flow Diagram

```
User Request
    │
    ▼
┌───────────────┐
│ Validate      │◄── Check archive integrity
│ Request       │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Query Index   │◄── Find archive, verify existence
│               │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Extract       │───▶ Stream to temp location
│ Archive       │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Verify        │───▶ Checksum validation
│ Integrity     │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Place Files   │───▶ Original path or user-specified
│               │
└───────────────┘
```

### 7.2 Restore Options Interface

```typescript
interface RestoreOptions {
  // Extraction target
  targetPath?: string; // Defaults to original location

  // Selective restore
  filter?: {
    pattern?: string; // Glob pattern
    files?: string[]; // Specific files
  };

  // Conflict resolution
  conflictStrategy: "rename" | "skip" | "overwrite";

  // Post-restore actions
  verifyChecksum: boolean;
  preservePermissions: boolean;
  restoreMtime: boolean;
}

interface RestoreResult {
  restoredFiles: number;
  skippedFiles: number;
  failedFiles: Array<{
    path: string;
    error: string;
  }>;
  totalBytesRestored: number;
  duration: number;
}
```

### 7.3 Selective Extraction Support

```typescript
class SelectiveRestoreService {
  async extractFiles(
    archivePath: string,
    patterns: string[],
  ): Promise<ExtractResult>;

  async previewExtraction(
    archivePath: string,
    patterns: string[],
  ): Promise<ExtractionPreview>;
}
```

---

## 8. Data Flow Diagrams

### 8.1 Archival Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Archival Operation Data Flow                        │
└─────────────────────────────────────────────────────────────────────────┘

User/Scheduler
    │
    │ 1. Trigger Archival Request
    ▼
┌───────────────┐
│ Archive       │◄─── Load rules from config
│ Scheduler     │
│ Service       │
└───────┬───────┘
        │ 2. Get file list
        ▼
┌───────────────┐
│ FileScanner   │───▶ Scan source directory
│ Service       │───▶ Apply inclusion/exclusion
└───────┬───────┘
        │ 3. File list with metadata
        ▼
┌───────────────┐
│ Compression   │───▶ Create temp archive
│ Engine        │───▶ Calculate checksums
│               │───▶ Stream compression
└───────┬───────┘
        │ 4. Compressed archive + checksums
        ▼
┌───────────────┐
│ Archive       │───▶ Move to final location
│ Storage       │───▶ Update folder structure
└───────┬───────┘
        │ 5. Archive created
        ▼
┌───────────────┐
│ Index Manager │───▶ Update SQLite index
│               │───▶ Update FTS5 search index
└───────┬───────┘
        │
        ▼
   Audit Log Complete
```

### 8.2 Restore Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Restore Operation Data Flow                         │
└─────────────────────────────────────────────────────────────────────────┘

User Request
    │
    ▼
┌───────────────┐
│ Request       │◄─── Parse restore options
│ Validator     │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Index Manager │───▶ Locate archive by ID/path
│               │───▶ Verify archive exists
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Integrity     │───▶ Verify archive checksum
│ Validator      │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Extraction    │───▶ Create extraction stream
│ Service       │───▶ Decompress in chunks
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Placement     │───▶ Resolve target paths
│ Service       │───▶ Handle conflicts
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Verification   │───▶ Verify file checksums
│ Service       │───▶ Update restore audit
└───────┬───────┘
        │
        ▼
   Restore Result
```

---

## 9. Interface Definitions

### 9.1 Archive Service Interface

```typescript
interface IArchiveService {
  // Archival operations
  createArchive(
    sourcePath: string,
    options: ArchiveOptions,
  ): Promise<ArchiveResult>;

  scheduleArchive(
    rule: ArchiveRule,
    schedule: string, // cron expression
  ): Promise<string>; // ruleId

  // Restore operations
  restoreArchive(
    archiveId: string,
    options: RestoreOptions,
  ): Promise<RestoreResult>;

  restoreFiles(
    archiveId: string,
    filePatterns: string[],
    options: RestoreOptions,
  ): Promise<RestoreResult>;

  // Query operations
  listArchives(filter?: ArchiveFilter): Promise<ArchiveSummary[]>;
  getArchiveInfo(archiveId: string): Promise<ArchiveInfo>;
  searchArchives(query: string): Promise<ArchiveSummary[]>;

  // Management
  deleteArchive(archiveId: string, deleteSource?: boolean): Promise<void>;
  verifyArchive(archiveId: string): Promise<ArchiveIntegrityResult>;
}
```

### 9.2 Configuration Schema

```typescript
interface ArchiveRule {
  id: string;
  name: string;
  enabled: boolean;

  // Trigger conditions
  trigger: {
    type: "schedule" | "size" | "age" | "manual";
    config: {
      schedule?: string; // cron
      sizeThreshold?: number; // bytes
      ageThreshold?: number; // days
    };
  };

  // Source selection
  source: {
    paths: string[];
    patterns?: string[]; // glob
    excludePatterns?: string[];
  };

  // Compression settings
  compression: {
    format: "tar.gz" | "zip" | "tar.zst";
    level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
    streaming: boolean;
  };

  // Destination
  destination: {
    path: string;
    structure: "by-date" | "by-category" | "flat";
    naming?: string; // template
  };

  // Retention
  retention: {
    maxArchives?: number;
    maxAge?: number; // days
    maxSize?: number; // bytes
  };

  // Post-archive actions
  postActions: {
    deleteSource?: boolean;
    verifyChecksum?: boolean;
    notify?: boolean;
  };
}
```

---

## 10. Storage Strategy Summary

### 10.1 Storage Layout

```
.archives/
├── .index/
│   └── archive.db (SQLite with WAL)
├── .locks/
│   └── archive.lock
├── by-date/
│   └── YYYY/
│       └── MM/
│           └── {name}.tar.gz
├── by-category/
│   └── {category}/
│       └── {name}.tar.gz
└── temp/
    └── extraction_{timestamp}/
```

### 10.2 Capacity Planning

| Metric             | Recommendation                  |
| ------------------ | ------------------------------- |
| Max archive size   | 10GB (streaming support)        |
| Max total archives | Configurable (default: 1000)    |
| Retention period   | Configurable (default: 90 days) |
| Index size         | ~100KB per 1000 archives        |

### 10.3 Performance Considerations

- **SQLite WAL mode** for concurrent reads/writes
- **Streaming compression** for files > 100MB
- **Incremental indexing** for large archives
- **Background compression** for scheduled archives

---

## 11. Security Considerations

### 11.1 Security Requirements

1. **Path Validation** - All archive contents validated before extraction
2. **Symlink Handling** - Symlinks in archives validated or rejected
3. **Archive Scanning** - Archives scanned for path traversal before extraction
4. **Checksum Verification** - SHA-256 for all archives and files
5. **Access Control** - Archives stored in allowed directories only

### 11.2 Threat Mitigation

| Threat                    | Mitigation                                |
| ------------------------- | ----------------------------------------- |
| Zip slip (path traversal) | Validate all extraction paths             |
| Malicious archives        | Scan archive structure before extraction  |
| Resource exhaustion       | Limit archive size, concurrent operations |
| Data corruption           | SHA-256 verification, WAL mode            |

---

## 12. Implementation Phases

### Phase 1: Core Infrastructure

- Archive Scheduler Service
- Compression Engine (tar.gz)
- Basic SQLite Index
- Archive/Extract operations

### Phase 2: Advanced Features

- Restore with conflict resolution
- Selective extraction
- Archive verification
- Retention policies

### Phase 3: Polish

- Progress reporting
- Resume interrupted operations
- Archive encryption (optional)
- Compression format plugins

---

## 13. References

- Existing `RollbackService` pattern for manifest-based operations
- `OrganizerService` for conflict resolution strategies
- `FileScannerService` for directory traversal
- SQLite WAL mode for concurrent access patterns

---

**Status:** Ready for Debate  
**Next Steps:** Review by ARCHITECT-KANE for implementation feasibility
