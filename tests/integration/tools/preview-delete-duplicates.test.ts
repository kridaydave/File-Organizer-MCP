/**
 * preview_delete_duplicates — behavioral tests for the tool surface.
 *
 * Covers what the issue names: a dry-run that groups duplicates, names the one
 * copy that survives under each explicit keep-strategy, and hands back a flat
 * list to feed to delete_duplicates — without touching a single file. The
 * sandbox lives under os.tmpdir() and is granted through
 * CONFIG.paths.customAllowed, which is also what keeps a directory outside the
 * allowed roots out of reach.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import fs from "fs/promises";
import os from "os";
import path from "path";

const { CONFIG } = await import("../../../src/config.js");
const { getToolHandler, TOOLS } = await import("../../../src/mcp/registry.js");
const { handlePreviewDeleteDuplicates } =
  await import("../../../src/tools/duplicate-management.js");
const { previewDeleteDuplicatesOutputSchema } =
  await import("../../../src/schemas/output.js");

describe("preview_delete_duplicates", () => {
  let testDir: string;
  let restoreCustomAllowed: string[] | undefined;
  let realTestDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "preview-delete-dupes-"));
    // The tool realpaths what validateStrictPath returns, so compare canonical
    // paths on both sides rather than pinning one platform's /var spelling.
    realTestDir = await fs.realpath(testDir);
    restoreCustomAllowed = CONFIG.paths._overrideCustomAllowed;
    CONFIG.paths.customAllowed = [os.tmpdir()];
  });

  afterEach(async () => {
    CONFIG.paths.customAllowed = restoreCustomAllowed;
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  /**
   * Write a duplicate pair and return their canonical paths. Names sort so the
   * older copy also comes first in a directory listing, which is what makes the
   * keep_first assertion meaningful.
   */
  const writePair = async (dir: string, base: string, content: string) => {
    const first = path.join(dir, `${base}-first.txt`);
    const second = path.join(dir, `${base}-second.txt`);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(first, content);
    await fs.writeFile(second, content);
    await fs.utimes(
      first,
      new Date("2020-01-01T00:00:00Z"),
      new Date("2020-01-01T00:00:00Z"),
    );
    await fs.utimes(
      second,
      new Date("2022-01-01T00:00:00Z"),
      new Date("2022-01-01T00:00:00Z"),
    );
    return { oldest: first, newest: second };
  };

  type PreviewOutput = {
    dry_run: boolean;
    keep_strategy: string;
    summary: {
      total_duplicate_groups: number;
      total_files_to_delete: number;
      total_wasted_space_bytes: number;
      total_wasted_space_readable: string;
      not_analyzed_files: number;
      not_analyzed_bytes: number;
    };
    duplicate_groups: {
      hash: string;
      size_bytes: number;
      file_count: number;
      keep: string;
      would_delete: string[];
      wasted_space_bytes: number;
    }[];
    files_to_delete: string[];
    skipped: { path: string; reason: string }[];
  };

  async function preview(
    directory: string,
    keep_strategy?: string,
    response_format: "json" | "markdown" = "json",
  ) {
    const res = await handlePreviewDeleteDuplicates({
      directory,
      ...(keep_strategy ? { keep_strategy } : {}),
      response_format,
    });
    expect(res.isError).toBeUndefined();
    return res;
  }

  it("is registered with an honest read-only annotation", () => {
    const def = TOOLS.find(
      (t) => t.name === "file_organizer_preview_delete_duplicates",
    );
    expect(def).toBeDefined();
    expect(getToolHandler("file_organizer_preview_delete_duplicates")).toBe(
      handlePreviewDeleteDuplicates,
    );
    expect(def!.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    });
  });

  it("names the newest survivor and the files a delete would remove", async () => {
    await writePair(testDir, "report", "quarterly numbers");

    const res = await preview(testDir, "newest");
    const out = res.structuredContent as PreviewOutput;

    expect(out.dry_run).toBe(true);
    expect(out.keep_strategy).toBe("newest");
    expect(out.summary.total_duplicate_groups).toBe(1);
    expect(out.summary.total_files_to_delete).toBe(1);
    // "quarterly numbers" is 17 bytes, one whole copy of it would be reclaimed.
    expect(out.summary.total_wasted_space_bytes).toBe(17);
    expect(out.summary.total_wasted_space_readable).toBe("17 Bytes");
    expect(out.duplicate_groups).toHaveLength(1);
    expect(out.duplicate_groups[0]!.size_bytes).toBe(17);
    expect(out.duplicate_groups[0]!.keep).toBe(
      path.join(realTestDir, "report-second.txt"),
    );
    expect(out.duplicate_groups[0]!.would_delete).toEqual([
      path.join(realTestDir, "report-first.txt"),
    ]);
    // Ready to paste straight into delete_duplicates.
    expect(out.files_to_delete).toEqual([
      path.join(realTestDir, "report-first.txt"),
    ]);
    expect(out.skipped).toEqual([]);
    // The advertised contract is the JSON Schema and the zod schema together.
    expect(previewDeleteDuplicatesOutputSchema.parse(out)).toEqual(out);
  });

  it("names the oldest survivor when asked", async () => {
    const pair = await writePair(testDir, "report", "quarterly numbers");
    expect(pair.newest).not.toBe(pair.oldest);

    const out = (await preview(testDir, "oldest"))
      .structuredContent as PreviewOutput;

    expect(out.keep_strategy).toBe("oldest");
    expect(out.duplicate_groups[0]!.keep).toBe(
      path.join(realTestDir, "report-first.txt"),
    );
    expect(out.files_to_delete).toEqual([
      path.join(realTestDir, "report-second.txt"),
    ]);
  });

  it("names the first scanned survivor under keep_first", async () => {
    const sub = path.join(testDir, "zsub");
    await writePair(sub, "report", "quarterly numbers");

    const out = (await preview(testDir, "keep_first"))
      .structuredContent as PreviewOutput;

    expect(out.keep_strategy).toBe("keep_first");
    expect(out.duplicate_groups[0]!.keep).toBe(
      path.join(realTestDir, "zsub", "report-first.txt"),
    );
    expect(out.files_to_delete).toEqual([
      path.join(realTestDir, "zsub", "report-second.txt"),
    ]);
  });

  it("deletes nothing, in either response format", async () => {
    const sub = path.join(testDir, "sub");
    await writePair(sub, "report", "quarterly numbers");
    const before = await fs.readdir(sub);

    const markdown = await preview(testDir, "newest", "markdown");
    const json = await preview(testDir, "newest", "json");

    expect(await fs.readdir(sub)).toEqual(before);
    await expect(
      fs.readFile(path.join(sub, "report-first.txt"), "utf-8"),
    ).resolves.toBe("quarterly numbers");

    const text = markdown.content
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("\n");
    expect(text).toContain("**Keep Strategy:** newest");
    expect(text).toContain(
      "`" + path.join(realTestDir, "sub", "report-first.txt") + "`",
    );
    expect(json.structuredContent).toBeDefined();
  });

  it("rejects an unknown keep_strategy without scanning", async () => {
    await writePair(testDir, "report", "quarterly numbers");

    const res = await handlePreviewDeleteDuplicates({
      directory: testDir,
      keep_strategy: "largest",
      response_format: "json",
    });

    expect(res.isError).toBe(true);
    const text = res.content
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("");
    expect(text).toContain("Error:");
  });

  it("refuses a directory outside the allowed roots", async () => {
    const res = await handlePreviewDeleteDuplicates({
      directory: os.homedir(),
      response_format: "json",
    });

    expect(res.isError).toBe(true);
    // The refusal must not hand back the path it was protecting.
    const text = res.content
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("");
    expect(text).not.toContain(os.homedir());
  });
});
