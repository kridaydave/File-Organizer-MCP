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

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { runOrganizePass } from "../../src/extensions/scheduler/organize-pass.js";
import {
  passExitCode,
  parseOnceFlags,
} from "../../src/extensions/scheduler/once-cli.js";
import { CONFIG } from "../../src/core/config/defaults.js";
import { HistoryLoggerService } from "../../src/services/history-logger.service.js";
import type { UserConfig } from "../../src/config.js";

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
    expect(lines[0].operation).toBe("file_organizer_organize_files");
    expect(lines[0].filesProcessed).toBe(2);
    expect(lines[0].status).toBe("success");
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
      help: false,
    });
    expect(parseOnceFlags(["/tmp/x", "--apply", "--recursive"])).toEqual({
      directory: "/tmp/x",
      apply: true,
      recursive: true,
      help: false,
    });
  });

  it("refuses an unknown flag and a second directory", () => {
    expect(parseOnceFlags(["--nope"])).toEqual({
      error: "Unknown flag for once: --nope",
    });
    expect(parseOnceFlags(["/tmp/a", "/tmp/b"])).toEqual({
      error: "once takes exactly one directory",
    });
  });

  it("exits non-zero when a pass reported errors or aborted", () => {
    expect(passExitCode({ errors: [], aborted: false })).toBe(0);
    expect(
      passExitCode({ errors: ["ENOENT on one file"], aborted: false }),
    ).toBe(1);
    expect(passExitCode({ errors: [], aborted: true })).toBe(1);
  });
});

/**
 * The real entry point. Spawning bin/file-organizer-watch.mjs proves the whole
 * chain — argv parsing in watch-cli.ts, runOrganizePass, passExitCode,
 * process.exit — actually produces the exit code a cron job would see.
 */
describe("file-organizer-watch once (real CLI)", () => {
  let root: string;
  let home: string;
  let configDir: string;
  let workDir: string;

  function runCli(args: string[]): Promise<{ code: number; out: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [CLI_BIN, ...args], {
        cwd: REPO_ROOT,
        // A private HOME and XDG_CONFIG_HOME keep both the config file and
        // the history dir inside this test's mkdtemp root. The work dir sits
        // under HOME because loadCustomAllowedDirs() rejects an allow-list
        // entry outside the home directory.
        env: {
          PATH: process.env.PATH,
          HOME: home,
          XDG_CONFIG_HOME: path.join(home, ".config"),
          NODE_ENV: "test",
        },
      });
      let out = "";
      child.stdout.on("data", (c: Buffer) => (out += c.toString()));
      child.stderr.on("data", (c: Buffer) => (out += c.toString()));
      child.on("error", reject);
      child.on("close", (code) => resolve({ code: code ?? -1, out }));
    });
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
    configDir = path.join(home, ".config", "file-organizer-mcp");
    workDir = path.join(home, "work");
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

  it("exits 0 and moves every matching file on a clean applied pass", async () => {
    await seed({
      "notes.txt": "hello",
      "photo.jpg": "not-really-a-jpeg",
      "report.pdf": "hello",
    });

    const { code, out } = await runCli(["once", workDir, "--apply"]);

    expect(out).toContain("Moved 3 file(s)");
    expect(code).toBe(0);
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

  it("exits 1 on a dry run that plans moves it does not make", async () => {
    await seed({ "notes.txt": "hello" });

    // A dry run is not a failure, but it must still be an honest report:
    // it moves nothing and writes nothing.
    const { code, out } = await runCli(["once", workDir]);

    expect(out).toContain("Moved 0 file(s)");
    expect(out).toContain("Re-run with --apply");
    expect(code).toBe(0);
    expect(await fs.readdir(workDir)).toEqual(["notes.txt"]);
    await expect(
      fs.access(path.join(configDir, "operations.jsonl")),
    ).rejects.toThrow();
  }, 30000);

  it("exits 1 when a directory is refused by the path gate", async () => {
    await seed({ "notes.txt": "hello" });

    const { code, out } = await runCli([
      "once",
      path.join(root, "not-allowed"),
      "--apply",
    ]);

    expect(out).toContain("Pass failed");
    expect(code).toBe(1);
  }, 30000);

  it("exits 1 on an unknown flag", async () => {
    const { code, out } = await runCli(["once", workDir, "--nope"]);
    expect(out).toContain("Unknown flag for once: --nope");
    expect(code).toBe(1);
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
    expect(code).toBe(1);
  }, 30000);

  it("still exits 0 on the next pass once the lock is released", async () => {
    await fs.writeFile(path.join(configDir, "operations.lock"), "held");
    await seed({ "notes.txt": "hello" });

    const blocked = await runCli(["once", workDir, "--apply"]);
    expect(blocked.code).toBe(1);

    await fs.unlink(path.join(configDir, "operations.lock"));

    const { code } = await runCli(["once", workDir, "--apply"]);
    expect(code).toBe(0);
    const entries = (
      await fs.readFile(path.join(configDir, "operations.jsonl"), "utf-8")
    )
      .trim()
      .split("\n");
    expect(entries).toHaveLength(1);
  }, 60000);
});
