# <a id="top"></a>File Organizer MCP - API Reference

> Auto-generated from tool definitions

**Version:** 5.0.0  
**Generated:** 2026-02-13T16:45:00.000Z

[⬆ Back to Top](#top)

---

## Table of Contents

- [file_organizer_analyze_duplicates](#file_organizer_analyze_duplicates)
- [file_organizer_batch_read_files](#file_organizer_batch_read_files)
- [file_organizer_batch_rename](#file_organizer_batch_rename)
- [file_organizer_categorize_by_type](#file_organizer_categorize_by_type)
- [file_organizer_delete_duplicates](#file_organizer_delete_duplicates)
- [file_organizer_disk_usage_by_category](#file_organizer_disk_usage_by_category)
- [file_organizer_doctor](#file_organizer_doctor)
- [file_organizer_export_config](#file_organizer_export_config)
- [file_organizer_find_broken_symlinks](#file_organizer_find_broken_symlinks)
- [file_organizer_find_empty_directories](#file_organizer_find_empty_directories)
- [file_organizer_find_duplicate_files](#file_organizer_find_duplicate_files)
- [file_organizer_find_largest_files](#file_organizer_find_largest_files)
- [file_organizer_find_old_files](#file_organizer_find_old_files)
- [file_organizer_get_categories](#file_organizer_get_categories)
- [file_organizer_inspect_metadata](#file_organizer_inspect_metadata)
- [file_organizer_list_files](#file_organizer_list_files)
- [file_organizer_organize_by_date](#file_organizer_organize_by_date)
- [file_organizer_organize_by_project](#file_organizer_organize_by_project)
- [file_organizer_organize_files](#file_organizer_organize_files)
- [file_organizer_organize_music](#file_organizer_organize_music)
- [file_organizer_organize_photos](#file_organizer_organize_photos)
- [file_organizer_preview_delete_duplicates](#file_organizer_preview_delete_duplicates)
- [file_organizer_preview_organization](#file_organizer_preview_organization)
- [file_organizer_quarantine_files](#file_organizer_quarantine_files)
- [file_organizer_read_file](#file_organizer_read_file)
- [file_organizer_restore_quarantine](#file_organizer_restore_quarantine)
- [file_organizer_scan_directory](#file_organizer_scan_directory)
- [file_organizer_search_history](#file_organizer_search_history)
- [file_organizer_set_custom_rules](#file_organizer_set_custom_rules)
- [file_organizer_sensitive_scan](#file_organizer_sensitive_scan)
- [file_organizer_smart_suggest](#file_organizer_smart_suggest)
- [file_organizer_system_organize](#file_organizer_system_organize)
- [file_organizer_undo_last_operation](#file_organizer_undo_last_operation)
- [file_organizer_validate_organization_plan](#file_organizer_validate_organization_plan)
- [file_organizer_view_history](#file_organizer_view_history)

> **Note:** The watch tools (`file_organizer_watch_directory`, `file_organizer_unwatch_directory`,
> `file_organizer_list_watches`) are no longer part of the MCP server. Scheduled organization
> runs as a standalone process — see `file-organizer-watch` (`bin/file-organizer-watch.mjs`)
> with `add` / `remove` / `list` / `once` / `run` subcommands. `once` runs a single
> organization pass and exits, so an OS timer can be the scheduler. It takes `--json`
> for one parseable object on stdout and exits 0 (nothing to do), 1 (failed), or 2
> (moved files) — see README.md for the full contract. No MCP tool shape changed.

---

## file_organizer_analyze_duplicates

[⬆ Back to Top](#top)

**Description:** Finds duplicate files and suggests which to keep/delete based on location, name quality, and age.

### Parameters

| Parameter                 | Type    | Description | Default         |
| ------------------------- | ------- | ----------- | --------------- |
| `directory`               | string  | -           | -               |
| `recommendation_strategy` | string  | -           | 'best_location' |
| `auto_select_keep`        | boolean | -           | false           |
| `response_format`         | string  | -           | 'markdown'      |

### Example

```typescript
file_organizer_analyze_duplicates({
  directory: "value",
  recommendation_strategy: "value",
  auto_select_keep: true,
  response_format: "value",
});
```

---

## file_organizer_batch_rename

[⬆ Back to Top](#top)

**Description:** Rename multiple files using rules (find/replace, case, add text, numbering). The whole plan is checked for name collisions before the first file moves. Closes #44.

### Collision preview

Two files aimed at one name, or one file aimed at a name a different file already holds, are reported as collisions:

| Kind                | Meaning                                                    |
| ------------------- | ---------------------------------------------------------- |
| `duplicate_target`  | Two or more sources collapse onto the same destination name |
| `destination_exists` | A different file already holds the destination name        |

A dry run reports collisions and changes nothing. A real run (`dry_run: false`) with any collision is **rejected before the first rename**, so no file is renamed at all, even the ones with no clash. Adjust the rules or move the files already holding those names, then run again.

Collisions are returned as structured data in both response formats, and name the files by base name only, so a rejected plan does not echo directory layout back to the caller.

### Parameters

| Parameter         | Type    | Description                                        | Default    |
| ----------------- | ------- | -------------------------------------------------- | ---------- |
| `files`           | array   | List of absolute file paths                        | -          |
| `items`           | string  | -                                                  | -          |
| `directory`       | string  | Directory to scan (optional)                       | -          |
| `rules`           | array   | List of renaming rules. See specific rule schemas. | -          |
| `items`           | object  | -                                                  | -          |
| `dry_run`         | boolean | Simulate renaming                                  | true       |
| `response_format` | string  | -                                                  | 'markdown' |

### Response

| Field                          | Type     | Description                                                            |
| ------------------------------ | -------- | ---------------------------------------------------------------------- |
| `dry_run`                      | boolean  | Whether the call was a simulation                                      |
| `rejected`                     | boolean  | `true` only when a real run was stopped before the first rename         |
| `renamed`                      | number   | Files renamed. `0` on a dry run and on a rejection                      |
| `processed`                    | number   | Files the rules were evaluated against                                 |
| `conflicts[]`                  | array    | Collisions found. Empty when the plan is clear                          |
| `conflicts[].kind`             | string   | `duplicate_target` or `destination_exists`                             |
| `conflicts[].destination`      | string   | Contested destination file name                                         |
| `conflicts[].sources`          | array    | Base names of the files aimed at that destination                      |
| `previews[]`                   | array    | Per-file plan. Present on a dry run                                    |
| `result`                       | object   | Execution statistics and errors. Present on a real run                 |

### Example

```typescript
file_organizer_batch_rename({
  files: [],
  items: "value",
  directory: "value",
  rules: [],
  items: value,
  dry_run: true,
  response_format: "value",
});
```

---

## file_organizer_categorize_by_type

[⬆ Back to Top](#top)

**Description:** Categorize files by their type (Executables, Videos, Documents, etc.) and show statistics for each category.

### Parameters

| Parameter              | Type    | Description                              | Default    |
| ---------------------- | ------- | ---------------------------------------- | ---------- |
| `directory`            | string  | Full path to the directory to categorize | -          |
| `include_subdirs`      | boolean | Include subdirectories                   | false      |
| `use_content_analysis` | boolean | Enable magic-byte content inspection     | false      |
| `response_format`      | string  | Output format (markdown/json)            | 'markdown' |

### Example

```typescript
file_organizer_categorize_by_type({
  directory: "value",
  include_subdirs: true,
  use_content_analysis: false,
  response_format: "value",
});
```

---

## file_organizer_delete_duplicates

[⬆ Back to Top](#top)

**Description:** Deletes specified duplicate files. DESTRUCTIVE. Every candidate is hashed and checked against surviving copies before anything is removed. The search walks each candidate's parent and grandparent directory recursively, up to 10 levels deep and 10000 files, skipping dot-entries and `node_modules`/`.git`/`__pycache__`/`.venv`; a copy kept outside those roots is not found and the deletion is refused. Files over the hashing size cap are checked by size plus sampled content, which is weaker than a full hash and is reported as partially verified. Deleted files go to a recoverable backup dir; pass the returned manifest_id to file_organizer_undo_last_operation to restore them.

### Parameters

| Parameter                | Type    | Description                                                                                                                         | Default    |
| ------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `files_to_delete`        | array   | -                                                                                                                                   | -          |
| `items`                  | string  | -                                                                                                                                   | -          |
| `create_backup_manifest` | boolean | -                                                                                                                                   | true       |
| `verify_before_delete`   | boolean | Hash each candidate and refuse to delete a file with no surviving copy                                                              | true       |
| `candidate_directories`  | array   | Extra directories to search for surviving copies during verification, walked the same way as the candidate's parent and grandparent | `[]`       |
| `response_format`        | string  | -                                                                                                                                   | 'markdown' |

### Response fields

| Field                      | Type    | Description                                                   |
| -------------------------- | ------- | ------------------------------------------------------------- |
| `deleted_count`            | number  | Files removed                                                 |
| `failed_count`             | number  | Files refused or errored                                      |
| `verified`                 | boolean | Whether the surviving-copy check ran                          |
| `manifest_id`              | string  | Pass to `file_organizer_undo_last_operation` to restore       |
| `partially_verified_files` | array   | Deleted files whose check used a sampled identity (see below) |

Verification walks each file's parent and grandparent directory recursively, so a
copy in a subfolder of the parent is found. The walk is bounded by the scanner's
own limits: `maxScanDepth` (10) levels, `maxFilesPerOperation` (10000) files, and
dot-entries plus `node_modules`/`.git`/`__pycache__`/`.venv` are skipped. When the
only surviving copy lives outside those roots, pass its directory in
`candidate_directories`, otherwise it will be treated as a last copy and the
deletion refused.

Files above the 100MB hashing cap cannot be fully hashed, so their surviving-copy
check compares size plus the first and last 64KB instead of the whole file. Those
files are listed in `partially_verified_files`. That is a weaker check, not proof
of equality, and it is reported rather than implied.

### Example

```typescript
file_organizer_delete_duplicates({
  files_to_delete: [],
  items: "value",
  create_backup_manifest: true,
  verify_before_delete: true,
  candidate_directories: [],
  response_format: "value",
});
```

---

## file_organizer_disk_usage_by_category

[⬆ Back to Top](#top)

**Description:** Report how much space a directory holds per category: bytes, file count, and share of the total. Categories come from the same categorizer `categorize_by_type` and `organize_files` use, custom rules included, and sizes are summed from the scan rather than from a second directory walk. `include_subdirs` defaults to `true` because the space a category holds usually sits below the directory you point at. Read-only. Closes #43.

### Parameters

| Parameter         | Type    | Description                | Default    |
| ----------------- | ------- | -------------------------- | ---------- |
| `directory`       | string  | Full path to the directory | -          |
| `include_subdirs` | boolean | Include subdirectories     | true       |
| `response_format` | string  | `json` or `markdown`       | 'markdown' |

### Response fields

| Field                        | Type     | Description                                          |
| ---------------------------- | -------- | ---------------------------------------------------- |
| `directory`                  | string   | The measured directory                                |
| `total_files`                | number   | Files counted across all categories                  |
| `total_size`                 | number   | Total bytes counted                                  |
| `total_size_readable`        | string   | Total bytes as a readable size                       |
| `categories[]`               | array    | One entry per category, largest first                |
| `categories[].category`      | string   | Category name from the categorizer                   |
| `categories[].file_count`    | number   | Files in that category                               |
| `categories[].total_size`    | number   | Bytes in that category                               |
| `categories[].total_size_readable` | string | Bytes as a readable size                      |
| `categories[].percent_of_total` | number | Share of the total, rounded to two decimals     |

`percent_of_total` is rounded per category, so the shares of a directory with
many small categories add up to 100 within a rounding error rather than exactly.
Empty directories report zero totals instead of dividing by zero.

### Example

```typescript
file_organizer_disk_usage_by_category({
  directory: "value",
  include_subdirs: true,
  response_format: "value",
});
```

---

## file_organizer_find_broken_symlinks

[⬆ Back to Top](#top)

**Description:** Audit a directory for symlinks that dangle (target missing) or resolve outside the allowed directories. Recurses into real subdirectories but never follows a symlink, so it cannot read outside the allowed roots. Symlink loops are reported as their own kind. Read-only, so it is safe to run before organizing a directory. Closes #33.

### Parameters

| Parameter         | Type   | Description                | Default    |
| ----------------- | ------ | -------------------------- | ---------- |
| `directory`       | string | Full path to the directory | -          |
| `response_format` | string | `json` or `markdown`       | 'markdown' |

### Findings

| Field                        | Type   | Description                                        |
| ---------------------------- | ------ | -------------------------------------------------- |
| `directory`                  | string | The audited directory                              |
| `scanned_count`              | number | Symlinks examined                                  |
| `total_count`                | number | Findings reported                                  |
| `dangling_count`             | number | Findings whose `kind` is `dangling`                |
| `escaping_count`             | number | Findings whose `kind` is `escapes_allowed_roots`   |
| `circular_count`             | number | Findings whose `kind` is `circular`                |
| `findings[].path`            | string | Full path of the link itself, not its target       |
| `findings[].link_target`     | string | Raw link value as stored on disk                   |
| `findings[].kind`            | string | `dangling`, `escapes_allowed_roots`, or `circular` |
| `findings[].detail`          | string | Plain-English explanation                          |
| `findings[].resolved_target` | string | Canonical absolute target. Absent for a loop       |

Containment is decided by the same whitelist check the validation layer uses, so this tool and `organize_files` agree on what "outside the allowed roots" means.

### Example

```typescript
file_organizer_find_broken_symlinks({
  directory: "value",
  response_format: "value",
});
```

---

## file_organizer_find_empty_directories

[⬆ Back to Top](#top)

**Description:** List directories under a root that contain no entries at all, for cleanup after a scan. Recurses by default, bounded by the configured max scan depth and a result cap. Emptiness is literal: a directory holding only dotfiles, only a subdirectory, or only a symlink has entries and is not reported, so a directory that merely looks idle is never proposed for removal. Read-only, so it is safe to run before organizing. Closes #37.

### Parameters

| Parameter         | Type    | Description                                          | Default          |
| ----------------- | ------- | ---------------------------------------------------- | ---------------- |
| `directory`       | string  | Full path to the directory                           | -                |
| `include_subdirs` | boolean | Recurse into subdirectories                          | true             |
| `max_depth`       | number  | Levels below the root to walk (0 = root only)        | configured max   |
| `limit`           | number  | Maximum number of empty directories to return        | 100              |
| `response_format` | string  | `json` or `markdown`                                 | 'markdown'       |

### Findings

| Field             | Type     | Description                                             |
| ----------------- | -------- | ------------------------------------------------------- |
| `directory`       | string   | The root that was walked                                |
| `scanned_count`   | number   | Directories whose entries were listed                   |
| `depth_limited`   | boolean  | True when a subdirectory past the depth cap was skipped |
| `result_limited`  | boolean  | True when the result cap left a subdirectory unexplored |
| `limit`           | number   | The result cap that applied                             |
| `total_count`     | number   | Empty directories found                                 |
| `empty_dirs[]`    | string[] | Full paths, sorted                                       |

Read `depth_limited` and `result_limited` before treating a short list as complete. A directory is only reported when its listing came back with zero entries.

### Example

```typescript
file_organizer_find_empty_directories({
  directory: "value",
  include_subdirs: true,
  limit: 100,
  response_format: "value",
});
```

---

## file_organizer_find_duplicate_files

[⬆ Back to Top](#top)

**Description:** Find duplicate files in a directory based on their content (SHA-256 hash). Shows potential wasted space. Files above the hashing size cap (100MB by default) and empty files are not compared; any such file is reported back in `skipped` so the result is never mistaken for exhaustive.

### Parameters

| Parameter         | Type   | Description                | Default    |
| ----------------- | ------ | -------------------------- | ---------- |
| `directory`       | string | Full path to the directory | -          |
| `limit`           | number | Max groups to return       | 100        |
| `offset`          | number | Groups to skip             | 0          |
| `response_format` | string | -                          | 'markdown' |

### Not-analyzed files

Duplicate detection cannot compare every file. Anything left out is reported
rather than dropped, so a partial analysis is never returned as an exhaustive one.

| Field                  | Type   | Description                                                     |
| ---------------------- | ------ | --------------------------------------------------------------- |
| `skipped`              | array  | One entry per unanalyzed file                                   |
| `skipped[].path`       | string | Full path                                                       |
| `skipped[].name`       | string | File name                                                       |
| `skipped[].size_bytes` | number | Size in bytes                                                   |
| `skipped[].reason`     | string | `empty_file`, `exceeds_size_cap`, `hash_failed`, or `timed_out` |
| `skipped[].detail`     | string | Plain-English explanation of the skip                           |
| `skipped_bytes`        | number | Total bytes belonging to skipped files                          |

### Example

```typescript
file_organizer_find_duplicate_files({
  directory: "value",
  limit: 123,
  offset: 123,
  response_format: "value",
});
```

---

## file_organizer_find_largest_files

[⬆ Back to Top](#top)

**Description:** Find the largest files in a directory. Useful for identifying space-consuming files and cleanup opportunities.

### Parameters

| Parameter         | Type    | Description                | Default    |
| ----------------- | ------- | -------------------------- | ---------- |
| `directory`       | string  | Full path to the directory | -          |
| `include_subdirs` | boolean | Include subdirectories     | false      |
| `top_n`           | number  | Number of files to return  | 10         |
| `response_format` | string  | -                          | 'markdown' |

### Example

```typescript
file_organizer_find_largest_files({
  directory: "value",
  include_subdirs: true,
  top_n: 123,
  response_format: "value",
});
```

---

## file_organizer_find_old_files

[⬆ Back to Top](#top)

**Description:** Find files in a directory that have not been touched for N days, oldest first. Age is measured from the last modification time by default, or from the last access time when asked. Read-only: nothing is moved or deleted.

### Parameters

| Parameter         | Type    | Description                                                                   | Default    |
| ----------------- | ------- | ----------------------------------------------------------------------------- | ---------- |
| `directory`       | string  | Full path to the directory                                                   | -          |
| `include_subdirs` | boolean | Include subdirectories                                                        | false      |
| `older_than_days` | number  | Only return files untouched for at least this many days (1-36500)              | 365        |
| `age_source`      | string  | Timestamp to measure age from: `mtime` (last modified) or `atime` (last accessed) | mtime  |
| `top_n`           | number  | Number of oldest files to return                                              | 10         |
| `response_format` | string  | `json` or `markdown`                                                          | 'markdown' |

### Example

```typescript
file_organizer_find_old_files({
  directory: "value",
  include_subdirs: true,
  older_than_days: 365,
  age_source: "mtime",
  top_n: 10,
  response_format: "json",
});
```

### Result fields (`json`)

| Field                   | Type    | Description                                                     |
| ----------------------- | ------- | --------------------------------------------------------------- |
| `directory`             | string  | Validated directory that was searched                          |
| `age_source`            | string  | Timestamp the ages were measured from                          |
| `older_than_days`       | number  | Threshold that was applied                                    |
| `total_count`           | number  | Files that matched, before `top_n` cut the list                |
| `returned_count`        | number  | Entries in `old_files`                                         |
| `old_files[]`           | array   | Oldest first                                                   |
| `old_files[].name`      | string  | File name                                                      |
| `old_files[].path`      | string  | Full path                                                     |
| `old_files[].size`      | number  | Size in bytes                                                 |
| `old_files[].size_readable` | string | Human-readable size                                       |
| `old_files[].age_days`  | number  | Whole days since the chosen timestamp                          |
| `old_files[].accessed_or_modified` | string | ISO 8601 timestamp the age was measured from        |

---

## file_organizer_get_categories

[⬆ Back to Top](#top)

**Description:** Returns the list of categories used for file organization

### Parameters

| Parameter         | Type   | Description | Default    |
| ----------------- | ------ | ----------- | ---------- |
| `response_format` | string | -           | 'markdown' |

### Example

```typescript
file_organizer_get_categories({
  response_format: "value",
});
```

---

## file_organizer_inspect_metadata

[⬆ Back to Top](#top)

**Description:** Inspects a file and returns comprehensive but privacy-safe metadata. For images, extracts EXIF data (date, camera, dimensions). For audio, extracts ID3 tags (artist, album, title). Excludes sensitive data like GPS coordinates.

### Parameters

| Parameter         | Type   | Description                      | Default    |
| ----------------- | ------ | -------------------------------- | ---------- |
| `file`            | string | Full path to the file to inspect | -          |
| `response_format` | string | -                                | 'markdown' |

### Example

```typescript
file_organizer_inspect_metadata({
  file: "value",
  response_format: "value",
});
```

---

## file_organizer_list_files

[⬆ Back to Top](#top)

**Description:** List all files in a directory with basic information. Returns file names and paths. Does not recurse into subdirectories.

### Parameters

| Parameter         | Type   | Description                | Default    |
| ----------------- | ------ | -------------------------- | ---------- |
| `directory`       | string | Full path to the directory | -          |
| `limit`           | number | Max items to return        | 100        |
| `offset`          | number | Items to skip              | 0          |
| `response_format` | string | -                          | 'markdown' |

### Example

```typescript
file_organizer_list_files({
  directory: "value",
  limit: 123,
  offset: 123,
  response_format: "value",
});
```

---

## file_organizer_organize_files

[⬆ Back to Top](#top)

**Description:** Automatically organize files into categorized folders. Use dry_run=true to preview changes.

### Parameters

| Parameter              | Type    | Description                                                                                | Default    |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------ | ---------- |
| `directory`            | string  | Full path to the directory                                                                 | -          |
| `dry_run`              | boolean | Simulate organization                                                                      | true       |
| `conflict_strategy`    | string  | How to handle file conflicts (rename/skip/overwrite). Uses config default if not specified | -          |
| `use_content_analysis` | boolean | Enable magic-byte content inspection                                                       | false      |
| `response_format`      | string  | Output format (markdown/json)                                                              | 'markdown' |

### Example

```typescript
file_organizer_organize_files({
  directory: "value",
  dry_run: true,
  conflict_strategy: "value",
  use_content_analysis: false,
  response_format: "value",
});
```

---

## file_organizer_preview_delete_duplicates

[⬆ Back to Top](#top)

**Description:** Dry-run for file_organizer_delete_duplicates. Groups duplicates and names the single copy that would survive under the keep_strategy you pick (newest, oldest, or keep_first), plus the flat list of files that would be deleted. Read-only: nothing is moved or removed. Pass files_to_delete to file_organizer_delete_duplicates to act on it. Files the scan could not compare are listed under skipped, so a 'nothing to delete' answer can still be partial.

### Parameters

| Parameter         | Type   | Description                                                                          | Default    |
| ----------------- | ------ | ------------------------------------------------------------------------------------ | ---------- |
| `directory`       | string | Full path to the directory                                                           | -          |
| `keep_strategy`   | string | Survivor per group: `newest` (most recently modified), `oldest`, or `keep_first` (first found by the scan) | 'newest' |
| `response_format` | string | `json` or `markdown`                                                                 | 'markdown' |

`keep_strategy` names the survivor outright. It is deliberately not
`recommendation_strategy`: analyze_duplicates blends path depth and location
quality into a score, so a preview labelled `newest` has to mean the most
recently modified copy and nothing else.

### Response fields

| Field                                | Type   | Description                                                     |
| ------------------------------------ | ------ | --------------------------------------------------------------- |
| `dry_run`                            | boolean | Always `true`. Nothing was moved or removed                     |
| `keep_strategy`                      | string | The strategy that was applied                                   |
| `summary.total_duplicate_groups`     | number | Duplicate groups found                                          |
| `summary.total_files_to_delete`      | number | Files a delete would remove                                     |
| `summary.total_wasted_space_bytes`   | number | Bytes those deletions would reclaim                             |
| `not_analyzed_files` / `not_analyzed_bytes` | number | Files the scan could not compare — the blind spot of this answer |
| `duplicate_groups[].keep`            | string | The one copy in the group that survives                         |
| `duplicate_groups[].would_delete`    | array  | Every other copy in the group                                   |
| `files_to_delete`                    | array  | Flat, de-duplicated list, ready to pass to `file_organizer_delete_duplicates` |

`skipped` lists files the scan could not compare (empty files, files over the
hashing cap, unreadable files, files dropped by the scan timeout). An empty
`files_to_delete` alongside a non-empty `skipped` means "nothing found", not
"nothing wrong" — the two are reported separately for that reason.

### Example

```typescript
const preview = file_organizer_preview_delete_duplicates({
  directory: "~/Downloads",
  keep_strategy: "newest",
  response_format: "json",
});

// Nothing deleted yet. Act on exactly what was previewed:
file_organizer_delete_duplicates({
  files_to_delete: preview.files_to_delete,
});
```

---

## file_organizer_preview_organization

[⬆ Back to Top](#top)

**Description:** Shows what would happen if files were organized, WITHOUT making any changes. Shows moves, conflicts, and skip reasons.

### Parameters

| Parameter             | Type    | Description                                                                                            | Default    |
| --------------------- | ------- | ------------------------------------------------------------------------------------------------------ | ---------- |
| `directory`           | string  | Full path to the directory                                                                             | -          |
| `show_conflicts_only` | boolean | -                                                                                                      | false      |
| `response_format`     | string  | -                                                                                                      | 'markdown' |
| `conflict_strategy`   | string  | How to handle file conflicts for preview (rename/skip/overwrite). Uses config default if not specified | -          |

### Example

```typescript
file_organizer_preview_organization({
  directory: "value",
  show_conflicts_only: true,
  response_format: "value",
  conflict_strategy: "value",
});
```

---

## file_organizer_quarantine_files

[⬆ Back to Top](#top)

**Description:** Sets flagged files aside in a quarantine directory so they can be reviewed without being deleted. Nothing is removed from disk: each file is moved into a hidden quarantine directory and recorded in a rollback manifest, so file_organizer_undo_last_operation or file_organizer_restore_quarantine puts every file back where it came from. Defaults to dry_run=true, which lists what would be quarantined and changes nothing. Same-basename files never overwrite each other; a collision becomes name_1.ext.

### Parameters

| Parameter         | Type     | Description                                                                                                     | Default    |
| ----------------- | -------- | --------------------------------------------------------------------------------------------------------------- | ---------- |
| `directory`       | string   | Directory the flagged files live in                                                                             | -          |
| `files`           | string[] | Absolute paths of the flagged files, all inside `directory`                                                    | -          |
| `quarantine_dir`  | string   | Where to move them. Defaults to a hidden `.file-organizer-quarantine` directory inside `directory`             | -          |
| `reason`          | string   | Note recorded in the manifest, e.g. why these were flagged                                                      | -          |
| `dry_run`         | boolean  | List what would be quarantined without moving anything                                                         | true       |
| `response_format` | string   | `markdown` for human-readable, `json` for programmatic use                                                      | 'markdown' |

### Response fields

| Field             | Type     | Description                                                                  |
| ----------------- | -------- | ---------------------------------------------------------------------------- |
| `directory`       | string   | Validated directory the files were taken from                                |
| `quarantine_dir`  | string   | Validated directory the files were (or would be) moved into                  |
| `dry_run`         | boolean  | True when nothing was moved                                                  |
| `requested`       | number   | How many file paths the caller asked for                                    |
| `planned`         | number   | How many files have a destination (the whole plan on a dry run)             |
| `quarantined`     | number   | Files actually moved. Always 0 on a dry run                                 |
| `items`           | object[] | `{ file, from, to }` per file: the plan on a dry run, the moves that landed |
| `skipped`         | object[] | `{ path, reason }` for files left out                                       |
| `errors`          | string[] | Per-file failures and manifest-write failures                               |
| `manifest_id`     | string   | Rollback manifest covering the moves. Absent on a dry run                   |
| `reason`          | string   | The caller's note, when supplied                                            |

Every path field above is an **absolute** path: `directory`, `quarantine_dir`,
`items[].from`, `items[].to`, and `skipped[].path`. That matches
`file_organizer_organize_files`, whose `actions[].from` / `actions[].to` are
absolute too. Absolute paths are canonicalised through the path validator, so
they are platform-dependent in *spelling*: Windows expands 8.3 short names
(`C:\Users\RUNNER~1\...` comes back as `C:\Users\runneradmin\...`) and macOS
rewrites `/var` to `/private/var`. Two spellings of the same file therefore
compare unequal as strings. Compare basenames, or normalise both sides through
the same function, rather than comparing raw path strings.

### Notes

- The quarantine directory is derived from `directory`, not hardcoded, and both
  it and every listed file pass the same `validateStrictPath` gate as any other
  input. A `quarantine_dir` outside your allowed directories is refused.
- Every listed file must live inside `directory`. Paths are all validated before
  the first move, so a batch containing one bad path moves nothing.
- A same-basename collision becomes `name_1.ext`, so no file overwrites another.
- The manifest is what makes this reversible: pass its id to
  `file_organizer_restore_quarantine`, or call `file_organizer_undo_last_operation`.

### Example

```typescript
file_organizer_quarantine_files({
  directory: "/home/user/Downloads",
  files: ["/home/user/Downloads/invoice.exe"],
  reason: "flags as executable content",
  dry_run: false,
});
```

---

## file_organizer_restore_quarantine

[⬆ Back to Top](#top)

**Description:** Puts quarantined files back at the exact paths they were taken from, using the manifest quarantine_files wrote. The restore records its own manifest, so file_organizer_undo_last_operation can undo the restore and put the files back into quarantine. Defaults to dry_run=true, which lists what would be restored and changes nothing.

### Parameters

| Parameter         | Type    | Description                                                             | Default    |
| ----------------- | ------- | ----------------------------------------------------------------------- | ---------- |
| `quarantine_id`   | string  | Manifest id returned by `quarantine_files`. Omit to restore the newest  | -          |
| `dry_run`         | boolean | List what would be restored without moving anything                     | true       |
| `response_format` | string  | `markdown` for human-readable, `json` for programmatic use              | 'markdown' |

### Response fields

| Field           | Type     | Description                                                                 |
| --------------- | -------- | --------------------------------------------------------------------------- |
| `dry_run`       | boolean  | True when nothing was moved                                                 |
| `quarantine_id` | string   | Quarantine manifest this restore read                                       |
| `requested`     | number   | Moves recorded in that manifest                                             |
| `planned`       | number   | How many restores have a destination                                        |
| `restored`      | number   | Files actually put back. Always 0 on a dry run                             |
| `items`         | object[] | `{ file, from, to }` per file: the plan on a dry run, the moves that landed |
| `errors`        | string[] | Per-file failures, manifest-write failures, and refused paths              |
| `manifest_id`   | string   | Rollback manifest covering the restore, so the restore is undoable         |

`items[].from` and `items[].to` are **absolute** canonical paths, the same
contract `file_organizer_organize_files` uses. They are platform-dependent in
spelling (Windows expands 8.3 short names, macOS rewrites `/var` to
`/private/var`), so compare basenames or normalise both sides rather than
comparing raw path strings.

### Notes

- The manifest is verified for integrity before any recorded path is trusted,
  and each recorded path is re-checked against your allowed directories.
- Omitting `quarantine_id` restores the most recent quarantine manifest. When
  there is none, the call fails rather than guessing at some unrelated batch.
- On success the quarantine manifest is retired, the same way undo retires a
  spent manifest. The restore manifest carries the reverse mapping.

### Example

```typescript
file_organizer_restore_quarantine({
  quarantine_id: "5f2c1a90-8b3e-4d7a-9c11-2e6f0a4b7d38",
  dry_run: false,
});
```

---

## file_organizer_read_file

[⬆ Back to Top](#top)

**Description:** Read file contents with security checks. Supports text, binary, and base64 encoding.

### Parameters

| Parameter           | Type    | Description                                                               | Default    |
| ------------------- | ------- | ------------------------------------------------------------------------- | ---------- |
| `path`              | string  | Absolute path to the file to read (e.g., /home/user/documents/report.txt) | -          |
| `encoding`          | string  | Text encoding for the file content                                        | "utf-8"    |
| `maxBytes`          | number  | Maximum bytes to read (default: 10MB, max: 100MB)                         | 10MB       |
| `offset`            | number  | Byte offset to start reading from                                         | 0          |
| `limit`             | number  | Maximum bytes to read (alternative to maxBytes)                           | -          |
| `response_format`   | string  | Format of the response                                                    | "markdown" |
| `calculateChecksum` | boolean | Include SHA-256 checksum in response                                      | true       |

### Example

```typescript
file_organizer_read_file({
  path: "value",
  encoding: "value",
  maxBytes: 123,
  offset: 123,
  limit: 123,
  response_format: "value",
  calculateChecksum: true,
});
```

---

## file_organizer_scan_directory

[⬆ Back to Top](#top)

**Description:** Scan directory and get detailed file information including size, dates, and extensions. Supports recursive scanning.

### Parameters

| Parameter         | Type    | Description                        | Default    |
| ----------------- | ------- | ---------------------------------- | ---------- |
| `directory`       | string  | Full path to the directory to scan | -          |
| `include_subdirs` | boolean | Include subdirectories in the scan | false      |
| `max_depth`       | number  | Maximum depth to scan              | -1         |
| `limit`           | number  | Max items to return                | 100        |
| `offset`          | number  | Items to skip                      | 0          |
| `response_format` | string  | -                                  | 'markdown' |

### Example

```typescript
file_organizer_scan_directory({
  directory: "value",
  include_subdirs: true,
  max_depth: 123,
  limit: 123,
  offset: 123,
  response_format: "value",
});
```

---

## file_organizer_set_custom_rules

[⬆ Back to Top](#top)

**Description:** Customize how files are categorized. Persists custom rules to user configuration, replacing any rules saved earlier. Invalid rules are skipped; if the rules cannot be written to disk the call reports an error instead of a success.

### Parameters

| Parameter          | Type   | Description          | Default    |
| ------------------ | ------ | -------------------- | ---------- |
| `rules`            | array  | -                    | -          |
| `items`            | object | -                    | -          |
| `properties`       | string | -                    | -          |
| `category`         | string | -                    | -          |
| `extensions`       | array  | -                    | -          |
| `filename_pattern` | string | -                    | -          |
| `priority`         | number | -                    | -          |
| `response_format`  | string | 'json' or 'markdown' | 'markdown' |

### Example

```typescript
file_organizer_set_custom_rules({
  rules: [],
  items: value,
  properties: "value",
  category: "value",
  extensions: [],
  filename_pattern: "value",
  priority: 123,
  response_format: "markdown",
});
```

---

## file_organizer_sensitive_scan

[⬆ Back to Top](#top)

**Description:** Screen a directory for files carrying personal metadata and score each one 0-100 for the risk of sharing it. Detects EXIF GPS coordinates and altitude, GPS fix timestamps, owner/artist names, camera and lens serial numbers, camera or computer make and model, copyright lines, capture/editing software, and free-text notes. Read-only. Closes #34.

> **Heuristic detection, not redaction.** The tool reports; it never modifies or
> strips anything. **A risk score of 0 means no recognized EXIF tag was found —
> it does NOT mean the file is safe to share.** Metadata outside EXIF (PDF
> annotations, XMP, IPTC, embedded thumbnails), file names, and the visible image
> content are not analyzed, and only the first 256 KB of each file is read. Every
> response carries this caveat in its `limits` field, in both response formats.
> Treat the scan output itself as sensitive: it echoes the values it found.

### Parameters

| Parameter         | Type    | Description                                                            | Default    |
| ----------------- | ------- | ---------------------------------------------------------------------- | ---------- |
| `directory`       | string  | Full path to the directory to screen                                    | -          |
| `include_subdirs` | boolean | Descend into real subdirectories. Symbolic links are never followed.   | false      |
| `response_format` | string  | `json` or `markdown`                                                    | 'markdown' |

Only the head of each file is read, so a large photo is never loaded whole.

### Response fields

| Field                        | Type     | Description                                                              |
| ---------------------------- | -------- | ------------------------------------------------------------------------ |
| `directory`                  | string   | The scanned directory                                                    |
| `scanned_count`              | number   | Files whose metadata was actually parsed                                 |
| `skipped_count`              | number   | Files present but outside what this scan can analyze                     |
| `flagged_count`              | number   | Scanned files carrying at least one finding                              |
| `highest_risk_score`         | number   | Highest score seen, or 0                                                 |
| `truncated`                  | boolean  | A subdirectory past the max scan depth was not walked                    |
| `files[].name`               | string   | File name                                                                |
| `files[].path`               | string   | Full path                                                                |
| `files[].format`             | string   | Detected format, `jpeg` or `tiff`. Trusted over the extension.           |
| `files[].risk_score`         | number   | 0-100, the sum of the reason weights, capped at 100                     |
| `files[].risk_level`         | string   | `none`, `low` (1-24), `medium` (25-59), or `high` (60+)                 |
| `files[].reasons[].kind`     | string   | What kind of personal data the tag carries                               |
| `files[].reasons[].weight`   | number   | Points this reason added. The weights sum to `risk_score`.               |
| `files[].reasons[].detail`   | string   | Plain-English statement naming the tag                                   |
| `files[].reasons[].exif_tags` | string[] | EXIF tag names behind the finding                                       |
| `files[].reasons[].value`    | string   | Detected value, capped in length. Absent for tags that are not a readable string or number. |
| `skipped[].reason`           | string   | `format_not_analyzed` or `unreadable`                                    |
| `skipped[].detail`           | string   | Why this file was skipped                                                |
| `limits`                     | string[] | The coverage caveat. Required reading, not decoration.                   |

`files` is sorted by risk score descending, then by path, so the worst file is first. A
symbolic link is reported under `skipped` rather than followed.

Reason weights: `gps_coordinates` 40, `owner_name` 30, `serial_number` 25, `camera_device` 15,
`notes_or_comment` 10, `gps_altitude` 5, `gps_timestamp` 5, `copyright` 5, `software` 5.

### Example

```typescript
file_organizer_sensitive_scan({
  directory: "value",
  include_subdirs: true,
  response_format: "value",
});
```

---

## file_organizer_smart_suggest

[⬆ Back to Top](#top)

**Description:** Analyze directory health and get actionable suggestions for organization.

### Parameters

| Parameter            | Type    | Description                   | Default    |
| -------------------- | ------- | ----------------------------- | ---------- |
| `directory`          | string  | Directory to analyze          | -          |
| `include_subdirs`    | boolean | Include subdirectories        | true       |
| `include_duplicates` | boolean | Check for duplicates (slower) | true       |
| `max_files`          | number  | Maximum files to scan         | 10000      |
| `timeout_seconds`    | number  | Timeout in seconds            | 60         |
| `sample_rate`        | number  | Sample rate for large dirs    | 1          |
| `use_cache`          | boolean | Use cached results            | true       |
| `response_format`    | string  | 'json' or 'markdown'          | 'markdown' |

### Example

```typescript
file_organizer_smart_suggest({
  directory: "~/Downloads",
});
```

---

## file_organizer_system_organize

[⬆ Back to Top](#top)

**Description:** Organize files into OS-standard system directories (Music, Documents, Pictures, Videos). Source must be Downloads, Desktop, or Temp.

### Parameters

| Parameter               | Type    | Description                                         | Default     |
| ----------------------- | ------- | --------------------------------------------------- | ----------- |
| `source_dir`            | string  | Source directory (Downloads, Desktop, or Temp)      | -           |
| `use_system_dirs`       | boolean | Use OS system directories                           | true        |
| `create_subfolders`     | boolean | Create organized subfolders                         | true        |
| `fallback_to_local`     | boolean | Fallback to local folder if system dir not writable | true        |
| `local_fallback_prefix` | string  | Prefix for local fallback folder                    | 'Organized' |
| `conflict_strategy`     | string  | 'skip', 'rename', or 'overwrite'                    | 'rename'    |
| `dry_run`               | boolean | Preview without moving                              | true        |
| `copy_instead_of_move`  | boolean | Copy instead of move                                | false       |
| `response_format`       | string  | 'json' or 'markdown'                                | 'markdown'  |

### Example

```typescript
file_organizer_system_organize({
  source_dir: "~/Downloads",
  dry_run: true,
});
```

---

## file_organizer_undo_last_operation

[⬆ Back to Top](#top)

**Description:** Reverses file moves and renames from a previous organization task.

### Parameters

| Parameter         | Type   | Description | Default    |
| ----------------- | ------ | ----------- | ---------- |
| `manifest_id`     | string | -           | -          |
| `response_format` | string | -           | 'markdown' |

### Example

```typescript
file_organizer_undo_last_operation({
  manifest_id: "value",
  response_format: "value",
});
```

---

## file_organizer_validate_organization_plan

[⬆ Back to Top](#top)

**Description:** Checks the organization plan organize_files would execute and returns an ok / not-ok verdict. Read-only: nothing is moved, renamed, or deleted. Flags two or more sources landing on one destination name, destinations that already exist, moves that cross a device boundary (compared with fs.stat device ids), and sources the sensitive-file gate would refuse. Reports `checked` and `not_checked` so a clean result is not read as a guarantee. Builds the plan with the same conflict_strategy organize_files would use; pass include_subdirs=true to check a plan over subdirectories, which organize_files itself does not scan. Every path it reports (directory, sources, destinations) is an absolute filesystem path in the platform's native form, byte-identical to what preview_organization and organize_files report for the same plan; no separator normalization is applied, so match them with path-aware logic rather than string equality.

### Parameters

| Parameter           | Type    | Description                                                                                          | Default    |
| ------------------- | ------- | ---------------------------------------------------------------------------------------------------- | ---------- |
| `directory`         | string  | Full path to the directory                                                                             | -          |
| `include_subdirs`   | boolean | Validate a plan built over subdirectories. Default false matches the depth organize_files scans      | false      |
| `response_format`   | string  | -                                                                                                      | 'markdown' |
| `conflict_strategy` | string  | How to handle file conflicts for the validated plan. Uses config default if not specified              | -          |

### Output

```typescript
{
  // Absolute filesystem path, platform-native form (see description).
  directory: string;
  // False when any finding has severity "error".
  ok: boolean;
  moves_checked: number;
  counts: { error: number; warning: number };
  findings: Array<{
    kind:
      | "destination_name_collision"
      | "destination_exists"
      | "cross_device_move"
      | "sensitive_source"
      | "incomplete_plan";
    severity: "error" | "warning";
    // Absolute filesystem paths, platform-native form.
    sources: string[];
    destinations: string[];
    detail: string;
  }>;
  // What this check looked at, and what it did not.
  checked: string[];
  not_checked: string[];
}
```

### Example

```typescript
file_organizer_validate_organization_plan({
  directory: "value",
  include_subdirs: true,
  response_format: "value",
  conflict_strategy: "value",
});
```

---

## file_organizer_view_history

[⬆ Back to Top](#top)

**Description:** View the history of file organization operations. Supports filtering by date range, operation type, status, and source. Use privacy_mode to control output detail level.

### Parameters

| Parameter         | Type   | Description                                       | Default    |
| ----------------- | ------ | ------------------------------------------------- | ---------- |
| `limit`           | number | Maximum number of entries to return (1-1000)      | 20         |
| `since`           | string | ISO date string - return entries after this time  | -          |
| `until`           | string | ISO date string - return entries before this time | -          |
| `operation`       | string | Filter by operation name                          | -          |
| `status`          | string | 'success', 'error', or 'partial'                  | -          |
| `source`          | string | 'manual' or 'scheduled'                           | -          |
| `privacy_mode`    | string | 'full', 'redacted', or 'none'                     | -          |
| `response_format` | string | 'json' or 'markdown'                              | 'markdown' |

Entries may carry a `paths` array — the paths that operation touched, recorded
when the tool call named a directory. `privacy_mode` treats it like the other
path-bearing fields: redacted in `redacted`, absent in `none`.
[`file_organizer_search_history`](#file_organizer_search_history) filters on it.

### Example

```typescript
file_organizer_view_history({
  limit: 20,
});
```

---

## file_organizer_search_history

[⬆ Back to Top](#top)

**Description:** Search the file organization history. Filter entries by path glob, date range (`from` / `to`), operation type, status, or source — every filter is optional and the ones you pass combine. Reads the same history as `file_organizer_view_history`; use `view_history` for the plain newest-first list and this tool when the list has grown past that.

**Read-only.** No path on disk is read or written by the filters — the glob is matched against the paths already recorded in each history entry, not against the filesystem.

### Parameters

| Parameter         | Type   | Description                                                                          | Default    |
| ----------------- | ------ | ------------------------------------------------------------------------------------ | ---------- |
| `path_glob`       | string | Glob matched against the paths each entry recorded                                    | -          |
| `from`            | string | ISO date string - return entries at or after this time                               | -          |
| `to`              | string | ISO date string - return entries at or before this time                              | -          |
| `operation`       | string | Filter by operation name                                                             | -          |
| `status`          | string | 'success', 'error', or 'partial'                                                     | -          |
| `source`          | string | 'manual' or 'scheduled'                                                              | -          |
| `limit`           | number | Maximum number of entries to return (1-1000)                                         | 20         |
| `privacy_mode`    | string | 'full', 'redacted', or 'none'                                                        | -          |
| `response_format` | string | 'json' or 'markdown'                                                                 | 'markdown' |

### `path_glob` semantics

One pattern is tried three ways against each recorded path, so whichever form you write works:

| Pattern          | Matches                                                             |
| ---------------- | ------------------------------------------------------------------- |
| `**/Downloads`   | the full recorded path, e.g. `/home/you/Downloads`                   |
| `**/Downloads/**`| anything under that directory                                       |
| `*.pdf`          | the bare filename, so the pattern does not need the full path        |

Recorded Windows paths are matched with `\` folded to `/`, so `**/Downloads` still matches `C:\Users\you\Downloads`. `path_glob` is bounded like any other path input (non-empty, no null byte, no `..`), and a pattern minimatch cannot compile is rejected as a `ValidationError` instead of quietly matching nothing.

An entry only matches a `path_glob` if it recorded a path. Operations that never touch a directory (`file_organizer_get_categories`, a failed call with no directory argument) do not match any glob.

### Example

```typescript
file_organizer_search_history({
  path_glob: "**/Downloads/**",
  from: "2026-01-01T00:00:00.000Z",
  operation: "file_organizer_organize_files",
  limit: 20,
});
```

---

## file_organizer_doctor

[⬆ Back to Top](#top)

**Description:** Report the effective configuration after defaults, config.json and env are layered, and flag every configured allowed directory that is missing, blocked by security policy, or rejected by the home-directory gate. Use this first when a call fails unexpectedly.

**Read-only.** Safe to call at any time; changes nothing on disk.

### Parameters

| Parameter         | Type   | Description          | Default    |
| ----------------- | ------ | -------------------- | ---------- |
| `response_format` | string | 'json' or 'markdown' | 'markdown' |

### Returned fields

| Field                     | Description                                                            |
| ------------------------- | ---------------------------------------------------------------------- |
| `version`                 | Server version                                                         |
| `platform`                | `process.platform` the report was built on                             |
| `config_file_present`     | Whether a config.json was found (false means defaults only)            |
| `security`                | Effective security settings after config.json is layered over defaults |
| `conflict_strategy`       | Effective conflict strategy                                            |
| `allow_external_volumes`  | Whether external volumes are allowed                                   |
| `custom_rule_count`       | Number of custom categorization rules                                  |
| `default_allowed`         | Platform default allowed roots that exist                              |
| `configured_allowed_dirs` | One entry per `customAllowedDirectories` entry                         |
| `effective_allowed_dirs`  | The configured entries the security gate kept, with `~` expanded        |
| `unknown_config_keys`     | config.json keys the loader does not understand                        |
| `problems`                | Human-readable list of what is wrong                                   |
| `healthy`                 | True when `problems` is empty                                          |

Each `configured_allowed_dirs` entry carries `configured` (as written in
config.json), `resolved` (`~` expanded), `exists`, `is_directory`, `symlink`,
`accepted`, optional `rejection` (`missing`, `not_a_directory`, `symlink`,
`path_traversal`, `null_byte`, `outside_home`,
`external_volume_not_allowed`), and `blocked_by_policy`.

`blocked_by_policy` is independent of `accepted`. The always-blocked pattern
list is enforced per request, so a directory can be accepted by the config gate
and still be rejected when a tool touches it. A `missing` directory is reported
as a likely typo, a `blocked_by_policy` directory is reported as unusable, and
the two problems read differently so they can be told apart.

### Example

```typescript
file_organizer_doctor({
  response_format: "json",
});
```

---

## file_organizer_export_config

[⬆ Back to Top](#top)

**Description:** Bundle the user config — allowed directories, categorization
rules, conflict strategy, watch entries, auto-organize and history settings —
into one JSON document for another machine. The directory paths are absolute and
machine-specific, so the reply always states which fields must be edited on the
target; pass `rebase_root` to emit `~/`-relative paths instead.

Reads the config file and never writes it. With `output_path` it writes the
bundle there, through the same path validation as every other tool, and the
write refuses to overwrite an existing file.

**Not read-only** (it can write the bundle file), **not destructive** (it never
deletes or replaces anything), **not idempotent** (a second run against the same
`output_path` fails on the existing file).

### Parameters

| Parameter          | Type   | Description                                                                          | Default    |
| ------------------ | ------ | ------------------------------------------------------------------------------------ | ---------- |
| `output_path`      | string | Where to write the bundle JSON. Omit to receive the bundle in the reply, no write.   | -          |
| `rebase_root`      | string | Directory on this machine that the target's home occupies. Paths under it export as `~/relative`. | -          |
| `response_format`  | string | 'json' or 'markdown'                                                                 | 'markdown' |

### Returned fields

| Field                 | Description                                                            |
| --------------------- | ---------------------------------------------------------------------- |
| `format_version`      | Bundle format version (`1`)                                            |
| `mode`                | `absolute` (paths as configured) or `rebased` (`~/`-relative)          |
| `rebase_root`         | The root used for rebasing, or null in absolute mode                   |
| `output_path`         | Where the bundle was written, or null when nothing was written        |
| `written`             | True when a bundle file was written                                   |
| `bytes_written`       | Size of the written bundle                                            |
| `config_file_present` | Whether a config.json was found behind this export                    |
| `counts`              | Entry counts for allowed directories, custom rules, rules, watches    |
| `requires_editing`    | Fields a user must edit by hand on the target machine                 |
| `non_portable_paths`  | Paths that could not be rebased, with the field each came from        |
| `notes`               | Human-readable statements about portability                          |
| `config`              | The exported config subset — a superset-free copy of what the loader understands |

### Portability

`bundle.config` holds every config key the loader understands, so merging it
into a target machine's `config.json` reproduces the source config's shape. The
directory half does not travel on its own:

- `absolute` mode exports `customAllowedDirectories` and
  `watchList[].directory` verbatim and lists both in `requires_editing`, because
  they are absolute paths of the exporting machine.
- `rebased` mode rewrites each of those paths under `rebase_root` as
  `~/relative` (forward slashes on every platform). A value already written as
  `~/…` is left alone. Anything outside the root — an external volume, a system
  path — has no portable spelling, so it is exported unchanged and named in
  `non_portable_paths` with `reason: outside_rebase_root`.

The bundle document on disk is `{ format_version, exported_by, exported_at,
config, portability }`.

### Example

```typescript
file_organizer_export_config({
  output_path: "~/fom-config-bundle.json",
  rebase_root: "~",
  response_format: "json",
});
```

---

## file_organizer_organize_music

[⬆ Back to Top](#top)

**Description:** Organize music files into structured folders based on metadata (Artist/Album/Title). Supports MP3, FLAC, OGG, WAV, M4A, AAC formats.

### Parameters

| Parameter                  | Type    | Description                                                          | Default             |
| -------------------------- | ------- | -------------------------------------------------------------------- | ------------------- |
| `source_dir`               | string  | Full path to directory containing music files                        | -                   |
| `target_dir`               | string  | Full path where organized music will be placed                       | -                   |
| `structure`                | string  | Folder structure: 'artist/album', 'album', 'genre/artist', 'flat'    | 'artist/album'      |
| `filename_pattern`         | string  | Rename pattern: '{track} - {title}', '{artist} - {title}', '{title}' | '{track} - {title}' |
| `dry_run`                  | boolean | Preview changes without moving files                                 | true                |
| `copy_instead_of_move`     | boolean | Copy files instead of moving them                                    | false               |
| `skip_if_missing_metadata` | boolean | Skip files missing artist/album metadata                             | false               |
| `response_format`          | string  | Output format                                                        | 'markdown'          |

### Example

```typescript
file_organizer_organize_music({
  source_dir: "/Users/Music/Downloads",
  target_dir: "/Users/Music/Organized",
  structure: "artist/album",
  dry_run: true,
});
```

---

## file_organizer_organize_photos

[⬆ Back to Top](#top)

**Description:** Organize photos into date-based folders using EXIF metadata. Supports JPEG, PNG, TIFF, HEIC, and RAW formats. Can strip GPS data for privacy.

### Parameters

| Parameter              | Type    | Description                                                          | Default        |
| ---------------------- | ------- | -------------------------------------------------------------------- | -------------- |
| `source_dir`           | string  | Full path to directory containing photos                             | -              |
| `target_dir`           | string  | Full path where organized photos will be placed                      | -              |
| `date_format`          | string  | Date folder structure: 'YYYY/MM/DD', 'YYYY-MM-DD', 'YYYY/MM', 'YYYY' | 'YYYY/MM'      |
| `group_by_camera`      | boolean | Group photos by camera model within date folders                     | false          |
| `strip_gps`            | boolean | Strip GPS location data from photos                                  | false          |
| `unknown_date_folder`  | string  | Folder name for photos without date metadata                         | 'Unknown Date' |
| `dry_run`              | boolean | Preview changes without moving files                                 | true           |
| `copy_instead_of_move` | boolean | Copy files instead of moving them                                    | false          |
| `response_format`      | string  | Output format                                                        | 'markdown'     |

### Example

```typescript
file_organizer_organize_photos({
  source_dir: "/Users/Photos/Import",
  target_dir: "/Users/Photos/Organized",
  date_format: "YYYY/MM",
  strip_gps: true,
  dry_run: true,
});
```

---

## file_organizer_batch_read_files

[⬆ Back to Top](#top)

**Description:** Reads contents of all files in a specified folder for LLM context. For text files (documents, code, notes), reads the actual content. For media files (audio, video, images), reads metadata instead of binary content. Provides a comprehensive summary of folder contents.

### Parameters

| Parameter          | Type    | Description                                                              | Default      |
| ------------------ | ------- | ------------------------------------------------------------------------ | ------------ |
| `directory`        | string  | Full path to the directory containing files to read                      | -            |
| `include_subdirs`  | boolean | Include subdirectories in the batch read                                 | `false`      |
| `max_files`        | number  | Maximum number of files to process (safety limit)                        | `50`         |
| `max_file_size_mb` | number  | Maximum file size in MB to read content (larger files get metadata only) | `10`         |
| `include_content`  | boolean | Include file content for text files                                      | `true`       |
| `include_metadata` | boolean | Include metadata for all files                                           | `true`       |
| `file_types`       | array   | Filter by specific file extensions (e.g., `[".txt", ".pdf"]`)            | -            |
| `response_format`  | string  | Output format: `'markdown'` or `'json'`                                  | `'markdown'` |

### Example

```typescript
file_organizer_batch_read_files({
  directory: "/path/to/folder",
  include_subdirs: false,
  max_files: 50,
  file_types: [".txt", ".md", ".json"],
});
```

## file_organizer_organize_by_date

[⬆ Back to Top](#top)

**Description:** Sort any file into `YYYY/MM` folders. Photos use EXIF `DateTimeOriginal` (`CreateDate` when that is absent); everything else uses the file's modification time. Every file reports which source chose its folder, so an EXIF→mtime fallback is never silent. Files with no usable date stay where they are and are listed under "Left In Place" — there is no `Unknown Date` bucket.

### Parameters

| Parameter         | Type    | Description                                                                                                     | Default     |
| ----------------- | ------- | --------------------------------------------------------------------------------------------------------------- | ----------- |
| `source_dir`      | string  | Directory containing files to sort                                                                              | -           |
| `target_dir`      | string  | Directory where the date folders are created. Cannot be inside `source_dir`, and `source_dir` cannot be inside it | -           |
| `date_format`     | string  | Folder structure: `'YYYY/MM'`, `'YYYY/MM/DD'`, `'YYYY'`                                                          | `'YYYY/MM'` |
| `date_source`     | string  | `'auto'` (EXIF, else mtime), `'exif'` (EXIF only — files without one are left in place), or `'mtime'`             | `'auto'`    |
| `recursive`       | boolean | Scan subdirectories of `source_dir`                                                                             | `false`     |
| `dry_run`         | boolean | Preview the folders without moving files                                                                         | `true`      |
| `response_format` | string  | Output format: `'markdown'` or `'json'`                                                                          | `'markdown'`|

### Result (json)

| Field                        | Description                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `organizedFiles`             | Files moved (or that a dry run would move)                                         |
| `skippedFiles`               | Files left alone: no usable date, unsafe name, or a failed move                   |
| `moves[]`                    | `{ file, from, to, folder, date, calendarDate, dateSource }` per file; `dateSource` = `exif`/`mtime` |
| `noDateFiles[]`              | Files left in place because no usable date was found                              |
| `structure`                  | Date folder label -> file names (same strings as `moves[].folder`)                |
| `manifestId`                 | Rollback manifest for `undo_last_operation`; absent after a dry run               |
| `undoAvailable`              | `false` unless this run's moves are recorded in a manifest                        |
| `errors[]`                   | Per-file failures, sanitized                                                     |

**Folder labels vs. paths.** `moves[].folder` and the `structure` keys are
**logical labels in the documented `YYYY/MM` form**, always separated by `/` on
every platform — `2024/05` means two levels on Windows exactly as it does on
Linux, so agents and scripts can match on them. `moves[].from` and `moves[].to`
are **real filesystem paths**, absolute and platform-native, and use the
platform separator.

**Which calendar a folder uses.** EXIF is camera wall-clock data that
`exif-parser` anchors to UTC, so an EXIF folder is read in **UTC** — a photo
stamped `00:30` on 1 January files under `2024/01` in every timezone. `mtime` is
a true instant, so its folder is the user's **local** day.
`moves[].calendarDate` (`YYYY-MM-DD`) is the date the label was cut from, so
`folder` is always `calendarDate` truncated to the requested `date_format` and a
caller never has to re-derive the timezone to predict the folder. `moves[].date`
stays the exact instant.

A destination whose parent resolves outside `target_dir` — a directory symlink
inside the target pointing out of it — is refused before anything is written, and
reported in `errors[]`. Nothing is moved and nothing is recorded as undoable.

A destination name that is already taken is never overwritten: the file lands as `name (1).ext`. Both `dry_run` defaults to `true`, and every performed move is recorded in a rollback manifest.

### Example

```typescript
file_organizer_organize_by_date({
  source_dir: "/path/to/import",
  target_dir: "/path/to/library",
  date_format: "YYYY/MM",
  date_source: "auto",
  dry_run: true,
});
```

---

## file_organizer_organize_by_project

[⬆ Back to Top](#top)

**Description:** Group files across all types (documents, code, images) into detected project folders. Detection is deterministic and local-only: rarity-weighted shared name tokens (primary anchor), IDF-filtered shared content terms from text-like files (`.txt`, `.md`, code, `.json`, etc.), and explicit identifier markers (e.g. `ABC123`). Content-blind files (binary, image) join only via a shared name token or marker, never on time alone.

### Parameters

| Parameter         | Type    | Description                                      | Default      |
| ----------------- | ------- | ------------------------------------------------ | ------------ |
| `source_dir`      | string  | Directory containing files to organize           | -            |
| `target_dir`      | string  | Directory where detected projects will be placed | -            |
| `dry_run`         | boolean | Preview the grouping without moving files        | `true`       |
| `recursive`       | boolean | Scan subdirectories recursively                  | `true`       |
| `response_format` | string  | Output format                                    | `'markdown'` |

### Example

```typescript
file_organizer_organize_by_project({
  source_dir: "/path/to/source",
  target_dir: "/path/to/target",
  dry_run: true,
});
```
