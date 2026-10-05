# Feature Map

Every user-facing capability of the File Organizer MCP server, from the point of
view of someone driving it. Read this before guessing how to verify something.

The server is the app. A "user" is an MCP client, and the only surface is a
JSON-RPC conversation over stdio. There is no UI and no HTTP API, so every
feature here is reached by naming a tool and asserting on its response plus the
filesystem.

## How to drive any of them

Set this once per session from the repo root.

```bash
C=.opencode/skills/verify-file-organizer/scripts/control-file-organizer.mjs
node $C sandbox --fresh
```

The sandbox root is `os.tmpdir()/file-organizer-verify/default`, its fixtures
live in `data/`, and the short names below all expand to the
`file_organizer_` prefix.

## The features

| Feature | File | Tools |
| --- | --- | --- |
| Discover and diagnose the server | [discover.md](discover.md) | `doctor`, `tools/list`, `get_categories` |
| Inspect what is in a directory | [inspect.md](inspect.md) | `scan_directory`, `list_files`, `read_file`, `batch_read_files`, `inspect_metadata` |
| Categorize and organize | [organize.md](organize.md) | `categorize_by_type`, `preview_organization`, `organize_files`, `organize_by_project`, `organize_music`, `organize_photos`, `system_organize` |
| Undo an organization | [rollback.md](rollback.md) | `undo_last_operation`, `view_history` |
| Find and resolve duplicates | [duplicates.md](duplicates.md) | `find_duplicate_files`, `analyze_duplicates`, `delete_duplicates` |
| Rename in bulk | [rename.md](rename.md) | `batch_rename` |
| Adapt behavior to the user | [customize.md](customize.md) | `set_custom_rules`, `smart_suggest` |
| Stay inside the sandbox | [security.md](security.md) | every tool, via `path-validator.service.ts` |

## Cross-cutting facts

These hold for every feature and are the most common source of a wrong turn.

- **Every tool defaults to `response_format: markdown`.** Pass `--json` before
  parsing. Do not assert against markdown text.
- **Nothing recurses by default.** `scan_directory` needs
  `include_subdirs: true`. `organize_files` and `find_duplicate_files` operate on
  the top level only.
- **`organize_files` defaults to `dry_run: true`.** A proof of "it organized"
  that omits `dry_run: false` proves nothing moved.
- **`HOME` relocates all four state locations.** Config, history, rollbacks and
  backups share one base directory. On Linux and Windows `XDG_CONFIG_HOME` or
  `APPDATA` relocate them too; on macOS the platform convention wins and
  `XDG_CONFIG_HOME` is ignored.
- **Paths in error messages are replaced with `[PATH]`.** Assert on the block
  list and the exit code, not on the path text.

## Coverage

The map covers 8 of the 8 user-facing capability groups. It does **not** yet name
every registered tool. Run `node $C tools` for the live list and treat anything
missing from the files above as a gap to close, not as a tool that needs no proof.

Tools with no entry here yet:

- `disk_usage_by_category`
- `export_config`
- `find_empty_directories`
- `find_old_files`
- `organize_by_date`
- `preview_delete_duplicates`
- `quarantine_files`
- `restore_quarantine`
- `search_history`
- `sensitive_scan`
- `validate_organization_plan`
- `verify_integrity`

`export_report` is covered by `inspect.md`. A tool that exists but appears in no
file above is a tool no agent knows how to prove. `sensitive_scan` and
`verify_integrity` are the sharpest gaps, because AGENTS.md sends you here
whenever you touch the validator or manifest integrity and there was no entry to
land on. After adding or renaming a tool, update this index and the matching
file, and drop the name from the list above in the same commit.

`scripts/control-file-organizer.mjs doctor` confirms the advertised tool count,
which is the cheapest way to catch a registry change that was never documented.
