---
name: verify-file-organizer
description: Drive the real File Organizer MCP server over stdio and prove what it did, hermetically. Use when changing a tool, service, path validator, organizer, or rollback path in File-Organizer-MCP and you must confirm real behavior rather than infer it from a passing unit test. Also use to enumerate every registered tool, read a tool's schema, and check which directories a given config actually permits.
---

# Verify File Organizer

The unit tests call handlers directly. They do not prove the server answers a
JSON-RPC handshake, that a tool is reachable by name, or that a move lands on
disk and undo puts it back. This skill drives the built server the way a client
does and reads the result off the filesystem.

Everything runs inside a throwaway sandbox under the OS temp directory. Your real
`config.json`, `operations.jsonl`, rollbacks and backups are never read or
written. Do not point this at a real home directory to "just check quickly".

## The helper

`scripts/control-file-organizer.mjs` is the harness. Run it from the repo root.
Every subcommand prints JSON on stdout and keeps stdout free of diagnostics.

```bash
C=.opencode/skills/verify-file-organizer/scripts/control-file-organizer.mjs

node $C doctor          # is this instance worth driving?
node $C tools           # every registered tool, one line each
node $C tools --filter organize
node $C schema organize_files   # input schema plus honest annotations
node $C sandbox --fresh # recreate fixtures, print the paths
node $C call <tool> --arg k=v --json
node $C history         # operations.jsonl written by this sandbox
node $C cleanup         # remove the sandbox
```

Exit code is 0 when the tool call succeeded, 1 when the tool returned an error,
2 when the harness itself could not run.

### Flags

| Flag | Effect |
| --- | --- |
| `--sandbox <path>` | Use a specific sandbox root instead of the default. |
| `--fresh` | Recreate the sandbox and its fixtures. Refuses on any directory this helper did not create. |
| `--arg key=value` | A tool argument. Repeatable. Values coerce `true`, `false`, `null`, numbers, and JSON. |
| `--json` | Force `response_format=json` and pretty-print the parsed body. |
| `--out <file>` | Also write the full result to a file as proof. Cleanup never deletes it. |
| `--verbose` | Echo server stderr. Use this when a call fails for no visible reason. |

`--arg` also accepts a bare `--key value` pair, so `--dry_run false` and
`--dry_run=false` both work.

## Launch

There is no server to keep alive. The helper spawns `dist/src/index.js` per
subcommand, completes one exchange, and kills the process it started.

```bash
npm run build    # the helper drives dist/, never TypeScript sources
```

Build first. `doctor` reports a missing `dist/src/index.js` rather than failing
obscurely later.

## Doctor

Run this first whenever anything looks wrong, and after any change to
`dist/`, config loading, or the tool registry.

```bash
node $C doctor
```

It checks five things and exits non-zero if any fails: `dist/src/index.js`
exists, the toolchain is readable, the `initialize` handshake succeeds and
advertises the expected tool count, `file_organizer_doctor` answers, and one
read-only tool call returns entries. When a check fails, the `detail` field
carries the value that failed rather than a restatement of the check name.

## Driving a tool

Short tool names expand to the `file_organizer_` prefix, so `organize_files`
and `file_organizer_organize_files` are the same call.

```bash
# read-only, safe anywhere
node $C call scan_directory --directory /tmp/file-organizer-verify/default/data --include_subdirs true --json

# a move, with proof retained after cleanup
node $C call organize_files \
  --directory /tmp/file-organizer-verify/default/data \
  --dry_run false --conflict_strategy rename \
  --json --out /tmp/organize-proof.json

# the reverse state
node $C call undo_last_operation --json
```

`organize_files` defaults to `dry_run: true`, so omitting the flag proves
nothing moved. Pass `--dry_run false` deliberately, and follow it with
`undo_last_operation`.

## Evidence

A proof is the tool result plus the filesystem after it. Capture both.

- `--out <file>` keeps the full JSON result. `cleanup` never touches it.
- `find /tmp/file-organizer-verify/default/data -type f` shows where files
  actually landed. Trust this over the `actions` array in the response.
- `history` shows the operations the sandbox recorded, which is how you confirm
  a call reached the history logger at all.

Both response formats are part of the contract. Tools default to `markdown`;
pass `--json` when you intend to parse. Do not assert against markdown text.

## Fixtures

`node $C sandbox --fresh` seeds eleven files chosen to exercise real code paths:
a nested tree six levels deep, a byte-identical duplicate pair at the top level
and another inside a subdirectory, a `.txt` whose bytes are a PDF header, a ZIP
header with a `.zip` extension, a 180-character filename, and a markdown and
text file for the reader.

The mislabelled files matter. Magic-byte sniffing is the feature under test, and
a fixture that agrees with its extension proves nothing.

## Cleanup

```bash
node $C cleanup
```

Removes the sandbox. It refuses any directory that is neither under
`os.tmpdir()/file-organizer-verify` nor carrying the
`.file-organizer-verify-sandbox` marker. "Directly under the temp directory" is
not sufficient grounds, because that is where unrelated work also lives.

Evidence written with `--out` survives cleanup. A cleanup that ate the proof
invalidates the run.

## Gotchas found by driving it

These are properties of the current code. Each one cost a wrong turn.

- **`HOME` redirects all four state locations.** Config, history, rollbacks and
  backups now derive from one base, `getConfigDirectory()`. Setting `HOME` moves
  them together, which is what the helper does. On Linux, `XDG_CONFIG_HOME` also
  moves them together. On macOS `XDG_CONFIG_HOME` is deliberately ignored in
  favor of the platform's Application Support convention, matching the server.
- **`scan_directory` and `organize_files` do not recurse by default.**
  `include_subdirs` defaults to false on `scan_directory`, so a scan of the
  fixture root reports 3 of 11 files. Pass `--include_subdirs true`. Note that
  `smart_suggest` defaults the same flag to true, so tools disagree on it.
- **`find_duplicate_files` has no recursion flag at all.** It only ever sees the
  top level of the directory it is given, so the fixture keeps a duplicate pair
  at the root for it to find.
- **`read_file` requires both `path` and `limit`.** The schema marks `limit`
  required with no default, and the server rejects the call without it. Pass
  `--limit 100`.
- **Every tool defaults to `markdown`.** Add `--json` before parsing anything.
- **`read_file` returns a JSON string when asked for JSON.** The body is a
  serialized string, not a nested object.
- **Access-denied messages triple their own prefix**, reading
  `Access Denied: Access denied: Access Denied:`. The useful part is the block
  list after it, and note that the offending path is replaced with `[PATH]`.
- **`file_organizer_doctor` is the first call for any "why is this path
  rejected" question.** It reports the effective config and flags which allowed
  directory is missing or blocked, which beats guessing from the error text.

## Maintaining this skill

After adding, removing, or renaming a tool, run `node $C doctor` and update
`references/features/`. A tool that exists but is not in the map is a tool no
agent knows how to prove.
