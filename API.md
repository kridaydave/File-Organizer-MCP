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
- [file_organizer_find_broken_symlinks](#file_organizer_find_broken_symlinks)
- [file_organizer_find_duplicate_files](#file_organizer_find_duplicate_files)
- [file_organizer_find_largest_files](#file_organizer_find_largest_files)
- [file_organizer_get_categories](#file_organizer_get_categories)
- [file_organizer_inspect_metadata](#file_organizer_inspect_metadata)
- [file_organizer_list_files](#file_organizer_list_files)
- [file_organizer_organize_by_project](#file_organizer_organize_by_project)
- [file_organizer_organize_files](#file_organizer_organize_files)
- [file_organizer_organize_music](#file_organizer_organize_music)
- [file_organizer_organize_photos](#file_organizer_organize_photos)
- [file_organizer_preview_organization](#file_organizer_preview_organization)
- [file_organizer_read_file](#file_organizer_read_file)
- [file_organizer_scan_directory](#file_organizer_scan_directory)
- [file_organizer_set_custom_rules](#file_organizer_set_custom_rules)
- [file_organizer_smart_suggest](#file_organizer_smart_suggest)
- [file_organizer_system_organize](#file_organizer_system_organize)
- [file_organizer_undo_last_operation](#file_organizer_undo_last_operation)
- [file_organizer_view_history](#file_organizer_view_history)

> **Note:** The watch tools (`file_organizer_watch_directory`, `file_organizer_unwatch_directory`,
> `file_organizer_list_watches`) are no longer part of the MCP server. Scheduled organization
> runs as a standalone process — see `file-organizer-watch` (`bin/file-organizer-watch.mjs`)
> with `add` / `remove` / `list` / `once` / `run` subcommands. `once` runs a single
> organization pass and exits, so an OS timer can be the scheduler. No MCP tool shape changed.

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

**Description:** Rename multiple files using rules (find/replace, case, add text, numbering).

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

| Parameter                | Type    | Description | Default    |
| ------------------------ | ------- | ----------- | ---------- |
| `files_to_delete`        | array   | -           | -          |
| `items`                  | string  | -           | -          |
| `create_backup_manifest` | boolean | -           | true       |
| `verify_before_delete`   | boolean | Hash each candidate and refuse to delete a file with no surviving copy | true |
| `candidate_directories`  | array   | Extra directories to search for surviving copies during verification, walked the same way as the candidate's parent and grandparent | `[]` |
| `response_format`        | string  | -           | 'markdown' |

### Response fields

| Field           | Type   | Description                                             |
| --------------- | ------ | ------------------------------------------------------- |
| `deleted_count` | number | Files removed                                            |
| `failed_count`  | number | Files refused or errored                                 |
| `verified`      | boolean | Whether the surviving-copy check ran                     |
| `manifest_id`   | string | Pass to `file_organizer_undo_last_operation` to restore   |
| `partially_verified_files` | array | Deleted files whose check used a sampled identity (see below) |

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

| Parameter         | Type   | Description                       | Default    |
| ----------------- | ------ | --------------------------------- | ---------- |
| `directory`       | string | Full path to the directory        | -          |
| `response_format` | string | `json` or `markdown`              | 'markdown' |

### Findings

| Field                        | Type     | Description                                        |
| ---------------------------- | -------- | -------------------------------------------------- |
| `directory`                  | string   | The audited directory                              |
| `scanned_count`              | number   | Symlinks examined                                  |
| `total_count`                | number   | Findings reported                                  |
| `dangling_count`             | number   | Findings whose `kind` is `dangling`                |
| `escaping_count`             | number   | Findings whose `kind` is `escapes_allowed_roots`   |
| `circular_count`             | number   | Findings whose `kind` is `circular`                |
| `findings[].path`            | string   | Full path of the link itself, not its target       |
| `findings[].link_target`     | string   | Raw link value as stored on disk                   |
| `findings[].kind`            | string   | `dangling`, `escapes_allowed_roots`, or `circular` |
| `findings[].detail`          | string   | Plain-English explanation                          |
| `findings[].resolved_target` | string   | Canonical absolute target. Absent for a loop        |

Containment is decided by the same whitelist check the validation layer uses, so this tool and `organize_files` agree on what "outside the allowed roots" means.

### Example

```typescript
file_organizer_find_broken_symlinks({
  directory: "value",
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

| Field           | Type     | Description                                        |
| --------------- | -------- | -------------------------------------------------- |
| `skipped`       | array    | One entry per unanalyzed file                      |
| `skipped[].path`| string   | Full path                                          |
| `skipped[].name`| string   | File name                                          |
| `skipped[].size_bytes` | number | Size in bytes                                 |
| `skipped[].reason` | string | `empty_file`, `exceeds_size_cap`, `hash_failed`, or `timed_out` |
| `skipped[].detail` | string | Plain-English explanation of the skip           |
| `skipped_bytes` | number   | Total bytes belonging to skipped files             |

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

**Description:** Customize how files are categorized. Rules persist to your user config and apply to every future request.

### Parameters

| Parameter          | Type   | Description | Default |
| ------------------ | ------ | ----------- | ------- |
| `rules`            | array  | -           | -       |
| `items`            | object | -           | -       |
| `properties`       | string | -           | -       |
| `category`         | string | -           | -       |
| `extensions`       | array  | -           | -       |
| `filename_pattern` | string | -           | -       |
| `priority`         | number | -           | -       |
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

## file_organizer_smart_suggest

[⬆ Back to Top](#top)

**Description:** Analyze directory health and get actionable suggestions for organization.

### Parameters

| Parameter            | Type    | Description                    | Default   |
| -------------------- | ------- | ------------------------------ | --------- |
| `directory`          | string  | Directory to analyze           | -         |
| `include_subdirs`    | boolean | Include subdirectories         | true      |
| `include_duplicates` | boolean | Check for duplicates (slower)  | true      |
| `max_files`          | number  | Maximum files to scan          | 10000     |
| `timeout_seconds`    | number  | Timeout in seconds             | 60        |
| `sample_rate`        | number  | Sample rate for large dirs     | 1         |
| `use_cache`          | boolean | Use cached results             | true      |
| `response_format`    | string  | 'json' or 'markdown'           | 'markdown' |

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

| Parameter               | Type    | Description                                        | Default    |
| ----------------------- | ------- | -------------------------------------------------- | ---------- |
| `source_dir`            | string  | Source directory (Downloads, Desktop, or Temp)     | -          |
| `use_system_dirs`       | boolean | Use OS system directories                          | true       |
| `create_subfolders`     | boolean | Create organized subfolders                        | true       |
| `fallback_to_local`     | boolean | Fallback to local folder if system dir not writable| true       |
| `local_fallback_prefix` | string  | Prefix for local fallback folder                   | 'Organized'|
| `conflict_strategy`     | string  | 'skip', 'rename', or 'overwrite'                   | 'rename'   |
| `dry_run`               | boolean | Preview without moving                             | true       |
| `copy_instead_of_move`  | boolean | Copy instead of move                               | false      |
| `response_format`       | string  | 'json' or 'markdown'                               | 'markdown' |

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

## file_organizer_view_history

[⬆ Back to Top](#top)

**Description:** View the history of file organization operations. Supports filtering by date range, operation type, status, and source. Use privacy_mode to control output detail level.

### Parameters

| Parameter         | Type   | Description                                                        | Default    |
| ----------------- | ------ | ------------------------------------------------------------------ | ---------- |
| `limit`           | number | Maximum number of entries to return (1-1000)                       | 20         |
| `since`           | string | ISO date string - return entries after this time                   | -          |
| `until`           | string | ISO date string - return entries before this time                  | -          |
| `operation`       | string | Filter by operation name                                           | -          |
| `status`          | string | 'success', 'error', or 'partial'                                   | -          |
| `source`          | string | 'manual' or 'scheduled'                                            | -          |
| `privacy_mode`    | string | 'full', 'redacted', or 'none'                                      | -          |
| `response_format` | string | 'json' or 'markdown'                                               | 'markdown' |

### Example

```typescript
file_organizer_view_history({
  limit: 20,
});
```

---

## file_organizer_doctor

[⬆ Back to Top](#top)

**Description:** Report the effective configuration after defaults, config.json and env are layered, and flag every configured allowed directory that is missing, blocked by security policy, or rejected by the home-directory gate. Use this first when a call fails unexpectedly.

**Read-only.** Safe to call at any time; changes nothing on disk.

### Parameters

| Parameter         | Type   | Description                          | Default    |
| ----------------- | ------ | ------------------------------------ | ---------- |
| `response_format` | string | 'json' or 'markdown'                 | 'markdown' |

### Returned fields

| Field                     | Description                                                            |
| ------------------------- | ---------------------------------------------------------------------- |
| `version`                 | Server version                                                         |
| `platform`                | `process.platform` the report was built on                             |
| `config_file_present`     | Whether a config.json was found (false means defaults only)           |
| `security`                | Effective security settings after config.json is layered over defaults |
| `conflict_strategy`       | Effective conflict strategy                                            |
| `allow_external_volumes`  | Whether external volumes are allowed                                   |
| `custom_rule_count`       | Number of custom categorization rules                                  |
| `default_allowed`         | Platform default allowed roots that exist                              |
| `configured_allowed_dirs` | One entry per `customAllowedDirectories` entry                         |
| `effective_allowed_dirs`  | The configured entries the security gate kept                          |
| `unknown_config_keys`     | config.json keys the loader does not understand                         |
| `problems`                | Human-readable list of what is wrong                                  |
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

| Parameter          | Type    | Description                                                             | Default      |
| ------------------ | ------- | ----------------------------------------------------------------------- | ------------ |
| `directory`        | string  | Full path to the directory containing files to read                     | -            |
| `include_subdirs`  | boolean | Include subdirectories in the batch read                                | `false`      |
| `max_files`        | number  | Maximum number of files to process (safety limit)                       | `50`         |
| `max_file_size_mb` | number  | Maximum file size in MB to read content (larger files get metadata only)| `10`         |
| `include_content`  | boolean | Include file content for text files                                     | `true`       |
| `include_metadata` | boolean | Include metadata for all files                                          | `true`       |
| `file_types`       | array   | Filter by specific file extensions (e.g., `[".txt", ".pdf"]`)           | -            |
| `response_format`  | string  | Output format: `'markdown'` or `'json'`                                 | `'markdown'` |

### Example

```typescript
file_organizer_batch_read_files({
  directory: "/path/to/folder",
  include_subdirs: false,
  max_files: 50,
  file_types: [".txt", ".md", ".json"],
});
```

## file_organizer_organize_by_project

[⬆ Back to Top](#top)

**Description:** Group files across all types (documents, code, images) into detected project folders. Detection is deterministic and local-only: rarity-weighted shared name tokens (primary anchor), IDF-filtered shared content terms from text-like files (`.txt`, `.md`, code, `.json`, etc.), and explicit identifier markers (e.g. `ABC123`). Content-blind files (binary, image) join only via a shared name token or marker, never on time alone.

### Parameters

| Parameter         | Type    | Description                                              | Default     |
| ----------------- | ------- | -------------------------------------------------------- | ----------- |
| `source_dir`      | string  | Directory containing files to organize                   | -           |
| `target_dir`      | string  | Directory where detected projects will be placed         | -           |
| `dry_run`         | boolean | Preview the grouping without moving files                | `true`      |
| `recursive`       | boolean | Scan subdirectories recursively                          | `true`      |
| `response_format` | string  | Output format                                            | `'markdown'`|

### Example

```typescript
file_organizer_organize_by_project({
  source_dir: "/path/to/source",
  target_dir: "/path/to/target",
  dry_run: true,
});
```
