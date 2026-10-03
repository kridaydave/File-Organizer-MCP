# Undo an organization

The reverse state of [organize](organize.md). A move you cannot undo is a
destructive tool, so this is the feature to prove whenever the organizer or the
rollback service changes.

## Sub-features

- `undo_last_operation`: reverse the most recent organizing operation.
- `view_history`: read the recorded operation log.

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
