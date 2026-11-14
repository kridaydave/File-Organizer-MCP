# Rename in bulk

## Sub-features

- `batch_rename`: apply an ordered list of rename rules to a directory or an
  explicit file list.

## How to get to it (client POV)

Call `batch_rename` with `rules`, an array of pattern and replacement pairs, plus
either a `directory` or a `files` list. `dry_run` defaults to true.

## Driving it

```bash
C=.opencode/skills/verify-file-organizer/scripts/control-file-organizer.mjs
D=/tmp/file-organizer-verify/default/data

node $C sandbox --fresh
node $C call batch_rename --directory $D --rules '[{"pattern":"dupe-","replacement":"copy-"}]' --json
ls $D
```

## Observable end state

With `dry_run` left at its default the response reports the planned renames and
`ls $D` still shows `dupe-a.txt` and `dupe-b.txt`. With `--dry_run false` the
files are renamed and the originals are gone.

## Gotchas

- **`rules` is required and its inner shape is not described in the schema.**
  Read `src/schemas/` for the exact key names rather than guessing between
  `from`/`to` and `pattern`/`replacement`. The fixture command above uses
  `pattern` and `replacement`.
- **`dry_run` defaults to true**, same as `organize_files`. A rename proof that
  omits it proves nothing changed.
- **Rules are applied in array order.** Two rules that both match one filename
  produce a single rename, not two.
- **Pass `rules` as JSON on one flag.** The helper coerces a value starting with
  `[` or `{` by parsing it, so a single `--rules '[...]'` is enough. Repeating
  the flag overwrites the previous value.
