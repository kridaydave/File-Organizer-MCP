/**
 * File Organizer MCP Server v3.4.0
 * History Logger Service
 *
 * Tracks operation history with JSON-lines format, batching, and file rotation.
 */

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { logger } from "../utils/logger.js";

export interface HistoryEntry {
  id: string;
  timestamp: string;
  operation: string;
  source: "manual" | "scheduled";
  status: "success" | "error" | "partial";
  durationMs: number;
  filesProcessed?: number;
  filesSkipped?: number;
  details?: string;
  error?: { message: string; code?: string };
}

export interface HistoryQuery {
  startDate?: string;
  endDate?: string;
  operation?: string;
  status?: "success" | "error" | "partial";
  source?: "manual" | "scheduled";
  limit?: number;
  offset?: number;
  privacyMode?: "full" | "redacted" | "none";
}

export interface HistoryResult {
  entries: HistoryEntry[];
  total: number;
  hasMore: boolean;
}

interface HistoryLoggerConfig {
  dataDir: string;
  batchSize: number;
  batchTimeoutMs: number;
  maxFileSizeBytes: number;
  maxBackupFiles: number;
  lockTimeoutMs: number;
}

const DEFAULT_CONFIG: HistoryLoggerConfig = {
  dataDir: path.join(process.cwd(), "data"),
  batchSize: 10,
  batchTimeoutMs: 1000,
  maxFileSizeBytes: 10 * 1024 * 1024,
  maxBackupFiles: 5,
  lockTimeoutMs: 5000,
};

export class HistoryLoggerService {
  private config: HistoryLoggerConfig;
  private writeQueue: Promise<void>;
  private pendingEntries: HistoryEntry[];
  private flushTimeout: ReturnType<typeof setTimeout> | null;
  private initialized: boolean = false;
  private historyFilePath: string;
  private lockFilePath: string;

  constructor(config: Partial<HistoryLoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.historyFilePath = path.join(this.config.dataDir, "operations.jsonl");
    this.lockFilePath = path.join(this.config.dataDir, "operations.lock");
    this.writeQueue = Promise.resolve();
    this.pendingEntries = [];
    this.flushTimeout = null;
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.config.dataDir, { recursive: true });
      logger.info("HistoryLoggerService initialized", {
        dataDir: this.config.dataDir,
        historyFile: this.historyFilePath,
      });
      this.initialized = true;
    } catch (error) {
      logger.error("Failed to initialize HistoryLoggerService:", error);
    }
  }

  getHistoryFilePath(): string {
    return this.historyFilePath;
  }

  async log(entry: Omit<HistoryEntry, "id" | "timestamp">): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }

    const fullEntry: HistoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };

    this.pendingEntries.push(fullEntry);

    if (this.pendingEntries.length >= this.config.batchSize) {
      await this.flush();
    } else if (!this.flushTimeout) {
      this.flushTimeout = setTimeout(() => {
        this.flush().catch((err) => {
          logger.error("Failed to flush history entries:", err);
        });
      }, this.config.batchTimeoutMs);
    }
  }

  private async flush(): Promise<void> {
    if (this.pendingEntries.length === 0) return;

    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    const entriesToWrite = [...this.pendingEntries];
    this.pendingEntries = [];

    this.writeQueue = this.writeQueue.then(async () => {
      await this.writeEntries(entriesToWrite);
    });

    await this.writeQueue;
  }

  private async writeEntries(entries: HistoryEntry[]): Promise<void> {
    const lockAcquired = await this.acquireLock();
    if (!lockAcquired) {
      this.pendingEntries.unshift(...entries);
      return;
    }

    try {
      await this.checkRotation();

      const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";

      try {
        await fs.appendFile(this.historyFilePath, lines);
      } catch (error: unknown) {
        if ((error as { code?: string }).code === "ENOSPC") {
          logger.warn("Disk full, attempting retry once");
          await new Promise((resolve) => setTimeout(resolve, 1000));
          await fs.appendFile(this.historyFilePath, lines);
        } else {
          throw error;
        }
      }
    } catch (error) {
      logger.error("Failed to write history entries:", error);
    } finally {
      await this.releaseLock();
    }
  }

  private async acquireLock(): Promise<boolean> {
    try {
      const stat = await fs.stat(this.lockFilePath).catch(() => null);

      if (stat) {
        const lockAge = Date.now() - stat.mtimeMs;
        if (lockAge > this.config.lockTimeoutMs) {
          logger.warn("Stale lock detected, removing");
          await fs.unlink(this.lockFilePath).catch(() => null);
        } else {
          return false;
        }
      }

      await fs.writeFile(this.lockFilePath, String(Date.now()), {
        flag: "wx",
      });
      return true;
    } catch {
      return false;
    }
  }

  private async releaseLock(): Promise<void> {
    try {
      await fs.unlink(this.lockFilePath);
    } catch {
      // Ignore cleanup errors
    }
  }

  private async checkRotation(): Promise<void> {
    try {
      const stat = await fs.stat(this.historyFilePath).catch(() => null);
      if (!stat || stat.size < this.config.maxFileSizeBytes) return;

      logger.info("Rotating history file", { currentSize: stat.size });

      for (let i = this.config.maxBackupFiles - 1; i >= 1; i--) {
        const oldPath = path.join(this.config.dataDir, `operations.${i}.jsonl`);
        const newPath = path.join(
          this.config.dataDir,
          `operations.${i + 1}.jsonl`,
        );
        try {
          await fs.rename(oldPath, newPath);
        } catch {
          // File doesn't exist, continue
        }
      }

      await fs.rename(
        this.historyFilePath,
        path.join(this.config.dataDir, "operations.1.jsonl"),
      );
    } catch (error) {
      logger.error("Failed to rotate history file:", error);
    }
  }

  async getHistory(query: HistoryQuery = {}): Promise<HistoryResult> {
    if (!this.initialized) {
      await this.init();
    }

    const {
      startDate,
      endDate,
      operation,
      status,
      source,
      limit = 100,
      offset = 0,
      privacyMode = "full",
    } = query;

    const allEntries: HistoryEntry[] = [];
    const lockAcquired = await this.acquireLock();

    try {
      const content = await fs
        .readFile(this.historyFilePath, "utf-8")
        .catch(() => "");

      const lines = content.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as HistoryEntry;
          allEntries.push(entry);
        } catch (error) {
          logger.debug(
            `Skipped corrupted history line: ${(error as Error).message}`,
          );
        }
      }
    } catch (error) {
      logger.error("Failed to read history file:", error);
    } finally {
      if (lockAcquired) {
        await this.releaseLock();
      }
    }

    let filtered = allEntries;

    if (startDate) {
      filtered = filtered.filter((e) => e.timestamp >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter((e) => e.timestamp <= endDate);
    }
    if (operation) {
      filtered = filtered.filter((e) => e.operation === operation);
    }
    if (status) {
      filtered = filtered.filter((e) => e.status === status);
    }
    if (source) {
      filtered = filtered.filter((e) => e.source === source);
    }

    const total = filtered.length;
    const paged = filtered
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(offset, offset + limit);

    const redacted = this.applyPrivacyMode(paged, privacyMode);

    return {
      entries: redacted,
      total,
      hasMore: offset + limit < total,
    };
  }

  private applyPrivacyMode(
    entries: HistoryEntry[],
    mode: "full" | "redacted" | "none",
  ): HistoryEntry[] {
    if (mode === "full") return entries;

    return entries.map((entry) => {
      if (mode === "none") {
        return {
          operation: entry.operation,
          status: entry.status,
          durationMs: entry.durationMs,
        } as HistoryEntry;
      }

      return {
        ...entry,
        details: entry.details ? this.redactPaths(entry.details) : undefined,
        error: entry.error
          ? { message: this.redactPaths(entry.error.message) }
          : undefined,
      };
    });
  }

  private redactPaths(text: string): string {
    return text.replace(/[A-Za-z]:\\[^\s]+/g, "[REDACTED]");
  }

  async flushAndClose(): Promise<void> {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    await this.flush();
  }
}

export const historyLogger = new HistoryLoggerService();
