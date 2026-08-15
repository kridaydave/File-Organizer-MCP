# AGENTS.md

Development guidelines for agentic coding agents working on the File Organizer MCP project.

## Commands

### Build

- `npm run build` - Compile TypeScript to JavaScript (ES2022, NodeNext modules)
- `npm run build:watch` - Build in watch mode
- `npm run start` - Start the compiled server (run `npm run build` first)
- `npm run dev` - Build and start the server
- `npm run clean` - Remove the `dist/` directory

### Test

- `npm test` - Run all tests with Jest (Node.js 18+ required)
- `npm test:watch` - Run tests in watch mode
- `npm test:coverage` - Run tests with a coverage report
- `npm test tests/unit/services/your-service.test.ts` - Run one test file
- `npm run test:security` - Run the security validation suites
- `npm run test:phase1` - Run the phase 1 security tests

### Quality

- `npm run lint` - Run ESLint on `src` and `tests`
- `npm run lint:fix` - Auto-fix lint issues
- `npm run format` - Format `src` with Prettier

### Agent system

- `npm run setup` - Run the interactive setup wizard
- `npm run docs:generate` - Generate documentation from the debate system

## Project layout

```
File-Organizer-MCP/
├── src/
│   ├── services/     # Business logic (path validation, organization, scanning)
│   ├── tools/        # MCP tool implementations
│   ├── readers/      # Secure file reading
│   ├── schemas/      # Zod validation schemas
│   ├── security/     # Security constants and helpers
│   ├── tui/          # Interactive setup wizard
│   ├── utils/        # Logger, file utilities, error handling
│   ├── index.ts      # Entry point, exports tools and services
│   ├── server.ts     # MCP server implementation
│   ├── config.ts     # Configuration management
│   ├── constants.ts  # Application constants
│   ├── errors.ts     # Custom error classes
│   └── types.ts      # TypeScript types
├── tests/
│   ├── unit/         # Unit tests
│   ├── integration/  # Integration tests
│   └── performance/  # Performance benchmarks
├── bin/              # Executable entry points
├── docs/             # Design docs and the debate framework
├── examples/         # Example configs
├── reports/          # Analysis reports
├── scripts/          # Build and utility scripts
└── skills/           # Dev skills
```

`dist/`, `node_modules/`, and `coverage/` are generated and gitignored.

## Key files

### Entry points and core

- `src/index.ts` - Exports all tools and services
- `src/server.ts` - MCP server implementation
- `src/config.ts` - Configuration management
- `src/constants.ts` - Application constants
- `src/errors.ts` - Custom error classes
- `src/types.ts` - TypeScript types

### Services

- `src/services/path-validator.service.ts` - Path validation and security
- `src/services/organizer.service.ts` - Core file organization
- `src/services/file-scanner.service.ts` - File scanning
- `src/services/categorizer.service.ts` - File categorization
- `src/services/duplicate-finder.service.ts` - Duplicate detection
- `src/services/rollback.service.ts` - Operation rollback
- `src/services/history-logger.service.ts` - Operation history

### Tools

- `src/tools/index.ts` - Tool exports and registration
- `src/tools/file-organization.ts` - Main organization tool
- `src/tools/file-duplicates.ts` - Duplicate management
- `src/tools/file-scanning.ts` - File scanning
- `src/tools/content-organization.ts` - Content-based organization

### Utilities and security

- `src/utils/logger.ts` - Structured logging
- `src/utils/error-handler.ts` - Error handling
- `src/utils/file-utils.ts` - File operations
- `src/utils/path-security.ts` - Path security
- `src/readers/secure-file-reader.ts` - Secure file reading

### Documentation

- `README.md` - User-facing documentation
- `ARCHITECTURE.md` - Technical architecture
- `API.md` - MCP API reference
- `docs/FRAMEWORK.md` - Multi-Shepherd Debate Framework

## Code style

### TypeScript

- Target ES2022, NodeNext modules, strict mode.
- Module resolution NodeNext with ESM imports.
- Strict flags include `noUncheckedIndexedAccess`, `noImplicitReturns`, and `forceConsistentCasingInFileNames`.

### Imports

Use ESM imports with `.js` extensions, required by NodeNext modules:

```typescript
import { createServer } from "./server.js";
import { logger } from "../utils/logger.js";
import type { FileInfo } from "../types.js";
```

Prefer path aliases for relative imports:

```typescript
import { validatePath } from "../../services/path-validator.service.js";
```

### Naming

- Files: `kebab-case.ts`, for example `path-validator.service.ts`
- Classes: `PascalCase`, for example `PathValidatorService`
- Functions: `camelCase`, for example `validatePath`
- Constants: `SCREAMING_SNAKE_CASE`, for example `MAX_FILE_SIZE`
- Interfaces: `PascalCase` with a descriptive name, for example `FileInfo`

### Type safety

- Avoid `any`. Use a concrete type or `unknown` with validation.
- Use type guards for runtime type checks.
- Validate external data with Zod schemas.

### Error handling

Throw the custom error classes from `errors.ts`, and route responses through the standard helpers:

```typescript
import { FileOrganizerError } from "../errors.js";
import { ValidationError } from "../errors.js";

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

### Logging

Use structured logging with context:

```typescript
logger.info("File processed", {
  filePath: filePath,
  fileSize: fileSize,
  processedAt: new Date(),
});
```

Log errors with the error object attached:

```typescript
logger.error("File processing failed", {
  filePath: filePath,
  error: error,
  retryCount: retryCount,
});
```

## Testing

### Structure

Group tests by service or tool with `describe`, and cover each behavior in an `it`:

```typescript
describe("ServiceName", () => {
  let service: ServiceName;

  beforeEach(() => {
    service = new ServiceName();
  });

  describe("methodName", () => {
    it("should do something when condition", async () => {
      const input = "test";
      const result = await service.methodName(input);
      expect(result).toBe(expected);
    });
  });
});
```

### Utilities

- `createMockLogger()` for testing logging behavior.
- `suppressLoggerOutput()` to silence logs during tests.
- `withMockedLogger()` to test logging.
- Mock file system operations with `fs/promises` mocks.

### Coverage

- Every service method needs a unit test.
- Integration tests cover MCP tools and service wiring.
- Security tests cover path validation and access control.
- Edge cases include invalid input, missing files, and permission errors.

## Performance

- Stream large files instead of loading them whole.
- Do cleanup in `finally` blocks.
- Batch file operations.
- Use `fs/promises` for async I/O.
- Cache metadata where it is cheap and safe.
- Limit concurrency and rate-limit file operations.

## Security

Always validate paths before touching the file system:

```typescript
import { validateStrictPath } from "../services/path-validator.service.js";

const validatedPath = await validateStrictPath(userPath, allowedRoots);
if (!validatedPath) {
  throw new AccessDeniedError(userPath);
}
```

Validate external input with Zod:

```typescript
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

Never expose internal paths in error messages. Use `sanitizeErrorMessage()`:

```typescript
import { sanitizeErrorMessage } from "../utils/error-handler.js";

try {
  // Operation
} catch (error) {
  throw new ValidationError(`Operation failed: ${sanitizeErrorMessage(error)}`);
}
```

### Rules

- Route every path operation through `PathValidatorService`.
- Never leak internal paths in errors.
- Respect the security modes: STRICT, SANDBOXED, UNRESTRICTED.
- Screen out sensitive files such as `.env`, `.ssh`, passwords, and keys.

## Documentation

Document exported methods with JSDoc:

```typescript
/**
 * Service description
 * @param param - Parameter description
 * @returns Return value description
 * @throws Error type and conditions
 */
```

Update the matching docs with each change: `README.md` for user-facing changes, `CHANGELOG.md` for version changes, `ARCHITECTURE.md` for structural changes.

## Agent system

The project ships an agent framework described in [docs/FRAMEWORK.md](docs/FRAMEWORK.md). The agents:

| Agent | Designation | Primary function |
| --- | --- | --- |
| Shepherd | The Architect | Task decomposition and planning |
| Retriever-Beagle | The Scout | Context gathering, search, and analysis |
| Kane | The Builder | Implementation and development |
| Sentinel | The Gatekeeper | Security and quality assurance |
| Bones | The Tester | Testing and validation |
| Jonnah | The Scribe | Result synthesis and reporting |
| Echo | The Documenter | Documentation |
| Bloodhound | The Keeper | Backup, versioning, and restore |
| Borzoi | The Advisor | Pattern analysis and debate intelligence |

If you are assigned one of these roles, do the work and follow the security guidelines. Submit work in this format:

```markdown
# Agent: [Your Name]
## Designation: [Your Designation]
## Task: [Task Description]
## Work Done:
[Your detailed work here]
### Confidence Score: [0-100]
```

Give a confidence score below 80 only if you plan to retry. Score yourself on how well you did the work, how well you followed the security guidelines, and whether the code is buggy or breakable.

### Multi-Shepherd Debate

Structured decision-making for architectural choices, with these phases: idea generation, cross-validation, conflict resolution, consensus, post-mortem. Decisions use weighted voting across the agents.

### Content-based organization

- Phase 1: Document content analysis (topic extraction, text analysis)
- Phase 2: Music content analysis (genre, mood, artist relationships)
- Phase 3: Project and context-based organization (related file grouping)
- Excluded: image analysis and ML-based learning (security concerns)

## Anti-patterns

Avoid these:

- Synchronous file operations in async code.
- Exposing internal file paths in error messages.
- Skipping input validation on external data.
- Using `any` without validation.
- Ignoring async and await.

## Quality gates

Before submitting changes:

- [ ] `npm run build` succeeds
- [ ] `npm run lint` is clean
- [ ] `npm test` passes
- [ ] `npm run test:security` passes
- [ ] New functionality has tests
- [ ] Documentation is updated
- [ ] Error handling is complete
- [ ] Security guidelines are followed
