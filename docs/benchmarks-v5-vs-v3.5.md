# Benchmarks: v5.0.0 vs v3.5.0

Measured comparison of the lean v5 rewrite against v3.5.0 (the last release
before it). Run on 2026-09-02, single Linux machine, both versions built and
exercised at the **tool-handler level** — the same code an MCP client hits.

- **v3.5.0** = commit `faa0f99` (merge of `release/v3.5.0`)
- **v5.0.0** = commit `3fb0e4e` (main)

Identical seeded datasets per scenario. Everything ran sandboxed:
`NODE_ENV=test` with each repo root as cwd (the allowed root in both
versions) and `XDG_CONFIG_HOME` pointed at a temp dir, so no real user
config, history, or rollback state was touched. Datasets lived in the
gitignored `tests/sandbox/bench-data/` and were removed afterwards.

## Results at a glance

| Area | v3.5.0 | v5.0.0 |
|---|---|---|
| Preview 400 files | 5,936 ms | **170 ms (35× faster)** |
| Organize 400 files | 5,481 ms | **448 ms (12× faster)** |
| Find duplicates, 3,000 files | 2,456 ms | **1,115 ms (2.2× faster)** |
| Organize 3,000 files (stress) | 35,554 ms, 2,800 failures | **2,225 ms, 0 failures** |
| Scan (happy 400 / stress 9,500) | 26 / 607 ms | 37 / 645 ms (parity) |
| Path-validation correctness, 7 attack cases | 7/7 correct | 7/7 correct |
| Path-validation throughput | ~2.4k ops/s | ~2.2k ops/s (parity) |
| `npm run test:security` | 22 tests pass | 78 tests pass |
| Peak RSS (happy path) | 390 MB | **203 MB** |

The one number v3.5 "wins" is undo (147 ms vs 515 ms for 300 restores).
That is a deliberate v5 trade: v5 verifies rollback-manifest HMAC integrity
before restoring (`src/core/organize/rollback.ts`); v3.5's undo does not.

## Happy path — 400 files (300 flat + 20 subdirs), median of 5 iterations

| Operation | v3.5.0 | v5.0.0 |
|---|---|---|
| scan (json / markdown response) | 26 / 23 ms | 37 / 34 ms |
| categorize_by_type | 24 ms | 34 ms |
| preview_organization | 5,936 ms | 170 ms |
| organize_files | 5,481 ms | 448 ms |
| undo_last_operation | 147 ms | 515 ms |

### Why v3.5 preview/organize were slow

The core pipeline is not the difference. Calling v3.5's services directly
(scan → plan → move on the same dataset) took ~930 ms. The cost sat in the
handler layer:

- v3.5's `organize_files`/`preview_organization` handlers route through
  `globalOrganizerService`, wired to `ContentAnalyzerService` +
  `MetadataCacheService`, doing per-file content analysis on every run.
- Per-move rollback-manifest HMAC signing: CPU profiling showed
  `createManifest` + `computeSignature` + `computeHash` at ~26% of
  application CPU time.

v5 deleted the content-analysis/metadata stack (handlers categorize by
extension and sniff only where needed) and signs the rollback manifest once
per operation instead of per move.

## Stress — 9,500-file tree + 3,000-file flat set (600 duplicate-content copies)

| Operation | v3.5.0 | v5.0.0 |
|---|---|---|
| Full recursive scan (10 paginated requests, limit 1000) | 607 ms | 645 ms |
| find_duplicate_files (3,000 flat files) | 2,456 ms | 1,115 ms |
| Duplicate groups found | 600 (1,200 files) | 600 (1,200 files) |
| organize_files (3,000 files) | 35,554 ms — moved 200, **2,800 errors** | 2,225 ms — moved 3,000, 0 errors |
| undo_last_operation | 241 ms (restores 200) | 2,564 ms (restores 3,000) |

Per restored file, undo cost is comparable (~1.2 ms/file in v3.5, ~0.9 ms/file
in v5) — v5 simply had 15× more files to restore.

### v3.5 organize failures on large directories

v3.5's organize reproduced the failure in isolation, independent of
duplicates or the find-duplicates-first sequence:

- 3,000 files, mixed sizes: moved 200, 2,800 errors
- 2,400 unique-content files, mixed sizes: moved 100, 2,300 errors
- 3,000 tiny 4 KB files: moved 3,000, 0 errors

The failing moves die with
`Failed to move ... after 100 retries due to race conditions`: v3.5 moves
with `COPYFILE_EXCL` and retries on `EEXIST` with `_1`/`_2` suffixes. The
trigger is concurrency-dependent — larger files widen the copy window. v5's
rewritten organizer does not have this code path and moved 3,000/3,000.

## Security

**Correctness is identical.** 2,000 calls per case through
`validateStrictPath`:

| Case | v3.5.0 | v5.0.0 |
|---|---|---|
| Benign existing file | accepted (correct) | accepted (correct) |
| Traversal escaping the allowed root | rejected | rejected |
| Null byte | rejected | rejected |
| Absolute path outside allowed roots | rejected | rejected |
| Symlink to file outside sandbox | rejected | rejected |
| Symlinked directory traversal | rejected | rejected |
| 30-level deep traversal | rejected | rejected |

**Throughput is parity.** Benign validation costs ~430–465 µs/call in both
versions (~2.2–2.4k ops/s through the full 8-layer gate). Hostile paths fail
fast in both (25–98 µs, 10–39k ops/s); v5 is marginally faster on symlink
cases, v3.5 marginally faster on the trivial reject. Nothing about the v5
rewrite regressed the security gate's cost.

As a gate, `npm run test:security` passes on both: v3.5 runs 22 tests in ~4 s;
v5 runs 78 in ~10 s (56 extra adversarial/regression tests added in v5).

## Caveats

- Single machine (Linux, tmpfs /tmp, NVMe-class disk); absolute numbers vary,
  ratios held across repeated runs.
- Scan numbers include the pagination protocol both versions share
  (limit caps at 1,000 files/request); clients scanning 10k+ file trees
  should expect ~10 requests per full enumeration on either version.
- Happy-path organize for v5 varied between ~190–450 ms across runs;
  medians reported. The v3.5 gap was stable in every run.

## Reproducing

Both versions must be built side by side, run with `NODE_ENV=test`, the
version's repo root as cwd, and `XDG_CONFIG_HOME` redirected to a temp dir.
Datasets go under the repo's `tests/sandbox/`. The harness called the same
handler entry points in both versions:
`handleScanDirectory`, `handleCategorizeByType`, `handlePreviewOrganization`,
`handleOrganizeFiles`, `handleUndoLastOperation`, `handleFindDuplicateFiles`
(from `dist/src/tools/`), and `validateStrictPath` (from
`dist/src/services/path-validator.service.js`).
