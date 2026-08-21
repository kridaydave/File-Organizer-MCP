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

## Phase-1 — Kill god files [NEXT]

No file >300 lines. Splits only, no behavior change. `npm test` must stay green.

- [ ] `src/types.ts:645` → `src/core/types/{files.ts,categories.ts,organize.ts,system.ts}` + `src/mcp/types.ts`
- [ ] `src/config.ts:605` → `src/core/config/{defaults.ts,loader.ts,security.ts,paths.ts}`
- [ ] `src/index.ts:344` → `src/mcp/cli.ts` + `src/mcp/bootstrap.ts` + `src/index.ts` (just `main()`)
- [ ] `src/services/categorizer.service.ts:1246` → split or delete screening layer if not needed
- [ ] `src/services/metadata-cache.service.ts:943` → inline or delete if music/photo not core
- [ ] Replace `src/tools/index.ts:261` + `src/server.ts:165` switch with `defineTool()` + auto-discovery

Exit criteria: `wc -l src/**/*.ts` — no file >300, build + `npm run test:security` green.

## Phase-2 — Reduce over-eng / refactor simpler

27 services → ~7-8, 22 schemas → ~4-5. Keep `scan -> categorize -> plan -> move`.

Keep:
- `core/path` (validator + `path-security`)
- `core/scan` (merge `file-scanner` + `streaming-scanner` + `file-tracker`)
- `core/categorize` (simple map from `src/constants.ts:6`)
- `core/organize` (plan + execute + rollback)
- `core/hash` (duplicate finder)
- `core/io` (one `readFile`, ditch `readers/` Result/factory/audit layering)

Kill / merge:
- [ ] `readers/secure-file-reader.ts:855` → simple `readFile()` via `validateStrictPath` + `fs.readFile`
- [ ] `metadata-cache` / `content-analyzer` / `topic-extractor` / `text-extraction` / `image-metadata` / `audio-metadata` → single `metadata/` or delete if music/photo out of core
- [ ] `renaming.service.ts:503` + `scheduler-state` + `manifest-integrity` → inline into `organize`
- [ ] `auto-organize.service.ts:649` + `watch.tool.ts:389` → move to `src/extensions/scheduler/` or delete (main stateful culprit)
- [ ] Collapse `src/schemas/*:1187` → `common.ts`, `scan.ts`, `organize.ts`, `system.ts`

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
