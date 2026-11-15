/**
 * BUG-84: removing a watch must stop its task in the running daemon.
 *
 * This drives the same reload trigger the daemon uses (reloadWatches,
 * called by the SIGHUP handler and the config watcher in watch-cli.ts),
 * not AutoOrganizeService.reloadTasks() directly. reloadTasks already
 * worked on main, so a test that only calls it passes even if the
 * daemon's reload trigger is removed.
 *
 * The user config path is redirected to a temp file so the singleton
 * scheduler (startAutoOrganizeScheduler) reads a watch list this test
 * controls instead of the developer's real config.
 */

import { describe, it, expect, afterEach, jest } from "@jest/globals";
import fs from "fs";
import path from "path";

const tempRoot = fs.mkdtempSync(
  path.join(process.cwd(), "watch-cli-reload-"),
);
const tempConfigPath = path.join(tempRoot, "config.json");
const watchDir = path.join(tempRoot, "watched");

// Import the real module BEFORE registering the mock, because importing the same
// specifier inside the factory would resolve to the mock and loop forever.
const actualPaths = await import("../../../src/core/config/paths.js");

jest.unstable_mockModule("../../../src/core/config/paths.js", () => ({
  ...actualPaths,
  getUserConfigPath: () => tempConfigPath,
}));

const {
  startAutoOrganizeScheduler,
  stopAutoOrganizeScheduler,
} = await import("../../../src/extensions/scheduler/auto-organize.service.js");
const { reloadWatches } = await import(
  "../../../src/extensions/scheduler/watch-cli.js"
);

function writeConfig(watchList: unknown[]): void {
  fs.writeFileSync(
    tempConfigPath,
    JSON.stringify({ watchList }),
    "utf-8",
  );
}

describe("BUG-84: reload trigger stops removed watches", () => {
  afterEach(async () => {
    stopAutoOrganizeScheduler();
    await new Promise((r) => setTimeout(r, 100));
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("stops the task for a watch removed from the config", async () => {
    expect(typeof reloadWatches).toBe("function");

    fs.mkdirSync(watchDir, { recursive: true });
    writeConfig([
      {
        directory: watchDir,
        schedule: "0 9 * * *",
        rules: { auto_organize: true, catchup_mode: "never" },
      },
    ]);

    const started = await startAutoOrganizeScheduler();
    expect(started.taskCount).toBe(1);

    // Simulate `file-organizer-watch remove`: the shared config loses
    // the watch, then the daemon's reload trigger runs.
    writeConfig([]);
    await reloadWatches();

    // If the reload trigger did not stop the old task, start returns
    // early with the stale task count instead of reloading to zero.
    const restarted = await startAutoOrganizeScheduler();
    expect(restarted.taskCount).toBe(0);
  });
});
