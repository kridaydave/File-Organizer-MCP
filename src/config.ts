/**
 * File Organizer MCP Server Configuration
 * Secure defaults with platform-aware directory access
 */

import os from "os";
import path from "path";
import fs from "fs";
import { logger } from "./utils/logger.js";

export const CONFIG = {
  VERSION: "3.3.1",

  // Security Settings
  security: {
    enablePathValidation: true,
    allowCustomDirectories: true,
    logAccess: true,
    maxScanDepth: 10,
    maxFilesPerOperation: 10000,
  },

  // Path Access Control
  paths: {
    defaultAllowed: getDefaultAllowedDirs(),
    customAllowed: loadCustomAllowedDirs(),
    alwaysBlocked: getAlwaysBlockedPatterns(),
  },
};

/**
 * User configuration structure
 */
export interface UserConfig {
  /** Custom directories allowed for file operations */
  customAllowedDirectories?: string[];
  /** Conflict resolution strategy */
  conflictStrategy?: "rename" | "skip" | "overwrite";
  /** Auto-organize schedule settings */
  autoOrganize?: {
    enabled: boolean;
    schedule?: "hourly" | "daily" | "weekly";
  };
  /** Security settings */
  settings?: {
    maxScanDepth?: number;
    logAccess?: boolean;
    enablePathValidation?: boolean;
    allowCustomDirectories?: boolean;
  };
  /** Organization rules */
  rules?: Array<{
    pattern: string;
    destination: string;
    overwrite?: boolean;
  }>;
  /** Watch list for smart scheduling */
  watchList?: WatchConfig[];
}

/**
 * Watch configuration for per-directory scheduling
 */
export interface WatchConfig {
  /** Directory path to watch */
  directory: string;
  /** Cron expression for scheduling (e.g., "0 9 * * *" for 9am daily) */
  schedule: string;
  /** Organization rules for this watch */
  rules: {
    /** Enable auto-organization */
    auto_organize: boolean;
    /** Minimum file age in minutes before organizing (prevents organizing files being written) */
    min_file_age_minutes?: number;
    /** Maximum files to process per run (0 or undefined = unlimited) */
    max_files_per_run?: number;
    /** Catchup behavior when server starts */
    catchup_mode?: "smart" | "always" | "never";
  };
}

/**
 * Get default allowed directories based on platform
 */
function getDefaultAllowedDirs(): string[] {
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
  } else if (platform === "linux") {
    // Linux: Add common development directories
    commonDirs.push(path.join(home, "dev"));
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
    } catch {
      return false;
    }
  });
}

/**
 * Deep merge two objects
 */
function deepMerge(
  target: UserConfig,
  source: Partial<UserConfig>,
): UserConfig {
  const result: UserConfig = { ...target };

  for (const key in source) {
    const sourceValue = source[key as keyof UserConfig];
    if (sourceValue !== undefined) {
      const targetValue = result[key as keyof UserConfig];
      if (
        typeof sourceValue === "object" &&
        sourceValue !== null &&
        !Array.isArray(sourceValue) &&
        typeof targetValue === "object" &&
        targetValue !== null &&
        !Array.isArray(targetValue)
      ) {
        (result as Record<string, unknown>)[key] = deepMerge(
          targetValue as UserConfig,
          sourceValue as Partial<UserConfig>,
        );
      } else {
        (result as Record<string, unknown>)[key] = sourceValue;
      }
    }
  }

  return result;
}

/**
 * Load custom allowed directories from user config file
 */
export function loadUserConfig(): UserConfig {
  const configPath = getUserConfigPath();

  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    const configData = fs.readFileSync(configPath, "utf-8");

    // Handle empty file
    if (!configData.trim()) {
      logger.warn(`Warning: Config file is empty: ${configPath}`);
      return {};
    }

    const parsed = JSON.parse(configData) as UserConfig;

    // Validate that parsed result is an object
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error("Config file does not contain a valid JSON object");
    }

    return parsed;
  } catch (error) {
    const errorMessage = (error as Error).message;

    // Handle specific JSON parse errors
    if (
      errorMessage.includes("JSON") ||
      errorMessage.includes("Unexpected token")
    ) {
      logger.error(
        `
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
      `.trim(),
      );
    } else {
      logger.error("Error loading user config:", errorMessage);
    }

    return {};
  }
}

/**
 * Update user config with deep merge (preserves existing settings)
 * @deprecated Use updateUserConfig instead
 */
export function saveConfig(config: Partial<UserConfig>): void {
  updateUserConfig(config);
}

/**
 * Update user config with deep merge (preserves existing settings)
 * @returns true if successful, false otherwise
 */
export function updateUserConfig(updates: Partial<UserConfig>): boolean {
  try {
    const configPath = getUserConfigPath();

    // Read existing config
    const existingConfig = loadUserConfig();

    // Deep merge the updates
    const mergedConfig = deepMerge(existingConfig, updates);

    // Ensure config directory exists
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Write merged config back to disk
    fs.writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2));
    return true;
  } catch (error) {
    logger.error("Error saving config:", (error as Error).message);
    return false;
  }
}

function loadCustomAllowedDirs(): string[] {
  try {
    const config = loadUserConfig();

    if (Array.isArray(config.customAllowedDirectories)) {
      // Validate that custom directories exist, are not symlinks, and block path traversal
      return config.customAllowedDirectories.filter((dir: string) => {
        try {
          // First check if path exists and get stats (before any resolution)
          const stats = fs.lstatSync(dir);

          // Reject symlinks immediately
          if (stats.isSymbolicLink()) {
            logger.error(`Warning: Custom directory blocked (symlink): ${dir}`);
            return false;
          }

          // Only accept directories
          if (!stats.isDirectory()) {
            return false;
          }

          // Resolve to absolute path to check for traversal attempts
          const resolvedDir = path.resolve(dir);
          const home = os.homedir();

          // Block path traversal outside of home directory
          if (!resolvedDir.startsWith(home)) {
            logger.error(
              `Warning: Custom directory blocked (outside home): ${dir}`,
            );
            return false;
          }

          // Block relative path traversal patterns
          if (dir.includes("..") || dir.includes("~")) {
            logger.error(
              `Warning: Custom directory blocked (path traversal): ${dir}`,
            );
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
 * Get always-blocked path patterns
 */
function getAlwaysBlockedPatterns(): RegExp[] {
  const platform = os.platform();

  // Common patterns across all platforms
  const common = [
    /node_modules/i,
    /\.git[\/\\]/i,
    /\.vscode[\/\\]/i,
    /\.idea[\/\\]/i,
    /\.next[\/\\]/i,
    /dist[\/\\]/i,
    /build[\/\\]/i,
  ];

  if (platform === "win32") {
    return [
      ...common,
      /^[A-Z]:[\/\\]Windows[\/\\]/i,
      /^[A-Z]:[\/\\]Program Files[\/\\]/i,
      /^[A-Z]:[\/\\]Program Files \(x86\)[\/\\]/i,
      /^[A-Z]:[\/\\]ProgramData[\/\\]/i,
      /[\/\\]AppData[\/\\]/i,
      /^[A-Z]:[\/\\]\$Recycle\.Bin[\/\\]/i,
      /^[A-Z]:[\/\\]System Volume Information[\/\\]/i,
    ];
  } else if (platform === "darwin") {
    return [
      ...common,
      /^\/System[\/]/,
      /^\/Library[\/]/,
      /^\/Applications[\/]/,
      /^\/private[\/]/,
      /^\/usr[\/]/,
      /^\/bin[\/]/,
      /^\/sbin[\/]/,
      /^\/opt[\/]/,
      /\/Library\/Application Support[\/]/,
    ];
  } else {
    return [
      ...common,
      /^\/etc[\/]/,
      /^\/usr[\/]/,
      /^\/bin[\/]/,
      /^\/sbin[\/]/,
      /^\/sys[\/]/,
      /^\/proc[\/]/,
      /^\/root[\/]/,
      /^\/var[\/]/,
      /^\/boot[\/]/,
      /^\/opt[\/]/,
    ];
  }
}

/**
 * Create default user config file if it doesn't exist
 */
export function initializeUserConfig(): void {
  try {
    const configPath = getUserConfigPath();
    const configDir = path.dirname(configPath);

    // Create directory if it doesn't exist
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Create default config file if it doesn't exist
    if (!fs.existsSync(configPath)) {
      const defaultConfig: UserConfig = {
        customAllowedDirectories: [],
        conflictStrategy: "rename",
        autoOrganize: {
          enabled: false,
        },
        settings: {
          maxScanDepth: 10,
          logAccess: true,
        },
      };

      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
      logger.error(`Created default config file at: ${configPath}`);
    }
  } catch (error) {
    logger.error("Error initializing user config:", (error as Error).message);
  }
}

// Config is initialized lazily on first access to avoid side effects
let configInitialized = false;
function ensureConfigInitialized() {
  if (!configInitialized) {
    initializeUserConfig();
    configInitialized = true;
  }
}

// Backward compatibility exports
export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
export const MAX_FILES = CONFIG.security.maxFilesPerOperation;
export const MAX_DEPTH = CONFIG.security.maxScanDepth;

export const SKIP_DIRECTORIES = [
  "node_modules",
  ".git",
  "__pycache__",
  ".venv",
] as const;

export const SKIP_PATTERNS = {
  HIDDEN_FILES: /^\./,
} as const;
