/**
 * File Organizer MCP Server v5.0.0
 * Hash Calculator Service
 */

import fs from "fs/promises";
import { createReadStream, type ReadStream } from "fs";
import { pipeline } from "stream/promises";
import crypto from "crypto";
import type {
  FileWithSize,
  DuplicateGroup,
  DuplicateScan,
  SkippedFile,
} from "../../types.js";
import { MAX_FILE_SIZE } from "../../config.js";
import { formatBytes } from "../../utils/formatters.js";
import { logger } from "../../utils/logger.js";

/**
 * Hash Calculator Service - file hashing and duplicate detection
 */
export class HashCalculatorService {
  private readonly maxFileSize: number;

  constructor(maxFileSize = MAX_FILE_SIZE) {
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
        throw new Error(`Hash calculation timed out after ${timeoutMs}ms`, {
          cause: error,
        });
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
   * Find duplicate files based on content hash.
   *
   * Files that cannot be compared are NOT dropped silently: every one is
   * returned in `skipped` with a reason, so callers can tell the user that
   * the analysis was partial instead of implying it was exhaustive.
   */
  async findDuplicates(
    files: FileWithSize[],
    options: { timeoutMs?: number } = {},
  ): Promise<DuplicateScan> {
    const hashMap: Record<string, FileWithSize[]> = {};
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs ?? 30000; // 30s default timeout
    const skipped: SkippedFile[] = [];

    // Step 1: Pre-group by file size to avoid hashing files with unique byte counts
    const sizeGroups = new Map<number, FileWithSize[]>();
    for (const file of files) {
      if (file.size <= 0) {
        skipped.push(
          this.describeSkip(
            file,
            "empty_file",
            "Empty file: every 0-byte file is trivially identical, so it carries no duplicate information.",
          ),
        );
        continue;
      }
      if (file.size > this.maxFileSize) {
        skipped.push(
          this.describeSkip(
            file,
            "exceeds_size_cap",
            `Larger than the ${formatBytes(this.maxFileSize)} hashing cap, so its content was not compared.`,
          ),
        );
        continue;
      }
      const group = sizeGroups.get(file.size) ?? [];
      group.push(file);
      sizeGroups.set(file.size, group);
    }

    // Step 2: Only hash files that share identical byte length with at least one other file
    let timedOut = false;
    for (const [, candidates] of sizeGroups) {
      if (candidates.length < 2) continue;

      for (const file of candidates) {
        if (Date.now() - startTime > timeoutMs) {
          timedOut = true;
          break;
        }

        try {
          const hash = await this.calculateHash(file.path);
          if (!hashMap[hash]) {
            hashMap[hash] = [];
          }
          hashMap[hash].push(file);
        } catch (error) {
          logger.error(`Error hashing ${file.name}: ${(error as Error).message}`);
          skipped.push(
            this.describeSkip(
              file,
              "hash_failed",
              `Could not be read for hashing: ${(error as Error).message}`,
            ),
          );
        }
      }

      if (timedOut) break;
    }

    // Any file that never got hashed because the budget ran out is also a skip.
    if (timedOut) {
      const hashedPaths = new Set(
        Object.values(hashMap).flat().map((f) => f.path),
      );
      for (const [, candidates] of sizeGroups) {
        for (const file of candidates) {
          if (!hashedPaths.has(file.path)) {
            skipped.push(
              this.describeSkip(
                file,
                "timed_out",
                `Not analyzed: duplicate scan exceeded its ${timeoutMs}ms budget.`,
              ),
            );
          }
        }
      }
    }

    const groups = Object.entries(hashMap)
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

    if (skipped.length > 0) {
      logger.warn(
        `Duplicate analysis skipped ${skipped.length} file(s); ` +
          `reasons: ${summarizeSkipReasons(skipped)}`,
      );
    }

    return {
      groups,
      skipped,
      skipped_bytes: skipped.reduce((sum, f) => sum + f.size_bytes, 0),
    };
  }

  private describeSkip(
    file: FileWithSize,
    reason: SkippedFile["reason"],
    detail: string,
  ): SkippedFile {
    return {
      path: file.path,
      name: file.name,
      size_bytes: file.size,
      reason,
      detail,
    };
  }
}

/** Compact reason tally for log lines, e.g. "exceeds_size_cap: 3". */
function summarizeSkipReasons(skipped: SkippedFile[]): string {
  const counts = new Map<string, number>();
  for (const file of skipped) {
    counts.set(file.reason, (counts.get(file.reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => `${reason}: ${count}`)
    .join(", ");
}
