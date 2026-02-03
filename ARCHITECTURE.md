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

### Race Condition Mitigation (TOCTOU Protection)

**Problem:** Time-of-Check-Time-of-Use vulnerabilities can occur when a file is checked, then used later, allowing an attacker to swap the file between operations.

**Solution:** Multi-layered approach:

```typescript
// Layer 1: File Descriptor Validation
// Open file with O_NOFOLLOW to prevent symlink following
const handle = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW);

// Layer 2: Atomic Copy Operations
// Use COPYFILE_EXCL to ensure destination doesn't exist
await fs.copyFile(source, dest, constants.COPYFILE_EXCL);

// Layer 3: Safe Overwrites
// Move existing file to backup before replacing
const backupPath = path.join('.file-organizer-backups', `${Date.now()}_overwrite_${basename}`);
await fs.rename(existingFile, backupPath);
```

**Limitations:**
- File deletion on Windows uses path-based locking (not file descriptor)
- Symlinks are blocked for security but may limit legitimate use cases

### Resource Protection

```typescript
// Security Constants
const SECURITY_LIMITS = {
    MAX_FILE_SIZE: 100 * 1024 * 1024,  // 100 MB
    MAX_FILES: 10000,                   // Per operation
    MAX_DEPTH: 10,                      // Directory recursion
    MAX_PATH_LENGTH: 4096               // Characters
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
    name: 'tool_name',
    description: 'What it does',
    inputSchema: ZodSchema  // Validation
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
- `scan_directory` - Directory analysis
- `organize_files` - File organization
- `find_duplicate_files` - Duplicate detection
- `categorize_by_type` - Category breakdown
- `find_largest_files` - Space analysis
- `list_files` - Basic file listing

### 3. Services Layer (`services/`)

**Responsibility:** Core business logic

#### PathValidatorService
```typescript
class PathValidatorService {
    // Multi-layer path validation
    async validateStrictPath(inputPath: unknown, options?: ValidatePathOptions): Promise<string>
    
    // Symlink resolution
    async resolvePath(path: string): Promise<string>
    
    // Containment checking
    isPathWithinRoots(path: string, roots: string[]): boolean
}
```

#### OrganizerService
```typescript
class OrganizerService {
    // Generate organization plan
    async generateOrganizationPlan(
        directory: string,
        files: FileWithSize[],
        strategy?: ConflictStrategy  // 'rename' | 'skip' | 'overwrite' | 'overwrite_if_newer'
    ): Promise<OrganizationPlan>
    
    // Execute organization with safety guarantees
    async organize(
        directory: string,
        files: FileWithSize[],
        options?: OrganizeOptions
    ): Promise<OrganizeResult>
    
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
    async calculateHash(filePath: string): Promise<string>
    
    // Find duplicates (memory-safe)
    async findDuplicates(files: FileWithSize[]): Promise<DuplicateGroup[]>
}
```

#### FileScannerService
```typescript
class FileScannerService {
    // Recursive directory scanning
    async getAllFiles(
        directory: string,
        options?: ScanOptions
    ): Promise<FileWithSize[]>
    
    // Size calculation
    async calculateDirectorySize(directory: string): Promise<number>
}
```

#### CategorizerService
```typescript
class CategorizerService {
    // File categorization
    getCategory(fileName: string): CategoryName
    
    // Custom rules support
    setCustomRules(rules: CategoryRule[]): void
    
    // Category statistics
    categorizeFiles(files: FileWithSize[]): CategoryBreakdown
}
```

#### RollbackService
```typescript
class RollbackService {
    // Create rollback manifest
    async createManifest(actions: OrganizeAction[]): Promise<string>
    
    // Execute rollback
    async rollback(manifestId: string): Promise<RollbackResult>
    
    // List available rollbacks
    async listRollbacks(): Promise<RollbackManifest[]>
}
```

### 4. Utils Layer (`utils/`)

**Responsibility:** Shared utility functions

- **logger.ts** - Structured logging (JSON format for stdio)
- **error-handler.ts** - Centralized error handling
- **file-utils.ts** - File system helpers
- **formatters.ts** - Data formatting (bytes, dates, etc.)

### 5. Schemas Layer (`schemas/`)

**Responsibility:** Input validation using Zod

```typescript
// Example: Path validation
export const PathSchema = z.string()
    .min(1, 'Path cannot be empty')
    .max(4096, 'Path exceeds maximum length')
    .refine(
        (path) => !path.includes('\0'),
        'Path contains null bytes'
    );
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
const hash = crypto.createHash('sha256');
const stream = createReadStream(filePath, { highWaterMark: 64 * 1024 });
stream.on('data', (chunk) => hash.update(chunk));
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

### Environment-Based Configuration

```typescript
// config.ts
export const config = {
    security: {
        // Defaults (overridden by config.json)
        enablePathValidation: true,
        maxFileSize: 100 * 1024 * 1024,
        maxFiles: 10000,
        maxDepth: 10
    },
    paths: {
        // Loaded from OS defaults + config.json
        defaultAllowed: [...],
        customAllowed: [...]
    }
};
```

## 🎯 Design Patterns

### Dependency Injection

```typescript
// Services receive dependencies via constructor
class OrganizerService {
    constructor(
        private categorizer: CategorizerService,
        private rollback?: RollbackService
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
    dry_run: z.boolean().optional()
});

type Args = z.infer<typeof ArgsSchema>;
```

## 📊 Monitoring & Logging

### Structured Logging

```json
{
    "timestamp": "2026-02-02T14:09:04.413Z",
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

**Last Updated:** February 2, 2026  
**Version:** 3.0.0
