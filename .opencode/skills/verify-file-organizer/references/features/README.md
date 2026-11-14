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
| Inspect what is in a directory | [inspect.md](inspect.md) | `scan_directory`, `list_files`, `read_file`, `batch_read_files`, `inspect_metadata`, `find_largest_files`, `export_report` |
| Categorize and organize | [organize.md](organize.md) | `categorize_by_type`, `preview_organization`, `organize_files`, `organize_by_project`, `organize_by_date`, `organize_music`, `organize_photos`, `system_organize`, `validate_organization_plan` |
| Undo, quarantine and check integrity | [rollback.md](rollback.md) | `undo_last_operation`, `view_history`, `search_history`, `quarantine_files`, `restore_quarantine`, `verify_integrity` |
| Find and resolve duplicates | [duplicates.md](duplicates.md) | `find_duplicate_files`, `analyze_duplicates`, `preview_delete_duplicates`, `delete_duplicates` |
| Find space, old files and empty directories | [find.md](find.md) | `disk_usage_by_category`, `find_old_files`, `find_empty_directories`, `sensitive_scan` |
| Rename in bulk | [rename.md](rename.md) | `batch_rename` |
| Schedule a directory | [watch.md](watch.md) | `watch_directory`, `unwatch_directory`, `list_watches`, `watch_status` |
| Adapt behavior to the user | [customize.md](customize.md) | `set_custom_rules`, `smart_suggest`, `find_broken_symlinks`, `export_config` |
| Stay inside the sandbox | [security.md](security.md) | every tool, via `path-validator.service.ts` |

## Cross-cutting facts

These hold for every feature and are the most common source of a wrong turn.

- **Every tool defaults to `response_format: markdown`.** Pass `--json` before
  parsing. Do not assert against markdown text.
- **Nothing recurses by default, and the tools disagree about the default.**
  `scan_directory`, `find_old_files` and `sensitive_scan` default
  `include_subdirs` to false; `disk_usage_by_category`, `find_empty_directories`
  and `smart_suggest` default it to true. Read the schema rather than assuming.
  `organize_files` and `find_duplicate_files` have no such flag at all and see
  only the top level.
- **`organize_files` defaults to `dry_run: true`.** A proof of "it organized"
  that omits `dry_run: false` proves nothing moved. `organize_by_date`,
  `quarantine_files` and `restore_quarantine` default the same way.
- **Folder labels in responses are `/`-separated on every OS.** `organize_by_date`
  reports `folder: "2026/10"`, and `inspect_metadata` reports an
  `organizationPath` like `Images/2024/05/photo.jpg`. These are values a caller
  reads, not filesystem paths, so they do not vary by platform. Only real paths
  in a `from` or `to` field use the platform separator.
- **`HOME` relocates all four state locations.** Config, history, rollbacks and
  backups share one base directory. On Linux and Windows `XDG_CONFIG_HOME` or
  `APPDATA` relocate them too; on macOS the platform convention wins and
  `XDG_CONFIG_HOME` is ignored.
- **Paths in error messages are replaced with `[PATH]`.** Assert on the block
  list and the exit code, not on the path text.

## Coverage

The map names every tool the server registers. Run `node $C tools` for the live
list and treat anything missing from the files above as a gap to close, not as a
tool that needs no proof.

Coverage means there is a documented route to drive the tool. It does not mean
every call has been driven against every platform. Two limits are worth stating
plainly:

- **`organize_by_date` needs two allowed directories that are not nested.** The
  target cannot sit inside the source, and the path validator will not accept a
  target outside an allowed root. In the default sandbox that means both
  arguments have to live under `data/`, so a proof uses two siblings there. See
  [organize.md](organize.md).
- **`sensitive_scan` analyzes only JPEG and TIFF.** On the default fixtures it
  reports nearly everything under `skipped`, which is the tool working. See
  [find.md](find.md).

After adding or renaming a tool, update this index and the matching file in the
same commit. `scripts/control-file-organizer.mjs doctor` confirms the advertised
tool count, which is the cheapest way to catch a registry change that was never
documented.
