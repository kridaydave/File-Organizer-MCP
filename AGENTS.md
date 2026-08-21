# File Organizer MCP

File Organizer MCP is a security-hardened Model Context Protocol server for intelligent file organization. A single Node process exposes typed tools over stdio — scan, categorize, deduplicate, organize, and rollback — with 8-layer path validation on every filesystem touch.

You can think of it as a "bring-your-own-directory" organizer that works with any MCP client (Claude Desktop, Codex, Cursor, OpenCode) without leaking paths or holding state.

## What makes File Organizer special?

We have users who trust this with their real home directories. It's important we keep the things they trust as we simplify.

### 1. Security without compromise

Every path goes through 8-layer validation before we touch `fs`. Whitelist + blacklist, symlink containment per-component, `O_NOFOLLOW`, atomic moves, no path leaks in errors. If a change weakens this, it's wrong.

### 2. Simple systems over clever ones

The core is `scan -> categorize -> plan -> move`. Prefer a straight `fs` call and a Zod parse over a framework. Don't preserve complexity just because it already exists. Don't add machinery because it looks impressive.

### 3. Stateless and fast

The MCP server is request/response. No in-memory session, no global singletons, no watchers inside the server. Tools are pure `(args, ctx) -> result`. We stream large files, batch operations, and limit concurrency. Performance regressions often come from loading whole files or holding handles too long — audit those first.

## A note from kriday

I like ambitious ideas, simple systems, and software that feels obvious. YAGNI is not a slogan — it's how we keep this small. Fight scope creep. If the churn makes the correct behavior more surprising, undo it.

Channel both "measure twice, cut once" and "yagni". Honor the intent in a minimal and realistic way. If a rule below fights the task, say so loudly and get a sign-off before breaking it.

## A small glossary

Use this language so we stay on the same page:

- **you** means the agent reading this file and changing the repo.
- **we / maintainers** means kriday and people building this.
- **user** means the person running the MCP server on their machine.
- **agent / client** means the LLM or MCP client calling our tools.
- **tool** means one MCP tool (e.g. `file_organizer_scan_directory`).
- **service** means business logic behind a tool (scanner, categorizer, organizer).
- **environment** means one running MCP server + its allowed directories + OS.
- **turn** means one tool call cycle, including validation and response.
- **T3 home** analogy: for us it's the OS config dir (`~/.config/file-organizer-mcp` / `%APPDATA%`) where `config.json` and `history.jsonl` live.

## The three ways to hurt yourself

1. **Touching the live home.** Never run a tool or service against the developer's real home without `validateStrictPath`. Your worktree is `/home/kriday/File-Organizer-MCP` — that's the only safe playground. Reading allowed dirs is fine; writing to `~/Documents` or `~/.config/file-organizer-mcp` for real data is not. Use `tests/sandbox/` or `os.tmpdir()` for test data.

2. **Killing by pattern.** Never `pkill -f node`, `pgrep | kill`, or `kill` a PID you matched by name/path. Your own agent has this worktree path in its argv and several dev servers may be running. Kill only a PID you spawned, or the port owner from `ss -H -ltnp` after checking `/proc/<pid>/cwd` is your worktree.

3. **Baking in paths.** Never hardcode `process.cwd()`, `os.homedir()`, or absolute test paths into schemas, tools, or snapshots. Allowed roots are platform-aware and user-configurable via `src/config.ts:100`. Tests that bake `/home/kriday` will fail on Windows/macOS and leak intent. Derive from `CONFIG.paths` or inject via `ValidatePathOptions`.

## Hit every surface

The most common defect here is a change that works for one tool and is missing everywhere else. Before calling work done, walk this list:

- **Entry points.** A behavior reachable from one tool is often also reachable from `organize_files`, `preview_organization`, and `undo`. Fixing one is not fixing the feature.
- **Tools.** `src/tools/*.ts` — each tool needs schema + handler + registration in `src/tools/index.ts:234` + routing in `src/server.ts:124`. Shared logic lives in `src/services/`, `src/schemas/`.
- **Schemas.** External input is typed in `src/schemas/`. Change the schema and the server, tests, and `API.md` all follow.
- **Security.** Anything crossing into `fs` is typed via `PathValidatorService` and Zod. Change the validation and scanner, organizer, reader, and history logger all follow.
- **Reverse states.** If you added a way in, add the way out and the way to see it. Organize needs preview + undo + history. Watch needs unwatch + list.
- **Contracts.** Anything crossing the wire is a `ToolDefinition` in `src/types.ts:260`. `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`) must be honest or the client will make bad decisions.
- **Docs.** Behavior a user notices → `README.md`; structural change → `ARCHITECTURE.md`; tool shape → `API.md` + `config.schema.json`; new vocabulary → `docs/FRAMEWORK.md`.

## Dev servers

- `npm install` installs. If module resolution looks broken, `dist/` is stale — run `npm run build`.
- `npm run dev` builds and starts the stdio server. `npm run build:watch` for tight loops. State defaults to the OS config dir, not the worktree.
- `npm run setup` runs the TUI wizard (`src/tui/setup-wizard.ts:1`).
- Don't start a second server against the same OS config dir in another terminal without knowing it — you'll get lock contention on `history.jsonl`.
- Stop what you started, by the PID you tracked. See rule 1.

## Test data

An empty directory is a bad test. Seed with real shapes, but keep them in the sandbox:

- Use `tests/sandbox/` or `await fs.mkdtemp(path.join(os.tmpdir(), 'test-'))` — never `~/Documents` or `~/.t3`.
- Copy real fixtures only if needed; `src/constants/file-signatures.ts:1` has canonical signatures. Don't invent magic bytes.
- Bring `operations.jsonl` or `config.json` only if the flow under test needs them. Copy in, never symlink. Data flows one way: into your sandbox, never back out.
- On Windows, add a 100ms delay before `fs.rm` in `afterEach` to avoid file-lock flakes:

  ```ts
  afterEach(async () => {
    await new Promise(r => setTimeout(r, 100));
    await fs.rm(testDir, { recursive: true, force: true });
  });
  ```

## Verifying

- Smallest proof that the change works. `npm test tests/unit/services/your-service.test.ts` for the files you touched, targeted lint/typecheck for the scope you changed.
- **Do not run repo-wide checks** unless asked. No `npm run test:coverage` sweep, no `npm run lint` across everything unless you changed the rule. CI owns the full suite.
- Backend behavior changes ship with focused tests for that behavior. Services are unit-tested in isolation; tools have integration tests in `tests/integration/`.
- The organizer is async and event-ish (history logger, rollback). Wait on receipts/awaited promises, never on `setTimeout` polling. A test that needs a sleep to pass is wrong.
- For user-visible tool output, check both `json` and `markdown` formats — both are part of the contract.

## Pull requests

- Never make a PR unless the developer explicitly asks.
- Conventional titles, plain language: `fix(organizer): atomic move now uses COPYFILE_EXCL`.
- Body: problem in 1–2 sentences, then how you fixed it. End with the model and harness that did the work.
- Behavior or error-message changes need a quick before/after in the description. Keep it factual, no superlatives.
- One concern per PR. If the description says "also", split it.
- When babysitting: poll checks/comments newer than last push, verify each finding against source, fix real ones, dismiss false positives with reason. Stay quiet when nothing is new. Stop when green on latest commit.

## Plans and work artifacts

- Do not commit implementation plans, research notes, or scratch files. Keep temporary material outside the worktree. `docs/implementation/` is for durable phase docs only.
- Track active work in the GitHub issue that owns it.
- Put durable architecture, constraints, and decisions in `ARCHITECTURE.md` and `docs/internals/`. Update those when the product changes so the next agent finds current facts, not abandoned intent.
- A merged PR is the implementation record. Close its tracking item; don't keep a second checklist in the repo.

## How it works

Client sends a JSON-RPC tool call over stdio → `src/server.ts:56` creates the MCP server and registers `TOOLS` → `src/tools/index.ts:234` maps name to handler → handler validates with Zod (`src/schemas/*`) then `validateStrictPath` (`src/services/path-validator.service.ts:239`) → calls a service (`scan`, `categorize`, `organize`, `hash`, `rollback`) → formats `ToolResponse` (`src/types.ts:253`) → server returns it. Services are pure and stateless; per-request `ctx` carries config and logger. Side effects (history, backups, rollback manifests) are file-backed, not in memory.

Full tour: `ARCHITECTURE.md` + `docs/FRAMEWORK.md`.

## Where code lives

```
File-Organizer-MCP/
├── src/
│   ├── server.ts              # MCP server, tool registration (stateless)
│   ├── index.ts               # CLI entry, preflight, graceful shutdown
│   ├── config.ts              # Platform-aware allowed dirs + user config
│   ├── types.ts               # Shared ToolResponse / FileInfo / Organize types
│   ├── constants.ts           # Category maps + limits
│   ├── services/              # Business logic (each <300 lines after churn)
│   │   ├── path-validator.service.ts
│   │   ├── file-scanner.service.ts
│   │   ├── categorizer.service.ts
│   │   ├── organizer.service.ts
│   │   ├── duplicate-finder.service.ts
│   │   ├── rollback.service.ts
│   │   └── history-logger.service.ts
│   ├── tools/                 # MCP tool handlers (one file per tool group)
│   ├── schemas/               # Zod schemas (one per tool group)
│   ├── readers/               # Secure file reading (thin wrapper, not a framework)
│   ├── tui/                   # Setup wizard
│   └── utils/                 # logger, error-handler, file-utils, path-security
├── tests/
│   ├── unit/                  # service + util tests
│   ├── integration/           # tool wiring tests
│   └── performance/           # benchmarks
├── bin/                       # file-organizer-mcp, file-organizer-setup
├── docs/                      # FRAMEWORK.md, implementation notes, docs/skills/
│   └── skills/                # Kimi/opencode dev skill (not product)
├── examples/                  # config.strict.json, config.sandboxed.json, mcp-clients/
├── scripts/                   # postinstall, prepare, benchmarks
└── reports/                   # phase reports
```

`dist/`, `node_modules/`, `coverage/`, `.jest-cache/`, `.file-organizer-*` are gitignored and generated.

## Taste

- Complexity belongs at the validation boundary. Services stay pure, tools stay thin, handlers stay honest.
- Inferred types over annotations. `any` is the enemy — use `unknown` + Zod.
- Comments describe how a thing is used and move when the code moves. Use them to describe functions, not to narrate every line.
- Don't preserve complexity just because it already exists. Don't ship machinery that looks impressive but doesn't change the answer.
- Errors are part of the interface. Never leak internal paths; use `sanitizeErrorMessage()` (`src/utils/error-handler.ts:1`). Throw `ValidationError` / `AccessDeniedError` (`src/types.ts:296`) and let `createErrorResponse` format them.
- If a schema or tool adds a new field, grep `tests/` and `API.md` before calling it done.

## Commands

Quick reference you will actually use:

```bash
npm run build                              # tsc to dist/
npm run build:watch                        # watch mode
npm run dev                                # build + start stdio server
npm run clean                              # rm dist/

npm test                                   # all tests (Jest, ESM)
npm test tests/unit/services/organizer.test.ts  # single file
npm run test:security                      # path + access control suite
npm run test:coverage                      # with coverage

npm run lint                               # eslint src + tests
npm run lint:fix                           # auto-fix
npm run format                             # prettier src/

npm run setup                              # TUI wizard
```

## Quality gates

Before submitting changes:

- [ ] `npm run build` succeeds
- [ ] `npm run lint` is clean for files you touched
- [ ] `npm test` for those files passes
- [ ] `npm run test:security` passes if you touched `path-validator` or `path-security`
- [ ] New behavior has a test
- [ ] Errors don't leak paths
- [ ] Docs updated if you changed a tool shape or security rule

## Additional tips

- Don't verify with browsers unless the user asks — this is a stdio server, not a web app.
- Security matters but don't over-index for maintainer-only scripts. For user-facing tools, it matters absolutely.
- When in doubt, do less. Ship the smallest model that makes the correct behavior unsurprising.
