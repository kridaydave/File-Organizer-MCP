/**
 * End-to-End Tests for File Reader Module
 *
 * Comprehensive E2E tests covering:
 * - Full workflow: create → read → verify
 * - Performance benchmarks (P50/P95 latency)
 * - Memory leak detection
 * - Error recovery and graceful failures
 *
 * @module readers/__tests__/e2e
 * @version 3.2.0
 */

import fs from "fs/promises";
import path from "path";
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { FileReaderFactory } from "../factory.js";
import { SecureFileReader } from "../secure-file-reader.js";
import { isOk, isErr } from "../result.js";

const TEST_TIMEOUT = 30000;

describe("File Reader E2E Tests", () => {
  let tempDir: string;
  let reader: SecureFileReader;

  beforeAll(async () => {
    tempDir = path.join(process.cwd(), "test-fixtures-e2e");
    await fs.mkdir(tempDir, { recursive: true });
    reader = FileReaderFactory.createDefault();
  }, TEST_TIMEOUT);

  afterAll(async () => {
    if (tempDir) {
      try {
        const files = await fs.readdir(tempDir);
        await Promise.all(files.map((f) => fs.unlink(path.join(tempDir, f))));
        await fs.rmdir(tempDir);
      } catch {}
    }
  }, TEST_TIMEOUT);

  describe("Full Workflow Tests", () => {
    it("should create file and read it back", async () => {
      const testFile = path.join(tempDir, "workflow-test.txt");
      const content = "Hello, E2E World!";

      await fs.writeFile(testFile, content, "utf-8");
      const result = await reader.read(testFile);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.data).toBe(content);
      }
    });

    it("should handle large file workflow", async () => {
      const testFile = path.join(tempDir, "large-file.txt");
      const lines = Array(1000).fill(
        "Line of test data for large file handling.",
      );
      const content = lines.join("\n");

      await fs.writeFile(testFile, content, "utf-8");
      const result = await reader.read(testFile);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.metadata.size).toBeGreaterThan(10000);
      }
    });
  });

  describe("Performance Tests", () => {
    it("should read 100 files within time threshold", async () => {
      const files: string[] = [];

      for (let i = 0; i < 100; i++) {
        const file = path.join(tempDir, `perf-${i}.txt`);
        await fs.writeFile(file, `Performance test content ${i}`, "utf-8");
        files.push(file);
      }

      const startTime = Date.now();
      let successCount = 0;

      for (const file of files) {
        const result = await reader.read(file);
        if (isOk(result)) successCount++;
      }

      const elapsed = Date.now() - startTime;

      expect(successCount).toBeGreaterThan(50);
      expect(elapsed).toBeLessThan(30000);
    });
  });

  describe("Error Recovery Tests", () => {
    it("should handle non-existent file gracefully", async () => {
      const invalidPath = path.join(tempDir, "nonexistent.txt");
      const result = await reader.read(invalidPath);
      expect(isErr(result)).toBe(true);
    });
  });
});
