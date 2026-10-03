# Categorize and organize

The only feature that moves files. Everything else here is reversible only by
hand.

## Sub-features

- `categorize_by_type`: classify without moving. Safe preview of the grouping.
- `preview_organization`: the exact move list, conflicts and skips.
- `organize_files`: perform the move.
- `organize_by_project`: group by project directory rather than file type.
- `organize_music`: audio-specific layout.
- `organize_photos`: image-specific layout, EXIF date aware.
- `system_organize`: system directories.
- `find_largest_files`: input to a space-reclaim decision.

## How to get to it (client POV)

Call `preview_organization` first, read the moves, then call `organize_files`.
The preview and the organize share the same categorization code, so a correct
preview is strong evidence the organize will do what you expect.

## Driving it

```bash
C=.opencode/skills/verify-file-organizer/scripts/control-file-organizer.mjs
D=/tmp/file-organizer-verify/default/data

node $C sandbox --fresh

# 1. classify, no mutation
node $C call categorize_by_type --directory $D --json

# 2. the move list, no mutation
node $C call preview_organization --directory $D --json

# 3. the move, with proof that outlives cleanup
node $C call organize_files --directory $D \
  --dry_run false --conflict_strategy rename \
  --json --out /tmp/organize-proof.json

# 4. where files actually are
find $D -type f | sort

# 5. put it back
node $C call undo_last_operation --json
```

## Observable end state

After step 3, `Documents/` exists under the sandbox data dir and contains the
three top-level fixtures. `successCount` matches the move count and `errorCount`
is 0. After step 5 every fixture is back at its original path.

`preview_organization` returns `summary.total_files`, `summary.categories_affected`,
`moves`, `conflicts` and `skipped_files`. Note the shape differs from
`organize_files`, which returns `total_files`, `statistics`, `actions` and
`errors` at the top level. Two tools, two shapes.

## Gotchas

- **`dry_run` defaults to `true`.** Omitting `--dry_run false` returns
  `dry_run: true` and moves nothing, while still reporting `successCount: 1`.
  This reads like a successful organize. It is not one.
- **`conflict_strategy` is required on `organize_files`** even though it has no
  schema default. Omitting it fails validation. Pass `rename`, `skip` or
  `overwrite` explicitly.
- **Nothing here recurses.** All of `organize_files`, `categorize_by_type` and
  `preview_organization` see the top level of the directory you pass. There is no
  `include_subdirs` on `organize_files`. To organize a tree, call it per
  directory.
- **`categorize_by_type` returned only `Documents` for the fixture root** even
  though the tree holds a markdown file, a jpeg and a zip, because it too is
  top-level only and the root holds `.txt` files. Widening the observation means
  widening the directory, not the flags.
- **Never run these against a real home directory to check behavior.** Use the
  sandbox. The 8-layer validator will allow a configured directory, and a real
  home directory is usually configured.
- **`system_organize` is the one to be most careful with.** It targets system
  paths and is the tool most likely to be blocked by the security policy. Prove
  it in the sandbox, where the block is the expected result.
