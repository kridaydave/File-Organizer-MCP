# Changelog

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
- All console.* calls migrated to structured logger
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

**FINAL FIX - v3.2.8**
- Removed old local node_modules version conflict
- npx now correctly resolves to global installation

## [3.2.7] - 2026-02-10

### 🚨 CRITICAL FIX: MCP Protocol Compatibility

**Fixed stdout pollution breaking Claude connection**

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
