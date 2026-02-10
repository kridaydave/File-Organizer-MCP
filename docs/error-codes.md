# Error Codes Reference

Complete reference for all error codes returned by File Organizer MCP.

---

## Table of Contents

- [File Operation Errors](#file-operation-errors)
- [Validation Errors](#validation-errors)
- [Security Errors](#security-errors)
- [System Errors](#system-errors)
- [Rate Limiting](#rate-limiting)

---

## File Operation Errors

| Code                  | HTTP Status | Description                         | Resolution                                             |
| --------------------- | ----------- | ----------------------------------- | ------------------------------------------------------ |
| `FILE_NOT_FOUND`      | 404         | File or directory does not exist    | Verify path is correct and file exists                 |
| `FILE_ACCESS_DENIED`  | 403         | Permission denied                   | Check file permissions or run with elevated privileges |
| `FILE_TOO_LARGE`      | 413         | File exceeds size limit             | Use `maxBytes` parameter or split file                 |
| `FILE_IN_USE`         | 423         | File is open in another application | Close the file in other applications                   |
| `FILE_ALREADY_EXISTS` | 409         | Destination file already exists     | Use `conflict_strategy: 'rename'` or delete first      |
| `DIRECTORY_NOT_EMPTY` | 409         | Cannot delete non-empty directory   | Empty directory first or use recursive delete          |
| `INVALID_FILE_TYPE`   | 400         | File type not supported             | Check supported file types in configuration            |

### Example Error Response

```json
{
  "success": false,
  "error": {
    "code": "FILE_NOT_FOUND",
    "message": "File not found: /path/to/file.txt",
    "details": {
      "path": "/path/to/file.txt",
      "attempted": "read"
    }
  }
}
```

---

## Validation Errors

| Code                      | Description                        | Resolution                                     |
| ------------------------- | ---------------------------------- | ---------------------------------------------- | ---- |
| `PATH_VALIDATION_FAILED`  | Path failed security checks        | Ensure path is within allowed directories      |
| `INVALID_PATH_LENGTH`     | Path exceeds maximum length        | Shorten path or use subst drive mapping        |
| `INVALID_PATH_CHARS`      | Path contains forbidden characters | Rename file to remove `<>:\"\/                 | ?\*` |
| `PATH_TRAVERSAL_DETECTED` | Path traversal attempt blocked     | Use relative paths without `../`               |
| `RESERVED_NAME_DETECTED`  | Reserved Windows name used         | Rename file (avoid CON, PRN, AUX, etc.)        |
| `INVALID_ENCODING`        | Unsupported encoding specified     | Use `utf-8`, `base64`, or `binary`             |
| `INVALID_CRON_EXPRESSION` | Invalid cron schedule format       | Use standard cron format (e.g., `*/5 * * * *`) |
| `INVALID_CONFIG_VALUE`    | Configuration value invalid        | Check config schema for valid values           |

### Validation Error Response

```json
{
  "success": false,
  "error": {
    "code": "PATH_VALIDATION_FAILED",
    "message": "Path validation failed at layer: traversal_check",
    "details": {
      "path": "../../etc/passwd",
      "failedLayer": "traversal_check"
    }
  }
}
```

---

## Security Errors

| Code                     | HTTP Status | Description                     | Resolution                                               |
| ------------------------ | ----------- | ------------------------------- | -------------------------------------------------------- |
| `SENSITIVE_FILE_BLOCKED` | 403         | Access to sensitive file denied | Remove file from sensitive patterns or request exception |
| `BLACKLISTED_PATH`       | 403         | Path is blacklisted             | Access from allowlist only                               |
| `QUOTA_EXCEEDED`         | 507         | Storage quota exceeded          | Free up space or increase quota                          |
| `UNAUTHORIZED_ACCESS`    | 401         | Authentication required         | Provide valid credentials                                |
| `INVALID_API_KEY`        | 401         | API key invalid or expired      | Generate new API key                                     |

### Security Error Response

```json
{
  "success": false,
  "error": {
    "code": "SENSITIVE_FILE_BLOCKED",
    "message": "Access to sensitive file blocked",
    "details": {
      "path": "/home/user/.env",
      "reason": "environment_file"
    }
  }
}
```

---

## System Errors

| Code      | Description                       | Resolution                                             |
| --------- | --------------------------------- | ------------------------------------------------------ |
| `ENOMEM`  | Out of memory                     | Increase memory limit or process in smaller batches    |
| `EMFILE`  | Too many open files               | Increase file descriptor limit or close unused handles |
| `ENOSPC`  | No space left on device           | Free disk space                                        |
| `EIO`     | I/O error                         | Check disk health, retry operation                     |
| `EBUSY`   | Resource busy                     | Wait and retry, file may be in use                     |
| `ENOTDIR` | Path component is not a directory | Verify path is a directory                             |
| `ELOOP`   | Too many symbolic links           | Simplify path or remove circular links                 |

---

## Rate Limiting

| Code                  | HTTP Status | Description                 | Resolution                                      |
| --------------------- | ----------- | --------------------------- | ----------------------------------------------- |
| `RATE_LIMIT_EXCEEDED` | 429         | Too many requests           | Wait before retrying (see `Retry-After` header) |
| `QUOTA_EXCEEDED`      | 429         | Hourly/daily quota exceeded | Wait for quota reset or upgrade plan            |

### Rate Limit Response

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded",
    "details": {
      "limit": 120,
      "window": "minute",
      "retryAfter": 30
    }
  }
}
```

---

## Error Code Hierarchy

```
FileOrganizerError
├── FileOperationError
│   ├── FILE_NOT_FOUND
│   ├── FILE_ACCESS_DENIED
│   └── ...
├── ValidationError
│   ├── PATH_VALIDATION_FAILED
│   ├── INVALID_PATH_LENGTH
│   └── ...
├── SecurityError
│   ├── SENSITIVE_FILE_BLOCKED
│   ├── BLACKLISTED_PATH
│   └── ...
└── SystemError
    ├── ENOMEM
    ├── ENOSPC
    └── ...
```

---

## Handling Errors

### TypeScript Error Handling

```typescript
import { FileOrganizerError } from "./errors";

try {
  await organizeFiles({ directory: "/path" });
} catch (error) {
  if (error instanceof FileOrganizerError) {
    switch (error.code) {
      case "FILE_NOT_FOUND":
        // Handle missing file
        break;
      case "RATE_LIMIT_EXCEEDED":
        // Wait and retry
        await sleep(error.details.retryAfter * 1000);
        break;
      default:
        // Handle other errors
        console.error("Unknown error:", error);
    }
  }
}
```

### Retry Logic

```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (error.code === "RATE_LIMIT_EXCEEDED") {
        const waitTime = error.details.retryAfter * 1000;
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      if (attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff for retryable errors
      const retryable = ["FILE_IN_USE", "EBUSY", "EIO"];
      if (retryable.includes(error.code)) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 100),
        );
        continue;
      }

      throw error;
    }
  }
}
```
