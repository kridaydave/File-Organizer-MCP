/**
 * File Organizer MCP Server v5.0.0
 * History Logger Service
 *
 * Tracks operation history as JSON-lines. Stateless: every log() is a direct
 * file append behind an in-process write chain — no batch queue, no flush
 * timer, nothing in memory to lose on crash. A lockfile serializes writers
 * across processes (server + watch bin share one operations.jsonl).
 */

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { logger } from "../utils/logger.js";
import { getHistoryDirectory } from "../core/config/paths.js";

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
  maxFileSizeBytes: number;
  maxBackupFiles: number;
  lockTimeoutMs: number;
}

const DEFAULT_CONFIG: HistoryLoggerConfig = {
  dataDir: getHistoryDirectory(),
  maxFileSizeBytes: 10 * 1024 * 1024,
  maxBackupFiles: 5,
  lockTimeoutMs: 5000,
};

const LOCK_RETRY_MS = 100;

export class HistoryLoggerService {
  private config: HistoryLoggerConfig;
  private writeQueue: Promise<void>;
  private initialized: boolean = false;
  private historyFilePath: string;
  private lockFilePath: string;
  private currentLockToken: string | null = null;

  constructor(config: Partial<HistoryLoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.historyFilePath = path.join(this.config.dataDir, "operations.jsonl");
    this.lockFilePath = path.join(this.config.dataDir, "operations.lock");
    this.writeQueue = Promise.resolve();
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

  /**
   * Append one entry immediately. Serialized through writeQueue so concurrent
   * callers can't interleave lock/append cycles within this process.
   */
  async log(entry: Omit<HistoryEntry, "id" | "timestamp">): Promise<void> {
    await this.init();

    const fullEntry: HistoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };

    const append = this.writeQueue.then(() => this.appendEntry(fullEntry));
    this.writeQueue = append.catch(() => {
      // Already logged in appendEntry; keep the chain alive for next writer.
    });
    await append;
  }

  private async appendEntry(entry: HistoryEntry): Promise<void> {
    try {
      await this.acquireLock();

      try {
        await this.checkRotation();
        await fs.appendFile(this.historyFilePath, JSON.stringify(entry) + "\n");
      } catch (error: unknown) {
        if ((error as { code?: string }).code === "ENOSPC") {
          logger.warn("Disk full, attempting retry once");
          await new Promise((resolve) => setTimeout(resolve, 1000));
          await fs.appendFile(this.historyFilePath, JSON.stringify(entry) + "\n");
        } else {
          throw error;
        }
      } finally {
        await this.releaseLock();
      }
    } catch (error) {
      logger.error("Failed to write history entry:", error);
    }
  }

  private async acquireLock(): Promise<void> {
    const deadline = Date.now() + this.config.lockTimeoutMs;

    while (true) {
      const held = await this.tryAcquireLock();
      if (held) return;

      if (Date.now() >= deadline) {
        throw new Error("History lock timeout — another writer is stuck");
      }
      // Poll no faster than a quarter of the wait window, so a waiter can
      // never wake up past the staleness threshold while the holder lives.
      const sleep = Math.min(LOCK_RETRY_MS, this.config.lockTimeoutMs / 4);
      await new Promise((resolve) => setTimeout(resolve, sleep));
    }
  }

  private async tryAcquireLock(): Promise<boolean> {
    try {
      const stat = await fs.stat(this.lockFilePath).catch(() => null);

      if (stat) {
        // Stale threshold is 2x the wait window: a waiter that polled for the
        // full lockTimeoutMs must never see the holder's live lock cross the
        // staleness line at the exact same moment and steal it.
        const staleAfterMs = this.config.lockTimeoutMs * 2;
        const lockAge = Date.now() - stat.mtimeMs;
        if (lockAge > staleAfterMs) {
          logger.warn("Stale lock detected, removing");
          await fs.unlink(this.lockFilePath).catch(() => null);
        } else {
          return false;
        }
      }

      const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await fs.writeFile(this.lockFilePath, token, {
        flag: "wx",
      });
      this.currentLockToken = token;
      return true;
    } catch {
      return false;
    }
  }

  private async releaseLock(): Promise<void> {
    try {
      if (this.currentLockToken) {
        const content = await fs
          .readFile(this.lockFilePath, "utf-8")
          .catch(() => null);
        if (content === this.currentLockToken) {
          await fs.unlink(this.lockFilePath).catch(() => null);
        }
        this.currentLockToken = null;
      } else {
        await fs.unlink(this.lockFilePath).catch(() => null);
      }
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
        const rotatedPath = (n: number) =>
          path.join(this.config.dataDir, `operations.${n}.jsonl`);
        try {
          await fs.rename(rotatedPath(i), rotatedPath(i + 1));
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
    const lockAcquired = await this.tryAcquireLock();

    try {
      const filesToRead = [this.historyFilePath];
      for (let i = 1; i <= this.config.maxBackupFiles; i++) {
        filesToRead.push(
          path.join(this.config.dataDir, `operations.${i}.jsonl`),
        );
      }

      for (const file of filesToRead) {
        const content = await fs.readFile(file, "utf-8").catch(() => "");
        if (!content) continue;

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
    // Redact Windows paths (e.g. C:\Users\..., D:/Projects/...)
    let redacted = text.replace(/[A-Za-z]:[/\\][^\s]+/g, "[REDACTED]");
    // Redact Unix absolute paths (e.g. /home/..., /var/..., /tmp/...)
    redacted = redacted.replace(
      /(?:^|[\s"'])(\/(?:[^\s"'/]+\/)*[^\s"'/]+)/g,
      (match, p) => match.replace(p, "[REDACTED]"),
    );
    return redacted;
  }
}

export const historyLogger = new HistoryLoggerService();
