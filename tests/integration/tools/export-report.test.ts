/**
 * Integration tests for file_organizer_export_report.
 *
 * The handler runs the real scanner, categorizer and hasher over a sandbox
 * directory and writes through the real path validator, so these assert on what
 * a user receives and what lands on disk rather than on a stubbed return.
 *
 * Three properties carry the design and each has its own test:
 *
 *   1. omit output_path and NOTHING is written. The dry-run guarantee is
 *      structural rather than a flag somebody has to remember to pass;
 *   2. give output_path and the bytes on disk are the report itself, not a
 *      wrapper around it;
 *   3. give output_path a second time and the existing file is untouched.
 *
 * Every fixture path derives from os.tmpdir() and os.homedir(), never a
 * hardcoded root. The sandbox base is realpath'd once in beforeEach, listings
 * are sorted before comparison, and path assertions compare resolved paths, so
 * the suite holds on macOS (/var -> /private/var) and Windows (8.3 short names,
 * backslash separators) as well as on Linux.
 */

import fs from "fs/promises";
import fsSync from "fs";
import os from "os";
import path from "path";
import {
  handleExportReport,
  exportReportToolDefinition,
} from "../../../src/tools/export-report.js";
import { createRequestContext } from "../../../src/mcp/context.js";
import type { ToolContext } from "../../../src/mcp/context.js";
import type { ToolResponse } from "../../../src/mcp/types.js";
import { exportReportOutputSchema } from "../../../src/schemas/output.js";
import { getUserConfigPath } from "../../../src/core/config/paths.js";
import { getAlwaysBlockedPatterns } from "../../../src/core/config/security.js";

/**
 * A usable base for the sandbox. os.tmpdir() is /var/folders/... on macOS and
 * /var is always blocked while /private/var is deliberately not, so the
 * realpath is the usable form and the raw path is the fallback.
 */
function sandboxBase(): string {
  const blocked = getAlwaysBlockedPatterns();
  const usable = (dir: string): boolean =>
    fsSync.existsSync(dir) && !blocked.some((pattern) => pattern.test(dir));

  for (const candidate of [fsSync.realpathSync(os.tmpdir()), os.tmpdir()]) {
    if (usable(candidate)) return candidate;
  }
  throw new Error(
    `No unblocked base for the sandbox; os.tmpdir() is ${os.tmpdir()}`,
  );
}

/** Byte totals of the seeded fixture, asserted literally rather than derived. */
const BIG_TXT_SIZE = 3000;
const MID_TXT_SIZE = 200;
const SHARED_LOG_SIZE = "shared log bytes".length;
const SHARED_JPG_SIZE = "jpeg bytes here".length;
const SEEDED_FILES = 8;
const TOTAL_BYTES =
  BIG_TXT_SIZE +
  MID_TXT_SIZE +
  1 + // small.txt
  0 + // empty.txt
  SHARED_LOG_SIZE * 2 +
  SHARED_JPG_SIZE * 2;

interface HealthReport {
  directory: string;
  include_subdirs: boolean;
  generated_at: string;
  output_path: string | null;
  written: boolean;
  bytes_written?: number;
  scan: { total_files: number; total_size: number; total_size_readable: string };
  categories: Array<{
    category: string;
    file_count: number;
    total_size: number;
    total_size_readable: string;
    percent_of_total: number;
  }>;
  duplicates: {
    total_groups: number;
    total_files: number;
    wasted_space: number;
    wasted_space_readable: string;
    groups_listed: number;
    groups: Array<{
      hash: string;
      count: number;
      size: string;
      size_bytes: number;
      files: string[];
    }>;
    skipped_count: number;
    skipped_bytes: number;
  };
  top_files: Array<{
    name: string;
    path: string;
    size: number;
    size_readable: string;
  }>;
  limits: string[];
}

function report(result: ToolResponse): HealthReport {
  expect(result.structuredContent).toBeDefined();
  return result.structuredContent as unknown as HealthReport;
}

const originalHome = os.homedir;
const originalXdg = process.env.XDG_CONFIG_HOME;
const originalAppData = process.env.APPDATA;

let sandboxHome: string;
let dataDir: string;
let nestedDir: string;
let configPath: string;

/**
 * The validator reads the allow-list from the user's config on every call, so
 * the sandbox has to grant access to the directory under report the way a real
 * user would. Without this the tool correctly refuses the path and every
 * assertion here would be about the refusal.
 */
async function writeConfig(): Promise<void> {
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(
    configPath,
    JSON.stringify(
      { customAllowedDirectories: [dataDir], conflictStrategy: "rename" },
      null,
      2,
    ),
    "utf-8",
  );
}

/**
 * Seed shapes the real code has to cope with: a nested tree, two byte-identical
 * pairs at different depths, an empty file that duplicate detection must skip
 * and admit to skipping, and files of clearly different sizes so the
 * largest-first ordering is checkable.
 */
async function seed(): Promise<void> {
  nestedDir = path.join(dataDir, "nested");
  await fs.mkdir(nestedDir, { recursive: true });
  await fs.writeFile(
    path.join(dataDir, "big.txt"),
    "x".repeat(BIG_TXT_SIZE),
    "utf-8",
  );
  await fs.writeFile(
    path.join(dataDir, "mid.txt"),
    "y".repeat(MID_TXT_SIZE),
    "utf-8",
  );
  await fs.writeFile(path.join(dataDir, "small.txt"), "z", "utf-8");
  await fs.writeFile(path.join(dataDir, "empty.txt"), "", "utf-8");
  await fs.writeFile(
    path.join(dataDir, "dupe-a.log"),
    "shared log bytes",
    "utf-8",
  );
  await fs.writeFile(
    path.join(dataDir, "dupe-b.log"),
    "shared log bytes",
    "utf-8",
  );
  await fs.writeFile(
    path.join(nestedDir, "photo-a.jpg"),
    "jpeg bytes here",
    "utf-8",
  );
  await fs.writeFile(
    path.join(nestedDir, "photo-b.jpg"),
    "jpeg bytes here",
    "utf-8",
  );
}

async function contextFromDisk(): Promise<ToolContext> {
  return createRequestContext();
}

/** Sorted top-level names, because readdir order is filesystem-dependent. */
async function topLevelNames(): Promise<string[]> {
  return (await fs.readdir(dataDir)).sort();
}

beforeEach(async () => {
  sandboxHome = await fs.mkdtemp(path.join(sandboxBase(), "fom-report-"));
  os.homedir = () => sandboxHome;
  process.env.XDG_CONFIG_HOME = path.join(sandboxHome, ".config");
  process.env.APPDATA = path.join(sandboxHome, "AppData", "Roaming");
  // The config dir is platform-specific, so it comes from the loader's helper.
  configPath = getUserConfigPath();
  dataDir = path.join(sandboxHome, "Documents");
  await fs.mkdir(dataDir, { recursive: true });
  await seed();
  await writeConfig();
});

afterEach(async () => {
  os.homedir = originalHome;
  if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = originalXdg;
  if (originalAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = originalAppData;
  // Windows keeps handles briefly after a write.
  await new Promise((resolve) => setTimeout(resolve, 100));
  await fs.rm(sandboxHome, { recursive: true, force: true });
});

describe("file_organizer_export_report", () => {
  it("reports totals, categories, duplicates and largest files from one walk", async () => {
    const ctx = await contextFromDisk();
    const result = await handleExportReport(
      { directory: dataDir, response_format: "json" },
      ctx,
    );
    const body = report(result);

    expect(result.isError).toBeFalsy();
    expect(body.directory).toBe(await fs.realpath(dataDir));
    expect(body.include_subdirs).toBe(true);

    // The walk is real, so the totals are the seeded fixture's, not placeholders.
    expect(body.scan.total_files).toBe(SEEDED_FILES);
    expect(body.scan.total_size).toBe(TOTAL_BYTES);

    // Categories come from the same categorizer organize_files uses, so the
    // extension decides and nothing here is invented by the tool.
    expect(body.categories).toEqual([
      {
        category: "Documents",
        file_count: 4,
        total_size: BIG_TXT_SIZE + MID_TXT_SIZE + 1,
        total_size_readable: "3.13 KB",
        percent_of_total: 98.1,
      },
      {
        category: "Logs",
        file_count: 2,
        total_size: SHARED_LOG_SIZE * 2,
        total_size_readable: "32 Bytes",
        percent_of_total: 0.98,
      },
      {
        category: "Images",
        file_count: 2,
        total_size: SHARED_JPG_SIZE * 2,
        total_size_readable: "30 Bytes",
        percent_of_total: 0.92,
      },
    ]);

    // Both pairs were found, which is only possible because include_subdirs
    // defaults to true.
    expect(body.duplicates.total_groups).toBe(2);
    expect(body.duplicates.total_files).toBe(4);
    expect(body.duplicates.wasted_space).toBe(SHARED_LOG_SIZE + SHARED_JPG_SIZE);
    // Largest first, and the biggest seeded file leads.
    expect(body.top_files[0]?.name).toBe("big.txt");
    expect(body.top_files).toHaveLength(SEEDED_FILES);
    for (let i = 1; i < body.top_files.length; i++) {
      expect(body.top_files[i - 1]!.size).toBeGreaterThanOrEqual(
        body.top_files[i]!.size,
      );
    }
  });

  it("writes nothing at all when output_path is omitted", async () => {
    const before = await topLevelNames();

    const ctx = await contextFromDisk();
    const result = await handleExportReport(
      { directory: dataDir, response_format: "json" },
      ctx,
    );
    const body = report(result);

    // The report came back...
    expect(result.isError).toBeFalsy();
    expect(body.written).toBe(false);
    expect(body.output_path).toBeNull();
    expect(body.scan.total_files).toBe(SEEDED_FILES);

    // ...and the directory gained nothing: same names, no report file, no temp
    // file. This is the whole dry-run guarantee, asserted on the filesystem.
    expect(await topLevelNames()).toEqual(before);
  });

  it("writes the report to output_path and the bytes on disk are that report", async () => {
    const outputPath = path.join(dataDir, "report.json");
    const ctx = await contextFromDisk();
    const result = await handleExportReport(
      { directory: dataDir, output_path: outputPath, response_format: "json" },
      ctx,
    );
    const body = report(result);

    expect(result.isError).toBeFalsy();
    expect(body.written).toBe(true);
    expect(body.output_path).toBe(await fs.realpath(outputPath));
    expect(body.bytes_written).toBeGreaterThan(0);

    const onDisk = await fs.readFile(outputPath, "utf-8");
    expect(Buffer.byteLength(onDisk, "utf-8")).toBe(body.bytes_written);
    // The file cannot state its own size before it exists, so the receipt lives
    // on the response only. Everything else about the write is IN the file.
    expect((JSON.parse(onDisk) as { bytes_written?: number }).bytes_written)
      .toBeUndefined();

    // The file parses as the report itself, not a wrapper, so a reader gets the
    // numbers from one object.
    const parsed: unknown = JSON.parse(onDisk);
    const checked = exportReportOutputSchema.safeParse(parsed);
    expect(checked.success).toBe(true);
    if (!checked.success) return;
    expect(checked.data.scan.total_files).toBe(SEEDED_FILES);
    expect(checked.data.duplicates.total_groups).toBe(2);
    expect(checked.data.top_files[0]?.name).toBe("big.txt");
    // A file that exists must not claim it was not written.
    expect(checked.data.written).toBe(true);
    expect(checked.data.output_path).toBe(await fs.realpath(outputPath));

    expect(await topLevelNames()).toContain("report.json");
  });

  it("refuses to overwrite an existing report file", async () => {
    const outputPath = path.join(dataDir, "report.json");
    await fs.writeFile(outputPath, "a report someone cares about", "utf-8");

    const ctx = await contextFromDisk();
    const result = await handleExportReport(
      { directory: dataDir, output_path: outputPath },
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("already exists");
    // The refusal is the point, so prove the old bytes survived it.
    expect(await fs.readFile(outputPath, "utf-8")).toBe(
      "a report someone cares about",
    );
  });

  it("counts the empty file in the totals and admits it was not compared", async () => {
    const ctx = await contextFromDisk();
    const result = await handleExportReport(
      { directory: dataDir, response_format: "json" },
      ctx,
    );
    const body = report(result);

    // A 0-byte file counts toward the scan but cannot be a duplicate, so the
    // duplicate totals are a lower bound and the report has to say so.
    expect(body.scan.total_files).toBe(SEEDED_FILES);
    expect(body.duplicates.skipped_count).toBe(1);
    expect(body.limits.join(" ")).toContain("not compared for duplicates");
  });

  it("keeps the duplicate totals whole when the listed groups are capped", async () => {
    const ctx = await contextFromDisk();
    const result = await handleExportReport(
      { directory: dataDir, duplicate_limit: 1, response_format: "json" },
      ctx,
    );
    const body = report(result);

    // The cap trims the list, never the numbers. A report that claimed two
    // groups and then showed none would be worse than no report.
    expect(body.duplicates.total_groups).toBe(2);
    expect(body.duplicates.groups_listed).toBe(1);
    expect(body.duplicates.groups).toHaveLength(1);
    expect(body.duplicates.wasted_space).toBe(SHARED_LOG_SIZE + SHARED_JPG_SIZE);
    expect(body.limits.join(" ")).toContain("1 of 2 duplicate groups");
  });

  it("reports the whole top level when include_subdirs is false", async () => {
    const ctx = await contextFromDisk();
    const result = await handleExportReport(
      { directory: dataDir, include_subdirs: false, response_format: "json" },
      ctx,
    );
    const body = report(result);

    // The nested pair was never seen, so there is one group and six files.
    expect(body.scan.total_files).toBe(6);
    expect(body.duplicates.total_groups).toBe(1);
    expect(body.duplicates.total_files).toBe(2);
    expect(body.include_subdirs).toBe(false);
    // A report that stopped early has to admit it rather than let a small count
    // read as the whole directory's truth.
    expect(body.limits.join(" ")).toContain("include_subdirs is false");
  });

  it("refuses an output path the security policy always blocks", async () => {
    // node_modules is on the blocked list on every platform, so this exercises
    // validateStrictPath rather than a platform-specific allow-list rule.
    const blocked = path.join(sandboxHome, "node_modules", "report.json");

    const ctx = await contextFromDisk();
    const result = await handleExportReport(
      { directory: dataDir, output_path: blocked },
      ctx,
    );

    expect(result.isError).toBe(true);
    // The blocked path was never created. The config directory name is
    // platform-specific, so only the name this test controls is asserted.
    const entries = await fs.readdir(sandboxHome);
    expect(entries.filter((name) => name === "node_modules")).toEqual([]);
  });

  it("does not leak the requested path in a rejection", async () => {
    const blocked = path.join(sandboxHome, "node_modules", "report.json");

    const ctx = await contextFromDisk();
    const result = await handleExportReport(
      { directory: dataDir, output_path: blocked },
      ctx,
    );
    const text = result.content.map((item) => item.text).join("\n");

    // Pin the rejection as well as the absence of a leak: an ENOENT on the
    // non-existent node_modules directory would also produce a path-free
    // message, so without these two the test would still pass if the blocklist
    // check stopped working.
    expect(result.isError).toBe(true);
    expect(text).toContain("Access denied");
    expect(text).not.toContain(sandboxHome);
  });

  it("structuredContent parses against the declared outputSchema in both formats", async () => {
    const ctx = await contextFromDisk();
    for (const response_format of ["json", "markdown"] as const) {
      const result = await handleExportReport({ directory: dataDir, response_format }, ctx);
      const parsed = exportReportOutputSchema.safeParse(result.structuredContent);
      expect(parsed.success).toBe(true);
      if (!parsed.success) continue;
      // Non-default values in every section, so an empty report cannot pass.
      expect(parsed.data.directory).toBe(await fs.realpath(dataDir));
      expect(parsed.data.scan.total_files).toBe(SEEDED_FILES);
      expect(parsed.data.categories).toHaveLength(3);
      expect(parsed.data.duplicates.total_groups).toBe(2);
      expect(parsed.data.top_files[0]?.name).toBe("big.txt");
    }
  });

  it("renders a markdown response carrying every section", async () => {
    const ctx = await contextFromDisk();
    const result = await handleExportReport({ directory: dataDir }, ctx);
    const text = result.content[0].text;

    expect(text).toContain("### Health Report for");
    expect(text).toContain("#### Space by category");
    expect(text).toContain("| Category | Files | Size | Share |");
    expect(text).toContain("#### Duplicates");
    expect(text).toContain("#### Largest files");
    expect(text).toContain("big.txt");
    // Nothing was written, so the markdown has to say so out loud.
    expect(text).toContain("nothing was written");
    // The markdown path still carries structuredContent, because the tool
    // declares an outputSchema and the SDK rejects a result without it.
    expect(result.structuredContent).toBeDefined();
  });

  it("declares annotations that match what it does", () => {
    expect(exportReportToolDefinition.annotations).toEqual({
      // It writes the report file when output_path is given.
      readOnlyHint: false,
      // The exclusive write never replaces an existing file.
      destructiveHint: false,
      // A second run at the same output path fails, and generated_at moves, so a
      // repeat does not converge on a no-op.
      idempotentHint: false,
      openWorldHint: false,
    });
  });

  it("rejects a report request with no directory", async () => {
    const ctx = await contextFromDisk();
    const result = await handleExportReport({ response_format: "json" }, ctx);

    expect(result.isError).toBe(true);
    expect(await topLevelNames()).not.toContain("report.json");
  });
});
