# Adapt behavior to the user

## Sub-features

- `set_custom_rules`: persist categorization rules that later calls obey.
- `smart_suggest`: recommend rules, duplicates and large files for a directory.
- `find_broken_symlinks`: audit dangling links.
- `view_history`: filter the operation log by operation, status or date.

## How to get to it (client POV)

`set_custom_rules` writes to the config the current process reads. Under the
harness that is the sandbox config, so a rule set here never touches a real
install.

## Driving it

```bash
C=.opencode/skills/verify-file-organizer/scripts/control-file-organizer.mjs
D=/tmp/file-organizer-verify/default/data

node $C sandbox --fresh

# what would you do about this tree?
node $C call smart_suggest --directory $D --max_files 100 --json

# persist a rule, then observe it change classification
node $C call set_custom_rules --rules '[{"pattern":"*.md","category":"Documents"}]' --json
node $C call categorize_by_type --directory $D --json

node $C call find_broken_symlinks --directory $D --json
node $C call view_history --limit 5 --json
```

## Observable end state

`set_custom_rules` returns success and the sandbox `config.json` gains a
`customRules` array. A following `categorize_by_type` reflects the rule. History
entries appear in `view_history` with the filters applied.

## Gotchas

- **`set_custom_rules` is sandbox-local under this harness.** That is the point.
  It proves the rule round-trips through config without writing to a real home.
- **`smart_suggest` has `include_subdirs` defaulting to true**, unlike
  `scan_directory` where it defaults to false. The two tools disagree on the same
  flag name. Always read the schema.
- **`smart_suggest` also times out.** `timeout_seconds` defaults to 60. On a large
  tree the suggestion is a partial sample, so treat the output as indicative
  rather than exhaustive.
- **`view_history` filters are all optional** and it is one of the two tools with
  an empty `required` array. It reads the config-dir history, which under the
  harness is the sandbox's, so it shows only this sandbox's operations.
