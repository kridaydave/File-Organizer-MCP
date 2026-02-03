# File Organizer MCP Server 🗂️

**Version:** 3.0.0 | **MCP Protocol:** 2024-11-05 | **Node:** ≥18.0.0

[Quick Start](#-quick-start) • [Features](#-features) • [Tools](#-tools-reference) • [Examples](#-example-workflows) • [API](API.md) • [Security](#-security) • [Architecture](ARCHITECTURE.md)

---

[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io/servers/io.github.kridaydave/file-organizer)
[![npm version](https://img.shields.io/badge/npm-v3.0.0-blue.svg)](https://www.npmjs.com/package/file-organizer-mcp)
[![npm downloads](https://img.shields.io/npm/dm/file-organizer-mcp.svg)](https://www.npmjs.com/package/file-organizer-mcp)
[![Security](https://img.shields.io/badge/security-hardened-green.svg)](https://github.com/kridaydave/File-Organizer-MCP)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-133%20passing-success.svg)](tests/)

**A powerful, security-hardened Model Context Protocol (MCP) server for intelligent file organization with Claude**

🎯 [Install from MCP Registry](https://registry.modelcontextprotocol.io/servers/io.github.kridaydave/file-organizer) • 📦 [View on NPM](https://www.npmjs.com/package/file-organizer-mcp) • 🐛 [Report Issues](https://github.com/kridaydave/File-Organizer-MCP/issues)

---

## 🚀 Quick Start

### Installation

```bash
# Option 1: Install globally
npm install -g file-organizer-mcp

# Option 2: Use npx (no installation)
npx file-organizer-mcp
```

### Claude Desktop Configuration

Add to `claude_desktop_config.json`:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`  
**macOS:** `$HOME/Library/Application Support/Claude/claude_desktop_config.json`  
**Linux:** `$HOME/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "file-organizer": {
      "command": "npx",
      "args": ["path/to/file-organizer-mcp"]
    }
  }
}
```

> 💡 **Local models:** For LM Studio, Ollama, OpenRouter, etc., see the [Local-Model-Configs folder](Local-Model-Configs/) for ready-made configurations.

### First Steps

1. **Restart Claude Desktop**
2. Try: `"Scan my Downloads folder"`
3. Then: `"Show me the largest files"`
4. Finally: `"Organize my files — preview first"`

---

## 🎯 Features

### Core Functionality

* **🤖 Auto-categorization** - Intelligently organizes files into 12+ categories
* **🔍 Duplicate Detection** - Finds duplicate files using SHA-256 content hashing
* **🛡️ Smart Conflict Resolution** - Handles filename conflicts automatically (rename/skip/overwrite)
* **👁️ Dry Run Mode** - Preview changes before executing
* **📊 Comprehensive Scanning** - Detailed directory analysis with statistics
* **📈 Space Analysis** - Quickly identify space-consuming files
* **⏮️ Rollback Support** - Undo file organization operations
* **⚛️ Safe Atomic Moves** - Uses `COPYFILE_EXCL` to prevent race conditions during file moves
* **💾 Automatic Backups** - Safely backs up files before overwriting to `.file-organizer-backups`
* **📝 Structured Logging** - JSON-formatted logs with configurable log levels (debug/info/warn/error)
* **💻 Multi-Platform Support** - Native support for Windows, macOS, and Linux (Ubuntu, Debian, etc.)

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

### What's New in v3

**Architecture:**
* **TypeScript Migration** - Complete rewrite from JavaScript to TypeScript with strict type safety
* **Modular Design** - Layered architecture with Services, Tools, Utils, and Schemas layers
* **Zod Validation** - Runtime input validation with descriptive error messages

**Security:**
* **Secure by Default** - Whitelist-based authorization for directory access
* **System Protection** - Critical system folders are strictly blocked
* **Platform Awareness** - Automatically detects safe folders for Windows, Mac, and Linux
* **8-Layer Path Validation** - Comprehensive validation pipeline preventing path traversal attacks

**Breaking changes:**
* Access is now denied for non-whitelisted directories by default.
* You must add custom paths to `config.json` to access them.
* See [MIGRATION.md](MIGRATION.md) for the upgrade guide.

---

## 🛠️  Tools Reference

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
  limit: 100
})
```

---

#### `file_organizer_list_files`

List all files in a directory with basic information. Simple, fast listing.

**Parameters:**
- `directory` (string, required) - Full path to directory
- `response_format` ('json'|'markdown', optional) - Output format

**Annotations:** ✅ Read-only • ⚡ Idempotent

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
  directory: "/Users/john/Downloads"
})
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
  conflict_strategy: "rename"
})
```

---

#### `file_organizer_organize_files`

Automatically organize files into categorized folders.

**Parameters:**
- `directory` (string, required) - Full path to directory
- `dry_run` (boolean, optional) - Preview without moving (default: false)
- `conflict_strategy` ('rename'|'skip'|'overwrite'|'overwrite_if_newer', optional) - How to handle conflicts
- `response_format` ('json'|'markdown', optional) - Output format

**Returns:** Organization summary with actions taken and errors

**⚠️ Modifies filesystem** - Use `dry_run: true` first!

**Example:**
```typescript
// Preview first
file_organizer_organize_files({
  directory: "/Users/john/Downloads",
  dry_run: true
})

// Then execute
file_organizer_organize_files({
  directory: "/Users/john/Downloads",
  dry_run: false
})
```

---

#### `file_organizer_undo_last_operation`

Reverse file moves and renames from a previous organization.

**Parameters:**
- `directory` (string, required) - Full path to directory
- `response_format` ('json'|'markdown', optional) - Output format

**Returns:** Rollback results with success/failure counts

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
    { category: "Tax Docs", extensions: [".pdf"], filename_pattern: "*tax*", priority: 1 },
    { category: "Receipts", extensions: [".pdf", ".png"], filename_pattern: "*receipt*", priority: 2 }
  ]
})
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

## 📁 File Categories

Files are automatically sorted into these categories:

| Category | Extensions |
| --- | --- |
| **Executables** | `.exe`, `.msi`, `.bat`, `.cmd`, `.sh` |
| **Videos** | `.mp4`, `.avi`, `.mkv`, `.mov`, `.wmv`, `.flv`, `.webm`, `.m4v` |
| **Documents** | `.pdf`, `.doc`, `.docx`, `.txt`, `.rtf`, `.odt` |
| **Presentations** | `.ppt`, `.pptx`, `.odp`, `.key` |
| **Spreadsheets** | `.xls`, `.xlsx`, `.csv`, `.ods` |
| **Images** | `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.svg`, `.ico`, `.webp` |
| **Audio** | `.mp3`, `.wav`, `.flac`, `.aac`, `.ogg`, `.wma`, `.m4a` |
| **Archives** | `.zip`, `.rar`, `.7z`, `.tar`, `.gz`, `.bz2`, `.xz` |
| **Code** | `.py`, `.js`, `.ts`, `.java`, `.cpp`, `.c`, `.html`, `.css`, `.php`, `.rb`, `.go`, `.json` |
| **Installers** | `.dmg`, `.pkg`, `.deb`, `.rpm`, `.apk` |
| **Ebooks** | `.epub`, `.mobi`, `.azw`, `.azw3` |
| **Fonts** | `.ttf`, `.otf`, `.woff`, `.woff2` |
| **Others** | Everything else |

---

## 💡 Example Workflows

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
3. Suggests organization → Preserves src/ structure, organizes root files
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

## 🔐 Security Configuration

**Security Score: 10/10 🌟**

The server uses a **Secure by Default** approach. Access is restricted to a specific whitelist of user directories. All system directories are blacklisted.

### ✅ Allowed Directories (Default)

The server automatically detects and allows access to these safe user locations:

| Platform | Allowed Directories |
| --- | --- |
| **Windows** | `Desktop`, `Documents`, `Downloads`, `Pictures`, `Videos`, `Music`, `OneDrive`, `Projects`, `Workspace` |
| **macOS** | `Desktop`, `Documents`, `Downloads`, `Movies`, `Music`, `Pictures`, `iCloud Drive`, `Projects` |
| **Linux** | `Desktop`, `Documents`, `Downloads`, `Music`, `Pictures`, `Videos`, `~/dev`, `~/workspace` |

*> Note: Only directories that actually exist on your system are enabled.*

### ❌ Always Blocked

To prevent accidents, the following are **always blocked**, even if added to config:

* **Windows:** `C:\Windows`, `Program Files`, `AppData`, `$Recycle.Bin`
* **macOS:** `/System`, `/Library`, `/Applications`, `/private`, `/usr`
* **Linux:** `/etc`, `/usr`, `/var`, `/root`, `/sys`, `/proc`
* **Global:** `node_modules`, `.git`, `.vscode`, `.idea`, `dist`, `build`

### ⚙️ Custom Configuration

You can allow access to additional folders by editing the user configuration file.

**Config Location:**
* **Windows:** `%APPDATA%\file-organizer-mcp\config.json`
* **macOS:** `$HOME/Library/Application Support/file-organizer-mcp/config.json`
* **Linux:** `$HOME/.config/file-organizer-mcp/config.json`

**How to Add Directories:**
1. Open `config.json`
2. Add paths to `customAllowedDirectories`:

```json
{
  "customAllowedDirectories": [
    "C:\\Users\\Name\\My Special Folder",
    "D:\\Backups"
  ],
  "settings": {
    "maxScanDepth": 10,
    "logAccess": true
  }
}
```
> 💡 **Tip:** You can copy a folder path directly from your file explorer's address bar and paste it into `customAllowedDirectories`.

3. Restart Claude Desktop.

### Security Defenses

| Attack Type | Protection Mechanism | Status |
| --- | --- | --- |
| **Unauthorized Access** | Whitelist + Blacklist Enforcement | ✅ Protected |
| **Path Traversal** | 8-Layer Validation Pipeline | ✅ Protected |
| **Symlink Attacks** | Real Path Resolution | ✅ Protected |
| **DoS** | Resource Limits (Files, Depth, Size) | ✅ Protected |

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

* ⚠️ Organizes files in **root directory only**, not subdirectories (by default)
* ⚠️ Existing category folders won't be reorganized (prevents loops)
* ✅ File extensions are case-insensitive
* ✅ Original modification dates are preserved
* ✅ Hidden files (starting with `.`) are automatically skipped
* ✅ Maximum 10,000 files processed per operation (security limit)
* ✅ Maximum 10 directory levels scanned (security limit)
* ✅ Rollback support for undo operations

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

* **Anthropic** - For the Model Context Protocol specification
* **NetworkChuck** - For the MCP tutorial that inspired this project
* **The MCP Community** - For feedback and support

---

## 📞 Support

* **MCP Registry:** [View Listing](https://registry.modelcontextprotocol.io/servers/io.github.kridaydave/file-organizer)
* **NPM Package:** [View on NPM](https://www.npmjs.com/package/file-organizer-mcp)
* **Issues:** [GitHub Issues](https://github.com/kridaydave/File-Organizer-MCP/issues)
* **MCP Spec:** [Model Context Protocol](https://modelcontextprotocol.io)

---

**Happy Organizing! 🎯**

*Built with ❤️ for the MCP community*

[⬆ Back to Top](#file-organizer-mcp-server-)