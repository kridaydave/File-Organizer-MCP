/**
 * file_organizer_watch_status — tool wiring.
 *
 * The sandbox lives under os.tmpdir(): config.json, operations.jsonl and
 * scheduler-state.json are all redirected there (patched os.homedir plus
 * XDG_CONFIG_HOME/APPDATA, so the config dir resolves into the sandbox on all
 * three CI platforms), and the developer's real config directory is never
 * read or written.
 *
 * The suite runs in whatever zone the machine has: these assertions read
 * local components or relative ages, so they hold on every runner. The
 * pinned-zone proof — next run in UTC+5:30 against fixed instants — cannot
 * happen in-process, because jest's vm sandbox never forwards a runtime
 * process.env.TZ to V8's date cache (an in-process pin only "works" on a
 * machine already in that zone, which is exactly the hole issue #99 hid in).
 * That proof runs in a child process that inherits the zone at spawn, the
 * same workaround the EXIF calendar suites in tests/unit/services/ use; see
 * the "next_run under a pinned timezone" test below.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { execFileSync } from "node:child_process";
import fs from "fs/promises";
import fsSync from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { pathToFileURL } from "node:url";
import type { ToolResponse } from "../../../src/mcp/types.js";
import type {
  WatchStatusReport,
  WatchStatusEntry,
} from "../../../src/tools/watch-status.js";

const { handleWatchStatus } = await import("../../../src/tools/watch-status.js");
const { TOOLS, toolHandlers } = await import("../../../src/mcp/registry.js");
const { WatchStatusInputSchema } = await import(
  "../../../src/schemas/system.js"
);
const { HistoryLoggerService } = await import(
  "../../../src/services/history-logger.service.js"
);
const { loadUserConfig } = await import("../../../src/core/config/loader.js");
const { getUserConfigPath } = await import(
  "../../../src/core/config/paths.js"
);
const { setSchedulerStateServicePath, getSchedulerStateService } =
  await import("../../../src/extensions/scheduler/scheduler-state.service.js");

const TOOL_NAME = "file_organizer_watch_status";

type WatchListEntry = {
  directory: string;
  schedule: string;
  rules: { auto_organize: boolean };
};

const originalHomedir = os.homedir;
const originalXdg = process.env.XDG_CONFIG_HOME;
const originalAppData = process.env.APPDATA;

let sandbox: string;
let configDir: string;
let configPath: string;
let statePath: string;
let history: InstanceType<typeof HistoryLoggerService>;

async function writeWatchList(watches: WatchListEntry[]): Promise<void> {
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(
    configPath,
    JSON.stringify({ watchList: watches }, null, 2),
    "utf-8",
  );
}

/**
 * Append a pass record with a backdated timestamp. The logger stamps its own
 * rows with "now", so a stale pass can only be seeded by writing the JSONL
 * line the reader will actually parse.
 */
async function seedPass(
  directory: string,
  opts: {
    minutesAgo: number;
    status?: "success" | "error" | "partial";
    source?: "manual" | "scheduled";
    error?: string;
  },
): Promise<void> {
  const entry = {
    id: crypto.randomUUID(),
    timestamp: new Date(Date.now() - opts.minutesAgo * 60_000).toISOString(),
    operation: "file_organizer_organize_files",
    source: opts.source ?? "scheduled",
    status: opts.status ?? "success",
    durationMs: 1500,
    details: "Seeded pass record",
    paths: [directory],
    ...(opts.error ? { error: { message: opts.error } } : {}),
  };
  await fs.mkdir(configDir, { recursive: true });
  await fs.appendFile(
    path.join(configDir, "operations.jsonl"),
    `${JSON.stringify(entry)}\n`,
    "utf-8",
  );
}

async function status(
  args: Record<string, unknown> = {},
): Promise<ToolResponse> {
  // A context the way a real request gets one: config freshly read from the
  // sandbox, history pointed at the sandbox's operations.jsonl.
  return handleWatchStatus(
    { response_format: "json", ...args },
    { config: loadUserConfig(), history },
  );
}

function reportOf(res: ToolResponse): WatchStatusReport {
  return res.structuredContent as unknown as WatchStatusReport;
}

/** Throws instead of returning undefined, so an assertion cannot pass vacuously. */
function entryByDir(
  report: WatchStatusReport,
  directory: string,
): WatchStatusEntry {
  const found = report.watches.find((w) => w.directory === directory);
  if (!found) {
    throw new Error(
      `no status entry for ${directory}; saw: ${report.watches
        .map((w) => w.directory)
        .join(", ")}`,
    );
  }
  return found;
}

/** Sorted names in the config dir, to prove a call created or removed nothing. */
async function sortedConfigDirListing(): Promise<string[]> {
  const entries = await fs.readdir(configDir);
  return [...entries].sort();
}

beforeEach(async () => {
  const base = await fs.realpath(os.tmpdir());
  sandbox = await fs.mkdtemp(path.join(base, "fom-watch-status-"));
  os.homedir = () => sandbox;
  process.env.XDG_CONFIG_HOME = path.join(sandbox, ".config");
  process.env.APPDATA = path.join(sandbox, "AppData", "Roaming");

  configPath = getUserConfigPath();
  configDir = path.dirname(configPath);
  statePath = path.join(configDir, "scheduler-state.json");

  // Redirect the state singleton rather than the environment: getConfigDirectory()
  // ignores XDG on macOS and resolves ~/Library/Application Support there, so no
  // env var relocates this file on all three platforms.
  setSchedulerStateServicePath(statePath);

  // Guards the fixture itself: if the override were ignored, later assertions
  // would read or write the developer's real scheduler state and pass for the
  // wrong reason.
  expect((await getSchedulerStateService()).getStateFilePath()).toBe(
    statePath,
  );
  expect(statePath.startsWith(sandbox)).toBe(true);
  expect(fsSync.existsSync(statePath)).toBe(false);
  expect(configPath.startsWith(sandbox)).toBe(true);

  history = new HistoryLoggerService({ dataDir: configDir });
});

afterEach(async () => {
  os.homedir = originalHomedir;
  if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = originalXdg;
  if (originalAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = originalAppData;
  setSchedulerStateServicePath(undefined);
  await new Promise((r) => setTimeout(r, 100));
  await fs.rm(sandbox, { recursive: true, force: true });
});

describe("file_organizer_watch_status", () => {
  it("is registered read-only with the Zod and JSON schemas in step", () => {
    const def = TOOLS.find((t) => t.name === TOOL_NAME);
    if (!def) throw new Error(`${TOOL_NAME} is not in TOOLS`);
    expect(typeof toolHandlers.get(TOOL_NAME)).toBe("function");

    expect(def.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });

    // Two sources of truth for the same field set: the JSON inputSchema the
    // MCP client reads off the wire, and the Zod schema the handler parses
    // with. The one drift assertion in the repo covers one other tool; this
    // holds the same line for this one.
    const declared = def.inputSchema.properties;
    expect(Object.keys(declared).sort()).toEqual(
      Object.keys(WatchStatusInputSchema.shape).sort(),
    );
    expect(declared.response_format).toEqual({
      type: "string",
      enum: ["json", "markdown"],
      default: "markdown",
      description: expect.any(String),
    });
    expect(def.inputSchema.required).toEqual([]);
  });

  it("reports an empty watch list as zero watches in both formats", async () => {
    await writeWatchList([]);

    const json = await status();
    expect(json.isError).toBeUndefined();
    const report = reportOf(json);
    expect(report.count).toBe(0);
    expect(report.watches).toEqual([]);

    const md = await status({ response_format: "markdown" });
    expect(md.isError).toBeUndefined();
    const text =
      md.content[0]!.type === "text" ? md.content[0]!.text : "";
    expect(text).toContain("No directories are currently being watched");
  });

  it("reports cron, local next run, and a distinct liveness state per watch", async () => {
    const okDir = path.join(sandbox, "ok-dir");
    const staleDir = path.join(sandbox, "stale-dir");
    const errorDir = path.join(sandbox, "error-dir");
    const neverDir = path.join(sandbox, "never-dir");
    const invalidDir = path.join(sandbox, "invalid-dir");

    await writeWatchList([
      { directory: okDir, schedule: "*/5 * * * *", rules: { auto_organize: true } },
      { directory: staleDir, schedule: "*/5 * * * *", rules: { auto_organize: true } },
      { directory: errorDir, schedule: "*/5 * * * *", rules: { auto_organize: true } },
      { directory: neverDir, schedule: "0 9 * * *", rules: { auto_organize: true } },
      { directory: invalidDir, schedule: "whenever you can", rules: { auto_organize: true } },
    ]);
    await seedPass(okDir, { minutesAgo: 1, source: "scheduled" });
    await seedPass(staleDir, { minutesAgo: 30, source: "scheduled" });
    await seedPass(errorDir, {
      minutesAgo: 1,
      status: "error",
      error: "Organize exploded on locked file",
    });
    await seedPass(invalidDir, { minutesAgo: 5, source: "scheduled" });

    const res = await status();
    expect(res.isError).toBeUndefined();
    const report = reportOf(res);
    expect(report.count).toBe(5);

    const ok = entryByDir(report, okDir);
    expect(ok.liveness).toBe("ok");
    expect(ok.liveness_evidence).toContain("last pass was");
    expect(ok.liveness_evidence).toContain("expected every 5 minutes");
    // The states replace a boolean; a lone `alive` would be the old lie.
    expect(ok).not.toHaveProperty("alive");
    expect(ok.schedule).toBe("*/5 * * * *");
    expect(ok.schedule_valid).toBe(true);
    expect(ok.expected_interval_minutes).toBe(5);
    expect(Date.parse(ok.next_run!)).toBeGreaterThan(Date.now());
    expect(ok.minutes_until_next_run!).toBeGreaterThanOrEqual(0);
    expect(ok.minutes_until_next_run!).toBeLessThanOrEqual(5);
    expect(ok.last_pass?.status).toBe("success");
    expect(ok.last_pass?.recorded_by).toBe("history");
    expect(ok.last_pass?.timestamp).not.toBeNull();

    const stale = entryByDir(report, staleDir);
    expect(stale.liveness).toBe("stale");
    // 30±9 minutes: the verdict needs the age, the exact minute does not.
    expect(stale.liveness_evidence).toMatch(
      /last pass was 3[0-9] minutes ago/,
    );
    expect(stale.liveness_evidence).toContain("expected every 5 minutes");
    expect(stale).not.toHaveProperty("alive");

    const fromError = entryByDir(report, errorDir);
    expect(fromError.liveness).toBe("unknown");
    expect(fromError.liveness_evidence).toContain("recorded an error");
    expect(fromError.liveness_evidence).toContain("locked file");
    expect(fromError.last_pass?.status).toBe("error");

    const never = entryByDir(report, neverDir);
    expect(never.liveness).toBe("never_run");
    expect(never.last_pass).toBeNull();
    expect(never.scheduler).toBe("none");
    expect(never.liveness_evidence).toContain(
      "no pass has ever been recorded",
    );

    const invalid = entryByDir(report, invalidDir);
    expect(invalid.schedule_valid).toBe(false);
    expect(invalid.next_run).toBeNull();
    expect(invalid.minutes_until_next_run).toBeNull();
    expect(invalid.expected_interval_minutes).toBeNull();
    expect(invalid.liveness).toBe("unknown");
    expect(invalid.liveness_evidence).toContain(
      "not a valid cron expression",
    );
  });

  it("reports liveness from history for a cron-only setup with no daemon", async () => {
    const cronDir = path.join(sandbox, "cron-dir");
    await writeWatchList([
      { directory: cronDir, schedule: "0 9 * * *", rules: { auto_organize: true } },
    ]);
    await seedPass(cronDir, { minutesAgo: 6, source: "scheduled" });

    // Fixture check: this is the cron-only case only if no daemon state
    // exists. If the state file were already present, the daemon branch
    // below would answer instead of history.
    expect(fsSync.existsSync(statePath)).toBe(false);

    const res = await status();
    expect(res.isError).toBeUndefined();
    const entry = entryByDir(reportOf(res), cronDir);

    expect(entry.liveness).toBe("ok"); // 6 minutes, interval one day
    // formatSpan renders the daily interval as "1 day", never "24 hours".
    expect(entry.liveness_evidence).toContain("expected every 1 day");
    expect(entry.liveness_evidence).toContain("(history, success)");
    expect(entry.scheduler).toBe("cron");
    expect(entry.last_pass?.source).toBe("scheduled");
    expect(entry.last_pass?.recorded_by).toBe("history");
  });

  it("falls back to scheduler state when history has no pass record", async () => {
    const daemonDir = path.join(sandbox, "daemon-dir");
    await writeWatchList([
      { directory: daemonDir, schedule: "0 9 * * *", rules: { auto_organize: true } },
    ]);
    const ranAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    await (await getSchedulerStateService()).setLastRunTime(
      daemonDir,
      ranAt,
      "0 9 * * *",
    );

    const res = await status();
    expect(res.isError).toBeUndefined();
    const entry = entryByDir(reportOf(res), daemonDir);

    expect(entry.liveness).toBe("ok"); // 3 hours, expected every 24 hours
    expect(entry.last_pass?.recorded_by).toBe("scheduler-state");
    expect(Date.parse(entry.last_pass!.timestamp!)).toBe(ranAt.getTime());
    expect(entry.liveness_evidence).toContain(
      "(scheduler state, success)",
    );
    // Only AutoOrganizeService writes scheduler state, so its presence is
    // the daemon's fingerprint.
    expect(entry.scheduler).toBe("daemon");
  });

  it("computes next_run at the local wall clock, not UTC", async () => {
    const zoneDir = path.join(sandbox, "zone-dir");
    await writeWatchList([
      // 2:30pm local. Under the old UTC implementation this came back as
      // 14:30Z, which is 20:30 in the pinned zone (issue #99).
      { directory: zoneDir, schedule: "30 14 * * *", rules: { auto_organize: true } },
    ]);

    const res = await status();
    expect(res.isError).toBeUndefined();
    const entry = entryByDir(reportOf(res), zoneDir);

    const next = new Date(entry.next_run!);
    expect(Number.isFinite(next.getTime())).toBe(true);
    expect(next.getHours()).toBe(14);
    expect(next.getMinutes()).toBe(30);
    expect(next.getTime()).toBeGreaterThan(Date.now());
    expect(entry.minutes_until_next_run!).toBeGreaterThanOrEqual(0);
    expect(entry.minutes_until_next_run!).toBeLessThanOrEqual(1440);
    expect(entry.expected_interval_minutes).toBe(1440);
  });

  it("reports next_run at the wall clock of the zone it runs in, proven under a pin", async () => {
    // The in-process suite above proves the wiring, but it runs in whatever
    // zone the machine is set to. This one runs the whole tool in a child
    // pinned to Asia/Kolkata and reads the result back through Intl in that
    // same zone, so it holds on a UTC CI runner and fails if next_run is ever
    // computed in UTC again (issue #99): 14:30 local is 09:00Z, and the old
    // code returned 14:30Z, which reads as 20:00 here.
    const zoneDir = path.join(sandbox, "pinned-dir");
    await writeWatchList([
      { directory: zoneDir, schedule: "30 14 * * *", rules: { auto_organize: true } },
    ]);

    const script = `
      import fs from "node:fs";
      import os from "node:os";
      import path from "node:path";
      const sandbox = process.argv[1];
      os.homedir = () => sandbox;
      const { getUserConfigPath } = await import(${JSON.stringify(
        pathToFileURL(path.resolve("dist/src/core/config/paths.js")).href,
      )});
      const { loadUserConfig } = await import(${JSON.stringify(
        pathToFileURL(path.resolve("dist/src/core/config/loader.js")).href,
      )});
      const { HistoryLoggerService } = await import(${JSON.stringify(
        pathToFileURL(
          path.resolve("dist/src/services/history-logger.service.js"),
        ).href,
      )});
      const { setSchedulerStateServicePath } = await import(${JSON.stringify(
        pathToFileURL(
          path.resolve(
            "dist/src/extensions/scheduler/scheduler-state.service.js",
          ),
        ).href,
      )});
      const { handleWatchStatus } = await import(${JSON.stringify(
        pathToFileURL(path.resolve("dist/src/tools/watch-status.js")).href,
      )});
      const configPath = getUserConfigPath();
      if (!configPath.startsWith(sandbox)) {
        throw new Error("config escaped the sandbox: " + configPath);
      }
      setSchedulerStateServicePath(
        path.join(path.dirname(configPath), "scheduler-state.json"),
      );
      const res = await handleWatchStatus(
        { response_format: "json" },
        {
          config: loadUserConfig(),
          history: new HistoryLoggerService({
            dataDir: path.dirname(configPath),
          }),
        },
      );
      if (res.isError) throw new Error("tool errored: " + JSON.stringify(res.content));
      process.stdout.write(JSON.stringify({
        offsetMinutes: new Date().getTimezoneOffset(),
        entry: res.structuredContent.watches.find(
          (w) => w.directory === process.argv[2],
        ),
      }));
    `;

    const out = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", script, sandbox, zoneDir],
      { env: { ...process.env, TZ: "Asia/Kolkata" }, encoding: "utf8" },
    );
    const child = JSON.parse(out) as {
      offsetMinutes: number;
      entry: WatchStatusEntry | undefined;
    };

    // Guards the pin: a runner that ignored TZ comes back at 0 (UTC) and this
    // fails before the wall-clock check can answer for the wrong zone.
    expect(child.offsetMinutes).toBe(-330);
    if (!child.entry) throw new Error("child report had no entry for zoneDir");

    const clock = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(child.entry.next_run!));
    expect(clock).toBe("14:30");
    expect(child.entry.schedule).toBe("30 14 * * *");
    expect(child.entry.schedule_valid).toBe(true);
    expect(Date.parse(child.entry.next_run!)).toBeGreaterThan(Date.now());
  });

  it("renders markdown with the same facts as the json output", async () => {
    const staleDir = path.join(sandbox, "stale-dir");
    const neverDir = path.join(sandbox, "never-dir");
    await writeWatchList([
      { directory: staleDir, schedule: "*/5 * * * *", rules: { auto_organize: true } },
      { directory: neverDir, schedule: "0 9 * * *", rules: { auto_organize: true } },
    ]);
    await seedPass(staleDir, { minutesAgo: 30, source: "scheduled" });

    const jsonRes = await status({ response_format: "json" });
    const mdRes = await status({ response_format: "markdown" });

    expect(mdRes.isError).toBeUndefined();
    expect(mdRes.structuredContent).toBeUndefined();
    const text = mdRes.content[0]!.type === "text" ? mdRes.content[0]!.text : "";

    const report = reportOf(jsonRes);
    expect(report.count).toBe(2);
    expect(text).toContain("Watch Status (2 watches)");
    expect(text).toContain(staleDir);
    expect(text).toContain(neverDir);
    expect(text).toContain("*/5 * * * *");
    expect(text).toContain("stale");
    expect(text).toContain("never_run");
    expect(text).toContain("Scheduler: cron");
    expect(text).toContain("next run:");
  });

  it("writes nothing to config, history, or scheduler state", async () => {
    const watchDir = path.join(sandbox, "read-only-dir");
    await writeWatchList([
      { directory: watchDir, schedule: "*/5 * * * *", rules: { auto_organize: true } },
    ]);
    await seedPass(watchDir, { minutesAgo: 1, source: "scheduled" });
    await (await getSchedulerStateService()).setLastRunTime(watchDir);

    const before = {
      config: await fs.readFile(configPath, "utf-8"),
      history: await fs.readFile(path.join(configDir, "operations.jsonl"), "utf-8"),
      state: await fs.readFile(statePath, "utf-8"),
      listing: await sortedConfigDirListing(),
    };

    const res = await status();
    expect(res.isError).toBeUndefined();

    expect(await fs.readFile(configPath, "utf-8")).toBe(before.config);
    expect(await fs.readFile(path.join(configDir, "operations.jsonl"), "utf-8")).toBe(
      before.history,
    );
    expect(await fs.readFile(statePath, "utf-8")).toBe(before.state);
    expect(await sortedConfigDirListing()).toEqual(before.listing);
  });

  it("rejects a response format the schemas do not know", async () => {
    await writeWatchList([]);
    const res = await status({ response_format: "yaml" });

    expect(res.isError).toBe(true);
    expect(res.structuredContent).toBeUndefined();
  });
});
