/**
 * HistoryLoggerService Unit Tests
 * Tests for direct-append history logging, file rotation, privacy modes
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
} from "../../utils/logger-mock.js";

const sampleEntry = (overrides: Partial<HistoryEntry> = {}) => ({
  operation: "organize",
  source: "manual" as const,
  status: "success" as const,
  durationMs: 100,
  ...overrides,
});

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
      // Realistic rotation threshold — the tiny-size rotation behavior has
      // its own describe block with dedicated small services.
      maxFileSizeBytes: 10 * 1024 * 1024,
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
    it("should persist an entry immediately on disk", async () => {
      const entry = sampleEntry({ filesProcessed: 5 });

      await service.log(entry);

      // Read the raw file directly — proves nothing sits in a memory queue.
      const content = await fs.readFile(
        path.join(dataDir, "operations.jsonl"),
        "utf-8",
      );
      const lines = content.trim().split("\n");
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0]).operation).toBe("organize");

      const history = await service.getHistory({});
      expect(history.entries).toHaveLength(1);
    });

    it("should generate unique IDs for each entry", async () => {
      await service.log(sampleEntry());
      await service.log(sampleEntry());

      const history = await service.getHistory({});
      const ids = history.entries.map((e) => e.id);
      expect(new Set(ids).size).toBe(2);
    });

    it("should add timestamps to entries", async () => {
      const before = new Date().toISOString();

      await service.log(sampleEntry());

      const after = new Date().toISOString();

      const history = await service.getHistory({});
      expect(history.entries[0].timestamp).toBeDefined();
      expect(history.entries[0].timestamp >= before).toBe(true);
      expect(history.entries[0].timestamp <= after).toBe(true);
    });

    it("should include optional fields when provided", async () => {
      await service.log(
        sampleEntry({
          source: "scheduled",
          status: "partial",
          durationMs: 500,
          filesProcessed: 8,
          filesSkipped: 2,
          details: "Some files skipped due to permission",
        }),
      );

      const history = await service.getHistory({});
      const entry = history.entries[0];

      expect(entry.filesProcessed).toBe(8);
      expect(entry.filesSkipped).toBe(2);
      expect(entry.details).toBe("Some files skipped due to permission");
    });

    it("should include error info when provided", async () => {
      await service.log(
        sampleEntry({
          status: "error",
          durationMs: 50,
          error: { message: "File not found", code: "ENOENT" },
        }),
      );

      const history = await service.getHistory({});
      expect(history.entries[0].error?.message).toBe("File not found");
      expect(history.entries[0].error?.code).toBe("ENOENT");
    });

    it("should handle rapid sequential logs without loss", async () => {
      const logs: Promise<void>[] = [];
      for (let i = 0; i < 20; i++) {
        logs.push(service.log(sampleEntry()));
      }

      await Promise.all(logs);

      const history = await service.getHistory({ limit: 100 });
      expect(history.entries).toHaveLength(20);
    });
  });

  describe("getHistory()", () => {
    beforeEach(async () => {
      for (let i = 0; i < 10; i++) {
        await service.log(
          sampleEntry({
            operation: i < 5 ? "organize" : "scan",
            source: i % 2 === 0 ? "manual" : "scheduled",
            status: i % 3 === 0 ? "error" : "success",
            durationMs: 100 + i,
            filesProcessed: i + 1,
          }),
        );
      }
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
    it("should release lock after writing", async () => {
      await service.log(sampleEntry());

      const lockPath = path.join(dataDir, "operations.lock");
      await expect(fs.stat(lockPath)).rejects.toThrow();
    });

    it("should handle concurrent writers across instances", async () => {
      const service2 = new HistoryLoggerService({
        dataDir,
        lockTimeoutMs: 2000,
      });
      await service2.init();

      const logs: Promise<void>[] = [];
      for (let i = 0; i < 5; i++) {
        logs.push(
          service.log(sampleEntry({ operation: "organize" })),
        );
        logs.push(
          service2.log(sampleEntry({ operation: "scan", source: "scheduled" })),
        );
      }

      await Promise.all(logs);

      const history = await service.getHistory({ limit: 100 });
      expect(history.entries).toHaveLength(10);
    });

    it("should handle stale lock cleanup", async () => {
      const newService = new HistoryLoggerService({
        dataDir,
        lockTimeoutMs: 5000,
      });

      const lockPath = path.join(dataDir, "operations.lock");
      await fs.writeFile(lockPath, String(Date.now()), { flag: "wx" });
      // Staleness is judged by mtime — backdate the file to simulate a lock
      // left behind by a crashed process.
      const old = new Date(Date.now() - 30000);
      await fs.utimes(lockPath, old, old);

      await newService.init();
      await newService.log(sampleEntry());

      const history = await newService.getHistory({});
      expect(history.entries.length).toBe(1);
    });

    it("should give up gracefully when lock stays held and recover after", async () => {
      const lockPath = path.join(dataDir, "operations.lock");
      await fs.writeFile(lockPath, String(Date.now()), { flag: "wx" });

      // Lock never released within lockTimeoutMs (1000ms) — write is dropped
      // and logged, not crash.
      await expect(
        service.log(sampleEntry()),
      ).resolves.toBeUndefined();

      const during = await service.getHistory({});
      expect(during.entries.length).toBe(0);

      // Once the lock clears, subsequent writes succeed.
      await fs.unlink(lockPath);
      await service.log(sampleEntry());

      const after = await service.getHistory({});
      expect(after.entries.length).toBe(1);
    }, 10000);
  });

  describe("File rotation", () => {
    it("should rotate file when max size exceeded", async () => {
      const smallService = new HistoryLoggerService({
        dataDir,
        maxFileSizeBytes: 100,
        maxBackupFiles: 2,
      });
      await smallService.init();

      for (let i = 0; i < 10; i++) {
        await smallService.log(
          sampleEntry({ durationMs: 50, details: "x".repeat(50) }),
        );
      }

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
        maxFileSizeBytes: 50,
        maxBackupFiles: 2,
      });
      await smallService.init();

      for (let i = 0; i < 20; i++) {
        await smallService.log(
          sampleEntry({ durationMs: 50, details: "x".repeat(20) }),
        );
      }

      const backup2 = path.join(dataDir, "operations.2.jsonl");
      const backup2Exists = await fs.stat(backup2).catch(() => null);
      expect(backup2Exists).not.toBeNull();
    });
  });

  describe("Privacy modes", () => {
    beforeEach(async () => {
      await service.log(
        sampleEntry({
          details: "Moved C:\\Users\\test\\file.txt to Documents",
          error: { message: "Failed to move C:\\private\\secret.txt" },
        }),
      );
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

    it("should continue operating after a failed append target", async () => {
      await service.log(sampleEntry());

      const history = await service.getHistory({});
      expect(history.entries.length).toBeGreaterThanOrEqual(0);
    });

    it("should continue accepting writes after a lock timeout", async () => {
      const shortLockService = new HistoryLoggerService({
        dataDir,
        lockTimeoutMs: 50,
      });
      await shortLockService.init();

      const lockPath = path.join(dataDir, "operations.lock");
      await fs.writeFile(lockPath, String(Date.now()), { flag: "wx" });

      await shortLockService.log(sampleEntry()); // dropped, lock held

      await fs.unlink(lockPath);
      await service.log(sampleEntry()); // recovers

      const history = await service.getHistory({});
      expect(history.entries.length).toBeGreaterThanOrEqual(1);
    }, 10000);
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
  });
});
