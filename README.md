# File Organizer MCP Server 🗂️

[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io/servers/io.github.kridaydave/file-organizer)
[![npm version](https://img.shields.io/npm/v/file-organizer-mcp.svg)](https://www.npmjs.com/package/file-organizer-mcp)
[![npm downloads](https://img.shields.io/npm/dm/file-organizer-mcp.svg)](https://www.npmjs.com/package/file-organizer-mcp)
[![Version](https://img.shields.io/badge/version-2.1.0-blue.svg)](https://github.com/kridaydave/File-Organizer-MCP)
[![Security](https://img.shields.io/badge/security-hardened-green.svg)](https://github.com/kridaydave/File-Organizer-MCP)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-6%2F6%20passing-success.svg)](test_security.js)

**A powerful, security-hardened Model Context Protocol (MCP) server for intelligent file organization**

🎯 [Install from MCP Registry](https://registry.modelcontextprotocol.io/servers/io.github.kridaydave/file-organizer) • 📦 [View on NPM](https://www.npmjs.com/package/file-organizer-mcp) • 🐛 [Report Issues](https://github.com/kridaydave/File-Organizer-MCP/issues)

---

## 🎯 Features

### Core Functionality

* **🤖 Auto-categorization** - Intelligently organizes files into 12+ categories
* **🔍 Duplicate Detection** - Finds duplicate files using SHA-256 content hashing
* **🛡️ Smart File Management** - Handles filename conflicts automatically
* **👁️ Dry Run Mode** - Preview changes before executing
* **📊 Comprehensive Scanning** - Detailed directory analysis with statistics
* **📈 Largest Files Finder** - Quickly identify space-consuming files

### Security Features ✨ NEW in v2.1.0

* **🔒 Path Traversal Protection** - Multi-layer validation with symlink resolution
* **💾 Memory-Safe Operations** - Streaming file processing (no memory exhaustion)
* **⚡ Resource Limits** - Configurable limits for files, depth, and size
* **🛡️ Sandboxed Operations** - Restricted to working directory
* **🔐 Error Sanitization** - No internal path disclosure
* **✅ Comprehensive Testing** - 100% security test coverage

---

## 📦 Installation

### Option 1: Install from MCP Registry (Recommended)

The easiest way to install is through the official MCP Registry:

**Via Claude Desktop:**
1. Open Claude Desktop
2. Go to Settings → Developer → MCP Servers
3. Click "Add Server"
4. Search for "file-organizer"
5. Click Install

**Via Command Line:**
```bash
npx @modelcontextprotocol/create-server io.github.kridaydave/file-organizer
```

### Option 2: Manual Installation

#### Prerequisites

* **Node.js** v18.0.0 or higher
* **npm** or **yarn**
* **Claude Desktop** (for MCP integration)

#### Quick Start
```bash
# 1. Install from NPM
npm install -g file-organizer-mcp

# 2. Run security tests (optional but recommended)
npm test

# 3. Configure in Claude Desktop
# Add to your claude_desktop_config.json:
```

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`  
**Mac/Linux:** `~/Library/Application Support/Claude/claude_desktop_config.json`
```json
{
  "mcpServers": {
    "file-organizer": {
      "command": "node",
      "args": [
        "/path/to/node_modules/file-organizer-mcp/server.js"
      ]
    }
  }
}
```

> ⚠️ **Important:** Replace `/path/to/` with your actual installation path

### Verify Installation
```bash
# Run security tests
npm test

# Expected output:
# ✅ PASS: Sanitize or Reject path traversal with ..
# ✅ PASS: Reject symlink outside CWD
# ✅ PASS: Skip files larger than MAX_FILE_SIZE
# ✅ PASS: Gracefully handle large files in duplicate find
# ✅ PASS: Enforce MAX_DEPTH limit
# ✅ PASS: Enforce MAX_FILES limit
# Tests Passed: 6, Tests Failed: 0
```

---


---

## 🏠 Local LLM Configuration

You can use this server with local LLM clients like **Jan**, **LM Studio**, and **Ollama**.

### 1. Jan Configuration
Add this to your `mcp-servers.json` (found in Settings > MCP Servers):
```json
{
  "file-organizer": {
    "command": "node",
    "args": ["C:/path/to/file-organizer-mcp/server.js"]
  }
}
```

### 2. LM Studio Configuration
Add this to `~/.lmstudio/mcp.json`:
```json
{
  "mcpServers": {
    "file-organizer": {
      "command": "node",
      "args": ["C:/path/to/file-organizer-mcp/server.js"]
    }
  }
}
```

### 3. Ollama Configuration
Use any MCP-compatible client (like Open WebUI) with the command:
`node C:/path/to/file-organizer-mcp/server.js`

---

## 🚀 Usage

### Basic Operations

#### 1. Scan Directory

Get detailed information about files in a directory:
```
Hey Claude, scan my Downloads folder: C:/Users/Admin/Downloads
```

**Output includes:**
* Total file count
* Total size (human-readable)
* Individual file details (name, size, dates, extensions)

#### 2. Categorize Files

See breakdown of files by category:
```
Hey Claude, categorize files in C:/Users/Admin/Downloads
```

**Example output:**
```
Executables    - 12 files (45 MB)
Videos         - 24 files (2.3 GB)
Presentations  - 37 files (156 MB)
Documents      - 89 files (234 MB)
Images         - 156 files (892 MB)
```

#### 3. Find Duplicates

Identify duplicate files and wasted space:
```
Hey Claude, find duplicate files in C:/Users/Admin/Downloads
```

**Shows:**
* Number of duplicate groups
* Total duplicate files
* Wasted space
* List of duplicate file locations

#### 4. Find Largest Files

Identify the biggest space consumers:
```
Hey Claude, show me the 20 largest files in C:/Users/Admin/Downloads
```

#### 5. Organize Files (Preview)

See what would happen before organizing:
```
Hey Claude, organize files in C:/Users/Admin/Downloads with dry run
```

**Dry run shows:**
* Which files would move where
* Category breakdown
* Potential naming conflicts

#### 6. Organize Files (Execute)

Actually organize the files:
```
Hey Claude, organize files in C:/Users/Admin/Downloads
```

**The organizer will:**
1. ✅ Create category folders
2. ✅ Move files to appropriate categories
3. ✅ Handle duplicate filenames (adds _1, _2, etc.)
4. ✅ Preserve original modification dates
5. ✅ Clean up empty category folders
6. ✅ Show detailed summary

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

## 🔐 Security

### Security Score: 9.5/10 🌟

File Organizer MCP v2.1.0 has been security-audited and hardened against common attacks.

### Protected Against

| Attack Type | Protection Mechanism | Status |
| --- | --- | --- |
| **Path Traversal** | Input sanitization + symlink resolution | ✅ Protected |
| **Symlink Attacks** | Real path validation | ✅ Protected |
| **DoS - Memory** | File size limits + streaming | ✅ Protected |
| **DoS - CPU** | File count limits | ✅ Protected |
| **DoS - Recursion** | Depth limits | ✅ Protected |
| **Info Disclosure** | Error message sanitization | ✅ Protected |

### Security Limits
```
MAX_FILE_SIZE: 100 MB     // Files larger than this are skipped during hashing
MAX_FILES: 10,000         // Maximum files processed per operation
MAX_DEPTH: 10             // Maximum directory depth for recursive scans
```

### Security Features

#### 1. Path Validation (Multi-Layer)

* ✅ Path normalization
* ✅ Traversal sequence removal (`../` stripped)
* ✅ Symlink resolution
* ✅ Strict containment checking
* ✅ Works with non-existent files

#### 2. Resource Protection

* ✅ Streaming file operations (64KB chunks)
* ✅ Pre-validation before processing
* ✅ Graceful degradation (skips problematic files)
* ✅ Memory-safe duplicate detection

#### 3. Error Handling

* ✅ All operations wrapped in try-catch
* ✅ Path sanitization in error messages
* ✅ Informative but safe error reporting

### Security Testing

Run the comprehensive security test suite:
```bash
npm test
```

**Tests include:**
* Path traversal attack prevention
* Symlink attack prevention
* Large file handling
* Depth limit enforcement
* File count limit enforcement
* Graceful error handling

---

## 💡 Example Workflows

### Workflow 1: Clean Up Downloads
```
1. "Claude, scan C:/Users/Admin/Downloads"
   → See what you have (1,247 files, 15.3 GB)

2. "Claude, categorize the files"
   → Videos: 234 files (8.2 GB)
   → Documents: 567 files (2.1 GB)
   → Images: 389 files (4.2 GB)
   → Others: 57 files (800 MB)

3. "Claude, find duplicates"
   → Found 45 duplicate groups
   → Wasted space: 2.3 GB

4. "Claude, organize files with dry run"
   → Review planned changes

5. "Claude, organize files"
   → ✅ Organized 1,247 files
   → ✅ Created 8 category folders
```

### Workflow 2: Find Space Hogs
```
1. "Claude, show me the 20 largest files in C:/Users/Admin/Documents"
   → old_backup.zip: 5.2 GB
   → presentation_final_final.pptx: 890 MB
   → video_project.mp4: 1.2 GB

2. "Claude, find duplicates in C:/Users/Admin/Documents"
   → Identify unnecessary copies

3. Delete duplicates manually, then organize
```

---

## 🛠️ API Reference

### Available Tools

#### `list_files`

List all files in a directory with basic information.

**Parameters:**
* `directory` (string, required) - Full path to directory

**Returns:** List of files with names and paths

---

#### `scan_directory`

Detailed directory scan with file information.

**Parameters:**
* `directory` (string, required) - Full path to directory
* `include_subdirs` (boolean, optional) - Include subdirectories (default: false)
* `max_depth` (number, optional) - Maximum depth to scan (default: -1, max: 10)

**Returns:** File list with sizes, dates, extensions, and statistics

---

#### `categorize_by_type`

Group files by category with statistics.

**Parameters:**
* `directory` (string, required) - Full path to directory
* `include_subdirs` (boolean, optional) - Include subdirectories (default: false)

**Returns:** Category breakdown with file counts and sizes

---

#### `find_largest_files`

Find the largest files in a directory.

**Parameters:**
* `directory` (string, required) - Full path to directory
* `include_subdirs` (boolean, optional) - Include subdirectories (default: false)
* `top_n` (number, optional) - Number of files to return (default: 10)

**Returns:** List of largest files sorted by size

---

#### `find_duplicate_files`

Identify duplicate files using SHA-256 content hashing.

**Parameters:**
* `directory` (string, required) - Full path to directory

**Returns:** Duplicate groups with wasted space calculation

**Note:** Files larger than 100MB are automatically skipped with a warning

---

#### `organize_files`

Automatically organize files into categorized folders.

**Parameters:**
* `directory` (string, required) - Full path to directory
* `dry_run` (boolean, optional) - Preview without moving files (default: false)

**Returns:** Organization summary with actions taken and any errors

---

## 🐛 Troubleshooting

### MCP Server Not Showing Up

1. ✅ Check config file path is correct
2. ✅ Verify Node.js v18+ is installed: `node --version`
3. ✅ Restart Claude Desktop completely
4. ✅ Check server path in `claude_desktop_config.json` is absolute

### Permission Errors

1. ✅ **Windows:** Run Claude Desktop as Administrator
2. ✅ **Mac/Linux:** Check folder permissions: `ls -la`
3. ✅ Ensure you have write permissions in target directory

### Files Not Moving

1. ✅ Verify dry_run mode is NOT enabled
2. ✅ Check files aren't locked by other programs
3. ✅ Ensure sufficient disk space
4. ✅ Review error messages in operation summary

---

## 📝 Important Notes

* ⚠️ Organizes files in **root directory only**, not subdirectories
* ⚠️ Existing category folders won't be reorganized (prevents loops)
* ✅ File extensions are case-insensitive
* ✅ Original modification dates are preserved
* ✅ Hidden files (starting with `.`) are automatically skipped
* ✅ Maximum 10,000 files processed per operation (security limit)
* ✅ Maximum 10 directory levels scanned (security limit)

---

## 🔄 Version History

### v2.1.0 (Current) - Security Hardening Release

**Released:** February 1, 2026

**Security Improvements:**
* ✅ Path traversal protection with input sanitization
* ✅ Symlink resolution and validation
* ✅ Memory-safe streaming file operations
* ✅ Resource limits (file size, count, depth)
* ✅ Error message sanitization
* ✅ Comprehensive security test suite

**Changes:**
* Updated `@modelcontextprotocol/sdk` to v1.25.3
* Added security constants (MAX_FILE_SIZE, MAX_FILES, MAX_DEPTH)
* Implemented graceful large file handling
* Added `test_security.js` test suite

**Security Score:** 9.5/10 (improved from 6.5/10)

### v2.0.0 - Initial Release

* Basic file organization functionality
* Duplicate detection
* Category-based sorting
* Dry run mode

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. **Security First** - All changes must maintain or improve security
2. **Test Coverage** - Add tests for new features
3. **Documentation** - Update README for significant changes
4. **Code Style** - Follow existing code style

### Reporting Security Issues

🚨 **Please do NOT open public issues for security vulnerabilities**

Instead, email security concerns to: technocratix902@gmail.com

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

*Built by a 9th grader who chose to spend 5 days automating a 2-hour task. No regrets.*

[⬆ Back to Top](#file-organizer-mcp-server-)
