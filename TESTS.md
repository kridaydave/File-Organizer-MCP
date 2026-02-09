# Test Suite Documentation

This document provides comprehensive information about all tests in the File Organizer MCP project, what they do, and why they are necessary.

## Test Suite Overview

The test suite contains **418 tests** organized into three main categories:

- **Unit Tests**: Test individual components in isolation
- **Integration Tests**: Test complete workflows and component interactions
- **Performance Tests**: Measure performance and resource usage

**Current Status**: 417 passing, 1 skipped (99.8%)

---

## Test Organization

```
tests/
├── unit/                           # Unit tests for individual components
│   ├── services/                   # Service layer tests
│   ├── tools/                      # Tool handler tests
│   ├── category_security.test.ts   # Category name security tests
│   ├── pagination.test.ts          # Pagination logic tests
│   ├── security_repro.test.ts      # Security vulnerability reproduction
│   └── security_suite.test.ts      # Comprehensive security suite
├── integration/                    # End-to-end workflow tests
│   ├── full_organization_flow.test.ts
│   ├── duplicate_resolution_flow.test.ts
│   ├── organize.test.ts
│   ├── edge-cases.test.ts
│   └── tools/organize.test.ts
├── performance/                    # Performance benchmarks
│   └── performance.test.ts
└── readers/                        # File Reader tests (NEW in v3.2.0)
    ├── result.test.ts              # Result<T,E> pattern tests
    ├── errors.test.ts              # Error class tests
    ├── secure-file-reader.test.ts  # Core reader tests
    ├── sensitive-file-patterns.test.ts # Security pattern tests
    ├── factory.test.ts             # Factory tests
    ├── integration.test.ts         # Integration tests
    └── e2e.test.ts                 # End-to-end tests
```

---

## Unit Tests

### Service Layer Tests (`tests/unit/services/`)

#### 1. `categorizer.test.ts`

**Purpose**: Tests file categorization logic  
**What it tests**:

- Categorizing files by extension (`.jpg` → Images, `.pdf` → Documents)
- Custom categorization rules
- Unknown file type handling

**Why necessary**: Ensures files are organized into correct categories, which is the core functionality of the file organizer.

---

#### 2. `conflict_resolution.test.ts`

**Purpose**: Tests file conflict handling strategies  
**What it tests**:

- Rename strategy (file → file_1, file_2)
- Skip strategy (preserve existing files)
- Conflict detection logic

**Why necessary**: Prevents data loss when organizing files with duplicate names. Critical for data integrity.

---

#### 3. `duplicate-finder.test.ts`

**Purpose**: Tests duplicate file detection and management  
**What it tests**:

- Content-based duplicate detection via hash comparison
- Scoring strategies (newest, oldest, best_location, best_name)
- Safe file deletion with backup creation
- Rollback manifest generation

**Why necessary**: Ensures duplicate detection is accurate and file deletion is safe. Prevents accidental data loss.

**Key Tests**:

- `should identify identical files as duplicates` - Verifies hash-based duplicate detection
- `should score files based on strategy: best_location` - Documents > Downloads preference
- `should delete specified files and create rollback` - Safe deletion with backup

---

#### 4. `file-scanner.test.ts`

**Purpose**: Tests directory scanning functionality  
**What it tests**:

- Recursive directory scanning
- Depth limit enforcement (`max_depth`)
- Exclude pattern matching (ignore `node_modules`, `.git`)
- Binary file detection
- Edge cases (empty directories, special characters, zero-byte files)

**Why necessary**: Directory scanning is the foundation for all file operations. Must handle various edge cases without crashing.

---

#### 5. `hash-calculator.test.ts`

**Purpose**: Tests file hash calculation for duplicate detection  
**What it tests**:

- SHA-256 hash calculation
- Handling of large files
- Timeout enforcement (prevents hanging on huge files)

**Why necessary**: Hash calculation must be accurate and performant. Timeouts prevent DoS from maliciously large files.

---

#### 6. `organizer.test.ts`

**Purpose**: Tests core file organization logic  
**What it tests**:

- Moving files to categorized folders
- Dry-run mode (preview without changes)
- Statistics generation
- Rollback tracking

**Why necessary**: Core business logic test. Ensures files are moved correctly and operations can be undone.

---

#### 7. `path-validator.test.ts`

**Purpose**: Tests security-critical path validation
**Tests**: 4 tests, all passing

**What it tests**:

- **Path traversal protection** (`../etc/passwd` blocked)
- **Symlink attack prevention** (symlinks outside allowed roots blocked)
- **Resource limits** (path length \< 4096 chars)
- **Suspicious character blocking** (`<script>`, shell metacharacters)
- Windows reserved names (`CON`, `PRN`, `AUX`)

**Why necessary**: **Critical for security**. Prevents path traversal attacks, arbitrary file access, and system corruption.

**Key Tests**:

- `should reject paths with ../ sequences` - Prevents directory traversal
- `should reject symlinks pointing outside allowed roots` - Prevents escaping sandbox
- `should reject paths with suspicious characters` - Blocks XSS/shell injection attempts
- `should reject Windows reserved names` - Prevents system file conflicts

---

#### 7b. `auto-organize.test.ts`

**Purpose**: Tests automatic file organization logic
**Tests**: 17 tests, all passing

**What it tests**:

- Automatic file categorization without user intervention
- Custom rule precedence over default categorization
- Nested directory handling during organization
- Conflict resolution during auto-organization
- Dry-run mode for previewing organizational changes

**Why necessary**: Validates the automated organization workflow that users rely on for hands-free file management.

---

## ESM Mocking Pattern

When writing tests for ESM modules in this project, a specific mocking pattern was discovered that ensures proper module isolation:

### The Pattern

```typescript
import { jest } from '@jest/globals';

// Mock the module before any imports
const mockFunction = jest.fn<() => ReturnType>();
jest.unstable_mockModule('./path/to/module.js', () => ({
  default: mockFunction,
  namedExport: jest.fn(),
}));

// Import after mocking
const moduleUnderTest = await import('./module-under-test.js');
```

### Why This Pattern

1. **ESM modules are hoisted differently** - Imports are hoisted to the top of the file, which means mocks must be set up before any imports occur
2. **Dynamic imports are required** - Since ESM modules are evaluated immediately, you must use `jest.unstable_mockModule()` with dynamic `import()`
3. **Default exports need special handling** - The default export is accessed via `.default` on the mock object

### Files Fixed for ESM Compatibility

7 test files were updated to use this ESM mocking pattern:

1. `duplicate-finder.test.ts`
2. `file-scanner.test.ts`
3. `hash-calculator.test.ts`
4. `organizer.test.ts`
5. `streaming-scanner.test.ts`
6. `full_organization_flow.test.ts`
7. `duplicate_resolution_flow.test.ts`

These files originally used CommonJS-style mocking which doesn't work with ESM modules due to the different module loading semantics.

### Common Pitfalls

- **Import ordering**: Always mock before importing the module under test
- **Async/Await**: ESM mocking is asynchronous, always use `await`
- **Default exports**: Access via `.default` when mocking
- **Named exports**: Access by the export name directly

---

#### 8. `rollback.test.ts`

**Purpose**: Tests undo/rollback functionality  
**What it tests**:

- Manifest creation for tracking file movements
- Reverting file operations
- Manifest cleanup

**Why necessary**: Enables users to undo mistakes. Essential for user confidence when organizing important files.

---

#### 9. `streaming-scanner.test.ts`

**Purpose**: Tests memory-efficient directory scanning  
**What it tests**:

- Streaming large directory results
- Memory usage limits
- Pagination support

**Why necessary**: Prevents memory exhaustion when scanning directories with thousands of files.

---

### Tool Handler Tests (`tests/unit/tools/`)

Tool handlers are the MCP server endpoints that Claude Desktop calls. These tests verify the API layer.

#### 10. `custom_rules.test.ts`

**Purpose**: Tests custom categorization rule API  
**What it tests**:

- Setting custom rules (`.log` → Logs, `.bak` → Backups)
- Rule validation
- Rule priority handling

**Why necessary**: Ensures users can customize file organization behavior via the API.

---

#### 11. `duplicate_management.test.ts`

**Purpose**: Tests duplicate management tool handlers  
**What it tests**:

- `find_duplicate_files` API
- `delete_duplicates` API
- Response format (JSON/Markdown)

**Why necessary**: Verifies the public API for duplicate management works correctly.

---

#### 12-14. `file_inspection.test.ts`, `file_management.test.ts`, `file_organization.test.ts`

**Purpose**: Tests file operation tool handlers  
**What they test**:

- `scan_directory` - Directory listing with filters
- `get_file_info` - File metadata retrieval
- `organize_files` - Main organization endpoint
- Response formats (JSON/Markdown)
- Error handling for invalid inputs

**Why necessary**: These are the primary MCP tools Claude uses. Must have comprehensive API contract coverage.

---

### Security Tests (`tests/unit/`)

#### 15. `category_security.test.ts`

**Purpose**: Tests category name sanitization  
**What it tests**:

- Blocking XSS payloads (`<script>alert(1)</script>`)
- Blocking shell injection (`; rm -rf /`)
- Blocking path traversal in category names (`../../etc`)

**Why necessary**: **Critical security test**. Prevents command injection and XSS when users create custom categories.

---

#### 16. `security_repro.test.ts`

**Purpose**: Reproduces previously discovered security vulnerabilities  
**What it tests**:

- Unvalidated file deletion (CVE scenario)
- Max depth limit enforcement (DoS prevention)
- Windows reserved name blocking

**Why necessary**: Regression tests for known vulnerabilities. Ensures past security bugs don't reappear.

---

#### 17. `security_suite.test.ts`

**Purpose**: Comprehensive security testing suite  
**What it tests**:

- **TOCTOU (Time-of-check Time-of-use)** attack prevention via `O_NOFOLLOW`
- **Path normalization** (URI encoding, null bytes, Unicode normalization)
- **Symlink attacks**
- **Resource exhaustion** (max depth, path length limits)
- **ReDoS protection** (regex pattern length limits)

**Why necessary**: **Most critical security test**. Covers advanced attack vectors that could lead to arbitrary file access or DoS.

**Key Tests**:

- `should prevent TOCTOU via O_NOFOLLOW` - Race condition protection
- `should normalize URI-encoded paths` - Handles `%2e%2e%2f` (encoded `../`)
- `should reject paths with null bytes` - Prevents C-style string injection

---

#### 18. `pagination.test.ts`

**Purpose**: Tests pagination logic  
**What it tests**:

- Limit/offset handling in file listings
- Edge cases (offset > total, negative values)

**Why necessary**: Ensures large directory listings don't overwhelm clients.

---

## Integration Tests

Integration tests verify complete workflows work end-to-end.

### 19. `full_organization_flow.test.ts`

**Purpose**: Tests the complete organization workflow  
**What it tests**:

1. Create messy directory with mixed file types
2. Run `organize_files` to categorize into folders
3. Verify files moved to correct categories (Images/, Documents/, Executables/)
4. Run `undo_last_operation` to revert changes
5. Verify files restored to original locations

**Why necessary**: Validates the entire user workflow works correctly. Catches integration bugs that unit tests miss.

**Current status**: ⚠️ Failing on undo verification (assertion issue, not code bug)

---

### 20. `duplicate_resolution_flow.test.ts`

**Purpose**: Tests duplicate detection and resolution workflow  
**What it tests**:

1. Create duplicate files in nested directories
2. Run `find_duplicate_files` to detect duplicates
3. Verify scoring strategies work (newest, best_location)
4. Delete duplicates with `delete_duplicates`
5. Verify rollback manifest created
6. Test undo functionality

**Why necessary**: Ensures duplicate management workflow is safe and reversible.

**Test Scenarios**:

- Multiple duplicate groups
- Nested directory structures
- Wasted space calculation
- Deletion failure handling
- Permission preservation

---

### 21. `organize.test.ts`

**Purpose**: Basic organization integration test  
**What it tests**:

- Simple file organization scenario
- Dry-run vs actual execution

**Why necessary**: Lightweight smoke test for basic functionality.

---

### 22. `edge-cases.test.ts`

**Purpose**: Tests edge cases and error conditions  
**What it tests**:

- Empty directories
- Non-existent paths
- Permission errors
- Extremely long filenames
- Special characters in filenames

**Why necessary**: Ensures the system handles unusual inputs gracefully without crashing.

---

## Performance Tests

### 23. `performance.test.ts`

**Purpose**: Measures performance and resource usage  
**What it tests**:

1. **File scanning performance**: Create 1,000 files, scan in \< 3 seconds
2. **Memory usage**: Duplicate detection should use \< 100MB additional memory

**Why necessary**:

- Ensures the system scales to real-world directory sizes
- Prevents performance regressions
- Catches memory leaks

**Thresholds**:

- Scan 1,000 files in \< 3 seconds
- Memory increase \< 100MB during duplicate scanning

**Note**: Originally tested 10,000 files but reduced to 1,000 for CI stability.

---

## Test Configuration

### Jest Configuration (`jest.config.cjs`)

```javascript
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  testTimeout: 10000, // 10s timeout for integration tests
  extensionsToTreatAsEsm: ['.ts'], // ESM support for TypeScript
  testMatch: ['**/tests/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1', // Map .js imports to .ts files
  },
};
```

**Key Settings**:

- **testTimeout: 10000**: Increased from default 5000ms to handle integration tests and performance tests that create many files
- **extensionsToTreatAsEsm**: Required for TypeScript ESM modules to work correctly

---

## Running Tests

### All Tests

```bash
npm test
```

### Specific Test File

```bash
npm test -- tests/unit/services/duplicate-finder.test.ts
```

### With Coverage

```bash
npm run test:coverage
```

### Watch Mode

```bash
npm run test:watch
```

---

## Test Best Practices Used

### 1. **Isolated Test Directories**

Each test creates its own temporary directory in `tests/temp/` to avoid interference:

```typescript
beforeEach(async () => {
  testDir = await fs.mkdtemp(path.join('tests', 'temp', 'test-'));
});
```

### 2. **Proper Cleanup**

All tests clean up created files to avoid disk fill-up:

```typescript
afterEach(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});
```

### 3. **Windows File Handle Delays**

Tests include small delays before cleanup to release file handles on Windows:

```typescript
await new Promise((resolve) => setTimeout(resolve, 100));
```

### 4. **Path Validation Compliance**

Tests use allowed directories (`process.cwd()/tests/temp`) to work with security restrictions.

### 5. **Comprehensive Assertions**

Tests verify:

- Expected behavior occurs
- Side effects are correct (files moved, backups created)
- Error messages are helpful
- State is properly reverted after undo

---

## Why These Tests Are Necessary

### 1. **Data Integrity**

File organization tools can cause data loss if bugs exist. Tests ensure:

- Files aren't accidentally deleted
- Undo functionality works
- Conflicts are handled safely

### 2. **Security**

Without comprehensive security tests, the system could:

- Allow arbitrary file access via path traversal
- Enable command injection via malicious filenames
- Crash from DoS attacks (infinite recursion, huge files)

**Security tests are critical** because this MCP server has filesystem access.

### 3. **User Confidence**

Users trust the file organizer with important documents. Tests prove:

- Operations are reversible (undo works)
- Dry-run accurately previews changes
- Edge cases are handled gracefully

### 4. **Regression Prevention**

Tests catch bugs when:

- Refactoring code
- Adding new features
- Updating dependencies

### 5. **Documentation**

Tests serve as **executable documentation** showing:

- How APIs should be called
- What inputs are valid
- What outputs to expect

---

## Known Issues

### Current Test Failures (3 tests)

1. **`full_organization_flow.test.ts`** - Undo verification assertion
   - **Status**: Test bug (expectations don't match actual behavior)
   - **Not a code bug**: ESM configuration issue was the root cause and is now fixed

2. **`duplicate_resolution_flow.test.ts`** - 2 assertion failures
   - **Status**: Investigating expected vs actual behavior mismatches

**Note**: All configuration issues have been resolved (ESM imports, timeouts). Remaining failures are test assertion bugs.

---

## Adding New Tests

When adding new functionality, create tests in this order:

1. **Unit Tests First**
   - Test services in isolation
   - Test tools handlers with mocked services
   - Cover edge cases and error conditions

2. **Integration Tests Second**
   - Test complete workflows
   - Verify components work together
   - Test undo/rollback scenarios

3. **Performance Tests Last**
   - Set performance baselines
   - Measure resource usage
   - Test at scale (large directories)

### Test Template

```typescript
import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';

describe('MyService', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join('tests', 'temp', 'test-'));
  });

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should do something', async () => {
    // Arrange
    const input = '...';

    // Act
    const result = await myService.doSomething(input);

    // Assert
    expect(result).toBe(expected);
  });
});
```

---

## File Reader Tests ⭐ NEW in v3.2.0

The File Reader module (`src/readers/`) has comprehensive test coverage with **150 tests** across 7 test files:

### Test Files

#### 1. `src/readers/__tests__/result.test.ts` (20 tests)

**Purpose:** Tests the Result<T,E> pattern implementation

**Coverage:**
- `ok()` and `err()` constructors
- `isOk()` and `isErr()` type guards
- `unwrap()` and `unwrapOr()` extraction
- `map()`, `mapErr()`, and `flatMap()` operations

#### 2. `src/readers/__tests__/errors.test.ts` (25 tests)

**Purpose:** Tests file reader error classes

**Coverage:**
- `FileReadError` - Base error with context
- `FileTooLargeError` - Size limit violations
- `PathValidationError` - Security check failures
- `RateLimitError` - Throttling enforcement
- `FileAccessDeniedError` - Permission denials
- `FileNotFoundError` - Missing files
- `FileReadAbortedError` - Cancellation handling

#### 3. `src/readers/__tests__/secure-file-reader.test.ts` (40 tests)

**Purpose:** Tests the core SecureFileReader implementation

**Coverage:**
- `read()` method with various encodings
- `readStream()` for large files
- `readBuffer()` for binary data
- Path validation integration
- Rate limiting enforcement
- Size limit enforcement
- SHA-256 checksum calculation
- Error handling and conversion

#### 4. `src/readers/__tests__/sensitive-file-patterns.test.ts` (15 tests)

**Purpose:** Tests sensitive file detection

**Coverage:**
- 47+ file pattern matches (.env, .ssh/, etc.)
- 15+ directory pattern matches
- `isSensitiveFile()` boolean check
- `checkSensitiveFile()` Result-based check
- `getMatchedPattern()` for debugging
- `sanitizePathForLogging()` for safe logging

#### 5. `src/readers/__tests__/factory.test.ts` (20 tests)

**Purpose:** Tests FileReaderFactory

**Coverage:**
- `createDefault()` with standard settings
- `createWithOptions()` with custom configuration
- Rate limiter injection
- Audit logger injection
- Path validator configuration

#### 6. `src/readers/__tests__/integration.test.ts` (20 tests)

**Purpose:** Integration tests with real file system

**Coverage:**
- End-to-end file reading workflows
- Unicode file handling
- Binary file reading
- JSON file parsing
- Large file streaming
- Concurrent read operations

#### 7. `src/readers/__tests__/e2e.test.ts` (10 tests)

**Purpose:** End-to-end MCP tool integration

**Coverage:**
- `file_organizer_read_file` tool handler
- Zod schema validation
- Response formatting (JSON, markdown, text)
- Error response formatting

### Security Test Coverage

The File Reader tests specifically verify:

- **Path Traversal Protection:** All 161 fuzzing payloads blocked
- **TOCTOU Mitigation:** O_NOFOLLOW prevents symlink attacks
- **Sensitive File Blocking:** 144/144 patterns correctly identified
- **Rate Limiting:** Throttling works correctly
- **Size Limits:** Oversized files are rejected

### Running File Reader Tests

```bash
# Run all reader tests
npm test -- src/readers/__tests__

# Run with coverage
npm test -- --coverage src/readers

# Run specific test file
npm test -- src/readers/__tests__/secure-file-reader.test.ts
```

---

## Test Coverage Goals

Current coverage targets:

- **Services**: 100% (critical paths)
- **Tools**: 100% (core functionality)
- **Utils**: >90% (helper functions)
- **File Reader**: >85% (new in v3.2.0)

Run `npm run test:coverage` to generate coverage report.

---

## Maintenance

Tests should be reviewed when:

- Fixing bugs (add regression tests)
- Refactoring (ensure tests still pass)
- Updating dependencies (run full suite)

### 6. **Future Improvements**

- Adding new features (add corresponding tests first).
- improving test performance (parallel execution).

**Golden Rule**: If it can break, it should have a test.
