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

## Phase-3 — Stateless + new MCP DX (v4.0.0)

MCP 2026-07-28 `ttlMs` / `cacheScope` already added in `src/server.ts:49`. Finish statelessness.

- [ ] No globals — `src/services/index.ts:44` `global*` → per-request `ctx` (`config`, `logger`)
- [ ] `src/server.ts:119` `new RateLimiter()` → per-request or remove (client rate-limits)
- [ ] `historyLogger.log:272` → file append only, no batch queue in memory
- [ ] `watch`/`scheduler` → remove from MCP core or separate `bin/file-organizer-watch.mjs`
- [ ] New DX: `defineTool({ name, schema, handler })` — add file = auto registered, no 4-file edit
- [ ] Verify stateless: `createServer()` pure, `handleToolCall` `(args, ctx) -> result`

## Phase-4 — Final scrub

- [ ] `npm run build` + `lint` + `test` + `test:security` green on fresh clone
- [ ] Update `ARCHITECTURE.md:1` to 1-page diagram
- [ ] `README.md` DX: "how to add a tool in 1 file"
- [ ] Re-run `scripts/security-gates/*`, `benchmarks` if needed

---

## Stashed — not on branch tip

- `stash@{0}`: `v4 migration WIP (101 files)` — `@modelcontextprotocol/server@2.0.0` switch (`sdk@1.30.0` → `server@2.0.0`), `src/server.ts` / `src/index.ts` stateless bits. Pop before Phase-1 if branch needs to build locally without `npm install`.

## How to use this file

- Check a box only when committed and `npm run build` passes.
- Keep one phase in progress at a time.
- This file lives outside `docs/` so it's visible at root during churn — delete or archive to `docs/implementation/` when `v5` ships.
