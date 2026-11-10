/**
 * Regression tests for BUG-43
 * Batch reader: max_files/max_file_size_mb unbounded + oversize "metadata only" broken
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { handleBatchReadFiles } from "../../../src/tools/batch-file-reader.js";

describe("BUG-43: batch file reader bounds and oversize handling", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "bug43-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // ignore cleanup errors
    }
  });

  it("rejects negative max_files via schema validation", async () => {
    // Create a few files
    await fs.writeFile(path.join(testDir, "a.txt"), "hello");
    await fs.writeFile(path.join(testDir, "b.txt"), "world");

    const result = await handleBatchReadFiles({
      directory: testDir,
      max_files: -1,
    });

    expect(result.isError).toBe(true);
  });

  it("does not put error string in content for oversize files (metadata only)", async () => {
    // Create a file larger than max_file_size_mb
    const largeContent = "x".repeat(1024 * 1024 + 100); // > 1MB
    await fs.writeFile(path.join(testDir, "large.txt"), largeContent);

    const result = await handleBatchReadFiles({
      directory: testDir,
      max_file_size_mb: 1,
      include_content: true,
      response_format: "json",
    });

    expect(result.isError).not.toBe(true);
    const structured = result.structuredContent as any;
    expect(structured).toBeDefined();
    expect(structured.files).toBeDefined();
    expect(structured.files.length).toBe(1);

    const fileResult = structured.files[0];
    // Must not have content field for oversize files
    expect(fileResult.content).toBeUndefined();
    // Should still have metadata
    expect(fileResult.metadata).toBeDefined();
    expect(fileResult.size).toBeGreaterThan(1024 * 1024);
  });
});
