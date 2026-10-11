# Find and resolve duplicates

## Sub-features

- `find_duplicate_files`: hash and group duplicates.
- `analyze_duplicates`: the same grouping with a recommendation per group.
- `preview_delete_duplicates`: what a deletion would remove, with the space it
  would recover, and never removes it.
- `delete_duplicates`: remove the redundant copies.

## How to get to it (client POV)

Call `find_duplicate_files` on a directory, then `analyze_duplicates` to decide,
then `delete_duplicates` to act. Only the last one mutates.
`preview_delete_duplicates` sits between the last two and is read-only.

## Driving it

```bash
C=.opencode/skills/verify-file-organizer/scripts/control-file-organizer.mjs
D=/tmp/file-organizer-verify/default/data

node $C sandbox --fresh

# the top-level pair the fixtures plant for this
node $C call find_duplicate_files --directory $D --json

# point it at a subdirectory to see the pair it cannot reach from the root
node $C call find_duplicate_files --directory $D/inbox --json

node $C call analyze_duplicates --directory $D --json

# the read-only preview of a deletion
node $C call preview_delete_duplicates --directory $D --json
```

## Observable end state

On the fixture root, `duplicate_groups: 1`, `total_duplicate_files: 2`,
`wasted_space: "26 Bytes"`, which is the length of the seeded duplicate content.
On `$D/inbox` the same numbers appear for the nested pair.

`preview_delete_duplicates` on the same root reports `dry_run: true` and two
groups at once, because it walks recursively and finds both the root pair and the
nested one where `find_duplicate_files` finds only the root pair. The counts are
`total_duplicate_groups: 2`, `total_files_to_delete: 2`, and it names a `keep`
path per group.

## Gotchas

- **`find_duplicate_files` has no recursion flag.** Its schema has exactly three
  properties: `directory`, `limit`, `response_format`. It only ever sees the top
  level of the directory it is given, which is why the fixtures keep a duplicate
  pair at the root. A recursive duplicate finder does not exist here, so do not
  go looking for one.
- **Pointing it at the root returned 0 groups before the fixtures gained a
  top-level pair**, while `scan_directory` on the same root found nine files.
  The two tools disagree about the tree, and both are behaving as written.
- **`preview_delete_duplicates` recurses and `find_duplicate_files` does not**, so
  the two disagree on group count for the same directory. That is the difference
  between them, not a defect in either.
- **`keep_strategy` defaults to `newest`**, and the choice is reported back as
  `keep_strategy` so a proof can show which copy it decided to keep.
- **`delete_duplicates` is the irreversible one.** Prove the grouping first, then
  act, and keep the `--out` proof of what was deleted.
