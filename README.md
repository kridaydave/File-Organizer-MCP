# File Organizer MCP Server

**Version:** 3.4.2 | **MCP Protocol:** 2024-11-05 | **Node:** ≥18.0.0

**New in v3.3.0 - Smart Organization:**

- **`organize_smart`** - Auto-detects and organizes mixed folders (music, photos, documents)
- **`organize_music`** - Music by Artist/Album structure with ID3 metadata
- **`organize_photos`** - Photos by EXIF date with GPS stripping
- **`organize_by_content`** - Documents by topic extraction
- **`batch_read_files`** - Read multiple files efficiently

**Previous v3.2.8:**

- Enhanced metadata extraction, security screening, and metadata cache system

[Why Specialized Tools](#why-specialized-tools) • [Quick Start](#quick-start) • [Features](#features) • [Tools](#tools-reference) • [Examples](#example-workflows) • [API](API.md) • [Security](#security-configuration) • [Architecture](ARCHITECTURE.md)

---

[![npm version](https://img.shields.io/badge/npm-v3.4.2-blue.svg)](https://www.npmjs.com/package/file-organizer-mcp)
[![npm downloads](https://img.shields.io/npm/dm/file-organizer-mcp.svg)](https://www.npmjs.com/package/file-organizer-mcp)
[![Security](https://img.shields.io/badge/security-hardened-green.svg)](https://github.com/kridaydave/File-Organizer-MCP)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-1194%20passing-success.svg)](tests/)

> A powerful, security-hardened Model Context Protocol (MCP) server for intelligent file organization.

---

## Why File Organizer MCP?

Traditional filesystem MCP servers provide primitive tools: `read`, `write`, `make`, `delete`. When an AI organizes folders using only these tools, it results in:

1. **Complexity** - AI must plan multiple steps for every move and rename.
2. **Token Inefficiency** - Describing every operation consumes significant context.
3. **Risk of Hallucination** - Increased steps increase the probability of errors.
4. **Latency** - Each primitive operation requires independent reasoning.

### The Solution

We provide high-level, atomic tools that encapsulate complex file operations:

| Primitive Approach | File Organizer MCP |
| --- | --- |
| Multiple `read`/`write`/`rename` calls | `organize_files()` - Atomic execution |
| 50+ reasoning steps | 1 reasoning step |
| High token usage | Minimal token usage |
| Error-prone | Rollback-safe operations |

[Install from MCP Registry](https://registry.modelcontextprotocol.io/servers/io.github.kridaydave/file-organizer) • [View on NPM](https://www.npmjs.com/package/file-organizer-mcp) • [Report Issues](https://github.com/kridaydave/File-Organizer-MCP/issues)

---

## Quick Start

### One-Command Setup

Run the following command to start the interactive setup:

```bash
npx file-organizer-mcp --setup
```

The wizard will:
- Auto-detect installed AI clients (Claude Desktop, Cursor, Windsurf, Cline, etc.).
- Configure clients automatically.
- Guide you through folder selection and preferences.

### Requirements
- Node.js 18+

### Common Commands
Once configured, you can ask your AI:
- "Organize my Downloads folder"
- "Find duplicate files in my Documents"
- "Show me my largest files"

### Installation Methods

| Method | Command | Use Case |
| --- | --- | --- |
| **npx** | `npx file-organizer-mcp --setup` | Occasional use / Trial |
| **Global** | `npm install -g file-organizer-mcp` | Regular use / Faster startup |

---

## Features

- **Categorization** - Intelligent sorting into 12+ categories.
- **Scheduling** - Cron-based automatic organization.
- **Duplicate Detection** - Content hashing (SHA-256) for precise identification.
- **Metadata Extraction** - EXIF for photos, ID3 for music, and document topic extraction.
- **Smart Organization** - Unified strategy detecting mixed file types.
- **Safe Operations** - Dry-run mode, rollback support, and atomic moves.
- **Security** - TOCTOU mitigation, path traversal protection, and metadata scrubbing.
- **Multi-Platform** - Native support for Windows, macOS, and Linux.

---

## Tools Reference

### Core Tools

#### `file_organizer_scan_directory`
Scan directory with detailed file information.
- `directory` (required): Full path to directory.
- `include_subdirs` (optional): Recursive scan.

#### `file_organizer_read_file`
Secure file reading with 8-layer validation.
- `path` (required): Absolute path.
- `encoding` (optional): utf-8, base64, or binary.

#### `file_organizer_organize_smart`
Unified tool that handles music, photos, and documents automatically using the best strategy for each.

#### `file_organizer_batch_rename`
Rename multiple files using patterns, regex, or numbering.

#### `file_organizer_undo_last_operation`
Reverse previous organization actions.

---

## File Categories

| Category | Typical Extensions |
| --- | --- |
| **Executables** | `.exe`, `.msi`, `.bat`, `.sh` |
| **Videos** | `.mp4`, `.avi`, `.mkv`, `.mov` |
| **Documents** | `.pdf`, `.doc`, `.docx`, `.txt`, `.md` |
| **Images** | `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp` |
| **Audio** | `.mp3`, `.wav`, `.flac`, `.m4a` |
| **Archives** | `.zip`, `.rar`, `.7z`, `.tar.gz` |
| **Code** | `.py`, `.js`, `.ts`, `.java`, `.go`, `.json` |

---

## Example Workflows

### Intelligent Downloads Cleanup
1. **Scan** -> Review file distribution and space usage.
2. **Analyze** -> Identify duplicates and obsolete files.
3. **Execute** -> Atomic organization into categorized folders.
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

### Workflow 5: Music Organization

```
User: "Claude, organize my music folder at C:/Users/[YOUR_USERNAME]/Music"

Claude:
1. Scans directory → Shows 456 music files, 2.3 GB
2. Extracts metadata → Reads ID3 tags for artist, album, and title
3. Previews organization → Shows planned structure: Artist/Album/Title.mp3
4. Asks for confirmation
5. Organizes files → ✅ Organized 456 music files into 32 artist folders

Result: Music files organized by Artist/Album/Title structure using ID3 metadata

Before:
├── Downloads/
│   ├── song1.mp3
│   ├── track02.mp3
│   └── music_file.mp3

After:
├── Music/
│   ├── Coldplay/
│   │   ├── A Rush of Blood to the Head/
│   │   │   ├── Clocks.mp3
│   │   │   └── The Scientist.mp3
│   └── Radiohead/
│       ├── OK Computer/
│       │   ├── Paranoid Android.mp3
│       │   └── Karma Police.mp3
```

---

### Workflow 6: Photo Organization

```
User: "Claude, organize my photos at C:/Users/[YOUR_USERNAME]/Pictures"

Claude:
1. Scans directory → Shows 1,234 photos, 4.5 GB
2. Extracts EXIF metadata → Reads date taken from EXIF tags
3. Previews organization → Shows planned structure: YYYY/MM/DD
4. Asks for confirmation
5. Organizes files → ✅ Organized 1,234 photos into date-based folders

Result: Photos organized by capture date (YYYY/MM/DD) using EXIF metadata

Before:
├── Pictures/
│   ├── IMG_001.jpg
│   ├── photo123.png
│   └── DSC_4567.raw

After:
├── Pictures/
│   ├── 2023/
│   │   ├── 12/
│   │   │   ├── 25/
│   │   │   │   ├── IMG_001.jpg
│   │   │   └── 31/
│   │   │       └── photo123.png
│   └── 2024/
│       ├── 01/
│       │   └── 15/
│       │       └── DSC_4567.raw
```

---

### Workflow 7: Security Screening with Metadata

```
User: "Claude, scan my Documents folder for security issues"

Claude:
1. Scans directory → Shows 567 documents, 1.2 GB
2. Extracts metadata → Reads file metadata and content signatures
3. Performs security screening →
   - Found 3 files with sensitive metadata
   - Found 1 file with potentially malicious content
4. Shows detailed report →
   - "report.pdf" contains EXIF GPS coordinates
   - "resume.docx" contains personal identification information
5. Suggests actions → Redact metadata, quarantine file

Result: Comprehensive security scan with metadata-based threat detection
```

---

### Workflow 8: Set Up Automatic Organization

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

#### 💾 External Drives & Network Mounts

By default, for security reasons, you cannot add paths outside your home directory. If you need to access external volumes (like `/Volumes/My Drive` on macOS or `/media/user/usb` on Linux), you must explicitly opt-in by adding `"allowExternalVolumes": true`:

```json
{
  "allowExternalVolumes": true,
  "customAllowedDirectories": [
    "/Volumes/MyExternalDrive",
    "/Volumes/Photography Backup"
  ]
}
```

_(Note: Windows drive letters like `D:\` work out of the box and do not require this flag.)_

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

## Technical Stack 🛠️

File Organizer MCP is built with modern web technologies and follows strict security practices:

### Core Dependencies

- **MCP Server:** `@modelcontextprotocol/sdk` - Model Context Protocol implementation
- **Security:** Zod schema validation, path traversal protection
- **Metadata Extraction:**
  - `music-metadata` - ID3 tag extraction for audio files
  - `exif-parser` - EXIF metadata extraction for images
- **Scheduling:** `node-cron` - Cron-based schedule management
- **Interactive UI:** Ink + React - Terminal user interface
- **Prompts:** `@inquirer/prompts` - Interactive CLI prompts
- **Utilities:** Chalk (color), minimatch (glob patterns)

### Security Features

- **8-layer path validation** - Blocks traversal attacks and URI encoding tricks
- **Sensitive file detection** - Blocks access to .env, .ssh, passwords, keys
- **Rate limiting** - 120 requests/minute, 2000 requests/hour
- **TOCTOU protection** - File descriptor-based operations
- **Metadata security** - Redact sensitive metadata (GPS, personal info)

### Performance Optimizations

- **Metadata caching** - 7-day cache with file hash validation
- **Parallel processing** - Configurable concurrency for batch operations
- **Stream processing** - Handles large files without memory issues
- **Memory limits** - Prevents excessive resource consumption

---

## Architecture 🏗️

### Screen-Then-Enrich Architecture

The File Organizer MCP server implements a "Screen-Then-Enrich" architecture for secure and efficient file operations:

```
┌───────────────────────────────────────────────────────────┐
│                     MCP Client (LLM)                      │
└─────────────────────────┬─────────────────────────────────┘
                           │ JSON-RPC 2.0
┌─────────────────────────▼─────────────────────────────────┐
│                    MCP Server Layer                        │
│  (server.ts - Protocol Handler)                            │
└─────────────────────────┬─────────────────────────────────┘
                           │
┌─────────────────────────▼─────────────────────────────────┐
│                     Security Screening                     │
│  - Path validation & containment checks                    │
│  - Sensitive file detection                                │
│  - Rate limiting                                           │
└─────────────────────────┬─────────────────────────────────┘
                           │
┌─────────────────────────▼─────────────────────────────────┐
│                   Metadata Enrichment                      │
│  - EXIF extraction for images (camera, date, GPS)          │
│  - ID3 extraction for audio (artist, album, title)         │
│  - Document metadata (PDF, DOCX properties)                │
└─────────────────────────┬─────────────────────────────────┘
                           │
┌─────────────────────────▼─────────────────────────────────┐
│                    Services Layer                           │
│  ┌────────────┬──────────────┬─────────────┬──────────┐    │
│  │ Path       │ Organizer    │ Hash        │ Scanner  │    │
│  │ Validator  │ Service      │ Calculator  │ Service  │    │
│  └────────────┴──────────────┴─────────────┴──────────┘    │
└─────────────────────────┬─────────────────────────────────┘
                           │
┌─────────────────────────▼─────────────────────────────────┐
│                    File System                               │
└───────────────────────────────────────────────────────────┘
```

### Key Architecture Principles

1. **Security First** - Multi-layer validation before any file operations
2. **Metadata-Driven** - Content-aware organization using extracted metadata
3. **Caching Strategy** - 7-day metadata cache with file hash validation
4. **Batch Processing** - Configurable concurrency for large operations
5. **Atomic Operations** - Safe file operations with rollback support

---

## API Documentation 📚

### New Metadata APIs

#### `file_organizer_inspect_metadata`

**Description:** Extracts comprehensive metadata from files with privacy controls

**Parameters:**

- `file`: string (required) - Full path to the file
- `response_format`: 'json' | 'markdown' (optional, default: 'markdown')

**Returns:**

- For images: EXIF data (camera, date, dimensions, ISO, aperture)
- For audio: ID3 tags (artist, album, title, year, genre)
- For documents: file properties

#### Metadata Cache System

**Configuration:**

```json
{
  "metadataCache": {
    "enabled": true,
    "maxAge": 604800000, // 7 days in ms
    "maxEntries": 10000,
    "cacheDir": ".cache"
  }
}
```

**Cache Stats:**

```typescript
// Get cache statistics
const stats = await getCacheStats();
// {
//   totalEntries: 1500,
//   audioEntries: 800,
//   imageEntries: 700,
//   cacheSize: 256000
// }
```

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
