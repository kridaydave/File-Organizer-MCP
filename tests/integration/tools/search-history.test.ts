/**
 * Integration tests for file_organizer_search_history.
 *
 * These drive the real handler against a real HistoryLoggerService whose
 * operations.jsonl is seeded in os.tmpdir(), so the assertions cover the whole
 * path: JSON args → Zod schema → service read → rendered response. Nothing
 * here reaches the real config dir or the real home.
 */

import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import {
  handleSearchHistory,
  searchHistoryToolDefinition,
} from "../../../src/tools/view-history.js";
import { HistoryLoggerService } from "../../../src/services/history-logger.service.js";
import { TOOLS, toolHandlers } from "../../../src/mcp/registry.js";
import type { ToolContext } from "../../../src/mcp/context.js";
import type { UserConfig } from "../../../src/core/config/loader.js";
import {
  setupLoggerMocks,
  teardownLoggerMocks,
} from "../../utils/logger-mock.js";

const DOWNLOADS = "/sandbox/user/Downloads";
const PICTURES = "/sandbox/user/Pictures";

interface SeedEntry {
  timestamp: string;
  operation: string;
  paths?: string[];
  status?: "success" | "error" | "partial";
}

describe("search history tool", () => {
  let dataDir: string;
  let ctx: ToolContext;

  const seed = async (entries: SeedEntry[]): Promise<void> => {
    const lines = entries.map((entry, index) =>
      JSON.stringify({
        id: `seed-${index}`,
        timestamp: entry.timestamp,
        operation: entry.operation,
        source: "manual",
        status: entry.status ?? "success",
        durationMs: 25,
        filesProcessed: 1,
        ...(entry.paths ? { paths: entry.paths } : {}),
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
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "fom-search-tool-"));
    ctx = {
      config: { conflictStrategy: "rename" } as UserConfig,
      history: new HistoryLoggerService({ dataDir, lockTimeoutMs: 1000 }),
    };
    await ctx.history.init();
  });

  afterEach(async () => {
    if (process.platform === "win32") {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await fs.rm(dataDir, { recursive: true, force: true });
    teardownLoggerMocks();
  });

  it("is registered with honest read-only annotations", () => {
    const registered = TOOLS.find(
      (tool) => tool.name === "file_organizer_search_history",
    );

    expect(registered).toBeDefined();
    expect(toolHandlers.has("file_organizer_search_history")).toBe(true);
    expect(registered!.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
    expect(searchHistoryToolDefinition.name).toBe(
      "file_organizer_search_history",
    );
  });

  it("returns every entry when no filter is given", async () => {
    await seed([
      {
        timestamp: "2026-02-01T10:00:00.000Z",
        operation: "file_organizer_organize_files",
        paths: [DOWNLOADS],
      },
      { timestamp: "2026-02-02T10:00:00.000Z", operation: "other_tool" },
    ]);

    const result = await handleSearchHistory({ response_format: "json" }, ctx);

    const output = result.structuredContent as {
      entries: Array<{ operation: string }>;
      total: number;
    };
    expect(output.total).toBe(2);
    expect(output.entries.map((e) => e.operation)).toEqual([
      "other_tool",
      "file_organizer_organize_files",
    ]);
  });

  it("keeps only entries matching the path glob", async () => {
    await seed([
      {
        timestamp: "2026-02-01T10:00:00.000Z",
        operation: "file_organizer_scan_directory",
        paths: [DOWNLOADS],
      },
      {
        timestamp: "2026-02-02T10:00:00.000Z",
        operation: "file_organizer_scan_directory",
        paths: [PICTURES],
      },
      {
        timestamp: "2026-02-03T10:00:00.000Z",
        operation: "file_organizer_get_categories",
      },
    ]);

    const result = await handleSearchHistory(
      { path_glob: "**/Downloads", response_format: "json" },
      ctx,
    );

    const output = result.structuredContent as {
      entries: Array<{ operation: string; paths: string[] }>;
      total: number;
    };
    expect(output.total).toBe(1);
    expect(output.entries).toHaveLength(1);
    expect(output.entries[0]!.operation).toBe("file_organizer_scan_directory");
    expect(output.entries[0]!.paths).toEqual([DOWNLOADS]);
  });

  it("combines path glob, date range, and operation", async () => {
    await seed([
      {
        timestamp: "2026-01-01T00:00:00.000Z",
        operation: "file_organizer_organize_files",
        paths: [DOWNLOADS],
      },
      {
        timestamp: "2026-02-10T00:00:00.000Z",
        operation: "file_organizer_organize_files",
        paths: [DOWNLOADS],
      },
      {
        timestamp: "2026-02-10T00:00:00.000Z",
        operation: "file_organizer_scan_directory",
        paths: [DOWNLOADS],
      },
      {
        timestamp: "2026-02-10T00:00:00.000Z",
        operation: "file_organizer_organize_files",
        paths: [PICTURES],
      },
    ]);

    const result = await handleSearchHistory(
      {
        path_glob: "**/Downloads",
        from: "2026-02-01T00:00:00.000Z",
        to: "2026-02-28T00:00:00.000Z",
        operation: "file_organizer_organize_files",
        response_format: "json",
      },
      ctx,
    );

    const output = result.structuredContent as {
      entries: Array<{ timestamp: string }>;
      total: number;
    };
    expect(output.total).toBe(1);
    expect(output.entries).toHaveLength(1);
    expect(output.entries[0]!.timestamp).toBe("2026-02-10T00:00:00.000Z");
  });

  it("honors limit while still reporting the full match count", async () => {
    await seed([
      {
        timestamp: "2026-02-01T10:00:00.000Z",
        operation: "file_organizer_organize_files",
        paths: [DOWNLOADS],
      },
      {
        timestamp: "2026-02-02T10:00:00.000Z",
        operation: "file_organizer_organize_files",
        paths: [DOWNLOADS],
      },
      {
        timestamp: "2026-02-03T10:00:00.000Z",
        operation: "file_organizer_organize_files",
        paths: [DOWNLOADS],
      },
    ]);

    const result = await handleSearchHistory(
      { path_glob: "**/Downloads", limit: 2, response_format: "json" },
      ctx,
    );

    const output = result.structuredContent as {
      entries: unknown[];
      total: number;
      hasMore: boolean;
    };
    expect(output.entries).toHaveLength(2);
    expect(output.total).toBe(3);
    expect(output.hasMore).toBe(true);
  });

  it("renders markdown with only the matching entries", async () => {
    await seed([
      {
        timestamp: "2026-02-01T10:00:00.000Z",
        operation: "file_organizer_organize_files",
        paths: [DOWNLOADS],
      },
      {
        timestamp: "2026-02-02T10:00:00.000Z",
        operation: "file_organizer_organize_photos",
        paths: [PICTURES],
      },
    ]);

    const result = await handleSearchHistory(
      { path_glob: "**/Downloads" },
      ctx,
    );

    const text = result.content[0]!.text;
    expect(text).toContain("### File Organization History");
    expect(text).toContain("file_organizer_organize_files");
    expect(text).not.toContain("file_organizer_organize_photos");
    expect(text).toContain("Showing 1 of 1 entries");
  });

  it("says so plainly when nothing matches", async () => {
    await seed([
      {
        timestamp: "2026-02-01T10:00:00.000Z",
        operation: "file_organizer_organize_files",
        paths: [DOWNLOADS],
      },
    ]);

    const result = await handleSearchHistory(
      { path_glob: "**/Downloads/**/never" },
      ctx,
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text).toBe(
      "No history entries found matching the specified criteria.",
    );
  });

  it("rejects a glob carrying parent-directory traversal", async () => {
    await seed([
      {
        timestamp: "2026-02-01T10:00:00.000Z",
        operation: "file_organizer_organize_files",
        paths: [DOWNLOADS],
      },
    ]);

    const result = await handleSearchHistory(
      { path_glob: "**/../../etc/*", response_format: "json" },
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Error");
    expect(result.content[0]!.text).toContain(
      "Path cannot contain parent directory traversal",
    );
    expect(result.structuredContent).toBeUndefined();
  });

  it("rejects an out-of-range limit without reading history", async () => {
    const result = await handleSearchHistory(
      { limit: 5000, response_format: "json" },
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Error");
  });

  it("applies privacy_mode from the request over the config default", async () => {
    await seed([
      {
        timestamp: "2026-02-01T10:00:00.000Z",
        operation: "file_organizer_organize_files",
        paths: [DOWNLOADS],
      },
    ]);

    const result = await handleSearchHistory(
      {
        path_glob: "**/Downloads",
        privacy_mode: "redacted",
        response_format: "json",
      },
      ctx,
    );

    const output = result.structuredContent as {
      entries: Array<{ paths: string[] }>;
    };
    expect(output.entries).toHaveLength(1);
    expect(output.entries[0]!.paths).toEqual(["[REDACTED]"]);
  });
});
