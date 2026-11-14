# Find space, old files, empty directories

Four read-only tools that answer a question about a directory without moving
anything. `find_largest_files` and `find_broken_symlinks` are already described
in [inspect.md](inspect.md); this file covers the three that had no entry.

## Sub-features

- `disk_usage_by_category`: space held per category, using the same categorizer
  `organize_files` uses, custom rules included.
- `find_old_files`: files older than a cutoff, with the date source named.
- `find_empty_directories`: directories holding no files, with a depth cap.
- `sensitive_scan`: files carrying personal metadata, scored 0-100 for the risk
  of sharing them.

## How to get to it (client POV)

All four are `readOnlyHint: true` and take a `directory`. They never move a file,
so a client may auto-approve them, and a proof asserts on the response only.

## Driving it

```bash
C=.opencode/skills/verify-file-organizer/scripts/control-file-organizer.mjs
D=/tmp/file-organizer-verify/default/data

node $C sandbox --fresh

node $C call disk_usage_by_category --directory $D --json
node $C call find_old_files --directory $D --json
node $C call find_empty_directories --directory $D --json
node $C call sensitive_scan --directory $D --json
```

## Observable end state

`disk_usage_by_category` returns `total_files`, `total_size`, and a `categories`
array carrying `file_count`, `total_size` and `percent_of_total`. The percentages
sum to 100 and the sizes sum to `total_size`.

`find_old_files` on freshly seeded fixtures returns `total_count: 0` with
`older_than_days: 365` and `age_source: "mtime"`. Zero is the correct answer
here, and it is the answer a proof should assert, because the fixtures are new.
The cutoff must be at least 1: `--older_than_days 0` is rejected with
`older_than_days must be greater than 0`.

`find_empty_directories` returns `scanned_count`, `total_count`, and
`empty_dirs`. It reports `depth_limited` and `result_limited` so a truncated
answer cannot be read as complete.

`sensitive_scan` returns `scanned_count`, `flagged_count`, and a `skipped` array
naming every file it did not analyze with a `reason` and a `detail`.

## Gotchas

- **`include_subdirs` defaults to true on `disk_usage_by_category` and on
  `find_empty_directories`, and to false on `find_old_files` and
  `sensitive_scan`.** Read the schema rather than assuming, since the four tools
  in this file disagree.
- **`find_old_files` reports `age_source`, and it is `mtime` unless you pass
  `atime`.** There is no `auto` mode on this tool. Assert on the reported value.
- **`sensitive_scan` skipped almost everything on the default sandbox.** With the
  default `include_subdirs false` it reported `scanned_count: 0` and 4 skipped
  files; with `--include_subdirs true` it reported `scanned_count: 1` (the one
  JPEG fixture) and 12 skipped. Everything not a JPEG or a TIFF is listed under
  `skipped` with reason `format_not_analyzed`.
- **A `sensitive_scan` risk score of 0 does not mean a file is safe to share.** It
  means no recognized EXIF tag was found. The tool says so in its own `limits`
  array, which is part of the response rather than documentation.
- **`find_empty_directories` finds directories left behind by your own runs.** Run
  it after a quarantine or an organize and it will report the folders those left,
  which makes it a cheap way to check that a cleanup emptied what it claimed.