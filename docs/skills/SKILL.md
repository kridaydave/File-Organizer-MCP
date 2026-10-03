---
name: file-organizer-dev
description: Development guide for the File Organizer MCP server codebase. Use when (1) adding new MCP tools, (2) adding new services, (3) modifying existing tools or services, (4) writing tests, (5) fixing security issues, (6) refactoring code, or (7) understanding the architecture. Provides patterns for Zod schemas, path validation, error handling, and security-hardened file operations.
---

# File Organizer MCP - Development Guide

Read `AGENTS.md` at the repo root first. It is the maintained source of truth
for this project's rules, commands and layout. This file is the longer worked
guide; where the two disagree, `AGENTS.md` is right.

To prove a change works, use the `verify-file-organizer` skill. It drives the
real server over stdio in a throwaway sandbox.

## Adding a tool

A tool is three edits: the tool file, one `reg()` line in the registry, and a
test. There is no barrel file and no router switch.

### Step 1: the tool file

Create `src/tools/my-feature.ts`:

```typescript
/**
 * File Organizer MCP Server
 * my_feature Tool
 *
 * @module tools/my-feature
 */

import { z } from "zod";
import type { ToolDefinition, ToolResponse } from "../mcp/types.js";
import { validateStrictPath } from "../services/path-validator.service.js";
import { createErrorResponse } from "../utils/error-handler.js";
import { CommonParamsSchema } from "../schemas/common.js";

// ==================== Schema ====================

export const MyFeatureInputSchema = z
  .object({
    directory: z.string().min(1, "Directory path cannot be empty").describe("Full path to the directory"),
    some_param: z.boolean().optional().default(false).describe("Description of param"),
  })
  .merge(CommonParamsSchema);

export type MyFeatureInput = z.infer<typeof MyFeatureInputSchema>;

// ==================== Tool Definition ====================

export const myFeatureToolDefinition: ToolDefinition = {
  name: "file_organizer_my_feature",
  title: "My Feature",
  description: "What this tool does. Be descriptive for LLM understanding.",
  inputSchema: {
    type: "object",
    properties: {
      directory: { type: "string", description: "Full path to the directory" },
      some_param: { type: "boolean", description: "What it does", default: false },
      response_format: { type: "string", enum: ["json", "markdown"], default: "markdown" },
    },
    required: ["directory"],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
};

// ==================== Handler ====================

export async function handleMyFeature(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = MyFeatureInputSchema.safeParse(args);
    if (!parsed.success) {
      return {
        content: [{ type: "text", text: `Error: ${parsed.error.issues.map((i) => i.message).join(", ")}` }],
        isError: true,
      };
    }

    const { directory, some_param, response_format } = parsed.data;

    // Path validation is mandatory and comes before any service call.
    const validatedPath = await validateStrictPath(directory);

    const result = await myService.doSomething(validatedPath, some_param);

    if (response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
    return { content: [{ type: "text", text: formatMyFeature(result) }] };
  } catch (error) {
    return createErrorResponse(error);
  }
}
```

Annotations must be honest. A client reads `destructiveHint` to decide whether to
prompt a human, so a wrong hint is a user-facing bug.

### Step 2: register it

Add an import and one `reg()` entry to `src/mcp/registry.ts`. The `entries`
array near the bottom is the whole registry; `TOOLS` and `toolHandlers` are
derived from it.

```typescript
import {
  myFeatureToolDefinition,
  handleMyFeature,
} from "../tools/my-feature.js";

// ...inside the entries array
reg(myFeatureToolDefinition, handleMyFeature),
```

`src/server.ts` routes through `getToolHandler(name)` and needs no edit. Adding
a case to a switch there would create a tool the client never sees.

### Step 3: test it

```typescript
import { jest } from "@jest/globals";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { handleMyFeature } from "../../../src/tools/my-feature.js";

describe("handleMyFeature", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-myfeature-"));
  });

  afterEach(async () => {
    // Windows holds file locks briefly; the delay avoids a flaky teardown.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("rejects a path outside the allowed directories", async () => {
    const result = await handleMyFeature({ directory: "/etc", response_format: "json" });
    expect(result.content[0].text).toContain("Access Denied");
  });
});
```

Assert on observable behavior. A test that would still pass if the handler
returned `undefined` is testing nothing.

## Where code lives

```
src/
├── server.ts              # MCP server, routes via getToolHandler
├── mcp/                  # registry, defineTool, context, bootstrap, cli, types
├── tools/                # one file per tool group: definition + handler
├── schemas/              # Zod inputs: common, scan, organize, system, output
├── core/                 # pure, stateless business logic
│   ├── io/               # readFile(): validate, sensitive gate, fs
│   ├── scan/  categorize/  organize/  hash/
│   ├── config/           # platform defaults, loader, paths
│   └── types/            # shared FileInfo, Organize, category types
├── services/             # facades over core + metadata/{image,audio}
├── security/             # archive validation, security constants
├── tui/                  # setup wizard
└── utils/                # logger, error-handler, path-security, formatters
```

Business logic goes in `src/core/`, not `src/services/`. `src/services/` holds
facades and metadata extraction. Tests live in `tests/unit/services/` and
`tests/integration/` regardless of which source directory the code came from.

## Security

Every path reaches `fs` through the validator. Nothing bypasses it.

```typescript
import { validateStrictPath } from "../services/path-validator.service.js";

const validated = await validateStrictPath(userInput);
```

A handler receives an optional `ToolContext` as its second argument. It carries
config and the history logger; it is not a validation shortcut. Call
`validateStrictPath` directly.

The rules that matter:

1. Validate before any filesystem call, including reads.
2. Never trust a user-supplied path, even one that came from a previous tool.
3. Use `O_NOFOLLOW` and per-component symlink containment so a link cannot
   escape its allowed root.
4. Use `constants.COPYFILE_EXCL` for atomic copies.
5. Reject Windows reserved names on every entry point.
6. Never put a real path in an error message. Use `sanitizeErrorMessage()` and
   throw `AccessDeniedError` or `ValidationError`.

## Testing

```typescript
describe("MyService", () => {
  let service: MyService;
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-"));
    service = new MyService();
  });

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("rejects a path outside the allowed directories", async () => {
    await expect(service.doSomething("/etc/passwd")).rejects.toThrow(AccessDeniedError);
  });
});
```

Seed fixtures with real shapes. An empty directory proves nothing.

## Conventions

| Thing | Convention | Example |
| --- | --- | --- |
| Files | kebab-case | `path-validator.service.ts` |
| Classes | PascalCase | `PathValidatorService` |
| Functions | camelCase | `validatePath()` |
| Constants | SCREAMING_SNAKE | `MAX_FILE_SIZE` |
| Interfaces | PascalCase | `ToolResponse` |

Imports use `.js` extensions because the build is ESM. Relative paths only, no
path aliases.

## Available utilities

Verify a helper exists before using it. `src/utils/formatters.ts` exports
`formatBytes` and `formatDate`; `src/utils/file-utils.ts` exports `fileExists`,
`ensureDir`, `expandHomePath`, `expandEnvVars`, `normalizePath` and `isSubPath`.
There is no `pluralize` helper.

```typescript
import { fileExists } from "../utils/file-utils.js";
import { formatBytes } from "../utils/formatters.js";
```

## Commands

```bash
npm run build           # tsc to dist/
npm test                # jest
npm test tests/unit/services/organizer.test.ts   # one file
npm run test:security   # path and access control suite
npm run lint
npm run format
node scripts/check-doc-citations.mjs   # agent docs still point at real code
```

## Common problems

| Symptom | Cause |
| --- | --- |
| Tool not visible to the client | Missing `reg()` entry in `src/mcp/registry.ts` |
| `Path is outside allowed directories` | Directory not in `customAllowedDirectories`; run `file_organizer_doctor` |
| `Cannot find module` after editing | Stale `dist/`, run `npm run build` |
| Type error after a signature change | A caller still passes the old shape |
| Windows test flake on cleanup | Add the 100ms delay before `fs.rm` |
| Import error at runtime | Missing `.js` extension |

## Before you finish

Run the build, lint the files you touched, and run the tests for them. If you
changed path validation or anything crossing into `fs`, run
`npm run test:security`. Then prove the real behavior through the
`verify-file-organizer` skill rather than trusting the unit tests alone.
