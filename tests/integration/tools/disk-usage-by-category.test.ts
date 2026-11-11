/**
 * file_organizer_disk_usage_by_category — behavioral tests.
 *
 * The tool sums bytes the scanner already reported, so these tests write files
 * of known byte length and assert the exact totals, counts, and shares that
 * follow from them. The sandbox lives under os.tmpdir() and is granted through
 * CONFIG.paths.customAllowed, the same knob the symlink audit uses.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "@jest/globals";
import fs from "fs/promises";
import os from "os";
import path from "path";

const { CONFIG } = await import("../../../src/config.js");
const { handleDiskUsageByCategory } = await import(
  "../../../src/tools/file-analysis.js"
);
const { diskUsageByCategoryOutputSchema } = await import(
  "../../../src/schemas/output.js"
);

type CategoryUsage = {
  category: string;
  file_count: number;
  total_size: number;
  total_size_readable: string;
  percent_of_total: number;
};

type Usage = {
  directory: string;
  total_files: number;
  total_size: number;
  total_size_readable: string;
  categories: CategoryUsage[];
};

/** Write a file of exactly `bytes` bytes so the expected totals are literal. */
async function writeSized(filePath: string, bytes: number): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, Buffer.alloc(bytes, "x"));
}

describe("file_organizer_disk_usage_by_category", () => {
  let testDir: string;
  let restoreCustomAllowed: string[] | undefined;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "disk-usage-"));
    restoreCustomAllowed = CONFIG.paths._overrideCustomAllowed;
    CONFIG.paths.customAllowed = [os.tmpdir()];
  });

  afterEach(async () => {
    CONFIG.paths.customAllowed = restoreCustomAllowed;
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  async function usage(
    args: Record<string, unknown> = {},
  ): Promise<Usage> {
    const res = await handleDiskUsageByCategory({
      directory: testDir,
      response_format: "json",
      ...args,
    });
    expect(res.isError).toBeUndefined();
    expect(diskUsageByCategoryOutputSchema.safeParse(res.structuredContent).success).toBe(
      true,
    );
    return res.structuredContent as unknown as Usage;
  }

  it("reports bytes, counts, and share per category", async () => {
    await writeSized(path.join(testDir, "movie.mp4"), 2048);
    await writeSized(path.join(testDir, "trailer.mp4"), 1024);
    await writeSized(path.join(testDir, "notes.txt"), 512);
    await writeSized(path.join(testDir, "nested", "theme.mp3"), 256);

    const out = await usage();

    expect(out.total_files).toBe(4);
    expect(out.total_size).toBe(3840);
    expect(out.total_size_readable).toBe("3.75 KB");
    expect(out.categories).toEqual([
      {
        category: "Videos",
        file_count: 2,
        total_size: 3072,
        total_size_readable: "3 KB",
        percent_of_total: 80,
      },
      {
        category: "Documents",
        file_count: 1,
        total_size: 512,
        total_size_readable: "512 Bytes",
        percent_of_total: 13.33,
      },
      {
        category: "Audio",
        file_count: 1,
        total_size: 256,
        total_size_readable: "256 Bytes",
        percent_of_total: 6.67,
      },
    ]);
  });

  it("counts files in subdirectories by default and skips them on request", async () => {
    await writeSized(path.join(testDir, "top.mp4"), 1000);
    await writeSized(path.join(testDir, "nested", "inner.mp4"), 24);

    const recursive = await usage();
    expect(recursive.total_files).toBe(2);
    expect(recursive.total_size).toBe(1024);
    expect(recursive.categories[0]?.category).toBe("Videos");
    expect(recursive.categories[0]?.file_count).toBe(2);

    const shallow = await usage({ include_subdirs: false });
    expect(shallow.total_files).toBe(1);
    expect(shallow.total_size).toBe(1000);
    expect(shallow.categories[0]?.percent_of_total).toBe(100);
  });

  it("sums to the bytes actually on disk", async () => {
    // Reported bytes come from the scan, not from a second walk or a guess,
    // so they must equal the sizes stat reports for the same files.
    await writeSized(path.join(testDir, "a.mp4"), 1234);
    await writeSized(path.join(testDir, "b.pdf"), 5678);

    const out = await usage();
    const onDisk = await Promise.all(
      [path.join(testDir, "a.mp4"), path.join(testDir, "b.pdf")].map(
        async (p) => (await fs.stat(p)).size,
      ),
    );

    expect(out.total_size).toBe(onDisk.reduce((a, b) => a + b, 0));
    expect(out.categories.map((c) => c.total_size).reduce((a, b) => a + b, 0)).toBe(
      out.total_size,
    );
  });

  it("reports an empty directory instead of dividing by zero", async () => {
    const out = await usage();

    expect(out.total_files).toBe(0);
    expect(out.total_size).toBe(0);
    expect(out.total_size_readable).toBe("0 Bytes");
    expect(out.categories).toEqual([]);
  });

  it("carries the total and each share in the markdown response", async () => {
    await writeSized(path.join(testDir, "movie.mp4"), 750);
    await writeSized(path.join(testDir, "notes.txt"), 250);

    const res = await handleDiskUsageByCategory({ directory: testDir });
    const text = res.content[0]?.text ?? "";

    expect(text).toContain("**Total:** 2 file(s), 1000 Bytes");
    expect(text).toContain("| Videos | 1 | 750 Bytes | 75% |");
    expect(text).toContain("| Documents | 1 | 250 Bytes | 25% |");
    // The tool declares an outputSchema, so markdown responses carry
    // structuredContent too.
    expect(res.structuredContent).toBeDefined();
  });

  it("refuses a directory outside the allowed roots", async () => {
    const res = await handleDiskUsageByCategory({
      directory: path.parse(os.tmpdir()).root,
      response_format: "json",
    });

    expect(res.isError).toBe(true);
  });

  it("rejects an empty directory before touching the filesystem", async () => {
    const res = await handleDiskUsageByCategory({
      directory: "",
      response_format: "json",
    });

    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toContain("Directory path cannot be empty");
  });

  it("serves the tool from the registry", async () => {
    const { getToolHandler } = await import("../../../src/mcp/registry.js");

    expect(getToolHandler("file_organizer_disk_usage_by_category")).toBe(
      handleDiskUsageByCategory,
    );
  });
});
