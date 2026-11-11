/**
 * `historyLogging.keepRotatedFiles` is read, not just accepted.
 *
 * The field was parsed by the config schema and then read by nobody:
 * `DEFAULT_CONFIG.maxBackupFiles` was hardcoded to 5 and was the only thing
 * deciding how many `operations.N.jsonl` files survived. A user who set
 * `keepRotatedFiles: 20` got 5, with nothing warning them and nothing
 * reporting the gap.
 *
 * The rotation cut reads that number, so these tests drive the read path:
 * seed rotations in a temp dir, ask for a count, and assert which files the
 * search actually opened.
 */

import fs from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import type { HistoryEntry } from "../../../src/services/history-logger.service.js";

/** What the mocked `loadUserConfig` reports. */
let keepRotatedFiles: number | undefined;

const actualLoader = await import("../../../src/core/config/loader.js");

jest.unstable_mockModule("../../../src/core/config/loader.js", () => ({
  ...actualLoader,
  loadUserConfig: () => ({ historyLogging: { keepRotatedFiles } }),
}));

const { HistoryLoggerService } =
  await import("../../../src/services/history-logger.service.js");

/**
 * One entry tagged with the rotation index it was seeded into.
 *
 * The timestamp runs backwards with the index: results come back newest-first,
 * so a live file at index 0 sorts ahead of its rotations and the returned order
 * is the order the files were read in.
 */
function entryIn(rotation: number): HistoryEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date(1_700_000_000_000 - rotation * 1000).toISOString(),
    operation: "organize_files",
    source: "manual",
    status: "success",
    durationMs: 1,
    filesProcessed: rotation,
  };
}

/**
 * Which rotation file an entry came from.
 *
 * `filesProcessed` is optional on `HistoryEntry`, and these entries are
 * whatever the search parsed off disk, so this narrows rather than asserts: a
 * missing tag is a broken test, not silently `undefined` in a `toEqual`.
 */
function rotationOf(entry: unknown): number {
  if (typeof entry !== "object" || entry === null) {
    throw new Error("history entry is not an object");
  }
  const { filesProcessed } = entry as { filesProcessed?: unknown };
  if (typeof filesProcessed !== "number") {
    throw new Error("history entry carries no filesProcessed tag");
  }
  return filesProcessed;
}

describe("keepRotatedFiles decides the rotations a search reads", () => {
  let dataDir: string;
  let service: InstanceType<typeof HistoryLoggerService>;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "fom-keep-rotated-"));
    // No maxBackupFiles, so the count comes from the config under test.
    service = new HistoryLoggerService({ dataDir });
    await service.init();
  });

  afterEach(async () => {
    keepRotatedFiles = undefined;
    // Windows holds the file briefly after the last write and the rm flakes
    // without it. Nothing here needs the wait on the other platforms.
    if (process.platform === "win32") {
      await new Promise((r) => setTimeout(r, 100));
    }
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  /** Seed `operations.jsonl` plus `operations.1..upTo.jsonl`. */
  async function seedRotations(upTo: number): Promise<void> {
    await fs.writeFile(
      path.join(dataDir, "operations.jsonl"),
      `${JSON.stringify(entryIn(0))}\n`,
      "utf-8",
    );
    for (let i = 1; i <= upTo; i++) {
      await fs.writeFile(
        path.join(dataDir, `operations.${i}.jsonl`),
        `${JSON.stringify(entryIn(i))}\n`,
        "utf-8",
      );
    }
  }

  /** Indices of the files the search actually opened, in order. */
  async function filesRead(): Promise<number[]> {
    const result = await service.searchHistory({ limit: 1000 });
    return result.entries.map(rotationOf);
  }

  /** Whether `operations.N.jsonl` is on disk. */
  async function exists(n: number): Promise<boolean> {
    return fs
      .access(path.join(dataDir, `operations.${n}.jsonl`))
      .then(() => true)
      .catch(() => false);
  }

  it("reads exactly the rotations the config asks for", async () => {
    keepRotatedFiles = 3;
    await seedRotations(5);

    // 0 is the live file, 1..3 are the rotations the config keeps. 4 and 5
    // are seeded but must not be read: that is the gap the config created.
    await expect(filesRead()).resolves.toEqual([0, 1, 2, 3]);
  });

  it("falls back to 5 when the config sets no preference", async () => {
    keepRotatedFiles = undefined;
    await seedRotations(7);

    await expect(filesRead()).resolves.toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("reads only the live file at 0, and does not crash", async () => {
    keepRotatedFiles = 0;
    await seedRotations(3);

    await expect(filesRead()).resolves.toEqual([0]);
  });

  it("reads one rotation at 1, and does not crash", async () => {
    keepRotatedFiles = 1;
    await seedRotations(3);

    await expect(filesRead()).resolves.toEqual([0, 1]);
  });

  it("ignores a value that cannot be a file count", async () => {
    // Coercion is the bug here: Number("five") is NaN, and a NaN bound would
    // make the read loop never run, emptying a user's history silently.
    keepRotatedFiles = Number.NaN;
    await seedRotations(6);

    await expect(filesRead()).resolves.toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("keeps an explicit constructor value instead of reading the config", async () => {
    keepRotatedFiles = 9;
    const pinned = new HistoryLoggerService({ dataDir, maxBackupFiles: 2 });
    await pinned.init();
    await seedRotations(4);

    const result = await pinned.searchHistory({ limit: 1000 });
    expect(result.entries.map(rotationOf)).toEqual([0, 1, 2]);
  });

  it("leaves on disk exactly the rotations the config asks for", async () => {
    keepRotatedFiles = 3;
    // One byte per rotation trigger, so every append past the first rotates:
    // ten appends produce ten rounds of shifting, which is what decides how
    // many `operations.N.jsonl` survive. Reading rotations back proves the
    // search honours the count; only a real write proves rotation does.
    const rotating = new HistoryLoggerService({
      dataDir,
      maxFileSizeBytes: 1,
    });
    await rotating.init();

    for (let i = 0; i < 10; i++) {
      await rotating.log({
        operation: "organize_files",
        source: "manual",
        status: "success",
        durationMs: 1,
        filesProcessed: i,
      });
    }

    await expect(exists(3)).resolves.toBe(true);
    // The cut. A rotation loop that kept five would have written this one.
    await expect(exists(4)).resolves.toBe(false);
  });

  it("truncates the live file at 0 instead of hiding a backup", async () => {
    keepRotatedFiles = 0;
    const rotating = new HistoryLoggerService({
      dataDir,
      maxFileSizeBytes: 1,
    });
    await rotating.init();

    for (let i = 0; i < 5; i++) {
      await rotating.log({
        operation: "organize_files",
        source: "manual",
        status: "success",
        durationMs: 1,
        filesProcessed: i,
      });
    }

    // The rename path leaves operations.1.jsonl behind with four of the five
    // entries in it, and at 0 no read opens it: history the user still has,
    // invisible everywhere. Nothing is hidden, so the live file is the whole
    // story and the search reads exactly what survived.
    await expect(exists(1)).resolves.toBe(false);
    await expect(filesRead()).resolves.toEqual([4]);
  });
});
