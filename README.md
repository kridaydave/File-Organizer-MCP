# <a id="file-organizer-mcp-server"></a>File Organizer MCP Server 🗂️

**Version:** 3.2.5 | **MCP Protocol:** 2024-11-05 | **Node:** ≥18.0.0

[Why Us](#why-specialized-tools) • [Quick Start](#quick-start) • [Features](#features) • [Tools](#tools-reference) • [Examples](#example-workflows) • [API](API.md) • [Security](#security-configuration) • [Architecture](ARCHITECTURE.md)

---

[![npm version](https://img.shields.io/badge/npm-v3.2.5-blue.svg)](https://www.npmjs.com/package/file-organizer-mcp)
[![npm downloads](https://img.shields.io/npm/dm/file-organizer-mcp.svg)](https://www.npmjs.com/package/file-organizer-mcp)
[![Security](https://img.shields.io/badge/security-hardened-green.svg)](https://github.com/kridaydave/File-Organizer-MCP)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-631%20passing-success.svg)](tests/)

> **A powerful, security-hardened Model Context Protocol (MCP) server for intelligent file organization with Claude**

---

## <a id="why-specialized-tools"></a>Why File Organizer MCP? 🤖

Traditional filesystem MCP servers provide primitive tools: `read`, `write`, `make`, `delete`. When you ask an AI to organize a folder using only these tools, the AI must:

1. **Think 50 steps ahead** - Planning file moves, renames, and categorizations
2. **Waste tokens** - Describing every single file operation in detail
3. **Risk hallucinations** - More steps = more chances for the AI to make mistakes
4. **Move slowly** - Each primitive operation requires separate reasoning

### Enter File Organizer MCP

We provide **specialized, high-level tools** that encapsulate complex file operations:

| Primitive Approach                                     | File Organizer MCP                                   |
| ------------------------------------------------------ | ---------------------------------------------------- |
| `read` → `analyze` → `read` → `write` → `rename` → ... | `organize_files()` - one tool, complete organization |
| 50+ reasoning steps                                    | 1 reasoning step                                     |
| High token usage                                       | Minimal tokens                                       |
| Error-prone                                            | Atomic, rollback-safe operations                     |

**The AI simply decides _what_ to do. We handle _how_ to do it securely.**

🎯 [Install from MCP Registry](https://registry.modelcontextprotocol.io/servers/io.github.kridaydave/file-organizer) • 📦 [View on NPM](https://www.npmjs.com/package/file-organizer-mcp) • 🐛 [Report Issues](https://github.com/kridaydave/File-Organizer-MCP/issues)

---

## <a id="quick-start"></a>Quick Start 🚀

### One-Command Setup (Recommended)

Just run this single command and follow the interactive prompts:

```bash
npx file-organizer-mcp --setup
```

That's it! The wizard will:

- ✅ Auto-detect your installed AI clients (Claude Desktop, Cursor, Windsurf, Cline, etc.)
- ✅ Configure them automatically with one click
- ✅ Let you choose which folders to organize
- ✅ Set up your preferences

### What You'll Need

- [Node.js 18+](https://nodejs.org/) (only requirement!)

### First Time Using an MCP Server?

1. **Install** - Run the command above
2. **Select clients** - Pick which AI apps you want to use (Claude, Cursor, etc.)
3. **Choose folders** - Select Downloads, Desktop, Documents, etc.
4. **Done!** - Start chatting with your AI about files

Try these commands in your AI client:

- `"Organize my Downloads folder"`
- `"Find duplicate files in my Documents"`
- `"Show me my largest files"`

### Installation Methods

You have two options to run File Organizer MCP:

| Method | Command | Best For |
|--------|---------|----------|
| **npx (no install)** | `npx file-organizer-mcp --setup` | Trying it out, occasional use |
| **Global install** | `npm install -g file-organizer-mcp` | Regular use, faster startup |

**Using npx:**
- No installation needed - downloads on first run
- Always gets the latest version
- Slightly slower on first run

**Using npm install -g:**
- Install once: `npm install -g file-organizer-mcp`
- Then run anytime: `file-organizer-mcp --setup` or `file-organizer-setup`
- Faster startup, works offline
- Update with: `npm update -g file-organizer-mcp`

### Supported AI Clients

The setup wizard auto-detects and configures:

| Client                 | Platform            | Auto-Config |
| ---------------------- | ------------------- | ----------- |
| **Claude Desktop**     | Windows, Mac        | ✅ Yes      |
| **Cursor**             | Windows, Mac, Linux | ✅ Yes      |
| **Windsurf**           | Windows, Mac        | ✅ Yes      |
| **Cline** (VS Code)    | All platforms       | ✅ Yes      |
| **Roo Code** (VS Code) | All platforms       | ✅ Yes      |
| **Continue** (VS Code) | All platforms       | ✅ Yes      |

> 💡 **Don't see your client?** The file organizer works with any MCP-compatible client. Check your client's documentation for manual configuration.

---

## <a id="features"></a>Features 🎯

### Core Functionality

- **🤖 Auto-categorization** - Intelligently organizes files into 12+ categories
- **📅 Smart Scheduling** - Cron-based automatic organization with per-directory configuration
- **🔍 Duplicate Detection** - Finds duplicate files using SHA-256 content hashing
- **🏷️ Smart Metadata** - Extracts EXIF/ID3 tags for content-aware organization
- **✏️ Batch Renaming** - Flexible renaming with patterns, regex, and case conversion
- **🛡️ Smart Conflict Resolution** - Handles filename conflicts (rename/skip/overwrite)
- **👁️ Dry Run Mode** - Preview changes before executing
- **👀 File Watching** - Watch directories and auto-organize on schedule
- **⏱️ Age-Based Filtering** - Skip files newer than X minutes (prevents organizing in-progress downloads)
- **📊 Comprehensive Scanning** - Detailed directory analysis with statistics
- **📈 Space Analysis** - Quickly identify space-consuming files
- **⏮️ Rollback Support** - Undo file organization operations
- **⚛️ Safe Atomic Moves** - Uses `COPYFILE_EXCL` to prevent race conditions during file moves
- **💾 Automatic Backups** - Safely backs up files before overwriting to `.file-organizer-backups`
- **📝 Structured Logging** - JSON-formatted logs with configurable log levels
- **📜 Audit Trail** - Complete logging of all operations for transparency
- **📖 Secure File Reading** - Read file contents with 8-layer security validation, encoding support (utf-8/base64/binary), partial reads, and SHA-256 integrity verification
- **💻 Multi-Platform Support** - Native support for Windows, macOS, and Linux

### Security Features

This server implements a multi-layered security architecture designed to operate safely in untrusted environments.

- **TOCTOU Mitigation**: Critical file operations uses File Descriptors (`fs.open` with `O_NOFOLLOW`) to prevent Time-of-Check-Time-of-Use race conditions.
- **Path Traversal Protection**:
  - Robust canonicalization handling URI encodings (`%2e%2e`), null bytes, and Unicode normalization.
  - Strict sandboxing ensuring operations stay within allowed directories.
- **Input Sanitization**:
  - All category names and inputs are sanitized to prevent XSS, Command Injection, and Path Injection.
  - ReDoS protection on regex inputs.
- **DoS Prevention**:
  - Timeouts on deep scanning and unique file analysis.
  - Maximum file count and depth limits.
- **Strict Validation**:
  - Windows Reserved Names (CON, NUL, etc.) are blocked.
  - Symbolic links are strictly managed or blocked in critical paths.

### Limitations

- **Race Conditions on Deletion**: While read/write operations are secured via File Descriptors, file deletion on some platforms (Windows) relies on path locking, which reduces but may not entirely eliminate deletion race windows.
- **Symlinks**: Symlinks are generally blocked from being opened as files to prevent security issues.
- **Windows**: Requires standard user permissions. Admin privileges are not recommended or supported.

### Data Integrity

- **Race Condition Mitigation**: Uses atomic copy-then-delete strategy to prevent data loss if a file is modified during a move operation.
- **Safe Overwrites**: When `conflict_strategy: 'overwrite'` is used, the existing file is moved to a timestamped backup folder before replacement.

### 🚀 Features Overview

### ⚙️ Interactive Setup Wizard

Run `npx file-organizer-mcp --setup` for guided configuration:

- **📁 Folder Selection** - Interactively choose folders to manage
- **⚡ Conflict Handling** - Set default rename/skip/overwrite strategy
- **📅 Schedule Setup** - Configure automatic organization schedules
- **🤖 Claude Integration** - Auto-generates `claude_desktop_config.json`

### What's New in V3.2.0

**New Features:**

- **File-reader tool** - Read files with configurable encoding and line limits

See [CHANGELOG.md](CHANGELOG.md) for full details.

### Recent Fixes (v3.2.0)

- Fixed test coverage and added 57 new test cases
- Improved duplicate detection accuracy
- Enhanced file categorization logic
- Better handling of special characters in filenames
- Improved error messages for permission denied scenarios

---

## <a id="tools-reference"></a>Tools Reference 🛠️

### Core Tools

#### `file_organizer_scan_directory`

Scan directory with detailed file information including size, dates, and extensions.

**Parameters:**

- `directory` (string, required) - Full path to directory
- `include_subdirs` (boolean, optional) - Include subdirectories (default: false)
- `max_depth` (number, optional) - Maximum depth (default: -1, max: 10)
- `limit` (number, optional) - Max files per page (default: 100, max: 1000)
- `offset` (number, optional) - Pagination offset (default: 0)
- `response_format` ('json'|'markdown', optional) - Output format (default: 'markdown')

**Annotations:** ✅ Read-only • ⚡ Idempotent • 🌍 Filesystem access

**Example:**

```typescript
file_organizer_scan_directory({
  directory: "/Users/john/Downloads",
  include_subdirs: true,
  max_depth: 3,
  limit: 100,
});
```

---

#### `file_organizer_list_files`

List all files in a directory with basic information. Simple, fast listing.

**Parameters:**

- `directory` (string, required) - Full path to directory
- `response_format` ('json'|'markdown', optional) - Output format

**Annotations:** ✅ Read-only • ⚡ Idempotent

---

#### `file_organizer_read_file` ⭐ NEW in v3.2.0

Read file contents with comprehensive security checks. Supports text, binary, and base64 encoding with SHA-256 checksum verification.

**Parameters:**

- `path` (string, required) - Absolute path to the file
- `encoding` ('utf-8'|'base64'|'binary', optional) - Text encoding (default: 'utf-8')
- `maxBytes` (number, optional) - Maximum bytes to read, 1B to 100MB (default: 10MB)
- `offset` (number, optional) - Byte offset to start reading from (default: 0)
- `limit` (number, optional) - Maximum bytes to read (alias for maxBytes)
- `response_format` ('json'|'markdown'|'text', optional) - Output format (default: 'markdown')
- `calculateChecksum` (boolean, optional) - Include SHA-256 checksum (default: true)

**Annotations:** ✅ Read-only • ⚡ Idempotent • 🛡️ Security-hardened

**Security Features:**

- 🔒 8-layer path validation blocks path traversal attacks
- 🔒 Automatic blocking of sensitive files (.env, .ssh/, passwords, keys)
- 🔒 Rate limiting (120/min, 2000/hour)
- 🔒 TOCTOU-safe file operations with O_NOFOLLOW
- 🔒 SHA-256 checksums for integrity verification

**Example:**

```typescript
// Read a text file
file_organizer_read_file({
  path: "/home/user/documents/report.txt"
});

// Read image as base64
file_organizer_read_file({
  path: "/home/user/photos/avatar.png",
  encoding: "base64"
});

// Read partial content (first 1KB of log)
file_organizer_read_file({
  path: "/var/log/app.log",
  offset: 0,
  maxBytes: 1024,
  response_format: "text"
});
```

---

#### `file_organizer_categorize_by_type`

Group files by category with statistics. Shows breakdown by file type.

**Parameters:**

- `directory` (string, required) - Full path to directory
- `include_subdirs` (boolean, optional) - Include subdirectories
- `response_format` ('json'|'markdown', optional) - Output format

**Returns:** Category breakdown with file counts and sizes

**Example:**

```typescript
file_organizer_categorize_by_type({
  directory: "/Users/john/Downloads",
});
// Output:
// Executables    - 12 files (45 MB)
// Videos         - 24 files (2.3 GB)
// Documents      - 89 files (234 MB)
```

---

#### `file_organizer_find_largest_files`

Find the largest space-consuming files in a directory.

**Parameters:**

- `directory` (string, required) - Full path to directory
- `include_subdirs` (boolean, optional) - Include subdirectories
- `top_n` (number, optional) - Number of files to return (default: 10)
- `response_format` ('json'|'markdown', optional) - Output format

**Use Cases:** Space cleanup, identifying large downloads, finding old backups

---

#### `file_organizer_find_duplicate_files`

Find duplicate files using SHA-256 content hashing.

**Parameters:**

- `directory` (string, required) - Full path to directory
- `response_format` ('json'|'markdown', optional) - Output format

**Returns:** Duplicate groups with wasted space calculation

**Note:** Files larger than 100MB are skipped (security limit)

---

#### `file_organizer_analyze_duplicates`

Advanced duplicate analysis with keep/delete suggestions based on location, name quality, and age.

**Parameters:**

- `directory` (string, required) - Full path to directory
- `response_format` ('json'|'markdown', optional) - Output format

**Returns:** Duplicate groups with intelligent recommendations

---

### Organization Tools

#### `file_organizer_preview_organization`

Preview file organization WITHOUT making changes. Shows planned moves, conflicts, and reasons.

**Parameters:**

- `directory` (string, required) - Full path to directory
- `conflict_strategy` ('rename'|'skip'|'overwrite'|'overwrite_if_newer', optional) - Conflict resolution (default: 'rename')

**Annotations:** ✅ Read-only • 🔍 Dry-run

**Example:**

```typescript
file_organizer_preview_organization({
  directory: "/Users/john/Downloads",
  conflict_strategy: "rename",
});
```

---

#### `file_organizer_organize_files`

Automatically organize files into categorized folders.

**Parameters:**

- `directory` (string, required) - Full path to directory
- `dry_run` (boolean, optional) - Preview without moving (default: true)
- `conflict_strategy` ('rename'|'skip'|'overwrite'|'overwrite_if_newer', optional) - How to handle conflicts
- `response_format` ('json'|'markdown', optional) - Output format

**Returns:** Organization summary with actions taken and errors

**⚠️ Modifies filesystem** - Use `dry_run: true` first!

**Example:**

```typescript
// Preview first
file_organizer_organize_files({
  directory: "/Users/john/Downloads",
  dry_run: true,
});

// Then execute
file_organizer_organize_files({
  directory: "/Users/john/Downloads",
  dry_run: false,
});
```

---

#### `file_organizer_undo_last_operation`

Reverse file moves and renames from a previous organization.

**Parameters:**

- `directory` (string, required) - Full path to directory
- `response_format` ('json'|'markdown', optional) - Output format

**Returns:** Rollback results with success/failure counts

---

#### `file_organizer_batch_rename`

Batch rename files using pattern matching, case conversion, or sequence numbering.

**Parameters:**

- `directory` (string, optional) - Directory to scan (either this or `files` required)
- `files` (array, optional) - Specific files to rename
- `rules` (array, required) - Renaming rules:
  - `type`: 'find_replace' | 'case' | 'add_text' | 'numbering'
  - _...plus rule-specific options (replace, with, conversion, text, position, etc.)_
- `dry_run` (boolean, optional) - Preview only (default: true)

**Annotations:** ⚠️ Destructive (if dry_run=false) • 🔍 Dry-run

**Example:**

```typescript
file_organizer_batch_rename({
  directory: "/Docs",
  rules: [
    { type: "find_replace", find: "IMG", replace: "Photo" },
    { type: "case", conversion: "lowercase" },
  ],
  dry_run: true,
});
```

---

### Watch & Schedule Tools

#### `file_organizer_watch_directory`

Add a directory to the automatic organization watch list with cron-based scheduling.
Files will be automatically organized based on the schedule you set.

**Parameters:**

- `directory` (string, required) - Full path to the directory to watch
- `schedule` (string, required) - Cron expression (e.g., `"0 10 * * *"` for daily at 10am)
- `auto_organize` (boolean, optional) - Enable auto-organization (default: true)
- `min_file_age_minutes` (number, optional) - Only organize files older than X minutes
- `max_files_per_run` (number, optional) - Maximum files to process per run
- `response_format` ('json'|'markdown', optional) - Output format

**Cron Expression Examples:**

| Expression     | Schedule                     |
| -------------- | ---------------------------- |
| `0 10 * * *`   | Daily at 10:00 AM            |
| `*/30 * * * *` | Every 30 minutes             |
| `0 */6 * * *`  | Every 6 hours                |
| `0 9 * * 1`    | Every Monday at 9:00 AM      |
| `0 0 * * 0`    | Weekly on Sunday at midnight |

**Example:**

```typescript
// Watch Downloads folder - organize daily at 9am, files must be 5+ minutes old
file_organizer_watch_directory({
  directory: "/Users/john/Downloads",
  schedule: "0 9 * * *",
  min_file_age_minutes: 5,
  max_files_per_run: 100,
});
```

---

#### `file_organizer_unwatch_directory`

Remove a directory from the watch list.

**Parameters:**

- `directory` (string, required) - Full path to remove from watch list
- `response_format` ('json'|'markdown', optional) - Output format

---

#### `file_organizer_list_watches`

List all directories currently being watched with their schedules.

**Parameters:**

- `response_format` ('json'|'markdown', optional) - Output format

**Returns:** List of watched directories with schedules and rules

---

### Utility Tools

#### `file_organizer_get_categories`

Returns the list of categories used for file organization.

**Parameters:** None

**Returns:** List of all file categories and their extensions

---

#### `file_organizer_set_custom_rules`

Customize how files are categorized. Rules persist for the current session.

**Parameters:**

- `rules` (array, required) - Array of rule objects, each containing:
  - `category` (string, required) - Target category name
  - `extensions` (array of strings, optional) - File extensions to match
  - `filename_pattern` (string, optional) - Glob pattern to match filenames
  - `priority` (number, optional) - Rule priority (lower = higher priority)

**Example:**

```typescript
file_organizer_set_custom_rules({
  rules: [
    {
      category: "Tax Docs",
      extensions: [".pdf"],
      filename_pattern: "*tax*",
      priority: 1,
    },
    {
      category: "Receipts",
      extensions: [".pdf", ".png"],
      filename_pattern: "*receipt*",
      priority: 2,
    },
  ],
});
```

---

#### `file_organizer_delete_duplicates`

Permanently delete specified duplicate files. **This operation is destructive and cannot be undone.**

**Parameters:**

- `files_to_delete` (array of strings, required) - Full paths of duplicate files to remove
- `verify_duplicates` (boolean, optional) - Re-verify files are duplicates before deleting (default: true)
- `create_backup_manifest` (boolean, optional) - Save a manifest of deleted files for reference (default: true)
- `response_format` ('json'|'markdown', optional) - Output format

**⚠️ Destructive** - Always run `file_organizer_analyze_duplicates` first and review recommendations before using.

---

## File Categories

Files are automatically sorted into these categories:

| Category          | Extensions                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------ |
| **Executables**   | `.exe`, `.msi`, `.bat`, `.cmd`, `.sh`                                                      |
| **Videos**        | `.mp4`, `.avi`, `.mkv`, `.mov`, `.wmv`, `.flv`, `.webm`, `.m4v`                            |
| **Documents**     | `.pdf`, `.doc`, `.docx`, `.txt`, `.rtf`, `.odt`, `.md`, `.tex`                             |
| **Presentations** | `.ppt`, `.pptx`, `.odp`, `.key`                                                            |
| **Spreadsheets**  | `.xls`, `.xlsx`, `.csv`, `.ods`                                                            |
| **Images**        | `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.svg`, `.ico`, `.webp`                           |
| **Audio**         | `.mp3`, `.wav`, `.flac`, `.aac`, `.ogg`, `.wma`, `.m4a`                                    |
| **Archives**      | `.zip`, `.rar`, `.7z`, `.tar`, `.gz`, `.bz2`, `.xz`                                        |
| **Code**          | `.py`, `.js`, `.ts`, `.java`, `.cpp`, `.c`, `.html`, `.css`, `.php`, `.rb`, `.go`, `.json` |
| **Tests**         | `*test*`, `*spec*`, `.test.ts`, `.spec.ts`                                                 |
| **Logs**          | `*debug*`, `*.log`                                                                         |
| **Scripts**       | `*script*`, `.sh`, `.bat`                                                                  |
| **Installers**    | `.dmg`, `.pkg`, `.deb`, `.rpm`, `.apk`                                                     |
| **Ebooks**        | `.epub`, `.mobi`, `.azw`, `.azw3`                                                          |
| **Fonts**         | `.ttf`, `.otf`, `.woff`, `.woff2`                                                          |
| **Others**        | Everything else                                                                            |

---

## <a id="example-workflows"></a>Example Workflows 💡

### Workflow 1: Intelligent Downloads Cleanup

```
User: "Claude, help me clean up my Downloads folder at C:/Users/[YOUR_USERNAME]/Downloads"

Claude follows these steps:
1. Scans directory → Shows 1,247 files, 15.3 GB
2. Categorizes files → Videos: 234 (8.2 GB), Documents: 567 (2.1 GB)
3. Finds duplicates → Found 45 duplicate groups, wasted 2.3 GB
4. Shows largest files → old_backup.zip: 5.2 GB
5. Previews organization → Shows planned moves and conflicts
6. Asks for confirmation
7. Organizes files → ✅ Organized 1,247 files into 8 category folders

Result: Clean, organized Downloads folder with duplicates identified
```

---

### Workflow 2: Project Organization

```
User: "Claude, organize my project folder at ~/myproject"

Claude:
1. Scans the project → 423 files across multiple subdirectories
2. Identifies file types → Code (289), Assets (87), Docs (47)
3. Suggestions organization → Preserves src/ structure, organizes root files
4. Previews changes → Shows (47) items to organize
5. Executes → Moves config files, readmes, screenshots to proper folders

Result: Clean project structure with organized documentation and assets
```

---

### Workflow 3: Duplicate File Management

```
User: "Claude, find and analyze duplicates in C:/Users/[YOUR_USERNAME]/Documents"

Claude:
1. Scans for duplicates → Finds 23 duplicate groups
2. Analyzes each group → Scores files by location, name quality, age
3. Suggests which to keep → Keeps "/Documents/Important/file.pdf"
4. Suggests which to delete → Delete "/Downloads/file (1).pdf"
5. Shows wasted space → Total: 1.8 GB can be reclaimed

User can manually delete or ask Claude to organize to remove duplicates
```

---

### Workflow 4: Large File Discovery

```
User: "Claude, show me the 20 largest files taking up space in my Downloads folder"

Claude:
1. Analyzes directory size → Total: 45.2 GB
2. Finds largest files:
   - old_backup_2023.zip: 12.3 GB (2 years old)
   - movie_collection.mkv: 8.7 GB
   - presentation_final.pptx: 890 MB
3. Suggests cleanup → Archive or delete old backups
4. Shows duplicates in large files → Some large files have copies

Result: Clear visibility into space usage with actionable insights
```

---

### Workflow 5: Set Up Automatic Organization

```
User: "Claude, automatically organize my Downloads folder every day at 9am"

Claude:
1. Sets up watch directory →
   file_organizer_watch_directory({
     directory: "/Users/john/Downloads",
     schedule: "0 9 * * *",
     min_file_age_minutes: 5
   })
2. Confirms setup → "Downloads folder will be organized daily at 9:00 AM"
3. Shows current watches → Lists all watched directories

User: "Also watch my Desktop folder every hour"

Claude:
4. Adds second watch →
   file_organizer_watch_directory({
     directory: "/Users/john/Desktop",
     schedule: "0 * * * *",
     max_files_per_run: 50
   })

Result: Automatic background organization with smart scheduling
```

---

## <a id="security-configuration"></a>Security Configuration 🔐

### Security Score: 10/10 🌟

The server uses a **Secure by Default** approach. Access is restricted to a specific whitelist of user directories. All system directories are blacklisted.

### ✅ Allowed Directories (Default)

The server automatically detects and allows access to these safe user locations:

| Platform    | Allowed Directories                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| **Windows** | `Desktop`, `Documents`, `Downloads`, `Pictures`, `Videos`, `Music`, `OneDrive`, `Projects`, `Workspace` |
| **macOS**   | `Desktop`, `Documents`, `Downloads`, `Movies`, `Music`, `Pictures`, `iCloud Drive`, `Projects`          |
| **Linux**   | `Desktop`, `Documents`, `Downloads`, `Music`, `Pictures`, `Videos`, `~/dev`, `~/workspace`              |

_> Note: Only directories that actually exist on your system are enabled._

### ❌ Always Blocked

To prevent accidents, the following are **always blocked**, even if added to config:

- **Windows:** `C:\Windows`, `Program Files`, `AppData`, `$Recycle.Bin`
- **macOS:** `/System`, `/Library`, `/Applications`, `/private`, `/usr`
- **Linux:** `/etc`, `/usr`, `/var`, `/root`, `/sys`, `/proc`
- **Global:** `node_modules`, `.git`, `.vscode`, `.idea`, `dist`, `build`

### ⚙️ Custom Configuration

You can customize behavior by editing the user configuration file.

**Config Location:**

- **Windows:** `%APPDATA%\file-organizer-mcp\config.json`
- **macOS:** `$HOME/Library/Application Support/file-organizer-mcp/config.json`
- **Linux:** `$HOME/.config/file-organizer-mcp/config.json`

**How to Add Directories:**

1. Open `config.json`
2. Add paths to `customAllowedDirectories`:

   ```json
   {
     "customAllowedDirectories": [
       "C:\\Users\\Name\\My Special Folder",
       "D:\\Backups"
     ]
   }
   ```

   > 💡 **Tip:** You can copy a folder path directly from your file explorer's address bar and paste it into `customAllowedDirectories`.

3. Restart Claude Desktop.

### Conflict Strategy

Set your preferred default conflict resolution strategy:

```json
{
  "conflictStrategy": "rename"
}
```

Available strategies:

- `"rename"` (default) - Renames new file (e.g., `file (1).txt`)
- `"skip"` - Keeps existing file, skips new one
- `"overwrite"` - Replaces existing file (creates backup first)

### Auto-Organize Schedule (Legacy)

Simple schedule configuration (for basic hourly/daily/weekly):

```json
{
  "autoOrganize": {
    "enabled": true,
    "schedule": "daily"
  }
}
```

For advanced cron-based scheduling, use the `file_organizer_watch_directory` tool.

### Security Defenses

| Attack Type             | Protection Mechanism                 | Status       |
| ----------------------- | ------------------------------------ | ------------ |
| **Unauthorized Access** | Whitelist + Blacklist Enforcement    | ✅ Protected |
| **Path Traversal**      | 8-Layer Validation Pipeline          | ✅ Protected |
| **Symlink Attacks**     | Real Path Resolution                 | ✅ Protected |
| **DoS**                 | Resource Limits (Files, Depth, Size) | ✅ Protected |

---

## 🐛 Troubleshooting

### MCP Server Not Showing Up

1. ✅ Check config file path is correct
2. ✅ Verify Node.js v18+ is installed: `node --version`
3. ✅ Restart Claude Desktop completely
4. ✅ Check path in `claude_desktop_config.json` is correct

### Permission Errors

1. ✅ **Windows:** Run Claude Desktop as Administrator
2. ✅ **Mac/Linux:** Check folder permissions: `ls -la`
3. ✅ Ensure write permissions in target directory

### Files Not Moving

1. ✅ Verify `dry_run` mode is NOT enabled
2. ✅ Check files aren't locked by other programs
3. ✅ Ensure sufficient disk space
4. ✅ Review error messages in operation summary

---

## 📝 Important Notes

- ⚠️ Organizes files in **root directory only**, not subdirectories (by default)
- ⚠️ Existing category folders won't be reorganized (prevents loops)
- ✅ File extensions are case-insensitive
- ✅ Original modification dates are preserved
- ✅ Hidden files (starting with `.`) are automatically skipped
- ✅ Maximum 10,000 files processed per operation (security limit)
- ✅ Maximum 10 directory levels scanned (security limit)
- ✅ Rollback support for undo operations

---

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
git clone https://github.com/kridaydave/File-Organizer-MCP.git
cd File-Organizer-MCP
npm install
npm run build
npm test
```

### Reporting Issues

🚨 **Security vulnerabilities:** Email technocratix902@gmail.com  
🐛 **Bugs/features:** [GitHub Issues](https://github.com/kridaydave/File-Organizer-MCP/issues)

---

## 📚 Documentation

- **[API.md](API.md)** - Complete tool reference
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Technical architecture and design patterns
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Contribution guidelines
- **[MIGRATION.md](MIGRATION.md)** - v2 to v3 upgrade guide
- **[CHANGELOG.md](CHANGELOG.md)** - Version history

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

---

## 🙏 Acknowledgments

- **Anthropic** - For the Model Context Protocol specification
- **NetworkChuck** - For the MCP tutorial that inspired this project
- **The MCP Community** - For feedback and support

---

## 📞 Support

- **MCP Registry:** [View Listing](https://registry.modelcontextprotocol.io/servers/io.github.kridaydave/file-organizer)
- **NPM Package:** [View on NPM](https://www.npmjs.com/package/file-organizer-mcp)
- **Issues:** [GitHub Issues](https://github.com/kridaydave/File-Organizer-MCP/issues)
- **MCP Spec:** [Model Context Protocol](https://modelcontextprotocol.io)

---

### Happy Organizing! 🎯

> _Built with ❤️ for the MCP community_

[⬆ Back to Top](#file-organizer-mcp-server)
