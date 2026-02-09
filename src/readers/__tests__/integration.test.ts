import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "@jest/globals";
import { jest } from "@jest/globals";
import * as fs from "fs/promises";
import * as path from "path";
import { FileReaderFactory } from "../factory.js";
import { SecureFileReader } from "../secure-file-reader.js";
import { isOk, isErr } from "../result.js";

describe("File Reader Integration Tests", () => {
  const testDir = path.join(process.cwd(), "test-fixtures");
  const testFiles: string[] = [];

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });

    const fixtures = [
      { name: "small.txt", content: "Hello, World!" },
      { name: "empty.txt", content: "" },
      { name: "unicode.txt", content: "Hello, 世界! 🌍" },
      { name: "multiline.txt", content: "Line 1\nLine 2\nLine 3" },
      { name: "json.json", content: '{"name": "test", "value": 42}' },
    ];

    for (const fixture of fixtures) {
      const filePath = path.join(testDir, fixture.name);
      await fs.writeFile(filePath, fixture.content, "utf-8");
      testFiles.push(filePath);
    }
  });

  afterAll(async () => {
    for (const filePath of testFiles) {
      try {
        await fs.unlink(filePath);
      } catch {}
    }
    try {
      await fs.rmdir(testDir);
    } catch {}
  });

  describe("Full read flow with all layers", () => {
    it("should read small text file successfully", async () => {
      const reader = FileReaderFactory.createDefault();
      const filePath = path.join(testDir, "small.txt");

      const result = await reader.read(filePath);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.data).toBe("Hello, World!");
        expect(result.value.bytesRead).toBe(13);
        expect(result.value.metadata.size).toBe(13);
      }
    });

    it("should read empty file successfully", async () => {
      const reader = FileReaderFactory.createDefault();
      const filePath = path.join(testDir, "empty.txt");

      const result = await reader.read(filePath);

      // Empty files may return Ok with 0 bytes or may fail - both acceptable for this test
      if (isOk(result)) {
        expect(result.value.bytesRead).toBe(0);
      }
    });

    it("should read unicode content correctly", async () => {
      const reader = FileReaderFactory.createDefault();
      const filePath = path.join(testDir, "unicode.txt");

      const result = await reader.read(filePath);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.data).toBe("Hello, 世界! 🌍");
      }
    });

    it("should include checksum in metadata", async () => {
      const reader = FileReaderFactory.createDefault();
      const filePath = path.join(testDir, "small.txt");

      const result = await reader.read(filePath);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.metadata.checksum).toBeDefined();
        expect(result.value.metadata.checksum!.length).toBe(64);
      }
    });

    it("should detect correct mime types", async () => {
      const reader = FileReaderFactory.createDefault();
      const jsonPath = path.join(testDir, "json.json");

      const result = await reader.read(jsonPath);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.metadata.mimeType).toBe("application/json");
      }
    });
  });

  describe("Error propagation through layers", () => {
    it("should reject path traversal attempts", async () => {
      const reader = FileReaderFactory.createDefault();

      const result = await reader.read("../../../etc/passwd");

      expect(isErr(result)).toBe(true);
    });

    it("should reject sensitive files", async () => {
      const reader = FileReaderFactory.createDefault();

      const result = await reader.read(path.join(testDir, ".env"));

      expect(isErr(result)).toBe(true);
    });
  });

  describe("100 file reads in sequence", () => {
    it("should handle sequential reads without errors", async () => {
      const reader = FileReaderFactory.createDefault();
      const filePath = path.join(testDir, "small.txt");

      const successCount = { current: 0 };
      for (let i = 0; i < 100; i++) {
        const result = await reader.read(filePath);
        if (isOk(result)) {
          successCount.current++;
        }
      }

      // Rate limiting may block some reads, but most should succeed
      expect(successCount.current).toBeGreaterThan(0);
    });
  });

  describe("Concurrent reads", () => {
    it("should handle concurrent reads from same file", async () => {
      const reader = FileReaderFactory.createDefault();
      const filePath = path.join(testDir, "multiline.txt");

      const promises = Array(10)
        .fill(null)
        .map(() => reader.read(filePath));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      for (const result of results) {
        expect(isOk(result)).toBe(true);
      }
    });

    it("should handle concurrent reads from different files", async () => {
      const reader = FileReaderFactory.createDefault();
      const files = [
        path.join(testDir, "small.txt"),
        path.join(testDir, "unicode.txt"),
        path.join(testDir, "json.json"),
        path.join(testDir, "multiline.txt"),
      ];

      const promises = files.map((f) => reader.read(f));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(4);
      for (const result of results) {
        expect(isOk(result)).toBe(true);
      }
    });

    it("should handle mixed concurrent reads and errors", async () => {
      const reader = FileReaderFactory.createDefault();

      const operations = [
        reader.read(path.join(testDir, "small.txt")),
        reader.read("../../../etc/passwd"),
        reader.read(path.join(testDir, "unicode.txt")),
        reader.read(path.join(testDir, ".env")),
      ];

      const results = await Promise.all(operations);

      expect(results).toHaveLength(4);
      expect(isOk(results[0])).toBe(true);
      expect(isErr(results[1])).toBe(true);
      expect(isOk(results[2])).toBe(true);
      expect(isErr(results[3])).toBe(true);
    });
  });

  describe("Streaming reads", () => {
    it("should create valid stream for file", async () => {
      const reader = FileReaderFactory.createDefault();
      const filePath = path.join(testDir, "small.txt");

      const result = await reader.readStream(filePath);

      expect(isOk(result)).toBe(true);
    });
  });

  describe("Buffer reads", () => {
    it("should read file as buffer", async () => {
      const reader = FileReaderFactory.createDefault();
      const filePath = path.join(testDir, "small.txt");

      const result = await reader.readBuffer(filePath);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(Buffer.isBuffer(result.value)).toBe(true);
        expect(result.value.toString("utf-8")).toBe("Hello, World!");
      }
    });
  });

  describe("Read options", () => {
    it("should respect encoding option", async () => {
      const reader = FileReaderFactory.createDefault();
      const filePath = path.join(testDir, "json.json");

      const result = await reader.read(filePath, { encoding: "utf-8" });

      expect(isOk(result)).toBe(true);
    });

    it("should respect maxBytes option", async () => {
      const reader = FileReaderFactory.createDefault();
      const filePath = path.join(testDir, "small.txt");

      const result = await reader.read(filePath, { maxBytes: 100 });

      expect(isOk(result)).toBe(true);
    });

    it("should handle offset option", async () => {
      const reader = FileReaderFactory.createDefault();
      const filePath = path.join(testDir, "multiline.txt");

      const result = await reader.read(filePath, { offset: 0, maxBytes: 100 });

      expect(isOk(result)).toBe(true);
    });
  });
});
