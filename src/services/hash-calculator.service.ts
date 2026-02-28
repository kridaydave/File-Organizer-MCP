/**
 * File Organizer MCP Server v3.4.1
 * Hash Calculator Service
 */

import fs from "fs/promises";
import { createReadStream, type ReadStream } from "fs";
import { pipeline } from "stream/promises";
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
   * Accepts path string or FileHandle
   */
  async calculateHash(
    fileInput: string | fs.FileHandle,
    options: { timeoutMs?: number } = {},
  ): Promise<string> {
    const timeoutMs = options.timeoutMs ?? 60000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let size: number;
    let stream: ReadStream | undefined;

    try {
      if (typeof fileInput === "string") {
        const stats = await fs.stat(fileInput);
        size = stats.size;
        stream = createReadStream(fileInput, { highWaterMark: 64 * 1024 });
      } else {
        const stats = await fileInput.stat();
        size = stats.size;
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

      const hash = crypto.createHash("sha256");

      await pipeline(stream, hash, { signal: controller.signal });

      return hash.digest("hex");
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Hash calculation timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      if (stream && !stream.destroyed) {
        stream.destroy();
        await new Promise<void>((resolve) => {
          stream!.once("close", () => resolve());
          setTimeout(() => resolve(), 100);
        });
      }
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
