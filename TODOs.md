# TODOs — Simplify Churn

Tracking the big churn: kill god files, simpler MCP DX, simpler refactor, less over-eng, proper statelessness, clean repo.

Branch: `chore/simplify-v5` · Base: `main` → target: `v5.0.0` lean

---

## Phase-0 — Repo hygiene [DONE]

Make root look like a single npm package, not a monorepo.

- [x] Update `.gitignore` — ignore `CD_res/`, `data/`, `Desktop/`, `Local-Model-Configs/`, `implementation_plan.md.resolved`, `test-templates.js`, `/skills/`, `/config.json`
- [x] `Local-Model-Configs/*` → `examples/mcp-clients/*` (6 files)
- [x] `skills/*` → `docs/skills/*`
- [x] `config.json` → `examples/config.example.json` (keep `config.schema.json` as source of truth)
- [x] Delete `test-templates.js` (dead code), `implementation_plan.md.resolved` (old plan), empty `Desktop/`
- [x] Update `AGENTS.md:62` tree to reflect new layout
- Commit `8a01086` · `d19248f` · `d5513e2`

## Phase-1 — Kill god files [DONE]

No file >300 lines. Splits only, no behavior change. `npm test` must stay green.

- [x] `src/types.ts:645` → `src/core/types/{files.ts,categories.ts,organize.ts,system.ts}` + `src/mcp/types.ts`
- [x] `src/config.ts:605` → `src/core/config/{defaults.ts,loader.ts,security.ts,paths.ts}`
- [x] `src/index.ts:344` → `src/mcp/cli.ts` + `src/mcp/bootstrap.ts` + `src/index.ts` (just `main()`)
- [x] `src/services/categorizer.service.ts:1246` → `src/core/categorize/{rules,extension,content-map,content,content-cache,security}.ts` + thin facade (262 lines). Deleted dead methods: `getCategoryWithMetadata`, `isQuarantined`, `getSecurityClassificationWithMetadata` (zero callers). Kept `classifySecurity`/`validateFileType` — they're test-covered.
- [x] `src/services/metadata-cache.service.ts:943` → kept split as `services/metadata-cache/` — music/photo stay in core per kriday
- [x] Replace `src/tools/index.ts:261` + `src/server.ts:165` switch with `defineTool()` + auto-discovery (`src/mcp/registry.ts`, `src/mcp/defineTool.ts`)

Exit criteria note: Phase-1's six files are all <300 now. Other >300 files (image-metadata, content-analyzer, secure-file-reader…) are Phase-2 kill targets.
Commits: `aa67ca9` (types/config/cli/registry checkpoint) · categorizer split commit.

Stash `stash@{0}` (v4 migration WIP) still parked — pop after this branch lands or rebases onto main.

## Phase-2 — Reduce over-eng / refactor simpler [DONE]

27 services → 6 core modules + metadata + scheduler extension. 22 schemas → 4.
Keep `scan -> categorize -> plan -> move`.

Commits: `52757ef` (io) · `6fdbf47` (content stack, organize/scan, schemas) ·
`79eab6f` (hash) · `0a21920` (parser swap) · `6362286` (MetadataService facade).

Decisions locked with kriday:
- Music/photo organizers **stay in core** (so image/audio-metadata survive, collapsed).
- Categorization keeps a slim content-sniff inside `core/categorize` (magic bytes from
  `file-signatures.ts`, no cache, no topic extraction). Extension map stays primary.
  `content-analyzer`, `topic-extractor`, `metadata-cache` die.
- New io layer must keep the sensitive-file pattern check (`E_SENSITIVE_FILE`) before any read.

End state: `core/{path,io,scan,categorize,organize,hash}` + `history-logger` + `extensions/scheduler`.

Steps — build + targeted tests green after each; run `npm run test:security`
after steps that touch path validation (1 and 5).

- [x] **1. Kill `readers/` → `src/core/io/readFile()`.** One function: `validateStrictPath` + sensitive-pattern check + `fs.readFile`. Delete factory/Result/audit/errors/interfaces (~2000 lines incl. tests). Update `tools/file-reader.tool.ts`, move its tests to unit/integration.
  - Done: `core/io/{read-file,sensitive-files,index}.ts`. Gates ported (`sensitive-file-test`, `toctou-test`, `path-traversal-fuzz` all PASS), benchmark.ts re-pointed. Rate limiter + audit logger dropped. Old reader's hidden pattern list (config.json, secrets., system32, unanchored id_rsa) merged into `sensitive-files.ts`. Tests: `tests/unit/core/io/read-file.test.ts` (23).
- [x] **2. Collapse metadata stack → `src/services/metadata/`.** Merge `image-metadata` + `audio-metadata` + `metadata.service` facade into one module. Delete `metadata-cache/`, `content-analyzer`, `topic-extractor`, `text-extraction`, `content-screening`.
  - Done with kriday's call: kill the content tools entirely. Deleted `organize_smart` + `organize_by_content` tools, `screen_files` flag, text-preview now raw fs read (no pdf/docx extraction). Dropped deps: `pdf-parse`, `mammoth`. Metadata stack lives in `services/metadata/{image,audio,service}.ts`. Screening types + schemas deleted.
- [x] **3. Slim `core/categorize` content sniff.** Replace `contentAnalyzer.analyze()` calls in `core/categorize/content.ts` + `security.ts` with a local magic-byte sniffer using `constants/file-signatures.ts`. Delete analyzer imports. Tests for `classifySecurity` must stay green.
  - Done: `core/categorize/sniff.ts` (58 lines, TOCTOU-safe open + matchSignature). `CategorizerService()` takes no analyzer/cache args anymore. Globals `globalContentAnalyzer`/`globalMetadataCache` removed from barrel.
- [x] **4. Move scheduler out:** `auto-organize.service` + `scheduler-state.service` + `tools/watch.tool.ts` → `src/extensions/scheduler/`. Registry stops importing them.
  - Done as a pure move: `extensions/scheduler/{auto-organize,scheduler-state,watch.tool,watch.schemas}.ts`. Watch tools stay registered (they're how users create tasks) — imports re-pointed. Bootstrap/diagnostics import from the extension path. Zero behavior change. Full deletion or separate bin is phase-3's call.
- [x] **5. Inline into organize:** `renaming.service` → `core/organize/rename.ts`; `manifest-integrity` → rollback internals inside `core/organize`. No tool API change.
  - Done: `core/organize/{organizer,rename,rollback,manifest-integrity}.ts`. Kept manifest-integrity as a small private module next to rollback (folding 101 lines into the class forced test churn for zero gain). Services barrel re-exports from core.
- [x] **6. Merge scan trio:** `file-scanner` + `streaming-scanner` + `file-tracker` → `core/scan/`.
  - Done differently, simpler: `file-scanner` → `core/scan/scanner.ts`. `streaming-scanner` + `file-tracker` had zero consumers outside the export barrel — deleted instead of merged (~220 lines + 2 test files gone).
- [x] **7. Collapse schemas** 22 files → `common.ts`, `scan.ts`, `organize.ts`, `system.ts`. Grep `tests/` + update `API.md`.
  - Done: 18 schema files → 4 (+ index barrel). Dead `OrganizeSmartInputSchema` dropped during the collapse. Tool/schema import paths re-pointed across 25 files; API.md tool tables unchanged (schema shapes didn't change).

Notes:
- Leave `global*` singletons in `services/index.ts` alone — that's Phase-3 scope. Barrel just re-points imports as files move.
- `smart-suggest` + `system-organize`: untouched this phase (small enough, not on kill list). Revisit if phase-3 wants them gone.
- Kill list for step 2 is ~6 services ≈ 5k lines deleted, plus readers ~2k in step 1.

## Phase-3 — Stateless + new MCP DX

Decisions locked with kriday:
- Scheduler gets its **own process**: `bin/file-organizer-watch.mjs`. Core stdio server drops the watch tools; feature survives standalone.
- `stash@{0}` (v4 migration WIP) **pops first** — it touches `server.ts`/`index.ts`, which this phase rewrites. Resolve once, build on top.
- No fs-based tool auto-discovery (`import.meta.glob` is Vite-only; fs-scanning `dist/` is magic, not DX). Registry stays explicit, one line per tool.
- RateLimiter dies outright — clients rate-limit themselves; the `name.includes("scan")` heuristic goes with it.

Steps — build + targeted tests green after each; `npm run test:security` not needed unless path validation changes (it shouldn't).

- [x] **0. Pop stash.** Stash was based on phase-0 tip (`8a01086`) — 11 commits stale, ~40 of 101 files pointed at paths phase-1/2 deleted. Hand-carried the valuable diffs instead of popping: `@modelcontextprotocol/server@2.0.0` swap (sdk removed), `server.ts` → `McpServer` + `registerTool` + `fromJsonSchema` + `cacheHints`, import re-points in `bootstrap.ts`/`cli.ts`/`setup-wizard.ts`/bin. Build + full suite (842) green; stdio smoke test passed (initialize, tools/list ×24 with titles+annotations, tool call). Stash dropped; its MIGRATION.md §1 (wire-level protocol notes) + CHANGELOG salvaged to `/tmp/opencode/stash-salvage/` for the phase-4 docs pass.
- [x] **1. Delete RateLimiter.** Removed `services/security/rate-limiter.service.ts` (+ `services/security/` dir), the `name.includes(...)` limit block in `server.ts`, and the re-export in `services/index.ts`. Zero references left in src/tests. Full suite green.
- [x] **2. History logger: kill the batch queue.** `log()` = direct append behind the in-process write chain; no `pendingEntries` / flush timer / `flushAndClose` (zero external callers). Lockfile kept for cross-process safety (server + watch bin share one file). Two real bugs found and fixed while testing: (a) staleness was judged on the same window as the wait, so a waiter could steal a live lock at its deadline — stale threshold is now `lockTimeoutMs * 2`; (b) fixed retry sleep so tiny lock windows can't wake past the staleness line. `DEFAULT_CONFIG.dataDir` now uses `getHistoryDirectory()` from `core/config/paths` (was hardcoded `process.cwd()/data`). Test suite rewritten around immediate-persist semantics; rotation tests use dedicated small services. Full suite green (834).
- [x] **3. Extract scheduler to its own bin.** New `src/extensions/scheduler/watch-cli.ts` + `bin/file-organizer-watch.mjs` with `add`/`remove`/`list` subcommands (replaces the old MCP watch tools as the management UX) and daemon mode as default. Handlers moved verbatim to `watch-manager.ts` (minus the in-process scheduler reload call). Core side: watch tools unregistered from `registry.ts`, all scheduler wiring deleted from `bootstrap.ts`, diagnostics check 7 now reads config only (no extension import). Dead files removed: `watch.tool.ts`, `tools/index.ts` barrel (zero importers). `package.json`: added `bin.file-organizer-watch`. Docs: API.md tool entries replaced by a note pointing at the bin; README has a "Scheduled organization" section. Scheduler's internal singletons are fine — dedicated process now. Smoke-tested: bin `list` works; core server lists 21 tools (was 24); full suite green.
- [x] **4. Thread `ctx`.** `ToolHandler = (args, ctx?) => Promise<ToolResponse>`; `ctx = { config, history }` built fresh per request (`src/mcp/context.ts` → `createRequestContext()`); server passes it, handlers default to it so direct calls in tests keep working. Logger stays a plain util import — threading it bought nothing. `view-history` reads history via `ctx.history`.
- [x] **5. Kill global* service singletons.** `globalCategorizerService`/`globalOrganizerService` deleted from barrel; categorize/organize/preview construct pure instances per request. `smartSuggestService` singleton (zero consumers, held a cache Map) deleted. **Scope call made with kriday:** custom rules now persist to user config (`customRules` field) instead of living in the singleton — set_custom_rules validates via a scratch instance and writes only valid rules; every request's CategorizerService loads them. This also flushed out a pre-existing bug: the Zod schema uses `filename_pattern` but the old code cast straight to `CustomRule` (`filenamePattern`) — filename patterns from set_custom_rules had never actually matched. Handler now normalizes snake→camel. New integration suite `tests/integration/tools/custom-rules.test.ts` covers persist→fresh-request-apply with an isolated config path (other suites hit the real user config in parallel workers — sharing it was racy). Also hardened `validateCategoryName` to reject empty names. Scheduler/system-organize always built their own instances without global rules — left at parity.
- [x] **6. Registry DX polish.** Skipped the defineTool-consolidation rewrite, deliberately: the goal ("1 new file + 1 registry line") is already met — phase-2's schema collapse removed the other edits, and folding defs+handlers would still need dual exports for tests that import handlers directly. 21-file churn for zero behavior change fails the taste test. Instead: registry header now documents the add-a-tool convention and why auto-discovery is rejected.
- [x] **7. Verify stateless.** `createServer()` builds a fresh `McpServer` per call and holds no mutable module state; `handleToolCall(name, args, ctx)` is pure routing; zero module-level service instances left in the core path (`tools/rollback.ts` singleton found in the audit and killed — per-request construction). Bonus fix: rollback manifests moved from `process.cwd()/.file-organizer-rollbacks` (another baked-cwd bug — undo broke on npx/global installs) to the platform config dir via `getRollbackDirectory()`, with guarded one-time migration of legacy manifests; test mode keeps cwd storage so suites never touch real home (caught 32 leaked test manifests in `~/.config/file-organizer-mcp/rollbacks/` from an earlier run — removed). Verified: build + lint + full suite (53/835) + security suite green; live stdio probe OK (initialize, tools/list ×21, tool call); watch bin `list` works.

Phase-3 complete. Docs scrub (ARCHITECTURE.md diagram, README DX section, version bump) stays Phase-4 scope per plan. Salvaged stash docs live at `/tmp/opencode/stash-salvage/`.

Cleanup notes:
- Version string: TODO said v4.0.0 here but branch targets v5.0.0 — bump happens in Phase-4 scrub, one version story total.
- `smart-suggest` + `system-organize` survive (decided in phase-2); they just lose their singleton.

## Phase-4 — Final scrub

Decisions locked with kriday:
- One version story: `package.json` 3.5.0 → **5.0.0** (branch target). The salvaged
  CHANGELOG entry says 4.0.0; retitle to 5.0.0 and make it cover all of simplify-v5.
- ARCHITECTURE.md gets rewritten, not trimmed. It's 646 lines of per-service v3.1.x
  history pointing at files that don't exist anymore (`config.ts`, flat `services/`,
  old source tree at :423). Keep the 8-layer path validation pipeline section as-is;
  that's still the security contract. Emoji headings go too.
- `docs/FRAMEWORK.md` untouched (audited: zero dead-path references).
- Salvage dir is `/tmp/opencode/stash-salvage/`, so step 1 happens before any reboot.

Steps — each committed on its own; full gates only at step 6 (docs churn doesn't need
the suite re-run per step).

- [x] **1. Version + changelog.** `package.json` → 5.0.0. README header line 3 still
  reads "Version 3.5.0 | MCP protocol 2024-11-05"; fix version + protocol era (now
  server@2 / MCP 2026-07-28) and the npm badge. Merge salvage CHANGELOG into
  CHANGELOG.md as the 5.0.0 entry covering phases 1–3 (scheduler bin, ctx threading,
  custom-rules persistence fix, history logger rewrite, io collapse).
  - Done: also swept ~60 `v3.5.0` file-header banners and `CONFIG.VERSION` in
    `core/config/defaults.ts`. `manifest-integrity.ts` `SECRET_SEED` deliberately left
    at v3.5.0 — it's HMAC material, changing it invalidates existing rollback
    manifests mid-flight. Commits: `946b1e2`.
- [x] **2. Rewrite ARCHITECTURE.md to one page.** New diagram: JSON-RPC stdio →
  `mcp/registry.ts` → tools → `core/{path,io,scan,categorize,organize,hash}` +
  history-logger + `extensions/scheduler`. Keep security pipeline + TOCTOU sections,
  drop v3.1.x annotations and the stale "Source Structure" tree. State the new DX
  contract (add a tool = 1 file + 1 registry line).
  - Done: 646 → 120 lines. Commit: `15aa6b6`.
- [x] **3. README DX section:** "how to add a tool in 1 file". Point at the registry
  header convention written in phase-3 step 6 (`src/mcp/registry.ts`). Also verify the
  scheduled-organization section matches the watch bin UX from phase-3 step 3.
  - Done: DX section under Contributing; stale "screen-then-enrich" architecture blurb
    rewritten; full tool list was missing batch_rename (20 vs registry's 21) — fixed;
    watch section already correct. Commit: `a7d3e34`.
- [x] **4. Sync AGENTS.md "Where code lives" tree.** Still shows flat `services/*.service.ts`
  and top-level `types.ts`/`config.ts`. Update to core/mcp/extensions reality so the
  next agent doesn't chase ghosts.
  - Done: tree + all dead line refs re-pointed (`tools/index.ts` → `mcp/registry.ts`,
    `types.ts:260` → `mcp/types.ts:16`, validator :239 → :357, etc.). Commit: `0edf953`.
- [x] **5. API.md spot-check.** Watch-tool note at :33 is already correct post phase-3;
  confirm no other tool tables drifted during schema collapse. Expect minimal work.
  - Not minimal: API.md documented only 18 of 21 tools — smart_suggest,
    system_organize, view_history had no sections (count matched by coincidence with
    the note's watch-tool mentions). Sections added in house style; TOC updated;
    set_custom_rules description fixed ("persist for the current session" → persist to
    user config). The `docs:generate` script is stale (hardcodes v3.0.0, regex-parses
    old tool format) — not used, flagged for later cleanup. Commit: `21f820b`.
- [x] **6. Fresh-clone gate.** Clone the branch to `/tmp/opencode`, `npm ci`, then
  `build` + `lint` + `test` + `test:security` green. This is the release gate.
  - Done at `06b0862`: build ✓ lint ✓ 53/53 suites, 835 passed (+2 skipped) ✓
    test:security ✓. Gotcha for next time: `npx jest` directly fails every ESM suite —
    `npm test` wraps jest with `--experimental-vm-modules`. One early run showed
    98 failures that vanished on rerun; suspected worker race on the shared user
    config dir, worth watching.
- [x] **7. Security gates + benchmarks.** Re-run `scripts/security-gates/run-all.ts`
  (all four gates). Benchmark run is optional; io layer changed enough in phase-2 that
  before/after numbers are nice-to-have for the changelog, not required.
  - Gates were red before AND after the branch: main already failed static analysis
    (3 CRITICAL + 1 HIGH), branch showed 8 because the filename-based allowlist still
    named pre-split files. Fixed: allowlist pruned/re-pointed (rollback.ts, loader.ts,
    batch-file-reader.ts, system-organize.service.ts), SEC-010 pattern now skips
    RegExp.prototype.exec, history rotation joins precomputed paths. All four gates
    PASS on worktree + fresh clone. Commit: `277f745`. Benchmarks skipped per plan.
- [ ] **8. Ship.** Merge `chore/simplify-v5` → main, tag v5.0.0, archive this file to
  `docs/implementation/` per the note below.

---

## Stashed — not on branch tip

- `stash@{0}`: `v4 migration WIP (101 files)` — `@modelcontextprotocol/server@2.0.0` switch (`sdk@1.30.0` → `server@2.0.0`), `src/server.ts` / `src/index.ts` stateless bits. Pop before Phase-1 if branch needs to build locally without `npm install`.

## How to use this file

- Check a box only when committed and `npm run build` passes.
- Keep one phase in progress at a time.
- This file lives outside `docs/` so it's visible at root during churn — delete or archive to `docs/implementation/` when `v5` ships.
