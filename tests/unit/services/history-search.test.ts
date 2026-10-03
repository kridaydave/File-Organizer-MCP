/**
 * HistoryLoggerService.searchHistory() — the filtered read behind
 * file_organizer_search_history.
 *
 * Entries are seeded straight into operations.jsonl with the timestamps and
 * paths under test, so the assertions are about what the reader returns, not
 * about what log() happened to stamp. Everything lives in an os.tmpdir()
 * root; the real config dir is never read or written.
 */

import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import {
  HistoryLoggerService,
  type HistoryEntry,
} from "../../../src/services/history-logger.service.js";
import {
  setupLoggerMocks,
  teardownLoggerMocks,
} from "../../utils/logger-mock.js";

type SeedEntry = Pick<HistoryEntry, "timestamp" | "operation"> &
  Partial<Omit<HistoryEntry, "timestamp" | "operation">>;

describe("HistoryLoggerService.searchHistory", () => {
  let service: HistoryLoggerService;
  let dataDir: string;

  const seed = async (entries: SeedEntry[]): Promise<void> => {
    const lines = entries.map((entry, index) =>
      JSON.stringify({
        id: `seed-${index}`,
        timestamp: entry.timestamp,
        operation: entry.operation,
        source: entry.source ?? "manual",
        status: entry.status ?? "success",
        durationMs: entry.durationMs ?? 10,
        ...("paths" in entry ? { paths: entry.paths } : {}),
      }),
    );
    await fs.writeFile(
      path.join(dataDir, "operations.jsonl"),
      lines.join("\n") + "\n",
      "utf-8",
    );
  };

  beforeEach(async () => {
    setupLoggerMocks();
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "fom-history-search-"));
    service = new HistoryLoggerService({ dataDir, lockTimeoutMs: 1000 });
    await service.init();
  });

  afterEach(async () => {
    if (process.platform === "win32") {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await fs.rm(dataDir, { recursive: true, force: true });
    teardownLoggerMocks();
  });

  it("returns every entry when no filter is given", async () => {
    await seed([
      {
        timestamp: "2026-01-02T10:00:00.000Z",
        operation: "a",
        paths: ["/data/a"],
      },
      { timestamp: "2026-01-03T10:00:00.000Z", operation: "b" },
    ]);

    const result = await service.searchHistory();

    expect(result.entries.map((e) => e.operation)).toEqual(["b", "a"]);
    expect(result.total).toBe(2);
    expect(result.hasMore).toBe(false);
  });

  it("keeps only entries whose recorded path matches the glob", async () => {
    await seed([
      {
        timestamp: "2026-01-02T10:00:00.000Z",
        operation: "in_downloads",
        paths: ["/home/user/Downloads"],
      },
      {
        timestamp: "2026-01-02T11:00:00.000Z",
        operation: "in_pictures",
        paths: ["/home/user/Pictures"],
      },
    ]);

    const result = await service.searchHistory({
      pathGlob: "**/Downloads",
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.operation).toBe("in_downloads");
    expect(result.total).toBe(1);
  });

  it("matches a bare filename pattern against the recorded path", async () => {
    await seed([
      {
        timestamp: "2026-01-02T10:00:00.000Z",
        operation: "moved_report",
        paths: ["/home/user/Documents/quarterly-report.pdf"],
      },
      {
        timestamp: "2026-01-02T11:00:00.000Z",
        operation: "moved_notes",
        paths: ["/home/user/Documents/notes.txt"],
      },
    ]);

    const result = await service.searchHistory({
      pathGlob: "*.pdf",
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.operation).toBe("moved_report");
  });

  it("matches a Windows-style recorded path against a / separated glob", async () => {
    await seed([
      {
        timestamp: "2026-01-02T10:00:00.000Z",
        operation: "windows_run",
        paths: ["C:\\Users\\test\\Downloads"],
      },
    ]);

    const result = await service.searchHistory({
      pathGlob: "**/Downloads/**",
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.operation).toBe("windows_run");
  });

  it("never matches an entry that recorded no path", async () => {
    await seed([
      { timestamp: "2026-01-02T10:00:00.000Z", operation: "no_paths" },
      {
        timestamp: "2026-01-02T11:00:00.000Z",
        operation: "has_paths",
        paths: ["/home/user/Downloads"],
      },
    ]);

    const result = await service.searchHistory({ pathGlob: "**" });

    expect(result.entries.map((e) => e.operation)).toEqual(["has_paths"]);
    expect(result.total).toBe(1);
  });

  it("returns nothing when the glob matches no recorded path", async () => {
    await seed([
      {
        timestamp: "2026-01-02T10:00:00.000Z",
        operation: "in_pictures",
        paths: ["/home/user/Pictures"],
      },
    ]);

    const result = await service.searchHistory({ pathGlob: "**/Downloads" });

    expect(result.entries).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.hasMore).toBe(false);
  });

  it("rejects a glob minimatch cannot compile", async () => {
    await seed([
      { timestamp: "2026-01-02T10:00:00.000Z", operation: "anything" },
    ]);

    // The tool schema caps path_glob at 4096 chars, so only a direct service
    // caller can get here — and it must still fail loudly, not silently
    // return every entry.
    await expect(
      service.searchHistory({ pathGlob: "a".repeat(70_000) }),
    ).rejects.toThrow(/path_glob/);
  });

  it("rejects an empty glob rather than matching nothing", async () => {
    await expect(service.searchHistory({ pathGlob: "" })).rejects.toThrow(
      /path_glob/,
    );
  });

  it("filters by date range", async () => {
    await seed([
      { timestamp: "2026-01-01T00:00:00.000Z", operation: "before" },
      { timestamp: "2026-01-05T00:00:00.000Z", operation: "inside" },
      { timestamp: "2026-01-09T00:00:00.000Z", operation: "after" },
    ]);

    const result = await service.searchHistory({
      startDate: "2026-01-02T00:00:00.000Z",
      endDate: "2026-01-08T00:00:00.000Z",
    });

    expect(result.entries.map((e) => e.operation)).toEqual(["inside"]);
    expect(result.total).toBe(1);
  });

  it("filters by operation", async () => {
    await seed([
      { timestamp: "2026-01-01T00:00:00.000Z", operation: "scan" },
      { timestamp: "2026-01-02T00:00:00.000Z", operation: "organize" },
      { timestamp: "2026-01-03T00:00:00.000Z", operation: "organize" },
    ]);

    const result = await service.searchHistory({ operation: "organize" });

    expect(result.entries).toHaveLength(2);
    expect(result.entries.every((e) => e.operation === "organize")).toBe(true);
  });

  it("combines path glob, date range, and operation", async () => {
    await seed([
      {
        timestamp: "2026-01-01T00:00:00.000Z",
        operation: "organize",
        paths: ["/home/user/Downloads"],
      },
      {
        timestamp: "2026-01-05T00:00:00.000Z",
        operation: "organize",
        paths: ["/home/user/Downloads"],
      },
      {
        timestamp: "2026-01-05T00:00:00.000Z",
        operation: "scan",
        paths: ["/home/user/Downloads"],
      },
      {
        timestamp: "2026-01-05T00:00:00.000Z",
        operation: "organize",
        paths: ["/home/user/Pictures"],
      },
    ]);

    const result = await service.searchHistory({
      pathGlob: "**/Downloads",
      startDate: "2026-01-02T00:00:00.000Z",
      operation: "organize",
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.timestamp).toBe("2026-01-05T00:00:00.000Z");
    expect(result.entries[0]!.operation).toBe("organize");
    expect(result.total).toBe(1);
  });

  it("counts every match, then pages the returned entries", async () => {
    await seed([
      {
        timestamp: "2026-01-01T00:00:00.000Z",
        operation: "organize",
        paths: ["/home/user/Downloads"],
      },
      {
        timestamp: "2026-01-02T00:00:00.000Z",
        operation: "organize",
        paths: ["/home/user/Downloads"],
      },
      {
        timestamp: "2026-01-03T00:00:00.000Z",
        operation: "organize",
        paths: ["/home/user/Downloads"],
      },
    ]);

    const result = await service.searchHistory({
      pathGlob: "**/Downloads",
      limit: 2,
    });

    expect(result.entries).toHaveLength(2);
    expect(result.total).toBe(3);
    expect(result.hasMore).toBe(true);
  });

  it("redacts recorded paths in redacted privacy mode", async () => {
    await seed([
      {
        timestamp: "2026-01-02T10:00:00.000Z",
        operation: "organize",
        paths: ["/home/user/Downloads/notes.txt"],
      },
    ]);

    const result = await service.searchHistory({
      pathGlob: "**/Downloads/**",
      privacyMode: "redacted",
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.paths).toEqual(["[REDACTED]"]);
  });

  it("drops paths in none privacy mode", async () => {
    await seed([
      {
        timestamp: "2026-01-02T10:00:00.000Z",
        operation: "organize",
        paths: ["/home/user/Downloads/notes.txt"],
      },
    ]);

    const result = await service.searchHistory({
      pathGlob: "**/Downloads/**",
      privacyMode: "none",
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.operation).toBe("organize");
    expect(result.entries[0]!.paths).toBeUndefined();
  });

  it("leaves getHistory unfiltered by path, as view_history expects", async () => {
    await seed([
      {
        timestamp: "2026-01-02T10:00:00.000Z",
        operation: "in_pictures",
        paths: ["/home/user/Pictures"],
      },
      { timestamp: "2026-01-02T11:00:00.000Z", operation: "no_paths" },
    ]);

    const result = await service.getHistory();

    expect(result.total).toBe(2);
    expect(result.entries.map((e) => e.operation)).toEqual([
      "no_paths",
      "in_pictures",
    ]);
  });
});
