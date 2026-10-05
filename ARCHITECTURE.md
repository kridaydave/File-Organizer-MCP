# Architecture

File Organizer MCP is a stateless stdio MCP server. One Node process exposes 37 typed tools over JSON-RPC. There is no session state, no in-memory cache of your files, and no background work in the core server. The core loop is `scan → categorize → plan → move`, and every filesystem touch passes through one path validator.

## Request lifecycle

```
MCP client (Claude Desktop, Codex, Cursor, OpenCode)
    │  JSON-RPC over stdio
    ▼
src/server.ts            createServer() → fresh McpServer, registerTool loop
    │
src/mcp/registry.ts      TOOLS + handler map (explicit list, no auto-discovery)
    │
src/mcp/context.ts       ctx = { config, history } built fresh per request
    │
src/tools/*.ts           thin handler: Zod parse (src/schemas/) → service call → format
    │
src/core/*               business logic (pure, stateless)
```

A tool call flows top to bottom and returns a `ToolResponse` (`json` or `markdown`). Services never import each other's singletons because there are none: anything stateful lives on disk, not in memory.

## Source layout

```
src/
├── index.ts               CLI entry: main() only
├── server.ts              createServer() + handleToolCall() (pure routing)
├── mcp/                   bootstrap, cli, registry, defineTool, context
├── tools/                 one file per tool group (handler + ToolDefinition)
├── schemas/               Zod input validation: common, scan, organize, system, output, index
├── core/
│   ├── io/                readFile(): validate → sensitive-file gate → fs.readFile
│   ├── scan/              scanner.ts: recursive scan with depth/count limits
│                           + disk-usage.ts: pure per-category byte summary
│   ├── categorize/        rules + extension map + magic-byte sniff + custom rules
│   ├── organize/          organizer, rename, rollback (+ manifest integrity), plan-validation
│   ├── hash/              SHA-256 hasher + duplicate finder
│   ├── config/            platform-aware defaults, loader, allowed paths
│   └── types/             shared FileInfo / Organize / category types
├── services/              facade re-exports + metadata/{image,audio} + history logger + path validator (see Security)
├── extensions/scheduler/  cron watch daemon + its own bin (bin/file-organizer-watch.mjs)
└── utils/                 logger, error-handler (path-safe messages), formatters
```

The scheduler is a separate process by design. It has its own bin, its own state file, and the core server does not import it. Its internal singletons are fine there because it runs alone.

## State is file-backed

Side effects live on disk in the platform config dir (`~/.config/file-organizer-mcp/` or `%APPDATA%`):

| File               | Owner                                                       |
| ------------------ | ----------------------------------------------------------- |
| `config.json`      | user config: allowed dirs, defaults, custom rules           |
| `operations.jsonl` | history logger, append-only behind a cross-process lockfile |
| `rollbacks/*.json` | rollback manifests written by every organize run            |

Nothing else survives a restart. Kill the process mid-run and the manifest tells you what happened; `undo` replays it.

A manifest carries two different digests. `manifest.hash` and `manifest.signature` cover the manifest's own actions list, which is what makes a tampered manifest fail to verify. `action.contentHash` is the sha256 of a file's bytes at the path the action left it at, recorded within a 32 MB budget per manifest so `verify_integrity` can rehash later and report drift. Both fields on an action are optional, so a manifest written before content hashing existed still loads and still undoes.

## Security

### Path validation pipeline

Every path reaches `fs` through `validatePathBase` in
`src/services/path-validator.service.ts`, which applies these checks in order.
`validateStrictPath` is the entry point most tools use.

```
Input Path
    ↓
1.  Schema: string, length, no NUL, no literal ".." segment   (PathSchema)
2.  Normalize: URI-decode, Unicode NFC, strip ~ and $VAR, path.normalize
3.  Reject control characters and the characters <>"|?*
4.  Reject a basename that is a Windows device name
5.  Resolve against basePath
6.  isPathAllowed: blacklist, then the allowed-roots whitelist
7.  Symlink containment: realpath, checked per component
8.  Existence and access: fs.access
    ↓
Validated Path
```

Two of these are conditional. Step 8 runs only when a caller asks for
`requireExists` or `checkWrite`, and `validateStrictPath` asks for neither, so a
plain tool call does not stat the path. Step 7 always runs.

`allowSymlinks` defaults to true. When a caller sets it false, an extra `lstat`
walk runs before step 7 to reject symlinked components.

Allowed roots are platform-aware and user-configured; nothing hardcodes a home
directory. `file_organizer_doctor` reports the effective allow-list and flags
any entry that is missing or policy-blocked.

### TOCTOU protection

Validation can be raced, so reads and writes do not trust earlier checks:

- Files open with `O_NOFOLLOW`; the fd is used directly after validation.
- Copies use `COPYFILE_EXCL` (fail if destination exists); moves use atomic `rename`.
- Overwrites go to a temp file in the target directory, then atomic rename, with a backup kept first.
- The sensitive-file gate (`core/io/sensitive-files.ts`) runs before any read.

Known limits: Windows deletion locks by path rather than fd, and symlinks are blocked outright even when legitimate.

### Resource limits

```ts
MAX_FILE_SIZE = 100 MB      // per file read/hash
MAX_FILES     = 10_000      // per operation
MAX_DEPTH     = 10          // directory recursion
MAX_PATH_LEN  = 4096        // characters
```

### Error hygiene

Errors crossing the wire pass through `sanitizeErrorMessage()` (`src/utils/error-handler.ts`). Internal paths never appear in tool responses; handlers throw `ValidationError` / `AccessDeniedError` and `createErrorResponse` formats them.

## Adding a tool

One new file plus one registry line. Create `src/tools/my-tool.ts` exporting a `ToolDefinition` + handler, then add an import and one `reg()` entry in `src/mcp/registry.ts`. Schemas go in `src/schemas/`. Nothing else changes: the registry header documents this contract, and auto-discovery was deliberately rejected (fs-scanning `dist/` trades a visible one-line edit for invisible wiring).

If a tool adds a way in, add the way out and the way to see it: organize ships with preview and undo; both write history you can view.

## Testing

- `tests/unit/` — services tested in isolation against temp dirs
- `tests/integration/` — tool wiring through the real schema + validator path
- `scripts/security-gates/` — path-traversal fuzzing, TOCTOU races, sensitive-file patterns, static analysis

Tests derive all paths from `os.tmpdir()` or `tests/sandbox/`. A test that needs `sleep()` to pass is wrong; wait on receipts instead.

## Performance

The lean-v5 shape was benchmarked against v3.5.0 — preview/organize 12–35× faster with the content-analysis stack removed, the tested large-directory organize scenarios completing without failures where v3.5 failed them, path-validation cost unchanged. Numbers and method: `docs/benchmarks-v5-vs-v3.5.md`.
