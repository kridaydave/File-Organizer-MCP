/**
 * Integration tests for file_organizer_export_config.
 *
 * The tool reads the user config through the real loader and writes the bundle
 * through the real path validator, so these drive the actual surfaces: a sandbox
 * home as the user config dir, a seeded config.json, and a real ToolContext.
 *
 * Every fixture path is derived from os.tmpdir()/os.homedir() and the path the
 * loader itself reports, never hardcoded. Path assertions compare resolved
 * paths or re-expanded `~/…` values, and directory listings are sorted, so the
 * suite holds on macOS (/var -> /private/var) and Windows (8.3 short names,
 * backslash separators) as well as Linux.
 */

import fs from "fs/promises";
import fsSync from "fs";
import os from "os";
import path from "path";
import {
  handleExportConfig,
  exportConfigToolDefinition,
} from "../../../src/tools/file-management.js";
import { createRequestContext } from "../../../src/mcp/context.js";
import type { ToolContext } from "../../../src/mcp/context.js";
import type { UserConfig } from "../../../src/core/config/loader.js";
import { getUserConfigPath } from "../../../src/core/config/paths.js";
import { loadConfigBundle } from "../../../src/core/config/portable-bundle.js";
import { exportConfigOutputSchema } from "../../../src/schemas/output.js";
import { getAlwaysBlockedPatterns } from "../../../src/core/config/security.js";

/**
 * A base directory for the sandbox home. os.tmpdir() returns /var/folders/... on
 * macOS, and /var is always blocked while /private/var is deliberately not (per
 * user temp dirs have to keep working), so the realpath is the usable form.
 */
function sandboxBase(): string {
  const blockedPatterns = getAlwaysBlockedPatterns();
  const usable = (dir: string): boolean =>
    fsSync.existsSync(dir) &&
    !blockedPatterns.some((pattern) => pattern.test(dir));

  for (const candidate of [fsSync.realpathSync(os.tmpdir()), os.tmpdir()]) {
    if (usable(candidate)) return candidate;
  }
  throw new Error(
    `No unblocked base for the sandbox home; os.tmpdir() is ${os.tmpdir()}`,
  );
}

interface ExportReport {
  format_version: number;
  mode: "absolute" | "rebased";
  rebase_root: string | null;
  output_path: string | null;
  written: boolean;
  bytes_written: number;
  config_file_present: boolean;
  counts: {
    custom_allowed_directories: number;
    custom_rules: number;
    rules: number;
    watch_entries: number;
  };
  requires_editing: string[];
  non_portable_paths: Array<{ field: string; value: string; reason: string }>;
  notes: string[];
  config: Record<string, unknown>;
}

function report(result: { structuredContent?: unknown }): ExportReport {
  return result.structuredContent as ExportReport;
}

const originalHome = os.homedir;
const originalXdg = process.env.XDG_CONFIG_HOME;
const originalAppData = process.env.APPDATA;
let sandboxHome: string;
let configDir: string;
let configPath: string;

async function writeConfig(config: UserConfig): Promise<void> {
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}

async function contextFromDisk(): Promise<ToolContext> {
  return createRequestContext();
}

beforeEach(async () => {
  sandboxHome = await fs.mkdtemp(path.join(sandboxBase(), "fom-export-"));
  os.homedir = () => sandboxHome;
  process.env.XDG_CONFIG_HOME = path.join(sandboxHome, ".config");
  process.env.APPDATA = path.join(sandboxHome, "AppData", "Roaming");
  // The config dir is platform-specific, so it comes from the loader's own
  // helper rather than being spelled out here.
  configPath = getUserConfigPath();
  configDir = path.dirname(configPath);
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

describe("file_organizer_export_config", () => {
  it("round-trips: export to disk, load it back, get the source config shape", async () => {
    const docs = path.join(sandboxHome, "Documents");
    const downloads = path.join(sandboxHome, "Downloads");
    await fs.mkdir(docs, { recursive: true });
    await fs.mkdir(downloads, { recursive: true });
    const sourceConfig: UserConfig = {
      customAllowedDirectories: [docs, downloads],
      conflictStrategy: "skip",
      customRules: [
        { category: "Widgets", extensions: [".widget"], priority: 12 },
        { category: "Gadgets", filenamePattern: "^gadget", priority: 3 },
      ],
      rules: [{ pattern: "*.tmp", destination: "Temp" }],
      watchList: [
        {
          directory: downloads,
          schedule: "0 10 * * *",
          rules: { auto_organize: true, catchup_mode: "smart" },
        },
      ],
      settings: { maxScanDepth: 6 },
      historyLogging: { enabled: true, maxFileSizeMB: 4 },
      autoOrganize: { enabled: false, schedule: "daily" },
    };
    await writeConfig(sourceConfig);

    const outputPath = path.join(docs, "bundle.json");
    const ctx = await contextFromDisk();
    const result = await handleExportConfig(
      { output_path: outputPath, response_format: "json" },
      ctx,
    );
    const exported = report(result);

    expect(exported.written).toBe(true);
    expect(exported.format_version).toBe(1);
    expect(exported.config_file_present).toBe(true);
    expect(exported.counts).toEqual({
      custom_allowed_directories: 2,
      custom_rules: 2,
      rules: 1,
      watch_entries: 1,
    });

    // The file on disk is what a second machine receives.
    const bundle = loadConfigBundle(await fs.readFile(outputPath, "utf-8"));
    expect(bundle.config).toEqual(sourceConfig);
    expect(bundle.portability.mode).toBe("absolute");
  });

  it("does not touch the config file it exports", async () => {
    const docs = path.join(sandboxHome, "Documents");
    await fs.mkdir(docs, { recursive: true });
    await writeConfig({ customAllowedDirectories: [docs], conflictStrategy: "rename" });
    const before = await fs.readFile(configPath, "utf-8");

    const ctx = await contextFromDisk();
    const result = await handleExportConfig(
      { output_path: path.join(docs, "bundle.json") },
      ctx,
    );

    // Pin the export itself first: without it, a handler that returned early
    // with an error would leave the config untouched and satisfy the byte
    // comparison below for entirely the wrong reason.
    expect(result.isError).toBeFalsy();
    expect(report(result).written).toBe(true);
    expect(await fs.readFile(configPath, "utf-8")).toBe(before);
  });

  it("returns the bundle without writing anything when no output path is given", async () => {
    await writeConfig({ conflictStrategy: "overwrite" });

    const ctx = await contextFromDisk();
    const result = await handleExportConfig({ response_format: "json" }, ctx);
    const exported = report(result);

    expect(exported.written).toBe(false);
    expect(exported.output_path).toBeNull();
    expect(exported.bytes_written).toBe(0);
    expect(exported.config.conflictStrategy).toBe("overwrite");
    // Nothing was written, so no bundle file landed in the sandbox. The config
    // dir name itself is platform-specific, so only JSON entries are named.
    const topLevel = await fs.readdir(sandboxHome);
    expect(topLevel.filter((name) => name.endsWith(".json"))).toEqual([]);
  });

  it("names the absolute paths that must be edited on the target machine", async () => {
    const docs = path.join(sandboxHome, "Documents");
    await fs.mkdir(docs, { recursive: true });
    await writeConfig({
      customAllowedDirectories: [docs],
      watchList: [
        { directory: docs, schedule: "@daily", rules: { auto_organize: true } },
      ],
    });

    const ctx = await contextFromDisk();
    const result = await handleExportConfig({}, ctx);
    const text = result.content[0].text;
    const exported = report(result);

    expect(exported.mode).toBe("absolute");
    expect(exported.requires_editing).toEqual([
      "customAllowedDirectories",
      "watchList[].directory",
    ]);
    expect(text).toContain("Edit on the target machine");
    expect(text).toContain("rebase root");
    expect(text).toContain("Written: no");
    expect(text).toContain("```json");
  });

  it("emits ~-relative paths when a rebase root is given", async () => {
    const docs = path.join(sandboxHome, "Documents");
    await fs.mkdir(docs, { recursive: true });
    await writeConfig({
      customAllowedDirectories: [docs],
      conflictStrategy: "skip",
    });

    const ctx = await contextFromDisk();
    const result = await handleExportConfig(
      { rebase_root: sandboxHome, response_format: "json" },
      ctx,
    );
    const exported = report(result);

    expect(exported.mode).toBe("rebased");
    expect(exported.requires_editing).toEqual([]);
    const dirs = exported.config.customAllowedDirectories as string[];
    expect(dirs).toHaveLength(1);
    expect(dirs[0]?.startsWith("~/")).toBe(true);
    // The exported value means the same directory on a machine with this home.
    expect(path.resolve(path.join(sandboxHome, (dirs[0] ?? "").slice(2)))).toBe(
      path.resolve(docs),
    );
  });

  it("refuses an output path the security policy always blocks", async () => {
    const docs = path.join(sandboxHome, "Documents");
    await fs.mkdir(docs, { recursive: true });
    await writeConfig({ customAllowedDirectories: [docs] });
    // node_modules is on the blocked list on every platform, so this exercises
    // validateStrictPath rather than a platform-specific allow-list rule.
    const blocked = path.join(sandboxHome, "node_modules", "bundle.json");

    const ctx = await contextFromDisk();
    const result = await handleExportConfig({ output_path: blocked }, ctx);

    expect(result.isError).toBe(true);
    const entries = await fs.readdir(sandboxHome);
    // The blocked path was never created. The config dir name is
    // platform-specific, so only the names this test controls are asserted.
    expect(entries.filter((name) => name === "node_modules")).toEqual([]);
    expect(entries.filter((name) => name.endsWith(".json"))).toEqual([]);
  });

  it("does not leak the requested path in a rejection", async () => {
    const docs = path.join(sandboxHome, "Documents");
    await fs.mkdir(docs, { recursive: true });
    await writeConfig({ customAllowedDirectories: [docs] });
    const blocked = path.join(sandboxHome, "node_modules", "bundle.json");

    const ctx = await contextFromDisk();
    const result = await handleExportConfig({ output_path: blocked }, ctx);
    const text = result.content.map((item) => item.text).join("\n");

    // Pin the rejection as well as the absence of a leak: an ENOENT on the
    // non-existent node_modules directory would also produce a path-free
    // message, so without these two the test would still pass if the blocklist
    // check stopped working.
    expect(result.isError).toBe(true);
    expect(text).toContain("Access denied");
    expect(text).not.toContain(sandboxHome);
  });

  it("refuses to overwrite an existing bundle file", async () => {
    const docs = path.join(sandboxHome, "Documents");
    await fs.mkdir(docs, { recursive: true });
    await writeConfig({ customAllowedDirectories: [docs] });
    const outputPath = path.join(docs, "bundle.json");
    await fs.writeFile(outputPath, "existing bundle", "utf-8");

    const ctx = await contextFromDisk();
    const result = await handleExportConfig({ output_path: outputPath }, ctx);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("already exists");
    expect(await fs.readFile(outputPath, "utf-8")).toBe("existing bundle");
  });

  it("refuses an output path outside the allowed directories", async () => {
    await writeConfig({ conflictStrategy: "rename" });
    // path.join normalizes the ".." away, so this is a plain sibling-of-home
    // path: the Zod schema accepts it and validateStrictPath is what refuses it.
    // The name is unique per run on purpose — it lands in the shared temp root,
    // outside the sandbox, so a leftover from another run or another jest
    // worker would make this fail as EEXIST instead of as a refusal.
    const outside = path.join(
      sandboxHome,
      "..",
      `fom-escape-bundle-${process.pid}-${Date.now()}.json`,
    );

    const ctx = await contextFromDisk();
    const result = await handleExportConfig({ output_path: outside }, ctx);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Access denied");
    expect(result.content[0].text).not.toContain(outside);
    await expect(fs.stat(outside)).rejects.toThrow();
    // Belt and braces: if the allow-list ever regressed, this test would have
    // written a bundle into the shared temp root, which afterEach cannot reach.
    await fs.rm(outside, { force: true });
  });

  it("structuredContent parses against the declared outputSchema in both formats", async () => {
    const docs = path.join(sandboxHome, "Pictures");
    await fs.mkdir(docs, { recursive: true });
    await writeConfig({
      customAllowedDirectories: [docs],
      customRules: [{ category: "Widgets", priority: 9 }],
      watchList: [
        { directory: docs, schedule: "@hourly", rules: { auto_organize: false } },
      ],
    });

    const ctx = await contextFromDisk();
    for (const response_format of ["json", "markdown"] as const) {
      const result = await handleExportConfig(
        { response_format, output_path: path.join(docs, "bundle.json") },
        ctx,
      );
      const parsed = exportConfigOutputSchema.safeParse(result.structuredContent);
      expect(parsed.success).toBe(true);
      if (!parsed.success) continue;
      // Non-default values in every layer, so an empty export cannot pass.
      expect(parsed.data.mode).toBe("absolute");
      expect(parsed.data.counts).toEqual({
        custom_allowed_directories: 1,
        custom_rules: 1,
        rules: 0,
        watch_entries: 1,
      });
      expect(parsed.data.config_file_present).toBe(true);
      expect(parsed.data.requires_editing).toEqual([
        "customAllowedDirectories",
        "watchList[].directory",
      ]);
      expect(parsed.data.notes.length).toBeGreaterThan(0);
      expect(parsed.data.bytes_written).toBeGreaterThan(0);
      await fs.rm(path.join(docs, "bundle.json"), { force: true });
    }
  });

  it("declares annotations that match what it does", () => {
    expect(exportConfigToolDefinition.annotations).toEqual({
      // It writes the bundle file when output_path is given.
      readOnlyHint: false,
      // The exclusive write never replaces an existing file.
      destructiveHint: false,
      // A second run at the same output path fails, so it does not converge.
      idempotentHint: false,
      openWorldHint: false,
    });
  });
});