/**
 * Single-pass CLI mode — end-to-end behavior in a temp dir.
 *
 * The CLI describe block spawns the real entry point (bin/file-organizer-watch.mjs
 * → dist watch-cli.js) so it asserts the process exit code, not a return value
 * from an imported function. Everything the child touches lives under one mkdtemp
 * root: HOME, XDG_CONFIG_HOME (which is where the history dir resolves), the
 * config file, and the work dir. Nothing is written to the real home or to the
 * real ~/.config/file-organizer-mcp.
 *
 * The pass tests call runOrganizePass directly against real files in
 * os.tmpdir(). They assert on what lands on disk (moved files, history lines),
 * not on the shape of the returned object.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { runOrganizePass } from "../../src/extensions/scheduler/organize-pass.js";
import { RollbackService } from "../../src/core/organize/rollback.js";
import { handleUndoLastOperation } from "../../src/tools/rollback.js";
import {
  ONCE_EXIT,
  failureReport,
  once,
  onceReport,
  parseOnceFlags,
  passExitCode,
} from "../../src/extensions/scheduler/once-cli.js";
import { CONFIG } from "../../src/core/config/defaults.js";
import { HistoryLoggerService } from "../../src/services/history-logger.service.js";
import type { UserConfig } from "../../src/config.js";
import { first } from "../helpers/safe-index.js";

const emptyConfig: UserConfig = { conflictStrategy: "rename" };

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const CLI_BIN = path.join(REPO_ROOT, "bin", "file-organizer-watch.mjs");

describe("single-pass organize (once)", () => {
  let workDir: string;
  let historyDir: string;
  let history: HistoryLoggerService;
  let originalCustomAllowed: string[];

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), "fom-once-"));
    historyDir = await fs.mkdtemp(path.join(os.tmpdir(), "fom-once-hist-"));
    history = new HistoryLoggerService({ dataDir: historyDir });
    // os.tmpdir() is outside the default allowed roots, so the pass would be
    // refused. Whitelist this run's own dir through the same setter the
    // security suites use.
    originalCustomAllowed = CONFIG.paths.customAllowed;
    CONFIG.paths.customAllowed = [...originalCustomAllowed, workDir];
    await fs.mkdir(path.join(workDir, "nested"));
    await fs.writeFile(path.join(workDir, "notes.txt"), "hello");
    await fs.writeFile(path.join(workDir, "photo.jpg"), "not-really-a-jpeg");
    await fs.writeFile(path.join(workDir, "nested", "deep.txt"), "deep");
  });

  afterEach(async () => {
    if (process.platform === "win32") {
      await new Promise((r) => setTimeout(r, 100));
    }
    CONFIG.paths.customAllowed = originalCustomAllowed;
    await fs.rm(workDir, { recursive: true, force: true });
    await fs.rm(historyDir, { recursive: true, force: true });
  });

  async function topLevelFiles(): Promise<string[]> {
    return (await fs.readdir(workDir)).sort();
  }

  /** Every history row the pass appended, in order. */
  async function historyRows(): Promise<Record<string, unknown>[]> {
    return (
      await fs.readFile(path.join(historyDir, "operations.jsonl"), "utf-8")
    )
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  }

  it("writes nothing on a dry run and still reports the plan", async () => {
    const before = await topLevelFiles();

    const result = await runOrganizePass(
      { directory: workDir },
      { config: emptyConfig, history },
    );

    expect(result.dryRun).toBe(true);
    expect(result.scanned).toBe(2);
    expect(result.planned).toBe(2);
    expect(result.moved).toBe(0);
    expect(await topLevelFiles()).toEqual(before);
    await expect(
      fs.access(path.join(historyDir, "operations.jsonl")),
    ).rejects.toThrow();
  });

  it("moves files into category folders and appends one history entry", async () => {
    const result = await runOrganizePass(
      { directory: workDir, dryRun: false },
      { config: emptyConfig, history },
    );

    expect(result.dryRun).toBe(false);
    expect(result.moved).toBe(2);
    expect(result.errors).toEqual([]);
    expect(result.historyLogged).toBe(true);

    // The nested dir is still there; only the two top-level files moved.
    expect((await topLevelFiles()).sort()).toEqual([
      "Documents",
      "Images",
      "nested",
    ]);

    const lines = (
      await fs.readFile(path.join(historyDir, "operations.jsonl"), "utf-8")
    )
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as Record<string, unknown>);

    expect(lines).toHaveLength(1);
    const entry = first(lines);
    expect(entry.operation).toBe("file_organizer_organize_files");
    expect(entry.filesProcessed).toBe(2);
    expect(entry.status).toBe("success");
    // No --source on this call, so the row reads as a human-triggered pass.
    expect(entry.source).toBe("manual");
  });

  it("records source scheduled when the caller says a timer started it", async () => {
    // Assert on the row, not on a spy: the consumer of this value is
    // file_organizer_search_history filtering source=scheduled, which reads
    // the file. A spy would pass while the field stayed unreachable.
    const result = await runOrganizePass(
      { directory: workDir, dryRun: false, source: "scheduled" },
      { config: emptyConfig, history },
    );

    expect(result.historyLogged).toBe(true);

    const lines = (
      await fs.readFile(path.join(historyDir, "operations.jsonl"), "utf-8")
    )
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    const entry = first(lines);
    expect(entry.source).toBe("scheduled");

    // And the row is actually filterable, which was the whole point: the
    // history query filters on exactly this field.
    const scheduled = await history.searchHistory({ source: "scheduled" });
    expect(scheduled.total).toBe(1);
    expect(first(scheduled.entries).operation).toBe(
      "file_organizer_organize_files",
    );
    const manual = await history.searchHistory({ source: "manual" });
    expect(manual.total).toBe(0);
  });

  it("writes no row for a scheduled dry run", async () => {
    // The dry-run early return has to stay ahead of the history write, or a
    // timer that previews every 15 minutes fills the history with rows for
    // passes that moved nothing.
    const result = await runOrganizePass(
      { directory: workDir, source: "scheduled" },
      { config: emptyConfig, history },
    );

    expect(result.dryRun).toBe(true);
    expect(result.historyLogged).toBe(false);
    await expect(
      fs.access(path.join(historyDir, "operations.jsonl")),
    ).rejects.toThrow();
  });

  it("carries the undo handle on the row of a pass that moved files", async () => {
    // A scheduled pass was permanently unundoable: the organizer wrote a
    // manifest, the pass never asked for its id, so the row offered no handle.
    // Assert the id resolves through getManifest, not just that it exists,
    // because an id that does not round-trip is not a handle undo can use.
    await fs.writeFile(path.join(workDir, "song.mp3"), "audio");

    const result = await runOrganizePass(
      { directory: workDir, dryRun: false },
      { config: emptyConfig, history },
    );

    expect(result.moved).toBe(3);
    expect(result.errors).toEqual([]);

    const manifestId = first(await historyRows()).manifestId;
    expect(typeof manifestId).toBe("string");

    const manifest = await new RollbackService().getManifest(
      manifestId as string,
    );
    expect(manifest.actions).toHaveLength(3);
    expect(manifest.actions.map((a) => path.basename(a.originalPath)).sort())
      .toEqual(["notes.txt", "photo.jpg", "song.mp3"]);
  });

  it("undo puts every file the pass moved back where it found it", async () => {
    // The handle is only worth writing into the row if the tool a user would
    // paste it into actually restores the pass. Drive that tool, on the real
    // manifest directory the organizer wrote to.
    await fs.writeFile(path.join(workDir, "song.mp3"), "audio");
    await runOrganizePass(
      { directory: workDir, dryRun: false },
      { config: emptyConfig, history },
    );
    const manifestId = first(await historyRows()).manifestId;
    // Without this assertion the test passes with the fix reverted:
    // handleUndoLastOperation falls back to the newest manifest, which is the
    // one this pass just wrote, so undo restores the files even when the row
    // carries no id at all. The cast would hide that from typecheck.
    expect(typeof manifestId).toBe("string");

    const undo = await handleUndoLastOperation({
      manifest_id: manifestId,
      response_format: "json",
    });

    expect(undo.isError).toBeUndefined();
    const parsed = JSON.parse(undo.content[0].text) as {
      success: number;
      failed: number;
    };
    expect(parsed.failed).toBe(0);
    expect(parsed.success).toBe(3);
    const restored = await topLevelFiles();
    expect(restored).toContain("notes.txt");
    expect(restored).toContain("photo.jpg");
    expect(restored).toContain("song.mp3");
    // Undo moves the files back and leaves the now-empty category folders
    // (Audio, Documents, Images) standing; it does not clean up the tree.
    expect(restored).toContain("Audio");
    expect(restored).toContain("Documents");
  });

  it("writes no undo handle for a pass that moved nothing", async () => {
    // Both destinations already taken and the strategy is skip, so the scanner
    // finds the files and the organizer skips every one. A row that claimed a
    // manifest here would be a handle to an undo that does nothing.
    await fs.mkdir(path.join(workDir, "Documents"));
    await fs.mkdir(path.join(workDir, "Images"));
    await fs.writeFile(path.join(workDir, "Documents", "notes.txt"), "taken");
    await fs.writeFile(path.join(workDir, "Images", "photo.jpg"), "taken");

    const result = await runOrganizePass(
      { directory: workDir, dryRun: false, conflictStrategy: "skip" },
      { config: emptyConfig, history },
    );

    expect(result.scanned).toBe(2);
    expect(result.moved).toBe(0);
    const entry = first(await historyRows());
    expect(entry.filesProcessed).toBe(0);
    expect(entry.manifestId).toBeUndefined();
  });

  it("leaves no handle on a row whose manifest write failed", async () => {
    // The moves and the row both land, the id does not: the organizer reports
    // the failure in its errors and leaves it undefined. A row that carried an
    // id here would point undo at a manifest nobody wrote, and the pass would
    // claim partial rather than success because of it.
    const writeManifest = jest
      .spyOn(RollbackService.prototype, "createManifest")
      .mockRejectedValue(new Error("rollback directory refused the write"));

    try {
      const result = await runOrganizePass(
        { directory: workDir, dryRun: false },
        { config: emptyConfig, history },
      );

      expect(result.moved).toBe(2);
      expect(result.errors.join("\n")).toContain(
        "Failed to create rollback manifest",
      );
      expect(result.historyLogged).toBe(true);

      const entry = first(await historyRows());
      expect(entry.manifestId).toBeUndefined();
      expect(entry.status).toBe("partial");
    } finally {
      writeManifest.mockRestore();
    }
  });

  it("leaves subdirectories alone unless recursive is asked for", async () => {
    const result = await runOrganizePass(
      { directory: workDir, dryRun: false, includeSubdirs: true },
      { config: emptyConfig, history },
    );

    expect(result.moved).toBe(3);
    const nested = await fs.readdir(path.join(workDir, "nested"));
    expect(nested).toEqual([]);
  });

  it("counts only files it actually moved, not planned ones", async () => {
    // Pass over an already-organized tree plus one loose file. The loose file
    // is the only move, so scanned, planned, and moved must each be 1. A
    // reporter that summed category statistics would also count the file
    // already sitting in Documents.
    const organized = await fs.mkdtemp(path.join(os.tmpdir(), "fom-once-org-"));
    CONFIG.paths.customAllowed = [...originalCustomAllowed, organized];
    await fs.mkdir(path.join(organized, "Documents"));
    await fs.writeFile(
      path.join(organized, "Documents", "already.txt"),
      "hello",
    );
    await fs.writeFile(path.join(organized, "loose.pdf"), "hello");

    try {
      const result = await runOrganizePass(
        { directory: organized, dryRun: false },
        { config: emptyConfig, history },
      );
      expect(result.scanned).toBe(1);
      expect(result.planned).toBe(1);
      expect(result.moved).toBe(1);
    } finally {
      await fs.rm(organized, { recursive: true, force: true });
    }
  });

  it("rejects a directory outside the allowed roots", async () => {
    await expect(
      runOrganizePass(
        { directory: path.join(os.tmpdir(), "..") },
        {
          config: emptyConfig,
          history,
        },
      ),
    ).rejects.toThrow();
  });

  it("reports the truth when the files moved but history could not be written", async () => {
    // Short timeout keeps this fast; the lock is never released.
    const blocked = new HistoryLoggerService({
      dataDir: historyDir,
      lockTimeoutMs: 100,
    });
    await fs.writeFile(path.join(historyDir, "operations.lock"), "held");

    const result = await runOrganizePass(
      { directory: workDir, dryRun: false },
      { config: emptyConfig, history: blocked },
    );

    // The moves happened.
    expect(result.moved).toBe(2);
    expect((await topLevelFiles()).sort()).toEqual([
      "Documents",
      "Images",
      "nested",
    ]);
    // The record did not, and the result says so instead of claiming it did.
    expect(result.historyLogged).toBe(false);
    expect(result.errors.join("\n")).toContain("History entry was not written");
    await expect(
      fs.access(path.join(historyDir, "operations.jsonl")),
    ).rejects.toThrow();
  });
});

describe("once flag parsing and exit code", () => {
  it("defaults to a dry run and treats --apply as the switch", () => {
    expect(parseOnceFlags(["/tmp/x"])).toEqual({
      directory: "/tmp/x",
      apply: false,
      recursive: false,
      json: false,
      help: false,
      source: "manual",
    });
    expect(parseOnceFlags(["/tmp/x", "--apply", "--recursive"])).toEqual({
      directory: "/tmp/x",
      apply: true,
      recursive: true,
      json: false,
      help: false,
      source: "manual",
    });
    const parsed = parseOnceFlags(["/tmp/x", "--json"]);
    if ("error" in parsed) {
      throw new Error(`Expected parsed flags, got usage error: ${parsed.error}`);
    }
    expect(parsed.json).toBe(true);
  });

  it("refuses an unknown flag and a second directory", () => {
    expect(parseOnceFlags(["--nope"])).toEqual({
      error: "Unknown flag for once: --nope",
    });
    expect(parseOnceFlags(["/tmp/a", "/tmp/b"])).toEqual({
      error: "once takes exactly one directory",
    });
  });

  it("labels the pass source and defaults to manual", () => {
    // --source consumes the next argument. A parser that did not know it took a
    // value would read "scheduled" as a second directory and refuse the line.
    expect(parseOnceFlags(["/tmp/x", "--apply", "--source", "scheduled"])).toEqual(
      {
        directory: "/tmp/x",
        apply: true,
        recursive: false,
        json: false,
        help: false,
        source: "scheduled",
      },
    );
    const parsed = parseOnceFlags(["/tmp/x", "--source", "manual"]);
    if ("error" in parsed) {
      throw new Error(`Expected parsed flags, got usage error: ${parsed.error}`);
    }
    expect(parsed.source).toBe("manual");
  });

  it("refuses a source value that is not one of the two", () => {
    expect(parseOnceFlags(["/tmp/x", "--source", "bogus"])).toEqual({
      error: "--source must be manual or scheduled, got: bogus",
    });
    // A crontab line that lost the value must fail, not silently fall back to
    // manual and report a timer run as a human one.
    expect(parseOnceFlags(["/tmp/x", "--source"])).toEqual({
      error: "--source needs a value",
    });
  });

  it("freezes three distinct exit codes", () => {
    expect(ONCE_EXIT).toEqual({ nothing: 0, error: 1, moved: 2 });
  });

  it("separates moved, nothing to do, and failed", () => {
    // A clean pass that moved files.
    expect(passExitCode({ moved: 3, errors: [], aborted: false })).toBe(
      ONCE_EXIT.moved,
    );
    // Nothing to do: an empty dir, or a dry run that moved nothing.
    expect(passExitCode({ moved: 0, errors: [], aborted: false })).toBe(
      ONCE_EXIT.nothing,
    );
    // Failure beats "moved" even when files did move.
    expect(
      passExitCode({
        moved: 2,
        errors: ["ENOENT on one file"],
        aborted: false,
      }),
    ).toBe(ONCE_EXIT.error);
    expect(passExitCode({ moved: 0, errors: [], aborted: true })).toBe(
      ONCE_EXIT.error,
    );
  });

  it("reports the pass in one stable JSON shape", () => {
    const result = {
      directory: "/tmp/x",
      dryRun: false,
      scanned: 4,
      planned: 3,
      moved: 3,
      skipped: 1,
      errors: [],
      aborted: false,
      historyLogged: true,
    };

    const report = onceReport(passExitCode(result), result);

    expect(report).toEqual({
      ok: true,
      exitCode: ONCE_EXIT.moved,
      directory: "/tmp/x",
      dryRun: false,
      scanned: 4,
      planned: 3,
      moved: 3,
      skipped: 1,
      historyLogged: true,
      aborted: false,
      errors: [],
    });
    // The key set is part of the contract, so it survives a JSON round trip.
    expect(Object.keys(JSON.parse(JSON.stringify(report))).sort()).toEqual([
      "aborted",
      "directory",
      "dryRun",
      "errors",
      "exitCode",
      "historyLogged",
      "moved",
      "ok",
      "planned",
      "scanned",
      "skipped",
    ]);
  });

  it("reports a failure that never ran in the same shape", () => {
    const report = failureReport("Path is outside the allowed roots", "/tmp/x");

    expect(report).toEqual({
      ok: false,
      exitCode: ONCE_EXIT.error,
      directory: "/tmp/x",
      dryRun: true,
      scanned: 0,
      planned: 0,
      moved: 0,
      skipped: 0,
      historyLogged: false,
      aborted: false,
      errors: ["Path is outside the allowed roots"],
    });
    // A dry run that planned work is not a failure.
    expect(onceReport(ONCE_EXIT.nothing, { moved: 0, errors: [] }).ok).toBe(
      true,
    );
  });

  it("carries the original argument when no pass ever approved a path", () => {
    // The failure branch reports flags.directory verbatim, because the gate
    // threw before it could resolve anything. Documented in README.md as the
    // one exception to the resolved-path rule; this pins that behavior so the
    // doc and the code cannot drift apart silently.
    const failure = failureReport(
      "Path is outside the allowed roots",
      "/tmp/./x",
    );

    expect(failure.directory).toBe("/tmp/./x");
    // A completed pass reports the resolved path instead.
    expect(
      onceReport(ONCE_EXIT.nothing, { directory: "/private/tmp/x" }).directory,
    ).toBe("/private/tmp/x");
  });
});

describe("once exit does not truncate a piped report", () => {
  const originalExit = process.exit;

  afterEach(() => {
    process.exit = originalExit;
    process.exitCode = undefined;
  });

  /**
   * Run `once()` in-process with `process.exit` booby-trapped. Calling it
   * would kill the Jest worker before stdout could flush, so a report large
   * enough to exceed the pipe buffer (64 KB on Linux) would arrive truncated
   * and fail to parse. Returning and setting `process.exitCode` lets Node
   * flush first. This asserts that mechanism directly: driving a real
   * 64 KB+ report through a pipe would need thousands of failing files.
   */
  async function runOnceTrappingExit(args: string[]): Promise<number | never> {
    let trapped = false;
    process.exit = ((code?: number) => {
      trapped = true;
      throw new Error(`process.exit(${code}) called`);
    }) as typeof process.exit;

    await once(args);
    expect(trapped).toBe(false);
    // process.exitCode is string | number | undefined in current @types/node.
    return typeof process.exitCode === "number" ? process.exitCode : 0;
  }

  it("returns instead of exiting after a usage error", async () => {
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await runOnceTrappingExit(["--nope"])).toBe(ONCE_EXIT.error);
    } finally {
      logged.mockRestore();
    }
  });

  it("returns instead of exiting after --help", async () => {
    const logged = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      expect(await runOnceTrappingExit(["--help"])).toBe(ONCE_EXIT.nothing);
    } finally {
      logged.mockRestore();
    }
  });

  it("returns instead of exiting after a missing directory", async () => {
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await runOnceTrappingExit([])).toBe(ONCE_EXIT.error);
    } finally {
      logged.mockRestore();
    }
  });
});

/**
 * The real entry point. Spawning bin/file-organizer-watch.mjs proves the whole
 * chain — argv parsing in watch-cli.ts, runOrganizePass, passExitCode,
 * process.exitCode — actually produces the exit code a cron job would see.
 */
describe("file-organizer-watch once (real CLI)", () => {
  let root: string;
  let home: string;
  let configDir: string;
  let workDir: string;
  let childEnv: NodeJS.ProcessEnv;

  /**
   * stdout and stderr stay separate: the `--json` contract is that stdout
   * carries one parseable document and nothing else, which cannot be observed
   * if both streams are concatenated.
   */
  function runCli(
    args: string[],
  ): Promise<{ code: number; out: string; err: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [CLI_BIN, ...args], {
        cwd: REPO_ROOT,
        env: childEnv,
      });
      let out = "";
      let err = "";
      child.stdout.on("data", (c: Buffer) => (out += c.toString()));
      child.stderr.on("data", (c: Buffer) => (err += c.toString()));
      child.on("error", reject);
      child.on("close", (code) => resolve({ code: code ?? -1, out, err }));
    });
  }

  /** Parse a `--json` run's stdout. Throws if it is not exactly one object. */
  function parseJsonReport(out: string): Record<string, unknown> {
    const lines = out
      .trim()
      .split("\n")
      .filter((l) => l.length > 0);
    expect(lines).toHaveLength(1);
    return JSON.parse(first(lines)) as Record<string, unknown>;
  }

  async function seed(files: Record<string, string>): Promise<void> {
    for (const [name, body] of Object.entries(files)) {
      const full = path.join(workDir, name);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, body);
    }
  }

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "fom-once-cli-"));
    home = path.join(root, "home");
    workDir = path.join(home, "work");

    // The config and history locations are platform-specific
    // (getUserConfigPath / getHistoryDirectory in src/core/config/paths.ts):
    // Windows reads APPDATA, macOS hardcodes ~/Library/Application Support and
    // ignores XDG_CONFIG_HOME, Linux reads XDG_CONFIG_HOME. Point every one of
    // them at this test's root so the child reads the config written below
    // instead of the real user profile.
    const appData = path.join(home, "AppData", "Roaming");
    const configBase =
      process.platform === "win32"
        ? appData
        : process.platform === "darwin"
          ? path.join(home, "Library", "Application Support")
          : path.join(home, ".config");

    childEnv = {
      PATH: process.env.PATH,
      HOME: home,
      // Windows resolves the home directory from USERPROFILE, not HOME.
      USERPROFILE: home,
      APPDATA: appData,
      XDG_CONFIG_HOME: path.join(home, ".config"),
      NODE_ENV: "test",
    };

    configDir = path.join(configBase, "file-organizer-mcp");
    await fs.mkdir(workDir, { recursive: true });
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, "config.json"),
      JSON.stringify({ customAllowedDirectories: [workDir] }),
    );
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("exits 2 and moves every matching file on a clean applied pass", async () => {
    await seed({
      "notes.txt": "hello",
      "photo.jpg": "not-really-a-jpeg",
      "report.pdf": "hello",
    });

    const { code, out } = await runCli(["once", workDir, "--apply"]);

    expect(out).toContain("Moved 3 file(s)");
    expect(code).toBe(ONCE_EXIT.moved);
    // .pdf categorizes to Documents, not a PDFs folder (src/constants.ts:14).
    expect((await fs.readdir(workDir)).sort()).toEqual(["Documents", "Images"]);
    expect((await fs.readdir(path.join(workDir, "Documents"))).sort()).toEqual([
      "notes.txt",
      "report.pdf",
    ]);
    const entries = (
      await fs.readFile(path.join(configDir, "operations.jsonl"), "utf-8")
    )
      .trim()
      .split("\n");
    expect(entries).toHaveLength(1);
  }, 30000);

  it("records source scheduled in the history row when the flag is passed", async () => {
    await seed({ "notes.txt": "hello" });

    const { code } = await runCli([
      "once",
      workDir,
      "--apply",
      "--source",
      "scheduled",
    ]);

    expect(code).toBe(ONCE_EXIT.moved);
    const entries = (
      await fs.readFile(path.join(configDir, "operations.jsonl"), "utf-8")
    )
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(entries).toHaveLength(1);
    expect(first(entries).source).toBe("scheduled");
  }, 30000);

  it("defaults the history row to manual and refuses a bogus --source", async () => {
    await seed({ "notes.txt": "hello" });
    expect((await runCli(["once", workDir, "--apply"])).code).toBe(
      ONCE_EXIT.moved,
    );
    const entries = (
      await fs.readFile(path.join(configDir, "operations.jsonl"), "utf-8")
    )
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(first(entries).source).toBe("manual");

    // A typo in a crontab line must not silently become a manual pass.
    const { code, err } = await runCli([
      "once",
      workDir,
      "--apply",
      "--source",
      "cron",
    ]);
    expect(err).toContain("--source must be manual or scheduled, got: cron");
    expect(code).toBe(ONCE_EXIT.error);
  }, 30000);

  it("exits 0 on a dry run, which moved nothing and is not a failure", async () => {
    await seed({ "notes.txt": "hello" });

    // A dry run planned a move it did not make, so the honest code is
    // "nothing to do", not "moved" and not "failed".
    const { code, out } = await runCli(["once", workDir]);

    expect(out).toContain("Moved 0 file(s)");
    expect(out).toContain("Re-run with --apply");
    expect(code).toBe(ONCE_EXIT.nothing);
    expect(await fs.readdir(workDir)).toEqual(["notes.txt"]);
    await expect(
      fs.access(path.join(configDir, "operations.jsonl")),
    ).rejects.toThrow();
  }, 30000);

  it("exits 0 when the directory has nothing to organize", async () => {
    // An empty directory: the pass ran clean and had no work to do.
    const { code, out } = await runCli(["once", workDir, "--apply", "--json"]);

    const report = parseJsonReport(out);
    expect(code).toBe(ONCE_EXIT.nothing);
    expect(report.ok).toBe(true);
    expect(report.exitCode).toBe(ONCE_EXIT.nothing);
    expect(report.scanned).toBe(0);
    expect(report.moved).toBe(0);
    expect(report.errors).toEqual([]);
    expect(await fs.readdir(workDir)).toEqual([]);
  }, 30000);

  it("prints one JSON object on stdout when the pass moves files", async () => {
    await seed({
      "notes.txt": "hello",
      "photo.jpg": "not-really-a-jpeg",
      "report.pdf": "hello",
    });

    const { code, out } = await runCli(["once", workDir, "--apply", "--json"]);

    const report = parseJsonReport(out);
    expect(code).toBe(ONCE_EXIT.moved);
    // `directory` is the validated path, not the string typed on the command
    // line. Every tool in this repo reports the resolved directory
    // (`file-organization.ts:132` and the rest hand back `validatedPath`),
    // because that is the path the gate checked and the pass scanned. Resolve
    // the expectation through the same function, or this assertion is wrong on
    // every platform where realpath normalizes: macOS rewrites /var to
    // /private/var, and Windows expands the 8.3 short name in a temp dir
    // (RUNNER~1 -> runneradmin). Linux agrees with both forms, which is why
    // only CI caught it.
    const resolvedWorkDir = await fs.realpath(workDir);
    expect(report).toEqual({
      ok: true,
      exitCode: ONCE_EXIT.moved,
      directory: resolvedWorkDir,
      dryRun: false,
      scanned: 3,
      planned: 3,
      moved: 3,
      skipped: 0,
      historyLogged: true,
      aborted: false,
      errors: [],
    });
    // No human report leaked onto stdout.
    expect(out).not.toContain("###");
    expect(out).not.toContain("Moved 3 file(s)");
  }, 30000);

  it("keeps stdout parseable when --json run fails", async () => {
    await seed({ "notes.txt": "hello" });

    const { code, out, err } = await runCli([
      "once",
      path.join(root, "not-allowed"),
      "--apply",
      "--json",
    ]);

    const report = parseJsonReport(out);
    expect(code).toBe(ONCE_EXIT.error);
    expect(report.ok).toBe(false);
    expect(report.exitCode).toBe(ONCE_EXIT.error);
    expect(report.moved).toBe(0);
    expect((report.errors as string[]).length).toBeGreaterThan(0);
    // The human-readable failure text is on stderr, where it belongs.
    expect(err).toContain("Pass failed");
    expect(err).not.toContain("fom-once-cli-");
  }, 30000);

  it("sends usage to stderr under --json", async () => {
    const { code, out, err } = await runCli(["once", "--json", "--help"]);

    expect(code).toBe(ONCE_EXIT.nothing);
    expect(out).toBe("");
    expect(err).toContain("Usage: file-organizer-watch once");
    expect(err).toContain("--json");
  }, 30000);

  it("exits 1 when a directory is refused by the path gate", async () => {
    await seed({ "notes.txt": "hello" });

    const { code, err } = await runCli([
      "once",
      path.join(root, "not-allowed"),
      "--apply",
    ]);

    expect(err).toContain("Pass failed");
    expect(code).toBe(ONCE_EXIT.error);
  }, 30000);

  it("exits 1 on an unknown flag", async () => {
    const { code, err } = await runCli(["once", workDir, "--nope"]);
    expect(err).toContain("Unknown flag for once: --nope");
    expect(code).toBe(ONCE_EXIT.error);
  }, 30000);

  it("does not report success when the history lock is held and the entry is dropped", async () => {
    await seed({ "notes.txt": "hello", "photo.jpg": "not-really-a-jpeg" });

    // Another writer holds operations.lock and never releases it, so the
    // child's append times out after lockTimeoutMs (5s default).
    await fs.writeFile(path.join(configDir, "operations.lock"), "held");

    const { code, out } = await runCli(["once", workDir, "--apply"]);

    // The files really did move...
    expect((await fs.readdir(workDir)).sort()).toEqual(["Documents", "Images"]);
    // ...and there is no history file, so there is no undo record...
    await expect(
      fs.access(path.join(configDir, "operations.jsonl")),
    ).rejects.toThrow();
    // ...which the CLI says out loud instead of exiting 0.
    expect(out).toContain("History entry was NOT written");
    expect(code).toBe(ONCE_EXIT.error);
  }, 30000);

  it("recovers on the next pass once the lock is released", async () => {
    await fs.writeFile(path.join(configDir, "operations.lock"), "held");
    await seed({ "notes.txt": "hello" });

    // The blocked pass moved the file, then lost its history entry. Exit 1,
    // not 2: the missing undo record makes it a failure.
    const blocked = await runCli(["once", workDir, "--apply"]);
    expect(blocked.code).toBe(ONCE_EXIT.error);

    await fs.unlink(path.join(configDir, "operations.lock"));

    // The file is already in Documents, so there is nothing left to move.
    // The new contract calls that 0 (nothing to do), not the old 0-by-default.
    const { code } = await runCli(["once", workDir, "--apply"]);
    expect(code).toBe(ONCE_EXIT.nothing);
    const entries = (
      await fs.readFile(path.join(configDir, "operations.jsonl"), "utf-8")
    )
      .trim()
      .split("\n");
    expect(entries).toHaveLength(1);
  }, 60000);
});
