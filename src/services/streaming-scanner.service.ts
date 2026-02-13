/**
 * File Organizer MCP Server v3.2.0
 * Streaming Scanner Service
 */

import fs from "fs/promises";
import path from "path";
import { FileInfo } from "../types.js";
import { logger } from "../utils/logger.js";

export class StreamingScanner {
  async *scanLarge(
    directory: string,
    options: { batchSize: number } = { batchSize: 100 },
  ): AsyncGenerator<FileInfo[], void, unknown> {
    // Note: fs.readdir(withFileTypes) loads all entries into memory.
    // For TRULY massive dirs, opendir is better.
    const dirHandle = await fs.opendir(directory);

    let batch: FileInfo[] = [];

    try {
      for await (const dirent of dirHandle) {
        if (dirent.isFile()) {
          const fullPath = path.join(directory, dirent.name);
          try {
            const stats = await fs.stat(fullPath);
            batch.push({
              name: dirent.name,
              path: fullPath,
              size: stats.size,
              extension: path.extname(dirent.name),
              created: stats.birthtime,
              modified: stats.mtime,
            });

            if (batch.length >= options.batchSize) {
              yield batch;
              batch = [];
            }
          } catch (e) {
            // Ignore error (access denied etc)
          }
        }
      }
    } finally {
      // BUG-002 FIX: Explicitly close directory handle to prevent resource leaks
      // if generator is abandoned mid-iteration
      try {
        await dirHandle.close();
      } catch (closeErr) {
        // Log but don't throw - we want to preserve original error if any
        logger.error("Failed to close directory handle:", closeErr);
      }
    }

    if (batch.length > 0) {
      yield batch;
    }
  }

  async scanWithProgress(
    directory: string,
    onProgress: (current: number, total: number) => void,
  ): Promise<FileInfo[]> {
    // Note: To get 'total' we usually need to read all dirents first.
    // So this is trade-off.
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = entries.filter((e) => e.isFile());
    const total = files.length;

    const results: FileInfo[] = [];

    for (let i = 0; i < files.length; i++) {
      const entry = files[i];
      if (!entry) continue;

      const fullPath = path.join(directory, entry.name);
      try {
        const stats = await fs.stat(fullPath);
        results.push({
          name: entry.name,
          path: fullPath,
          size: stats.size,
          extension: path.extname(entry.name),
          created: stats.birthtime,
          modified: stats.mtime,
        });
      } catch {}

      onProgress(i + 1, total);
    }

    return results;
  }
}
