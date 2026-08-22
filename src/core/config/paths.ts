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

  // Only return directories that actually exist and are not symlinks
  return commonDirs.filter((dir) => {
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
 * Get path to user config file
 */
export function getUserConfigPath(): string {
  const platform = os.platform();
  const home = os.homedir();

  if (platform === "win32") {
    // Windows: %APPDATA%\file-organizer-mcp\config.json
    const appData =
      process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(appData, "file-organizer-mcp", "config.json");
  } else if (platform === "darwin") {
    // macOS: ~/Library/Application Support/file-organizer-mcp/config.json
    return path.join(
      home,
      "Library",
      "Application Support",
      "file-organizer-mcp",
      "config.json",
    );
  } else {
    // Linux: ~/.config/file-organizer-mcp/config.json
    return path.join(home, ".config", "file-organizer-mcp", "config.json");
  }
}

/**
 * Get the history directory path
 */
export function getHistoryDirectory(): string {
  const platform = process.platform;
  const home = os.homedir();

  let basePath: string;
  if (platform === "win32") {
    basePath = process.env.APPDATA || path.join(home, "AppData", "Roaming");
  } else if (platform === "darwin") {
    basePath = path.join(home, "Library", "Application Support");
  } else {
    basePath = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  }

  return path.join(basePath, "file-organizer-mcp");
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
