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

/** Bytes read from each end of an oversized file when sampling. */
const SAMPLE_WINDOW = 64 * 1024;

/**
 * How a content identity was derived.
 *
 * - `full`     — the entire file was hashed. Equality is proven.
 * - `sampled`  — only the first and last 64KB plus the size were hashed.
 *                Two different files could still share this digest, so it is
 *                a weaker signal, never a proof of equality.
 */
export type ContentIdentityMethod = "full" | "sampled";

export interface ContentIdentity {
  digest: string;
  method: ContentIdentityMethod;
  size: number;
}

/**
 * Reject with `message` if `promise` has not settled within `timeoutMs`.
 *
 * The timer is always cleared, so a fast operation does not keep the event
 * loop alive. The underlying work is abandoned, not cancelled.
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const budget = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, budget]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

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
   * Content identity that works at any file size.
   *
   * `calculateHash` throws above the size cap, which made oversized files
   * impossible to verify before deleting: the delete path hashed every
   * candidate, so a 4GB video could never be confirmed as a duplicate and
   * was refused. This falls back to size + first/last 64KB for those files.
   *
   * The fallback is a weaker signal than a full hash, so the returned `method`
   * says which one was used and callers must not treat `sampled` as proof of
   * equality. Used for "does a surviving copy exist" questions, where a
   * false positive is recoverable via the deletion manifest.
   */
  async calculateContentIdentity(
    fileInput: string | fs.FileHandle,
    options: { timeoutMs?: number } = {},
  ): Promise<ContentIdentity> {
    const timeoutMs = options.timeoutMs ?? 60000;

    let size: number;
    if (typeof fileInput === "string") {
      size = (await fs.stat(fileInput)).size;
    } else {
      size = (await fileInput.stat()).size;
    }

    if (size <= this.maxFileSize) {
      const digest = await this.calculateHash(fileInput, options);
      return { digest, method: "full", size };
    }

    // Only this method opens its own handle; a caller-supplied one belongs to
    // the caller and must not be closed here.
    const owned =
      typeof fileInput === "string" ? await fs.open(fileInput, "r") : null;
    const handle = owned ?? (fileInput as fs.FileHandle);

    try {
      // `handle.read` takes no AbortSignal, so the budget is enforced by
      // racing the reads rather than by aborting them. A read that outlives
      // the race is abandoned rather than waited on.
      const digest = await withTimeout(
        this.buildSampledDigest(handle, size),
        timeoutMs,
        `Content identity timed out after ${timeoutMs}ms for a ${formatBytes(size)} file`,
      );
      return { digest, method: "sampled", size };
    } finally {
      if (owned) {
        // The digest is already computed, so a close failure must not fail
        // the operation.
        await owned.close().catch(() => undefined);
      }
    }
  }

  /**
   * Digest an oversized file from its size plus its first and last 64KB.
   * The caller must hold an open handle on the file.
   */
  private async buildSampledDigest(
    handle: fs.FileHandle,
    size: number,
  ): Promise<string> {
    const hash = crypto.createHash("sha256");
    // Size is part of the digest so a small file cannot collide with a
    // sampled identity of a different length.
    hash.update(`size:${size}\n`);

    const start = Buffer.alloc(Math.min(SAMPLE_WINDOW, size));
    await handle.read(start, 0, start.length, 0);
    hash.update(start);

    if (size > SAMPLE_WINDOW) {
      const tail = Buffer.alloc(Math.min(SAMPLE_WINDOW, size));
      await handle.read(
        tail,
        0,
        tail.length,
        Math.max(0, size - SAMPLE_WINDOW),
      );
      hash.update(tail);
    }

    return `sampled:${hash.digest("hex")}`;
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
    // Paths that already have an outcome, so the timeout sweep cannot report
    // them a second time under a different reason.
    const decided = new Set<string>();

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
        decided.add(file.path);
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
        decided.add(file.path);
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
          decided.add(file.path);
        } catch (error) {
          logger.error(`Error hashing ${file.name}: ${(error as Error).message}`);
          skipped.push(
            this.describeSkip(
              file,
              "hash_failed",
              `Could not be read for hashing: ${(error as Error).message}`,
            ),
          );
          decided.add(file.path);
        }
      }

      if (timedOut) break;
    }

    // Any file that still needed hashing when the budget ran out is a skip.
    // Only groups that were actually eligible are swept: a group with fewer
    // than two members can never hold a duplicate, so those files were
    // excluded on purpose, not starved of budget, and reporting them as
    // timed_out would be wrong.
    if (timedOut) {
      for (const [, candidates] of sizeGroups) {
        if (candidates.length < 2) continue;
        for (const file of candidates) {
          if (!decided.has(file.path)) {
            skipped.push(
              this.describeSkip(
                file,
                "timed_out",
                `Not analyzed: duplicate scan exceeded its ${timeoutMs}ms budget.`,
              ),
            );
            decided.add(file.path);
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
