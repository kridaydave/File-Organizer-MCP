# Changelog

## [3.0.0-beta.1] - 2026-02-02

### 🔒 Security (CRITICAL)
- **FIXED**: Path traversal vulnerability (CVE-pending)
  - Previous versions allowed `../` to access parent directories
  - Now implements 7-layer validation pipeline
  - All paths restricted to current working directory in strict mode
  
### ✨ Added
- New 7-layer path validation system
- Custom error classes (AccessDeniedError, ValidationError)
- Comprehensive security test suite (5/5 passing)
- Forward compatibility for Phase 2 (config system)

### 🔧 Changed
- Updated to v3.0.0 architecture
- Path validation now uses base-validator.js
- Improved error messages with sanitized paths

### ⚠️ Breaking Changes
- **NONE** - Fully backward compatible with v2.x for valid use cases
- Only breaking for invalid use cases (accessing parent directories)

### 📦 Migration from v2.x
No changes needed! All existing workflows continue to work.
If you were using `../` paths (which was a security bug), those now correctly fail.

### 🧪 Testing
- 5/5 critical security tests passing
- All 6 original MCP tools tested and working
- Cross-platform tested (Windows, macOS, Linux)

---

## [2.1.0] - 2026-02-01
(Previous version with path traversal vulnerability - UPGRADE IMMEDIATELY)