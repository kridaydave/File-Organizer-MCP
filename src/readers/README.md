# File Reader Module

The File Reader module provides secure, performant file reading capabilities with comprehensive security controls and audit logging.

## Architecture Overview

The module follows a **3-Layer Security Architecture**:

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Business Logic & Execution                        │
│  - SecureFileReader: Main implementation                    │
│  - FileReaderFactory: Dependency injection                  │
│  - Result<T,E>: Functional error handling                   │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Security & Resource Controls                      │
│  - RateLimiter: Operation throttling                        │
│  - AuditLogger: Comprehensive logging                       │
│  - SensitiveFilePatterns: Block dangerous files             │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Input Validation & Sanitization                   │
│  - PathValidatorService: 8-layer path validation            │
│  - Zod schemas: Runtime type checking                       │
│  - Sanitization: Remove dangerous characters                │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Basic Usage

```typescript
import { FileReaderFactory } from "./readers/factory.js";

// Create reader with defaults
const reader = FileReaderFactory.createDefault();

// Read a file
const result = await reader.read("/path/to/file.txt");

if (result.ok) {
  console.log(result.value.data); // File content
  console.log(result.value.metadata.size); // File size
  console.log(result.value.metadata.checksum); // SHA-256 hash
} else {
  console.error("Error:", result.error.message);
}
```

### Custom Configuration

```typescript
import { FileReaderFactory } from "./readers/factory.js";

const reader = FileReaderFactory.createWithOptions({
  maxReadSize: 5 * 1024 * 1024, // 5MB max
  maxRequestsPerMinute: 60,
  maxRequestsPerHour: 1000,
  basePath: "/allowed/directory",
  allowedPaths: ["/home/user/docs", "/tmp"],
});
```

### Reading Binary Files

```typescript
// Read as Buffer (raw bytes)
const result = await reader.readBuffer("/path/to/image.png");

if (result.ok) {
  const buffer: Buffer = result.value;
  // Process binary data
}
```

### Streaming Large Files

```typescript
import { isOk } from "./readers/result.js";

const result = await reader.readStream("/path/to/large-file.zip");

if (isOk(result)) {
  const stream = result.value;

  for await (const chunk of stream) {
    // Process chunk (backpressure handled automatically)
  }
}
```

### Partial Reads

```typescript
// Read first 1KB of a file
const result = await reader.read("/path/to/file.log", {
  maxBytes: 1024,
  offset: 0,
});

// Read last 1KB of a file
const fs = await import("fs/promises");
const stats = await fs.stat("/path/to/file.log");
const result = await reader.read("/path/to/file.log", {
  maxBytes: 1024,
  offset: Math.max(0, stats.size - 1024),
});
```

## Configuration Options

### ReaderOptions

| Option                 | Type           | Default         | Description                      |
| ---------------------- | -------------- | --------------- | -------------------------------- |
| `maxReadSize`          | `number`       | `10MB`          | Maximum bytes to read per file   |
| `maxRequestsPerMinute` | `number`       | `60`            | Rate limit per minute            |
| `maxRequestsPerHour`   | `number`       | `500`           | Rate limit per hour              |
| `basePath`             | `string`       | `process.cwd()` | Base path for relative paths     |
| `allowedPaths`         | `string[]`     | `undefined`     | Whitelist of allowed directories |
| `auditLogger`          | `IAuditLogger` | Console logger  | Custom audit logger              |
| `rateLimiter`          | `RateLimiter`  | Auto-created    | Custom rate limiter              |

### FileReadOptions

| Option     | Type                     | Default   | Description                     |
| ---------- | ------------------------ | --------- | ------------------------------- |
| `encoding` | `BufferEncoding \| null` | `'utf-8'` | Text encoding (null for binary) |
| `maxBytes` | `number`                 | `10MB`    | Maximum bytes to read           |
| `offset`   | `number`                 | `0`       | Byte offset to start reading    |
| `signal`   | `AbortSignal`            | `null`    | Abort controller signal         |

## Security Features

### 8-Layer Path Validation

All paths go through comprehensive validation:

1. **Zod Schema** - Type and format validation
2. **Env Expansion** - Resolve `$HOME`, `%APPDATA%`
3. **Sanitization** - Remove `../`, null bytes
4. **Absolute Resolution** - Convert to absolute paths
5. **Security Check** - Whitelist/blacklist validation
6. **Symlink Safety** - Block symlink attacks with `O_NOFOLLOW`
7. **Containment** - Verify path stays within allowed root
8. **Permissions** - OS-level access verification

### Sensitive File Blocking

The following file types are automatically blocked:

```typescript
// Environment files
.env, .env.local, .env.development

// SSH keys
.ssh/, id_rsa, id_ed25519, .pem, .key

// AWS credentials
.aws/, aws/credentials

// System files
shadow, passwd, master.passwd

// Generic secrets
password, secret, token, credential, api_key
```

### Rate Limiting

Default limits:

- 120 requests per minute
- 2000 requests per hour

Configurable via factory options.

### Audit Logging

Every operation is logged:

```typescript
{
  timestamp: "2026-02-09T12:00:00.000Z",
  operation: "FILE_READ",
  path: "/home/user/file.txt",
  result: "SUCCESS",
  bytesRead: 1024,
  checksum: "a3f5c2...",
  durationMs: 15
}
```

## Error Handling

The module uses a Result pattern for explicit error handling:

```typescript
import { isOk, isErr } from "./readers/result.js";

const result = await reader.read("/path/to/file.txt");

// Check success
if (isOk(result)) {
  console.log(result.value.data);
}

// Check error
if (isErr(result)) {
  console.error(result.error.code); // Error code
  console.error(result.error.message); // Human-readable message
  console.error(result.error.suggestion); // Recovery suggestion
}
```

### Error Types

| Error                   | Code                     | Description           |
| ----------------------- | ------------------------ | --------------------- |
| `FileNotFoundError`     | `FILE_NOT_FOUND`         | File does not exist   |
| `FileAccessDeniedError` | `FILE_ACCESS_DENIED`     | Permission denied     |
| `FileTooLargeError`     | `FILE_TOO_LARGE`         | Exceeds maxBytes      |
| `PathValidationError`   | `PATH_VALIDATION_FAILED` | Security check failed |
| `RateLimitError`        | `RATE_LIMIT_EXCEEDED`    | Too many requests     |
| `FileReadAbortedError`  | `FILE_READ_ABORTED`      | Operation cancelled   |
| `InvalidEncodingError`  | `INVALID_ENCODING`       | Unsupported encoding  |

## Performance Features

### Streaming

Files over 100KB are automatically streamed to prevent memory pressure:

```typescript
// Small file: read into memory
const result = await reader.read("/small.txt"); // Uses buffer

// Large file: streaming
const result = await reader.read("/large.zip"); // Uses stream internally
```

### Backpressure Handling

Streams handle backpressure automatically:

```typescript
const result = await reader.readStream("/huge-file.bin");

if (isOk(result)) {
  const stream = result.value;

  // Pauses automatically when consumer is slow
  stream.pipe(slowConsumer);
}
```

### Checksum Calculation

SHA-256 checksums are calculated for integrity verification:

```typescript
const result = await reader.read("/important.doc");

if (isOk(result)) {
  console.log("SHA-256:", result.value.metadata.checksum);
}
```

## Testing

### Unit Tests

```bash
# Run reader-specific tests
npm test -- src/readers/__tests__

# Run with coverage
npm test -- --coverage src/readers
```

### E2E Tests

```bash
# Run end-to-end tests
npm test -- src/readers/__tests__/e2e.test.ts
```

### Performance Benchmarks

```bash
# Run performance benchmarks
npx tsx scripts/benchmark.ts

# Output as JSON for CI
BENCHMARK_FORMAT=json npx tsx scripts/benchmark.ts
```

## Security Considerations

### For Production Use

1. **Set appropriate maxReadSize**: Don't allow unlimited file reading
2. **Configure rate limits**: Prevent abuse with strict limits
3. **Use allowedPaths whitelist**: Restrict to specific directories
4. **Monitor audit logs**: Regularly review for suspicious activity
5. **Handle errors gracefully**: Don't expose internal paths in errors

### Common Pitfalls

❌ **Don't bypass validation:**

```typescript
// Wrong: Direct file system access
const content = await fs.readFile(userPath);
```

✅ **Always use the reader:**

```typescript
// Correct: Goes through all security layers
const result = await reader.read(userPath);
```

❌ **Don't ignore errors:**

```typescript
// Wrong: Silent failure
const data = (await reader.read(path)).value?.data;
```

✅ **Handle all cases:**

```typescript
// Correct: Explicit error handling
const result = await reader.read(path);
if (isOk(result)) {
  return result.value.data;
} else {
  return handleError(result.error);
}
```

## Integration with MCP Server

The File Reader is available as an MCP tool:

```typescript
// Register in server.ts
import { fileReaderToolDefinition, handleReadFile } from './tools/file-reader.tool.js';

// Add to TOOLS array
export const TOOLS: ToolDefinition[] = [
  // ... other tools
  fileReaderToolDefinition,
];

// Add to handler switch
case 'file_organizer_read_file':
  response = await handleReadFile(args as Record<string, unknown>);
  break;
```

### Tool Parameters

| Parameter         | Type     | Required | Description                    |
| ----------------- | -------- | -------- | ------------------------------ |
| `path`            | `string` | Yes      | Absolute file path             |
| `encoding`        | `string` | No       | `utf-8`, `base64`, or `binary` |
| `maxBytes`        | `number` | No       | Maximum bytes (default: 10MB)  |
| `offset`          | `number` | No       | Start offset (default: 0)      |
| `response_format` | `string` | No       | `json`, `markdown`, or `text`  |

## API Reference

### Classes

- `SecureFileReader` - Main file reader implementation
- `FileReaderFactory` - Factory for creating configured readers
- `AuditLoggerService` - Audit logging implementation

### Interfaces

- `IFileReader` - Core reader interface
- `IAuditLogger` - Audit logger interface
- `FileReadOptions` - Read operation options
- `FileReadResult` - Read operation result
- `FileMetadata` - File metadata

### Functions

- `isOk()` / `isErr()` - Result type guards
- `ok()` / `err()` - Result constructors
- `unwrap()` / `unwrapOr()` - Result extractors

## License

Part of File-Organizer-MCP. See main LICENSE file.

## Contributing

See main CONTRIBUTING.md for guidelines.

---

**Version**: 3.4.0  
**Last Updated**: 2026-02-10
