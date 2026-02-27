# <a id="file-organizer-mcp-server"></a>File Organizer MCP Server 🗂️

**Version:** 3.4.1 | **MCP Protocol:** 2024-11-05 | **Node:** ≥18.0.0

**New in v3.4.0 - Smart Organization:**

- 🧠 **`organize_smart`** - Auto-detects and organizes mixed folders (music, photos, documents)
- 🎵 **`organize_music`** - Music by Artist/Album structure with ID3 metadata
- 📸 **`organize_photos`** - Photos by EXIF date with GPS stripping
- 📄 **`organize_by_content`** - Documents by topic extraction
- 📚 **`batch_read_files`** - Read multiple files efficiently

**Previous v3.2.8:**

- Enhanced metadata extraction, security screening, metadata cache system

[Why Us](#why-specialized-tools) • [Quick Start](#quick-start) • [Features](#features) • [Tools](#tools-reference) • [Examples](#example-workflows) • [API](API.md) • [Security](#security-configuration) • [Architecture](ARCHITECTURE.md)

---

[![npm version](https://img.shields.io/badge/npm-v3.4.0-blue.svg)](https://www.npmjs.com/package/file-organizer-mcp)
[![npm downloads](https://img.shields.io/npm/dm/file-organizer-mcp.svg)](https://www.npmjs.com/package/file-organizer-mcp)
[![Security](https://img.shields.io/badge/security-hardened-green.svg)](https://github.com/kridaydave/File-Organizer-MCP)
[![Node](https://img.shields.io/badge/node-%3E%3E18.0.0-brightgreen.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-819%20passing-success.svg)](tests/)

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

| Method               | Command                             | Best For                      |
| -------------------- | ----------------------------------- | ----------------------------- |
| **npx (no install)** | `npx file-organizer-mcp --setup`    | Trying it out, occasional use |
| **Global install**   | `npm install -g file-organizer-mcp` | Regular use, faster startup   |

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
- **🏷️ Enhanced Metadata Extraction** - Extracts EXIF for photos, ID3 tags for music, and detailed metadata for documents for content-aware organization
- **🧠 Smart Organization** - Automatically organizes mixed folders by detecting file types and applying appropriate strategies
- **🎵 Music Organization** - Organizes music files by Artist/Album/Title structure using ID3 metadata
- **📸 Photo Organization** - Organizes photos by date (YYYY/MM/DD) using EXIF metadata with GPS stripping
- **📄 Content Organization** - Organizes documents by topic extraction from content (PDF, DOCX, TXT)
- **📚 Batch File Reading** - Read multiple files efficiently with encoding support
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
- **🔒 Security Screening** - Enhanced security with metadata-based threat detection
- **📚 Metadata Cache System** - Efficient metadata caching for faster operations

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
- **Enhanced Security Screening**:
  - Metadata-based threat detection for sensitive information in files
  - Malicious content detection using metadata signatures
  - Security scan results with detailed metadata analysis
- **Metadata Security**:
  - Secure handling of sensitive metadata (EXIF GPS coordinates, ID3 personal information)
  - Option to redact sensitive metadata during organization

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

### What's Next ?

- **Automatic Compression of unsed/old files**
- **Server Code migration to TypeScript**
- **Added Security and performance**
  See [CHANGELOG.md](CHANGELOG.md) for full details.

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
  path: "/home/user/documents/report.txt",
});

// Read image as base64
file_organizer_read_file({
  path: "/home/user/photos/avatar.png",
  encoding: "base64",
});

// Read partial content (first 1KB of log)
file_organizer_read_file({
  path: "/var/log/app.log",
  offset: 0,
  maxBytes: 1024,
  response_format: "text",
});
```

---

#### `file_organizer_batch_read_files` ⭐ NEW in v3.3.0

Read multiple files efficiently in a single operation.

**Parameters:**

- `files` (array, required) - List of file paths to read
- `encoding` ('utf-8'|'base64'|'binary', optional) - Text encoding (default: 'utf-8')
- `max_bytes_per_file` (number, optional) - Max bytes per file (default: 10485760)
- `response_format` ('json'|'markdown', optional) - Output format

**Example:**

```typescript
file_organizer_batch_read_files({
  files: ["/path/to/file1.txt", "/path/to/file2.txt", "/path/to/file3.txt"],
  encoding: "utf-8",
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
- `conflict_strategy` ('rename'|'skip'|'overwrite'|'overwrite_if_newer',