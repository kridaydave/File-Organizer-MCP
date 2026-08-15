# File Organizer MCP Server

Version 3.5.0 | MCP protocol 2024-11-05 | Node.js 18+

[![npm version](https://img.shields.io/badge/npm-v3.5.0-blue.svg)](https://www.npmjs.com/package/file-organizer-mcp)
[![npm downloads](https://img.shields.io/npm/dm/file-organizer-mcp.svg)](https://www.npmjs.com/package/file-organizer-mcp)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-1135%20passing-success.svg)](tests/)

A Model Context Protocol (MCP) server that organizes files. It gives a Claude-style assistant a single atomic operation to categorize, sort, dedupe, and rename files, instead of making it chain dozens of primitive `read`, `write`, and `rename` calls.

- [Why](#why)
- [Quick start](#quick-start)
- [Features](#features)
- [Tools](#tools)
- [File categories](#file-categories)
- [Example workflows](#example-workflows)
- [Security](#security-configuration)
- [Troubleshooting](#troubleshooting)
- [Architecture](#architecture)
- [Documentation](#documentation)

---

## Why

A filesystem MCP server built only on `read`, `write`, `make`, and `delete` forces an assistant to plan every move and rename as a separate step. Each step costs tokens, and more steps means more chances to get the path wrong.

File Organizer MCP replaces those chains with one call:

| Primitive approach | File Organizer MCP |
| --- | --- |
| Many `read` / `write` / `rename` calls | `organize_files()` runs the whole move atomically |
| Dozens of reasoning steps | One reasoning step |
| High token use | Minimal token use |
| Easy to corrupt on partial failure | Rollback-safe operations |

---

## Quick start

### One-command setup

```bash
npx file-organizer-mcp --setup
```

The wizard detects installed AI clients (Claude Desktop, Cursor, Windsurf, Cline, and others), configures them, and walks you through folder selection and preferences.

### Requirements

Node.js 18 or newer.

### After setup

You can ask the assistant things like:

- "Organize my Downloads folder"
- "Find duplicate files in my Documents"
- "Show me my largest files"

### Install methods

| Method | Command | Use case |
| --- | --- | --- |
| npx | `npx file-organizer-mcp --setup` | Occasional use or a trial |
| Global | `npm install -g file-organizer-mcp` | Regular use, faster startup |

---

## Features

- Categorization into 12 or more file types.
- Cron-based automatic organization and directory watch mode.
- Duplicate detection by SHA-256 content hash.
- Metadata extraction: EXIF for photos, ID3 for audio, topic extraction for documents.
- Smart organization that picks the right strategy per file type.
- Dry-run preview, atomic moves, and rollback.
- Path traversal protection, TOCTOU mitigation, and metadata scrubbing.
- Windows, macOS, and Linux.

---

## Tools

### Core tools

- `file_organizer_scan_directory` - List a directory with detailed file info. `directory` is required; `include_subdirs` toggles recursion.
- `file_organizer_read_file` - Read a file with 8-layer path validation. `path` is required; `encoding` is utf-8, base64, or binary.
- `file_organizer_organize_smart` - Handle music, photos, and documents in one pass, choosing the best strategy per file.
- `file_organizer_batch_rename` - Rename many files by pattern, regex, or numbering.
- `file_organizer_undo_last_operation` - Reverse the most recent organization.

### Full tool list

- `file_organizer_analyze_duplicates`
- `file_organizer_batch_read_files`
- `file_organizer_categorize_by_type`
- `file_organizer_delete_duplicates`
- `file_organizer_find_duplicate_files`
- `file_organizer_find_largest_files`
- `file_organizer_get_categories`
- `file_organizer_inspect_metadata`
- `file_organizer_list_files`
- `file_organizer_list_watches`
- `file_organizer_organize_by_content`
- `file_organizer_organize_files`
- `file_organizer_organize_music`
- `file_organizer_organize_photos`
- `file_organizer_preview_organization`
- `file_organizer_read_file`
- `file_organizer_scan_directory`
- `file_organizer_set_custom_rules`
- `file_organizer_smart_suggest`
- `file_organizer_system_organize`
- `file_organizer_undo_last_operation`
- `file_organizer_unwatch_directory`
- `file_organizer_view_history`
- `file_organizer_watch_directory`

For parameters and return shapes, see [API.md](API.md).

---

## File categories

| Category | Typical extensions |
| --- | --- |
| Executables | `.exe`, `.msi`, `.bat`, `.sh` |
| Videos | `.mp4`, `.avi`, `.mkv`, `.mov` |
| Documents | `.pdf`, `.doc`, `.docx`, `.txt`, `.md` |
| Images | `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp` |
| Audio | `.mp3`, `.wav`, `.flac`, `.m4a` |
| Archives | `.zip`, `.rar`, `.7z`, `.tar.gz` |
| Code | `.py`, `.js`, `.ts`, `.java`, `.go`, `.json` |

---

## Example workflows

### Clean up a Downloads folder

1. Scan the folder and review the file distribution and space use.
2. Identify duplicates and stale files.
3. Preview the moves and conflicts.
4. Confirm, then organize into category folders.

Result: a sorted folder, duplicates flagged, and reclaimed space.

### Organize a project

The assistant scans the project, splits files into Code, Assets, and Docs, keeps the `src/` tree intact, and moves loose config files, readmes, and screenshots into their proper folders.

### Find and handle duplicates

The assistant hashes files, groups duplicates, scores each copy by location, name quality, and age, and recommends which to keep and which to delete. It reports the wasted space. You decide whether to delete.

### Discover large files

Point it at a folder and it lists the largest files by size, flags old backups you can archive, and notes any large duplicates.

### Organize music

It reads ID3 tags and rebuilds the folder as `Artist / Album / Title.mp3`.

```
Before:
Downloads/
  song1.mp3
  track02.mp3
  music_file.mp3

After:
Music/
  Coldplay/
    A Rush of Blood to the Head/
      Clocks.mp3
      The Scientist.mp3
  Radiohead/
    OK Computer/
      Paranoid Android.mp3
      Karma Police.mp3
```

### Organize photos

It reads the capture date from EXIF and sorts photos into `YYYY / MM / DD` folders.

```
Before:
Pictures/
  IMG_001.jpg
  photo123.png
  DSC_4567.raw

After:
Pictures/
  2023/
    12/
      25/
        IMG_001.jpg
      31/
        photo123.png
  2024/
    01/
      15/
        DSC_4567.raw
```

### Security-screen a folder

It extracts metadata and content signatures, then flags sensitive metadata, such as EXIF GPS coordinates in a PDF or personal identifiers in a resume, and suggests redaction or quarantine.

### Set up automatic organization

Register a directory with a cron schedule:

```json
{
  "directory": "/Users/john/Downloads",
  "schedule": "0 9 * * *",
  "min_file_age_minutes": 5
}
```

The server organizes the folder on that schedule. Add more watches for other directories.

---

## Security configuration

Access is restricted to a whitelist of user directories by default. System directories stay blocked.

### Allowed by default

The server enables these locations if they exist on the machine:

| Platform | Allowed directories |
| --- | --- |
| Windows | Desktop, Documents, Downloads, Pictures, Videos, Music, OneDrive, Projects, Workspace |
| macOS | Desktop, Documents, Downloads, Movies, Music, Pictures, iCloud Drive, Projects |
| Linux | Desktop, Documents, Downloads, Music, Pictures, Videos, `~/dev`, `~/workspace` |

### Always blocked

These paths stay blocked even if you add them to the config:

- Windows: `C:\Windows`, Program Files, AppData, `$Recycle.Bin`
- macOS: `/System`, `/Library`, `/Applications`, `/private`, `/usr`
- Linux: `/etc`, `/usr`, `/var`, `/root`, `/sys`, `/proc`
- Everywhere: `node_modules`, `.git`, `.vscode`, `.idea`, `dist`, `build`

### Custom configuration

Edit the user config file:

- Windows: `%APPDATA%\file-organizer-mcp\config.json`
- macOS: `$HOME/Library/Application Support/file-organizer-mcp/config.json`
- Linux: `$HOME/.config/file-organizer-mcp/config.json`

Add paths to `customAllowedDirectories`:

```json
{
  "customAllowedDirectories": [
    "C:\\Users\\Name\\My Special Folder",
    "D:\\Backups"
  ]
}
```

You can paste a folder path straight from your file explorer's address bar.

### External drives and network mounts

Paths outside your home directory are blocked unless you opt in. To allow an external volume such as `/Volumes/My Drive` on macOS or `/media/user/usb` on Linux, set `allowExternalVolumes` to true:

```json
{
  "allowExternalVolumes": true,
  "customAllowedDirectories": [
    "/Volumes/MyExternalDrive",
    "/Volumes/Photography Backup"
  ]
}
```

Windows drive letters like `D:\` work without this flag.

Restart the client after editing the config.

### Conflict strategy

```json
{
  "conflictStrategy": "rename"
}
```

- `rename` (default) - Append a suffix to the new file, for example `file (1).txt`.
- `skip` - Keep the existing file and skip the new one.
- `overwrite` - Replace the existing file, after writing a backup.

### Legacy auto-organize schedule

For a simple hourly, daily, or weekly schedule:

```json
{
  "autoOrganize": {
    "enabled": true,
    "schedule": "daily"
  }
}
```

For anything more granular, use the `file_organizer_watch_directory` tool.

### Defenses

| Attack type | Protection |
| --- | --- |
| Unauthorized access | Whitelist plus blacklist enforcement |
| Path traversal | 8-layer validation pipeline |
| Symlink attacks | Real path resolution |
| DoS | Resource limits on file count, depth, and size |

---

## Troubleshooting

### The MCP server does not appear

1. Check the config file path is correct.
2. Confirm Node.js 18 or newer: `node --version`.
3. Fully restart the client.
4. Check the path in the client config file.

### Permission errors

- Windows: run the client as Administrator.
- macOS/Linux: check folder permissions with `ls -la`.
- Confirm the target directory is writable.

### Files are not moving

1. Make sure `dry_run` is not enabled.
2. Close programs that may be locking the files.
3. Check for sufficient disk space.
4. Read the operation summary for error messages.

---

## Architecture

The server runs a screen-then-enrich pipeline: an MCP protocol handler passes every request through security screening (path validation, sensitive-file detection, rate limiting), then metadata enrichment (EXIF, ID3, document properties), then the service layer that performs the operation. All file operations go through validated paths and support rollback.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full diagram and design notes.

---

## Documentation

- [API.md](API.md) - Complete tool reference
- [ARCHITECTURE.md](ARCHITECTURE.md) - Design and architecture
- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines
- [MIGRATION.md](MIGRATION.md) - v2 to v3 upgrade guide
- [CHANGELOG.md](CHANGELOG.md) - Version history
- [SECURITY.md](SECURITY.md) - Security model and reporting

---

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md), then clone and build:

```bash
git clone https://github.com/kridaydave/File-Organizer-MCP.git
cd File-Organizer-MCP
npm install
npm run build
npm test
```

Report bugs and feature requests on [GitHub Issues](https://github.com/kridaydave/File-Organizer-MCP/issues). For a security vulnerability, email technocratix902@gmail.com.

## License

MIT. See [LICENSE](LICENSE).
