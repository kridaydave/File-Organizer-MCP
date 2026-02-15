# File Organizer MCP v3.4.0 - Master Implementation Plan

**Version:** 3.4.0  
**Status:** Draft  
**Last Updated:** 2026-02-15  
**Author:** Jonnah (Scribe)

---

## Executive Summary

This master document serves as the central entry point for the File Organizer MCP v3.4.0 implementation, consolidating all 5 phases into a cohesive execution roadmap. The implementation addresses **56 total issues** across CRITICAL, HIGH, MEDIUM, and LOW severity levels, transforming the File Organizer MCP into a production-ready system with robust history logging, intelligent organization capabilities, and seamless integration.

### Issue Summary by Severity

| Severity     | Count  | Description                                                          |
| ------------ | ------ | -------------------------------------------------------------------- |
| **CRITICAL** | 13     | Security vulnerabilities, architectural flaws, data corruption risks |
| **HIGH**     | 28     | Performance issues, edge cases, missing validations                  |
| **MEDIUM**   | 10     | Code quality, maintainability improvements                           |
| **LOW**      | 5      | Documentation, consistency, minor refinements                        |
| **TOTAL**    | **56** | Complete resolution across all phases                                |

### Phase Overview

| Phase   | Name                | Issues | Priority      | Focus Area                                                 |
| ------- | ------------------- | ------ | ------------- | ---------------------------------------------------------- |
| Phase 0 | Security Foundation | 8      | CRITICAL      | Security hardening, path validation, access control        |
| Phase 1 | History Logging     | 7      | CRITICAL      | Audit trail, operation tracking, privacy filtering         |
| Phase 2 | System Organization | 8      | CRITICAL/HIGH | System directory organization, rollback, atomic operations |
| Phase 3 | Smart Suggest       | 7      | CRITICAL/HIGH | Health analysis, suggestions, pattern detection            |
| Phase 4 | Integration         | 26     | CRITICAL/HIGH | Tool registration, imports, service patterns, testing      |

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Implementation Timeline](#implementation-timeline)
3. [Issues Resolved Summary](#issues-resolved-summary)
4. [Phase Documents](#phase-documents)
   - [Phase 0: Security Foundation](#phase-0-security-foundation)
   - [Phase 1: History Logging](#phase-1-history-logging)
   - [Phase 2: System Organization](#phase-2-system-organization)
   - [Phase 3: Smart Suggest](#phase-3-smart-suggest)
   - [Phase 4: Integration](#phase-4-integration)
5. [Verification Checklist](#verification-checklist)
6. [Developer Guidelines](#developer-guidelines)
7. [Appendix](#appendix)

---

## Quick Reference

### File Locations

```
docs/implementation/
├── IMPLEMENTATION_PLAN_V3.4.0_MASTER.md  (This document)
├── PHASE_0_SECURITY_FOUNDATION.md
├── PHASE_1_HISTORY_LOGGING.md
├── PHASE_2_SYSTEM_ORGANIZE.md
├── PHASE_3_SMART_SUGGEST.md
└── PHASE_4_INTEGRATION.md
```

### Key Services and Tools

| Component               | Type    | Phase   | Description                                            |
| ----------------------- | ------- | ------- | ------------------------------------------------------ |
| `HistoryLoggerService`  | Service | Phase 1 | Secure operation logging with privacy filtering        |
| `view_history`          | Tool    | Phase 1 | Query and view operation history                       |
| `SystemOrganizeService` | Service | Phase 2 | Cross-platform system directory organization           |
| `system_organization`   | Tool    | Phase 2 | Organize system directories (Desktop, Downloads, etc.) |
| `SmartSuggestService`   | Service | Phase 3 | Directory health analysis and suggestions              |
| `smart_suggest`         | Tool    | Phase 3 | Analyze directory health with actionable suggestions   |

### New Type Definitions

| Type                    | File     | Purpose                         |
| ----------------------- | -------- | ------------------------------- |
| `HistoryEntry`          | types.ts | Single operation log entry      |
| `HistoryQuery`          | types.ts | History filtering parameters    |
| `SystemDirectory`       | types.ts | Supported system directories    |
| `SystemOrganizeConfig`  | types.ts | System organization options     |
| `DirectoryHealthReport` | types.ts | Complete health analysis result |
| `HealthMetrics`         | types.ts | Five metric health scores       |

### Configuration Constants

| Constant                 | Location  | Purpose                                |
| ------------------------ | --------- | -------------------------------------- |
| `HISTORY_LOGGING_CONFIG` | config.ts | History rotation, retry, lock settings |
| `SMART_SUGGEST_CONFIG`   | config.ts | Analysis weights, thresholds, limits   |
| `GRADE_BOUNDARIES`       | config.ts | Score to letter grade conversion       |

---

## Implementation Timeline

### Phase Execution Order (Sequential)

```
Week 1-2:  Phase 0 - Security Foundation
           ↓
Week 3-4:  Phase 1 - History Logging
           ↓
Week 5-6:  Phase 2 - System Organization
           ↓
Week 7-8:  Phase 3 - Smart Suggest
           ↓
Week 9-10: Phase 4 - Integration
           ↓
Week 11:   Final Testing & Verification
```

### Detailed Timeline

#### Phase 0: Security Foundation (Week 1-2)

**Priority:** CRITICAL  
**Issues:** 8 total (5 CRITICAL, 3 HIGH)

| Day  | Task                          | Deliverable                   |
| ---- | ----------------------------- | ----------------------------- |
| 1-2  | Path validation hardening     | Enhanced PathValidatorService |
| 3-4  | Access control implementation | Security mode enforcement     |
| 5-6  | Symlink resolution security   | Safe path resolution          |
| 7-8  | Input sanitization            | Sanitized error messages      |
| 9-10 | Security testing              | Passing security tests        |

**Dependencies:** None (foundation phase)

---

#### Phase 1: History Logging (Week 3-4)

**Priority:** CRITICAL  
**Issues:** 7 total (3 CRITICAL, 4 HIGH)

| Day   | Task                   | Deliverable                                      |
| ----- | ---------------------- | ------------------------------------------------ |
| 11-12 | Config updates         | `getHistoryFilePath()`, `HISTORY_LOGGING_CONFIG` |
| 13-14 | Type definitions       | HistoryEntry, HistoryQuery types                 |
| 15-17 | Service implementation | HistoryLoggerService with all features           |
| 18    | Tool implementation    | `view_history` tool                              |
| 19    | Server integration     | Logging in handleToolCall() finally block        |
| 20    | Testing                | Unit and integration tests                       |

**Dependencies:** Phase 0 (Security Foundation)

---

#### Phase 2: System Organization (Week 5-6)

**Priority:** CRITICAL/HIGH  
**Issues:** 8 total (2 CRITICAL, 6 HIGH)

| Day   | Task                       | Deliverable                            |
| ----- | -------------------------- | -------------------------------------- |
| 21-22 | Type definitions           | SystemDirectory, SystemDirs interfaces |
| 23-25 | Service implementation     | SystemOrganizeService                  |
| 26    | Rollback service extension | Configurable allowed roots             |
| 27    | Tool implementation        | `system_organization` tool             |
| 28    | Atomic operations          | Lock file + verification               |
| 29-30 | Testing                    | Cross-platform directory tests         |

**Dependencies:** Phase 0 (Security), Phase 1 (History - optional)

---

#### Phase 3: Smart Suggest (Week 7-8)

**Priority:** CRITICAL/HIGH  
**Issues:** 7 total (3 CRITICAL, 4 HIGH)

| Day   | Task                      | Deliverable                          |
| ----- | ------------------------- | ------------------------------------ |
| 31-32 | Type definitions          | HealthMetrics, DirectoryHealthReport |
| 33-34 | Cache & checkpoint system | Async mutex, versioned cache         |
| 35-37 | Analysis algorithms       | All five health metrics              |
| 38    | Suggestion generation     | Actionable suggestions + quick wins  |
| 39    | Tool implementation       | `smart_suggest` tool                 |
| 40    | Testing                   | Metric accuracy, edge case tests     |

**Dependencies:** Phase 0 (Security), Phase 1 (History - for logging)

---

#### Phase 4: Integration (Week 9-10)

**Priority:** CRITICAL/HIGH  
**Issues:** 26 total (2 CRITICAL, 11 HIGH, 10 MEDIUM, 3 LOW)

| Day   | Task                           | Deliverable                   |
| ----- | ------------------------------ | ----------------------------- |
| 41-42 | Server.ts reorganization       | Correct switch case ordering  |
| 43-44 | Tools/index.ts standardization | Unified export pattern        |
| 45-46 | Service singleton pattern      | getInstance() standardization |
| 47-48 | Import cleanup                 | Consistent import patterns    |
| 49-50 | Comprehensive testing          | All integration tests passing |

**Dependencies:** Phase 1, Phase 2, Phase 3 (all prior phases)

---

#### Final Verification (Week 11)

| Day | Task                   | Verification            |
| --- | ---------------------- | ----------------------- |
| 51  | Security audit         | All security tests pass |
| 52  | Performance testing    | Benchmarks meet targets |
| 53  | Cross-platform testing | Windows, macOS, Linux   |
| 54  | Documentation review   | All docs complete       |
| 55  | Final integration test | End-to-end workflow     |
| 56  | Release preparation    | Version bump, changelog |

---

## Issues Resolved Summary

### Phase 0: Security Foundation (8 Issues)

| ID     | Severity | Issue                               | Resolution                               |
| ------ | -------- | ----------------------------------- | ---------------------------------------- |
| SEC-C1 | CRITICAL | Path traversal via symlink          | Real path resolution with loop detection |
| SEC-C2 | CRITICAL | Directory escape via relative paths | Multi-layer path validation              |
| SEC-C3 | CRITICAL | Race condition in path validation   | Atomic existence checks                  |
| SEC-C4 | CRITICAL | Insufficient path normalization     | Unicode normalization, case handling     |
| SEC-C5 | CRITICAL | No whitelist/blacklist validation   | Configurable allow/deny patterns         |
| SEC-H1 | HIGH     | Inconsistent error messages         | Standardized sanitizeErrorMessage()      |
| SEC-H2 | HIGH     | Verbose logging exposes paths       | Redacted logging for sensitive data      |
| SEC-H3 | HIGH     | No security mode enforcement        | STRICT/SANDBOXED/UNRESTRICTED modes      |

### Phase 1: History Logging (7 Issues)

| ID   | Severity | Issue                                          | Resolution                           |
| ---- | -------- | ---------------------------------------------- | ------------------------------------ |
| H-C1 | CRITICAL | getUserConfigPath() returns FILE not DIRECTORY | New `getHistoryFilePath()` function  |
| H-C2 | CRITICAL | Markdown format not parseable                  | JSON-lines format with entry IDs     |
| H-C3 | CRITICAL | Privacy filtering at write-time                | Read-time privacy filtering          |
| H-H1 | HIGH     | No file rotation                               | Rotation with file locking           |
| H-H2 | HIGH     | Missing directory creation guard               | Ensure directory exists before write |
| H-H3 | HIGH     | No disk full handling                          | Retry with exponential backoff       |
| H-H4 | HIGH     | No corrupted file recovery                     | Backup and recovery mechanism        |

### Phase 2: System Organization (8 Issues)

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

### Phase 3: Smart Suggest (7 Issues)

| ID    | Severity | Issue                                         | Resolution                                        |
| ----- | -------- | --------------------------------------------- | ------------------------------------------------- |
| SS-C1 | CRITICAL | HashCalculatorService failures crash analysis | Graceful degradation with fallback scoring        |
| SS-C2 | CRITICAL | No checkpoint/resume for long operations      | Progress checkpoint system with resume capability |
| SS-C3 | CRITICAL | Cache versioning without mutex                | Async mutex with versioned cache keys             |
| SS-H1 | HIGH     | Log(0) in Shannon entropy calculation         | Epsilon fallback for zero probabilities           |
| SS-H2 | HIGH     | Mixed naming patterns not detected            | Multi-pattern detection with confidence scoring   |
| SS-H3 | HIGH     | No project detection confidence threshold     | Confidence scoring with marker-based detection    |
| SS-H4 | HIGH     | Division by zero for empty directories        | Guard clauses with early returns                  |

### Phase 4: Integration (26 Issues)

| ID         | Severity | Issue                             | Resolution                                         |
| ---------- | -------- | --------------------------------- | -------------------------------------------------- |
| I-C1       | CRITICAL | Server.ts tool registration       | Correct switch case placement with proper ordering |
| I-C2       | CRITICAL | Tool import pattern inconsistency | Standardize on unified export pattern              |
| I-H1       | HIGH     | Config.ts naming conflicts        | Namespace isolation with descriptive prefixes      |
| I-H2       | HIGH     | Service instantiation pattern     | Standardized singleton pattern with getInstance()  |
| I-H3       | HIGH     | History Logging dependency order  | Lazy initialization with dependency injection      |
| I-H4-I-H13 | HIGH     | Various integration issues        | Standardized patterns, exports, registration       |
| I-M1-I-M10 | MEDIUM   | Tool definition, exports, errors  | Consistent grouping, type exports, error codes     |
| I-L1-I-L3  | LOW      | Imports, JSDoc, formatting        | Consistent relative imports, version headers       |

---

## Phase Documents

### Phase 0: Security Foundation

**File:** `docs/implementation/PHASE_0_SECURITY_FOUNDATION.md`

**Scope:** Security hardening and path validation improvements

**Key Deliverables:**

- Enhanced PathValidatorService with 8-layer validation
- Security mode enforcement (STRICT/SANDBOXED/UNRESTRICTED)
- Unicode normalization and case-insensitive checks
- Configurable whitelist/blacklist patterns
- Sanitized error messages to prevent path disclosure

**Issues Addressed:** 8 (5 CRITICAL, 3 HIGH)

---

### Phase 1: History Logging

**File:** `docs/implementation/PHASE_1_HISTORY_LOGGING.md`

**Scope:** Comprehensive operation logging with privacy controls

**Key Deliverables:**

- HistoryLoggerService with JSON-lines format
- File rotation with locking (10MB/10,000 entries)
- Read-time privacy filtering (full/redacted/none modes)
- Disk full handling with exponential backoff retry
- Corrupted file recovery from backups
- `view_history` tool with filtering and pagination

**Issues Addressed:** 7 (3 CRITICAL, 4 HIGH)

**New Files:**

- `src/services/history-logger.service.ts`
- `src/tools/view-history.ts`

**Modified Files:**

- `src/config.ts` - Add history path functions and HISTORY_LOGGING_CONFIG
- `src/types.ts` - Add history types
- `src/server.ts` - Add logging to handleToolCall() finally block
- `src/tools/index.ts` - Export view_history tool

---

### Phase 2: System Organization

**File:** `docs/implementation/PHASE_2_SYSTEM_ORGANIZE.md`

**Scope:** Safe file organization across system directories

**Key Deliverables:**

- SystemOrganizeService with cross-platform directory detection
- Support for Desktop, Documents, Downloads, Pictures, Music, Videos/Movies
- Linux XDG Base Directory specification support
- Pre-flight disk space verification
- Atomic file moves with lock file pattern
- Locked file handling with exponential backoff retry
- Rollback service extension for system directories

**Issues Addressed:** 8 (2 CRITICAL, 6 HIGH)

**New Files:**

- `src/services/system-organize.service.ts`
- `src/tools/system-organization.ts`

**Modified Files:**

- `src/services/rollback.service.ts` - Extend allowed roots
- `src/types.ts` - Add system organization types
- `src/config.ts` - Add system directory constants
- `src/server.ts` - Register system_organization tool
- `src/tools/index.ts` - Export system organization tool

---

### Phase 3: Smart Suggest

**File:** `docs/implementation/PHASE_3_SMART_SUGGEST.md`

**Scope:** Intelligent directory health analysis and suggestions

**Key Deliverables:**

- SmartSuggestService with five health metrics:
  - File Type Entropy (Shannon entropy with log(0) protection)
  - Naming Consistency (multi-pattern detection)
  - Depth Balance (optimal 2-4 levels)
  - Duplicate Ratio (with graceful degradation)
  - Misplaced Files (project detection with confidence)
- Directory health grading (A-F scale)
- Actionable suggestions with priority levels
- Quick win actions with one-click execution
- Checkpoint/resume for long operations
- Versioned cache with async mutex protection

**Issues Addressed:** 7 (3 CRITICAL, 4 HIGH)

**New Files:**

- `src/services/smart-suggest.service.ts`
- `src/tools/smart-suggest.ts`

**Modified Files:**

- `src/types.ts` - Add Smart Suggest types
- `src/config.ts` - Add SMART_SUGGEST_CONFIG
- `src/server.ts` - Register smart_suggest tool
- `src/tools/index.ts` - Export smart_suggest tool

---

### Phase 4: Integration

**File:** `docs/implementation/PHASE_4_INTEGRATION.md`

**Scope:** Seamless integration of all features into existing codebase

**Key Deliverables:**

- Corrected server.ts switch case ordering (alphabetical by functional group)
- Unified tool export pattern (definition + handler + schema + types)
- Standardized singleton pattern with getInstance()
- Lazy initialization for HistoryLoggerService
- Namespace isolation for configuration constants
- Comprehensive test coverage (unit, integration, security)
- Tool registration checklist for all 20+ tools

**Issues Addressed:** 26 (2 CRITICAL, 11 HIGH, 10 MEDIUM, 3 LOW)

**Modified Files:**

- `src/server.ts` - Reorganize switch statement, add lazy initialization
- `src/tools/index.ts` - Unified export pattern, reorganize TOOLS array
- `src/config.ts` - Namespace isolation (HISTORY_LOGGING_CONFIG)
- `src/types.ts` - Complete type exports, HISTORY\_ error codes
- All service files - Standardize to singleton pattern

**New Test Files:**

- `tests/unit/services/history-logger.service.test.ts`
- `tests/unit/services/system-organize.service.test.ts`
- `tests/unit/services/smart-suggest.service.test.ts`
- `tests/integration/history-logging.test.ts`
- `tests/integration/system-organization.test.ts`
- `tests/integration/smart-suggest.test.ts`
- `tests/security/history-security.test.ts`
- `tests/integration/server-integration.test.ts`

---

## Verification Checklist

### Pre-Implementation Checks

- [ ] All phase documents reviewed and approved
- [ ] Development environment set up
- [ ] Test infrastructure ready
- [ ] Backup of existing codebase created

### Phase 0 Verification

- [ ] PathValidatorService passes all security tests
- [ ] Symlink attacks prevented
- [ ] Path traversal attacks prevented
- [ ] Unicode normalization working
- [ ] Security modes enforced correctly

### Phase 1 Verification

- [ ] History entries written in JSON-lines format
- [ ] File rotation triggers at 10MB/10,000 entries
- [ ] Privacy modes filter correctly (full/redacted/none)
- [ ] Disk full errors trigger retry with backoff
- [ ] Corrupted files recoverable from backup
- [ ] view_history tool returns paginated results

### Phase 2 Verification

- [ ] System directories detected correctly per platform
- [ ] macOS Movies folder aliased to Videos
- [ ] Linux XDG directories supported
- [ ] Disk space check prevents operations
- [ ] Atomic moves verified with lock files
- [ ] Locked files handled with retry
- [ ] Rollback works across system directories

### Phase 3 Verification

- [ ] Shannon entropy calculates correctly (no log(0))
- [ ] Multi-pattern naming detection working
- [ ] Project detection uses confidence threshold
- [ ] Empty directories handled gracefully
- [ ] Checkpoints save/resume correctly
- [ ] Cache version invalidation working
- [ ] Health grades correlate with scores

### Phase 4 Verification

- [ ] All tools registered in correct order
- [ ] Unified export pattern applied to all tools
- [ ] Singleton pattern used for all services
- [ ] Lazy initialization prevents circular deps
- [ ] All imports use consistent pattern
- [ ] All tests pass (unit, integration, security)
- [ ] No console errors or warnings

### Final Release Checks

- [ ] Version bumped to 3.4.0 in all files
- [ ] CHANGELOG.md updated
- [ ] README.md updated with new features
- [ ] API documentation updated
- [ ] Security audit passed
- [ ] Performance benchmarks met
- [ ] Cross-platform testing completed

---

## Developer Guidelines

### Code Standards

1. **Singleton Pattern:** All services must use `getInstance()` method
2. **Import Pattern:** Use relative imports with `.js` extension (NodeNext)
3. **Error Handling:** Use custom error classes with error codes
4. **Logging:** Use structured logging with `logger.info/error/warn`
5. **Types:** Define all types in `types.ts`, export from `tools/index.ts`

### File Organization

```
src/
├── services/
│   ├── history-logger.service.ts      # Phase 1
│   ├── system-organize.service.ts     # Phase 2
│   ├── smart-suggest.service.ts       # Phase 3
│   └── rollback.service.ts            # Modified Phase 2
├── tools/
│   ├── view-history.ts                # Phase 1
│   ├── system-organization.ts         # Phase 2
│   └── smart-suggest.ts               # Phase 3
├── types.ts                           # All phases add types
├── config.ts                          # All phases add config
└── server.ts                          # Phase 4 integration
```

### Testing Requirements

Every new feature requires:

1. **Unit Tests:** Individual service methods
2. **Integration Tests:** Tool + service interaction
3. **Security Tests:** Input validation, access control
4. **Performance Tests:** Large directory handling

### Documentation Standards

1. **JSDoc Headers:** Include version and module description
2. **Phase References:** Reference issue IDs in comments (e.g., `// Addresses H-C1`)
3. **Architecture Diagrams:** Use ASCII art for component relationships
4. **Example Code:** Provide usage examples for all public APIs

---

## Appendix

### A. Glossary

| Term                  | Definition                                                      |
| --------------------- | --------------------------------------------------------------- |
| **JSON-lines**        | Format with one JSON object per line for append-only files      |
| **Shannon Entropy**   | Measure of randomness; used for file type distribution analysis |
| **XDG**               | Cross-Desktop Group specification for Linux directories         |
| **Singleton Pattern** | Design pattern ensuring only one instance of a class exists     |
| **Atomic Operation**  | Operation that either completes fully or not at all             |

### B. Reference Links

- [MCP Specification](https://modelcontextprotocol.io/specification/)
- [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html)
- [Shannon Entropy](<https://en.wikipedia.org/wiki/Entropy_(information_theory)>)

### C. Change Log

| Date       | Version | Changes                            |
| ---------- | ------- | ---------------------------------- |
| 2026-02-15 | 3.4.0   | Initial master implementation plan |

---

**End of Document**

_This implementation plan is a living document. Updates should be tracked in the Change Log section above._
