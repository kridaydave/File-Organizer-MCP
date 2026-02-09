# File Organizer MCP - API Reference

> Auto-generated from tool definitions

**Version:** 3.1.5  
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
- [file_organizer_read_file](#file_organizer_read_file)
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

**Description:** Read file contents with security checks. Supports text, binary, and base64 encoding. Automatically detects file type and applies appropriate security validations. Sensitive files (passwords, keys, credentials) are automatically blocked.

### Parameters

| Parameter           | Type    | Description                                        | Default    |
| ------------------- | ------- | -------------------------------------------------- | ---------- |
| `path`              | string  | Absolute path to the file to read                  | -          |
| `encoding`          | string  | Text encoding for the file (utf-8, base64, binary) | 'utf-8'    |
| `maxBytes`          | number  | Maximum bytes to read (1B to 100MB)                | 10485760   |
| `offset`            | number  | Byte offset to start reading from                  | 0          |
| `limit`             | number  | Maximum bytes to read (alternative to maxBytes)    | -          |
| `response_format`   | string  | Response format: json, markdown, or text           | 'markdown' |
| `calculateChecksum` | boolean | Include SHA-256 checksum in response               | true       |

### Response Format

**JSON Response:**

```json
{
  "success": true,
  "file": {
    "path": "/path/to/file.txt",
    "mimeType": "text/plain",
    "size": 1024,
    "bytesRead": 1024
  },
  "content": "File contents here...",
  "contentEncoding": "utf-8",
  "metadata": {
    "readAt": "2026-02-09T12:00:00.000Z",
    "checksum": "a3f5c2..."
  }
}
```

**Markdown Response:**

````markdown
## File: `document.txt`

**Path:** `/path/to/document.txt`
**MIME Type:** text/plain
**Size:** 1.00 KB
**Bytes Read:** 1.00 KB
**Read At:** 2026-02-09T12:00:00.000Z
**SHA-256:** `a3f5c2...`

---

### Content

```text
File contents here...
```
````

````

### Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| `FILE_NOT_FOUND` | File does not exist | Verify the path is correct |
| `FILE_ACCESS_DENIED` | Permission denied | Check file permissions |
| `FILE_TOO_LARGE` | File exceeds maxBytes | Increase maxBytes or use offset |
| `PATH_VALIDATION_FAILED` | Security check failed | File may be sensitive or outside allowed paths |
| `RATE_LIMIT_EXCEEDED` | Too many requests | Wait before retrying |

### Examples

**Read a text file:**
```typescript
file_organizer_read_file({
  path: '/home/user/documents/report.txt'
});
````

**Read with specific encoding:**

```typescript
file_organizer_read_file({
  path: "/home/user/images/photo.png",
  encoding: "base64",
});
```

**Read partial content:**

```typescript
file_organizer_read_file({
  path: "/home/user/logs/app.log",
  offset: 0,
  maxBytes: 1024, // Read first 1KB
  response_format: "text",
});
```

**Read as JSON:**

```typescript
file_organizer_read_file({
  path: "/home/user/data/config.json",
  response_format: "json",
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
  properties: "value",
  category: "value",
  extensions: [],
  items: "value",
  filename_pattern: "value",
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
  manifest_id: "value",
  response_format: "value",
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
  directory: "value",
  response_format: "value",
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
  directory: "value",
  schedule: "value",
  auto_organize: true,
  response_format: "value",
  min_file_age_minutes: 123,
  max_files_per_run: 123,
});
```

---

## Notes

### File Reader Tool (file_organizer_read_file)

The file reader tool provides secure file reading capabilities with the following features:

- **Security First**: 8-layer validation blocks access to sensitive files
- **Flexible Encoding**: Support for utf-8, base64, and binary
- **Partial Reads**: Read specific byte ranges with offset and limit
- **Integrity**: SHA-256 checksums for content verification
- **Rate Limiting**: Prevents abuse with configurable limits
- **Audit Logging**: All reads are logged for security review

### Sensitive File Blocking

The following file types are automatically blocked:

- Environment files (`.env`, `.env.local`)
- SSH keys (`.ssh/`, `id_rsa`, `id_ed25519`)
- AWS credentials (`.aws/`)
- Password files (`shadow`, `passwd`)
- API keys and tokens
- Private keys (`.pem`, `.key`)

### Rate Limits

Default rate limits for file reading:

- 120 requests per minute
- 2000 requests per hour

These limits can be configured via the factory options.

[⬆ Back to Top](#top)
