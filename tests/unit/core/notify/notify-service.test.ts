/**
 * Notify — one command per moving pass, throttled per directory.
 *
 * Two layers. The unit block drives runNotify() with an injected spawn, an
 * injected state path and an injected clock, so it asserts the exact argv, the
 * per-directory throttle arithmetic and the invalid-config paths without
 * running a process. The pass block drives the real runOrganizePass() over real
 * files in os.tmpdir() with a real `node -e` command that appends to a file,
 * because a mocked spawn cannot prove a notification fires on an actual move.
 *
 * getConfigDirectory() is redirected to a temp root before any module under
 * test is imported, so scheduler-state.json never resolves to the shared OS
 * config directory.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import fs from "fs/promises";
import os from "os";
import path from "path";
// Type-only: erased at compile time, so these never touch the module registry
// the unstable_mockModule below is registering against.
import type { NotifyRequest, NotifySpawnFn } from "../../../../src/core/notify/notify-service.js";
import type { UserConfig } from "../../../../src/config.js";
import type { OrganizePassResult } from "../../../../src/extensions/scheduler/organize-pass.js";

const actualPaths = await import("../../../../src/core/config/paths.js");

/**
 * Read at call time, not captured at import time, so each test's beforeEach can
 * point it at that test's own temp root.
 */
let configRoot = "";

jest.unstable_mockModule("../../../../src/core/config/paths.js", () => ({
  ...actualPaths,
  getConfigDirectory: () => configRoot,
}));

const {
  DEFAULT_NOTIFY_THROTTLE_MINUTES,
  defaultNotifyStateFilePath,
  isNotifyThrottled,
  notifyIfMovedFiles,
  readNotifyTimestamps,
  resolveNotifyThrottleMinutes,
  runNotify,
  tokenizeNotifyCommand,
} = await import("../../../../src/core/notify/notify-service.js");
const { runOrganizePass } = await import(
  "../../../../src/extensions/scheduler/organize-pass.js"
);
const { ONCE_EXIT, passExitCode } = await import(
  "../../../../src/extensions/scheduler/once-cli.js"
);
const { CONFIG } = await import("../../../../src/core/config/defaults.js");
const { HistoryLoggerService } = await import(
  "../../../../src/services/history-logger.service.js"
);

/**
 * A real command that appends one character per notification to a file outside
 * the directory being organized, so a ping never becomes a file the next pass
 * scans. The target path arrives through the environment rather than the command
 * line: a Windows temp path in a JS string literal turns `\temp` into a tab.
 */
const APPEND_COMMAND =
  'node -e "require(\'fs\').appendFileSync(process.env.FOM_TEST_PING,process.env.FOM_NOTIFY_MOVED+\'|\')"';

/** A command that succeeds at nothing and exits non-zero. */
const FAILING_COMMAND = 'node -e "process.exit(3)"';

interface RecordedSpawn {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

/** A spawn that records its argv and runs nothing. */
function recordingSpawn(): {
  spawnFn: NotifySpawnFn;
  calls: RecordedSpawn[];
} {
  const calls: RecordedSpawn[] = [];
  const spawnFn: NotifySpawnFn = (command, args, options) => {
    calls.push({ command, args: [...args], env: options.env });
    return {
      unref: () => undefined,
      on: () => undefined,
    };
  };
  return { spawnFn, calls };
}

/**
 * Wait for a fire-and-forget child to leave its receipt.
 *
 * The notification is deliberately not awaited — a hanging command must not
 * hold the CLI open — so there is no promise to await here. This polls rather
 * than sleeps a fixed time, and it fails when the file never appears, so the
 * assertion still has teeth.
 */
async function waitForReceipt(
  file: string,
  expected: string,
  timeoutMs = 5000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let content = "";
  do {
    try {
      content = await fs.readFile(file, "utf-8");
      if (content.length >= expected.length) return content;
    } catch {
      // Not written yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  } while (Date.now() < deadline);
  return content;
}

describe("notify: command tokenizing", () => {
  it("splits a command line into argv and keeps quoted groups together", () => {
    expect(tokenizeNotifyCommand('notify-send "Moved 3 files" now')).toEqual([
      "notify-send",
      "Moved 3 files",
      "now",
    ]);
    expect(tokenizeNotifyCommand("  sh   -c   'echo hi'  ")).toEqual([
      "sh",
      "-c",
      "echo hi",
    ]);
  });

  it("refuses a line it cannot split rather than half-spawning it", () => {
    expect(tokenizeNotifyCommand('notify-send "unterminated')).toBeNull();
    expect(tokenizeNotifyCommand("   ")).toBeNull();
    expect(tokenizeNotifyCommand("")).toBeNull();
  });

  it("defaults the window to 60 minutes and rejects a nonsense one", () => {
    expect(resolveNotifyThrottleMinutes(undefined)).toBe(
      DEFAULT_NOTIFY_THROTTLE_MINUTES,
    );
    expect(DEFAULT_NOTIFY_THROTTLE_MINUTES).toBe(60);
    expect(resolveNotifyThrottleMinutes(0)).toBe(0);
    expect(resolveNotifyThrottleMinutes("60")).toBeNull();
    expect(resolveNotifyThrottleMinutes(-1)).toBeNull();
    expect(resolveNotifyThrottleMinutes(Number.NaN)).toBeNull();
  });

  it("never throttles a directory that has not notified yet", () => {
    expect(isNotifyThrottled({}, "/some/dir", 600, Date.now())).toBe(false);
    expect(
      isNotifyThrottled({ "/some/dir": 0 }, "/some/dir", 600, 60_000),
    ).toBe(true);
    expect(
      isNotifyThrottled({ "/some/dir": 0 }, "/some/dir", 1, 60_000),
    ).toBe(false);
  });
});

describe("notify: runNotify with an injected spawn", () => {
  let stateFilePath: string;
  const WATCHED = path.resolve("/watched/dir");
  const OTHER = path.resolve("/other/dir");
  const T0 = Date.parse("2026-02-08T09:00:00.000Z");

  beforeEach(async () => {
    configRoot = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "notify-unit-"),
    );
    stateFilePath = defaultNotifyStateFilePath();
  });

  afterEach(async () => {
    await fs.rm(configRoot, { recursive: true, force: true });
  });

  function request(overrides: Partial<NotifyRequest> = {}): NotifyRequest {
    return {
      directory: WATCHED,
      moved: 3,
      config: { notify: { command: 'notify-send "Moved 3 files"' } },
      ...overrides,
    };
  }

  it("puts scheduler-state.json under the redirected config directory", () => {
    expect(stateFilePath).toBe(path.join(configRoot, "scheduler-state.json"));
  });

  it("spawns the configured argv with the moved count in the environment", async () => {
    const { spawnFn, calls } = recordingSpawn();

    const result = await runNotify(request(), {
      spawnFn,
      stateFilePath,
      now: () => T0,
    });

    expect(result.sent).toBe(true);
    expect(result.argv).toEqual(["notify-send", "Moved 3 files"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe("notify-send");
    expect(calls[0]?.args).toEqual(["Moved 3 files"]);
    expect(calls[0]?.env.FOM_NOTIFY_MOVED).toBe("3");
    expect(calls[0]?.env.FOM_NOTIFY_DIRECTORY).toBe(WATCHED);
  });

  it("stays silent when nothing moved", async () => {
    const { spawnFn, calls } = recordingSpawn();

    const result = await runNotify(request({ moved: 0 }), {
      spawnFn,
      stateFilePath,
      now: () => T0,
    });

    expect(result.sent).toBe(false);
    expect(result.reason).toBe("nothing-moved");
    expect(calls).toHaveLength(0);
  });

  it("stays silent when notify is not configured at all", async () => {
    const { spawnFn, calls } = recordingSpawn();

    const result = await runNotify(request({ config: {} }), {
      spawnFn,
      stateFilePath,
      now: () => T0,
    });

    expect(result.sent).toBe(false);
    expect(result.reason).toBe("not-configured");
    expect(calls).toHaveLength(0);
  });

  it("refuses a command or a window it cannot use, without spawning", async () => {
    const { spawnFn, calls } = recordingSpawn();

    const unparseable = await runNotify(
      request({ config: { notify: { command: 'notify-send "open' } } }),
      { spawnFn, stateFilePath, now: () => T0 },
    );
    const wrongType = await runNotify(
      request({
        config: { notify: { command: 42 } as unknown as { command: string } },
      }),
      { spawnFn, stateFilePath, now: () => T0 },
    );
    const badWindow = await runNotify(
      request({
        config: {
          notify: { command: "notify-send", throttleMinutes: "soon" as unknown as number },
        },
      }),
      { spawnFn, stateFilePath, now: () => T0 },
    );

    expect(unparseable.reason).toBe("invalid-config");
    expect(wrongType.reason).toBe("invalid-config");
    expect(badWindow.reason).toBe("invalid-config");
    expect(calls).toHaveLength(0);
  });

  it("sends the first notification even with a window measured in days", async () => {
    const { spawnFn, calls } = recordingSpawn();

    const result = await runNotify(
      request({
        config: { notify: { command: "notify-send", throttleMinutes: 60000 } },
      }),
      { spawnFn, stateFilePath, now: () => T0 },
    );

    expect(result.sent).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("sends once inside the window and again after it closes", async () => {
    const { spawnFn, calls } = recordingSpawn();
    const config = {
      notify: { command: "notify-send", throttleMinutes: 60 },
    } as UserConfig;

    const first = await runNotify(request({ config }), {
      spawnFn,
      stateFilePath,
      now: () => T0,
    });
    const second = await runNotify(request({ config }), {
      spawnFn,
      stateFilePath,
      now: () => T0 + 59 * 60_000,
    });
    const third = await runNotify(request({ config }), {
      spawnFn,
      stateFilePath,
      now: () => T0 + 61 * 60_000,
    });

    expect(first.sent).toBe(true);
    expect(second.sent).toBe(false);
    expect(second.reason).toBe("throttled");
    expect(third.sent).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("throttles per directory, so a loud folder cannot mute a quiet one", async () => {
    const { spawnFn, calls } = recordingSpawn();
    const config = {
      notify: { command: "notify-send", throttleMinutes: 60 },
    } as UserConfig;

    await runNotify(request({ config }), {
      spawnFn,
      stateFilePath,
      now: () => T0,
    });
    const throttled = await runNotify(request({ config }), {
      spawnFn,
      stateFilePath,
      now: () => T0 + 60_000,
    });
    const otherDirectory = await runNotify(
      request({ config, directory: OTHER }),
      { spawnFn, stateFilePath, now: () => T0 + 60_000 },
    );

    expect(throttled.reason).toBe("throttled");
    expect(otherDirectory.sent).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("records the throttle inside scheduler-state.json and keeps the scheduler's own key", async () => {
    await fs.mkdir(configRoot, { recursive: true });
    await fs.writeFile(
      stateFilePath,
      JSON.stringify({
        version: 1,
        directories: {
          [WATCHED]: { lastRunTime: "2026-02-01T08:00:00.000Z", schedule: "0 9 * * *" },
        },
      }),
      "utf-8",
    );
    const { spawnFn } = recordingSpawn();

    await runNotify(request(), { spawnFn, stateFilePath, now: () => T0 });

    const onDisk = JSON.parse(await fs.readFile(stateFilePath, "utf-8")) as {
      version: number;
      directories: Record<string, { lastRunTime: string; schedule: string }>;
      notifications?: Record<string, string>;
    };
    expect(onDisk.directories[WATCHED]?.schedule).toBe("0 9 * * *");
    expect(onDisk.notifications?.[WATCHED]).toBe(
      new Date(T0).toISOString(),
    );
    expect(readNotifyTimestamps(stateFilePath)[WATCHED]).toBe(T0);
  });

  it("treats an unreadable state file as never notified", async () => {
    await fs.mkdir(configRoot, { recursive: true });
    await fs.writeFile(stateFilePath, "not json at all", "utf-8");
    const { spawnFn, calls } = recordingSpawn();

    const result = await runNotify(request(), {
      spawnFn,
      stateFilePath,
      now: () => T0,
    });

    expect(result.sent).toBe(true);
    expect(calls).toHaveLength(1);
  });
});

describe("notify: a broken notification is not a pass failure", () => {
  let stateFilePath: string;
  const WATCHED = path.resolve("/watched/dir");
  const T0 = Date.parse("2026-02-08T09:00:00.000Z");

  beforeEach(async () => {
    configRoot = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "notify-fail-"),
    );
    stateFilePath = defaultNotifyStateFilePath();
  });

  afterEach(async () => {
    await fs.rm(configRoot, { recursive: true, force: true });
  });

  it("returns false instead of throwing when the spawn itself throws", async () => {
    const spawnFn: NotifySpawnFn = () => {
      throw new Error("spawn notify-send ENOENT");
    };

    await expect(
      notifyIfMovedFiles(
        {
          directory: WATCHED,
          moved: 2,
          config: { notify: { command: "notify-send" } },
        },
        { spawnFn, stateFilePath, now: () => T0 },
      ),
    ).resolves.toBe(false);
  });

  it("notifies anyway when the throttle state cannot be written", async () => {
    // A regular file where a directory has to be: mkdirSync fails, and the
    // notification still has to go out. The throttle is best-effort.
    const blocker = path.join(configRoot, "blocker");
    await fs.writeFile(blocker, "", "utf-8");
    const { spawnFn, calls } = recordingSpawn();

    const sent = await notifyIfMovedFiles(
      {
        directory: WATCHED,
        moved: 2,
        config: { notify: { command: "notify-send" } },
      },
      {
        spawnFn,
        stateFilePath: path.join(blocker, "scheduler-state.json"),
        now: () => T0,
      },
    );

    expect(sent).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("swallows an error the child reports after the spawn returned", async () => {
    const listeners: Array<(error: Error) => void> = [];
    const spawnFn: NotifySpawnFn = () => ({
      unref: () => undefined,
      on: (event, listener) => {
        if (event === "error") listeners.push(listener);
      },
    });

    const sent = await notifyIfMovedFiles(
      {
        directory: WATCHED,
        moved: 2,
        config: { notify: { command: "notify-send" } },
      },
      { spawnFn, stateFilePath, now: () => T0 },
    );

    expect(sent).toBe(true);
    expect(listeners).toHaveLength(1);
    expect(() => {
      listeners.forEach((listener) => listener(new Error("spawn ENOENT")));
    }).not.toThrow();
  });
});

describe("notify: a real pass over real files", () => {
  let root: string;
  let workDir: string;
  let pingFile: string;
  let stateFilePath: string;
  let history: InstanceType<typeof HistoryLoggerService>;
  let originalCustomAllowed: string[];

  beforeEach(async () => {
    // Canonicalised once here, so every derived path and every comparison is
    // spelled the way the filesystem resolves it.
    root = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "notify-pass-"),
    );
    configRoot = path.join(root, "config");
    workDir = path.join(root, "work");
    pingFile = path.join(root, "ping.log");
    stateFilePath = path.join(configRoot, "scheduler-state.json");
    await fs.mkdir(workDir, { recursive: true });
    history = new HistoryLoggerService({
      dataDir: path.join(root, "history"),
      maxBackupFiles: 0,
    });
    originalCustomAllowed = CONFIG.paths.customAllowed;
    CONFIG.paths.customAllowed = [...originalCustomAllowed, workDir];
    process.env.FOM_TEST_PING = pingFile;
  });

  afterEach(async () => {
    CONFIG.paths.customAllowed = originalCustomAllowed;
    delete process.env.FOM_TEST_PING;
    if (process.platform === "win32") {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await fs.rm(root, { recursive: true, force: true });
  });

  /** Two files the categorizer will move into two different folders. */
  async function seed(): Promise<void> {
    await fs.writeFile(path.join(workDir, "notes.txt"), "hello", "utf-8");
    await fs.writeFile(path.join(workDir, "photo.jpg"), "jpeg", "utf-8");
  }

  function pass(config: UserConfig): Promise<OrganizePassResult> {
    return runOrganizePass({ directory: workDir, dryRun: false }, { config, history });
  }

  async function readPing(): Promise<string> {
    try {
      return await fs.readFile(pingFile, "utf-8");
    } catch {
      return "";
    }
  }

  it("runs the configured command for a pass that moved files", async () => {
    await seed();

    const result = await pass({
      conflictStrategy: "rename",
      notify: { command: APPEND_COMMAND },
    });

    // The setup fired: without a move there is nothing to be notified about.
    expect(result.moved).toBe(2);
    expect(result.errors).toEqual([]);
    expect(result.notified).toBe(true);
    // One receipt per notification, carrying the moved count the command read
    // out of FOM_NOTIFY_MOVED.
    expect(await waitForReceipt(pingFile, "2|")).toBe("2|");
    expect(
      Object.keys(readNotifyTimestamps(stateFilePath)),
    ).toEqual([await fs.realpath(workDir)]);
  });

  it("is silent on a dry run", async () => {
    await seed();

    const result = await runOrganizePass(
      { directory: workDir },
      {
        config: { notify: { command: APPEND_COMMAND } },
        history,
      },
    );

    expect(result.dryRun).toBe(true);
    expect(result.moved).toBe(0);
    expect(result.notified).toBeUndefined();
    expect(await readPing()).toBe("");
  });

  it("is silent on a pass that had nothing to move", async () => {
    const result = await pass({
      conflictStrategy: "rename",
      notify: { command: APPEND_COMMAND },
    });

    expect(result.scanned).toBe(0);
    expect(result.moved).toBe(0);
    expect(result.notified).toBe(false);
    expect(await readPing()).toBe("");
  });

  it("notifies once for two passes inside the throttle window", async () => {
    const config: UserConfig = {
      conflictStrategy: "rename",
      notify: { command: APPEND_COMMAND, throttleMinutes: 60 },
    };

    await seed();
    const first = await pass(config);
    await seed();
    const second = await pass(config);

    // Both passes moved files, so the second one is quiet because of the
    // throttle and not because there was nothing to do.
    expect(first.moved).toBe(2);
    expect(second.moved).toBe(2);
    expect(first.notified).toBe(true);
    expect(second.notified).toBe(false);
    // Deterministic half: one recorded timestamp, written by the first pass.
    expect(Object.keys(readNotifyTimestamps(stateFilePath))).toHaveLength(1);
    // The only timing-dependent assertion here. A second notification would be
    // spawned during the second pass, so a bounded wait either sees it or
    // proves its absence; this never sleeps a fixed time to pass.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(await readPing()).toBe("2|");
  });

  it("leaves the pass result alone when the command exits non-zero", async () => {
    await seed();

    const result = await pass({
      conflictStrategy: "rename",
      notify: { command: FAILING_COMMAND },
    });

    expect(result.moved).toBe(2);
    expect(result.errors).toEqual([]);
    expect(result.notified).toBe(true);
    // 2 is ONCE_EXIT.moved: a clean pass that moved files.
    expect(passExitCode(result)).toBe(ONCE_EXIT.moved);
  });

  it("changes nothing about the pass when notify is absent", async () => {
    await seed();

    const result = await pass({ conflictStrategy: "rename" });

    expect(result.moved).toBe(2);
    expect(result.errors).toEqual([]);
    expect(result.notified).toBe(false);
    expect(passExitCode(result)).toBe(ONCE_EXIT.moved);
    expect(await readPing()).toBe("");
    expect(
      await fs.readdir(path.join(workDir, "Documents")),
    ).toEqual(["notes.txt"]);
  });
});
