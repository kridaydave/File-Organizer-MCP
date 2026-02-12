/**
 * File Organizer MCP Server v3.2.0
 * Hash Calculator Service
 */

import fs from "fs/promises";
import { createReadStream, type ReadStream } from "fs";
import crypto from "crypto";
import type { FileWithSize, DuplicateGroup } from "../types.js";
import { CONFIG } from "../config.js";
import { formatBytes } from "../utils/formatters.js";
import { logger } from "../utils/logger.js";

/**
 * Hash Calculator Service - file hashing and duplicate detection
 */
export class HashCalculatorService {
  private readonly maxFileSize: number;

  constructor(maxFileSize = 100 * 1024 * 1024) {
    // 100MB default
    this.maxFileSize = maxFileSize;
  }

  /**
   * Calculate SHA-256 hash of a file
   */
  /**
   * Calculate SHA-256 hash of a file
   * Accepts path string or FileHandle
   */
  async calculateHash(fileInput: string | fs.FileHandle): Promise<string> {
    let size: number;
    let stream: ReadStream;
    let handleToClose: fs.FileHandle | undefined;

    try {
      if (typeof fileInput === "string") {
        const stats = await fs.stat(fileInput);
        size = stats.size;
        stream = createReadStream(fileInput, { highWaterMark: 64 * 1024 });
      } else {
        const stats = await fileInput.stat();
        size = stats.size;
        // createReadStream from handle
        // IMPORTANT: autoClose: false to prevent closing the FD, as caller owns the handle
        stream = fileInput.createReadStream({
          start: 0,
          highWaterMark: 64 * 1024,
          autoClose: false,
        });
      }

      if (size > this.maxFileSize) {
        throw new Error(
          `File exceeds maximum size for hashing (${formatBytes(this.maxFileSize)})`,
        );
      }

      return new Promise((resolve, reject) => {
        const hash = crypto.createHash("sha256");

        stream.on("data", (chunk: string | Buffer) => {
          hash.update(chunk);
        });

        stream.on("end", () => resolve(hash.digest("hex")));

        stream.on("error", (error: Error) => {
          stream.destroy();
          reject(error);
        });
      });
    } finally {
      // If we opened the file internally (string input), stream auto-closes fd?
      // createReadStream(path) auto-closes.
      // createReadStream(handle) does NOT auto-close the handle usually?
      // Actually we don't own the handle if passed in. We should NOT close it.
      // The caller owns the handle.
    }
  }

  /**
   * Find duplicate files based on content hash
   */
  async findDuplicates(
    files: FileWithSize[],
    options: { timeoutMs?: number } = {},
  ): Promise<DuplicateGroup[]> {
    const hashMap: Record<string, FileWithSize[]> = {};
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs ?? 30000; // 30s default timeout

    for (const file of files) {
      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(
          `Duplicate analysis timed out after ${timeoutMs}ms. Processed ${Object.keys(hashMap).length} files.`,
        );
      }

      try {
        if (file.size > this.maxFileSize) {
          logger.warn(
            `Skipping large file: ${file.name} (${formatBytes(file.size)})`,
          );
          continue;
        }

        const hash = await this.calculateHash(file.path);
        if (!hashMap[hash]) {
          hashMap[hash] = [];
        }
        hashMap[hash].push(file);
      } catch (error) {
        logger.error(`Error hashing ${file.name}: ${(error as Error).message}`);
      }
    }

    // Filter only duplicates and format
    return Object.entries(hashMap)
      .filter(([_, group]) => group.length > 1)
      .map(([hash, group]) => ({
        hash,
        count: group.length,
        size: formatBytes(group[0]?.size ?? 0),
        size_bytes: group[0]?.size ?? 0,
        files: group.map((f) => ({
          name: f.name,
          path: f.path,
          size: f.size,
          modified: f.modified,
        })),
      }));
  }
}
