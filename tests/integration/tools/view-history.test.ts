/**
 * Integration Tests for View History Tool
 * Tests history query operations with real file system
 */

import fs from "fs/promises";
import path from "path";
import { jest } from "@jest/globals";
import {
  setupLoggerMocks,
  teardownLoggerMocks,
} from "../../utils/logger-mock.js";
import type {
  HistoryEntry,
  HistoryResult,
  HistoryQuery,
} from "../../../src/services/history-logger.service.js";

// Test data store - will be cleared before each test
const testHistoryData: HistoryEntry[] = [];

function applyPrivacyMode(
  entries: HistoryEntry[],
  mode: "full" | "redacted" | "none",
): HistoryEntry[] {
  if (mode === "full") return entries;

  const redactPaths = (text: string): string =>
    text.replace(/[A-Za-z]:\\[^\s]+/g, "[REDACTED]");

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
      details: entry.details ? redactPaths(entry.details) : undefined,
      error: entry.error
        ? { message: redactPaths(entry.error.message) }
        : undefined,
    };
  });
}

async function mockGetHistory(query: HistoryQuery): Promise<HistoryResult> {
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

  let filtered = [...testHistoryData];

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

  const redacted = applyPrivacyMode(paged, privacyMode);

  return {
    entries: redacted,
    total,
    hasMore: offset + limit < total,
  };
}

// Mock the history logger service using unstable_mockModule for ES modules
jest.unstable_mockModule(
  "../../../src/services/history-logger.service.js",
  () => ({
    HistoryLoggerService: jest.fn(),
    historyLogger: {
      init: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      log: jest
        .fn<(entry: HistoryEntry) => Promise<void>>()
        .mockImplementation((entry) => {
          const fullEntry: HistoryEntry = {
            ...entry,
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
          };
          testHistoryData.push(fullEntry);
          return Promise.resolve();
        }),
      getHistory: jest
        .fn<(query: HistoryQuery) => Promise<HistoryResult>>()
        .mockImplementation((query) => mockGetHistory(query)),
      flushAndClose: jest
        .fn<() => Promise<void>>()
        .mockResolvedValue(undefined),
      getHistoryFilePath: jest.fn<() => string>().mockReturnValue(""),
    },
  }),
);

const { handleViewHistory } =
  await import("../../../src/tools/view-history.js");

describe("View History Tool - Integration Tests", () => {
  let testDataDir: string;
  let baseTempDir: string;

  const createTestEntry = (
    overrides: Partial<Omit<HistoryEntry, "id" | "timestamp">> = {},
  ): Omit<HistoryEntry, "id" | "timestamp"> => ({
    operation: "organize_files",
    source: "manual",
    status: "success",
    durationMs: 100,
    filesProcessed: 5,
    filesSkipped: 2,
    ...overrides,
  });

  const populateHistory = (
    entries: Array<Omit<HistoryEntry, "id" | "timestamp">>,
  ): void => {
    for (const entry of entries) {
      const fullEntry: HistoryEntry = {
        ...entry,
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      };
      testHistoryData.push(fullEntry);
    }
  };

  beforeEach(async () => {
    setupLoggerMocks();

    baseTempDir = path.join(process.cwd(), "tests", "temp");
    await fs.mkdir(baseTempDir, { recursive: true });
    testDataDir = await fs.mkdtemp(path.join(baseTempDir, "test-history-"));
    // Clear the test data
    testHistoryData.length = 0;
  });

  afterEach(async () => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      console.error("Cleanup error:", error);
    }
    teardownLoggerMocks();
  });

  describe("Basic Query", () => {
    it("should return history entries", async () => {
      populateHistory([
        createTestEntry({ operation: "organize_files", status: "success" }),
        createTestEntry({ operation: "scan_directory", status: "success" }),
      ]);

      const result = await handleViewHistory({
        response_format: "json",
      });

      const output = result.structuredContent as {
        entries: HistoryEntry[];
        total: number;
      };
      expect(output).toBeDefined();
      expect(output.entries).toHaveLength(2);
      expect(output.total).toBe(2);
    });

    it("should return entries sorted by timestamp descending", async () => {
      populateHistory([createTestEntry({ operation: "first_op" })]);
      await new Promise((resolve) => setTimeout(resolve, 20));
      populateHistory([createTestEntry({ operation: "second_op" })]);

      const result = await handleViewHistory({
        response_format: "json",
      });

      const output = result.structuredContent as {
        entries: HistoryEntry[];
      };
      expect(output.entries[0].operation).toBe("second_op");
      expect(output.entries[1].operation).toBe("first_op");
    });
  });

  describe("Filtering", () => {
    it("should filter by operation name", async () => {
      populateHistory([
        createTestEntry({ operation: "organize_files" }),
        createTestEntry({ operation: "scan_directory" }),
        createTestEntry({ operation: "organize_files" }),
      ]);

      const result = await handleViewHistory({
        operation: "organize_files",
        response_format: "json",
      });

      const output = result.structuredContent as {
        entries: HistoryEntry[];
        total: number;
      };
      expect(output.entries).toHaveLength(2);
      expect(output.total).toBe(2);
      expect(
        output.entries.every((e) => e.operation === "organize_files"),
      ).toBe(true);
    });

    it("should filter by status", async () => {
      populateHistory([
        createTestEntry({ status: "success" }),
        createTestEntry({ status: "error" }),
        createTestEntry({ status: "success" }),
        createTestEntry({ status: "partial" }),
      ]);

      const result = await handleViewHistory({
        status: "success",
        response_format: "json",
      });

      const output = result.structuredContent as {
        entries: HistoryEntry[];
        total: number;
      };
      expect(output.entries).toHaveLength(2);
      expect(output.total).toBe(2);
      expect(output.entries.every((e) => e.status === "success")).toBe(true);
    });

    it("should filter by source", async () => {
      populateHistory([
        createTestEntry({ source: "manual" }),
        createTestEntry({ source: "scheduled" }),
        createTestEntry({ source: "manual" }),
      ]);

      const result = await handleViewHistory({
        source: "scheduled",
        response_format: "json",
      });

      const output = result.structuredContent as {
        entries: HistoryEntry[];
        total: number;
      };
      expect(output.entries).toHaveLength(1);
      expect(output.total).toBe(1);
      expect(output.entries[0].source).toBe("scheduled");
    });

    it("should combine multiple filters", async () => {
      populateHistory([
        createTestEntry({
          operation: "organize",
          status: "success",
          source: "manual",
        }),
        createTestEntry({
          operation: "organize",
          status: "error",
          source: "manual",
        }),
        createTestEntry({
          operation: "organize",
          status: "success",
          source: "scheduled",
        }),
        createTestEntry({
          operation: "scan",
          status: "success",
          source: "manual",
        }),
      ]);

      const result = await handleViewHistory({
        operation: "organize",
        status: "success",
        source: "manual",
        response_format: "json",
      });

      const output = result.structuredContent as {
        entries: HistoryEntry[];
        total: number;
      };
      expect(output.entries).toHaveLength(1);
      expect(output.total).toBe(1);
    });
  });

  describe("Pagination", () => {
    it("should respect limit parameter", async () => {
      const entries = Array.from({ length: 15 }, (_, i) =>
        createTestEntry({ operation: `op_${i.toString().padStart(2, "0")}` }),
      );
      populateHistory(entries);

      const result = await handleViewHistory({
        limit: 5,
        response_format: "json",
      });

      const output = result.structuredContent as {
        entries: HistoryEntry[];
        total: number;
        hasMore: boolean;
      };
      expect(output.entries).toHaveLength(5);
      expect(output.total).toBe(15);
      expect(output.hasMore).toBe(true);
    });

    it("should indicate when no more entries exist", async () => {
      populateHistory([createTestEntry({ operation: "single_op" })]);

      const result = await handleViewHistory({
        limit: 10,
        response_format: "json",
      });

      const output = result.structuredContent as {
        entries: HistoryEntry[];
        hasMore: boolean;
      };
      expect(output.entries).toHaveLength(1);
      expect(output.hasMore).toBe(false);
    });

    it("should use default limit of 20 when not specified", async () => {
      const entries = Array.from({ length: 30 }, () => createTestEntry());
      populateHistory(entries);

      const result = await handleViewHistory({
        response_format: "json",
      });

      const output = result.structuredContent as {
        entries: HistoryEntry[];
        total: number;
      };
      expect(output.entries).toHaveLength(20);
      expect(output.total).toBe(30);
    });
  });

  describe("Date Filtering", () => {
    it("should filter by since parameter", async () => {
      populateHistory([createTestEntry({ operation: "old_op" })]);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const midTime = new Date().toISOString();
      await new Promise((resolve) => setTimeout(resolve, 100));

      populateHistory([createTestEntry({ operation: "new_op" })]);

      const result = await handleViewHistory({
        since: midTime,
        response_format: "json",
      });

      const output = result.structuredContent as {
        entries: HistoryEntry[];
        total: number;
      };
      expect(output.entries).toHaveLength(1);
      expect(output.entries[0].operation).toBe("new_op");
    });

    it("should filter by until parameter", async () => {
      populateHistory([createTestEntry({ operation: "first_op" })]);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const midTime = new Date().toISOString();
      await new Promise((resolve) => setTimeout(resolve, 100));

      populateHistory([createTestEntry({ operation: "second_op" })]);

      const result = await handleViewHistory({
        until: midTime,
        response_format: "json",
      });

      const output = result.structuredContent as {
        entries: HistoryEntry[];
        total: number;
      };
      expect(output.entries).toHaveLength(1);
      expect(output.entries[0].operation).toBe("first_op");
    });

    it("should combine since and until for date range", async () => {
      populateHistory([createTestEntry({ operation: "before_range" })]);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const startTime = new Date().toISOString();
      await new Promise((resolve) => setTimeout(resolve, 100));

      populateHistory([createTestEntry({ operation: "in_range" })]);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const endTime = new Date().toISOString();
      await new Promise((resolve) => setTimeout(resolve, 100));

      populateHistory([createTestEntry({ operation: "after_range" })]);

      const result = await handleViewHistory({
        since: startTime,
        until: endTime,
        response_format: "json",
      });

      const output = result.structuredContent as {
        entries: HistoryEntry[];
        total: number;
      };
      expect(output.entries).toHaveLength(1);
      expect(output.entries[0].operation).toBe("in_range");
    });
  });

  describe("Privacy Modes", () => {
    it("should return full details in full mode", async () => {
      populateHistory([
        createTestEntry({
          operation: "test_op",
          details: "File moved from C:\\Users\\test\\file.txt",
          error: { message: "Error at C:\\path\\to\\file" },
        }),
      ]);

      const result = await handleViewHistory({
        privacy_mode: "full",
        response_format: "json",
      });

      const output = result.structuredContent as {
        entries: HistoryEntry[];
      };
      const entry = output.entries[0];
      expect(entry.details).toContain("C:\\Users\\test\\file.txt");
      expect(entry.error?.message).toContain("C:\\path\\to\\file");
    });

    it("should redact paths in redacted mode", async () => {
      populateHistory([
        createTestEntry({
          operation: "test_op",
          details: "File moved from C:\\Users\\test\\file.txt",
          error: { message: "Error at C:\\path\\to\\file" },
        }),
      ]);

      const result = await handleViewHistory({
        privacy_mode: "redacted",
        response_format: "json",
      });

      const output = result.structuredContent as {
        entries: HistoryEntry[];
      };
      const entry = output.entries[0];
      expect(entry.details).not.toContain("C:\\Users\\test");
      expect(entry.details).toContain("[REDACTED]");
      expect(entry.error?.message).toContain("[REDACTED]");
    });

    it("should return minimal info in none mode", async () => {
      populateHistory([
        createTestEntry({
          operation: "test_op",
          source: "manual",
          status: "success",
          filesProcessed: 10,
          details: "Sensitive details",
          error: { message: "Error message" },
        }),
      ]);

      const result = await handleViewHistory({
        privacy_mode: "none",
        response_format: "json",
      });

      const output = result.structuredContent as {
        entries: HistoryEntry[];
      };
      const entry = output.entries[0];
      expect(entry.operation).toBe("test_op");
      expect(entry.status).toBe("success");
      expect(entry.durationMs).toBeDefined();
      expect(entry.source).toBeUndefined();
      expect(entry.filesProcessed).toBeUndefined();
      expect(entry.details).toBeUndefined();
      expect(entry.error).toBeUndefined();
    });
  });

  describe("Empty History", () => {
    it("should handle empty history gracefully", async () => {
      const result = await handleViewHistory({
        response_format: "json",
      });

      const output = result.structuredContent as {
        entries: HistoryEntry[];
        total: number;
      };
      expect(output.entries).toHaveLength(0);
      expect(output.total).toBe(0);
    });

    it("should return user-friendly message for empty history in markdown mode", async () => {
      const result = await handleViewHistory({});

      const text = result.content[0].text;
      expect(text).toContain("No history entries found");
    });
  });

  describe("JSON Output Format", () => {
    it("should return structured content when response_format is json", async () => {
      populateHistory([createTestEntry({ operation: "test_op" })]);

      const result = await handleViewHistory({
        response_format: "json",
      });

      expect(result.structuredContent).toBeDefined();
      expect(result.content[0].text).toContain("test_op");
    });

    it("should return markdown formatted output by default", async () => {
      populateHistory([
        createTestEntry({
          operation: "test_op",
          status: "success",
          source: "manual",
          filesProcessed: 5,
        }),
      ]);

      const result = await handleViewHistory({});

      const text = result.content[0].text;
      expect(text).toContain("### File Organization History");
      expect(text).toContain("| Timestamp | Operation | Source | Status |");
      expect(text).toContain("test_op");
      expect(result.structuredContent).toBeUndefined();
    });

    it("should include error section for failed operations in markdown", async () => {
      populateHistory([
        createTestEntry({
          operation: "failing_op",
          status: "error",
          error: { message: "Something went wrong", code: "ERR001" },
          details: "Additional error details",
        }),
      ]);

      const result = await handleViewHistory({});

      const text = result.content[0].text;
      expect(text).toContain("### Errors");
      expect(text).toContain("failing_op");
      expect(text).toContain("Something went wrong");
    });
  });

  describe("Error Handling", () => {
    it("should return error for invalid limit parameter", async () => {
      const result = await handleViewHistory({
        limit: -1,
      });

      const text = result.content[0].text;
      expect(text).toContain("Error");
    });

    it("should return error for limit exceeding maximum", async () => {
      const result = await handleViewHistory({
        limit: 2000,
      });

      const text = result.content[0].text;
      expect(text).toContain("Error");
    });

    it("should return error for invalid status value", async () => {
      const result = await handleViewHistory({
        status: "invalid_status" as "success",
      });

      const text = result.content[0].text;
      expect(text).toContain("Error");
    });

    it("should return error for invalid privacy_mode value", async () => {
      const result = await handleViewHistory({
        privacy_mode: "invalid" as "full",
      });

      const text = result.content[0].text;
      expect(text).toContain("Error");
    });

    it("should handle malformed date strings gracefully", async () => {
      const result = await handleViewHistory({
        since: "not-a-date",
        response_format: "json",
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });
  });

  describe("Edge Cases", () => {
    it("should handle entries with optional fields missing", async () => {
      populateHistory([
        {
          operation: "minimal_op",
          source: "manual",
          status: "success",
          durationMs: 50,
        },
      ]);

      const result = await handleViewHistory({
        response_format: "json",
      });

      const output = result.structuredContent as {
        entries: HistoryEntry[];
      };
      expect(output.entries).toHaveLength(1);
      expect(output.entries[0].operation).toBe("minimal_op");
    });

    it("should handle large number of entries", async () => {
      const entries = Array.from({ length: 50 }, (_, i) =>
        createTestEntry({ operation: `bulk_op_${i}` }),
      );
      populateHistory(entries);

      const result = await handleViewHistory({
        limit: 100,
        response_format: "json",
      });

      const output = result.structuredContent as {
        entries: HistoryEntry[];
        total: number;
      };
      expect(output.entries).toHaveLength(50);
      expect(output.total).toBe(50);
    });

    it("should handle unicode in operation names", async () => {
      populateHistory([
        createTestEntry({ operation: "操作_文件" }),
        createTestEntry({ operation: "организация" }),
      ]);

      const result = await handleViewHistory({
        response_format: "json",
      });

      const output = result.structuredContent as {
        entries: HistoryEntry[];
      };
      expect(output.entries).toHaveLength(2);
    });
  });
});
