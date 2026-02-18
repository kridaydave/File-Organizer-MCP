# Migration Guide: v2.x to v3.0

This guide helps you migrate from File Organizer MCP v2.x to v3.0.

## 🚨 Why Upgrade?

### Critical Security Fix

**v2.1.0 and earlier versions** contain a critical path traversal vulnerability that could expose files outside your working directory.

**v3.0.0** implements a comprehensive 7-layer security validation pipeline that prevents:

- Path traversal attacks
- Symlink attacks
- Resource exhaustion
- Information disclosure

## ⚠️ Breaking Changes: Whitelist Enforcement

**v3.0.0 is Secure by Default.**

Unlike v2.x, which allowed access to almost any directory, v3.0 **blocks access** to all directories unless they are:

1.  In the default whitelist (Desktop, Documents, Downloads, etc.)
2.  Explicitly added to `config.json`

**Action Required:**
If you need to access custom folders (e.g., `D:\MyBackup`), you **MUST** add them to your `config.json`. See [README.md](README.md#custom-configuration) for instructions.

## 📋 Pre-Migration Checklist

Before upgrading, verify:

- [ ] You're not using `../` in file paths (this was a security bug)
- [ ] You're not accessing files outside your working directory
- [ ] Your Node.js version is 18.0.0 or higher
- [ ] You have a backup of important data (recommended)

## 🚀 Migration Steps

### Step 1: Upgrade Package

```bash
# Update to latest version
npm install file-organizer-mcp@latest

# Or for global installation
npm install -g file-organizer-mcp@latest
```

### Step 2: Run Security Tests (Recommended)

```bash
# Verify security protections
npm test

# Expected output:
# Test Suites: 8 passed, 8 total
# Tests:       28 passed, 28 total
```

### Step 3: Update Configuration (If Needed)

Your `claude_desktop_config.json` typically doesn't need changes, but verify the path:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`  
**Mac/Linux:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "file-organizer": {
      "command": "node",
      "args": ["/path/to/node_modules/file-organizer-mcp/dist/index.js"]
    }
  }
}
```

⚠️ **Note:** Path changed from `server.js` to `dist/index.js` in v3.0.

### Step 4: Restart Claude Desktop

```bash
# Completely restart Claude Desktop
# This ensures the new version is loaded
```

### Step 5: Verify Installation

Ask Claude:

```
Hey Claude, scan my Downloads folder
```

If Claude can access the file organizer tools, migration is complete! ✅

## 🔄 What Changed

### New Features in v3.0

#### 1. Enhanced Security

- **8-layer path validation pipeline**
- **Symlink resolution and validation**
- **Resource limits** (file size, count, depth)
- **Error message sanitization**
- **Comprehensive security test suite**

#### 2. Improved Services Architecture

- Service-based architecture with dependency injection
- `PathValidatorService` for all path operations
- `RollbackService` for undo functionality
- `CategorizerService` with custom rules support

#### 3. Better Error Handling

- Structured error messages
- No internal path disclosure
- Graceful degradation for edge cases

#### 4. TypeScript Improvements

- Strict type checking
- Zod schema validation
- ESM modules with `.js` extensions

#### 5. Testing Infrastructure

- Unit tests for all services
- Integration tests for tools
- Performance benchmarks
- Security test suite

### API Changes

#### No Breaking Changes ✅

All v2.x tool calls work identically in v3.0:

```javascript
// v2.x - Still works in v3.0
await scanDirectory({
  directory: "C:/Users/Admin/Downloads",
  include_subdirs: true,
});

// v2.x - Still works in v3.0
await organizeFiles({
  directory: "C:/Users/Admin/Downloads",
  dry_run: true,
});
```

#### Security Enforcement (New Behavior)

```javascript
// ❌ v2.x: This worked but was a security bug
await scanDirectory({
  directory: "C:/Users/Admin/Downloads/../../../Windows",
});

// ✅ v3.0: This now correctly fails with ValidationError
// Error: "Path traversal detected"
```

## 🛠️ Troubleshooting Migration Issues

### Issue: "Cannot find module"

**Symptom:** MCP server fails to start

**Solution:** Update the path in `claude_desktop_config.json` from `server.js` to `dist/index.js`

```json
{
  "args": ["/path/to/file-organizer-mcp/dist/index.js"]
}
```

### Issue: "Path validation failed"

**Symptom:** Previously working paths now fail

**Cause:** You were using path traversal (e.g., `../`)

**Solution:** Use absolute paths or paths within the working directory:

```javascript
// ❌ Don't use parent directory access
directory: "./../../some/path";

// ✅ Use absolute paths
directory: "C:/Users/Admin/Documents";

// ✅ Or relative paths within working directory
directory: "./Documents";
```

### Issue: "Files larger than 100MB skipped"

**Symptom:** Large files not included in duplicate detection

**Cause:** New resource limits prevent memory exhaustion

**Solution:** This is expected behavior for security. Large files are skipped during hashing to prevent DoS attacks.

**Workaround:** If needed, you can scan smaller subsets of files.

### Issue: Tests failing

**Symptom:** `npm test` shows failures

**Cause:** Jest configuration issues on Windows

**Solution:**

```bash
# Clear Jest cache
npx jest --clearCache

# Run tests again
npm test
```

## 📊 Performance Impact

### Expected Performance Changes

| Operation                   | v2.x  | v3.0  | Change                   |
| --------------------------- | ----- | ----- | ------------------------ |
| Path validation             | ~1ms  | ~5ms  | +4ms (security overhead) |
| Directory scan (1000 files) | 500ms | 520ms | +20ms (validation)       |
| Organize files (1000 files) | 2.5s  | 2.6s  | +100ms (rollback)        |
| Duplicate detection         | 3.0s  | 3.1s  | +100ms (validation)      |

**Verdict:** Minimal performance impact (<5%) for significantly improved security.

## 🔐 Security Improvements

### What's Protected Now

| Attack Type     | v2.x          | v3.0         |
| --------------- | ------------- | ------------ |
| Path Traversal  | ❌ Vulnerable | ✅ Protected |
| Symlink Attacks | ❌ Vulnerable | ✅ Protected |
| DoS - Memory    | ⚠️ Partial    | ✅ Protected |
| DoS - CPU       | ⚠️ Partial    | ✅ Protected |
| Info Disclosure | ⚠️ Partial    | ✅ Protected |

### Security Limits

New resource limits in v3.0:

```typescript
MAX_FILE_SIZE: 100 MB      // Files skipped during hashing
MAX_FILES: 10,000          // Per operation
MAX_DEPTH: 10              // Directory recursion
MAX_PATH_LENGTH: 4,096     // Characters
```

## 📝 Code Examples

### Before & After

#### Example 1: Scanning Directories

```javascript
// v2.x - Still works identically in v3.0
const result = await scanDirectory({
  directory: "C:/Users/Admin/Downloads",
  include_subdirs: true,
  max_depth: 5,
});

// No changes needed! ✅
```

#### Example 2: Organizing Files

```javascript
// v2.x - Still works identically in v3.0
const result = await organizeFiles({
  directory: "C:/Users/Admin/Downloads",
  dry_run: false,
});

// No changes needed! ✅
```

#### Example 3: Finding Duplicates

```javascript
// v2.x - Still works identically in v3.0
const result = await findDuplicateFiles({
  directory: "C:/Users/Admin/Documents",
});

// No changes needed! ✅
// Note: Files > 100MB now automatically skipped
```

## 🎯 Recommended Post-Migration Steps

After migrating to v3.0:

1. **Review your workflows** - Ensure no path traversal patterns
2. **Run security tests** - Verify protection mechanisms
3. **Monitor performance** - Check for any unexpected slowdowns
4. **Update documentation** - If you have custom docs, update references
5. **Test edge cases** - Large files, deep directories, etc.

## 📞 Support

### Getting Help

If you encounter issues during migration:

1. **Check this guide** - Most issues are covered here
2. **Review logs** - Check Claude Desktop logs for errors
3. **Run tests** - `npm test` to verify installation
4. **GitHub Issues** - [Report bugs](https://github.com/kridaydave/File-Organizer-MCP/issues)
5. **Email support** - technocratix902@gmail.com

### Reporting Migration Issues

When reporting issues, include:

- v2.x version you're migrating from
- Node.js version (`node --version`)
- Operating system
- Error messages (full stack trace)
- Steps to reproduce

## 📚 Additional Resources

- [README.md](README.md) - Complete documentation
- [ARCHITECTURE.md](ARCHITECTURE.md) - Technical architecture
- [CONTRIBUTING.md](CONTRIBUTING.md) - Contributing guidelines
- [CHANGELOG.md](CHANGELOG.md) - Version history

## ✨ What's Next?

### Planned for Future Versions

- **Custom categorization rules** - UI for defining custom rules
- **Batch operations** - Process multiple directories
- **Cloud storage support** - S3, Google Drive, etc.
- **Advanced duplicate detection** - Fuzzy matching, content similarity
- **Performance mode** - Skip security checks for trusted paths

## 🎉 Migration Complete

If you've followed all steps, you're now running File Organizer MCP v3.0 with enhanced security and reliability.

**Welcome to v3.0!** 🚀

---

**Questions?** Create an issue on [GitHub](https://github.com/kridaydave/File-Organizer-MCP/issues)

**Last Updated:** February 18, 2026 (v3.4.0 release)  
**Version:** 3.4.0
