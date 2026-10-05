# File Organizer MCP

File Organizer MCP is a security-hardened Model Context Protocol server for intelligent file organization. A single Node process exposes typed tools over stdio — scan, categorize, deduplicate, organize, and rollback — with layered path validation on every filesystem touch.

You can think of it as a "bring-your-own-directory" organizer that works with any MCP client (Claude Desktop, Codex, Cursor, OpenCode) without leaking paths or holding state.

## What makes File Organizer special?

We have users who trust this with their real home directories. It's important we keep the things they trust as we simplify.

### 1. Security without compromise

Every path goes through `validatePathBase` before we touch `fs`. Whitelist + blacklist, symlink containment per-component, `O_NOFOLLOW`, atomic moves, no path leaks in errors. If a change weakens this, it's wrong.

### 2. Simple systems over clever ones

The core is `scan -> categorize -> plan -> move`. Prefer a straight `fs` call and a Zod parse over a framework. Don't preserve complexity just because it already exists. Don't add machinery because it looks impressive.

### 3. Stateless and fast

The MCP server is request/response. No in-memory session, no global singletons, no watchers inside the server. Tools are pure `(args, ctx) -> result`. We stream large files, batch operations, and limit concurrency. Performance regressions often come from loading whole files or holding handles too long — audit those first.

## A note from kriday — creator

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
- **K5 home** analogy: for us it's the OS config dir (`~/.config/file-organizer-mcp` / `%APPDATA%`) where `config.json` and `history.jsonl` live.

## The three ways to hurt yourself

1. **Touching the live home.** Never run a tool or service against the developer's real home without `validateStrictPath`. Your worktree is `/home/kriday/File-Organizer-MCP` — that's the only safe playground. Reading allowed dirs is fine; writing to `~/Documents` or `~/.config/file-organizer-mcp` for real data is not. Use `tests/sandbox/` or `os.tmpdir()` for test data.

2. **Killing by pattern.** Never `pkill -f node`, `pgrep | kill`, or `kill` a PID you matched by name/path. Your own agent has this worktree path in its argv and several dev servers may be running. Kill only a PID you spawned, or the port owner from `ss -H -ltnp` after checking `/proc/<pid>/cwd` is your worktree.

3. **Baking in paths.** Never hardcode `process.cwd()`, `os.homedir()`, or absolute test paths into schemas, tools, or snapshots. Allowed roots are platform-aware and user-configurable via `src/core/config/loader.ts:111` (`loadCustomAllowedDirs`). Tests that bake `/home/kriday` will fail on Windows/macOS and leak intent. Derive from `CONFIG.paths` or inject via `ValidatePathOptions`.

   CI runs 6 legs (3 OS × Node 20/22) and a green Linux run proves nothing about the other five. Five ways a platform value leaks into a contract or an assertion. Check each before you push:

   - **A raw absolute path in an assertion.** `/var` becomes `/private/var` on macOS; `RUNNER~1` becomes `runneradmin` under Windows 8.3. Either canonicalise the expectation with `fs.realpath`, or assert on `path.relative(root, actual)` or `path.basename`.
   - **Unsorted `fs.readdir` compared with `toEqual`.** Directory order is filesystem-dependent and unspecified. `.sort()` both sides, always.
   - **`path.sep` leaking into a logical string.** A folder label, plan id, or reported relative name is a contract value and must be `/`-separated on every OS. Build those with plain template literals, never `path.join`. See `dateFolder()` in `src/core/organize/date-organizer.ts:270`, which returns `` `${year}/${month}` `` and cannot drift by platform. A genuine filesystem path is fine as `path.join`; the difference is whether a human reads the value.
   - **`path.relative()` across a realpath boundary.** Spell a path one way and resolve it another and the result collapses into a `../../../..` chain. Canonicalise once in `beforeEach`, not per assertion.
   - **A test that cannot fail.** If the setup it depends on silently no-ops, the test is green for the wrong reason. Assert the setup fired: `expect(swapped).toBe(true)` at `tests/unit/core/scan/sensitive-scan.test.ts:539`. Then break the code under test and confirm the test goes red before you trust it.

   Still unfixed, and the reason the rule above is not optional: `src/tools/metadata-inspection.ts:197` builds `organizationPath` with `path.join`, so on Windows the tool reports `Images\2024\05\IMG_0001.jpg` where the contract is `Images/2024/05/IMG_0001.jpg`.

## Hit every surface

The most common defect here is a change that works for one tool and is missing everywhere else. Before calling work done, walk this list:

- **Entry points.** A behavior reachable from one tool is often also reachable from `organize_files`, `preview_organization`, and `undo`. Fixing one is not fixing the feature.
- **Tools.** `src/tools/*.ts` — each tool needs schema + handler + registration in `src/mcp/registry.ts` (one `reg()` line) + routing in `src/server.ts`. Shared logic lives in `src/core/`, `src/schemas/`.
- **Schemas.** External input is typed in `src/schemas/`. Change the schema and the server, tests, and `API.md` all follow.
- **Security.** Anything crossing into `fs` is typed via `PathValidatorService` and Zod. Change the validation and scanner, organizer, reader, and history logger all follow.
- **Reverse states.** If you added a way in, add the way out and the way to see it. Organize needs preview + undo + history. Watch needs unwatch + list.
- **Contracts.** Anything crossing the wire is a `ToolDefinition` in `src/mcp/types.ts:16`. `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`) must be honest or the client will make bad decisions.
- **Two schemas per tool, only one checked.** Every tool definition carries a hand-written JSON `inputSchema` next to its Zod schema in `src/schemas/`. The Zod schema is what the handler parses with; the JSON one is the contract the MCP client actually reads off the wire. They are separate sources of truth for the same field set and nothing keeps them in step: `tsc` sees the Zod type, the build never looks at the JSON, and `docs:check` reads neither. Add a field to one and the server either rejects a call the client was told it could make, or the client cannot see a field the server honours. Editing only Zod is the more tempting mistake, because it is the one the compiler accepts. The guard today is the assertion in `tests/integration/tools/preview-since-last-run.test.ts` comparing `Object.keys(def.inputSchema.properties)` against `Object.keys(Schema.shape)`, which is one tool, not a rule.
- **Docs.** Behavior a user notices → `README.md`; structural change → `ARCHITECTURE.md`; tool shape → `API.md` + `config.schema.json`; new vocabulary → `docs/FRAMEWORK.md`. `API.md` is not generated in practice: `scripts/generate-docs.js` still reports version 3.0.0 and reformats every table, so running `npm run docs:generate` produces a large unrelated diff and drops the hand-written notes. Hand-edit the tool's parameter table instead.

## Skills

**Project-local.** `verify-file-organizer` in `.opencode/skills/verify-file-organizer/`
drives the real built server over stdio inside a throwaway sandbox. Reach for it
whenever you touch a tool handler, the organizer, rollback, config loading, or
the path validator, and before claiming a change works. Its `references/features/`
maps all 24 tools to how to drive them. See [Proving a change](#proving-a-change).

**Global.** Your skill list is already in context with each skill's own trigger
conditions, so read those rather than a table here. Two things worth knowing
that a list cannot tell you:

```bash
ls ~/.config/opencode/skills    # OpenCode; also ~/.claude/skills, ~/.agents/skills
readlink -f ~/.config/opencode/skills/<id>   # which collection a skill came from
```

Skills arrive as symlinks from collection checkouts under `~/fleet/`, so an
installed skill is someone else's source. Do not edit one to change this repo's
workflow. `writing-for-agents` covers editing this file or any SKILL.md.

Repo facts a generic skill does not know, which is where they belong:

- Split parallel work by tool group and by test directory. Two workers in one
  file produce a conflict, not a speedup. A subagent has your tools, so hand it
  a disjoint file list plus the verification contract it must satisfy.
- Delegated work needs the sandbox rule stated in the prompt. A subagent asked to
  organize files will otherwise use the developer's real home directory.
- A design for this repo belongs in `src/core/`, and external input is typed in
  exactly one place, `src/schemas/`. New business logic does not go in
  `src/services/`, which holds facades.
- Name the principle that changed your decision in your reply. That is how the
  next agent learns which one was load-bearing here.

## Merging and conflicts

Every tool PR edits the same few coordinates: an import block and one `reg()` line in `src/mcp/registry.ts`, the README tool count, and ARCHITECTURE.md. That is the documented contract (`ARCHITECTURE.md:112`), so parallel tool PRs collide on every merge. `main` also runs `strict: true` with 9 required checks, no merge queue, and no auto-merge, so every merge makes every other open branch stale and merges are serial. Plan for that instead of discovering it halfway through a batch.

Most of the damage is not the conflict, it is the resolution. Four rules:

- **Never `git add -A` after resolving a conflict.** It stages every *other* conflicted file with its `<<<<<<<` still in it. `git add` only the paths you actually resolved.
- **Check for markers before every commit that follows a resolution.** Two branches shipped committed `<<<<<<<`/`=======` and needed four cleanup commits on `main`:
  ```bash
  grep -rnE '^(<<<<<<<|=======|>>>>>>>)' --include='*.ts' --include='*.md' . && exit 1
  ```
- **Prove the tool set survived.** A rebase that resolves `registry.ts` by taking one side can silently delete tools that merged in between. This must be empty:
  ```bash
  comm -3 <(git show ORIG_HEAD:src/mcp/registry.ts | grep -oP '^\s+reg\(\K\w+' | sort) \
          <(grep -oP '^\s+reg\(\K\w+' src/mcp/registry.ts | sort)
  ```
- **Run `npm run docs:check` after every resolution**, not once at the end. A squash merge truncated an ARCHITECTURE.md paragraph and the count test stayed green, because the count test does not read prose.

Before you push a branch that adds a tool, check what it will collide with while you still have the context. Finding out during a batch merge means reading a transcript instead of the code:

```bash
git fetch -q origin main && git merge-tree --write-tree --name-only origin/main HEAD | grep "Merge conflict in"
```

Conflicts in README.md and ARCHITECTURE.md are decisions, not merges. Read both sides and keep both unless one is genuinely wrong. An automated union will duplicate whatever sits on both sides.

## Dev servers

- `npm install` installs. If module resolution looks broken, `dist/` is stale — run `npm run build`.
- `npm run dev` builds and starts the stdio server. `npm run build:watch` for tight loops. State defaults to the OS config dir, not the worktree.
- `npm run setup` runs the TUI wizard (`src/tui/index.ts`).
- Don't start a second server against the same OS config dir in another terminal without knowing it — you'll get lock contention on `history.jsonl`.
- Stop what you started, by the PID you tracked. See rule 1.

## Test data

An empty directory is a bad test. Seed with real shapes, but keep them in the sandbox:

- Use `tests/sandbox/` or `await fs.mkdtemp(path.join(os.tmpdir(), 'test-'))` — never `~/Documents` or `~/.k5`.
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
- **`npm run typecheck:tests` is a gate.** It sat at 327 errors in no gate for a long time, so nobody saw them. It is clean now and belongs in `verify:all` and CI. Run it whenever you touch a test or a type.
- Backend behavior changes ship with focused tests for that behavior. Services are unit-tested in isolation; tools have integration tests in `tests/integration/`.
- The organizer is async and event-ish (history logger, rollback). Wait on receipts/awaited promises, never on `setTimeout` polling. A test that needs a sleep to pass is wrong.
- For user-visible tool output, check both `json` and `markdown` formats — both are part of the contract.
- A passing unit test is not proof the tool works. `principle-prove-it-works` means the real artifact. Drive it through `verify-file-organizer`.

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

Client sends a JSON-RPC tool call over stdio → `src/server.ts` creates the MCP server and registers `TOOLS` from `src/mcp/registry.ts` (name → handler map) → handler validates with Zod (`src/schemas/*`) then `validateStrictPath` (`src/services/path-validator.service.ts:369`) → calls a service (`scan`, `categorize`, `organize`, `hash`, `rollback`) → formats `ToolResponse` (`src/mcp/types.ts:16`) → server returns it. Services are pure and stateless; per-request `ctx` carries config and history logger. Side effects (history, backups, rollback manifests) are file-backed, not in memory.

Full tour: `ARCHITECTURE.md` + `docs/FRAMEWORK.md`.

## Where code lives

```
File-Organizer-MCP/
├── src/
│   ├── server.ts              # createServer() + handleToolCall() (stateless routing)
│   ├── index.ts               # CLI entry: main() only
│   ├── mcp/                   # registry (tool map), defineTool, context, bootstrap, cli
│   ├── tools/                 # one file per tool group: ToolDefinition + handler
│   ├── schemas/               # Zod input schemas: common, scan, organize, system
│   ├── core/                  # business logic, pure + stateless
│   │   ├── io/                # readFile(): validate → sensitive gate → fs
│   │   ├── scan/              # scanner
│   │   ├── categorize/        # rules, extension map, magic-byte sniff
│   │   ├── organize/          # organizer, rename, rollback (+ manifest integrity)
│   │   ├── hash/              # hasher, duplicate-finder
│   │   ├── config/            # platform-aware defaults, loader, paths
│   │   └── types/             # shared FileInfo / Organize / category types
│   ├── services/              # facades + metadata/{image,audio} + history-logger
│   ├── extensions/scheduler/  # cron watch daemon + watch-cli (own bin)
│   ├── security/              # archive validation, security constants
│   ├── tui/                   # setup wizard
│   └── utils/                 # logger, error-handler, path-security, formatters
├── tests/
│   ├── unit/                  # service + util tests
│   ├── integration/           # tool wiring tests
│   └── performance/           # benchmarks
├── bin/                       # file-organizer-mcp, file-organizer-setup, file-organizer-watch
├── docs/                      # FRAMEWORK.md, implementation notes, docs/skills/
├── examples/                  # config.strict.json, config.sandboxed.json, mcp-clients/
├── scripts/                   # postinstall, prepare, benchmarks, security-gates, check-doc-citations
├── tests/helpers/             # safe-index: throws on absent, so an assertion can't pass vacuously
└── .opencode/skills/          # verify-file-organizer: drive the real server
```

`dist/`, `node_modules/`, `coverage/`, `.jest-cache/`, `.file-organizer-*` are gitignored and generated.

## Taste

- Complexity belongs at the validation boundary. Services stay pure, tools stay thin, handlers stay honest.
- Inferred types over annotations. `any` is the enemy — use `unknown` + Zod.
- Model the domain in a type, not in scattered conditionals. `ToolResponse["content"]` is a non-empty tuple because every tool returns a text block; that one decision removed 122 type errors and stopped tests from guarding an empty response that cannot happen.
- Comments describe how a thing is used and move when the code moves. Use them to describe functions, not to narrate every line.
- Don't preserve complexity just because it already exists. Don't ship machinery that looks impressive but doesn't change the answer.
- When you write the same instruction twice, encode it once. A lint, a script, or a schema constraint beats a paragraph someone has to remember. `npm run docs:check` is that rule applied to doc drift; `tests/helpers/safe-index.ts` is it applied to an absent array slot.
- Errors are part of the interface. Never leak internal paths; use `sanitizeErrorMessage()` (`src/utils/error-handler.ts:64`). Throw `AccessDeniedError` (`src/mcp/types.ts:64`) or `ValidationError` (`src/mcp/types.ts:75`) and let `createErrorResponse` format them.
- If a schema or tool adds a new field, grep `tests/` and `API.md` before calling it done.

## Quality gates

Before submitting changes:

- [ ] `npm run build` succeeds
- [ ] `npm run lint` is clean for files you touched
- [ ] `npm test` for those files passes
- [ ] `npm run typecheck:tests` is clean. It sat at 327 errors in no gate for a long time, so nobody saw them. It is a real gate now.
- [ ] `npm run test:security` passes if you touched `path-validator` or `path-security`
- [ ] New behavior has a test that fails without your change
- [ ] Errors don't leak paths
- [ ] Docs updated if you changed a tool shape or security rule
- [ ] `npm run docs:check` passes if you edited a file whose `file:line` another doc cites
- [ ] If you added or removed a tool: `npm run docs:sync`, and commit the result. Never hand-edit the tool count or the tool list in README.md / ARCHITECTURE.md — they are generated from the registry. Your branch is expected to be **self-consistent**. CI enforces, it does not repair: a branch that is stale on arrival goes red on every matrix leg. Expect to re-run `docs:sync` when a sibling tool PR merges underneath you; that is the normal cost of a generated list, not a bug in your PR.
- [ ] The behavior is proven on the real server via `verify-file-organizer`, not only by a unit test
- [ ] If you touched `path.join`, `path.sep`, or `path.relative`: you checked the value cannot reach a test assertion or a documented format string. See rule 3.
- [ ] If you resolved a conflict: no markers in the diff, and the `comm -3` on the `reg()` set is empty if `registry.ts` was involved.

`npm run verify:all` runs the first four plus docs, security, and the full
suite. Reach for it when the change is broad or when you are about to hand the
work over.

## Security notes worth knowing

The validator is solid and its throw path leaks nothing. The gaps are elsewhere,
so read this before assuming a tool is safe because it calls `validateStrictPath`.

- **Derived destinations were the real risk.** A tool that validates its input
  path and then joins a caller-supplied string onto it can still escape. Both
  such fields, `local_fallback_prefix` and `unknown_date_folder`, now use
  `FolderNameSchema`, which rejects separators and `..`. When you add a schema
  field that becomes part of a path, a bare `z.string()` is the bug.
- **`dry_run` must mean zero writes.** It means that in every tool except one.
  When you add a `mkdir`, a backup, or a manifest write, put it behind the guard
  and prove it with a test that asserts the write did not happen.
- **`ToolResponse["content"]` is a non-empty tuple.** Indexing `[0]` is total.
  A helper that throws on an empty response beats a non-null assertion in tests.
- **Success payloads carry real paths by design.** `organize_files` returns full
  `from` and `to`. Redaction is enforced on the error path, so a "no paths leak"
  test targets `createErrorResponse`, not a successful organize.
- **Six reserved-name implementations disagree** on Windows edge cases, and
  `src/core/detect/tokens.ts` is the most correct. Prefer it if you touch that
  logic. Seven is worse than two.
- **`RollbackService` takes no lock at all.** `HistoryLoggerService` serializes
  every `operations.jsonl` writer through an `operations.lock` file
  (`src/services/history-logger.service.ts:84`), and that is the only lock in
  the server. `RollbackService.listManifests` (`src/core/organize/rollback.ts`)
  and `rollback` read and delete manifest files unguarded, so two processes
  undoing at once can race on the same manifest file. This was theoretical
  while only the newest manifest was reachable by id. It is reachable now that
  ids are listed to users, so treat a missing rollback lock as a real gap
  rather than a stylistic one. Do not bolt the history lock onto
  `RollbackService` to close it: that would serialize two different resources
  and make the two files contend. Separate the shared state first.
- **`listManifests` parses every manifest without verifying signatures**, unlike
  `getManifest`, which checks the HMAC and the content hash. That was fine
  while the list only chose a default target. Now that the ids are shown to a
  user, a manifest file nobody signed is a value a user can paste back in, so
  every caller that acts on a listed id has to route through `getManifest`.
  Anything that acts on a listed manifest's *contents* without that is the hole.

## Proving a change

Unit tests call handlers directly. They do not prove the server answers a
handshake, that a tool is reachable by name, or that a move lands on disk and
undo puts it back.

Use the `verify-file-organizer` skill, in `.opencode/skills/verify-file-organizer/`.
It ships a harness that drives the real built server over stdio inside a
throwaway sandbox, so your real config dir and history are never touched.

```bash
C=.opencode/skills/verify-file-organizer/scripts/control-file-organizer.mjs
node $C doctor      # build, handshake, tool count, one read-only call
node $C tools       # all 24 tools
node $C call organize_files --directory /tmp/file-organizer-verify/default/data \
  --dry_run false --conflict_strategy rename --json
node $C call undo_last_operation --json
node $C cleanup
```

Reach for it when you touch a tool handler, the organizer, rollback, config
loading, or the path validator. Read `references/features/` for what each
capability does and how to drive it.

## Not machine-checked yet

Every rule above is a sentence in this file, so it holds exactly as well as the agent reading it. These gaps are why defects reached CI instead of your editor. None of them exist today:

- No commit hooks. No husky, no lint-staged, no `pre-push`. The four conflict rules above are manual.
- `npm run docs:check` runs in CI but only on ubuntu and only after `typecheck:tests`. `tests/unit/docs-tool-list.test.ts` still guards the count from inside the 6-leg matrix, so one stale count reports as 2 failing tests × 6 legs = 12 red checks rather than 1.
- No portability profile. Nothing runs the suite with `os.tmpdir`, `fs.readdir` order, or `fs.realpath` perturbed, so the five leak classes in rule 3 can only be found on macOS or Windows.
- `main` has `strict: true`, no ruleset, no merge queue, `allow_auto_merge: false`. Merges serialise by hand.
- The tool list and count are generated, but the hand-written tool bullets in README.md above the `<!-- BEGIN GENERATED TOOL LIST -->` marker, and the tool references in ARCHITECTURE.md, are not. Those are the two hottest conflict sites left.
- `src/mcp/registry.ts` is a hand-maintained flat array of `reg()` lines. `ARCHITECTURE.md:112` records that auto-discovery was deliberately rejected in favour of a visible one-line edit. Under parallel tool PRs, that decision is what generates the conflicts.

If you touch one of these, close it rather than working around it.

## Additional tips

- Don't verify with browsers unless the user asks — this is a stdio server, not a web app.
- Security matters but don't over-index for maintainer-only scripts. For user-facing tools, it matters absolutely.
- When in doubt, do less. Ship the smallest model that makes the correct behavior unsurprising.
- `docs/skills/SKILL.md` is the long-form guide. `AGENTS.md` wins on any conflict, and `npm run docs:check` catches a stale path reference in either.

## Commands

`npm run` lists them all. The ones you will reach for:

```bash
npm run build                              # tsc to dist/
npm run build:watch                        # watch mode
npm run dev                                # build + start stdio server

npm test                                   # all tests (Jest, ESM)
npm test tests/unit/services/organizer.test.ts  # single file
npm run test:security                      # path + access control suite
npm run typecheck:tests                    # tsc over src + tests, no emit

npm run lint                               # eslint src + tests
npm run lint:fix                           # auto-fix
npm run format                             # prettier src/

npm run docs:check                         # both: citations resolve + tool count in sync
npm run docs:check:citations:fix           # rewrite drifted file:line citations
npm run docs:check:tool-count              # tool count/list only, no citation check
npm run docs:sync                          # regenerate the tool list/count from the registry

npm run verify:all                         # build, lint, typecheck, docs, security, tests

npm run setup                              # TUI wizard
```
