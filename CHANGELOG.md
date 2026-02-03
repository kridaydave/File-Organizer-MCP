# Changelog

## [3.0.0] - 2026-02-02

### 🚀 Major: Full TypeScript Migration

Complete rewrite from monolithic JavaScript to modular TypeScript architecture.

### ✨ Added

**Architecture**
- New `src/` directory structure with layered architecture
- TypeScript strict mode with full type safety
- ESLint + Prettier configuration for code quality

**Services Layer** (`src/services/`)
- `PathValidatorService` - 7-layer path validation with Zod schemas
- `FileScannerService` - Recursive file scanning with depth/count limits
- `HashCalculatorService` - SHA-256 hashing for duplicate detection
- `CategorizerService` - File type categorization by extension
- `OrganizerService` - File organization with dry-run support

**Tools Layer** (`src/tools/`)
- Each tool in its own file with Zod input validation
- Comprehensive JSDoc documentation with examples
- Exported TypeScript types inferred from Zod schemas

**Utilities** (`src/utils/`)
- `formatters.ts` - Byte/date/duration formatting
- `file-utils.ts` - Path normalization, expansion, validation
- `error-handler.ts` - Centralized error handling with sanitization
- `logger.ts` - Structured logging

**Schemas** (`src/schemas/`)
- Zod schemas for all tool inputs
- Runtime validation with descriptive error messages
- Type inference from schemas

**Tests** (`src/tests/`)
- `test-phase1.ts` - Path validation tests (5/5 passing)
- `test-security.ts` - Security tests (6/6 passing)

### 🔧 Changed
- Entry point: `dist/index.js` (compiled from TypeScript)
- Build: `npm run build` compiles TypeScript
- Tests: `npm run test:phase1`, `npm run test:security`

### 🗑️ Removed
- `server.js` (672-line monolith) → replaced by `src/` modules
- `lib/` folder → migrated to `src/services/`
- JavaScript test files → migrated to TypeScript

### 📦 Dependencies Added
- `typescript` ^5.3.2
- `zod` ^3.22.4
- `@types/node` ^20.10.0
- `eslint`, `prettier`, `rimraf`

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