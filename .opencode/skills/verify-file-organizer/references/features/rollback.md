# Undo an organization

The reverse state of [organize](organize.md). A move you cannot undo is a
destructive tool, so this is the feature to prove whenever the organizer or the
rollback service changes.

## Sub-features

- `undo_last_operation`: reverse the most recent organizing operation.
- `view_history`: read the recorded operation log.
- `search_history`: filter that log by path glob, date range, operation, status
  or source.
- `quarantine_files`: move flagged files aside, reversibly.
- `restore_quarantine`: put quarantined files back.
- `verify_integrity`: check a manifest's signature and the files it names.

## Quarantine

Quarantine is its own reversible move, separate from organizing, and it is the
one path where the sandbox's allowed-directory rule bites hardest.

```bash
node $C call quarantine_files \
  --directory $D \
  --files '["/tmp/file-organizer-verify/default/data/notes/todo.md"]' \
  --dry_run false --json

node $C call restore_quarantine --dry_run true --json
find $D/notes $D/.file-organizer-quarantine -type f | sort
```

A real run returns `quarantined: 1` and writes the file into
`.file-organizer-quarantine/` under the data dir. `restore_quarantine` with no
`quarantine_id` restores the most recent quarantine; with an id it restores that
one.

## Gotchas

- **`files` is an array of absolute paths, not names.** Passing `notes/todo.md`
  fails with `data/files must be array` if it is not JSON, and with an
  `Access Denied` naming that relative path if it is a bare string. The value has
  to be JSON, and every element has to be a full path:
  `--files '["/tmp/.../todo.md"]'`.
- **`quarantine_files` reports the manifest as `manifest_id`, and
  `restore_quarantine` reports it as `quarantine_id`.** They are the same value
  from the same manifest, so passing one to the other works. Verified by hand:
  the id printed by `quarantine_files` restores correctly when handed to
  `restore_quarantine`.
- **A dry-run quarantine writes no manifest**, so there is nothing to restore
  from. That is the dry-run contract holding, not a missing manifest.
- **`restore_quarantine` with no arguments restores the latest one**, which is
  the wrong target as soon as you have quarantined twice. Pass `--quarantine_id`
  when more than one quarantine exists.
- **`verify_integrity` verifies the manifest, not the files.** It reports a
  `signatureValid` flag per manifest and never hands paths back. To check that a
  file is still where a manifest put it, read the manifest through a tool that
  re-verifies, or check the filesystem.

## search_history

Takes no required arguments, so a bare call lists everything. Every filter is
optional and they combine: `path_glob`, `from`, `to`, `operation`, `status`,
`source`, `limit`, `privacy_mode`. It returns `entries`, newest first, each with
`operation`, `status`, `source`, `durationMs`, `paths`, `id` and `timestamp`.

## How to get to it (client POV)

After an `organize_files` call, call `undo_last_operation`. It needs no
arguments.

## Driving it

```bash
C=.opencode/skills/verify-file-organizer/scripts/control-file-organizer.mjs
D=/tmp/file-organizer-verify/default/data

node $C sandbox --fresh
find $D -type f | sort          # the "before" state

node $C call organize_files --directory $D --dry_run false --conflict_strategy rename --json >/dev/null
find $D -type f | sort          # files are now under Documents/

node $C call undo_last_operation --json
find $D -type f | sort          # back to the "before" state

node $C history                 # what the sandbox recorded
```

## Observable end state

`undo_last_operation` returns `success: 1` and the `find` output is byte-for-byte
the same shape as the "before" listing. `history` lists each operation with an
id, a timestamp, a duration and a status.

## Gotchas

- **Undo is last-operation, not selective.** Two organizes then one undo leaves
  the first organize applied. Verify the count of `success` against the number
  of operations you performed.
- **The rollback manifest lives in the platform config dir, not the worktree.**
  Under the harness that is the sandbox's own config dir. Deleting the sandbox
  before undoing leaves nothing to undo against.
- **History is written even when the tool call failed.** `operations.jsonl`
  records the attempt with a status. Do not read a history entry as proof the
  operation took effect; check the filesystem for that.
- **`history` is a helper subcommand, not a tool.** It reads the sandbox's
  `operations.jsonl` directly. The `file_organizer_view_history` tool is the
  client-facing equivalent and takes a directory.
