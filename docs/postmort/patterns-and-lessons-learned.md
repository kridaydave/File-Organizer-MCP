# Patterns & Lessons Learned

This document captures reusable patterns and anti-patterns from Multi-Shepherd Debates to improve future debates and implementation decisions.

---

## Architectural Patterns

### 1. Progressive Complexity Rollout

**Pattern:**

```
Phase 1: Foundation (proven, simple formats)
Phase 2: Advanced (complex algorithms, encryption)
Phase 3: Optimization (adaptive profiles, parallelism)
Phase 4: Hardening (security, edge cases)
```

**Use Case:** When introducing multiple complex technologies with interdependencies

**Benefits:**

- Reduces risk by building on proven foundations
- Allows early testing of core functionality
- Provides natural rollback points
- Manages team learning curve

**Example Application:** Auto-Archive feature

- Phase 1: tar.gz/zip (native Node.js support)
- Phase 2: tar.zst (ZSTD compression)
- Phase 3: .7z (AES-256 encryption)

**Success Criteria:**

- Each phase must deliver functional, tested code
- Phase N must be able to ship independently
- Dependencies between phases must be explicit

---

### 2. Compress-Then-Encrypt Pipeline

**Pattern:**

```
Raw Data → Streaming Compression → Compressed Blocks → Per-Chunk Encryption → Encrypted Chunks
```

**Use Case:** When combining compression and encryption with streaming data

**Benefits:**

- 20-40% better compression ratios
- Streaming-compatible architecture
- Per-chunk key rotation limits compromise blast radius

**Implementation Details:**

- Chunk size: 256MB (configurable)
- Key derivation: HKDF-SHA256 per chunk
- Encryption: AES-256-GCM with 12-byte nonce

**Anti-Pattern to Avoid:** encrypt-then-compress

- Encrypting first produces pseudorandom output
- Compression ratio degrades significantly (60-80% worse)

---

### 3. Per-Chunk Key Rotation

**Pattern:**

```
Master Key + Chunk ID + HKDF-SHA256 → Chunk Key
Chunk Key + AES-256-GCM + Nonce → Encrypted Chunk
```

**Use Case:** Large encrypted archives where single key compromise is catastrophic

**Benefits:**

- Limits compromise blast radius to single chunk
- Enables parallel decryption (no sequential dependency)
- Supports chunked recovery (failed chunks can be re-downloaded)

**Implementation Details:**

- Nonce: 12-byte random per chunk (GCM requirement)
- Chunk size: 256MB (balance of performance vs granularity)
- Key derivation: Fast, constant-time HKDF

**Trade-offs:**

- Slightly higher computational cost (key derivation per chunk)
- More complex key management (must track chunk-key mapping)

---

### 4. Hybrid Metadata Storage

**Pattern:**

```
Primary: SQLite (WAL mode) for ACID, FTS5, relationships
Export: JSON for portability, version control, debugging
```

**Use Case:** Metadata requiring both query performance and portability

**Benefits:**

- SQLite: Fast queries, full-text search, ACID guarantees
- JSON: Human-readable, version-diffable, backup-friendly

**Implementation Details:**

- Primary storage: SQLite with WAL mode for concurrent reads/writes
- Export trigger: Automatic JSON export on schema changes
- Import capability: Restore from JSON on initialization

**Success Criteria:**

- Export must be lossless (all SQLite data represented)
- Import must be idempotent (can run multiple times)
- Export should include schema version for validation

---

## Security Patterns

### 5. Tiered Security Controls

**Pattern:**

```
P0 (Immediate): Magic bytes, path containment, MAX_RATIO limits
P1 (Phase 2): Thread isolation, archive extraction validation
P2 (Phase 3): Secure delete, audit logging
```

**Use Case:** Complex security requirements with phased implementation

**Benefits:**

- Pragmatic approach to security scope
- Enables incremental risk reduction
- Allows timeline-driven delivery

**Implementation Details:**

- P0: Must be implemented before first production use
- P1: Implemented when relevant features added
- P2: Polish/hardening phase

**Trade-offs:**

- Deferred controls may be discovered in security audit
- Requires clear tracking of security debt
- Must have feature flags to block usage until P0 complete

---

### 6. Multi-Layer Integrity Verification

**Pattern:**

```
CRC32 (archive) + SHA-256 (files) + HMAC-SHA256 (signature)
```

**Use Case:** High-stakes data integrity requirements (financial, medical)

**Benefits:**

- Detects archive corruption (CRC32)
- Detects file tampering (SHA-256)
- Detects archive replacement (HMAC)

**Implementation Details:**

- CRC32: Embedded in archive format (fast, low-overhead)
- SHA-256: Stored in metadata index (cryptographically strong)
- HMAC: Stored in companion file with separate key

**Performance Impact:**

- CRC32: Negligible (embedded in archive)
- SHA-256: Moderate (hashing during read/write)
- HMAC: Low (single verification operation)

---

### 7. Sensitive File Blocking Patterns

**Pattern:**

```
Extensions: .env, .pem, .key, .p12, .pfx
Paths: .ssh/, .aws/, credentials/, secrets/
Content: "BEGIN PRIVATE KEY", "password", "api_key"
```

**Use Case:** Preventing inadvertent archiving of secrets

**Implementation Details:**

- Pre-scan: Check file paths before adding to archive
- Content scan: For files with suspicious extensions, scan content
- User override: Allow users to explicitly include (with warning)
- Logging: Log all blocked attempts for audit

**Success Criteria:**

- Zero false positives (don't block legitimate files)
- High sensitivity (catch all common secret patterns)
- Performance impact <5% of archive time

---

## Performance Patterns

### 8. Adaptive Compression Profiles

**Pattern:**

```
FAST (Level 1): Real-time, interactive
BALANCED (Level 3): Scheduled archiving
HIGH (Level 9): Batch archiving
ULTRA (Level 19): Storage optimization
```

**Use Case:** When compression must balance speed vs ratio across use cases

**Benefits:**

- Matches user expectations (fast when they want fast, small when they want small)
- Automatic selection based on context
- Clear trade-off documentation

**Implementation Details:**

- Auto-selection: Based on archive size and time sensitivity
- User override: Allow explicit profile selection
- Performance target: <30s for 100 files on BALANCED

**Trade-offs:**

- ULTRA profile may be too slow for interactive use
- Need to profile to find optimal level for each algorithm

---

### 9. Resource-Aware Throttling

**Pattern:**

```
CPU > 80%: Reduce workers
Memory > 80%: Pause new tasks
I/O Latency > 100ms: Reduce queue
```

**Use Case:** Background services that must respect system resources

**Implementation Details:**

- Monitoring: Check system stats every 5 seconds
- Throttling: Reduce concurrency, not stop work
- Recovery: Auto-scale back up when resources free

**Success Criteria:**

- Never consume >90% of any resource
- Resume quickly after throttling ends
- No data loss during throttling

---

## Testing Patterns

### 10. Coverage Tiers by Test Type

**Pattern:**

```
Unit Tests: 80% (individual functions, services)
Integration Tests: 65% (service interactions, data flow)
E2E Tests: 45% (user workflows, MCP tools)
```

**Use Case:** Setting realistic test coverage targets

**Benefits:**

- Reflects different test difficulty levels
- Avoids over-investing in hard-to-test areas
- Provides clear targets per category

**Rationale:**

- Unit: Easy (isolated functions), higher target
- Integration: Medium (services interacting), moderate target
- E2E: Hard (full system), lower target

---

### 11. Round-Trip Integrity Tests

**Pattern:**

```
For Each Archive Type:
Original Files → Archive → Restore → Verify Hash Match
```

**Use Case:** Compression/archive features requiring bit-perfect recovery

**Implementation Details:**

- Hash before: SHA-256 of each original file
- Create archive: Using specific compression profile
- Extract archive: Restore to new location
- Hash after: SHA-256 of extracted files
- Compare: Byte-for-byte match

**Success Criteria:**

- 100% hash match for all file types
- Handles edge cases: empty files, large files (>1GB), binary files
- Test all compression profiles: FAST, BALANCED, HIGH, ULTRA

---

## Error Handling Patterns

### 12. Error Hierarchy by Domain

**Pattern:**

```
ArchiveError (base)
  ├── CompressionError
  ├── EncryptionError
  ├── ValidationError
  └── StorageError
```

**Use Case:** Complex features with multiple failure modes

**Benefits:**

- Type-safe error handling
- Clear error propagation
- Easy to add new error types
- Centralized error handling possible

**Implementation Details:**

- Base error: Common fields (code, message, context)
- Sub-errors: Domain-specific fields
- Handler: Centralized function to log/handle all error types

---

## Anti-Patterns to Avoid

### 1. Siloed Proposal Development

**Anti-Pattern:**

```
❌ Each shepherd develops proposal independently
✅ Start with joint dependency mapping, then propose
```

**Consequences:**

- Conflicts not discovered until cross-validation phase
- Redundant work across shepherds
- Missing integration considerations

**Avoid When:** Multiple technical domains with clear dependencies

**Alternative:** Pre-debate dependency mapping session (30 minutes)

---

### 2. Optimistic Timeline Compression

**Anti-Pattern:**

```
❌ 8 weeks for complex native integrations
✅ 12 weeks with risk buffers per complex integration
```

**Consequences:**

- Timeline overruns (50%+ in this case)
- Team burnout from unrealistic deadlines
- Quality compromises to hit dates

**Avoid When:** Native bindings, cross-platform, new algorithms

**Rule of Thumb:**

- Simple library integration: 1 week
- Native bindings: +50% effort
- Cross-platform: +25% effort
- New algorithms: +50% effort

---

### 3. All-or-Nothing Security

**Anti-Pattern:**

```
❌ Implement all security controls immediately (causes scope creep)
✅ Tier security controls (P0 now, P1 later)
```

**Consequences:**

- Feature never ships due to security debt
- Over-engineering for threat models not yet relevant
- Extended timeline reduces business value

**Avoid When:** Security requirements exceed current phase scope

**Alternative:**

- P0: Must ship before production
- P1: Ship when relevant features added
- P2: Polish phase

---

### 4. Encrypt-Then-Compress on Streaming Data

**Anti-Pattern:**

```
❌ Encrypt first → pseudorandom output → poor compression
✅ Compress first → patterns preserved → good compression
```

**Consequences:**

- 60-80% worse compression ratios
- Larger archive sizes
- Increased storage costs

**Avoid When:** Streaming large data sets requiring both encryption and compression

**Data:** 256MB chunks compressed:

- Compressed then encrypted: ~80MB
- Encrypted then compressed: ~150MB (no compression on pseudorandom data)

---

### 5. Heavy Key Derivation Per File

**Anti-Pattern:**

```
❌ PBKDF2 (310k iterations) × every file → massive latency
✅ PBKDF2 once per archive, HKDF for per-chunk keys
```

**Consequences:**

- 100ms+ per file for key derivation
- Makes archiving 1000 files take 100+ seconds
- Users abandon feature due to slowness

**Avoid When:** Archiving many files with encryption

**Alternative:**

- Derive master key once (slow operation, one-time)
- Derive chunk keys with HKDF (fast operation, many times)

---

### 6. Native Bindings Without Platform Matrix

**Anti-Pattern:**

```
❌ Add 7z native binding → Windows fails → 1-week delay
✅ Pre-verify Windows/Linux/macOS compilation, plan contingencies
```

**Consequences:**

- Platform-specific bugs discovered late
- Delays due to compilation failures
- Need to rewrite mid-development

**Avoid When:** Any native extension to core functionality

**Alternative:**

- Pre-test on all target platforms
- Have pure-JS fallback ready
- Bundle pre-compiled binaries if needed

---

### 7. Unbounded Decompression

**Anti-Pattern:**

```
❌ Accept any archive → 256B expands to 10GB → OOM
✅ Enforce MAX_RATIO=10, MAX_ABSOLUTE=2.5GB, MAX_ENTRIES=10,000
```

**Consequences:**

- Denial of service via decompression bombs
- System crashes from memory exhaustion
- Disk space exhaustion

**Avoid When:** Processing untrusted external archives

**Implementation:**

- MAX_RATIO: 10:1 (10 bytes output per 1 byte input)
- MAX_ABSOLUTE: 2.5GB total per archive
- MAX_ENTRIES: 10,000 files per archive

---

### 8. Ignoring Integration Complexity

**Anti-Pattern:**

```
❌ "Add ZSTD" = 1 week (ignores chunking, checkpoints, profiles)
✅ "Add ZSTD" = 2.5 weeks (chunking + checkpoints + 4 profiles + tests)
```

**Consequences:**

- Missed dependencies cause timeline slips
- Features don't integrate cleanly
- Technical debt accumulates

**Avoid When:** Any integration beyond simple library calls

**Rule of Thumb:** Break down into:

- Core integration (library calls)
- Integration testing (verify works with system)
- Configuration (profiles, settings)
- Error handling (what happens when it fails)
- Documentation (how users use it)

---

### 9. Service Count Underestimation

**Anti-Pattern:**

```
❌ "4 core services" (missed ValidationEngine, KeyManager)
✅ Decompose fully before counting: 5-6 minimum services
```

**Consequences:**

- Timeline doesn't account for all work
- Services missing or rushed
- Architecture gaps discovered late

**Avoid When:** Complex feature with multiple responsibilities

**Methodology:**

- List all data flows
- For each flow, identify required services
- Don't skip "simple" or "obvious" services
- Validate against existing architecture patterns

---

### 10. Performance Targets Without Baselines

**Anti-Pattern:**

```
❌ "<30s for 100 files" (is this 1KB files or 100MB files?)
✅ "100MB total, 1,000 files, <30s on baseline hardware X"
```

**Consequences:**

- Targets are unmeasurable
- Can't verify if met
- Platform differences cause ambiguity

**Avoid When:** Setting any performance requirement

**Required:**

- Input specification: File sizes, file counts
- Hardware specification: CPU, memory, disk speed
- Measurement method: How is time calculated?
- Baseline comparison: Better/worse than what?

---

## Reusable Templates

### Decision Template

```markdown
## Decision: [Title]

### Problem Statement

[Clear description of what needs to be decided]

### Options Considered

1. **Option A**: [Description]
   - Pros: [List]
   - Cons: [List]
   - Effort: [Estimate]
2. **Option B**: [Description]
   - Pros: [List]
   - Cons: [List]
   - Effort: [Estimate]

### Trade-off Analysis

| Criterion          | Option A | Option B | Weight   |
| ------------------ | -------- | -------- | -------- |
| Performance        | [Score]  | [Score]  | [Weight] |
| Security           | [Score]  | [Score]  | [Weight] |
| Effort             | [Score]  | [Score]  | [Weight] |
| **Weighted Total** | [Total]  | [Total]  |          |

### Final Decision

**[Selected Option]**

### Rationale

[Why this option was chosen]

### Confidence Score

[X]/10

### Risk Mitigation

[If risks exist, how they'll be addressed]

### Dependencies

[What depends on this decision]
```

---

### Conflict Template

```markdown
## Conflict #[ID]: [Title]

### Description

[Clear description of the conflict]

### Involved Parties

- [Shepherd A]: Position
- [Shepherd B]: Position

### Impact

- Technical: [Description]
- Timeline: [Description]
- Quality: [Description]

### Resolution Options

1. [Option A]
2. [Option B]
3. [Option C]

### Recommended Resolution

[Chosen option with rationale]

### Status

- [ ] Open
- [ ] In Progress
- [ ] Resolved
- [ ] Deferred

### Resolution Date

[Date]
```

---

### Risk Template

```markdown
## Risk: [Title]

### Description

[What could go wrong]

### Probability

- [ ] High (>50%)
- [ ] Medium (20-50%)
- [ ] Low (<20%)

### Impact

- [ ] High (blocks release)
- [ ] Medium (delays release)
- [ ] Low (minor inconvenience)

### Mitigation Strategy

[How to prevent or minimize impact]

### Contingency Plan

[What to do if risk materializes]

### Owner

[Who is responsible]

### Status

- [ ] Identified
- [ ] Mitigated
- [ ] Accepted
- [ ] Materialized
```

---

## Build & Deployment Patterns

### 21. TypeScript rootDir Change Cascade

**Pattern:**

```
When changing TypeScript rootDir:
1. Audit ALL downstream file references
2. Update package.json main/bin paths
3. Update runtime path resolution code
4. Update npm scripts
5. Test with clean npm install
```

**Use Case:** When modifying TypeScript compiler options that affect output structure

**The v3.2.0-3.2.4 Incident:**

**What Changed:**

- Modified `tsconfig.json` to include both `src/` and `scripts/`
- Changed `rootDir` from `./src` to `.`

**Expected Output:**

```
dist/
├── index.js          ← Old expectation
├── server.js
└── tools/
```

**Actual Output:**

```
dist/
├── src/              ← NEW: src/ subfolder created
│   ├── index.js
│   ├── server.js
│   └── tools/
└── scripts/
    └── security-gates/
```

**Broken References (Fixed Over 4 Releases):**

| Release | File                           | Broken Path         | Fixed Path              |
| ------- | ------------------------------ | ------------------- | ----------------------- |
| 3.2.1   | package.json:6                 | `dist/index.js`     | `dist/src/index.js`     |
| 3.2.2   | bin/file-organizer-mcp.mjs:25  | `dist/index.js`     | `dist/src/index.js`     |
| 3.2.3   | bin/file-organizer-mcp.mjs:131 | `../dist/index.js`  | `../dist/src/index.js`  |
| 3.2.4   | package.json:21                | `dist/tui/index.js` | `dist/src/tui/index.js` |

**Impact:**

- Users couldn't install or run the package
- 4 patch releases required to fully fix
- Global installs failed with "Cannot find module" errors
- npx installs failed with "Server files not found"

**Root Cause:**

ESM dynamic imports (`import()`) and `fs.existsSync()` checks failed because they looked in the wrong directory. The bin wrapper's fallback build logic also failed because it couldn't find source files in the installed package.

**Prevention Checklist:**

```
□ Search for all hardcoded paths containing "dist/"
□ Check package.json: main, bin, scripts
□ Check bin wrapper files for relative imports
□ Check runtime path resolution code
□ Run npm pack --dry-run and verify structure
□ Test with npm install -g ./package.tgz
□ Verify all entry points work (main, bin, scripts)
```

**Lesson:**

> When TypeScript's `rootDir` changes, every single reference to compiled output must be audited. The build system doesn't warn you about broken runtime paths.

---

## Quick Reference

### Pattern Selection Guide

| Situation                      | Recommended Pattern                | Page |
| ------------------------------ | ---------------------------------- | ---- |
| Complex technology rollout     | Progressive Complexity Rollout     | 1    |
| Compression + encryption       | Compress-Then-Encrypt Pipeline     | 2    |
| Large encrypted archives       | Per-Chunk Key Rotation             | 3    |
| Metadata + portability         | Hybrid Metadata Storage            | 4    |
| Phased security implementation | Tiered Security Controls           | 5    |
| High-stakes integrity          | Multi-Layer Integrity Verification | 6    |
| Preventing secret archiving    | Sensitive File Blocking Patterns   | 7    |
| Variable compression needs     | Adaptive Compression Profiles      | 8    |
| Background services            | Resource-Aware Throttling          | 9    |
| Setting test coverage          | Coverage Tiers by Test Type        | 10   |
| Bit-perfect recovery           | Round-Trip Integrity Tests         | 11   |
| Multiple failure modes         | Error Hierarchy by Domain          | 12   |
| TypeScript config changes      | rootDir Change Cascade             | 21   |

### Anti-Pattern Quick Reference

| Situation                          | Avoid This Pattern                    | Use This Instead            |
| ---------------------------------- | ------------------------------------- | --------------------------- |
| Multi-shepherd debate              | Siloed Proposal Development           | Joint dependency mapping    |
| Complex timeline                   | Optimistic Timeline Compression       | Risk-based expansion        |
| Large security scope               | All-or-Nothing Security               | Tiered controls             |
| Streaming encryption + compression | Encrypt-Then-Compress                 | Compress-Then-Encrypt       |
| Many files to encrypt              | Heavy Key Derivation Per File         | Master key + HKDF           |
| Native library integration         | Native Bindings Without Matrix        | Platform pre-verification   |
| Processing external archives       | Unbounded Decompression               | MAX_RATIO + limits          |
| Adding complex feature             | Ignoring Integration Complexity       | Full decomposition          |
| Service architecture planning      | Service Count Underestimation         | Complete enumeration        |
| Performance requirements           | Performance Targets Without Baselines | Full hardware specification |
| TypeScript config changes          | Not auditing downstream references    | Full path audit checklist   |

---

---

## NEW ENTRY: Setup Wizard SOTA Debate (February 2026)

### Debate Context

Multi-shepherd debate on whether to implement SOTA improvements to setup wizard including:

- Spin-lock → mutex refactor
- execSync → async exec conversion
- 8-layer path validation addition
- Comprehensive unit tests
- Progress indicators
- Feature flags

### Key Findings

#### 1. Verify Before Proposing

**Pattern:** Security shepherd proposed 8-layer validation that already existed in `path-validator.service.ts`

**Lesson:** Always audit existing code before proposing new solutions. Proposed redundant work wastes team review time and undermines credibility.

**Implementation:** Pre-debate code audit checklist added to workflow

---

#### 2. Context-Dependent Solutions

**Pattern:** Performance shepherd claimed mutex is always better than spin-lock

**Counter-evidence:** Spin-lock outperforms mutex for:

- Critical sections < 1μs duration
- Low contention scenarios
- Single-threaded async code

**Lesson:** Technical solutions are context-dependent. No universal "best" solution exists.

**Resolution:** Decision matrix created for sync primitive selection

---

#### 3. Tests ≠ Silver Bullet

**Pattern:** Maintainability shepherd insisted TDD before any refactoring

**Counter-evidence:** Tests catch regressions, not:

- Security vulnerabilities
- Performance degradation
- Integration failures
- Architectural debt

**Lesson:** Tests are one tool in the quality toolbox, not a replacement for other quality measures.

**Resolution:** Tests AND features in parallel tracks

---

#### 4. Feature Flag Debt

**Pattern:** Delivery shepherd advocated feature flags for all changes

**Counter-evidence:** Feature flags create:

- Conditional branch complexity
- Technical debt if not removed
- Cognitive load for new engineers

**Resolution:** Timeboxed feature flags with removal roadmap (within 2 sprints)

---

### Consensus Framework Applied

| Phase | Activity            | Participants                        |
| ----- | ------------------- | ----------------------------------- |
| 1     | Idea Generation     | All 5 specialists                   |
| 2     | Cross-Validation    | Each specialist critiques one other |
| 3     | Conflict Resolution | Shepherd mediates                   |
| 4     | Consensus           | All vote with conditions            |

### Cross-Critique Pattern Validated

**Structure:**

1. Each specialist critiques ONE other specialist's proposal
2. Rebuttal format: Claim → Counter → Evidence
3. Revised positions after critique
4. Final consensus with conditions

**Outcome:**

- 5 specialists revised their priority scores after critique
- 4 conflicts resolved through debate
- 1 unresolved (Architecture vs Delivery on feature flags) - timeboxed

### Revised Priority Scores (Post-Critique)

| Specialist      | Original | Revised | Reason                             |
| --------------- | -------- | ------- | ---------------------------------- |
| Performance     | 4/5      | 3/5     | Spin-lock legitimate for short ops |
| Security        | 5/5      | 4/5     | 8-layer already exists             |
| Maintainability | 4/5      | 3/5     | Tests not silver bullet            |
| Delivery        | 4/5      | 5/5     | Unchanged                          |
| Architect       | 4/5      | 4/5     | Acknowledged costs                 |

### Lessons Added to Patterns

1. **Pre-Proposal Audit**: Verify existing solutions before proposing new ones
2. **Context-Driven Decisions**: No universal "best" technical solution
3. **Test Scope**: Tests catch regressions, not all quality issues
4. **Feature Flag Lifecycle**: Timebox removal to prevent technical debt

### Anti-Patterns Identified

| Anti-Pattern         | Description                    | Solution                       |
| -------------------- | ------------------------------ | ------------------------------ |
| Redundant Proposal   | Proposing existing solutions   | Pre-debate code audit          |
| Single-Tool Thinking | Tests as only quality measure  | Multi-layered quality approach |
| Unbounded Flags      | Flags without removal timeline | Timeboxed removal              |
| Universal Claims     | "X is always better than Y"    | Context-dependent analysis     |

---

**Document Version:** 1.2
**Last Updated:** February 10, 2026
**Maintained By:** Borzoi (Intelligence Shepherd)
