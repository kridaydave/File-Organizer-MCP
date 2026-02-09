# Technical Guardrails

This document establishes non-negotiable standards for all code in this project.

---

## 1. 8-Layer Path Validation (Non-Negotiable)

Every file system operation MUST pass through all 8 validation layers.

```typescript
// types/path-validation.ts
interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  sanitizedPath?: string;
}

type ValidationLayer =
  | 'LENGTH_CHECK'
  | 'CHARACTER_CHECK'
  | 'TRAVERSAL_CHECK'
  | 'RESERVED_CHECK'
  | 'TYPE_CHECK'
  | 'PERMISSION_CHECK'
  | 'QUOTA_CHECK'
  | 'SYMREG_CHECK';

interface ValidationError {
  layer: ValidationLayer;
  message: string;
  code: string;
  recoverable: boolean;
}

// core/path-validator.ts
export class PathValidator {
  private readonly MAX_PATH_LENGTH = 260;
  private readonly FORBIDDEN_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;
  private readonly RESERVED_NAMES = new Set([
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

  async validate(input: string): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    let sanitized = input;

    // Layer 1: Length Check
    if (sanitized.length > this.MAX_PATH_LENGTH) {
      errors.push({
        layer: 'LENGTH_CHECK',
        message: `Path exceeds maximum length of ${this.MAX_PATH_LENGTH}`,
        code: 'PATH_TOO_LONG',
        recoverable: false,
      });
    }

    // Layer 2: Character Check
    if (this.FORBIDDEN_CHARS.test(sanitized)) {
      errors.push({
        layer: 'CHARACTER_CHECK',
        message: 'Path contains forbidden characters',
        code: 'INVALID_CHARS',
        recoverable: false,
      });
      sanitized = sanitized.replace(this.FORBIDDEN_CHARS, '_');
    }

    // Layer 3: Traversal Check
    if (sanitized.includes('..')) {
      const segments = sanitized.split('/');
      for (let i = 0; i < segments.length - 1; i++) {
        if (segments[i] === '..' && segments[i - 1] !== '..') {
          errors.push({
            layer: 'TRAVERSAL_CHECK',
            message: 'Path traversal attempt detected',
            code: 'PATH_TRAVERSAL',
            recoverable: false,
          });
          break;
        }
      }
    }

    // Layer 4: Reserved Name Check
    const baseName = sanitized.split('/').pop()?.split('\\').pop() || '';
    if (this.RESERVED_NAMES.has(baseName.toUpperCase())) {
      errors.push({
        layer: 'RESERVED_CHECK',
        message: 'Path uses reserved device name',
        code: 'RESERVED_NAME',
        recoverable: false,
      });
    }

    // Layer 5: Type Check (if exists)
    try {
      const stats = await Deno.stat(sanitized);
      if (stats.isDirectory && !sanitized.endsWith('/')) {
        sanitized += '/';
      }
    } catch {
      // File doesn't exist - not an error for creation operations
    }

    // Layer 6: Permission Check (deferred to runtime)
    // Layer 7: Quota Check (deferred to runtime)
    // Layer 8: Symlink Regularity Check
    try {
      const lstat = await Deno.lstat(sanitized);
      if (lstat.isSymlink) {
        errors.push({
          layer: 'SYMREG_CHECK',
          message: 'Symbolic links require explicit opt-in',
          code: 'SYMLINK_DETECTED',
          recoverable: true,
        });
      }
    } catch {
      // File doesn't exist yet
    }

    return {
      isValid: errors.filter((e) => !e.recoverable).length === 0,
      errors,
      sanitizedPath: sanitized,
    };
  }
}
```

---

## 2. Code Style Standards

### 2.1 Naming Conventions

```typescript
// CONSTANTS: SCREAMING_SNAKE_CASE
const MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 5000;

// Interfaces: PascalCase with 'I' prefix (optional)
interface IUserRepository {
  findById(id: string): Promise<User | null>;
}

// Types: PascalCase
type UserEvent = 'login' | 'logout' | 'update';

// Enums: PascalCase
enum ProcessingStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

// Functions: camelCase (verbs first)
async function validateUserInput(input: unknown): Promise<boolean> {
  // Implementation
}

// Private methods: camelCase with underscore prefix (optional)
private _sanitizePath(path: string): string {
  return path.trim();
}
```

### 2.2 TypeScript Strictness

```typescript
// tsconfig.json (mandatory)
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true
  }
}
```

### 2.3 File Organization

```
src/
├── domain/          # Business logic, entities
├── application/     # Use cases, services
├── infrastructure/  # External integrations, adapters
├── interfaces/      # API contracts, DTOs
└── shared/          # Utilities, constants, types
```

---

## 3. ESM Jest Mocking Pattern

### 3.1 Mocking ESM Modules

```typescript
// __mocks__/node:fs.ts (ESM mock for Node.js fs)
import { jest } from '@jest/globals';

// Mock implementation
const mockReadFile = jest.fn<string[], [string, string]>();
const mockWriteFile = jest.fn<string[], [string, string, unknown]>();
const mockUnlink = jest.fn<boolean[], [string]>();
const mockStat = jest.fn<
  Promise<{
    isFile: boolean;
    isDirectory: boolean;
    size: number;
  }>,
  [string]
>();

// Module namespace mock
const fsMock = {
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  unlink: mockUnlink,
  stat: mockStat,
  promises: {
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    unlink: mockUnlink,
    stat: mockStat,
  },
};

export default fsMock;

// Explicit named exports for compatibility
export const readFile = mockReadFile;
export const writeFile = mockWriteFile;
export const unlink = mockUnlink;
export const stat = mockStat;
export const promises = fsMock.promises;
```

### 3.2 Jest Test with Manual Mocks

```typescript
// services/file-processor.test.ts
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { FileProcessor } from './file-processor.js';
import fs from 'node:fs';

// ESM way: Import the mock factory
jest.unstable_mockModule('node:fs', () => ({
  default: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn(),
  },
  readFile: jest.fn(),
  writeFile: jest.fn(),
  unlink: jest.fn(),
}));

describe('FileProcessor', () => {
  let processor: FileProcessor;
  let mockReadFile: jest.Mock;
  let mockWriteFile: jest.Mock;
  let mockUnlink: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Get the mocked module
    const fsModule = await import('node:fs');
    mockReadFile = fsModule.readFile as jest.Mock;
    mockWriteFile = fsModule.writeFile as jest.Mock;
    mockUnlink = fsModule.unlink as jest.Mock;

    processor = new FileProcessor();
  });

  it('should read file content successfully', async () => {
    const testContent = 'test file content';
    const testPath = '/test/file.txt';

    mockReadFile.mockResolvedValue(Buffer.from(testContent));

    const result = await processor.readFile(testPath);

    expect(mockReadFile).toHaveBeenCalledWith(testPath, 'utf-8');
    expect(result).toBe(testContent);
  });

  it('should handle read errors gracefully', async () => {
    const testPath = '/nonexistent/file.txt';
    const error = new Error('ENOENT: file not found');
    (error as NodeJS.ErrnoException).code = 'ENOENT';

    mockReadFile.mockRejectedValue(error);

    await expect(processor.readFile(testPath)).rejects.toThrow('File not found');
  });

  it('should write file atomically', async () => {
    const testPath = '/output/file.txt';
    const testContent = 'output content';

    mockWriteFile.mockResolvedValue(undefined);

    await processor.writeFileAtomic(testPath, testContent);

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const [calledPath, calledContent, options] = mockWriteFile.mock.calls[0];
    expect(calledPath).toBe(testPath);
    expect(calledContent).toBe(testContent);
  });

  it('should clean up temp file after atomic write', async () => {
    const testPath = '/output/file.txt';
    const testContent = 'output content';

    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(true);

    await processor.writeFileAtomic(testPath, testContent);

    expect(mockUnlink).toHaveBeenCalled();
  });
});
```

### 3.3 Mocking with jest.spyOn (ESM Compatible)

```typescript
// services/logger.test.ts
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { Logger } from './logger.js';

describe('Logger', () => {
  let logger: Logger;
  let consoleSpy: {
    log: jest.SpyInstance;
    error: jest.SpyInstance;
    warn: jest.SpyInstance;
  };

  beforeEach(() => {
    logger = new Logger();
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
    };
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.error.mockRestore();
    consoleSpy.warn.mockRestore();
  });

  it('should log info messages', () => {
    logger.info('Test message', { key: 'value' });

    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('INFO'),
      expect.stringContaining('Test message')
    );
  });

  it('should include timestamp in logs', () => {
    const timestamp = new Date().toISOString();
    logger.info('Timestamp test');

    const logCall = consoleSpy.log.mock.calls[0][0];
    expect(logCall).toContain(timestamp);
  });
});
```

---

## 4. Error Handling Patterns

### 4.1 Result Type Pattern

```typescript
// shared/result.ts
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

function createOk<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

function createErr<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}

// Usage
async function processFile(path: string): Promise<Result<string, ValidationError>> {
  const validation = await validatePath(path);
  if (!validation.isValid) {
    return createErr(new ValidationError(validation.errors));
  }

  try {
    const content = await readFile(validation.sanitizedPath!);
    return createOk(content);
  } catch (error) {
    return createErr(new ReadError(`Failed to read: ${path}`, error));
  }
}
```

### 4.2 Custom Error Classes

```typescript
// errors/application-errors.ts
export abstract class ApplicationError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  abstract readonly isRecoverable: boolean;

  constructor(
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends ApplicationError {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 400;
  readonly isRecoverable = true;

  constructor(public readonly validationErrors: ValidationErrorDetail[]) {
    super('Validation failed', { errors: validationErrors });
  }
}

export class NotFoundError extends ApplicationError {
  readonly code = 'NOT_FOUND';
  readonly statusCode = 404;
  readonly isRecoverable = true;

  constructor(resourceType: string, resourceId: string) {
    super(`${resourceType} not found: ${resourceId}`, { resourceType, resourceId });
  }
}

export class UnauthorizedError extends ApplicationError {
  readonly code = 'UNAUTHORIZED';
  readonly statusCode = 401;
  readonly isRecoverable = false;
}

export class SystemError extends ApplicationError {
  readonly code = 'SYSTEM_ERROR';
  readonly statusCode = 500;
  readonly isRecoverable = false;

  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
  }
}
```

### 4.3 Error Boundary / Handler Pattern

```typescript
// infrastructure/error-handler.ts
import { Request, Response, NextFunction } from 'express';
import { ApplicationError } from '../errors/application-errors.js';
import { logger } from './logger.js';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApplicationError) {
    logger.warn('Application error', {
      code: err.code,
      message: err.message,
      path: req.path,
      method: req.method,
    });

    res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
      ...(err.isRecoverable && { context: err.context }),
    });
    return;
  }

  logger.error('Unexpected error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
  });

  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  });
}

export async function withErrorHandling<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ApplicationError) {
      throw error;
    }
    throw new SystemError('Operation failed', { originalError: String(error) });
  }
}
```

---

## 5. State Management

### 5.1 State Machine Pattern

```typescript
// state/file-processing-state.ts
type ProcessingState =
  | { status: 'idle' }
  | { status: 'validating'; filesChecked: number }
  | { status: 'organizing'; currentFile: string; progress: number }
  | { status: 'completed'; processedCount: number; errorsCount: number }
  | { status: 'failed'; error: string; failedFiles: string[] }
  | { status: 'cancelled'; partialProgress: number };

interface ProcessingContext {
  sourcePath: string;
  targetPath: string;
  rules: OrganizationRule[];
  startTime: Date;
  operationId: string;
}

// state/file-state-machine.ts
import { createActor, createMachine, assign } from 'xstate';

const fileProcessingMachine = createMachine({
  id: 'fileProcessing',
  initial: 'idle',
  context: {
    sourcePath: '',
    targetPath: '',
    rules: [],
    filesChecked: 0,
    currentFile: '',
    progress: 0,
    processedCount: 0,
    errorsCount: 0,
    failedFiles: [],
    startTime: new Date(),
    operationId: '',
    error: undefined,
  },
  states: {
    idle: {
      on: {
        START: 'validating',
        CANCEL: 'cancelled',
      },
    },
    validating: {
      entry: assign({
        filesChecked: 0,
        startTime: () => new Date(),
      }),
      after: {
        VALIDATION_TIMEOUT_MS: {
          target: 'failed',
          actions: assign({
            error: () => 'Validation timed out',
          }),
        },
      },
      on: {
        VALIDATION_COMPLETE: {
          target: 'organizing',
          guard: ({ context }) => context.rules.length > 0,
        },
        VALIDATION_FAILED: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => event.error,
          }),
        },
        PROGRESS: {
          actions: assign({
            filesChecked: ({ context, event }) => context.filesChecked + event.count,
          }),
        },
      },
    },
    organizing: {
      entry: assign({ progress: 0 }),
      on: {
        FILE_PROCESSED: {
          actions: assign({
            currentFile: ({ event }) => event.file,
            processedCount: ({ context }) => context.processedCount + 1,
            progress: ({ context }) =>
              Math.round((context.processedCount / context.filesChecked) * 100),
          }),
        },
        FILE_FAILED: {
          actions: assign({
            errorsCount: ({ context }) => context.errorsCount + 1,
            failedFiles: ({ context, event }) => [...context.failedFiles, event.file],
          }),
        },
        ALL_COMPLETE: {
          target: 'completed',
          guard: ({ context }) =>
            context.processedCount + context.errorsCount === context.filesChecked,
        },
      },
    },
    completed: {
      type: 'final' as const,
      entry: assign({
        progress: () => 100,
      }),
    },
    failed: {
      type: 'final' as const,
    },
    cancelled: {
      type: 'final' as const,
      entry: assign({
        partialProgress: ({ context }) => context.progress,
      }),
    },
  },
});

// Usage
const actor = createActor(fileProcessingMachine, {
  input: {
    sourcePath: '/downloads',
    targetPath: '/organized',
    rules: [new ImageRule(), new DocumentRule()],
  },
});

actor.subscribe((snapshot) => {
  console.log(`State: ${snapshot.value}`, snapshot.context);
});

actor.start();
actor.send({ type: 'START' });
```

### 5.2 Observable State Store

```typescript
// state/observable-store.ts
type Listener<T> = (state: T, previousState: T) => void;

interface Store<T extends Record<string, unknown>> {
  getState(): T;
  setState(partial: Partial<T> | ((state: T) => Partial<T>): void;
  subscribe(listener: Listener<T>): () => void;
  subscribe(selector: (state: T) => unknown, listener: (value: unknown) => void): () => void;
}

class ObservableStore<T extends Record<string, unknown>> implements Store<T> {
  private state: T;
  private listeners: Set<Listener<T>> = new Set();
  private subscribers: Map<(state: T) => unknown, Set<(value: unknown) => void>> = new Map();

  constructor(initialState: T) {
    this.state = { ...initialState };
  }

  getState(): T {
    return { ...this.state };
  }

  setState(
    partial: Partial<T> | ((state: T) => Partial<T>)
  ): void {
    const previousState = this.state;
    const newPartial = typeof partial === 'function' ? partial(this.state) : partial;
    this.state = { ...this.state, ...newPartial };

    this.listeners.forEach(listener => listener(this.state, previousState));

    this.subscribers.forEach((callbacks, selector) => {
      const newValue = selector(this.state);
      callbacks.forEach(callback => callback(newValue));
    });
  }

  subscribe(listener: Listener<T>): () => void;
  subscribe<U>(
    selector: (state: T) => U,
    listener: (value: U) => void
  ): () => void;
  subscribe<U>(
    listenerOrSelector: Listener<T> | ((state: T) => U),
    listenerOrUndefined?: (value: U) => void
  ): () => void {
    if (typeof listenerOrSelector === 'function' && listenerOrUndefined) {
      const selector = listenerOrSelector as (state: T) => U;
      const callback = listenerOrUndefined;

      if (!this.subscribers.has(selector)) {
        this.subscribers.set(selector, new Set());
      }
      this.subscribers.get(selector)!.add(callback);

      callback(selector(this.state));

      return () => {
        this.subscribers.get(selector)?.delete(callback);
        if (this.subscribers.get(selector)?.size === 0) {
          this.subscribers.delete(selector);
        }
      };
    }

    const listener = listenerOrSelector as Listener<T>;
    this.listeners.add(listener);

    listener(this.state, this.state);

    return () => {
      this.listeners.delete(listener);
    };
  }
}

// Usage
interface AppState {
  isOrganizing: boolean;
  currentPath: string;
  progress: number;
  lastError: string | null;
}

const appStore = new ObservableStore<AppState>({
  isOrganizing: false,
  currentPath: '',
  progress: 0,
  lastError: null
});

appStore.subscribe((state, prev) => {
  if (state.isOrganizing !== prev.isOrganizing) {
    console.log(`Organizing state changed: ${state.isOrganizing}`);
  }
});

appStore.subscribe(
  state => state.progress,
  (progress) => console.log(`Progress: ${progress}%`)
);

appStore.setState({ isOrganizing: true });
appStore.setState(state => ({ progress: state.progress + 10 }));
```

---

## 6. Summary

All team members MUST adhere to these guardrails:

1. **8-Layer Path Validation** is mandatory for all file operations
2. **Code Style** enforces TypeScript strictness and naming conventions
3. **Jest Mocks** use ESM-compatible patterns with `jest.unstable_mockModule`
4. **Error Handling** uses the Result type and custom error classes
5. **State Management** uses state machines for complex flows and observable stores for reactive state

Violations will result in failed CI/CD pipelines and code review rejection.
