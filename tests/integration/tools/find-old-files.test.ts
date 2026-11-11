/**
 * file_organizer_find_old_files — tool wiring and behavior.
 *
 * Files are aged with fs.utimes, so the fixture is deterministic and the suite
 * never sleeps. The sandbox lives under os.tmpdir() and is granted through
 * CONFIG.paths.customAllowed so validateStrictPath accepts it.
 *
 * atime is asserted through a file whose mtime is recent and atime is old, so
 * a run that ignored age_source would report the opposite answer. Note that a
 * read can refresh atime on some mounts; the tests set atime explicitly after
 * writing and only read files the scan does not depend on for atime.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import fs from "fs/promises";
import os from "os";
import path from "path";

const { CONFIG } = await import("../../../src/config.js");
const { handleFindOldFiles } = await import("../../../src/tools/file-analysis.js");
const { getToolHandler, TOOLS } = await import(
  "../../../src/mcp/registry.js"
);

const DAY = 24 * 60 * 60 * 1000;

describe("file_organizer_find_old_files", () => {
  let testDir: string;
  let restoreCustomAllowed: string[] | undefined;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "find-old-files-"));
    restoreCustomAllowed = CONFIG.paths._overrideCustomAllowed;
    CONFIG.paths.customAllowed = [os.tmpdir()];
  });

  afterEach(async () => {
    CONFIG.paths.customAllowed = restoreCustomAllowed;
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  /** Write a file with mtime `mtimeDays` ago and atime `atimeDays` ago. */
  async function seed(
    name: string,
    mtimeDays: number,
    atimeDays = mtimeDays,
  ): Promise<string> {
    const filePath = path.join(testDir, name);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "x");
    const now = Date.now();
    await fs.utimes(
      filePath,
      new Date(now - atimeDays * DAY),
      new Date(now - mtimeDays * DAY),
    );
    return filePath;
  }

  type OldFile = {
    name: string;
    path: string;
    size: number;
    size_readable: string;
    age_days: number;
    accessed_or_modified: string;
  };

  async function find(
    args: Record<string, unknown>,
  ): Promise<{
    directory: string;
    age_source: "mtime" | "atime";
    older_than_days: number;
    total_count: number;
    returned_count: number;
    old_files: OldFile[];
  }> {
    const res = await handleFindOldFiles({
      directory: testDir,
      response_format: "json",
      ...args,
    });
    expect(res.isError).toBeUndefined();
    return res.structuredContent as never;
  }

  it("is registered with an honest read-only annotation", () => {
    const def = TOOLS.find((t) => t.name === "file_organizer_find_old_files");
    expect(def?.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
    expect(getToolHandler("file_organizer_find_old_files")).toBe(
      handleFindOldFiles,
    );
  });

  it("returns only files past the mtime threshold, oldest first", async () => {
    await seed("ancient.txt", 800);
    await seed("recent.txt", 10);

    const out = await find({ older_than_days: 365 });

    expect(out.total_count).toBe(1);
    expect(out.returned_count).toBe(1);
    expect(out.age_source).toBe("mtime");
    expect(out.older_than_days).toBe(365);
    expect(out.old_files.map((f) => f.name)).toEqual(["ancient.txt"]);

    const [oldest] = out.old_files;
    expect(oldest?.age_days).toBeGreaterThanOrEqual(365);
    expect(oldest?.size_readable).toBe("1 Bytes");
    expect(Number.isNaN(Date.parse(oldest?.accessed_or_modified ?? ""))).toBe(
      false,
    );
  });

  it("orders several matches oldest first", async () => {
    await seed("a-2000d.txt", 2000);
    await seed("b-1000d.txt", 1000);
    await seed("c-400d.txt", 400);

    const out = await find({ older_than_days: 365 });

    expect(out.old_files.map((f) => f.name)).toEqual([
      "a-2000d.txt",
      "b-1000d.txt",
      "c-400d.txt",
    ]);
    expect(out.old_files.map((f) => f.age_days)).toEqual([
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    ]);
  });

  it("caps the list at top_n while total_count stays uncapped", async () => {
    await seed("a.txt", 900);
    await seed("b.txt", 800);
    await seed("c.txt", 700);

    const out = await find({ older_than_days: 365, top_n: 2 });

    expect(out.total_count).toBe(3);
    expect(out.returned_count).toBe(2);
    expect(out.old_files.map((f) => f.name)).toEqual(["a.txt", "b.txt"]);
  });

  it("measures from atime when age_source asks for it", async () => {
    // Modified yesterday, never touched since: old by atime only.
    await seed("read-but-not-edited.txt", 1, 900);

    const byAtime = await find({ older_than_days: 365, age_source: "atime" });
    const byMtime = await find({ older_than_days: 365 });

    expect(byAtime.age_source).toBe("atime");
    expect(byAtime.old_files.map((f) => f.name)).toEqual([
      "read-but-not-edited.txt",
    ]);
    expect(byMtime.old_files).toEqual([]);
  });

  it("skips subdirectories unless include_subdirs is set", async () => {
    await seed(path.join("nested", "deep-old.txt"), 800);
    await seed("top-old.txt", 800);

    const shallow = await find({ older_than_days: 365 });
    expect(shallow.old_files.map((f) => f.name)).toEqual(["top-old.txt"]);

    const deep = await find({ older_than_days: 365, include_subdirs: true });
    expect(deep.old_files.map((f) => f.name).sort()).toEqual([
      "deep-old.txt",
      "top-old.txt",
    ]);
  });

  it("reports an empty result when nothing is old enough", async () => {
    await seed("fresh.txt", 2);

    const out = await find({ older_than_days: 365 });

    expect(out.total_count).toBe(0);
    expect(out.returned_count).toBe(0);
    expect(out.old_files).toEqual([]);
  });

  it("renders markdown for the human path", async () => {
    await seed("ancient.txt", 800);

    const res = await handleFindOldFiles({
      directory: testDir,
      older_than_days: 365,
    });

    const text = res.content[0].text;
    expect(text).toContain("ancient.txt");
    expect(text).toContain("365 day(s)");
    expect(text).toContain("not modified");
  });

  it("rejects a zero or negative threshold", async () => {
    await seed("ancient.txt", 800);

    for (const older_than_days of [0, -30]) {
      const res = await handleFindOldFiles({
        directory: testDir,
        older_than_days,
      });
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain("older_than_days");
    }
  });

  it("rejects an absurd threshold", async () => {
    const res = await handleFindOldFiles({
      directory: testDir,
      older_than_days: 100000,
    });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("older_than_days");
  });

  it("rejects a fractional threshold", async () => {
    const res = await handleFindOldFiles({
      directory: testDir,
      older_than_days: 30.5,
    });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("whole number of days");
  });

  it("refuses a directory outside the allowed roots without leaking the path", async () => {
    const res = await handleFindOldFiles({
      directory: path.join(os.tmpdir(), "..", "..", "etc"),
    });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).not.toContain(os.tmpdir());
  });
});