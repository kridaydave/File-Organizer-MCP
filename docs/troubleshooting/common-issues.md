# Common Issues and Troubleshooting

This guide covers frequently encountered issues and their resolutions.

---

## Table of Contents

- [Path Validation Errors](#path-validation-errors)
- [Permission Denied](#permission-denied)
- [Duplicate Detection Issues](#duplicate-detection-issues)
- [Watch Directory Problems](#watch-directory-problems)
- [Memory Issues](#memory-issues)
- [Performance Problems](#performance-problems)

---

## Path Validation Errors

### Symptoms

- `PATH_VALIDATION_FAILED` error
- Files not being processed
- Operations failing silently

### Causes

1. Path exceeds maximum length (260 characters on Windows)
2. Forbidden characters in path (`<>:"/\|?*`)
3. Path traversal attempts (`../`)
4. Reserved Windows names (`CON`, `PRN`, `AUX`, etc.)

### Solutions

**Check path length:**

```typescript
const MAX_PATH = 260;
const isValidLength = path.length <= MAX_PATH;
```

**Validate characters:**

```typescript
const forbiddenChars = /[<>:"/\\|?*]/;
const hasForbiddenChars = forbiddenChars.test(path);
```

**Handle path traversal:**

```typescript
const resolved = path.resolve(baseDir, relativePath);
const isWithinBase = resolved.startsWith(baseDir);
```

---

## Permission Denied

### Symptoms

- `FILE_ACCESS_DENIED` error
- Files not moving/deleting
- Watch directories not working

### Causes

1. File is open in another application
2. Insufficient permissions on file/directory
3. Read-only file attribute
4. Antivirus software blocking access

### Solutions

**Check file access:**

```typescript
import * as fs from "fs";

try {
  fs.accessSync(filePath, fs.constants.R_OK | fs.constants.W_OK);
} catch (error) {
  console.error("Permission denied:", error);
}
```

**Handle open files:**

```typescript
async function retryWithDelay(
  operation: () => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (error.code === "EBUSY" && i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
        continue;
      }
      throw error;
    }
  }
}
```

---

## Duplicate Detection Issues

### Symptoms

- Duplicates not being detected
- False positives
- Hash computation taking too long

### Causes

1. Large files taking long to hash
2. Hash collisions (extremely rare)
3. Different files with same size/content

### Solutions

**Use quick checks first:**

```typescript
async function findDuplicates(directory: string): Promise<DuplicateGroup[]> {
  const fileMap = new Map<string, string[]>();

  const files = await scanDirectory(directory);

  // Group by size first (fast)
  const bySize = groupBy(files, (f) => f.size.toString());

  // Only hash files with same size
  const duplicates: DuplicateGroup[] = [];

  for (const [size, sizeFiles] of bySize) {
    if (sizeFiles.length > 1) {
      // Compute hashes for potential duplicates
      const hashes = await Promise.all(
        sizeFiles.map((f) => computeHash(f.path)),
      );

      // Group by hash
      const byHash = groupBy(sizeFiles, (_, i) => hashes[i]);

      for (const [_, hashFiles] of byHash) {
        if (hashFiles.length > 1) {
          duplicates.push({
            hash: _,
            files: hashFiles,
          });
        }
      }
    }
  }

  return duplicates;
}
```

---

## Watch Directory Problems

### Symptoms

- Directory not being watched
- Events not triggering
- High CPU usage

### Causes

1. Too many files in watched directory
2. Cross-device links
3. Watcher not properly initialized

### Solutions

**Limit watch depth:**

```typescript
const watchConfig = {
  maxDepth: 2,
  ignorePatterns: ["node_modules", ".git", "dist"],
};
```

**Use efficient polling:**

```typescript
import * as chokidar from "chokidar";

const watcher = chokidar.watch(directory, {
  usePolling: true,
  interval: 1000,
  binaryInterval: 3000,
  ignored: ["**/node_modules/**", "**/.git/**"],
});
```

---

## Memory Issues

### Symptoms

- Out of memory errors
- Process being killed
- Slow performance with large directories

### Causes

1. Loading all files into memory
2. Large hash computations
3. Memory leaks in watchers

### Solutions

**Use streaming for large files:**

```typescript
async function streamHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);

    stream.on("data", (data) => hash.update(data));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}
```

**Process in batches:**

```typescript
async function processLargeDirectory(
  directory: string,
  batchSize: number = 100,
): Promise<void> {
  const files = await scanDirectory(directory);

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    await processBatch(batch);
    // Allow GC to run
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
```

---

## Performance Problems

### Symptoms

- Slow file operations
- High CPU usage
- Operations timing out

### Causes

1. Not using parallel processing
2. Unnecessary recursive scans
3. Expensive operations in hot paths

### Solutions

**Use parallel processing:**

```typescript
async function parallelProcess<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number = 4,
): Promise<R[]> {
  const results: R[] = [];
  const queue = [...items];

  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()!;
      results.push(await processor(item));
    }
  });

  await Promise.all(workers);
  return results;
}
```

**Cache directory scans:**

```typescript
class DirectoryCache {
  private cache = new Map<string, { data: FileInfo[]; timestamp: number }>();
  private readonly TTL = 30000; // 30 seconds

  async getCached(directory: string): Promise<FileInfo[] | null> {
    const entry = this.cache.get(directory);
    if (entry && Date.now() - entry.timestamp < this.TTL) {
      return entry.data;
    }
    return null;
  }

  set(directory: string, data: FileInfo[]): void {
    this.cache.set(directory, { data, timestamp: Date.now() });
  }
}
```

---

## Getting More Help

If your issue is not covered here:

1. Check the [API Documentation](../API.md)
2. Review the [GitHub Issues](https://github.com/Kilo-Org/File-Organizer-MCP/issues)
3. Open a new issue with:
   - Error message
   - Steps to reproduce
   - Environment (OS, Node version)
   - Relevant configuration
