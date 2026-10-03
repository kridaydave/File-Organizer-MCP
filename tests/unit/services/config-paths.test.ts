/**
 * One base path for all server state.
 *
 * config.json, operations.jsonl, the rollback manifests and the backups used to
 * resolve independently. On Linux that meant XDG_CONFIG_HOME moved the history,
 * rollback and backup directories while getUserConfigPath() kept reading
 * ~/.config, so a sandboxed run still loaded the developer's real allow-list.
 *
 * These tests hold the invariant: every state path lives under the directory
 * getConfigDirectory() names, on every platform.
 */

import { jest } from "@jest/globals";
import os from "os";
import path from "path";
import * as paths from "../../../src/core/config/paths.js";

const ENV_KEYS = ["XDG_CONFIG_HOME", "APPDATA"] as const;

/**
 * getRollbackDirectory and getBackupDirectory deliberately fall back to the
 * worktree when jest is running, so test manifests never land in the real
 * config dir. Clearing those signals exercises the production branch.
 */
const TEST_MODE_KEYS = ["NODE_ENV", "JEST_WORKER_ID"] as const;

function withEnv(vars: Record<string, string | undefined>, run: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const key of [...ENV_KEYS, ...TEST_MODE_KEYS, "HOME", "USERPROFILE"]) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  Object.assign(process.env, vars);
  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("config paths share one base", () => {
  // Every helper reads process.env at call time, so a static import reads the
  // env that withEnv installed rather than the one from import time.
  const readPaths = () => ({
    configDirectory: paths.getConfigDirectory(),
    userConfigPath: paths.getUserConfigPath(),
    historyDirectory: paths.getHistoryDirectory(),
    historyFilePath: paths.getHistoryFilePath(),
    rollbackDirectory: paths.getRollbackDirectory(),
    backupDirectory: paths.getBackupDirectory(),
  });

  const platformCases = [
    { name: "linux", platform: "linux", supportsXdg: true },
    { name: "darwin", platform: "darwin", supportsXdg: false },
    { name: "win32", platform: "win32", supportsXdg: false },
  ] as const;

  for (const testCase of platformCases) {
    describe(`on ${testCase.name}`, () => {
      let platformSpy: jest.SpiedFunction<typeof os.platform>;

      beforeEach(() => {
        platformSpy = jest.spyOn(os, "platform").mockReturnValue(testCase.platform as NodeJS.Platform);
      });

      afterEach(() => {
        platformSpy.mockRestore();
      });

      it("puts config.json and the history file under the config directory", () => {
        const paths = readPaths();
        const base = paths.configDirectory;

        expect(path.dirname(paths.userConfigPath)).toBe(base);
        expect(paths.historyDirectory).toBe(base);
        expect(path.dirname(paths.historyFilePath)).toBe(base);
      });

      it("puts rollback and backup state under the config directory outside jest", () => {
        withEnv({ XDG_CONFIG_HOME: "/tmp/fo-base", HOME: "/tmp/fo-home" }, () => {
          const paths = readPaths();
          expect(path.dirname(paths.rollbackDirectory)).toBe(paths.configDirectory);
          expect(path.dirname(paths.backupDirectory)).toBe(paths.configDirectory);
        });
      });

      it("keeps rollback and backup state in the worktree under jest", () => {
        // Deliberate: a test run must not write manifests into the real config dir.
        const paths = readPaths();
        expect(paths.rollbackDirectory).toBe(path.join(process.cwd(), ".file-organizer-rollbacks"));
        expect(paths.backupDirectory).toBe(path.join(process.cwd(), ".file-organizer-backups"));
      });

      it("honors XDG_CONFIG_HOME for config.json when the platform uses it", () => {
        withEnv({ XDG_CONFIG_HOME: "/tmp/fo-xdg-probe", HOME: "/tmp/fo-home" }, () => {
          const paths = readPaths();
          if (testCase.supportsXdg) {
            expect(paths.configDirectory).toBe(path.join("/tmp/fo-xdg-probe", "file-organizer-mcp"));
          } else {
            expect(paths.configDirectory).not.toContain("fo-xdg-probe");
          }
          // The invariant holds regardless of which base won.
          expect(path.dirname(paths.userConfigPath)).toBe(paths.configDirectory);
          expect(paths.historyDirectory).toBe(paths.configDirectory);
        });
      });
    });
  }

  it("relocates config.json and history together on Linux", () => {
    const platformSpy = jest.spyOn(os, "platform").mockReturnValue("linux");
    try {
      withEnv({ XDG_CONFIG_HOME: "/tmp/fo-relocate", HOME: "/tmp/fo-elsewhere" }, () => {
        const paths = readPaths();
        const expected = path.join("/tmp/fo-relocate", "file-organizer-mcp");

        // The regression: config.json used to stay in ~/.config while history
        // followed XDG_CONFIG_HOME, so a sandboxed run loaded the real allow-list.
        expect(paths.userConfigPath).toBe(path.join(expected, "config.json"));
        expect(paths.historyFilePath).toBe(path.join(expected, "operations.jsonl"));
        expect(paths.historyDirectory).toBe(expected);

        for (const value of [paths.configDirectory, paths.userConfigPath, paths.historyFilePath]) {
          expect(value.startsWith(expected)).toBe(true);
        }
      });
    } finally {
      platformSpy.mockRestore();
    }
  });
});
