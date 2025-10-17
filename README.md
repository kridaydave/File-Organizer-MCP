# File Organizer MCP Server 🗂️

A powerful Model Context Protocol (MCP) server that automatically organizes files into categorized folders with duplicate detection capabilities.

## 🎯 Features

- **Auto-categorization**: Organizes files into 12+ categories (Executables, Videos, Documents, etc.)
- **Duplicate Detection**: Finds duplicate files based on content hash
- **Smart File Management**: Handles filename conflicts automatically
- **Dry Run Mode**: Preview changes before executing
- **Comprehensive Scanning**: Analyze directories with detailed statistics
- **Largest Files Finder**: Identify space hogs quickly

## 📦 Installation

### Step 1: Create Project Directory

```bash
mkdir file-organizer-mcp
cd file-organizer-mcp
```

### Step 2: Save Files

1. Save `server.js` (the main MCP server)
2. Save `package.json`

### Step 3: Install Dependencies

```bash
npm install
```

### Step 4: Configure Claude Desktop

**Windows**: Edit `%APPDATA%\Claude\claude_desktop_config.json`
**Mac**: Edit `~/Library/Application Support/Claude/claude_desktop_config.json`

Add this configuration:

```json
{
  "mcpServers": {
    "file-organizer": {
      "command": "node",
      "args": [
        "C:/path/to/your/file-organizer-mcp/server.js"
      ]
    }
  }
}
```

Replace `C:/path/to/your/file-organizer-mcp/server.js` with the actual path.

### Step 5: Restart Claude Desktop

Close and reopen Claude Desktop for the changes to take effect.

## 🚀 Usage

### 1. Scan Directory

```
Hey Claude, scan my Downloads folder: C:/Users/Admin/Downloads
```

This will show you:
- Total files
- Total size
- File details with sizes and dates

### 2. Categorize Files

```
Hey Claude, categorize files in C:/Users/Admin/Downloads
```

Output example:
```
Executables - 12 files (45 MB)
Videos - 24 files (2.3 GB)
Presentations - 37 files (156 MB)
Documents - 89 files (234 MB)
```

### 3. Find Duplicates

```
Hey Claude, find duplicate files in C:/Users/Admin/Downloads
```

Shows duplicate file groups and wasted space.

### 4. Find Largest Files

```
Hey Claude, show me the 20 largest files in C:/Users/Admin/Downloads
```

### 5. Organize Files (DRY RUN)

```
Hey Claude, organize files in C:/Users/Admin/Downloads but do a dry run first
```

This will show what would happen without actually moving files.

### 6. Organize Files (ACTUAL)

```
Hey Claude, organize files in C:/Users/Admin/Downloads
```

This will:
1. Create category folders (Executables, Videos, Presentations, etc.)
2. Move files into their respective folders
3. Handle duplicate filenames (adds _1, _2, etc.)
4. Show summary with file counts per category
5. Clean up empty folders

## 📁 File Categories

The organizer sorts files into these categories:

- **Executables**: .exe, .msi, .bat, .cmd, .sh
- **Videos**: .mp4, .avi, .mkv, .mov, .wmv, .flv, .webm, .m4v
- **Documents**: .pdf, .doc, .docx, .txt, .rtf, .odt
- **Presentations**: .ppt, .pptx, .odp, .key
- **Spreadsheets**: .xls, .xlsx, .csv, .ods
- **Images**: .jpg, .jpeg, .png, .gif, .bmp, .svg, .ico, .webp
- **Audio**: .mp3, .wav, .flac, .aac, .ogg, .wma, .m4a
- **Archives**: .zip, .rar, .7z, .tar, .gz, .bz2, .xz
- **Code**: .py, .js, .ts, .java, .cpp, .c, .html, .css, .php, .rb, .go, .json
- **Installers**: .dmg, .pkg, .deb, .rpm, .apk
- **Ebooks**: .epub, .mobi, .azw, .azw3
- **Fonts**: .ttf, .otf, .woff, .woff2
- **Others**: Everything else

## 🛠️ Available Tools

### `list_files`
List all files in a directory with basic information.

### `scan_directory`
Detailed scan with file sizes, dates, and extensions.
- `include_subdirs`: Include subdirectories
- `max_depth`: Limit scan depth

### `categorize_by_type`
Group files by category with statistics.

### `find_largest_files`
Find the biggest files.
- `top_n`: Number of files to return (default: 10)

### `find_duplicate_files`
Identify duplicate files using content hash.

### `organize_files`
Auto-organize files into categorized folders.
- `dry_run`: Preview without moving files

## 💡 Example Workflow

```
1. "Claude, scan C:/Users/Admin/Downloads"
   → See what you have

2. "Claude, categorize the files"
   → See breakdown by type

3. "Claude, find duplicates"
   → Identify wasted space

4. "Claude, organize files with dry run"
   → Preview the organization

5. "Claude, organize files"
   → Actually organize everything!
```

## ⚠️ Safety Features

- **Dry run mode**: Always test before organizing
- **Duplicate handling**: Never overwrites files
- **Error reporting**: Clear error messages
- **Empty folder cleanup**: Removes unused category folders

## 🐛 Troubleshooting

**MCP server not showing up?**
- Check the config file path
- Make sure Node.js is installed (v18+)
- Restart Claude Desktop
- Check the path in `claude_desktop_config.json` is correct

**Permission errors?**
- Run as administrator (Windows)
- Check folder permissions

**Files not moving?**
- Make sure files aren't in use by other programs
- Check if you have write permissions

## 📝 Notes

- The server only organizes files in the **root directory**, not in subdirectories
- Existing category folders won't be reorganized
- File extensions are case-insensitive
- Original modification dates are preserved

## 🎉 Success Example

Before:
```
Downloads/
├── setup.exe
├── movie.mp4
├── presentation.pptx
├── document.pdf
└── 247 other files...
```

After organizing:
```
Downloads/
├── Executables/
│   └── setup.exe
├── Videos/
│   └── movie.mp4
├── Presentations/
│   └── presentation.pptx
└── Documents/
    └── document.pdf
```

---

**Happy Organizing! 🎯**