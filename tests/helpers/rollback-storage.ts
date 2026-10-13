/**
 * Rollback-storage isolation for jest suites.
 *
 * `getRollbackDirectory()` returns one directory for the whole run
 * (`<cwd>/.file-organizer-rollbacks` under jest, `src/core/config/paths.ts`).
 * Every worker writes manifests into it, so a test that undoes without naming
 * a `manifest_id` restores whichever batch some other file finished last, and
 * two tests doing a rollback serialize against each other on `manifests.lock`
 * for no reason. That was issue #108.
 *
 * Redirecting the paths module to a per-file temp root is the fix, and doing it
 * in one place keeps it from drifting per suite. Usage, at the top of a test
 * file, before anything imports the tools:
 *
 *   const storage = await isolateRollbackStorage("fom-undo-");
 *   const { handleUndoLastOperation } = await import("../../src/tools/rollback.js");
 *   afterAll(() => storage.remove());
 *
 * The mock spreads `...actualPaths`, so only the four state locations move and
 * every other export keeps the real implementation.
 *
 * This does not make `os.tmpdir()` an allowed root: the sandbox is granted
 * through `CONFIG.paths.customAllowed` by whichever suite needs a path validated
 * under it, exactly as `tests/integration/once-single-pass.test.ts` does.
 */

import { jest } from "@jest/globals";
import fs from "fs/promises";
import os from "os";
import path from "path";

/**
 * The real module, imported before the mock is registered. Importing the same
 * specifier inside the factory would resolve to the mock and recurse.
 */
const actualPaths = await import("../../src/core/config/paths.js");

export interface RollbackStorage {
  /** Root holding config, history, rollback and backup state. */
  root: string;
  /** Where manifests live. This is what `RollbackService` defaults to now. */
  rollbackDir: string;
  /** Where pre-overwrite backups live. */
  backupDir: string;
  /** The config dir, so a suite can also keep history private. */
  configDir: string;
  /** Delete everything. Safe to call twice, and safe after a rm. */
  remove(): Promise<void>;
}

/**
 * Point config, history, rollback and backup storage at a fresh temp root.
 *
 * Must be called before any module that imports `src/core/config/paths.js`,
 * which in practice means before the tool modules are imported. That is why
 * the affected suites import their tools dynamically instead of at the top.
 */
export async function isolateRollbackStorage(
  prefix: string,
): Promise<RollbackStorage> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const configDir = path.join(root, "config");

  jest.unstable_mockModule("../../src/core/config/paths.js", () => ({
    ...actualPaths,
    getUserConfigPath: () => path.join(configDir, "config.json"),
    getHistoryFilePath: () => path.join(configDir, "history.jsonl"),
    getRollbackDirectory: () => path.join(configDir, "rollback"),
    getBackupDirectory: () => path.join(configDir, "backups"),
  }));

  return {
    root,
    configDir,
    rollbackDir: path.join(configDir, "rollback"),
    backupDir: path.join(configDir, "backups"),
    async remove() {
      // Windows holds a handle on a directory a child just wrote for a moment,
      // so a rm immediately after the last write can fail. One retry with a
      // pause is the pattern the other suites use; force keeps it quiet.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await fs.rm(root, { recursive: true, force: true });
          return;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    },
  };
}
