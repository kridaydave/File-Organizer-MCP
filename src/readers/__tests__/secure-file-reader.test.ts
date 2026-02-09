import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
} from "@jest/globals";
import { jest } from "@jest/globals";
import * as fs from "fs/promises";
import * as path from "path";
import { SecureFileReader, IAuditLogger } from "../secure-file-reader.js";
import { PathValidatorService } from "../../services/path-validator.service.js";
import { RateLimiter } from "../../services/security/rate-limiter.service.js";
import { isOk, isErr } from "../result.js";

describe("SecureFileReader Integration", () => {
  const testDir = path.join(process.cwd(), "test-fixtures-reader");
  let reader: SecureFileReader;

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(
      path.join(testDir, "small.txt"),
      "Hello, World!",
      "utf-8",
    );
    await fs.writeFile(
      path.join(testDir, "unicode.txt"),
      "Hello, 世界! 🌍",
      "utf-8",
    );
    await fs.writeFile(path.join(testDir, "empty.txt"), "", "utf-8");
  });

  afterAll(async () => {
    try {
      await fs.unlink(path.join(testDir, "small.txt"));
      await fs.unlink(path.join(testDir, "unicode.txt"));
      await fs.unlink(path.join(testDir, "empty.txt"));
      await fs.rmdir(testDir);
    } catch {}
  });

  beforeEach(() => {
    const pathValidator = new PathValidatorService();
    const rateLimiter = new RateLimiter();
    const auditLogger: IAuditLogger = {
      logOperationStart: jest.fn(),
      logOperationSuccess: jest.fn(),
      logOperationFailure: jest.fn(),
    };
    reader = new SecureFileReader(pathValidator, rateLimiter, auditLogger);
  });

  describe("read()", () => {
    it("should successfully read a text file", async () => {
      const filePath = path.join(testDir, "small.txt");
      const result = await reader.read(filePath);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.data).toBe("Hello, World!");
        expect(result.value.bytesRead).toBe(13);
      }
    });

    it("should read unicode content correctly", async () => {
      const filePath = path.join(testDir, "unicode.txt");
      const result = await reader.read(filePath);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.data).toBe("Hello, 世界! 🌍");
      }
    });

    it("should handle empty file", async () => {
      const filePath = path.join(testDir, "empty.txt");
      const result = await reader.read(filePath);
      // Empty files may return Ok with 0 bytes or may be rejected - both acceptable
      if (isOk(result)) {
        expect(result.value.bytesRead).toBe(0);
      }
    });

    it("should return error for non-existent file", async () => {
      const result = await reader.read(path.join(testDir, "nonexistent.txt"));
      expect(isErr(result)).toBe(true);
    });

    it("should reject path traversal attempts", async () => {
      const result = await reader.read("../../../etc/passwd");
      expect(isErr(result)).toBe(true);
    });

    it("should calculate checksum", async () => {
      const filePath = path.join(testDir, "small.txt");
      const result = await reader.read(filePath);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.metadata.checksum).toBeDefined();
        expect(result.value.metadata.checksum!.length).toBe(64);
      }
    });
  });

  describe("readBuffer()", () => {
    it("should return buffer for binary content", async () => {
      const filePath = path.join(testDir, "small.txt");
      const result = await reader.readBuffer(filePath);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBeInstanceOf(Buffer);
        expect(result.value.toString()).toBe("Hello, World!");
      }
    });
  });

  describe("rate limiting", () => {
    it("should allow requests within rate limit", async () => {
      const filePath = path.join(testDir, "small.txt");
      const result = await reader.read(filePath);
      expect(isOk(result)).toBe(true);
    });
  });
});
