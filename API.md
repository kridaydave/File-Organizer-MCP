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
> with `add` / `remove` / `list` / `run` subcommands.

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

| Parameter         | Type    | Description                              | Default    |
| ----------------- | ------- | ---------------------------------------- | ---------- |
| `directory`       | string  | Full path to the directory to categorize | -          |
| `include_subdirs` | boolean | Include subdirectories                   | false      |
| `response_format` | string  | -                                        | 'markdown' |

### Example

```typescript
file_organizer_categorize_by_type({
  directory: "value",
  include_subdirs: true,
  response_format: "value",
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
  items: "value",
  create_backup_manifest: true,
  response_format: "value",
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

| Parameter           | Type    | Description                                                                                | Default    |
| ------------------- | ------- | ------------------------------------------------------------------------------------------ | ---------- |
| `directory`         | string  | Full path to the directory                                                                 | -          |
| `dry_run`           | boolean | Simulate organization                                                                      | true       |
| `response_format`   | string  | -                                                                                          | 'markdown' |
| `conflict_strategy` | string  | How to handle file conflicts (rename/skip/overwrite). Uses config default if not specified | -          |

### Example

```typescript
file_organizer_organize_files({
  directory: "value",
  dry_run: true,
  response_format: "value",
  conflict_strategy: "value",
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
| `items`            | string | -           | -       |
| `filename_pattern` | string | -           | -       |
| `priority`         | number | -           | -       |

### Example

```typescript
file_organizer_set_custom_rules({
  rules: [],
  items: value,
  properties: "value",
  category: "value",
  extensions: [],
  items: "value",
  filename_pattern: "value",
  priority: 123,
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
