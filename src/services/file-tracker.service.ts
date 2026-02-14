/**
 * File Organizer MCP Server v3.2.0
 * File Tracker Service
 *
 * Tracks file changes and manages organization rules.
 */

import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { logger } from "../utils/logger.js";

interface FileTrackerConfig {
  debounceTime: number;
  rules: unknown[];
  [key: string]: unknown;
}

type FileWatcher = {
  close: () => Promise<void>;
};

export class FileTracker {
  private configPath: string;
  private watchers: Map<string, FileWatcher>;
  private pendingFiles: Set<string>;
  private debounceTimeout: ReturnType<typeof setTimeout> | null;
  private config: FileTrackerConfig | null = null;
  private initialized: boolean = false;

  constructor() {
    this.configPath = path.join(process.cwd(), "config.json");
    this.watchers = new Map();
    this.pendingFiles = new Set();
    this.debounceTimeout = null;
  }

  async stop(): Promise<void> {
    for (const [, watcher] of this.watchers) {
      await watcher.close();
    }
    this.watchers.clear();
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
      this.debounceTimeout = null;
    }
  }

  async init(): Promise<void> {
    await this.loadConfig();
    this.watchConfig();
    this.setupWatchers();
    this.initialized = true;
  }

  /**
   * Security Justification (SEC-001, SEC-016):
   * - this.configPath is constructed from process.cwd() - an internal application path
   * - This is NOT user-provided input - it cannot be controlled by external callers
   * - JSON.parse is safe here because it parses the application's own config file
   *   which is stored in the application's working directory, not user-controlled data
   */
  private async loadConfig(): Promise<void> {
    try {
      const data = await fs.readFile(this.configPath, "utf-8");
      const rawConfig = JSON.parse(data);

      if (
        !rawConfig ||
        typeof rawConfig !== "object" ||
        !rawConfig.rules ||
        (Array.isArray(rawConfig.rules) && rawConfig.rules.length === 0)
      ) {
        throw new Error("No organization rules defined in config");
      }

      if (
        rawConfig.debounceTime &&
        (rawConfig.debounceTime < 100 || rawConfig.debounceTime > 10000)
      ) {
        logger.warn("Invalid debounceTime, using default 1000ms");
        rawConfig.debounceTime = 1000;
      }

      this.config = {
        debounceTime: 1000,
        ...rawConfig,
      } as FileTrackerConfig;
    } catch (error) {
      logger.error("Config load error:", error);
      throw new Error("Invalid configuration - please check config.json");
    }
  }

  private watchConfig(): void {
    if (!this.config) return;

    fsSync.watchFile(this.configPath, () => {
      logger.info("Config file changed, reloading...");
      this.loadConfig().catch((err) => {
        logger.error("Failed to reload config:", err);
      });
    });
  }

  private setupWatchers(): void {
    if (!this.config?.rules) return;

    logger.info("Setting up file watchers...");
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getConfig(): FileTrackerConfig | null {
    return this.config;
  }
}
