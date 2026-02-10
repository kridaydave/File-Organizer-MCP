# <a id="top"></a>File Organizer MCP - API Reference

> Auto-generated from tool definitions

**Version:** 3.2.6  
**Generated:** 2026-02-08

[⬆ Back to Top](#top)

---

## Table of Contents

- [file_organizer_analyze_duplicates](#file_organizer_analyze_duplicates)
- [file_organizer_batch_rename](#file_organizer_batch_rename)
- [file_organizer_categorize_by_type](#file_organizer_categorize_by_type)
- [file_organizer_delete_duplicates](#file_organizer_delete_duplicates)
- [file_organizer_find_duplicate_files](#file_organizer_find_duplicate_files)
- [file_organizer_find_largest_files](#file_organizer_find_largest_files)
- [file_organizer_get_categories](#file_organizer_get_categories)
- [file_organizer_inspect_metadata](#file_organizer_inspect_metadata)
- [file_organizer_list_files](#file_organizer_list_files)
- [file_organizer_list_watches](#file_organizer_list_watches)
- [file_organizer_organize_files](#file_organizer_organize_files)
- [file_organizer_preview_organization](#file_organizer_preview_organization)
- [file_organizer_scan_directory](#file_organizer_scan_directory)
- [file_organizer_set_custom_rules](#file_organizer_set_custom_rules)
- [file_organizer_undo_last_operation](#file_organizer_undo_last_operation)
- [file_organizer_unwatch_directory](#file_organizer_unwatch_directory)
- [file_organizer_watch_directory](#file_organizer_watch_directory)

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
  directory: 'value',
  recommendation_strategy: 'value',
  auto_select_keep: true,
  response_format: 'value',
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
  items: 'value',
  directory: 'value',
  rules: [],
  items: value,
  dry_run: true,
  response_format: 'value',
});
```

---

## file_organizer_categorize_by_type

[⬆ Back to Top](#top)

**Description:** Categorize files by their type (Executables, Videos, Documents, etc.) and show statistics for each category.

### Parameters

| Parameter         | Type    | Description                              | Default    |
| ----------------- | ------- | ---------------------------------------- | ---------- |
| `directory`       | string  | Full path to the directory to categorize | -          |
| `include_subdirs` | boolean | Include subdirectories                   | false      |
| `response_format` | string  | -                                        | 'markdown' |

### Example

```typescript
file_organizer_categorize_by_type({
  directory: 'value',
  include_subdirs: true,
  response_format: 'value',
});
```

---

## file_organizer_delete_duplicates

[⬆ Back to Top](#top)

**Description:** Permanently deletes specified duplicate files. DESTRUCTIVE. Verifies hash/size before deletion.

### Parameters

| Parameter                | Type    | Description | Default    |
| ------------------------ | ------- | ----------- | ---------- |
| `files_to_delete`        | array   | -           | -          |
| `items`                  | string  | -           | -          |
| `create_backup_manifest` | boolean | -           | true       |
| `response_format`        | string  | -           | 'markdown' |

### Example

```typescript
file_organizer_delete_duplicates({
  files_to_delete: [],
  items: 'value',
  create_backup_manifest: true,
  response_format: 'value',
});
```

---

## file_organizer_find_duplicate_files

[⬆ Back to Top](#top)

**Description:** Find duplicate files in a directory based on their content (SHA-256 hash). Shows potential wasted space.

### Parameters

| Parameter         | Type   | Description                | Default    |
| ----------------- | ------ | -------------------------- | ---------- |
| `directory`       | string | Full path to the directory | -          |
| `limit`           | number | Max groups to return       | 100        |
| `offset`          | number | Groups to skip             | 0          |
| `response_format` | string | -                          | 'markdown' |

### Example

```typescript
file_organizer_find_duplicate_files({
  directory: 'value',
  limit: 123,
  offset: 123,
  response_format: 'value',
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
  directory: 'value',
  include_subdirs: true,
  top_n: 123,
  response_format: 'value',
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
  response_format: 'value',
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
  file: 'value',
  response_format: 'value',
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
  directory: 'value',
  limit: 123,
  offset: 123,
  response_format: 'value',
});
```

---

## file_organizer_list_watches

[⬆ Back to Top](#top)

**Description:** List all directories currently being watched with their schedules.

### Parameters

| Parameter         | Type   | Description | Default    |
| ----------------- | ------ | ----------- | ---------- |
| `response_format` | string | -           | 'markdown' |

### Example

```typescript
file_organizer_list_watches({
  response_format: 'value',
});
```

---

## file_organizer_organize_files

[⬆ Back to Top](#top)

**Description:** Automatically organize files into categorized folders. Use dry_run=true to preview changes.

### Parameters

| Parameter           | Type    | Description                                                                                | Default    |
| ------------------- | ------- | ------------------------------------------------------------------------------------------ | ---------- |
| `directory`         | string  | Full path to the directory                                                                 | -          |
| `dry_run`           | boolean | Simulate organization                                                                      | true       |
| `response_format`   | string  | -                                                                                          | 'markdown' |
| `conflict_strategy` | string  | How to handle file conflicts (rename/skip/overwrite). Uses config default if not specified | -          |

### Example

```typescript
file_organizer_organize_files({
  directory: 'value',
  dry_run: true,
  response_format: 'value',
  conflict_strategy: 'value',
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
  directory: 'value',
  show_conflicts_only: true,
  response_format: 'value',
  conflict_strategy: 'value',
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
  directory: 'value',
  include_subdirs: true,
  max_depth: 123,
  limit: 123,
  offset: 123,
  response_format: 'value',
});
```

---

## file_organizer_set_custom_rules

[⬆ Back to Top](#top)

**Description:** Customize how files are categorized. Rules persist for the current session.

### Parameters

| Parameter          | Type   | Description | Default |
| ------------------ | ------ | ----------- | ------- |
| `rules`            | array  | -           | -       |
| `items`            | object | -           | -       |
| `properties`       | string | -           | -       |
| `category`         | string | -           | -       |
| `extensions`       | array  | -           | -       |
| `items`            | string | -           | -       |
| `filename_pattern` | string | -           | -       |
| `priority`         | number | -           | -       |

### Example

```typescript
file_organizer_set_custom_rules({
  rules: [],
  items: value,
  properties: 'value',
  category: 'value',
  extensions: [],
  items: 'value',
  filename_pattern: 'value',
  priority: 123,
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
  manifest_id: 'value',
  response_format: 'value',
});
```

---

## file_organizer_unwatch_directory

[⬆ Back to Top](#top)

**Description:** Remove a directory from the watch list.

### Parameters

| Parameter         | Type   | Description                | Default    |
| ----------------- | ------ | -------------------------- | ---------- |
| `directory`       | string | Full path to the directory | -          |
| `response_format` | string | -                          | 'markdown' |

### Example

```typescript
file_organizer_unwatch_directory({
  directory: 'value',
  response_format: 'value',
});
```

---

## file_organizer_watch_directory

[⬆ Back to Top](#top)

**Description:** Add a directory to the watch list with a cron-based schedule for automatic organization.

### Parameters

| Parameter              | Type    | Description                                        | Default    |
| ---------------------- | ------- | -------------------------------------------------- | ---------- |
| `directory`            | string  | Full path to the directory to watch (e.g.,         | -          |
| `schedule`             | string  | Cron expression. Convert natural language to cron: | -          |
| `auto_organize`        | boolean | Enable auto-organization                           | true       |
| `response_format`      | string  | -                                                  | 'markdown' |
| `min_file_age_minutes` | number  | Minimum file age in minutes before organizing      | -          |
| `max_files_per_run`    | number  | Maximum files to process per run                   | -          |

### Example

```typescript
file_organizer_watch_directory({
  directory: 'value',
  schedule: 'value',
  auto_organize: true,
  response_format: 'value',
  min_file_age_minutes: 123,
  max_files_per_run: 123,
});
```

---

## Notes

### New Export: checkAccess Function

The `checkAccess` function has been exported from `path-validator` module. This function provides path validation and access checking capabilities for file operations.

[⬆ Back to Top](#top)
