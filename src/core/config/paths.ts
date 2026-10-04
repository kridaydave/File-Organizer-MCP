/**
 * Config — paths / platform-aware directory helpers
 * Extracted from src/config.ts (no behavior change)
 */

import os from "os";
import path from "path";
import fs from "fs";
import { logger } from "../../utils/logger.js";

/**
 * Get default allowed directories based on platform
 */
export function getDefaultAllowedDirs(): string[] {
  const platform = os.platform();
  const home = os.homedir();

  let commonDirs = [
    path.join(home, "Desktop"),
    path.join(home, "Documents"),
    path.join(home, "Downloads"),
    path.join(home, "Pictures"),
    path.join(home, "Videos"),
    path.join(home, "Music"),
  ];

  // Add common project directories if they exist
  const projectDirs = [
    path.join(home, "Projects"),
    path.join(home, "Workspace"),
    path.join(home, "workspace"),
    path.join(home, "Development"),
    path.join(home, "Code"),
  ];

  commonDirs = [...commonDirs, ...projectDirs];

  // Platform-specific additions
  if (platform === "win32") {
    // Windows: Add OneDrive if it exists
    const oneDrive = process.env.OneDrive || process.env.OneDriveConsumer;
    if (oneDrive) commonDirs.push(oneDrive);
  } else if (platform === "darwin") {
    // macOS: Add iCloud Drive if it exists
    const iCloudDrive = path.join(
      home,
      "Library",
      "Mobile Documents",
      "com~apple~CloudDocs",
    );
    commonDirs.push(iCloudDrive);

    // Add common macOS locations
    commonDirs.push(path.join(home, "Movies"));

    // Add external volumes directory
    commonDirs.push("/Volumes");
  } else if (platform === "linux") {
    // Linux: Add common development directories
    commonDirs.push(path.join(home, "dev"));

    // Add external volumes directories
    commonDirs.push("/mnt");
    commonDirs.push("/media");
    commonDirs.push("/run/media");
  }

  // Add project directory when running tests
  const isTestMode =
    process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID !== undefined;
  if (isTestMode) {
    const projectDir = process.cwd();
    if (!commonDirs.includes(projectDir)) {
      commonDirs.push(projectDir);
    }
  }

  // In test mode, always allow the three system-organize source dirs
  // even if they don't exist on CI (e.g. ~/Downloads on ubuntu runner)
  const alwaysAllowedInTest = isTestMode
    ? [
        path.join(home, "Downloads"),
        path.join(home, "Desktop"),
        os.tmpdir(),
      ]
    : [];

  // Only return directories that actually exist and are not symlinks
  return commonDirs.filter((dir) => {
    if (alwaysAllowedInTest.includes(dir)) {
      return true;
    }
    try {
      const stats = fs.lstatSync(dir);
      return stats.isDirectory() && !stats.isSymbolicLink();
    } catch (error) {
      logger.debug(
        `Skipping directory ${dir}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      return false;
    }
  });
}

/**
 * Get the platform config directory that holds config.json, operations.jsonl,
 * rollbacks and backups.
 *
 * All four state locations derive from this one function. When config.json and
 * the rest resolved independently, setting XDG_CONFIG_HOME moved the history and
 * rollback dirs while leaving config.json in the real home directory, so a
 * sandboxed run could still read the developer's allow-list. One base path means
 * one env var relocates all of it.
 *
 * macOS keeps its own convention rather than honoring XDG_CONFIG_HOME: the
 * platform convention is ~/Library/Application Support, and a user who sets
 * XDG_CONFIG_HOME on a Mac expects Linux-style paths in their shell tooling, not
 * in an app's config.
 */
export function getConfigDirectory(): string {
  const platform = os.platform();
  const home = os.homedir();

  if (platform === "win32") {
    const appData =
      process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(appData, "file-organizer-mcp");
  }
  if (platform === "darwin") {
    return path.join(
      home,
      "Library",
      "Application Support",
      "file-organizer-mcp",
    );
  }
  const basePath = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  return path.join(basePath, "file-organizer-mcp");
}

/**
 * Get path to user config file
 */
export function getUserConfigPath(): string {
  return path.join(getConfigDirectory(), "config.json");
}

/**
 * Get the history directory path
 */
export function getHistoryDirectory(): string {
  return getConfigDirectory();
}

/**
 * Get the history file path
 */
export function getHistoryFilePath(): string {
  return path.join(getHistoryDirectory(), "operations.jsonl");
}

/**
 * Directory holding rollback manifests (undo history).
 * Platform config dir — NOT process.cwd(), which breaks npx/global installs
 * where the launch directory changes between runs.
 *
 * Under jest, fall back to the legacy cwd location so test manifests stay in
 * the worktree instead of the developer's real config dir.
 */
export function getRollbackDirectory(): string {
  const isTestMode =
    process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID !== undefined;
  if (isTestMode) {
    return path.join(process.cwd(), ".file-organizer-rollbacks");
  }
  return path.join(getHistoryDirectory(), "rollbacks");
}

/** Name of the quarantine area created inside a directory being quarantined. */
export const QUARANTINE_DIR_NAME = ".file-organizer-quarantine";

/**
 * Quarantine root for a source directory: a hidden child of that directory.
 *
 * It lives inside the source on purpose. The source has already passed
 * validateStrictPath, so the child inherits the same allowed-dir grant and the
 * quarantine area needs no extra configuration from the user. A location under
 * the OS config dir cannot serve here: that dir is outside the allowed dirs on
 * Linux, and it is blocked outright on macOS (/Library/Application Support)
 * and Windows (AppData\Roaming), so validateStrictPath would refuse it.
 */
export function getQuarantineDirectory(sourceDirectory: string): string {
  return path.join(sourceDirectory, QUARANTINE_DIR_NAME);
}

/**
 * Directory holding pre-overwrite backups and duplicate trash.
 * Platform config dir — NOT process.cwd(), which breaks npx/global installs.
 */
export function getBackupDirectory(): string {
  const isTestMode =
    process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID !== undefined;
  if (isTestMode) {
    return path.join(process.cwd(), ".file-organizer-backups");
  }
  return path.join(getHistoryDirectory(), "backups");
}

