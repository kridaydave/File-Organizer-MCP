# Architecture Documentation

## 🏗️ System Overview

File Organizer MCP is a security-hardened Model Context Protocol (MCP) server that provides intelligent file organization capabilities to Large Language Models (LLMs). The architecture follows a layered service pattern with comprehensive security validation at every level.

### Core Principles

1. **Security First** - Multi-layer validation and sanitization
2. **Service Isolation** - Clear separation of concerns
3. **Type Safety** - Strict TypeScript with Zod validation
4. **Testability** - Dependency injection and modular design
5. **Performance** - Streaming operations and resource limits

## 📐 Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                     MCP Client (LLM)                        │
└─────────────────────────┬───────────────────────────────────┘
                          │ JSON-RPC 2.0
┌─────────────────────────▼───────────────────────────────────┐
│                    MCP Server Layer                         │
│  (server.ts - Protocol Handler)                             │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                     Tools Layer                             │
│  ┌──────────┬──────────┬───────────┬─────────────┐         │
│  │ Scan     │ Organize │ Duplicate │ Categorize  │         │
│  │ Files    │ Files    │ Find      │ Files       │         │
│  └──────────┴──────────┴───────────┴─────────────┘         │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                   Services Layer                            │
│  ┌────────────┬──────────────┬─────────────┬──────────┐    │
│  │ Path       │ Organizer    │ Hash        │ Scanner  │    │
│  │ Validator  │ Service      │ Calculator  │ Service  │    │
│  └────────────┴──────────────┴─────────────┴──────────┘    │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    Utils Layer                              │
│  ┌──────────┬──────────┬───────────┬──────────┐            │
│  │ Logger   │ Error    │ File      │ Format-  │            │
│  │          │ Handler  │ Utils     │ ters     │            │
│  └──────────┴──────────┴───────────┴──────────┘            │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                   File System                               │
└─────────────────────────────────────────────────────────────┘
```

## 🔐 Security Architecture

### 8-Layer Path Validation Pipeline

Every file path goes through these validation layers:

```typescript
Input Path
    ↓
1. Type Validation (Zod Schema)
    ↓
2. Null Byte & Basic Sanitization
    ↓
3. Path Normalization & Windows Case Adjustment
    ↓
4. Traversal Sequence Prevention (../)
    ↓
5. Absolute Path Resolution
    ↓
6. Security Check (Whitelist & Blacklist)
    ↓
7. Symlink Resolution & Target Validation
    ↓
8. Existence & Access Check
    ↓
Validated Path ✅
```

**Implementation:** [`src/services/path-validator.service.ts`](file:///c:/Users/NewAdmin/Desktop/File-Organizer-MCP/src/services/path-validator.service.ts)

### Race Condition Mitigation (TOCTOU Protection) - v3.1.4 Updates

**Problem:** Time-of-Check-Time-of-Use vulnerabilities can occur when a file is checked, then used later, allowing an attacker to swap the file between operations.

**v3.1.4 TOCTOU Fixes and Race Condition Prevention:**

1. **File Descriptor Validation**
   - Open files with `O_NOFOLLOW` flag to prevent symlink attacks
   - Use file descriptors directly rather than path strings after initial validation
   - Release file handles immediately after use to minimize attack window

2. **Atomic File Operations**
   - Use `COPYFILE_EXCL` flag for atomic copy operations (fails if destination exists)
   - Use `O_EXCL` flag when creating files to prevent race conditions
   - Utilize `rename()` for atomic moves within the same filesystem

3. **Retry Logic with Jitter**
   - Implement exponential backoff with random jitter for retry operations
   - Maximum 3 retries with increasing delays (10ms, 50ms, 100ms)
   - Fail fast after retries to prevent denial-of-service

4. **Safe Overwrite Pattern**
   - Write to temporary file in target directory first
   - Sync file to disk before atomic rename
   - Move existing file to backup before replacing

   ```typescript
   // Safe overwrite with atomic rename
   const tempPath = path.join(targetDir, `.tmp_${Date.now()}_${basename}`);
   await fs.writeFile(tempPath, content);
   await fs.rename(tempPath, targetPath); // Atomic on same filesystem
   ```

5. **Verification After Operations**
   - Re-validate file stats after critical operations
   - Verify file hash matches expected value after write
   - Check file permissions haven't changed unexpectedly

**Limitations:**

- File deletion on Windows uses path-based locking (not file descriptor)
- Symlinks are blocked for security but may limit legitimate use cases

### Resource Protection

```typescript
// Security Constants
const SECURITY_LIMITS = {
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100 MB
  MAX_FILES: 10000, // Per operation
  MAX_DEPTH: 10, // Directory recursion
  MAX_PATH_LENGTH: 4096, // Characters
};
```

## 📦 Core Components

### 1. Server Layer (`server.ts`)

**Responsibility:** MCP protocol handling and tool registration

```typescript
// Key responsibilities:
- Initialize MCP server
- Register tools with schemas
- Handle tool invocations
- Manage error responses
- Coordinate with services
```

**Key Features:**

- Automatic tool discovery from `tools/` directory
- Structured response formatting (JSON/Markdown)
- Centralized error handling

### 2. Tools Layer (`tools/`)

**Responsibility:** MCP tool implementations (user-facing API)

Each tool follows this pattern:

```typescript
export const toolDefinition: ToolDefinition = {
  name: "tool_name",
  description: "What it does",
  inputSchema: ZodSchema, // Validation
};

export async function handleTool(args: ToolArgs): Promise<ToolResponse> {
  // 1. Validate inputs (Zod)
  // 2. Validate security (PathValidator)
  // 3. Call service layer
  // 4. Format response
  // 5. Handle errors
}
```

**Available Tools:**

1.  **List Files in Directory** (`file_organizer_list_files`)
2.  **Scan Directory for Detailed Info** (`file_organizer_scan_directory`)
3.  **Categorize Files by Type** (`file_organizer_categorize_files`)
4.  **Find Largest Files** (`file_organizer_find_largest_files`)
5.  **Find Duplicate Files** (`file_organizer_find_duplicate_files`)
6.  **Preview File Organization Plan** (`file_organizer_preview_organization`)
7.  **Get Available File Categories** (`file_organizer_get_categories`)
8.  **Analyze Duplicate Files with Smart Recommendations** (`file_organizer_analyze_duplicates`)
9.  **Organize Files** (`file_organizer_organize_files`)
10. **Set Custom Organization Rules** (`file_organizer_set_custom_rules`)
11. **Delete Duplicate Files** (`file_organizer_delete_duplicates`)
12. **Undo Last Organization Operation** (`file_organizer_undo_last_operation`)

### 3. Services Layer (`services/`)

**Responsibility:** Core business logic

**Service Versions:** All services v3.1.3 or v3.1.4

#### PathValidatorService (v3.1.3)

```typescript
class PathValidatorService {
  // Multi-layer path validation
  async validateStrictPath(
    inputPath: unknown,
    options?: ValidatePathOptions,
  ): Promise<string>;

  // Symlink resolution
  async resolvePath(path: string): Promise<string>;

  // Containment checking
  isPathWithinRoots(path: string, roots: string[]): boolean;
}
```

#### OrganizerService (v3.1.4)

```typescript
class OrganizerService {
  // Generate organization plan
  async generateOrganizationPlan(
    directory: string,
    files: FileWithSize[],
    strategy?: ConflictStrategy, // 'rename' | 'skip' | 'overwrite' | 'overwrite_if_newer'
  ): Promise<OrganizationPlan>;

  // Execute organization with safety guarantees
  async organize(
    directory: string,
    files: FileWithSize[],
    options?: OrganizeOptions,
  ): Promise<OrganizeResult>;

  // Safety mechanisms:
  // 1. File descriptor validation before move
  // 2. Atomic copy with COPYFILE_EXCL (race-safe)
  // 3. Automatic backup to .file-organizer-backups/ on overwrite
  // 4. Retry loop for race condition recovery
}
```

#### HashCalculatorService

```typescript
class HashCalculatorService {
  // Streaming hash calculation
  async calculateHash(filePath: string): Promise<string>;

  // Find duplicates (memory-safe)
  async findDuplicates(files: FileWithSize[]): Promise<DuplicateGroup[]>;
}
```

#### FileScannerService (v3.1.4)

```typescript
class FileScannerService {
  // Recursive directory scanning
  async getAllFiles(
    directory: string,
    options?: ScanOptions,
  ): Promise<FileWithSize[]>;

  // Size calculation
  async calculateDirectorySize(directory: string): Promise<number>;
}
```

#### CategorizerService

```typescript
class CategorizerService {
  // File categorization
  getCategory(fileName: string): CategoryName;

  // Custom rules support
  setCustomRules(rules: CategoryRule[]): void;

  // Category statistics
  categorizeFiles(files: FileWithSize[]): CategoryBreakdown;
}
```

#### RollbackService (v3.1.4)

```typescript
class RollbackService {
  // Create rollback manifest
  async createManifest(actions: OrganizeAction[]): Promise<string>;

  // Execute rollback
  async rollback(manifestId: string): Promise<RollbackResult>;

  // List available rollbacks
  async listRollbacks(): Promise<RollbackManifest[]>;
}
```

### 4. File Reader Module (`readers/`) ⭐ NEW in v3.2.0

**Responsibility:** Secure file reading with comprehensive security controls

**Architecture:** 3-layer security architecture with Result-based error handling

#### SecureFileReader

```typescript
class SecureFileReader {
  // Read file with full security validation
  async read(
    filePath: string,
    options?: Partial<FileReadOptions>,
  ): Promise<Result<FileReadResult, FileReadError>>;

  // Create readable stream for large files
  async readStream(
    filePath: string,
    options?: Partial<FileReadOptions>,
  ): Promise<Result<Readable, FileReadError>>;

  // Read raw buffer (binary data)
  async readBuffer(
    filePath: string,
    options?: Partial<FileReadOptions>,
  ): Promise<Result<Buffer, FileReadError>>;
}
```

**Security Layers:**

1. **Layer 1 - Input Validation:**
   - Path validation using PathValidatorService
   - Sensitive file pattern checking (47+ patterns)
   - Zod schema validation for inputs

2. **Layer 2 - Security Controls:**
   - Rate limiting (120 req/min, 2000 req/hour)
   - Audit logging (all operations logged)
   - Size limits (default 10MB, max 100MB)

3. **Layer 3 - Execution:**
   - TOCTOU-safe file opening with O_NOFOLLOW
   - SHA-256 checksum calculation
   - Streaming for large files (>100KB)

**Error Types:**

- `FileNotFoundError` - File doesn't exist
- `FileAccessDeniedError` - Permission denied or sensitive file
- `FileTooLargeError` - Exceeds size limit
- `PathValidationError` - Security check failed
- `RateLimitError` - Too many requests

#### FileReaderFactory

```typescript
class FileReaderFactory {
  // Create with default settings
  static createDefault(): SecureFileReader;

  // Create with custom options
  static createWithOptions(options: ReaderOptions): SecureFileReader;
}
```

**Integration:** The File Reader is exposed via the `file_organizer_read_file` MCP tool with Zod schema validation.

### 5. Utils Layer (`utils/`)

**Responsibility:** Shared utility functions

#### Logger

```typescript
class Logger {
  // Structured JSON logging to stderr (MCP stdio protocol)
  debug(message: string, context?: Record<string, any>): void;
  info(message: string, context?: Record<string, any>): void;
  warn(message: string, context?: Record<string, any>): void;
  error(message: string, error?: Error, context?: Record<string, any>): void;

  // Features:
  // - ISO 8601 timestamps
  // - Configurable log levels (debug/info/warn/error)
  // - Error stack traces for error logs
  // - JSON format for machine parsing
}
```

- **error-handler.ts** - Centralized error handling
- **file-utils.ts** - File system helpers
- **formatters.ts** - Data formatting (bytes, dates, etc.)

### 5. Schemas Layer (`schemas/`)

**Responsibility:** Input validation using Zod

```typescript
// Example: Path validation
export const PathSchema = z
  .string()
  .min(1, "Path cannot be empty")
  .max(4096, "Path exceeds maximum length")
  .refine((path) => !path.includes("\0"), "Path contains null bytes");
```

## 🔄 Data Flow

### Example: Organize Files Operation

```
1. LLM Request
   ↓
2. MCP Server (server.ts)
   - Parse JSON-RPC request
   - Route to organize tool
   ↓
3. Tool Handler (tools/file-organization.ts)
   - Validate args with Zod
   - Call PathValidatorService
   ↓
4. PathValidatorService
   - 7-layer validation
   - Return validated path
   ↓
5. FileScannerService
   - Scan directory
   - Apply resource limits
   ↓
6. CategorizerService
   - Categorize each file
   ↓
7. OrganizerService
   - Generate organization plan
   - Check conflicts
   - Execute moves (if not dry run)
   ↓
8. RollbackService
   - Create rollback manifest
   ↓
9. Tool Handler
   - Format response (JSON/Markdown)
   ↓
10. MCP Server
    - Send JSON-RPC response
    ↓
11. LLM receives result
```

## 💾 File Organization

### Source Structure

```
src/
├── server.ts                 # MCP server entry point
├── index.ts                  # Main entry point
├── types.ts                  # TypeScript type definitions
├── constants.ts              # Application constants
├── config.ts                 # Configuration management
│
├── services/                 # Core business logic
│   ├── path-validator.service.ts
│   ├── organizer.service.ts
│   ├── hash-calculator.service.ts
│   ├── file-scanner.service.ts
│   ├── categorizer.service.ts
│   └── rollback.service.ts
│
├── tools/                    # MCP tool implementations
│   ├── file-scanning.ts
│   ├── file-organization.ts
│   ├── file-duplicates.ts
│   ├── file-categorization.ts
│   └── ...
│
├── schemas/                  # Zod validation schemas
│   ├── security.schemas.ts
│   ├── common.schemas.ts
│   ├── scan.schemas.ts
│   └── organize.schemas.ts
│
└── utils/                    # Shared utilities
    ├── logger.ts
    ├── error-handler.ts
    ├── file-utils.ts
    └── formatters.ts
```

## 🧪 Testing Architecture

### Test Structure

```
tests/
├── unit/                     # Unit tests for services
│   ├── services/
│   │   ├── path-validator.test.ts
│   │   ├── organizer.test.ts
│   │   └── ...
│   └── utils/
│
├── integration/              # Integration tests for tools
│   ├── tools/
│   │   └── organize.test.ts
│   └── edge-cases.test.ts
│
└── performance/              # Performance benchmarks
    └── performance.test.ts
```

### Test Philosophy

1. **Unit Tests** - Test services in isolation
2. **Integration Tests** - Test complete workflows
3. **Security Tests** - Validate all security controls
4. **Performance Tests** - Ensure scalability

## 🚀 Performance Considerations

### Streaming Operations

Large files are processed using streams to avoid memory exhaustion:

```typescript
// Hash calculation uses streams
const hash = crypto.createHash("sha256");
const stream = createReadStream(filePath, { highWaterMark: 64 * 1024 });
stream.on("data", (chunk) => hash.update(chunk));
```

### Resource Limits

```typescript
// Enforced at multiple levels:
- File size: Skip files > 100MB for hashing
- File count: Max 10,000 files per operation
- Recursion depth: Max 10 levels
- Path length: Max 4,096 characters
```

### Caching Strategy

- Category mappings cached in-memory
- File stats cached during single operation
- No persistent caching (stateless design)

## 🔧 Configuration

### Configuration System (`config.ts`)

The server uses a platform-aware configuration system that combines hardcoded defaults with user customization.

**Structure:**

```typescript
export const CONFIG = {
  VERSION: "3.4.1",

  security: {
    enablePathValidation: true,
    allowCustomDirectories: true,
    logAccess: true,
    maxScanDepth: 10,
    maxFilesPerOperation: 10000,
  },

  paths: {
    defaultAllowed: getDefaultAllowedDirs(), // Platform-aware safe directories
    customAllowed: loadCustomAllowedDirs(), // User-defined from config.json
    alwaysBlocked: getAlwaysBlockedPatterns(), // System protection patterns
  },
};
```

**Default Allowed Directories:**

- **Windows:** Desktop, Documents, Downloads, Pictures, Videos, Music, OneDrive, Projects
- **macOS:** Desktop, Documents, Downloads, Movies, Music, Pictures, iCloud Drive, Projects
- **Linux:** Desktop, Documents, Downloads, Music, Pictures, Videos, ~/dev, ~/workspace

**User Configuration:**

- **Windows:** `%APPDATA%\file-organizer-mcp\config.json`
- **macOS:** `~/Library/Application Support/file-organizer-mcp/config.json`
- **Linux:** `~/.config/file-organizer-mcp/config.json`

**Config File Format:**

```json
{
  "customAllowedDirectories": ["C:\\Users\\Name\\CustomFolder", "D:\\Projects"],
  "settings": {
    "maxScanDepth": 10,
    "logAccess": true
  }
}
```

## 🎯 Design Patterns

### Dependency Injection

```typescript
// Services receive dependencies via constructor
class OrganizerService {
  constructor(
    private categorizer: CategorizerService,
    private rollback?: RollbackService,
  ) {}
}
```

### Error Handling

```typescript
// Centralized error handling
try {
  const result = await operation();
} catch (error) {
  return createErrorResponse(error);
}
```

### Type Safety

```typescript
// Strict types with Zod runtime validation
const ArgsSchema = z.object({
  directory: PathSchema,
  dry_run: z.boolean().optional(),
});

type Args = z.infer<typeof ArgsSchema>;
```

## 📊 Monitoring & Logging

### Structured Logging

```json
{
  "timestamp": "2026-02-08T00:00:00.000Z",
  "level": "info",
  "message": "Created rollback manifest: uuid (6 actions)"
}
```

### Log Levels

- `error` - Critical failures
- `warn` - Recoverable issues (e.g., skipped files)
- `info` - Operation milestones
- `debug` - Detailed diagnostics

## 🔮 Future Architecture Changes

### Planned Improvements

1. **Plugin System** - Allow custom categorization rules
2. **Database Layer** - Persistent state for large operations
3. **Queue System** - Background processing for large directories
4. **Metrics Collection** - Performance monitoring
5. **Multi-language Support** - i18n infrastructure

## 📚 References

- [Model Context Protocol Spec](https://modelcontextprotocol.io)
- [Zod Documentation](https://zod.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs)

---

**Last Updated:** February 8, 2026  
**Version:** 3.4.1
