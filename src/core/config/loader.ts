/**
 * Config — user-config file IO + validation
 * Extracted from src/config.ts (no behavior change)
 */
import os from "os";
import path from "path";
import fs from "fs";
import { logger } from "../../utils/logger.js";
import { isSubPath } from "../../utils/file-utils.js";
import type { PrivacyMode } from "../../types.js";
import { getUserConfigPath } from "./paths.js";
import { isExternalVolumePath } from "./security.js";

export interface UserConfig {
  customAllowedDirectories?: string[];
  allowExternalVolumes?: boolean;
  conflictStrategy?: "rename" | "skip" | "overwrite";
  autoOrganize?: { enabled: boolean; schedule?: "hourly" | "daily" | "weekly"; };
  settings?: { maxScanDepth?: number; logAccess?: boolean; enablePathValidation?: boolean; allowCustomDirectories?: boolean; };
  rules?: Array<{ pattern: string; destination: string; overwrite?: boolean; }>;
  watchList?: WatchConfig[];
  historyLogging?: { enabled?: boolean; maxFileSizeMB?: number; keepRotatedFiles?: number; privacyMode?: PrivacyMode; };
}
export interface WatchConfig {
  directory: string;
  schedule: string;
  rules: { auto_organize: boolean; min_file_age_minutes?: number; max_files_per_run?: number; catchup_mode?: "smart" | "always" | "never"; };
}
export function deepMerge(target: UserConfig, source: Partial<UserConfig>): UserConfig {
  const result: UserConfig = { ...target };
  for (const key in source) {
    const sourceValue = source[key as keyof UserConfig];
    if (sourceValue !== undefined) {
      const targetValue = result[key as keyof UserConfig];
      if (typeof sourceValue === "object" && sourceValue !== null && !Array.isArray(sourceValue) && typeof targetValue === "object" && targetValue !== null && !Array.isArray(targetValue)) {
        (result as Record<string, unknown>)[key] = deepMerge(targetValue as UserConfig, sourceValue as Partial<UserConfig>);
      } else {
        (result as Record<string, unknown>)[key] = sourceValue;
      }
    }
  }
  return result;
}
export function loadUserConfig(): UserConfig {
  const configPath = getUserConfigPath();
  if (!fs.existsSync(configPath)) return {};
  try {
    const configData = fs.readFileSync(configPath, "utf-8");
    if (!configData.trim()) {
      logger.warn(`Warning: Config file is empty: ${configPath}`);
      return {};
    }
    const parsed = JSON.parse(configData) as UserConfig;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("Config file does not contain a valid JSON object");
    return parsed;
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage.includes("JSON") || errorMessage.includes("Unexpected token")) {
      logger.error(`
⚠️  CONFIG FILE CORRUPTED ⚠️

The config file at:
  ${configPath}

appears to be corrupted or contains invalid JSON.
Error: ${errorMessage}

To fix this:
  1. Backup the corrupted file: cp "${configPath}" "${configPath}.backup"
  2. Delete the corrupted file: rm "${configPath}"
  3. Re-run the setup wizard: npx file-organizer-mcp --setup

Your file organization settings will be reset, but your actual files are safe.
      `.trim());
    } else {
      logger.error("Error loading user config:", errorMessage);
    }
    return {};
  }
}
/** @deprecated Use updateUserConfig instead */
export function saveConfig(config: Partial<UserConfig>): void { updateUserConfig(config); }
export function updateUserConfig(updates: Partial<UserConfig>): boolean {
  try {
    const configPath = getUserConfigPath();
    const existingConfig = loadUserConfig();
    const mergedConfig = deepMerge(existingConfig, updates);
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2));
    return true;
  } catch (error) {
    logger.error("Error saving config:", (error as Error).message);
    return false;
  }
}
export function loadCustomAllowedDirs(): string[] {
  try {
    const config = loadUserConfig();
    if (Array.isArray(config.customAllowedDirectories)) {
      return config.customAllowedDirectories.filter((dir: string) => {
        try {
          const expandedDir = dir.startsWith("~") ? path.join(os.homedir(), dir.slice(1)) : dir;
          const stats = fs.lstatSync(expandedDir);
          if (stats.isSymbolicLink()) {
            logger.error(`Warning: Custom directory blocked (symlink): ${dir}`);
            return false;
          }
          if (expandedDir.includes("..") || expandedDir.includes("\0")) {
            const reason = expandedDir.includes("\0") ? "null byte" : "path traversal";
            logger.error(`Warning: Custom directory blocked (${reason}): ${dir}`);
            return false;
          }
          if (!stats.isDirectory()) return false;
          const resolvedDir = path.resolve(expandedDir);
          const home = os.homedir();
          const externalVolumeAllowed = config.allowExternalVolumes === true && isExternalVolumePath(resolvedDir);
          if (!isSubPath(home, resolvedDir) && !externalVolumeAllowed) {
            logger.error(`Warning: Custom directory blocked (outside home): ${dir}`);
            return false;
          }
          return true;
        } catch {
          logger.error(`Warning: Custom directory does not exist: ${dir}`);
          return false;
        }
      });
    }
  } catch (error) {
    logger.error("Error loading custom config:", (error as Error).message);
  }
  return [];
}
export function initializeUserConfig(): void {
  try {
    const configPath = getUserConfigPath();
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
    if (!fs.existsSync(configPath)) {
      const defaultConfig: UserConfig = {
        customAllowedDirectories: [],
        conflictStrategy: "rename",
        autoOrganize: { enabled: false },
        settings: { maxScanDepth: 10, logAccess: true },
      };
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
      logger.info(`Created default config file at: ${configPath}`);
    }
  } catch (error) {
    logger.error("Error initializing user config:", (error as Error).message);
  }
}
