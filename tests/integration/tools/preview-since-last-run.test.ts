/**
 * preview_organization --since_last_run — tool wiring.
 *
 * The data sandbox lives under os.tmpdir() and is granted through
 * CONFIG.paths.customAllowed. The scheduler state file follows
 * getConfigDirectory(), so XDG_CONFIG_HOME and APPDATA are pointed at a second
 * sandbox too: without that the test would read the developer's real
 * scheduler-state.json, and os.homedir() is not redirectable from inside a
 * jest worker (HOME is a copy there, not the process environment).
 *
 * Assertions compare basenames and counts, never a raw absolute path, because
 * macOS rewrites /var to /private/var and Windows expands 8.3 short names.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import fs from "fs/promises";
import os from "os";
import path from "path";

const { CONFIG } = await import("../../../src/config.js");
const { handlePreviewOrganization } = await import(
  "../../../src/tools/organization-preview.js"
);
const { TOOLS } = await import("../../../src/mcp/registry.js");
const { PreviewOrganizationInputSchema } = await import(
  "../../../src/schemas/organize.js"
);
const { resetSchedulerStateService, getSchedulerStateService } =
  await import("../../../src/extensions/scheduler/scheduler-state.service.js");

const TOOL_NAME = "file_organizer_preview_organization";

const HOUR_MS = 3_600_000;

type Move = { source: string; destination: string };
type Preview = { summary: { total_files: number }; moves: Move[] };
type StateFile = {
  version: number;
  directories: Record<string, { lastRunTime: string; schedule: string }>;
};

describe("preview_organization since_last_run", () => {
  let testDir: string;
  let stateDir: string;
  let restoreCustomAllowed: string[] | undefined;
  let restoreEnv: Record<string, string | undefined>;
  let stateFile: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "preview-since-"));
    stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "preview-since-state-"));
    restoreCustomAllowed = CONFIG.paths._overrideCustomAllowed;
    CONFIG.paths.customAllowed = [os.tmpdir()];

    restoreEnv = {
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
      APPDATA: process.env.APPDATA,
    };
    // The singleton caches its resolved path on first use, so drop it before
    // the redirect takes effect, not after.
    resetSchedulerStateService();
    process.env.XDG_CONFIG_HOME = path.join(stateDir, "config");
    process.env.APPDATA = path.join(stateDir, "AppData", "Roaming");

    stateFile = (await getSchedulerStateService()).getStateFilePath();
  });

  afterEach(async () => {
    for (const [key, value] of Object.entries(restoreEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetSchedulerStateService();
    CONFIG.paths.customAllowed = restoreCustomAllowed;
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.rm(stateDir, { recursive: true, force: true });
  });

  async function readState(): Promise<StateFile> {
    try {
      return JSON.parse(await fs.readFile(stateFile, "utf-8")) as StateFile;
    } catch {
      return { version: 1, directories: {} };
    }
  }

  /**
   * Records a last successful run for `dir`. The key uses the canonical path,
   * because the tool looks the directory up by the realpath validateStrictPath
   * returns, which on macOS differs from the path the caller passed.
   */
  async function recordLastRun(
    dir: string,
    at: Date,
    schedule = "0 * * * *",
  ): Promise<void> {
    const existing = await readState();
    await fs.mkdir(path.dirname(stateFile), { recursive: true });
    await fs.writeFile(
      stateFile,
      JSON.stringify({
        version: 1,
        directories: {
          ...existing.directories,
          [path.resolve(await fs.realpath(dir))
            .replace(/\\/g, "/")
            .toLowerCase()]: { lastRunTime: at.toISOString(), schedule },
        },
      }),
    );
    resetSchedulerStateService();
  }

  /**
   * Two files with an mtime either side of the recorded run. The offsets are
   * hours, not milliseconds, so filesystem timestamp granularity cannot decide
   * the outcome, and they are relative to now so no wall-clock date is assumed.
   */
  async function seedOneOldOneNew(lastRun: Date): Promise<void> {
    const old = path.join(testDir, "old-note.txt");
    const fresh = path.join(testDir, "new-note.txt");
    await fs.writeFile(old, "before the run");
    await fs.writeFile(fresh, "after the run");
    const oldTime = new Date(lastRun.getTime() - HOUR_MS);
    const freshTime = new Date(lastRun.getTime() + HOUR_MS);
    await fs.utimes(old, oldTime, oldTime);
    await fs.utimes(fresh, freshTime, freshTime);
  }

  async function preview(
    args: Record<string, unknown> = {},
  ): Promise<Preview> {
    const res = await handlePreviewOrganization({
      directory: testDir,
      response_format: "json",
      ...args,
    });
    expect(res.isError).toBeUndefined();
    return res.structuredContent as unknown as Preview;
  }

  const sources = (out: Preview) =>
    out.moves.map((m) => path.basename(m.source)).sort();

  const lastRun = new Date(Date.now() - HOUR_MS);

  it("reads scheduler state from the redirected config directory", async () => {
    // Guards the fixture itself. If this fails the other tests would silently
    // read the developer's real state and pass for the wrong reason.
    expect(stateFile.startsWith(stateDir)).toBe(true);
  });

  it("reports only files touched since the last successful run", async () => {
    await seedOneOldOneNew(lastRun);
    await recordLastRun(testDir, lastRun);

    const out = await preview({ since_last_run: true });

    expect(sources(out)).toEqual(["new-note.txt"]);
    // The count is derived from the same filtered plan, so it follows for free.
    expect(out.summary.total_files).toBe(1);
  });

  it("reports the whole directory without since_last_run", async () => {
    await seedOneOldOneNew(lastRun);
    await recordLastRun(testDir, lastRun);

    const out = await preview();

    expect(sources(out)).toEqual(["new-note.txt", "old-note.txt"]);
    expect(out.summary.total_files).toBe(2);
  });

  it("reports the whole directory when since_last_run is false", async () => {
    await seedOneOldOneNew(lastRun);
    await recordLastRun(testDir, lastRun);

    const out = await preview({ since_last_run: false });

    expect(out.summary.total_files).toBe(2);
  });

  it("does not narrow a directory the scheduler has never run", async () => {
    // The null-lastRun decision: no recorded run means the beginning of time.
    // An empty plan here would read as "nothing to do" for a directory the
    // scheduler has never looked at.
    await seedOneOldOneNew(lastRun);

    expect((await readState()).directories).toEqual({});

    const out = await preview({ since_last_run: true });

    expect(sources(out)).toEqual(["new-note.txt", "old-note.txt"]);
    expect(out.summary.total_files).toBe(2);
  });

  it("does not narrow on another directory's run", async () => {
    // Scheduler state is keyed per directory, so an unrelated run must not
    // narrow this preview.
    await seedOneOldOneNew(lastRun);
    const other = await fs.mkdtemp(
      path.join(os.tmpdir(), "preview-since-other-"),
    );
    try {
      await recordLastRun(other, lastRun);
      const out = await preview({ since_last_run: true });
      expect(out.summary.total_files).toBe(2);
    } finally {
      await fs.rm(other, { recursive: true, force: true });
    }
  });

  it("narrow markdown and json report the same plan", async () => {
    await seedOneOldOneNew(lastRun);
    await recordLastRun(testDir, lastRun);

    const json = await preview({ since_last_run: true });
    const res = await handlePreviewOrganization({
      directory: testDir,
      since_last_run: true,
    });
    const text = res.content[0]!.type === "text" ? res.content[0]!.text : "";

    expect(res.isError).toBeUndefined();
    expect(res.structuredContent).toEqual(json);
    expect(text).toContain("- Files to Move: 1");
    expect(text).toContain("new-note.txt");
    expect(text).not.toContain("old-note.txt");
  });

  it("declares since_last_run on the wire and parses it", async () => {
    // Two sources of truth for the same field set: the Zod schema the handler
    // parses with, and the JSON inputSchema the MCP client actually reads. A
    // field added to only one is a silent wire bug no type-checker catches.
    const def = TOOLS.find((t) => t.name === TOOL_NAME);
    const declared = def?.inputSchema.properties as
      | Record<string, unknown>
      | undefined;

    expect(declared?.since_last_run).toEqual({
      type: "boolean",
      default: false,
      description: expect.any(String),
    });
    expect(Object.keys(declared ?? {}).sort()).toEqual(
      Object.keys(PreviewOrganizationInputSchema.shape).sort(),
    );

    const parsed = PreviewOrganizationInputSchema.safeParse({
      directory: testDir,
      since_last_run: true,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.since_last_run).toBe(true);
    expect(
      PreviewOrganizationInputSchema.parse({ directory: testDir })
        .since_last_run,
    ).toBe(false);
  });

  it("rejects a non-boolean since_last_run", async () => {
    const res = await handlePreviewOrganization({
      directory: testDir,
      since_last_run: "yesterday",
      response_format: "json",
    });

    expect(res.isError).toBe(true);
    expect(res.structuredContent).toBeUndefined();
  });

  it("touches nothing on disk", async () => {
    await seedOneOldOneNew(lastRun);
    await recordLastRun(testDir, lastRun);
    const stateBefore = await fs.readFile(stateFile, "utf-8");
    const listingBefore = await sortedListing(testDir);

    await preview({ since_last_run: true });

    expect(await sortedListing(testDir)).toEqual(listingBefore);
    // Read-only: reading the state must not rewrite it, so the recorded run
    // is still the one on disk afterwards.
    expect(await fs.readFile(stateFile, "utf-8")).toBe(stateBefore);
  });

  it("refuses a directory outside the allowed roots", async () => {
    const res = await handlePreviewOrganization({
      directory: path.parse(os.tmpdir()).root,
      since_last_run: true,
      response_format: "json",
    });

    expect(res.isError).toBe(true);
    expect(res.structuredContent).toBeUndefined();
  });
});

/**
 * Sorted relative listing of every file under `dir`, with its size and mtime.
 * readdir order is filesystem order, so it must never be compared unsorted.
 */
async function sortedListing(dir: string, prefix = ""): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await sortedListing(full, rel)));
    } else {
      const stats = await fs.stat(full);
      out.push(`${rel}:${stats.size}:${stats.mtimeMs}`);
    }
  }
  return out.sort();
}