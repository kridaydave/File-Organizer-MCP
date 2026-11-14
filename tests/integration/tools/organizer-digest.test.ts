/**
 * Integration tests for the organizer_digest tool.
 *
 * The digest reads the same operations.jsonl the history tools read, so these
 * tests write real history rows through the real HistoryLoggerService rather
 * than stubbing it: a stubbed service would prove the aggregation and not the
 * read. Storage is redirected to a per-file temp root first, because
 * `getHistoryDirectory()` is one directory for the whole run and a suite that
 * wrote to it would race every other jest worker (#108).
 */

import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, it, expect, beforeAll, afterAll, jest } from "@jest/globals";

import type { HistoryEntry } from "../../../src/services/history-logger.service.js";
import type { ToolResponse } from "../../../src/types.js";
import { first, required } from "../../helpers/safe-index.js";

/**
 * The real paths module, imported before the mock is registered. Importing the
 * same specifier inside the factory would resolve to the mock and recurse.
 */
const actualPaths = await import("../../../src/core/config/paths.js");

const root = await fs.mkdtemp(path.join(os.tmpdir(), "organizer-digest-"));
const configDir = path.join(root, "config");

jest.unstable_mockModule("../../../src/core/config/paths.js", () => ({
  ...actualPaths,
  // The history logger derives its data dir from getHistoryDirectory(), not
  // from getHistoryFilePath(), so both have to move for the log to be private.
  getConfigDirectory: () => configDir,
  getHistoryDirectory: () => configDir,
  getHistoryFilePath: () => path.join(configDir, "operations.jsonl"),
  getUserConfigPath: () => path.join(configDir, "config.json"),
  getRollbackDirectory: () => path.join(configDir, "rollbacks"),
  getBackupDirectory: () => path.join(configDir, "backups"),
}));

const { handleOrganizerDigest } = await import(
  "../../../src/tools/organizer-digest.js"
);
const { historyLogger } = await import(
  "../../../src/services/history-logger.service.js"
);

/** A directory under the isolated root, so nothing points at a real home. */
function sandboxDir(name: string): string {
  return path.join(root, "sandbox", name);
}

async function logPass(
  overrides: Partial<Omit<HistoryEntry, "id" | "timestamp">> = {},
): Promise<void> {
  await historyLogger.log({
    operation: "file_organizer_organize_files",
    source: "scheduled",
    status: "success",
    durationMs: 1200,
    filesProcessed: 4,
    filesSkipped: 1,
    manifestId: "aaaaaaaa-0000-4000-8000-000000000001",
    paths: [sandboxDir("downloads")],
    ...overrides,
  });
}

interface DigestRow {
  passes: number;
  files_processed: number;
  files_skipped: number;
  partial: number;
  failed: number;
}

interface Digest {
  generated_at: string;
  window: {
    start: string | null;
    end: string;
    start_kind: "absolute" | "relative" | "unbounded";
    relative: string | null;
  };
  totals: DigestRow & {
    successful: number;
    duration_ms: number;
    duration_readable: string;
    passes_with_manifest: number;
  };
  by_directory: Array<{ directory: string } & DigestRow>;
  by_operation: Array<{ operation: string } & DigestRow>;
  failures: Array<{
    timestamp: string;
    operation: string;
    status: "partial" | "error";
    source: "manual" | "scheduled";
    manifest_id: string | null;
    detail: string | null;
    error: string | null;
  }>;
  undo_manifests: string[];
  limits: string[];
}

function digestOf(response: ToolResponse): Digest {
  const digest = response.structuredContent as Digest | undefined;
  if (digest === undefined) {
    throw new Error("the digest response carried no structuredContent");
  }
  return digest;
}

function markdownOf(response: {
  content: readonly { text: string }[];
}): string {
  return first(response.content).text;
}

/** A window that certainly contains everything this suite logs. */
function wideWindow(): { from: string; to: string } {
  return {
    from: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    to: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };
}

describe("organizer_digest", () => {
  beforeAll(async () => {
    await fs.mkdir(configDir, { recursive: true });
    await fs.mkdir(sandboxDir("downloads"), { recursive: true });
    await fs.mkdir(sandboxDir("pictures"), { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  // Every test logs its own passes, and the digest reads the whole file, so
  // each test starts from an empty log rather than from the last one's rows.
  beforeEach(async () => {
    await fs.rm(path.join(configDir, "operations.jsonl"), { force: true });
  });

  describe("a window holding several passes", () => {
    it("reports the pass count and the summed file count", async () => {
      await logPass({ filesProcessed: 4, filesSkipped: 1 });
      await logPass({ filesProcessed: 6, filesSkipped: 2 });
      await logPass({ filesProcessed: 2, filesSkipped: 0 });

      const digest = digestOf(
        await handleOrganizerDigest({
          ...wideWindow(),
          response_format: "json",
        }),
      );

      expect(digest.totals.passes).toBe(3);
      expect(digest.totals.files_processed).toBe(12);
      expect(digest.totals.files_skipped).toBe(3);
      expect(digest.totals.successful).toBe(3);
      expect(digest.totals.partial).toBe(0);
      expect(digest.totals.failed).toBe(0);
      // Every row this suite logs is the same pass, so the per-directory and
      // per-operation rows carry the same numbers as the total.
      expect(digest.by_directory).toHaveLength(1);
      expect(first(digest.by_directory).passes).toBe(3);
      expect(first(digest.by_directory).files_processed).toBe(12);
      expect(digest.by_operation).toHaveLength(1);
      expect(first(digest.by_operation).passes).toBe(3);
      expect(digest.undo_manifests).toEqual([
        "aaaaaaaa-0000-4000-8000-000000000001",
      ]);
    });

    it("narrows to one directory and one operation", async () => {
      await logPass({ paths: [sandboxDir("downloads")] });
      await logPass({
        paths: [sandboxDir("pictures")],
        operation: "file_organizer_scan_directory",
        filesProcessed: 9,
      });

      const digest = digestOf(
        await handleOrganizerDigest({
          ...wideWindow(),
          operation: "file_organizer_scan_directory",
          response_format: "json",
        }),
      );

      expect(digest.totals.passes).toBe(1);
      expect(digest.totals.files_processed).toBe(9);
      expect(first(digest.by_directory).directory).toBe(sandboxDir("pictures"));
      expect(first(digest.by_operation).operation).toBe(
        "file_organizer_scan_directory",
      );
    });
  });

  describe("a window holding a partial pass", () => {
    it("surfaces the partial pass in its own section, not as a count", async () => {
      await logPass();
      await logPass({
        status: "partial",
        filesProcessed: 3,
        filesSkipped: 5,
        manifestId: "bbbbbbbb-0000-4000-8000-000000000002",
        details: "Single pass over 8 file(s): 3 moved, 5 skipped",
      });

      const digest = digestOf(
        await handleOrganizerDigest({
          ...wideWindow(),
          response_format: "json",
        }),
      );

      // Still counted in the totals — a digest does not hide the work done.
      expect(digest.totals.passes).toBe(2);
      expect(digest.totals.partial).toBe(1);
      expect(digest.totals.files_processed).toBe(7);

      // And named on its own, with the detail and the undo handle attached.
      expect(digest.failures).toHaveLength(1);
      const failure = first(digest.failures);
      expect(failure.status).toBe("partial");
      expect(failure.source).toBe("scheduled");
      expect(failure.manifest_id).toBe(
        "bbbbbbbb-0000-4000-8000-000000000002",
      );
      expect(failure.detail).toContain("3 moved, 5 skipped");
      expect(first(digest.by_directory).partial).toBe(1);

      const markdown = markdownOf(
        await handleOrganizerDigest({
          ...wideWindow(),
          response_format: "markdown",
        }),
      );
      expect(markdown).toContain("#### Needs attention");
      expect(markdown).toContain("bbbbbbbb-0000-4000-8000-000000000002");
      expect(markdown).toContain("3 moved, 5 skipped");
    });

    it("surfaces a failed pass with its error message", async () => {
      await logPass({
        status: "error",
        filesProcessed: 0,
        manifestId: undefined,
        error: { message: "destination unwritable" },
      });

      const digest = digestOf(
        await handleOrganizerDigest({
          ...wideWindow(),
          response_format: "json",
        }),
      );

      expect(digest.failures).toHaveLength(1);
      expect(first(digest.failures).status).toBe("error");
      expect(first(digest.failures).manifest_id).toBeNull();
      expect(first(digest.failures).error).toBe("destination unwritable");
      expect(digest.totals.passes_with_manifest).toBe(0);
      expect(digest.undo_manifests).toEqual([]);
    });
  });

  describe("an empty window", () => {
    it("returns a well-formed empty digest rather than an error", async () => {
      await logPass();

      const future = {
        from: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        to: new Date(Date.now() + 120 * 60 * 1000).toISOString(),
      };

      const response = await handleOrganizerDigest({
        ...future,
        response_format: "json",
      });

      expect(response.isError).toBeUndefined();
      const digest = digestOf(response);
      expect(digest.totals.passes).toBe(0);
      expect(digest.totals.files_processed).toBe(0);
      expect(digest.totals.files_skipped).toBe(0);
      expect(digest.totals.duration_ms).toBe(0);
      expect(digest.by_directory).toEqual([]);
      expect(digest.by_operation).toEqual([]);
      expect(digest.failures).toEqual([]);
      expect(digest.undo_manifests).toEqual([]);
      // The limits still describe what the read covers, so an empty digest
      // says what it looked at rather than looking like a broken one.
      expect(digest.limits.length).toBeGreaterThan(0);
      expect(digest.window.start_kind).toBe("absolute");

      const markdown = markdownOf(
        await handleOrganizerDigest({
          ...future,
          response_format: "markdown",
        }),
      );
      expect(markdown).toContain("No passes fell inside this window");
      expect(markdown).toContain(
        "0 pass(es), 0 file(s) moved, 0 skipped, 0ms of work.",
      );
      expect(markdown).toContain("No directory was recorded in this window.");
      expect(markdown).toContain("No operation ran in this window.");
      expect(markdown).not.toContain("#### Needs attention");
      expect(markdown).not.toContain("#### Undo handles");
    });

    it("rejects a window that starts after it ends", async () => {
      const response = await handleOrganizerDigest({
        from: new Date(Date.now() + 120 * 60 * 1000).toISOString(),
        to: new Date().toISOString(),
        response_format: "json",
      });

      expect(response.isError).toBe(true);
    });

    it("rejects a relative window with no unit", async () => {
      const response = await handleOrganizerDigest({
        last: "24",
        response_format: "json",
      });

      expect(response.isError).toBe(true);
      expect(markdownOf(response)).toContain("m (minutes)");
    });
  });

  describe("the window argument", () => {
    it("resolves a relative window against now", async () => {
      await logPass();

      const digest = digestOf(
        await handleOrganizerDigest({
          last: "1h",
          response_format: "json",
        }),
      );

      expect(digest.totals.passes).toBe(1);
      expect(digest.window.start_kind).toBe("relative");
      expect(digest.window.relative).toBe("1h");
      const start = Date.parse(required(digest.window.start, "window.start"));
      const end = Date.parse(digest.window.end);
      expect(end - start).toBe(60 * 60 * 1000);
    });

    it("lets an absolute start win over a relative one", async () => {
      const digest = digestOf(
        await handleOrganizerDigest({
          last: "7d",
          from: "2020-01-01T00:00:00.000Z",
          response_format: "json",
        }),
      );

      expect(digest.window.start_kind).toBe("absolute");
      expect(digest.window.start).toBe("2020-01-01T00:00:00.000Z");
      expect(digest.window.relative).toBeNull();
      expect(digest.totals.passes).toBe(0);
    });

    it("treats an unqualified call as all recorded history", async () => {
      await logPass();

      const digest = digestOf(
        await handleOrganizerDigest({ response_format: "json" }),
      );

      expect(digest.window.start).toBeNull();
      expect(digest.window.start_kind).toBe("unbounded");
      expect(digest.totals.passes).toBe(1);
    });
  });

  describe("undo handles", () => {
    it("lists every manifest the digest covers", async () => {
      await logPass({ manifestId: "11111111-0000-4000-8000-000000000001" });
      await logPass({ manifestId: "22222222-0000-4000-8000-000000000002" });
      await logPass({ manifestId: undefined });

      const digest = digestOf(
        await handleOrganizerDigest({
          ...wideWindow(),
          response_format: "json",
        }),
      );

      expect(digest.totals.passes_with_manifest).toBe(2);
      expect(digest.undo_manifests).toEqual([
        "11111111-0000-4000-8000-000000000001",
        "22222222-0000-4000-8000-000000000002",
      ]);

      const markdown = markdownOf(
        await handleOrganizerDigest({
          ...wideWindow(),
          response_format: "markdown",
        }),
      );
      expect(markdown).toContain("#### Undo handles");
      expect(markdown).toContain("11111111-0000-4000-8000-000000000001");
      expect(markdown).toContain("22222222-0000-4000-8000-000000000002");
    });
  });

  describe("the two response formats agree", () => {
    it("puts every JSON number in the markdown", async () => {
      await logPass({ filesProcessed: 4, filesSkipped: 1 });
      await logPass({
        filesProcessed: 6,
        filesSkipped: 3,
        paths: [sandboxDir("pictures")],
        operation: "file_organizer_organize_by_date",
        status: "partial",
        manifestId: "33333333-0000-4000-8000-000000000003",
        details: "Single pass over 9 file(s): 6 moved, 3 skipped",
      });

      const json = await handleOrganizerDigest({
        ...wideWindow(),
        response_format: "json",
      });
      const md = await handleOrganizerDigest({
        ...wideWindow(),
        response_format: "markdown",
      });

      const digest = digestOf(json);
      const markdown = markdownOf(md);
      // The markdown path carries the same structured payload, so a caller
      // that asked for prose still gets the numbers a program can read. Only
      // the numbers are compared: the two calls are two instants, so their
      // timestamps differ by design.
      const markdownDigest = digestOf(md);
      expect(markdownDigest.totals).toEqual(digest.totals);
      expect(markdownDigest.by_directory).toEqual(digest.by_directory);
      expect(markdownDigest.by_operation).toEqual(digest.by_operation);
      expect(markdownDigest.failures).toEqual(digest.failures);
      expect(markdownDigest.undo_manifests).toEqual(digest.undo_manifests);
      expect(markdownDigest.limits).toEqual(digest.limits);
      expect(markdownDigest.window.start_kind).toBe(digest.window.start_kind);

      expect(digest.totals.passes).toBe(2);
      expect(digest.totals.files_processed).toBe(10);
      expect(digest.by_directory).toHaveLength(2);
      expect(digest.by_operation).toHaveLength(2);

      expect(markdown).toContain(`${digest.totals.passes} pass(es)`);
      expect(markdown).toContain(
        `${digest.totals.files_processed} file(s) moved`,
      );
      expect(markdown).toContain(`${digest.totals.files_skipped} skipped`);
      expect(markdown).toContain(digest.totals.duration_readable);
      expect(markdown).toContain(`${digest.totals.partial} partial`);
      expect(markdown).toContain(`${digest.totals.failed} failed`);

      for (const row of digest.by_directory) {
        expect(markdown).toContain(
          `| ${row.directory} | ${row.passes} | ${row.files_processed} | ${row.files_skipped} | ${row.partial} | ${row.failed} |`,
        );
      }
      for (const row of digest.by_operation) {
        expect(markdown).toContain(
          `| ${row.operation} | ${row.passes} | ${row.files_processed} | ${row.files_skipped} | ${row.partial} | ${row.failed} |`,
        );
      }
      for (const limit of digest.limits) {
        expect(markdown).toContain(limit);
      }
    });

    it("returns parseable JSON on the json path", async () => {
      await logPass();

      const response = await handleOrganizerDigest({
        ...wideWindow(),
        response_format: "json",
      });

      const parsed = JSON.parse(markdownOf(response)) as Digest;
      expect(parsed.totals.passes).toBe(1);
      expect(parsed).toEqual(digestOf(response));
    });
  });

  describe("privacy_mode", () => {
    it("redacts the directory label but keeps the counts", async () => {
      await logPass({ paths: [sandboxDir("downloads")] });
      await logPass({ paths: [sandboxDir("pictures")] });

      const digest = digestOf(
        await handleOrganizerDigest({
          ...wideWindow(),
          privacy_mode: "redacted",
          response_format: "json",
        }),
      );

      expect(digest.totals.passes).toBe(2);
      // Both directories redact to the same label, so they collapse into one
      // row. The mode is allowed to cost resolution, but not a number.
      expect(digest.by_directory).toHaveLength(1);
      expect(first(digest.by_directory).directory).toBe("[REDACTED]");
      expect(first(digest.by_directory).passes).toBe(2);
    });

    it("counts an entry that recorded no directory at all", async () => {
      await logPass({ paths: undefined });

      const digest = digestOf(
        await handleOrganizerDigest({
          ...wideWindow(),
          privacy_mode: "none",
          response_format: "json",
        }),
      );

      expect(digest.totals.passes).toBe(1);
      expect(first(digest.by_directory).directory).toBe("(no directory recorded)");
    });
  });
});
