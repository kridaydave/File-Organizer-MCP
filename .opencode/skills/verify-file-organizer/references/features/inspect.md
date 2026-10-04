# Inspect what is in a directory

Read-only. Nothing here mutates the filesystem.

## Sub-features

- `scan_directory`: paginated listing with size, dates and extensions.
- `list_files`: names only, for a quick orientation.
- `read_file`: bounded content read with a checksum and mime type.
- `batch_read_files`: several files in one round trip.
- `inspect_metadata`: EXIF for images, ID3 for audio.
- `find_largest_files`: the space hogs.

## How to get to it (client POV)

Any of these with a `directory` or `path` argument. All are
`readOnlyHint: true`, so a client may auto-approve them.

## Driving it

```bash
C=.opencode/skills/verify-file-organizer/scripts/control-file-organizer.mjs
D=/tmp/file-organizer-verify/default/data

# the full fixture tree
node $C call scan_directory --directory $D --include_subdirs true --json

# one page, to exercise pagination
node $C call scan_directory --directory $D --limit 2 --json

node $C call read_file --path $D/notes/todo.md --limit 100 --json
node $C call find_largest_files --directory $D --limit 5 --json
```

## Observable end state

`scan_directory` with `include_subdirs true` returns `total_count: 11`, matching
the eleven seeded fixtures, and `has_more: false`. Without the flag the same
directory reports `total_count: 3`, because only three fixtures sit at the top
level. With `limit 2` it returns `returned_count: 2` and `has_more: true`.
`read_file` returns `success: true` with `content` equal to the seeded bytes and
a checksum.

## Gotchas

- **`include_subdirs` defaults to false.** A scan of the fixture root without it
  reports 3 of 11 files. This is the single most common way to think the scanner
  is broken. Eleven is the expected recursive count; if you change the fixture
  list in the helper, update this number.
- **Hidden files are skipped.** The `.seeded` marker never appears in a scan, so
  do not use it as a count check.
- **`read_file` requires `limit` and the schema gives it no default.** Omitting it
  fails validation with `data must have required property 'limit'`, not with a
  helpful message.
- **The `path` argument is named `path`, not `file_path` or `directory`.** The
  other tools use `directory`. Read the schema rather than guessing.
- **`read_file` with `response_format: json` returns a JSON-encoded string** for
  the body in some paths. Parse defensively and assert on `success`, not on the
  shape of `content`.
- **`maxBytes` defaults to 10 MiB and silently truncates.** Check `bytesRead`
  against `size` before believing you read a whole file.
