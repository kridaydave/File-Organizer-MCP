/**
 * File Organizer MCP Server v3.4.1
 * File Scanner Service
 */

import fs from "fs/promises";
import path from "path";
import type { FileInfo, FileWithSize, ScanOptions } from "../types.js";
import { ValidationError } from "../types.js";
import { CONFIG, SKIP_DIRECTORIES } from "../config.js";
import { logger } from "../utils/logger.js";
import { isErrnoException } from "../utils/error-handler.js";

/**
 * File Scanner Service - core scanning logic
 */
export class FileScannerService {
  private readonly maxFiles: number;
  private readonly maxDepth: number;

  constructor(
    maxFiles = CONFIG.security.maxFilesPerOperation,
    maxDepth = CONFIG.security.maxScanDepth,
  ) {
    this.maxFiles = maxFiles;
    this.maxDepth = maxDepth;
  }

  /**
   * Scan directory for files with full metadata
   * @param directory - Directory path to scan
   * @param options - Scan options including includeSubdirs and maxDepth
   * @throws ValidationError if maxDepth is invalid (must be -1 or 0-50)
   */
  async scanDirectory(
    directory: string,
    options: ScanOptions = {},
  ): Promise<FileInfo[]> {
    const { includeSubdirs = false, maxDepth = -1 } = options;

    // Validate maxDepth: -1 for unlimited, or 0-50 for bounded recursion
    if (maxDepth !== -1 && (maxDepth < 0 || maxDepth > 50)) {
      throw new ValidationError(
        `Invalid maxDepth: ${maxDepth}. Must be -1 (unlimited) or between 0 and 50 (inclusive).`,
      );
    }

    const results: FileInfo[] = [];
    await this.scanDir(
      directory,
      results,
      includeSubdirs,
      maxDepth,
      0,
      new Set(),
    );
    return results;
  }

  /**
   * Get all files with basic info (name, path, size)
   */
  async getAllFiles(
    directory: string,
    includeSubdirs = false,
    maxDepth?: number,
  ): Promise<FileWithSize[]> {
    const results: FileWithSize[] = [];
    const effectiveMaxDepth = maxDepth !== undefined ? maxDepth : this.maxDepth;

    const scanDir = async (
      dir: string,
      depth: number,
      visited: Set<string>,
    ): Promise<void> => {
      // Stop recursion if depth limit reached
      // maxDepth of -1 means unlimited depth, so depth > -1 would always be false
      // maxDepth of 0 means no subdirectories, only process current directory
      if (
        includeSubdirs &&
        effectiveMaxDepth !== -1 &&
        depth > effectiveMaxDepth
      ) {
        return;
      }

      try {
        const realPath = await fs.realpath(dir);
        if (visited.has(realPath)) return;
        visited.add(realPath);
      } catch {
        // Add original path to visited even if realpath fails
        visited.add(dir);
      }

      let items;
      try {
        items = await fs.readdir(dir, { withFileTypes: true });
      } catch (error) {
        if (isErrnoException(error)) {
          if (
            error.code === "EACCES" ||
            error.code === "EPERM" ||
            error.code === "ENOENT"
          )
            return;
        }
        throw error;
      }

      for (const item of items) {
        if (item.name.startsWith(".")) continue;
        if (
          SKIP_DIRECTORIES.includes(
            item.name as (typeof SKIP_DIRECTORIES)[number],
          )
        )
          continue;

        const fullPath = path.join(dir, item.name);

        try {
          if (item.isFile()) {
            // Security: Open with O_NOFOLLOW to avoid symlinks and race conditions
            // Use usage of file handle for stat
            let handle: fs.FileHandle | undefined;
            let statError: Error | undefined;
            try {
              // We use O_RDONLY | O_NOFOLLOW
              handle = await fs.open(
                fullPath,
                fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
              );
              const stats = await handle.stat();

              // Check limit BEFORE pushing to results
              if (results.length >= this.maxFiles) {
                throw new Error(
                  `Maximum file limit (${this.maxFiles}) reached`,
                );
              }

              results.push({
                name: item.name,
                path: fullPath,
                size: stats.size,
                modified: stats.mtime,
              });
            } catch (error) {
              // BUG-003 FIX: Store error instead of throwing to ensure finally executes
              if (isErrnoException(error)) {
                if (
                  error.code === "ELOOP" ||
                  error.code === "EACCES" ||
                  error.code === "EPERM" ||
                  error.code === "EBUSY"
                ) {
                  // Skip file silently
                } else {
                  statError = error;
                }
              } else {
                statError =
                  error instanceof Error ? error : new Error(String(error));
              }
            } finally {
              // BUG-003 FIX: Always close handle, wrapped in try-catch
              if (handle) {
                try {
                  await handle.close();
                } catch {
                  // Ignore close errors
                }
              }
            }

            // Now throw the error after cleanup if needed
            if (statError) {
              throw statError;
            }
          } else if (item.isDirectory() && includeSubdirs) {
            await scanDir(fullPath, depth + 1, visited);
          }
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.includes("Maximum file limit")
          )
            throw error;

          if (isErrnoException(error)) {
            if (error.code === "EACCES" || error.code === "ENOENT") continue;
          }
        }
      }
    };

    await scanDir(directory, 0, new Set());
    return results;
  }

  /**
   * Recursively scan directory contents
   * @param dir - Directory path to scan
   * @param results - Array to accumulate file information
   * @param includeSubdirs - Whether to include subdirectories in scan
   * @param maxDepth - Maximum recursion depth (-1 for unlimited)
   * @param currentDepth - Current recursion depth (internal use)
   * @param visited - Set of resolved real paths to prevent circular symlink traversal
   * @example
   * ```ts
   * const results: FileInfo[] = [];
   * await scanner.scanDir(
   *   '/path/to/scan',
   *   results,
   *   true,
   *   5,
   *   0,
   *   new Set()
   * );
   * // Note: visited Set is updated during scan to detect cycles
   * ```
   * @returns Promise<void>
   */
  private async scanDir(
    dir: string,
    results: FileInfo[],
    includeSubdirs: boolean,
    maxDepth: number,
    currentDepth: number,
    visited: Set<string>,
  ): Promise<void> {
    // Enforce limits
    if (maxDepth !== -1 && currentDepth > maxDepth) return;
    if (currentDepth > this.maxDepth) {
      logger.warn(`Max depth ${this.maxDepth} reached at ${dir}`);
      return;
    }

    // Detect loops using realpath
    try {
      const realPath = await fs.realpath(dir);
      if (visited.has(realPath)) {
        logger.warn(`Circular symlink detected at ${dir}, skipping`);
        return;
      }
      visited.add(realPath);
    } catch (error) {
      // Add original path to visited even if realpath fails
      visited.add(dir);
      logger.debug(`Could not resolve realpath for ${dir}: ${error}`);
    }

    let items;
    try {
      items = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (isErrnoException(error)) {
        if (error.code === "EACCES" || error.code === "EPERM") {
          logger.warn(`Permission denied at ${dir}, skipping`);
          return;
        }
        if (error.code === "ENOENT") {
          // Directory disappeared
          return;
        }
      }
      throw error;
    }

    for (const item of items) {
      if (item.name.startsWith(".")) continue;
      if (
        SKIP_DIRECTORIES.includes(
          item.name as (typeof SKIP_DIRECTORIES)[number],
        )
      )
        continue;

      const fullPath = path.join(dir, item.name);

      try {
        if (item.isFile()) {
          // Security: Open with O_NOFOLLOW to avoid symlinks and race conditions
          let handle: fs.FileHandle | undefined;
          let statError: Error | undefined;
          try {
            handle = await fs.open(
              fullPath,
              fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
            );
            const stats = await handle.stat();

            // Check limit BEFORE pushing to results
            if (results.length >= this.maxFiles) {
              throw new Error(`Maximum file limit (${this.maxFiles}) reached`);
            }

            results.push({
              name: item.name,
              path: fullPath,
              size: stats.size,
              extension: path.extname(item.name),
              created: stats.birthtime,
              modified: stats.mtime,
            });
          } catch (error) {
            // BUG-003 FIX: Store error instead of throwing to ensure finally executes
            // Skip if symlink or access denied
            if (isErrnoException(error)) {
              if (
                error.code === "ELOOP" ||
                error.code === "EACCES" ||
                error.code === "EPERM" ||
                error.code === "EBUSY"
              ) {
                // Skip file silently
              } else {
                statError = error;
              }
            } else {
              statError =
                error instanceof Error ? error : new Error(String(error));
            }
          } finally {
            // BUG-003 FIX: Always close handle, wrapped in try-catch
            if (handle) {
              try {
                await handle.close();
              } catch {
                // Ignore close errors
              }
            }
          }

          // Now throw the error after cleanup if needed
          if (statError) {
            throw statError;
          }
        } else if (item.isDirectory() && includeSubdirs) {
          await this.scanDir(
            fullPath,
            results,
            includeSubdirs,
            maxDepth,
            currentDepth + 1,
            visited,
          );
        }
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("Maximum file limit")
        )
          throw error;

        // Ignore individual file access errors (race condition or permission)
        if (isErrnoException(error)) {
          if (
            error.code === "EACCES" ||
            error.code === "EPERM" ||
            error.code === "ENOENT" ||
            error.code === "EINVAL"
          ) {
            continue;
          }
        }
        logger.error(
          `Error processing ${fullPath}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
