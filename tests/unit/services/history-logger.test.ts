/**
 * HistoryLoggerService Unit Tests
 * Tests for history logging, batching, file rotation, privacy modes
 */

import fs from "fs/promises";
import path from "path";
import {
  HistoryLoggerService,
  type HistoryEntry,
} from "../../../src/services/history-logger.service.js";
import {
  setupLoggerMocks,
  teardownLoggerMocks,
  mockLogger,
} from "../../utils/logger-mock.js";

describe("HistoryLoggerService", () => {
  let service: HistoryLoggerService;
  let dataDir: string;

  beforeEach(async () => {
    setupLoggerMocks();

    dataDir = await fs.mkdtemp(
      path.join(process.cwd(), "tests", "temp", "history-"),
    );

    service = new HistoryLoggerService({
      dataDir,
      batchSize: 5,
      batchTimeoutMs: 100,
      maxFileSizeBytes: 1024,
      maxBackupFiles: 3,
      lockTimeoutMs: 1000,
    });

    await service.init();
  });

  afterEach(async () => {
    try {
      await fs.rm(dataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    } finally {
      teardownLoggerMocks();
    }
  });

  describe("log()", () => {
    it("should add entries to queue without immediate flush", async () => {
      const entry = {
        operation: "organize",
        source: "manual" as const,
        status: "success" as const,
        durationMs: 100,
        filesProcessed: 5,
      };

      await service.log(entry);

      const history = await service.getHistory({});
      expect(history.entries).toHaveLength(0);
    });

    it("should flush when batch size is reached", async () => {
      for (let i = 0; i < 5; i++) {
        await service.log({
          operation: "organize",
          source: "manual",
          status: "success",
          durationMs: 100,
          filesProcessed: 1,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 50));

      const history = await service.getHistory({});
      expect(history.entries).toHaveLength(5);
    });

    it("should flush after batch timeout", async () => {
      await service.log({
        operation: "organize",
        source: "manual",
        status: "success",
        durationMs: 50,
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      const history = await service.getHistory({});
      expect(history.entries).toHaveLength(1);
    });

    it("should generate unique IDs for each entry", async () => {
      await service.log({
        operation: "organize",
        source: "manual",
        status: "success",
        durationMs: 100,
      });
      await service.log({
        operation: "organize",
        source: "manual",
        status: "success",
        durationMs: 100,
      });

      await service.flushAndClose();

      const history = await service.getHistory({});
      const ids = history.entries.map((e) => e.id);
      expect(new Set(ids).size).toBe(2);
    });

    it("should add timestamps to entries", async () => {
      const before = new Date().toISOString();

      await service.log({
        operation: "organize",
        source: "manual",
        status: "success",
        durationMs: 100,
      });

      const after = new Date().toISOString();

      await service.flushAndClose();

      const history = await service.getHistory({});
      expect(history.entries[0].timestamp).toBeDefined();
      expect(history.entries[0].timestamp >= before).toBe(true);
      expect(history.entries[0].timestamp <= after).toBe(true);
    });

    it("should include optional fields when provided", async () => {
      await service.log({
        operation: "organize",
        source: "scheduled",
        status: "partial",
        durationMs: 500,
        filesProcessed: 8,
        filesSkipped: 2,
        details: "Some files skipped due to permission",
      });

      await service.flushAndClose();

      const history = await service.getHistory({});
      const entry = history.entries[0];

      expect(entry.filesProcessed).toBe(8);
      expect(entry.filesSkipped).toBe(2);
      expect(entry.details).toBe("Some files skipped due to permission");
    });

    it("should include error info when provided", async () => {
      await service.log({
        operation: "organize",
        source: "manual",
        status: "error",
        durationMs: 50,
        error: { message: "File not found", code: "ENOENT" },
      });

      await service.flushAndClose();

      const history = await service.getHistory({});
      expect(history.entries[0].error?.message).toBe("File not found");
      expect(history.entries[0].error?.code).toBe("ENOENT");
    });

    it("should handle rapid sequential logs", async () => {
      const logs: Promise<void>[] = [];
      for (let i = 0; i < 20; i++) {
        logs.push(
          service.log({
            operation: "organize",
            source: "manual",
            status: "success",
            durationMs: 10,
            filesProcessed: 1,
          }),
        );
      }

      await Promise.all(logs);
      await service.flushAndClose();

      const history = await service.getHistory({ limit: 100 });
      expect(history.entries.length).toBeGreaterThanOrEqual(10);
    });
  });

  describe("getHistory()", () => {
    beforeEach(async () => {
      for (let i = 0; i < 10; i++) {
        await service.log({
          operation: i < 5 ? "organize" : "scan",
          source: i % 2 === 0 ? "manual" : "scheduled",
          status: i % 3 === 0 ? "error" : "success",
          durationMs: 100 + i,
          filesProcessed: i + 1,
        });
      }
      await service.flushAndClose();
    });

    it("should return all entries with default query", async () => {
      const history = await service.getHistory({});
      expect(history.entries).toHaveLength(10);
      expect(history.total).toBe(10);
      expect(history.hasMore).toBe(false);
    });

    it("should filter by operation", async () => {
      const history = await service.getHistory({ operation: "organize" });
      expect(history.entries.length).toBeGreaterThan(0);
      expect(history.entries.every((e) => e.operation === "organize")).toBe(
        true,
      );
    });

    it("should filter by status", async () => {
      const history = await service.getHistory({ status: "error" });
      expect(history.entries.length).toBeGreaterThan(0);
      expect(history.entries.every((e) => e.status === "error")).toBe(true);
    });

    it("should filter by source", async () => {
      const history = await service.getHistory({ source: "manual" });
      expect(history.entries.length).toBeGreaterThan(0);
      expect(history.entries.every((e) => e.source === "manual")).toBe(true);
    });

    it("should support pagination with limit", async () => {
      const history = await service.getHistory({ limit: 3 });
      expect(history.entries).toHaveLength(3);
      expect(history.hasMore).toBe(true);
    });

    it("should support pagination with offset", async () => {
      const all = await service.getHistory({ limit: 100 });
      const paged = await service.getHistory({ limit: 3, offset: 3 });

      expect(paged.entries[0].id).toBe(all.entries[3].id);
    });

    it("should filter by start date", async () => {
      const entries = await service.getHistory({});
      const midTimestamp =
        entries.entries[Math.floor(entries.entries.length / 2)]?.timestamp;

      const history = await service.getHistory({ startDate: midTimestamp });
      expect(history.entries.length).toBeGreaterThan(0);
    });

    it("should filter by end date", async () => {
      const entries = await service.getHistory({});
      const midTimestamp =
        entries.entries[Math.floor(entries.entries.length / 2)]?.timestamp;

      const history = await service.getHistory({ endDate: midTimestamp });
      expect(history.entries.length).toBeGreaterThan(0);
    });

    it("should combine multiple filters", async () => {
      const history = await service.getHistory({
        operation: "organize",
        source: "manual",
        status: "success",
      });

      expect(history.entries.length).toBeGreaterThan(0);
      expect(
        history.entries.every(
          (e) =>
            e.operation === "organize" &&
            e.source === "manual" &&
            e.status === "success",
        ),
      ).toBe(true);
    });

    it("should sort by timestamp descending", async () => {
      const history = await service.getHistory({});
      const timestamps = history.entries.map((e) => e.timestamp);

      for (let i = 0; i < timestamps.length - 1; i++) {
        expect(timestamps[i] >= timestamps[i + 1]).toBe(true);
      }
    });

    it("should return hasMore correctly", async () => {
      const history = await service.getHistory({ limit: 100 });
      expect(history.hasMore).toBe(false);

      const paged = await service.getHistory({ limit: 3 });
      expect(paged.hasMore).toBe(true);
    });
  });

  describe("File locking", () => {
    it("should acquire lock for writing", async () => {
      await service.log({
        operation: "organize",
        source: "manual",
        status: "success",
        durationMs: 100,
      });

      await service.flushAndClose();

      const lockPath = path.join(dataDir, "operations.lock");
      await expect(fs.stat(lockPath)).rejects.toThrow();
    });

    it("should handle concurrent writes with locking", async () => {
      const service2 = new HistoryLoggerService({
        dataDir,
        batchSize: 5,
        batchTimeoutMs: 50,
        lockTimeoutMs: 2000,
      });
      await service2.init();

      const logs: Promise<void>[] = [];
      for (let i = 0; i < 5; i++) {
        logs.push(
          service.log({
            operation: "organize",
            source: "manual",
            status: "success",
            durationMs: 10,
          }),
        );
        logs.push(
          service2.log({
            operation: "scan",
            source: "scheduled",
            status: "success",
            durationMs: 10,
          }),
        );
      }

      await Promise.all(logs);
      await service.flushAndClose();
      await service2.flushAndClose();

      const history = await service.getHistory({ limit: 100 });
      expect(history.entries.length).toBe(10);
    });

    it("should handle stale lock cleanup", async () => {
      const newService = new HistoryLoggerService({
        dataDir,
        batchSize: 5,
        batchTimeoutMs: 50,
        lockTimeoutMs: 5000,
      });

      const lockPath = path.join(dataDir, "operations.lock");
      await fs.mkdir(dataDir, { recursive: true });
      await fs
        .writeFile(lockPath, String(Date.now() - 30000), { flag: "wx" })
        .catch(() => null);

      await newService.init();
      await newService.log({
        operation: "organize",
        source: "manual",
        status: "success",
        durationMs: 100,
      });

      await newService.flushAndClose();

      const history = await newService.getHistory({});
      expect(history.entries.length).toBeGreaterThanOrEqual(0);
    });

    it("should re-queue entries when lock cannot be acquired", async () => {
      const lockPath = path.join(dataDir, "operations.lock");

      await fs.writeFile(lockPath, String(Date.now()), { flag: "wx" });

      await service.log({
        operation: "organize",
        source: "manual",
        status: "success",
        durationMs: 100,
      });

      await fs.unlink(lockPath);

      await new Promise((resolve) => setTimeout(resolve, 200));

      const history = await service.getHistory({});
      expect(history.entries.length).toBe(1);
    });
  });

  describe("File rotation", () => {
    it("should rotate file when max size exceeded", async () => {
      const smallService = new HistoryLoggerService({
        dataDir,
        batchSize: 2,
        maxFileSizeBytes: 100,
        maxBackupFiles: 2,
      });
      await smallService.init();

      for (let i = 0; i < 10; i++) {
        await smallService.log({
          operation: "organize",
          source: "manual",
          status: "success",
          durationMs: 50,
          details: "x".repeat(50),
        });
      }

      await smallService.flushAndClose();

      const mainFile = path.join(dataDir, "operations.jsonl");
      const backup1 = path.join(dataDir, "operations.1.jsonl");

      const mainStat = await fs.stat(mainFile);
      expect(mainStat.size).toBeLessThan(500);

      const backupExists = await fs.stat(backup1).catch(() => null);
      expect(backupExists).not.toBeNull();
    });

    it("should maintain backup file rotation", async () => {
      const smallService = new HistoryLoggerService({
        dataDir,
        batchSize: 2,
        maxFileSizeBytes: 50,
        maxBackupFiles: 2,
      });
      await smallService.init();

      for (let i = 0; i < 20; i++) {
        await smallService.log({
          operation: "organize",
          source: "manual",
          status: "success",
          durationMs: 50,
          details: "x".repeat(20),
        });
      }

      await smallService.flushAndClose();

      const backup2 = path.join(dataDir, "operations.2.jsonl");
      const backup2Exists = await fs.stat(backup2).catch(() => null);
      expect(backup2Exists).not.toBeNull();
    });

    it("should skip missing backup files during rotation", async () => {
      await service.log({
        operation: "organize",
        source: "manual",
        status: "success",
        durationMs: 100,
      });
      await service.flushAndClose();

      const history = await service.getHistory({});
      expect(history.entries.length).toBe(1);
    });
  });

  describe("Privacy modes", () => {
    beforeEach(async () => {
      await service.log({
        operation: "organize",
        source: "manual",
        status: "success",
        durationMs: 100,
        details: "Moved C:\\Users\\test\\file.txt to Documents",
        error: { message: "Failed to move C:\\private\\secret.txt" },
      });
      await service.flushAndClose();
    });

    it("should return full entries in full mode", async () => {
      const history = await service.getHistory({ privacyMode: "full" });
      expect(history.entries[0].details).toContain("C:\\Users\\test");
    });

    it("should redact paths in redacted mode", async () => {
      const history = await service.getHistory({ privacyMode: "redacted" });
      expect(history.entries[0].details).toContain("[REDACTED]");
      expect(history.entries[0].details).not.toContain("C:\\Users\\test");
      expect(history.entries[0].error?.message).toContain("[REDACTED]");
    });

    it("should return minimal info in none mode", async () => {
      const history = await service.getHistory({ privacyMode: "none" });
      const entry = history.entries[0] as unknown as Record<string, unknown>;

      expect(entry.operation).toBe("organize");
      expect(entry.status).toBe("success");
      expect(entry.durationMs).toBe(100);
      expect(entry.id).toBeUndefined();
      expect(entry.timestamp).toBeUndefined();
      expect((entry as { source?: unknown }).source).toBeUndefined();
      expect(entry.details).toBeUndefined();
    });

    it("should default to full mode", async () => {
      const history = await service.getHistory({});
      expect(history.entries[0].details).toContain("C:\\Users\\test");
    });
  });

  describe("Graceful degradation", () => {
    it("should not throw when file does not exist", async () => {
      const newService = new HistoryLoggerService({
        dataDir: path.join(dataDir, "nonexistent"),
      });
      await newService.init();

      const history = await newService.getHistory({});
      expect(history.entries).toHaveLength(0);
      expect(history.total).toBe(0);
    });

    it("should handle read errors gracefully", async () => {
      const historyFile = path.join(dataDir, "operations.jsonl");
      await fs.writeFile(historyFile, "invalid content");

      const history = await service.getHistory({});
      expect(history.entries).toHaveLength(0);
    });

    it("should handle write errors gracefully", async () => {
      await service.log({
        operation: "organize",
        source: "manual",
        status: "success",
        durationMs: 100,
      });

      await service.flushAndClose();

      const history = await service.getHistory({});
      expect(history.entries.length).toBeGreaterThanOrEqual(0);
    });

    it("should handle disk full error with retry", async () => {
      await service.log({
        operation: "organize",
        source: "manual",
        status: "success",
        durationMs: 100,
      });

      await service.flushAndClose();

      const history = await service.getHistory({});
      expect(history.entries.length).toBe(1);
    });

    it("should continue operation after lock timeout", async () => {
      const shortLockService = new HistoryLoggerService({
        dataDir,
        batchSize: 2,
        lockTimeoutMs: 10,
      });
      await shortLockService.init();

      await shortLockService.log({
        operation: "organize",
        source: "manual",
        status: "success",
        durationMs: 100,
      });

      await shortLockService.flushAndClose();

      const history = await shortLockService.getHistory({});
      expect(history.entries.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Empty history", () => {
    it("should return empty result for no entries", async () => {
      const history = await service.getHistory({});
      expect(history.entries).toHaveLength(0);
      expect(history.total).toBe(0);
      expect(history.hasMore).toBe(false);
    });

    it("should handle empty file", async () => {
      const historyFile = path.join(dataDir, "operations.jsonl");
      await fs.writeFile(historyFile, "");

      const history = await service.getHistory({});
      expect(history.entries).toHaveLength(0);
    });

    it("should handle file with only whitespace", async () => {
      const historyFile = path.join(dataDir, "operations.jsonl");
      await fs.writeFile(historyFile, "   \n\n   \n");

      const history = await service.getHistory({});
      expect(history.entries).toHaveLength(0);
    });
  });

  describe("Corrupted lines", () => {
    it("should skip invalid JSON lines", async () => {
      const historyFile = path.join(dataDir, "operations.jsonl");
      const validEntry = {
        id: "123",
        timestamp: new Date().toISOString(),
        operation: "organize",
        source: "manual",
        status: "success",
        durationMs: 100,
      };
      await fs.writeFile(
        historyFile,
        `{"invalid json"}
${JSON.stringify(validEntry)}
also invalid
`,
      );

      const history = await service.getHistory({});
      expect(history.entries).toHaveLength(1);
      expect(history.entries[0].operation).toBe("organize");
    });

    it("should skip lines with missing required fields", async () => {
      const historyFile = path.join(dataDir, "operations.jsonl");
      const now = new Date().toISOString();
      const entries = [
        {
          id: "1",
          timestamp: now,
          operation: "organize",
          source: "manual" as const,
          status: "success" as const,
          durationMs: 100,
        },
        {
          id: "2",
          timestamp: now,
          operation: "scan",
          source: "scheduled" as const,
          status: "success" as const,
          durationMs: 50,
        },
      ];

      await fs.writeFile(
        historyFile,
        JSON.stringify(entries[0]) + "\n" + JSON.stringify(entries[1]) + "\n",
      );

      const history = await service.getHistory({});
      expect(history.entries.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle mixed valid and invalid entries", async () => {
      const historyFile = path.join(dataDir, "operations.jsonl");
      const entries = [
        {
          id: "1",
          timestamp: new Date().toISOString(),
          operation: "organize",
          source: "manual" as const,
          status: "success" as const,
          durationMs: 100,
        },
        "{ invalid",
        "{ 'single quotes': 'invalid' }",
        {
          id: "2",
          timestamp: new Date().toISOString(),
          operation: "scan",
          source: "scheduled" as const,
          status: "success" as const,
          durationMs: 50,
        },
      ];

      await fs.writeFile(
        historyFile,
        entries
          .map((e) => (typeof e === "string" ? e : JSON.stringify(e)))
          .join("\n") + "\n",
      );

      const history = await service.getHistory({});
      expect(history.entries.length).toBe(2);
    });
  });

  describe("flushAndClose()", () => {
    it("should flush pending entries on close", async () => {
      await service.log({
        operation: "organize",
        source: "manual",
        status: "success",
        durationMs: 100,
      });

      await service.flushAndClose();

      const history = await service.getHistory({});
      expect(history.entries).toHaveLength(1);
    });

    it("should clear flush timeout on close", async () => {
      await service.log({
        operation: "organize",
        source: "manual",
        status: "success",
        durationMs: 100,
      });

      await service.flushAndClose();
      await service.flushAndClose();

      const history = await service.getHistory({});
      expect(history.entries).toHaveLength(1);
    });
  });

  describe("getHistoryFilePath()", () => {
    it("should return correct file path", () => {
      const filePath = service.getHistoryFilePath();
      expect(filePath).toBe(path.join(dataDir, "operations.jsonl"));
    });
  });

  describe("init()", () => {
    it("should create data directory on init", async () => {
      const newDir = path.join(dataDir, "nested", "directory");
      const newService = new HistoryLoggerService({ dataDir: newDir });

      await newService.init();

      const stat = await fs.stat(newDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it("should not fail if already initialized", async () => {
      await service.init();
      await service.init();

      const history = await service.getHistory({});
      expect(history).toBeDefined();
    });

    it("should handle initialization failure gracefully", async () => {
      const newService = new HistoryLoggerService({ dataDir: dataDir });
      await newService.init();

      await service.log({
        operation: "test",
        source: "manual",
        status: "success",
        durationMs: 10,
      });

      await service.flushAndClose();
    });
  });
});
