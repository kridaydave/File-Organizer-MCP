# AGENTS.md - Development Guidelines for File Organizer MCP

This file contains development guidelines, build commands, and coding standards for agentic coding agents working on the File Organizer MCP project.

## 📋 Build, Lint, and Test Commands

### Core Commands

- `npm run build` - Compile TypeScript to JavaScript (ES2022, NodeNext modules)
- `npm run build:watch` - Build in watch mode for development
- `npm run start` - Start the compiled server (requires `npm run build` first)
- `npm run dev` - Build and start server in development mode

### Testing

- `npm test` - Run all tests with Jest (Node.js 18+ required)
- `npm test:watch` - Run tests in watch mode
- `npm test:coverage` - Run tests with coverage report
- `npm test tests/unit/services/your-service.test.ts` - Run specific test file
- `npm run test:security` - Run security-specific tests

### Code Quality

- `npm run lint` - Run ESLint on TypeScript source files
- `npm run lint:fix` - Auto-fix linting issues
- `npm run format` - Format code with Prettier
- `npm run clean` - Remove compiled `dist/` directory

### Security Commands

- `npm run test:security` - Run security validation tests
- `npm run test:phase1` - Run phase 1 security tests

### Agent System Commands

- `npm run setup` - Run the interactive setup wizard
- `npm run docs:generate` - Generate documentation from debate system

## 🏗️ Project Structure

```
File-Organizer-MCP/
├── src/
│   ├── services/      # Core business logic (path validation, organization, scanning)
│   ├── tools/         # MCP tool implementations
│   ├── utils/         # Helper functions (logger, file utils, error handling)
│   ├── schemas/       # Zod validation schemas
│   ├── types.ts       # TypeScript type definitions
│   ├── constants.ts   # Application constants
│   └── config.ts      # Configuration management
├── tests/
│   ├── unit/          # Unit tests
│   ├── integration/   # Integration tests
│   └── performance/   # Performance benchmarks
├── dist/              # Compiled JavaScript output
├── bin/               # Executable entry points
├── docs/              # Documentation (content-based organization, debate framework)
└── workflows/         # Agent workflow definitions
```

## 🧠 Agent System Integration

This project includes a sophisticated agent system with the following key components:

### Multi-Shepherd Debate Framework

- **Purpose**: Structured decision-making for architectural discussions
- **Key Phases**: Idea Generation → Cross-Validation → Conflict Resolution → Consensus → Post-Mortem
- **Agents**: Shepherd (Architect), Retriever-Beagle (Scout), Kane (Builder), Sentinel (Gatekeeper), Bones (Tester), Jonnah (Scribe), Echo (Documenter), Bloodhound (Keeper), Borzoi (Advisor)

### Agent Workflows

- **Multi-Shepherd Debate**: Collaborative decision-making with weighted voting
- **Parallel Kane**: Horizontal scaling for bulk operations
- **Bloodhound**: Safe operations with backup and restore
- **Borzoi**: Pattern analysis and debate intelligence
- **Debugging**: Issue diagnosis and resolution

### Content-Based Organization

- **Phase 1**: Document content analysis (topic extraction, text analysis)
- **Phase 2**: Music content analysis (genre, mood, artist relationships)
- **Phase 3**: Project/context-based organization (related file grouping)
- **Exclusions**: Image analysis and ML-based learning (security concerns)

## 🔧 Code Style Guidelines

### TypeScript Configuration

- **Target**: ES2022 with NodeNext modules
- **Strict Mode**: Enabled with comprehensive type checking
- **Module Resolution**: NodeNext with ESM imports
- **Key Features**: `noUncheckedIndexedAccess`, `noImplicitReturns`, `forceConsistentCasingInFileNames`

### Import Style

```typescript
// ✅ ESM imports with .js extensions (required for NodeNext modules)
import { createServer } from "./server.js";
import { logger } from "../utils/logger.js";
import type { FileInfo } from "../types.js";

// ✅ Use path aliases for relative imports
import { validatePath } from "../../services/path-validator.service.js";
```

### Naming Conventions

- **Files**: `kebab-case.ts` (e.g., `path-validator.service.ts`, `file-utils.ts`)
- **Classes**: `PascalCase` (e.g., `PathValidatorService`, `OrganizerService`)
- **Functions**: `camelCase` (e.g., `validatePath`, `organizeFiles`)
- **Constants**: `SCREAMING_SNAKE_CASE` (e.g., `MAX_FILE_SIZE`, `DEFAULT_CONFIG`)
- **Interfaces**: `PascalCase` with descriptive names (e.g., `FileInfo`, `OrganizeResult`)

### Type Safety Rules

- **Avoid `any`**: Use proper types or `unknown` with validation
- **Strict Types**: Leverage TypeScript's strict mode features
- **Type Guards**: Use type guards for runtime type checking
- **Zod Schemas**: Use Zod for runtime validation of external data

### Code Organization

```typescript
/**
 * File Organizer MCP Server v3.3.3
 * Service/Class description
 */

// ==================== Imports ====================
import fs from "fs/promises";
import { constants } from "fs";
import path from "path";
import type { FileInfo } from "../types.js";
import { logger } from "../utils/logger.js";

// ==================== Types ====================
export interface ServiceOptions {
  maxRetries?: number;
  timeout?: number;
}

// ==================== Class Definition ====================
export class ExampleService {
  constructor(private options: ServiceOptions = {}) {}

  /**
   * Method description
   * @param param - Parameter description
   * @returns Return value description
   */
  async exampleMethod(param: string): Promise<string> {
    // Implementation
  }
}
```

### Error Handling Patterns

```typescript
// ✅ Use custom error classes
import { FileOrganizerError } from "../errors.js";
import { ValidationError } from "../errors.js";

// ✅ Create standardized error responses
export function createErrorResponse(error: unknown): ToolResponse {
  const errorId = crypto.randomUUID();
  logger.error(`Error ID ${errorId}: ${error.message}`);

  if (error instanceof FileOrganizerError) {
    return error.toResponse();
  }

  return {
    content: [
      {
        type: "text",
        text: `Error: An unexpected error occurred. Error ID: ${errorId}.`,
      },
    ],
  };
}
```

### Security Best Practices

- **Path Validation**: Always use `PathValidatorService` for path operations
- **Input Sanitization**: Never expose internal paths in error messages
- **Access Control**: Implement proper security modes (STRICT, SANDBOXED, UNRESTRICTED)
- **Error Messages**: Use `sanitizeErrorMessage()` to prevent path disclosure

### Logging Standards

```typescript
// ✅ Use structured logging with context
logger.info("File processed", {
  filePath: filePath,
  fileSize: fileSize,
  processedAt: new Date(),
});

// ✅ Error logging with error objects
logger.error("File processing failed", {
  filePath: filePath,
  error: error,
  retryCount: retryCount,
});
```

## 🧪 Testing Guidelines

### Test Structure

```typescript
describe("ServiceName", () => {
  let service: ServiceName;

  beforeEach(() => {
    service = new ServiceName();
  });

  describe("methodName", () => {
    it("should do something when condition", async () => {
      // Arrange
      const input = "test";

      // Act
      const result = await service.methodName(input);

      // Assert
      expect(result).toBe(expected);
    });
  });
});
```

### Test Utilities

- Use `createMockLogger()` for testing logging behavior
- Use `suppressLoggerOutput()` to silence logs during tests
- Use `withMockedLogger()` helper for logger testing
- Mock file system operations using `fs/promises` mocks

### Test Coverage Requirements

- **Unit Tests**: All service methods must have unit tests
- **Integration Tests**: MCP tools and service integrations
- **Security Tests**: Path validation and access control
- **Edge Cases**: Handle invalid inputs, missing files, permission errors

## 🚀 Performance Considerations

### Memory Management

- Use streaming operations for large file processing
- Implement proper cleanup in `finally` blocks
- Use batch processing for file operations
- Monitor memory usage in long-running operations

### File Operations

- Use `fs/promises` for async file operations
- Implement proper error handling for file system operations
- Use efficient file reading strategies (streaming for large files)
- Cache metadata when appropriate

### Concurrency

- Use proper async/await patterns
- Implement rate limiting for file operations
- Handle concurrent access to shared resources
- Use appropriate worker pools for CPU-intensive tasks

## 🔒 Security Guidelines

### Path Security

```typescript
// ✅ Always validate paths
import { validateStrictPath } from "../services/path-validator.service.js";

const validatedPath = await validateStrictPath(userPath, allowedRoots);
if (!validatedPath) {
  throw new AccessDeniedError(userPath);
}
```

### Input Validation

```typescript
// ✅ Use Zod schemas for validation
import { z } from "zod";

const PathSchema = z.object({
  path: z.string().min(1),
  recursive: z.boolean().default(false),
});

const result = PathSchema.safeParse(input);
if (!result.success) {
  throw new ValidationError("Invalid input", result.error);
}
```

### Error Message Sanitization

```typescript
// ✅ Never expose internal paths
import { sanitizeErrorMessage } from "../utils/error-handler.js";

try {
  // Operation
} catch (error) {
  throw new ValidationError(`Operation failed: ${sanitizeErrorMessage(error)}`);
}
```

## 📝 Documentation Standards

### JSDoc Comments

```typescript
/**
 * File Organizer MCP Server v3.3.3
 * Service description
 * @param param - Parameter description
 * @returns Return value description
 * @throws Error type and conditions
 */
export async function exampleMethod(param: string): Promise<string> {
  // Implementation
}
```

### README Updates

- Update `README.md` for user-facing changes
- Update `CHANGELOG.md` for version changes
- Update `ARCHITECTURE.md` for structural changes
- Add examples for new features

## 🚨 Common Pitfalls to Avoid

### ❌ Anti-Patterns

- **Don't**: Use synchronous file operations in async code
- **Don't**: Expose internal file paths in error messages
- **Don't**: Skip input validation for external data
- **Don't**: Use `any` type without proper validation
- **Don't**: Ignore async/await patterns

### ✅ Best Practices

- **Do**: Use proper TypeScript types and interfaces
- **Do**: Implement comprehensive error handling
- **Do**: Follow security guidelines for path operations
- **Do**: Write tests for all new functionality
- **Do**: Use structured logging with context

## 📁 File-Specific Guidelines

### Service Files

- Use dependency injection for testability
- Implement proper cleanup in destructors
- Use async/await for all I/O operations
- Include comprehensive error handling

### Tool Files

- Follow MCP specification for tool definitions
- Implement proper input validation
- Include comprehensive error responses
- Use appropriate annotations for tool properties

### Utility Files

- Keep functions pure and side-effect free when possible
- Include comprehensive JSDoc comments
- Use appropriate error handling
- Implement proper type safety

## 🚀 Development Workflow

1. **Setup**: `npm install && npm run build`
2. **Development**: `npm run dev` for live reload
3. **Testing**: `npm test` for comprehensive testing
4. **Linting**: `npm run lint` for code quality
5. **Formatting**: `npm run format` for consistent style
6. **Security**: `npm run test:security` for security validation
7. **Agent System**: Use multi-shepherd debate for architectural decisions

## 📚 Additional Resources

- **README.md**: User-facing documentation
- **CONTRIBUTING.md**: Detailed contribution guidelines
- **ARCHITECTURE.md**: Technical architecture documentation
- **TESTS.md**: Testing guidelines and strategies
- **API.md**: MCP API documentation
- **docs/FRAMEWORK.md**: Multi-Shepherd Debate Framework
- **docs/CONTENT_BASED_ORGANIZATION_PLAN.md**: Content-based organization roadmap

## 🎯 Quality Gates

Before submitting changes, ensure:

- [ ] All tests pass (`npm test`)
- [ ] No linting errors (`npm run lint`)
- [ ] Code is properly formatted (`npm run format`)
- [ ] Security tests pass (`npm run test:security`)
- [ ] New tests added for new functionality
- [ ] Documentation is updated
- [ ] Error handling is comprehensive
- [ ] Security guidelines are followed
- [ ] TypeScript compilation succeeds (`npm run build`)
- [ ] Agent system integration follows debate framework

## 🏗️ Project Structure

```
File-Organizer-MCP/
├── src/
│   ├── services/      # Core business logic (path validation, organization, scanning)
│   ├── tools/         # MCP tool implementations
│   ├── utils/         # Helper functions (logger, file utils, error handling)
│   ├── schemas/       # Zod validation schemas
│   ├── types.ts       # TypeScript type definitions
│   ├── constants.ts   # Application constants
│   └── config.ts      # Configuration management
├── tests/
│   ├── unit/          # Unit tests
│   ├── integration/   # Integration tests
│   └── performance/   # Performance benchmarks
├── dist/              # Compiled JavaScript output
├── bin/               # Executable entry points
└── scripts/           # Build and utility scripts
```

## 🔧 Code Style Guidelines

### TypeScript Configuration

- **Target**: ES2022 with NodeNext modules
- **Strict Mode**: Enabled with comprehensive type checking
- **Module Resolution**: NodeNext with ESM imports
- **Key Features**: `noUncheckedIndexedAccess`, `noImplicitReturns`, `forceConsistentCasingInFileNames`

### Import Style

```typescript
// ✅ ESM imports with .js extensions (required for NodeNext modules)
import { createServer } from "./server.js";
import { logger } from "../utils/logger.js";
import type { FileInfo } from "../types.js";

// ✅ Use path aliases for relative imports
import { validatePath } from "../../services/path-validator.service.js";
```

### Naming Conventions

- **Files**: `kebab-case.ts` (e.g., `path-validator.service.ts`, `file-utils.ts`)
- **Classes**: `PascalCase` (e.g., `PathValidatorService`, `OrganizerService`)
- **Functions**: `camelCase` (e.g., `validatePath`, `organizeFiles`)
- **Constants**: `SCREAMING_SNAKE_CASE` (e.g., `MAX_FILE_SIZE`, `DEFAULT_CONFIG`)
- **Interfaces**: `PascalCase` with descriptive names (e.g., `FileInfo`, `OrganizeResult`)

### Type Safety Rules

- **Avoid `any`**: Use proper types or `unknown` with validation
- **Strict Types**: Leverage TypeScript's strict mode features
- **Type Guards**: Use type guards for runtime type checking
- **Zod Schemas**: Use Zod for runtime validation of external data

### Code Organization

```typescript
/**
 * File Organizer MCP Server v3.3.3
 * Service/Class description
 */

// ==================== Imports ====================
import fs from "fs/promises";
import { constants } from "fs";
import path from "path";
import type { FileInfo } from "../types.js";
import { logger } from "../utils/logger.js";

// ==================== Types ====================
export interface ServiceOptions {
  maxRetries?: number;
  timeout?: number;
}

// ==================== Class Definition ====================
export class ExampleService {
  constructor(private options: ServiceOptions = {}) {}

  /**
   * Method description
   * @param param - Parameter description
   * @returns Return value description
   */
  async exampleMethod(param: string): Promise<string> {
    // Implementation
  }
}
```

### Error Handling Patterns

```typescript
// ✅ Use custom error classes
import { FileOrganizerError } from "../errors.js";
import { ValidationError } from "../errors.js";

// ✅ Create standardized error responses
export function createErrorResponse(error: unknown): ToolResponse {
  const errorId = crypto.randomUUID();
  logger.error(`Error ID ${errorId}: ${error.message}`);

  if (error instanceof FileOrganizerError) {
    return error.toResponse();
  }

  return {
    content: [
      {
        type: "text",
        text: `Error: An unexpected error occurred. Error ID: ${errorId}.`,
      },
    ],
  };
}
```

### Security Best Practices

- **Path Validation**: Always use `PathValidatorService` for path operations
- **Input Sanitization**: Never expose internal paths in error messages
- **Access Control**: Implement proper security modes (STRICT, SANDBOXED, UNRESTRICTED)
- **Error Messages**: Use `sanitizeErrorMessage()` to prevent path disclosure

### Logging Standards

```typescript
// ✅ Use structured logging with context
logger.info("File processed", {
  filePath: filePath,
  fileSize: fileSize,
  processedAt: new Date(),
});

// ✅ Error logging with error objects
logger.error("File processing failed", {
  filePath: filePath,
  error: error,
  retryCount: retryCount,
});
```

## 🧪 Testing Guidelines

### Test Structure

```typescript
describe("ServiceName", () => {
  let service: ServiceName;

  beforeEach(() => {
    service = new ServiceName();
  });

  describe("methodName", () => {
    it("should do something when condition", async () => {
      // Arrange
      const input = "test";

      // Act
      const result = await service.methodName(input);

      // Assert
      expect(result).toBe(expected);
    });
  });
});
```

### Test Utilities

- Use `createMockLogger()` for testing logging behavior
- Use `suppressLoggerOutput()` to silence logs during tests
- Use `withMockedLogger()` helper for logger testing
- Mock file system operations using `fs/promises` mocks

### Test Coverage Requirements

- **Unit Tests**: All service methods must have unit tests
- **Integration Tests**: MCP tools and service integrations
- **Security Tests**: Path validation and access control
- **Edge Cases**: Handle invalid inputs, missing files, permission errors

## 🚀 Performance Considerations

### Memory Management

- Use streaming operations for large file processing
- Implement proper cleanup in `finally` blocks
- Use batch processing for file operations
- Monitor memory usage in long-running operations

### File Operations

- Use `fs/promises` for async file operations
- Implement proper error handling for file system operations
- Use efficient file reading strategies (streaming for large files)
- Cache metadata when appropriate

### Concurrency

- Use proper async/await patterns
- Implement rate limiting for file operations
- Handle concurrent access to shared resources
- Use appropriate worker pools for CPU-intensive tasks

## 🔒 Security Guidelines

### Path Security

```typescript
// ✅ Always validate paths
import { validateStrictPath } from "../services/path-validator.service.js";

const validatedPath = await validateStrictPath(userPath, allowedRoots);
if (!validatedPath) {
  throw new AccessDeniedError(userPath);
}
```

### Input Validation

```typescript
// ✅ Use Zod schemas for validation
import { z } from "zod";

const PathSchema = z.object({
  path: z.string().min(1),
  recursive: z.boolean().default(false),
});

const result = PathSchema.safeParse(input);
if (!result.success) {
  throw new ValidationError("Invalid input", result.error);
}
```

### Error Message Sanitization

```typescript
// ✅ Never expose internal paths
import { sanitizeErrorMessage } from "../utils/error-handler.js";

try {
  // Operation
} catch (error) {
  throw new ValidationError(`Operation failed: ${sanitizeErrorMessage(error)}`);
}
```

## 📝 Documentation Standards

### JSDoc Comments

```typescript
/**
 * File Organizer MCP Server v3.3.3
 * Service description
 * @param param - Parameter description
 * @returns Return value description
 * @throws Error type and conditions
 */
export async function exampleMethod(param: string): Promise<string> {
  // Implementation
}
```

### README Updates

- Update `README.md` for user-facing changes
- Update `CHANGELOG.md` for version changes
- Update `ARCHITECTURE.md` for structural changes
- Add examples for new features

## 🚨 Common Pitfalls to Avoid

### ❌ Anti-Patterns

- **Don't**: Use synchronous file operations in async code
- **Don't**: Expose internal file paths in error messages
- **Don't**: Skip input validation for external data
- **Don't**: Use `any` type without proper validation
- **Don't**: Ignore async/await patterns

### ✅ Best Practices

- **Do**: Use proper TypeScript types and interfaces
- **Do**: Implement comprehensive error handling
- **Do**: Follow security guidelines for path operations
- **Do**: Write tests for all new functionality
- **Do**: Use structured logging with context

## 📁 File-Specific Guidelines

### Service Files

- Use dependency injection for testability
- Implement proper cleanup in destructors
- Use async/await for all I/O operations
- Include comprehensive error handling

### Tool Files

- Follow MCP specification for tool definitions
- Implement proper input validation
- Include comprehensive error responses
- Use appropriate annotations for tool properties

### Utility Files

- Keep functions pure and side-effect free when possible
- Include comprehensive JSDoc comments
- Use appropriate error handling
- Implement proper type safety

## 🚀 Development Workflow

1. **Setup**: `npm install && npm run build`
2. **Development**: `npm run dev` for live reload
3. **Testing**: `npm test` for comprehensive testing
4. **Linting**: `npm run lint` for code quality
5. **Formatting**: `npm run format` for consistent style
6. **Security**: `npm run test:security` for security validation

## 📝 Additional Resources

- **README.md**: User-facing documentation
- **CONTRIBUTING.md**: Detailed contribution guidelines
- **ARCHITECTURE.md**: Technical architecture documentation
- **TESTS.md**: Testing guidelines and strategies
- **API.md**: MCP API documentation

## 🎯 Quality Gates

Before submitting changes, ensure:

- [ ] All tests pass (`npm test`)
- [ ] No linting errors (`npm run lint`)
- [ ] Code is properly formatted (`npm run format`)
- [ ] Security tests pass (`npm run test:security`)
- [ ] New tests added for new functionality
- [ ] Documentation is updated
- [ ] Error handling is comprehensive
- [ ] Security guidelines are followed
- [ ] TypeScript compilation succeeds (`npm run build`)
