---
name: file-organizer-dev
description: Development guide for the File Organizer MCP server codebase. Use when (1) adding new MCP tools, (2) adding new services, (3) modifying existing tools or services, (4) writing tests, (5) fixing security issues, (6) refactoring code, or (7) understanding the architecture. Provides patterns for Zod schemas, path validation, error handling, and security-hardened file operations.
---

# File Organizer MCP - Development Guide

This skill helps developers work on the File Organizer MCP server codebase.

## Quick Reference

### Essential Commands

```bash
# Build
npm run build              # Compile TypeScript to dist/
npm run build:watch        # Watch mode
npm run clean              # Remove dist/

# Test
npm test                   # Run all tests
npm test -- tests/unit/services/organizer.test.ts  # Single test
npm run test:coverage      # With coverage
npm run test:security      # Security test suite

# Lint/Format
npm run lint               # ESLint
npm run lint:fix           # Auto-fix
npm run format             # Prettier

# Dev
npm run dev                # Build + start
npm run setup              # TUI setup wizard
```

### Project Structure

```
src/
├── server.ts              # MCP server entry
├── index.ts               # Main entry
├── types.ts               # TypeScript types
├── constants.ts           # App constants
├── config.ts              # Config loader
├── errors.ts              # Error classes
├── services/              # Business logic
│   ├── path-validator.service.ts    # Security-critical
│   ├── organizer.service.ts         # File organization
│   ├── file-scanner.service.ts      # Directory scanning
│   ├── categorizer.service.ts       # File categorization
│   ├── hash-calculator.service.ts   # Duplicate detection
│   ├── rollback.service.ts          # Undo operations
│   └── metadata.service.ts          # EXIF/ID3 extraction
├── tools/                 # MCP tool implementations
│   ├── index.ts           # Tool registry
│   ├── file-organization.ts
│   ├── file-scanning.ts
│   ├── file-duplicates.ts
│   └── ...
├── schemas/               # Zod validation schemas
│   ├── common.schemas.ts
│   ├── security.schemas.ts
│   └── ...
└── utils/                 # Utilities
    ├── logger.ts
    ├── error-handler.ts
    ├── file-utils.ts
    └── formatters.ts

tests/
├── unit/services/         # Service unit tests
├── unit/tools/            # Tool unit tests
└── unit/utils/            # Utility tests
```

---

## Adding a New MCP Tool

### Step 1: Create Tool File

Create `src/tools/my-feature.ts`:

```typescript
/**
 * File Organizer MCP Server
 * my_feature Tool
 */

import { z } from 'zod';
import type { ToolDefinition, ToolResponse } from '../types.js';
import { validateStrictPath } from '../services/path-validator.service.js';
import { createErrorResponse } from '../utils/error-handler.js';
import { CommonParamsSchema } from '../schemas/common.schemas.js';

// ==================== Schema ====================

export const MyFeatureInputSchema = z
  .object({
    directory: z
      .string()
      .min(1, 'Directory path cannot be empty')
      .describe('Full path to the directory'),
    some_param: z
      .boolean()
      .optional()
      .default(false)
      .describe('Description of param'),
  })
  .merge(CommonParamsSchema);

export type MyFeatureInput = z.infer<typeof MyFeatureInputSchema>;

// ==================== Tool Definition ====================

export const myFeatureToolDefinition: ToolDefinition = {
  name: 'file_organizer_my_feature',
  title: 'My Feature',
  description: 'What this tool does. Be descriptive for LLM understanding.',
  inputSchema: {
    type: 'object',
    properties: {
      directory: { type: 'string', description: 'Full path to the directory' },
      some_param: { type: 'boolean', description: 'What it does', default: false },
      response_format: { type: 'string', enum: ['json', 'markdown'], default: 'markdown' },
    },
    required: ['directory'],
  },
  annotations: {
    readOnlyHint: true,      // true if doesn't modify files
    destructiveHint: false,  // true if deletes/modifies files
    idempotentHint: true,    // true if running twice = same result
    openWorldHint: true,     // true if accesses filesystem
  },
};

// ==================== Handler ====================

export async function handleMyFeature(args: Record<string, unknown>): Promise<ToolResponse> {
  try {
    // 1. Validate input
    const parsed = MyFeatureInputSchema.safeParse(args);
    if (!parsed.success) {
      return {
        content: [
          { type: 'text', text: `Error: ${parsed.error.issues.map((i) => i.message).join(', ')}` },
        ],
      };
    }

    const { directory, some_param, response_format } = parsed.data;

    // 2. Validate path (SECURITY CRITICAL)
    const validatedPath = await validateStrictPath(directory);

    // 3. Call service layer
    // const result = await myService.doSomething(validatedPath, some_param);

    // 4. Format response
    if (response_format === 'json') {
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    }

    const markdown = `### My Feature Result

**Directory:** ${validatedPath}
**Param:** ${some_param}

Results here...`;

    return {
      content: [{ type: 'text', text: markdown }],
    };
  } catch (error) {
    // 5. Centralized error handling
    return createErrorResponse(error);
  }
}
```

### Step 2: Register in Tool Index

Edit `src/tools/index.ts`:

```typescript
// Add export
export {
  myFeatureToolDefinition,
  handleMyFeature,
  MyFeatureInputSchema,
} from './my-feature.js';
export type { MyFeatureInput } from './my-feature.js';

// Add to TOOLS array
export const TOOLS: ToolDefinition[] = [
  // ...existing tools
  myFeatureToolDefinition,
];
```

### Step 3: Add to Server Router

Edit `src/server.ts` - add import and route:

```typescript
import { handleMyFeature } from './tools/index.js';

async function handleToolCall(name: string, args: Record<string, unknown>) {
  switch (name) {
    // ...existing cases
    case 'file_organizer_my_feature':
      return handleMyFeature(args);
  }
}
```

### Step 4: Write Tests

Create `tests/unit/tools/my-feature.test.ts`:

```typescript
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { handleMyFeature } from '../../../src/tools/my-feature.js';

describe('handleMyFeature', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-myfeature-'));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should process directory successfully', async () => {
    const result = await handleMyFeature({
      directory: testDir,
      some_param: true,
      response_format: 'json',
    });

    expect(result.content[0].text).toContain('expected content');
  });

  it('should reject invalid paths', async () => {
    const result = await handleMyFeature({
      directory: '/invalid/path',
      response_format: 'json',
    });

    expect(result.content[0].text).toContain('Error');
  });
});
```

---

## Adding a New Service

Create `src/services/my-service.service.ts`:

```typescript
/**
 * My Service - Business logic for X
 */

import type { SomeType } from '../types.js';
import { logger } from '../utils/logger.js';

export interface MyServiceOptions {
  option1?: boolean;
  option2?: number;
}

export class MyService {
  constructor(private options: MyServiceOptions = {}) {}

  async doSomething(input: string): Promise<SomeType> {
    logger.debug('Doing something', { input });
    
    // Implementation
    
    return result;
  }
}
```

---

## Security Guidelines (CRITICAL)

### 8-Layer Path Validation

Every file path MUST go through validation:

```typescript
import { validateStrictPath } from '../services/path-validator.service.js';

// Basic validation
const validatedPath = await validateStrictPath(userInput);

// With options
import { validatePathBase } from '../services/path-validator.service.js';
const path = await validatePathBase(input, {
  basePath: '/base',
  allowedPaths: ['/allowed'],
  requireExists: true,
  checkWrite: true,
  allowSymlinks: false,
});
```

### Security Rules

1. **Never trust user paths** - Always validate
2. **Use O_NOFOLLOW** - Prevent symlink attacks
3. **Atomic operations** - Use COPYFILE_EXCL for race condition safety
4. **No path traversal** - Block `../` sequences
5. **Windows reserved names** - Block CON, PRN, AUX, NUL, COM1-9, LPT1-9
6. **Sanitize errors** - Never expose internal paths in error messages

### Safe File Operations

```typescript
import { constants } from 'fs';

// Validate via file descriptor (TOCTOU protection)
const validator = new PathValidatorService();
const handle = await validator.openAndValidateFile(path);
// ... use handle ...
await handle.close();

// Atomic copy (prevents race conditions)
await fs.copyFile(source, dest, constants.COPYFILE_EXCL);

// Safe overwrite (backup first)
if (await fileExists(targetPath)) {
  const backupPath = path.join('.file-organizer-backups', `${Date.now()}_${basename}`);
  await fs.rename(targetPath, backupPath);
}
```

---

## Testing Patterns

### Unit Test Template

```typescript
import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { MyService } from '../../../src/services/my-service.service.js';

describe('MyService', () => {
  let service: MyService;
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-'));
    service = new MyService();
  });

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100)); // Windows cleanup
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should do something correctly', async () => {
    // Arrange
    const input = 'test';
    
    // Act
    const result = await service.doSomething(input);
    
    // Assert
    expect(result).toBe(expected);
  });

  it('should handle errors gracefully', async () => {
    await expect(service.doSomething(invalidInput))
      .rejects.toThrow(ExpectedError);
  });
});
```

### Security Test Pattern

```typescript
describe('Security', () => {
  it('should block path traversal', async () => {
    const result = await handleTool({
      directory: '/allowed/../etc/passwd',
    });
    expect(result.content[0].text).toContain('Error');
  });

  it('should block symlinks outside allowed paths', async () => {
    // Test symlink handling
  });
});
```

---

## Code Style

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `path-validator.service.ts` |
| Classes | PascalCase | `PathValidatorService` |
| Functions | camelCase | `validatePath()` |
| Constants | SCREAMING_SNAKE | `MAX_FILE_SIZE` |
| Interfaces | PascalCase | `ToolResponse` |

### TypeScript Imports

```typescript
// Node built-ins
import fs from 'fs/promises';
import { constants } from 'fs';
import path from 'path';

// Third-party
import { z } from 'zod';

// Project imports (with .js extension for ESM)
import { validateStrictPath } from '../services/path-validator.service.js';
import type { ToolResponse } from '../types.js';
```

### Zod Schema Pattern

```typescript
export const MyInputSchema = z
  .object({
    directory: z.string().min(1, 'Directory cannot be empty'),
    dry_run: z.boolean().optional().default(false),
    limit: z.number().int().positive().max(1000).default(100),
  })
  .merge(CommonParamsSchema);

export type MyInput = z.infer<typeof MyInputSchema>;
```

### Error Handling Pattern

```typescript
import { createErrorResponse } from '../utils/error-handler.js';
import { ValidationError } from '../types.js';

try {
  // ... code
} catch (error) {
  if (error instanceof ValidationError) {
    // Handle specific error
  }
  return createErrorResponse(error);
}
```

---

## Common Utilities

### Logger

```typescript
import { logger } from '../utils/logger.js';

logger.debug('Debug message', { context: 'value' });
logger.info('Info message');
logger.warn('Warning', { detail: 'value' });
logger.error('Error message', error, { context: 'value' });
```

### File Utilities

```typescript
import { fileExists, formatBytes } from '../utils/file-utils.js';

if (await fileExists(path)) { }
const readable = formatBytes(1024); // "1 KB"
```

### Formatters

```typescript
import { formatDate, pluralize } from '../utils/formatters.js';

formatDate(new Date()); // ISO format
pluralize(5, 'file'); // "5 files"
```

---

## Key Types Reference

### File Types

```typescript
interface FileWithSize {
  name: string;
  path: string;
  size: number;
  modified?: Date;
}

type CategoryName = 
  | 'Executables' | 'Videos' | 'Documents' | 'Presentations'
  | 'Spreadsheets' | 'Images' | 'Audio' | 'Archives' 
  | 'Code' | 'Installers' | 'Ebooks' | 'Fonts' | 'Others';
```

### Tool Types

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

type ToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  [key: string]: unknown;
};
```

---

## Debugging Tips

### Enable Debug Logging

Set environment variable:
```bash
$env:LOG_LEVEL = "debug"
```

### Common Issues

| Issue | Solution |
|-------|----------|
| Path validation fails | Check `config.json` allowed directories |
| Windows file locks | Add 100ms delay before cleanup in tests |
| ESM import errors | Use `.js` extension in imports |
| Type errors | Run `npm run build` to check |
| Test timeouts | Check for unclosed file handles |

---

## Development Workflow

1. **Create feature branch**
2. **Implement changes** following patterns above
3. **Add tests** for new functionality
4. **Run full test suite**: `npm test`
5. **Run lint**: `npm run lint`
6. **Build**: `npm run build`
7. **Test manually**: `npm run dev`
8. **Security review** (for path handling changes)
