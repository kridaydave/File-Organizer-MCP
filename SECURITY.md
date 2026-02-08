# Security Policy

## Reporting Vulnerabilities

We take the security of File-Organizer-MCP seriously. If you discover a security vulnerability, please report it responsibly by following these guidelines:

### How to Report

1. **Do not** disclose the vulnerability publicly or create a public GitHub issue
2. **Do not** attempt to exploit the vulnerability beyond what is necessary to confirm it exists
3. **Do not** access, modify, or delete data that does not belong to you

### Responsible Disclosure Process

1. Email your findings to the security team with a detailed description
2. Include steps to reproduce the vulnerability
3. Provide any relevant code samples or payloads
4. Describe the potential impact and suggested fix if possible

### Response Timeline

- Initial acknowledgment: 24-48 hours
- Vulnerability assessment: 3-5 business days
- Resolution and patch deployment: Varies by severity

---

## 8-Layer Path Validation

File-Organizer-MCP implements a comprehensive **8-Layer Path Validation** pipeline to ensure secure file operations. This is a non-negotiable security requirement for all path-handling operations.

Reference: [AGENTS.md - 8-Layer Path Validation](mestuff/AGENTS.md#-8-layer-path-validation-non-negotiable)

### Validation Layers

| Layer                      | Purpose                               | Implementation                                       |
| -------------------------- | ------------------------------------- | ---------------------------------------------------- |
| **1. Zod Schema**          | Type and format validation            | Validate path structure against defined Zod schemas  |
| **2. Env Expansion**       | Resolve environment variables         | Expand variables like `$HOME`, `%APPDATA%`           |
| **3. Sanitization**        | Remove dangerous sequences            | Block `../`, null bytes, and invalid characters      |
| **4. Absolute Resolution** | Convert to absolute paths             | Use `path.resolve()` with base directory enforcement |
| **5. Security Check**      | Whitelist/blacklist validation        | Compare resolved paths against access control lists  |
| **6. Symlink Safety**      | Follow or block symlinks              | Use `O_NOFOLLOW` flag where applicable               |
| **7. Containment**         | Verify path stays within allowed root | Ensure path prefix matches permitted directories     |
| **8. Permissions**         | OS-level access verification          | Final read/write/execute permission check            |

### Code Reference

All path validation is centralized in `src/services/PathValidatorService.ts` and must be used for every file system operation.

---

## Recent Security Fixes

### 57 Bugs Fixed in Recent Security Hardening

The following security issues were identified and resolved through comprehensive security auditing:

#### Path Traversal Vulnerabilities (15 fixes)

- Fixed improper handling of `../` sequences in path construction
- Resolved null byte injection possibilities in file names
- Fixed Windows-specific path traversal with backslash manipulation
- Addressed double-encoding vulnerabilities in URL-encoded paths
- Fixed Unicode normalization bypass techniques
- Resolved case-sensitivity bypass on case-insensitive filesystems
- Fixed path truncation exploitation
- Addressed symlink path traversal via relative symlinks
- Fixed NTFS alternate data stream exploitation paths
- Resolved device path access (COM1, LPT1, etc.)
- Fixed environment variable injection in paths
- Addressed home directory expansion bypasses
- Fixed temporary file creation vulnerabilities
- Resolved race condition in path validation
- Fixed canonicalization inconsistencies

#### TOCTOU Vulnerabilities (12 fixes)

- Fixed file existence check followed by file operation race
- Resolved directory creation race conditions
- Fixed symlink target race between check and use
- Addressed permission check race conditions
- Fixed file attribute read race with modification
- Resolved hash calculation race conditions
- Fixed metadata read race with file deletion
- Addressed file move operations across filesystems
- Fixed backup creation race conditions
- Resolved configuration load race conditions
- Fixed watch directory event handling races
- Addressed rollback manifest update races

#### Symlink Vulnerabilities (10 fixes)

- Fixed arbitrary symlink creation for privilege escalation
- Resolved symlink overwriting attacks
- Fixed symlink pointing outside intended directory
- Addressed symlink loops and denial of service
- Fixed symlink permission manipulation
- Resolved symlink ownership attacks
- Fixed hard link creation vulnerabilities
- Addressed junction point exploitation on Windows
- Fixed reparse point manipulation
- Resolved symlink with reserved names (CON, AUX, etc.)

#### Windows-Specific Fixes (8 fixes)

- Fixed Windows reserved name protection (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
- Resolved Windows path case sensitivity issues
- Fixed long path prefix (`\\?\`) handling
- Addressed Windows short name (8.3) exploitation
- Fixed Windows junction point vulnerabilities
- Resolved NTFS permission inheritance issues
- Fixed Windows-specific character encoding issues
- Addressed Windows temporary file naming conflicts

#### Input Validation Fixes (8 fixes)

- Fixed JSON injection in configuration files
- Resolved YAML parsing vulnerabilities
- Fixed template injection in file naming patterns
- Addressed command injection via file extensions
- Fixed regex denial of service (ReDoS) in validators
- Resolved prototype pollution in configuration merging
- Fixed type coercion vulnerabilities
- Addressed unsafe deserialization in file metadata

#### Miscellaneous Fixes (4 fixes)

- Fixed information disclosure in error messages
- Resolved log injection vulnerabilities
- Fixed temporary file cleanup issues
- Addressed permission elevation through configuration

### Security Test Coverage

All 57 bugs now have corresponding security tests:

- **5/5 Critical Security Tests Passing**
- **100+ Security Assertions in Test Suite**
- **Cross-Platform Validation** (Windows, macOS, Linux)

---

## TOCTOU Prevention

TOCTOU (Time-of-Check-Time-of-Use) vulnerabilities occur when there's a race condition between checking a condition and using the result.

### Vulnerable Pattern (BEFORE)

```typescript
// ❌ VULNERABLE: Race condition between check and use
const exists = await fileExists(path);
if (exists) {
  await renameFile(path, newPath); // File could be deleted/modified between check and use
}
```

### Secure Pattern (AFTER)

```typescript
// ✅ SECURE: Atomic operations without race conditions
await renameFileAtomic(path, newPath); // Uses file descriptors directly
```

### TOCTOU Mitigation Strategies

1. **Use File Descriptors**: Work with open file handles instead of paths
2. **Atomic Operations**: Use `rename()`, `copyFile()` with `COPYFILE_EXCL`
3. **Directory Locking**: Implement file-level locking for critical operations
4. **Retry Logic**: Detect and retry operations that fail due to race conditions
5. **Immediate Verification**: Verify results immediately after operations

### Implementation Details

- All file operations use `fs/promises` with file descriptors
- `rename()` provides atomic move operations
- `copyFile()` with `COPYFILE_EXCL` prevents overwrites
- `lstat()` is used before operations to verify file state
- Backup manifests track all operations for rollback

---

## Symlink Safety

Symlinks can be exploited to access files outside the intended directory or cause denial of service.

### Vulnerable Pattern (BEFORE)

```typescript
// ❌ VULNERABLE: Follows symlinks to any location
const files = await readdir(rootDir);
for (const file of files) {
  const stats = await stat(path.join(rootDir, file)); // Follows symlinks!
}
```

### Secure Pattern (AFTER)

```typescript
// ✅ SECURE: Uses lstat() to detect symlinks before following
const files = await readdir(rootDir);
for (const file of files) {
  const fullPath = path.join(rootDir, file);
  const lstats = await lstat(fullPath); // Does NOT follow symlinks
  if (lstats.isSymbolicLink()) {
    // Handle symlink safely - either block or resolve within bounds
    continue;
  }
}
```

### Symlink Safety Rules

1. **Always Use `lstat()` First**: Detect symlinks before operations
2. **Explicit `O_NOFOLLOW`**: Use `access()` with `F_OK` instead of `stat()`
3. **Block External Symlinks**: Only allow symlinks within the permitted directory
4. **Prevent Symlink Creation**: Do not create symlinks during organization
5. **Log Symlink Detection**: Report symlinks found during scanning

### Configuration Options

```typescript
// In config.ts
interface SecurityConfig {
  symlinkHandling: 'block' | 'follow-safe' | 'ignore';
  maxSymlinkDepth: number;
  allowSymlinksWithinRoot: boolean;
}
```

---

## Windows Reserved Names Protection

Windows has several reserved device names that cannot be used as filenames and can cause security issues.

### Reserved Names List

- `CON` - Console
- `PRN` - Printer
- `AUX` - Auxiliary device
- `NUL` - Null device
- `COM1` through `COM9` - Serial ports
- `LPT1` through `LPT9` - Parallel ports
- `COM0`, `LPT0` (legacy)

Any of these names with any extension (e.g., `CON.txt`, `NUL.exe`) are problematic.

### Vulnerable Pattern (BEFORE)

```typescript
// ❌ VULNERABLE: No reserved name checking
const filePath = path.join(targetDir, fileName);
await renameFile(originalPath, filePath); // Could create CON device file
```

### Secure Pattern (AFTER)

```typescript
// ✅ SECURE: Validates against reserved names
const filePath = path.join(targetDir, fileName);
if (isWindowsReservedName(fileName)) {
  throw new ValidationError(`Windows reserved name: ${fileName}`);
}
await renameFile(originalPath, filePath);
```

### Implementation

```typescript
const WINDOWS_RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

export function isWindowsReservedName(name: string): boolean {
  const baseName = name.split('.')[0].toUpperCase();
  return WINDOWS_RESERVED_NAMES.has(baseName);
}
```

---

## Path Traversal Prevention

Path traversal attacks use `../` sequences to access files outside the intended directory.

### Vulnerable Pattern (BEFORE)

```typescript
// ❌ VULNERABLE: Allows path traversal
const fileName = req.body.filename; // e.g., "../../../etc/passwd"
const filePath = path.join(userDir, fileName);
await readFile(filePath); // Reads /etc/passwd!
```

### Secure Pattern (AFTER)

```typescript
// ✅ SECURE: Comprehensive path traversal prevention
const fileName = sanitizeFilename(req.body.filename);
const userDir = await resolveSecurePath(userDir); // Resolves to absolute, canonical
const filePath = path.join(userDir, fileName);
const canonicalPath = await resolveSecurePath(filePath); // Canonicalizes

// Verify containment
if (!canonicalPath.startsWith(userDir)) {
  throw new AccessDeniedError('Path traversal detected');
}
await readFile(filePath);
```

### Defense Layers

1. **Input Sanitization**: Remove `../`, `..\`, and null bytes
2. **Canonicalization**: Use `path.resolve()` and `path.normalize()`
3. **Absolute Path Enforcement**: Reject relative paths
4. **Root Containment**: Verify final path starts with allowed root
5. **Symlink Resolution**: Resolve symlinks before containment check

### Path Canonicalization Algorithm

```typescript
async function resolveSecurePath(inputPath: string, rootDir: string): Promise<string> {
  // Layer 1: Sanitize input
  const sanitized = sanitizePath(inputPath);

  // Layer 2: Expand environment variables
  const expanded = expandEnvVars(sanitized);

  // Layer 3: Resolve to absolute path
  const absolute = path.isAbsolute(expanded) ? expanded : path.join(rootDir, expanded);

  // Layer 4: Normalize (removes .. and .)
  const normalized = path.normalize(absolute);

  // Layer 5: Resolve symlinks
  const resolved = await resolveSymlinks(normalized);

  // Layer 6: Verify containment
  if (!resolved.startsWith(rootDir)) {
    throw new AccessDeniedError('Path escapes root directory');
  }

  return resolved;
}
```

---

## Best Practices for Contributors

### Security Requirements for All Code Changes

#### 1. Path Handling

- **ALWAYS** use `PathValidatorService` for any path operations
- **NEVER** construct paths using string concatenation with user input
- **ALWAYS** validate and sanitize any path from external sources
- **ALWAYS** check containment after canonicalization

#### 2. File Operations

- **ALWAYS** use `lstat()` instead of `stat()` when you need to detect symlinks
- **ALWAYS** use atomic operations (`rename()`, `copyFile()`)
- **NEVER** use `readdir()` followed by individual `stat()` calls without validation
- **ALWAYS** use file descriptors when possible

#### 3. Error Handling

- **NEVER** expose full paths in error messages to users
- **ALWAYS** sanitize paths in error logs
- **NEVER** include sensitive information in error responses
- **ALWAYS** use custom error classes (`ValidationError`, `AccessDeniedError`)

#### 4. Configuration

- **NEVER** allow user configuration to specify absolute paths outside whitelist
- **ALWAYS** validate configuration files against schemas
- **NEVER** include sensitive data in default configurations
- **ALWAYS** use secure defaults (block symlinks, strict path validation)

#### 5. Testing

- **ALWAYS** write security tests for new file operation features
- **INCLUDE** path traversal test cases for any path-handling code
- **TEST** edge cases: empty paths, very long paths, special characters
- **TEST** Windows-specific scenarios on Windows systems

### Security Review Checklist

Before submitting any PR, ensure:

- [ ] All new paths use `PathValidatorService`
- [ ] No use of `stat()` without corresponding `lstat()` for symlink detection
- [ ] All user inputs are validated against Zod schemas
- [ ] Error messages are sanitized (no full paths exposed)
- [ ] Security tests are added for new functionality
- [ ] Documentation is updated for security changes
- [ ] No hardcoded paths or secrets
- [ ] Dependencies are updated and audited (`npm audit`)

### Running Security Tests

```bash
# Run security-specific tests
npm run test:security

# Run all tests including security assertions
npm test

# Check for known vulnerabilities in dependencies
npm audit

# Check for outdated dependencies
npm outdated
```

---

## Additional Resources

- [AGENTS.md](mestuff/AGENTS.md) - Agent orchestration and security guardrails
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture documentation
- [TESTS.md](TESTS.md) - Test documentation including security tests
- [src/services/PathValidatorService.ts](src/services/PathValidatorService.ts) - Path validation implementation
- [src/utils/file-utils.ts](src/utils/file-utils.ts) - File security utilities

---

## Version History

| Version      | Date       | Security Changes                                         |
| ------------ | ---------- | -------------------------------------------------------- |
| 3.1.4        | 2026-02-07 | Code linting cleanup, security audit fixes               |
| 3.0.0        | 2026-02-02 | Complete TypeScript rewrite with 8-layer path validation |
| 3.0.0-beta.1 | 2026-02-02 | Initial security hardening (57 bugs fixed)               |

---

**Last Updated**: 2026-02-08
**Maintained By**: Security Team
