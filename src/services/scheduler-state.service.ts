/**
 * File Organizer MCP Server v3.2.0
 * Scheduler State Service
 *
 * Persists scheduler state to disk for smart catchup functionality.
 * Tracks last successful run timestamps per watched directory.
 */

import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import os from "os";
import { logger } from "../utils/logger.js";

const STATE_FILE_VERSION = 1;

/**
 * State entry for a single directory
 */
interface DirectoryState {
  /** ISO 8601 timestamp of last successful run */
  lastRunTime: string;
  /** The cron schedule for this directory */
  schedule: string;
}

/**
 * Root state file structure
 */
interface SchedulerState {
  /** Version for future migrations */
  version: number;
  /** Map of directory paths to their state */
  directories: Record<string, DirectoryState>;
}

/**
 * Service for persisting and retrieving scheduler state
 */
export class SchedulerStateService {
  private stateFilePath: string;
  private state: SchedulerState;
  private initialized: boolean = false;

  /**
   * Create a new SchedulerStateService
   * @param stateFilePath - Optional custom path for state file
   */
  constructor(stateFilePath?: string) {
    this.stateFilePath = stateFilePath || this.getDefaultStateFilePath();
    this.state = this.createEmptyState();
  }

  /**
   * Get the default path for the state file
   * Uses the same directory as user config
   */
  private getDefaultStateFilePath(): string {
    const platform = os.platform();
    const home = os.homedir();

    if (platform === "win32") {
      // Windows: %APPDATA%\file-organizer-mcp\scheduler-state.json
      const appData =
        process.env.APPDATA || path.join(home, "AppData", "Roaming");
      return path.join(appData, "file-organizer-mcp", "scheduler-state.json");
    } else if (platform === "darwin") {
      // macOS: ~/Library/Application Support/file-organizer-mcp/scheduler-state.json
      return path.join(
        home,
        "Library",
        "Application Support",
        "file-organizer-mcp",
        "scheduler-state.json",
      );
    } else {
      // Linux: ~/.config/file-organizer-mcp/scheduler-state.json
      return path.join(
        home,
        ".config",
        "file-organizer-mcp",
        "scheduler-state.json",
      );
    }
  }

  /**
   * Create an empty state object
   */
  private createEmptyState(): SchedulerState {
    return {
      version: STATE_FILE_VERSION,
      directories: {},
    };
  }

  /**
   * Initialize the service by loading state from disk
   * Must be called before other methods
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await this.loadState();
      this.initialized = true;
    } catch (error) {
      logger.error("Failed to initialize scheduler state service:", error);
      // Start with empty state on error
      this.state = this.createEmptyState();
      this.initialized = true;
    }
  }

  /**
   * Ensure the service is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        "SchedulerStateService not initialized. Call initialize() first.",
      );
    }
  }

  /**
   * Load state from disk.
   *
   * SECURITY JUSTIFICATION (SEC-016):
   * The state file path (stateFilePath) is internal to the application - it is stored
   * in the application's private config directory (%APPDATA%, ~/Library/Application Support,
   * or ~/.config). JSON.parse is safe here because:
   * 1. The file is written only by this application using JSON.stringify()
   * 2. The file is stored in an OS-protected user directory not accessible to other processes
   * 3. The parsed data is validated by isValidState() before use, ensuring the structure
   *    matches the expected SchedulerState type
   */
  private async loadState(): Promise<void> {
    try {
      // Check if file exists
      if (!fs.existsSync(this.stateFilePath)) {
        logger.debug(
          `Scheduler state file not found at ${this.stateFilePath}, starting fresh`,
        );
        this.state = this.createEmptyState();
        return;
      }

      // Read and parse the file
      const data = await fsPromises.readFile(this.stateFilePath, "utf-8");

      // Handle empty file
      if (!data.trim()) {
        logger.warn("Scheduler state file is empty, starting fresh");
        this.state = this.createEmptyState();
        return;
      }

      const parsed = JSON.parse(data) as SchedulerState;

      // Validate structure
      if (!this.isValidState(parsed)) {
        logger.warn("Scheduler state file is invalid, starting fresh");
        this.state = this.createEmptyState();
        return;
      }

      // Migrate if needed
      this.state = this.migrateState(parsed);
      logger.debug("Scheduler state loaded successfully");
    } catch (error) {
      // Handle JSON parse errors specifically
      if (error instanceof SyntaxError) {
        logger.error(
          "Scheduler state file is corrupted, starting fresh:",
          error,
        );
      } else {
        logger.error("Error loading scheduler state:", error);
      }
      this.state = this.createEmptyState();
    }
  }

  /**
   * Save state to disk
   */
  private async saveState(): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.stateFilePath);
      if (!fs.existsSync(dir)) {
        await fsPromises.mkdir(dir, { recursive: true });
      }

      // Write state to file
      await fsPromises.writeFile(
        this.stateFilePath,
        JSON.stringify(this.state, null, 2),
        "utf-8",
      );
      logger.debug("Scheduler state saved successfully");
    } catch (error) {
      logger.error("Failed to save scheduler state:", error);
      // Don't throw - state persistence is best-effort
    }
  }

  /**
   * Validate the state object structure
   */
  private isValidState(state: unknown): state is SchedulerState {
    if (typeof state !== "object" || state === null) {
      return false;
    }

    const s = state as SchedulerState;

    // Check version
    if (typeof s.version !== "number") {
      return false;
    }

    // Check directories
    if (typeof s.directories !== "object" || s.directories === null) {
      return false;
    }

    // Validate each directory entry
    for (const [key, value] of Object.entries(s.directories)) {
      if (typeof key !== "string") {
        return false;
      }
      if (typeof value !== "object" || value === null) {
        return false;
      }
      const dirState = value as DirectoryState;
      if (typeof dirState.lastRunTime !== "string") {
        return false;
      }
      if (typeof dirState.schedule !== "string") {
        return false;
      }
      // Validate ISO date format
      const date = new Date(dirState.lastRunTime);
      if (isNaN(date.getTime())) {
        return false;
      }
    }

    return true;
  }

  /**
   * Migrate state to current version if needed
   */
  private migrateState(state: SchedulerState): SchedulerState {
    // For now, only version 1 exists
    if (state.version === STATE_FILE_VERSION) {
      return state;
    }

    // Future migrations would go here
    logger.warn(
      `Migrating scheduler state from version ${state.version} to ${STATE_FILE_VERSION}`,
    );
    return {
      ...state,
      version: STATE_FILE_VERSION,
    };
  }

  /**
   * Normalize directory path for consistent storage
   */
  private normalizeDirectory(directory: string): string {
    // Use absolute path
    const absolute = path.resolve(directory);
    // Normalize slashes for cross-platform consistency
    return absolute.replace(/\\/g, "/").toLowerCase();
  }

  /**
   * Get the last run time for a directory
   * @param directory - The directory path
   * @returns The last run time, or null if never ran
   */
  getLastRunTime(directory: string): Date | null {
    this.ensureInitialized();

    const normalizedDir = this.normalizeDirectory(directory);
    const dirState = this.state.directories[normalizedDir];

    if (!dirState) {
      return null;
    }

    const date = new Date(dirState.lastRunTime);
    if (isNaN(date.getTime())) {
      return null;
    }

    return date;
  }

  /**
   * Set the last run time for a directory
   * @param directory - The directory path
   * @param timestamp - The run timestamp (defaults to now)
   * @param schedule - The cron schedule for this directory
   */
  async setLastRunTime(
    directory: string,
    timestamp?: Date,
    schedule?: string,
  ): Promise<void> {
    this.ensureInitialized();

    const normalizedDir = this.normalizeDirectory(directory);
    const runTime = timestamp || new Date();

    this.state.directories[normalizedDir] = {
      lastRunTime: runTime.toISOString(),
      schedule:
        schedule || this.state.directories[normalizedDir]?.schedule || "",
    };

    await this.saveState();
  }

  /**
   * Get the stored schedule for a directory
   * @param directory - The directory path
   * @returns The schedule string, or empty string if not found
   */
  getSchedule(directory: string): string {
    this.ensureInitialized();

    const normalizedDir = this.normalizeDirectory(directory);
    return this.state.directories[normalizedDir]?.schedule || "";
  }

  /**
   * Clear state for a specific directory
   * @param directory - The directory path
   */
  async clearDirectoryState(directory: string): Promise<void> {
    this.ensureInitialized();

    const normalizedDir = this.normalizeDirectory(directory);
    delete this.state.directories[normalizedDir];
    await this.saveState();
  }

  /**
   * Clear all state
   */
  async clearState(): Promise<void> {
    this.ensureInitialized();

    this.state = this.createEmptyState();
    await this.saveState();
    logger.info("Scheduler state cleared");
  }

  /**
   * Get all tracked directories
   * @returns Array of directory paths
   */
  getTrackedDirectories(): string[] {
    this.ensureInitialized();
    return Object.keys(this.state.directories);
  }

  /**
   * Get the full state (for debugging/testing)
   * @returns A copy of the current state
   */
  getState(): SchedulerState {
    this.ensureInitialized();
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Get the state file path (for debugging/testing)
   * @returns The path to the state file
   */
  getStateFilePath(): string {
    return this.stateFilePath;
  }
}

// Singleton instance for the application
let globalSchedulerStateService: SchedulerStateService | null = null;

/**
 * Get or create the global scheduler state service instance
 * @returns The global SchedulerStateService instance
 */
export async function getSchedulerStateService(): Promise<SchedulerStateService> {
  if (!globalSchedulerStateService) {
    globalSchedulerStateService = new SchedulerStateService();
    await globalSchedulerStateService.initialize();
  }
  return globalSchedulerStateService;
}

/**
 * Reset the global scheduler state service (useful for testing)
 */
export function resetSchedulerStateService(): void {
  globalSchedulerStateService = null;
}
