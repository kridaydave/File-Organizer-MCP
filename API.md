# File Organizer MCP - API Reference

> Auto-generated from tool definitions

**Version:** 3.0.0  
**Generated:** 2026-02-03T11:36:47.398Z

---

## Table of Contents

- [file_organizer_analyze_duplicates](#fileorganizeranalyzeduplicates)
- [file_organizer_categorize_by_type](#fileorganizercategorizebytype)
- [file_organizer_delete_duplicates](#fileorganizerdeleteduplicates)
- [file_organizer_find_duplicate_files](#fileorganizerfindduplicatefiles)
- [file_organizer_find_largest_files](#fileorganizerfindlargestfiles)
- [file_organizer_get_categories](#fileorganizergetcategories)
- [file_organizer_list_files](#fileorganizerlistfiles)
- [file_organizer_organize_files](#fileorganizerorganizefiles)
- [file_organizer_preview_organization](#fileorganizerprevieworganization)
- [file_organizer_scan_directory](#fileorganizerscandirectory)
- [file_organizer_set_custom_rules](#fileorganizersetcustomrules)
- [file_organizer_undo_last_operation](#fileorganizerundolastoperation)

---

## file_organizer_analyze_duplicates

**Description:** Finds duplicate files and suggests which to keep/delete based on location, name quality, and age.

### Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `directory` | string | - | - |
| `recommendation_strategy` | string | - | 'best_location' |
| `auto_select_keep` | boolean | - | false |
| `response_format` | string | - | 'markdown' |

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

## file_organizer_categorize_by_type

**Description:** Categorize files by their type (Executables, Videos, Documents, etc.) and show statistics for each category.

### Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `directory` | string | Full path to the directory to categorize | - |
| `include_subdirs` | boolean | Include subdirectories | false |
| `response_format` | string | - | 'markdown' |

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

**Description:** Permanently deletes specified duplicate files. DESTRUCTIVE. Verifies hash/size before deletion.

### Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `files_to_delete` | array | - | - |
| `items` | string | - | - |
| `create_backup_manifest` | boolean | - | true |
| `response_format` | string | - | 'markdown' |

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

**Description:** Find duplicate files in a directory based on their content (SHA-256 hash). Shows potential wasted space.

### Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `directory` | string | Full path to the directory | - |
| `limit` | number | Max groups to return | 100 |
| `offset` | number | Groups to skip | 0 |
| `response_format` | string | - | 'markdown' |

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

**Description:** Find the largest files in a directory. Useful for identifying space-consuming files and cleanup opportunities.

### Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `directory` | string | Full path to the directory | - |
| `include_subdirs` | boolean | Include subdirectories | false |
| `top_n` | number | Number of files to return | 10 |
| `response_format` | string | - | 'markdown' |

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

**Description:** Returns the list of categories used for file organization

### Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `response_format` | string | - | 'markdown' |

### Example

```typescript
file_organizer_get_categories({
  response_format: "value",
});
```


---

## file_organizer_list_files

**Description:** List all files in a directory with basic information. Returns file names and paths. Does not recurse into subdirectories.

### Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `directory` | string | Full path to the directory | - |
| `limit` | number | Max items to return | 100 |
| `offset` | number | Items to skip | 0 |
| `response_format` | string | - | 'markdown' |

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

**Description:** Automatically organize files into categorized folders. Use dry_run=true to preview changes.

### Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `directory` | string | Full path to the directory | - |
| `dry_run` | boolean | Simulate organization | false |
| `response_format` | string | - | 'markdown' |

### Example

```typescript
file_organizer_organize_files({
  directory: "value",
  dry_run: true,
  response_format: "value",
});
```


---

## file_organizer_preview_organization

**Description:** Shows what would happen if files were organized, WITHOUT making any changes. Shows moves, conflicts, and skip reasons.

### Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `directory` | string | Full path to the directory | - |
| `show_conflicts_only` | boolean | - | false |
| `response_format` | string | - | 'markdown' |

### Example

```typescript
file_organizer_preview_organization({
  directory: "value",
  show_conflicts_only: true,
  response_format: "value",
});
```


---

## file_organizer_scan_directory

**Description:** Scan directory and get detailed file information including size, dates, and extensions. Supports recursive scanning.

### Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `directory` | string | Full path to the directory to scan | - |
| `include_subdirs` | boolean | Include subdirectories in the scan | false |
| `max_depth` | number | Maximum depth to scan | -1 |
| `limit` | number | Max items to return | 100 |
| `offset` | number | Items to skip | 0 |
| `response_format` | string | - | 'markdown' |

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

**Description:** Customize how files are categorized. Rules persist for the current session.

### Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `rules` | array | - | - |
| `items` | object | - | - |
| `properties` | string | - | - |
| `category` | string | - | - |
| `extensions` | array | - | - |
| `items` | string | - | - |
| `filename_pattern` | string | - | - |
| `priority` | number | - | - |

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

**Description:** Reverses file moves and renames from a previous organization task.

### Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `manifest_id` | string | - | - |
| `response_format` | string | - | 'markdown' |

### Example

```typescript
file_organizer_undo_last_operation({
  manifest_id: "value",
  response_format: "value",
});
```


---

