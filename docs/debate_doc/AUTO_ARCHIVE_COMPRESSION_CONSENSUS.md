# Auto-Archive & Compression - Final Consensus & Implementation Plan

**Document Version**: 1.0  
**Date**: February 9, 2026  
**Status**: Approved for Implementation  
**Total Timeline**: 12 Weeks

---

## Executive Summary

This document represents the final consensus from the Multi-Shepherd Debate on the Auto-Archive & Compression feature. The feature will implement a secure, performant, and maintainable file archiving system for the File-Organizer-MCP project.

**Key Decisions:**

- **Pipeline**: compress-then-encrypt (20-40% better performance)
- **Formats**: Progressive rollout (tar.gz/zip → tar.zst → 7z)
- **Timeline**: 12 weeks (expanded from 8 for risk mitigation)
- **Security**: Multi-layered validation, AES-256-GCM encryption, per-chunk key rotation
- **Architecture**: SQLite-based indexing, modular service design
- **Feature Flag**: Opt-in OFF by default

**Risk Mitigation**: All extraction security controls consolidated in Phase 3, no deferrals to Phase 4.

---

## 1. Architecture Decisions

### 1.1 Canonical Pipeline

```
Input Files → Compression (ZSTD) → Encryption (AES-256-GCM) → Archive Output
```

**Rationale**: Compress-then-encrypt yields 20-40% better compression ratios compared to encrypt-then-compress.

### 1.2 Core Components

| Component               | Responsibility                          | Location                                    |
| ----------------------- | --------------------------------------- | ------------------------------------------- |
| CompressionEngine       | File compression with adaptive profiles | `src/services/compression.service.ts`       |
| IndexManager            | SQLite-based archive indexing (FTS5)    | `src/services/archive.service.ts`           |
| RestoreEngine           | Archive extraction and restoration      | `src/services/restore.service.ts`           |
| ArchiveSchedulerService | Scheduled archive execution             | `src/services/archive-scheduler.service.ts` |

### 1.3 Metadata Storage

- **Primary**: SQLite (WAL mode for concurrency)
- **Portability**: JSON export capability
- **Indexing**: Full-text search via FTS5
- **Integrity**: SHA-256 checksums per file

### 1.4 Archive Structure

```
.archives/
├── by-date/
│   └── YYYY-MM-DD-archive.tar.zst
├── by-category/
│   ├── documents/
│   ├── images/
│   └── logs/
└── index.sqlite
```

### 1.5 Error Handling

- Hierarchy: `ArchiveError` → `CompressionError`, `EncryptionError`, `IndexingError`, `RestoreError`
- Centralized handler: `src/utils/archive-error-handler.ts`

---

## 2. Technical Specifications

### 2.1 Compression Pipeline

**Chunk Size**: 256MB  
**Profiles**:

| Profile  | Level    | Use Case                      |
| -------- | -------- | ----------------------------- |
| FAST     | Level 1  | Real-time archiving           |
| BALANCED | Level 3  | Default scheduled archives    |
| HIGH     | Level 9  | Long-term storage             |
| ULTRA    | Level 19 | Maximum compression (offline) |

**Algorithm**: ZSTD (zstandard) with adaptive compression

### 2.2 Encryption Specification

**Cipher**: AES-256-GCM  
**Key Derivation**: HKDF-SHA256 (per-chunk rotation)  
**PBKDF2**: 310,000 iterations (master password)  
**Nonce**: 12-byte unique per-chunk  
**Integrity**: CRC32 (archive) + SHA-256 (files) + HMAC-SHA256 (signature)

### 2.3 Security Controls

#### P0 (Critical - Phase 3)

- Magic byte verification for all archive formats
- Zip-slip path validation
- Path containment checks
- Decompression limits:
  - `MAX_RATIO = 10` (10:1 expansion limit)
  - `MAX_ABSOLUTE = 2.5GB` per archive
  - `MAX_ENTRIES = 10,000` entries
- Sensitive file blocking patterns:
  - `.env`, `.env.local`, `.env.*`
  - `.ssh/*`, `.aws/*`, `.azure/*`
  - `credentials.json`, `secrets.json`
  - `*key*.pem`, `*.key`, `*.p12`

#### P1 (Important - Phase 3)

- Thread isolation for extraction workers
- 7z/libarchive safety wrappers

**No deferrals to Phase 4** - all extraction security consolidated in Phase 3.

### 2.4 Performance Specifications

**Parallelism**: 4-8 worker threads (Phase 3)  
**Throttling**: Adaptive based on CPU/Memory/I/O  
**Checkpoints**: Every 10-50 chunks for recovery  
**Memory Limits**: <256MB for 1GB archive creation

### 2.5 Format Strategy

| Phase | Formats                       | Purpose                   |
| ----- | ----------------------------- | ------------------------- |
| 1     | `.tar.gz`, `.zip`             | Foundation, compatibility |
| 2     | `.tar.zst`                    | ZSTD adaptive compression |
| 3     | `.7z`                         | AES-256 encryption        |
| 4     | Auto-detection + optimization | Intelligent selection     |

---

## 3. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-5)

**Core Components**: CompressionEngine, IndexManager, RestoreEngine, ArchiveSchedulerService

**Week 1: Setup & Architecture**

- Module structure creation
- SQLite schema design (WAL mode)
- Base interfaces and types
- Error hierarchy implementation
- Test framework setup (Jest)

**Week 2: CompressionEngine**

- ZSTD integration (fast/balanced profiles)
- Chunk-based processing (256MB chunks)
- Progress tracking
- Checkpoint recovery
- Unit tests (80% target)

**Week 3: IndexManager**

- SQLite FTS5 integration
- Metadata extraction
- JSON export functionality
- Search functionality
- Unit tests (80% target)

**Week 4: RestoreEngine**

- Archive format detection
- Basic extraction (tar.gz, zip)
- Integrity verification (SHA-256)
- Error handling
- Unit tests (80% target)

**Week 5: ArchiveSchedulerService & Integration**

- Scheduler integration
- Basic orchestration
- Integration tests (65% target)
- E2E tests (45% target)
- Phase 1 documentation

**Phase 1 Milestones**:

- ✅ All core components functional
- ✅ 80% unit test coverage
- ✅ 65% integration test coverage
- ✅ 45% E2E test coverage
- ✅ ZIP and TAR format support 100%

---

### Phase 2: Advanced Features (Weeks 6-10)

**Advanced Features**: ZSTD full profile set, 7z AES-256, MCP tools

**Week 6: ZSTD Full Implementation**

- HIGH and ULTRA compression profiles
- Adaptive profile selection logic
- Performance optimization
- Unit tests

**Week 7: 7z Integration**

- 7zip-min native binding setup
- AES-256 encryption with 7z format
- Cross-platform compatibility testing (Windows focus)
- Unit tests (95% target)

**Week 8: Security Hardening**

- P0 security controls implementation
- Sensitive file blocking
- Magic byte verification
- Decompression limits enforcement
- Security tests

**Week 9: MCP Tools**

- `create_archive` tool
- `list_archives` tool
- `restore_archive` tool
- `search_archives` tool
- Tool documentation

**Week 10: Performance Optimization**

- Worker thread implementation
- Adaptive throttling
- Checkpoint optimization
- Performance benchmarks
- Integration tests

**Phase 2 Milestones**:

- ✅ All ZSTD profiles functional
- ✅ 7z format support 95%
- ✅ P0 security controls implemented
- ✅ All MCP tools functional
- ✅ <30s for 100 files (average)
- ✅ <256MB memory for 1GB archive

---

### Phase 3: Security Polish (Weeks 11-12)

**Polish**: Security hardening, documentation, stability

**Week 11: Security & Stability**

- P1 security controls (thread isolation)
- Security audit and penetration testing
- Edge case handling
- Error message hardening
- Secure delete implementation (DoD 5220.22-M)
- Final security documentation

**Week 12: Documentation & Release**

- ARCHIVE_FEATURE.md
- ARCHIVE_API.md
- ARCHIVE_CONFIG.md
- ARCHIVE_SECURITY.md
- ARCHIVE_TROUBLESHOOTING.md
- Feature flag integration (opt-in OFF)
- Release candidate testing
- Stakeholder sign-off

**Phase 3 Milestones**:

- ✅ All security controls implemented
- ✅ 5 documentation files complete
- ✅ Feature flag functional
- ✅ Release candidate ready
- ✅ Overall test coverage ≥70% (target 78%)

---

### Phase 4: Intelligent Optimization (Post-Release)

**Auto-detection** and optimization based on file types and system capabilities.

---

## 4. Test Coverage Requirements

| Test Type         | Minimum | Target  |
| ----------------- | ------- | ------- |
| Unit Tests        | 80%     | 85%     |
| Integration Tests | 65%     | 70%     |
| E2E Tests         | 45%     | 50%     |
| **Overall**       | **70%** | **78%** |

**Key Test Scenarios**:

- Round-trip integrity (compress → extract → verify)
- Scheduled archive execution
- Security control bypass attempts
- Performance benchmarks
- Cross-platform compatibility (Windows priority)

---

## 5. Risk Register

### 5.1 Mitigated Risks

| Risk                                   | Mitigation                                    | Status       |
| -------------------------------------- | --------------------------------------------- | ------------ |
| Extraction security deferred           | Consolidated in Phase 3, no Phase 4 deferrals | ✅ Mitigated |
| 7z native binding compilation failures | Windows testing priority, fallback options    | ✅ Mitigated |
| Timeline overrun                       | Expanded to 12 weeks, phased delivery         | ✅ Mitigated |
| Performance degradation                | Chunk-based pipeline, parallelism (Phase 3)   | ✅ Mitigated |

### 5.2 Remaining Risks

| Risk                                | Probability | Impact | Mitigation                                                |
| ----------------------------------- | ----------- | ------ | --------------------------------------------------------- |
| Worker thread instability (Node.js) | Medium      | High   | Extensive testing in Phase 2/3, fallback to single-thread |
| Windows path handling edge cases    | Medium      | Medium | Windows-first testing, path normalization                 |
| Large file handling (>2GB)          | Low         | Medium | Chunk-based design already addresses                      |
| ZSTD native binding issues          | Low         | Medium | Fallback to tar.gz if unavailable                         |

---

## 6. Success Criteria

### 6.1 Functional Criteria

- ✅ 100% ZIP and TAR format support
- ✅ 95% 7z format support
- ✅ All MCP tools functional and documented
- ✅ SQLite-based indexing with FTS5 search
- ✅ AES-256-GCM encryption with per-chunk key rotation

### 6.2 Performance Criteria

- ✅ <30s average time for 100 files
- ✅ <256MB memory usage for 1GB archive
- ✅ 20-40% better compression than encrypt-then-compress
- ✅ Adaptive compression profile selection

### 6.3 Security Criteria

- ✅ P0 security controls 100% implemented
- ✅ P1 security controls 100% implemented
- ✅ Sensitive file blocking functional
- ✅ Secure delete option (DoD 5220.22-M)
- ✅ SHA-256 file integrity verification

### 6.4 Quality Criteria

- ✅ Overall test coverage ≥70% (target 78%)
- ✅ 5 documentation files complete
- ✅ Feature flag implementation (opt-in OFF)
- ✅ Zero critical bugs in release candidate

---

## 7. Dependencies & Prerequisites

### 7.1 Required Packages

```json
{
  "dependencies": {
    "zstd-js": "^1.0.0",
    "7zip-min": "^2.5.0",
    "better-sqlite3": "^9.0.0",
    "crypto": "node:crypto",
    "node:worker_threads": "node:worker_threads"
  },
  "devDependencies": {
    "jest": "^29.0.0",
    "@types/better-sqlite3": "^7.6.0"
  }
}
```

### 7.2 System Requirements

- Node.js ≥18.0.0
- Python ≥3.8 (for native bindings)
- Windows ≥10 (primary target), macOS ≥12, Linux (glibc ≥2.17)

### 7.3 Team Requirements

- 2-3 developers
- Node.js expertise required
- Experience with native bindings preferred
- Security background beneficial

### 7.4 Documentation Templates

1. `docs/ARCHIVE_FEATURE.md` - Feature overview
2. `docs/ARCHIVE_API.md` - API documentation
3. `docs/ARCHIVE_CONFIG.md` - Configuration guide
4. `docs/ARCHIVE_SECURITY.md` - Security best practices
5. `docs/ARCHIVE_TROUBLESHOOTING.md` - Common issues and solutions

---

## 8. Feature Flag Configuration

```json
{
  "features": {
    "archiveEnabled": {
      "enabled": false,
      "description": "Enable auto-archive and compression feature",
      "optIn": true
    }
  }
}
```

**Rationale**: Opt-in OFF by default ensures users explicitly enable the feature after understanding its implications.

---

## 9. Approval Sign-Off

| Role                 | Name      | Date | Status |
| -------------------- | --------- | ---- | ------ |
| Architect            | [Pending] |      | ⏳     |
| Performance Lead     | [Pending] |      | ⏳     |
| Security Lead        | [Pending] |      | ⏳     |
| Maintainability Lead | [Pending] |      | ⏳     |
| Delivery Lead        | [Pending] |      | ⏳     |
| Product Owner        | [Pending] |      | ⏳     |

---

## 10. Appendices

### Appendix A: Acronym Definitions

- **AES**: Advanced Encryption Standard
- **GCM**: Galois/Counter Mode
- **CRC**: Cyclic Redundancy Check
- **FTS5**: Full-Text Search version 5
- **HKDF**: HMAC-based Extract-and-Expand Key Derivation Function
- **PBKDF2**: Password-Based Key Derivation Function 2
- **SHA**: Secure Hash Algorithm
- **WAL**: Write-Ahead Logging
- **ZSTD**: Zstandard compression

### Appendix B: References

- NIST Special Publication 800-63-3 (Digital Identity Guidelines)
- RFC 5116 (AEAD Interfaces)
- RFC 7914 (scrypt for Password Hashing)
- DoD 5220.22-M (Sanitization Standard)
- ZSTD Compression RFC (draft-kubler-zstd)

---

**Document End**

_This consensus document combines all resolved decisions from the Multi-Shepherd Debate on Auto-Archive & Compression. All decisions are final and approved for implementation._
