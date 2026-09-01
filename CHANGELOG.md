# Changelog

## [Unreleased]

### Added

- **`file_organizer_organize_by_project`** - project-based content
  organization, re-added on the v5 architecture (the v3.5 Phase 3 feature,
  rebuilt). Detection groups files across types using deterministic,
  local-only signals: rarity-weighted shared name tokens, IDF-filtered
  content terms from text-like files (read through the hardened
  `core/io` reader, plain text only, no new dependencies), and identifier
  markers. Content-blind files join only via a name token or marker.
  The server serves 22 tools (was 21).

## [5.0.0] - 2026-08-22

### ⚠️ Breaking Changes

- **Scheduler is now a standalone bin** - the watch tools
  (`file_organizer_watch_directory`, `file_organizer_unwatch_directory`,
  `file_organizer_list_watches`) are removed from the MCP server. Scheduled
  organization is managed and run by `bin/file-organizer-watch.mjs`
  (`add`/`remove`/`list` subcommands; daemon mode is the default). The core
  stdio server serves 21 tools (was 24).
- **Content-based tools deleted** - `organize_smart`, `organize_by_content`
  and the `screen_files` flag are gone, along with PDF/DOCX text extraction.
  Text previews are raw reads. Dropped dependencies: `pdf-parse`, `mammoth`.
- **Stateless protocol era** - see MCP section below; clients on the 2025-era
  handshake keep working via dual-era negotiation.

### 🚀 MCP 2026-07-28 Protocol Support

- **Switched to `@modelcontextprotocol/server@2.0.0`** (replacing
  `@modelcontextprotocol/sdk@1.30.0`). The server implements the stateless
  MCP spec from 2026-07-28: no session handshake, no `Mcp-Session-Id`, modern
  requests carried in the `_meta` envelope, and `server/discover` for
  capability negotiation.
- **Dual-era stdio serving** - `serveStdio` negotiates the protocol era per
  connection. 2025-era clients (classic `initialize` handshake) and
  2026-07-28 clients (`server/discover` opening) are served by the same
  binary. Era is locked per connection at the opening message.
- **Response caching** - `cacheHints` (`ttlMs: 3600000`, `cacheScope:
  "private"`) on cacheable list operations (`tools/list`, `server/discover`),
  so cached clients skip redundant metadata fetches.
- Legacy `initialize` support remains available (12-month deprecation window);
  operators can set `legacy: "reject"` to serve 2026-07-28 clients only.

### 🧹 Simplification (simplify-v5)

- **No file over 300 lines** - `types.ts`, `config.ts`, `index.ts` and the
  categorizer god-file split into `core/types`, `core/config`, `core/categorize`
  and friends. Dead methods deleted.
- **27 services → core modules** - end state is
  `core/{path,io,scan,categorize,organize,hash}` + history logger +
  `extensions/scheduler`. The `readers/` framework (~2k lines with its factory,
  Result type, rate limiter and audit log) collapsed into one
  `core/io/readFile()` function that keeps the sensitive-file gate and TOCTOU
  protection. Metadata stack merged into `services/metadata/{image,audio,service}`;
  content-analyzer, topic-extractor, text-extraction, content-screening and
  metadata-cache deleted.
- **Schemas 22 → 4 files** (`common`, `scan`, `organize`, `system`). Tool shapes unchanged.
- **RateLimiter deleted** outright - clients rate-limit themselves.
- **History logger rewrite** - `log()` appends directly behind an in-process
  write chain instead of a batch queue with a flush timer. Lockfile kept for
  cross-process safety (server + watch daemon share one file).
- **Stateless server** - fresh `McpServer` per connection, request-scoped
  `ctx = { config, history }`, zero module-level service instances. Custom
  categorization rules persist to user config instead of a global singleton.
- **Rollback manifests** moved from `process.cwd()/.file-organizer-rollbacks`
  (broke under npx/global installs) to the platform config dir, with guarded
  migration of legacy manifests.

### 🐛 Bug Fixes

- **`set_custom_rules` filename patterns never matched** - the Zod schema uses
  `filename_pattern` but the old code cast straight to camelCase without
  normalizing, so pattern rules from the tool were silently ignored. Handler
  now converts snake_case → camelCase.
- **History lockfile steal** - staleness was judged on the same window as the
  wait, so a waiter could take a live lock at its deadline. Stale threshold is
  now `lockTimeoutMs * 2`.
- **Undo broken for npx/global installs** - rollback manifests were written
  relative to the process working directory.

---

## [3.5.0] - 2026-08-15

### 🧹 Maintenance & Modernization

- **MCP SDK upgraded** `1.26.0` → `1.30.0` (v1 line, low-level `Server` API
  unchanged — stdio buffer limits, Zod 3.25 support, stricter Content-Type
  validation upstream).
- **Jest upgraded to v30** (`jest@30`, `@types/jest@30`) with `ts-jest@29.4.x`
  which already supports Jest 30 and TypeScript <7.
- **ESLint upgraded to v10** with `typescript-eslint@8.67` (supports ESLint 10).
- **Tooling**: `rimraf@6`, plus minors/patches for `node-cron`, `mammoth`,
  `zod`, `globals`, `@inquirer/prompts`, `prettier`, `ts-jest`, `@eslint/js`.
- **node-cron 4.6 type fix** - `ScheduledTask` moved from a namespace member to
  a named export; updated the import in `auto-organize.service.ts`.
- **Fixed 29 new ESLint 10 violations** across 12 files: `preserve-caught-error`
  (rethrown errors now carry `{ cause }`) and `no-useless-assignment` (dead
  initializers removed). No behavior change.

### 🧪 Testing

- Added unit tests for four previously untested services: `file-tracker`,
  `manifest-integrity`, `text-extraction`, `photo-organizer` (+62 tests, 69
  suites / 1199 tests total).

### 🐛 Bug Fixes

- **macOS whitelist access through symlinked prefixes** - On macOS `/var` is a
  symlink to `/private/var`, so `fs.realpath` canonicalizes temp-dir paths to
  `/private/var/folders/...`. The darwin always-blocked `/^\/private[\/]/`
  pattern rejected those paths even when explicitly whitelisted, and whitelist
  containment compared non-canonical config paths against canonical real paths.
  `isPathAllowed()` now resolves symlinks (including intermediate ones) and
  compares canonical forms for both blacklist and containment checks. The
  darwin blacklist now blocks specific sensitive dirs (`/private/etc`,
  `/private/tmp`, `/private/var/{db,root,vm,at,run,log,spool,audit,tmp}`) rather
  than all of `/private`, keeping per-user temp dirs usable.
- **CI: markdownlint failures** - Fixed pre-existing violations in
  `docs/FRAMEWORK.md`, `docs/CONTENT_BASED_ORGANIZATION_PLAN.md`, `CHANGELOG.md`,
  `AGENTS.md`, `README.md`, and several plan docs; removed an empty
  unreferenced artifact `docs/IMPLEMENTATION_PLAN_V3.4.2_UPDATED.md`.
- **CI: Windows test job** - The `Clean Jest cache` step ran bash syntax under
  PowerShell; added `shell: bash` in `.github/workflows/ci.yml`.
- **Windows whitelist access under %TEMP%** - The win32 always-blocked
  `AppData` pattern rejected paths under `AppData\Local\Temp` (where
  `os.tmpdir()` points), making whitelisted temp dirs unusable. The pattern now
  blocks `Local` (except `Temp`), `LocalLow` and `Roaming` instead of all of
  `AppData`.
- **Windows symlink test** - `UV_FS_O_NOFOLLOW` is not supported on Windows
  (libuv ignores it); symlink escapes are still prevented by the post-open
  realpath containment check. The O_NOFOLLOW rejection test now skips on
  Windows with a comment explaining the platform difference.

### ⚠️ Intentionally held dependency versions

- `typescript` held at `5.9` - TS 7 has no stable programmatic API; upgrading
  would break `ts-jest` and `typescript-eslint`.
- `chalk` held at `5` - v6 requires Node >=22, conflicting with the declared
  `engines: >=18`.
- `@types/node` held at `20` - tracks the supported runtime target, not latest.

## [3.4.2] - 2026-02-25

### 🐛 Bug Fixes

- **External Volume Access on macOS** - Paths under `/Volumes/<name>` (external
  drives, network mounts) were silently rejected when added to
  `customAllowedDirectories`, even though `/Volumes` is not in the
  always-blocked list. The cause was an overly strict "outside home directory"
  guard in `loadCustomAllowedDirs`.

### ✨ New Feature

- **`allowExternalVolumes` config flag** - Users can now opt in to accessing
  external volumes by setting `"allowExternalVolumes": true` in their config
  file alongside the specific volume path in `customAllowedDirectories`:

  ```json
  {
    "allowExternalVolumes": true,
    "customAllowedDirectories": ["/Volumes/MyExternalDrive"]
  }
  ```

  Supported mount locations per platform:
  - **macOS**: `/Volumes/<name>/…`
  - **Linux**: `/media/<name>/…`, `/mnt/…`, `/run/media/<name>/…`
  - **Windows**: not needed — drive letters already work

  All existing security guards (symlink checks, traversal prevention, always-
  blocked patterns) continue to apply inside the allowed volume path.

---

## [3.4.2] - 2026-02-19

### 🐛 Bug Fixes

- **Rollback Service** - Fixed path validation bug that caused undo operations to fail for files in external directories (e.g., Downloads).

## [3.4.2] - 2026-02-18

### 🐛 Bug Fixes

- **Integration fixes** - Fixed OrganizeResult type mismatch, duplicate historyLogger
- **Dead code cleanup** - Removed unused exports, fixed duplicate formatBytes functions
- **Schema consolidation** - Centralized Zod schemas, removed duplicates

### ⚙️ Maintenance

- Updated documentation to 3.4.2

## [3.3.4] - 2026-02-14

### 🐛 Bug Fixes

- **Fixed version string** - Updated hardcoded version from 3.3.2 to 3.3.4 in config.ts and index.ts

## [3.3.3] - 2026-02-14

### 🐛 Bug Fixes

#### File Organization

- **Fixed file-tracker service** - Migrated from JavaScript to TypeScript with proper typing
- **Improved service exports** - Fixed module exports across various services

#### Code Quality

- **ESLint configuration** - Updated ESLint config for better TypeScript support
- **Security gates** - Enhanced static analysis in security gates

### 🧪 Testing

- All tests passing
- Build passes successfully

## [3.3.2] - 2026-02-13

### 🐛 Bug Fixes

#### Smart Organization

- **Fixed dry_run not passed** in photo-organization.ts and music-organization.ts
- **Fixed delete-before-verify bug** - Source files now verified copied before deletion
- **Fixed source/target validation** - Added proper path validation in smart-organization.ts

#### Code Quality

- **Fixed logger.ts Jest detection** - typeof jest no longer throws ReferenceError
- **Fixed path-security.ts argument order** - Corrected wrong argument order to isSubPath
- **Fixed categorizer.service.ts** - useContentAnalysis now properly implemented
- **Fixed test mock pollution** - smart-organization-edge-cases.test.ts no longer pollutes other tests

### 🧪 Testing

- All 59 test suites passing (893/896 tests, 3 skipped)
- Build passes successfully

## [3.3.1] - 2026-02-13

### 🐛 Bug Fixes

#### Error Handling

- **Fixed `createErrorResponse` missing `isError: true`** - All error responses now consistently include the `isError` flag

#### Smart Organization

- **Fixed directory creation bug** - Only creates Music/Photos/Documents folders when files of those types actually exist (was creating all folders unconditionally)
- **Fixed Copy vs Move behavior** - `organizeDocuments()` now correctly respects the `copyInsteadOfMove` option

#### File Organization

- **Fixed `use_content_analysis` no-op bug** - The flag was parsed but not passed to the categorizer; now properly flows through `organize()` → `generateOrganizationPlan()` → `getCategory()`

#### Code Cleanup

- **Removed empty `cleanupEmptyFolders` method** - Was an unused placeholder in organizer.service.ts

### 🧪 Testing

- Added 74 comprehensive tests for Smart Organization tool:
  - Unit tests (29 tests)
  - Edge case tests (25 tests)
  - Integration tests (20 tests)

## [3.3.0] - 2026-02-13

### ✨ New Features

#### 🧠 Smart Organization (Unified Tool)

- **New Tool: `file_organizer_organize_smart`** - Automatically organizes mixed folders
  - Auto-detects file types (music, photos, documents)
  - Routes files to appropriate organizer:
    - 🎵 Music → Artist/Album structure
    - 📸 Photos → Date-based folders (YYYY/MM/DD)
    - 📄 Documents → Topic-based folders
  - Creates organized subdirectories: `Music/`, `Photos/`, `Documents/`, `Other/`
  - All options supported: GPS stripping, camera grouping, shortcuts, etc.

#### 🎵 Music Organization

- **New Tool: `file_organizer_organize_music`** - Music library organization
  - Organizes by Artist/Album/Title structure
  - Supports MP3, FLAC, OGG, WAV, M4A, AAC
  - Configurable folder structures: `artist/album`, `album`, `genre/artist`, `flat`
  - ID3 metadata extraction with graceful fallback

#### 📸 Photo Organization

- **New Tool: `file_organizer_organize_photos`** - Photo library organization
  - Organizes by EXIF date: YYYY/MM/DD structure
  - GPS stripping for privacy (using piexifjs)
  - Camera model grouping option
  - Supports JPEG, PNG, TIFF, HEIC, RAW formats

#### 📄 Content-Based Organization

- **New Tool: `file_organizer_organize_by_content`** - Document organization
  - Topic extraction from document content
  - Supports PDF, DOCX, TXT, MD, RTF, ODT
  - Multi-topic shortcut creation
  - Text analysis with keyword extraction

#### 📚 Batch File Reading

- **New Tool: `file_organizer_batch_read_files`** - Read multiple files at once
  - Efficient batch processing
  - Multiple encoding support

### 🔧 Code Quality Improvements

- Full GPS stripping implementation (was TODO stub)
- All console.\* calls migrated to structured logger
- Removed 24+ redundant type assertions
- Added comprehensive type guards
- Improved error handling consistency

### 📦 Dependencies

- Added `piexifjs` for EXIF manipulation
- Added `pdf-parse` for PDF text extraction
- Added `mammoth` for DOCX text extraction

### 🧪 Testing

- Added 800+ new tests for metadata services
- Tests for audio metadata extraction
- Tests for image metadata extraction
- Tests for music organizer
- Tests for content organization
- Tests for topic extractor

### 🛠️ New Services

- `audio-metadata.service.ts` - Music metadata extraction
- `image-metadata.service.ts` - Photo metadata extraction
- `text-extraction.service.ts` - Document text extraction
- `topic-extractor.service.ts` - Topic/keyword extraction
- `content-analyzer.service.ts` - File type detection
- `content-screening.service.ts` - Security screening
- `metadata-cache.service.ts` - Caching for faster operations
- `music-organizer.service.ts` - Music organization logic
- `photo-organizer.service.ts` - Photo organization logic
- `smart-organization.ts` - Unified organization tool

---

## [3.2.8] - 2026-02-10

### 🚨 CRITICAL FIX: MCP Protocol Compatibility

### FINAL FIX - v3.2.8

- Removed old local node_modules version conflict
- npx now correctly resolves to global installation

## [3.2.7] - 2026-02-10

### 🚨 CRITICAL FIX: MCP Protocol Compatibility

#### Fixed stdout pollution breaking Claude connection

- **prepare.cjs**: Changed all `console.log` → `console.error`
- **postinstall.cjs**: Changed all `console.log` → `console.error`
- **file-organizer-mcp.mjs**: Changed `log()` to use `console.error`
- **setup-wizard.ts**: All output now routed to stderr

**Root Cause:** Installation scripts were outputting colored text to stdout, which Claude's MCP client tried to parse as JSON-RPC, causing "Unexpected token" errors.

### 🐛 Bug Fixes (from v3.2.6)

- **Setup Wizard**: Fixed 14 critical bugs from security audit
  - Added robust path resolution with `findPackageRoot()` and `getPackageRoot()`
  - Added try/catch around all filesystem operations
  - Added validation for user input paths
  - Fixed async/await consistency issues
  - Added graceful handling for prompt cancellations
- **Client Detector**: Fixed 14 critical bugs from security audit
  - Added config write locking to prevent concurrent access
  - Added atomic file writes (temp file + rename pattern)
  - Fixed LOCALAPPDATA undefined checks for Windows
  - Added null checks for config paths
  - Fixed Continue client config format
  - Added deep merge for server configurations
  - Added JSON.parse validation and error handling

### 🧪 Testing

- Fixed flaky `cron-utils.test.ts` with fixed time values
- All 48 test suites passing (630 tests)

---

## [3.2.0] - 2026-02-10

### ✨ New Features

- **Secure File Reader**: New `file_organizer_read_file` tool for reading file contents with comprehensive security
  - 8-layer path validation blocks path traversal attacks
  - 47+ sensitive file patterns automatically blocked (.env, .ssh/, passwords, keys)
  - TOCTOU-safe file operations with O_NOFOLLOW
  - SHA-256 checksum verification for integrity
  - Rate limiting (120/min, 2000/hour)
  - Support for text, base64, and binary encoding
  - Partial reads with offset and maxBytes
  - JSON, markdown, and text response formats

### 🛡️ Security

- **File Reader Security Gates**: Comprehensive security testing suite
  - 161 path traversal fuzzing payloads (100% blocked)
  - 273 TOCTOU race condition tests (99.63% blocked)
  - 144 sensitive file access tests (100% blocked)
  - Static analysis security rules

### 📚 Documentation

- Added File Reader module documentation (`src/readers/README.md`)
- Added `file_organizer_read_file` to README.md Tools Reference
- Added File Reader architecture documentation
- Added File Reader test documentation to TESTS.md
- Updated API.md with complete file reader documentation

### 🧪 Testing

- **150 new tests** for File Reader module
  - Result<T,E> pattern tests
  - Error class tests
  - SecureFileReader core tests
  - Sensitive file pattern tests
  - Factory tests
  - Integration tests
  - E2E tests
- Total test count: 418 tests (417 passing, 1 skipped)

---

## [3.1.5] - 2026-02-08

### Security & Stability Improvements

- Fixed infinite loop in file-scanner.service.ts cycle detection (broken visited Set)
- Fixed allowSymlinks ignored during path resolution in path-validator.service.ts
- Fixed Windows root infinite loop in path traversal detection
- Fixed TOCTOU race conditions across organizer, rollback, and duplicate-finder services
- Fixed double-count bug in rollback service success/failure tracking
- Fixed silent overwrites in rollback operations
- Fixed backup name collisions in duplicate-finder.service.ts
- Fixed race condition in auto-organize.service.ts runningDirectories management
- Fixed symlink attack vulnerability in config.ts
- Fixed path traversal in custom directory loading

### Bug Fixes

- Fixed file handle leaks across scanner, validator, and finder services
- Fixed unprotected JSON parsing in rollback manifest handling
- Fixed incomplete Windows reserved names regex in organizer
- Fixed silent realpath failures in file scanner
- Fixed file handle close errors masking stat errors

### Testing Improvements

- Added comprehensive ESM mocking pattern documentation
- Fixed 7 test files with proper Jest ESM mocking
- All 268 tests passing (267 passing, 1 skipped)

### Documentation

- Added ESM Jest Mocking Pattern to AGENTS.md
- Updated JSDoc comments across all service files

## [3.1.4] - 2026-02-07

### 📝 Documentation

- **Fixed**: Corrected Prettier and Markdown lint errors across all documentation files.
- **Badges**: Updated README badges for v3.1.4 and current test status.

### 🛡️ Security & Integrity

- **Source Code**: Fixed code linting warnings (`prefer-const` and unused `eslint-disable` directives).
- **Cleanup**: Removed unneeded temporary/log files for a cleaner project structure.

## [3.1.3] - 2026-02-06

### 📝 Documentation

- **Version Bump**: Updated all documentation and source files to v3.1.3

## [3.1.2] - 2026-02-06

### 🐛 Fixed

- **Bin Entry**: Fixed `file-organizer-setup` bin path (`tui-index.js` → `index.js`)
- **Postinstall**: Added postinstall welcome message after npm install

## [3.1.1] - 2026-02-06

### ✨ New Features

- **Interactive Setup Wizard**: New TUI-based setup (`npx file-organizer-mcp --setup`) for easy configuration of folders, conflict strategies, and Claude Desktop integration.
- **Smart Metadata Organization**:
  - Organization by Year/Month for images and videos.
  - Organization by Artist/Album for audio files.
  - New tool `file_organizer_inspect_metadata` for safe metadata extraction.
- **Smart Scheduling & Watch Mode**:
  - New tools: `file_organizer_watch_directory`, `file_organizer_unwatch_directory`, `file_organizer_list_watches`.
  - Cron-based scheduling for automatic organization (e.g., `"0 10 * * *"` for daily at 10am).
  - Per-directory configuration with independent schedules.
  - `min_file_age_minutes` - Skip files newer than X minutes (prevents organizing in-progress downloads).
  - `max_files_per_run` - Limit files processed per scheduled run.
  - Hot-reload configuration without server restart.
- **Batch Renaming**: New powerful `file_organizer_batch_rename` tool.

### 🛡️ Improvements

- **Conflict Strategy**: Configurable default conflict resolution (`rename`/`skip`/`overwrite`) via config.
- **Security Check**: Enforced stricter validation for symlink security with explicit `lstat` checks.
- **Config Management**: Deep merge updates preserve existing settings when adding new configuration.
- **Free Models**: Updated default configuration to prioritize free models.

### 🐛 Fixed

- Resolved JSON configuration errors.
- Fixed Cloud Authentication issues.
- Fixed server disconnection stability issues.

---

## [3.0.0] - 2026-02-02

### 🚀 Major: Full TypeScript Migration

Complete rewrite from monolithic JavaScript to modular TypeScript architecture.

### ✨ Added

#### Architecture

- New `src/` directory structure with layered architecture
- TypeScript strict mode with full type safety
- ESLint + Prettier configuration for code quality

**Services Layer** (`src/services/`)

- `PathValidatorService` - 8-layer path validation with Zod schemas
- `FileScannerService` - Recursive file scanning with depth/count limits
- `HashCalculatorService` - SHA-256 hashing for duplicate detection
- `CategorizerService` - File type categorization by extension
- `OrganizerService` - File organization with dry-run support
- `RollbackService` - Undo file operations with manifest tracking

**Tools Layer** (`src/tools/`)

- Each tool in its own file with Zod input validation
- Comprehensive JSDoc documentation with examples
- Exported TypeScript types inferred from Zod schemas

**Utilities** (`src/utils/`)

- `formatters.ts` - Byte/date/duration formatting
- `file-utils.ts` - Path normalization, expansion, validation
- `error-handler.ts` - Centralized error handling with sanitization
- `logger.ts` - Structured JSON logging with configurable log levels (debug/info/warn/error)

**Configuration** (`src/config.ts`)

- Platform-aware default directory detection (Windows/macOS/Linux)
- User configuration loading from platform-specific locations
- Whitelist/blacklist system for directory access control
- Auto-initialization of user config file

**Schemas** (`src/schemas/`)

- Zod schemas for all tool inputs
- Runtime validation with descriptive error messages
- Type inference from schemas

#### Testing

- Comprehensive unit tests for all services
- Integration tests for complete workflows
- Performance benchmarks
- 100+ tests passing across unit, integration, and performance suites
- `TESTS.md` - Complete test documentation

### 🔧 Changed

- Entry point: `dist/index.js` (compiled from TypeScript)
- Build: `npm run build` compiles TypeScript
- Tests: `npm test` runs complete test suite
- Improved error messages with sanitized paths
- Enhanced security with TOCTOU mitigation using file descriptors

### 🐛 Fixed

- Path traversal vulnerability (8-layer validation pipeline)
- Race conditions in file operations (atomic copy with `COPYFILE_EXCL`)
- Data loss during overwrites (automatic backups to `.file-organizer-backups/`)
- Windows path case-sensitivity issues
- Multiple test failures in duplicate management, organization flow, and file inspection

### 🗑️ Removed

- `server.js` (672-line monolith) → replaced by `src/` modules
- `lib/` folder → migrated to `src/services/`
- JavaScript test files → migrated to TypeScript

### 📦 Dependencies Added

- `typescript` ^5.3.2
- `zod` ^3.22.4
- `@types/node` ^20.10.0
- `eslint`, `prettier`, `rimraf`
- `jest` for testing

---

## [3.0.0-beta.1] - 2026-02-02

### 🔒 Security (CRITICAL)

- **FIXED**: Path traversal vulnerability (CVE-pending)
  - Previous versions allowed `../` to access parent directories
  - Now implements 8-layer validation pipeline
  - All paths restricted to current working directory in strict mode
- **FIXED**: Windows Path Case-Sensitivity
  - Resolves access denial for paths like `c:\Users` vs `C:\Users`
  - Ensures robust whitelist matching on Windows platforms

### ✨ Added

- New 8-layer path validation system
- Custom error classes (AccessDeniedError, ValidationError)
- Comprehensive security test suite (5/5 passing)
- Forward compatibility for Phase 2 (config system)

### 🔧 Changed

- Updated to v3.0.0 architecture
- Path validation now uses base-validator.js
- Improved error messages with sanitized paths

### ⚠️ Breaking Changes

- **NONE** - Fully backward compatible with v2.x for valid use cases
- Only breaking for invalid use cases (accessing parent directories)

### 📦 Migration from v2.x

No changes needed! All existing workflows continue to work.
If you were using `../` paths (which was a security bug), those now correctly fail.

### 🧪 Testing

- 5/5 critical security tests passing
- All 6 original MCP tools tested and working
- Cross-platform tested (Windows, macOS, Linux)

---

## [2.1.0] - 2026-02-01

(Previous version with path traversal vulnerability - UPGRADE IMMEDIATELY)
