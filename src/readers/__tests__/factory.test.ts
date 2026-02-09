import path from "path";
import { describe, it, expect } from "@jest/globals";
import { jest } from "@jest/globals";
import { FileReaderFactory } from "../factory.js";
import { SecureFileReader } from "../secure-file-reader.js";
import { IAuditLogger } from "../secure-file-reader.js";
import { RateLimiter } from "../../services/security/rate-limiter.service.js";

describe("FileReaderFactory", () => {
  describe("createDefault()", () => {
    it("should return a SecureFileReader instance", () => {
      const reader = FileReaderFactory.createDefault();
      expect(reader).toBeInstanceOf(SecureFileReader);
    });

    it("should return working reader for valid file paths", async () => {
      const reader = FileReaderFactory.createDefault();
      const mockAuditLogger = {
        logOperationStart: jest.fn(),
        logOperationSuccess: jest.fn(),
        logOperationFailure: jest.fn(),
      };

      (reader as any).auditLogger = mockAuditLogger;

      mockAuditLogger.logOperationSuccess.mockImplementation(() => {});
      mockAuditLogger.logOperationStart.mockImplementation(() => {});

      const testPath = path.resolve(process.cwd(), "package.json");
      const result = await reader.read(testPath);

      expect(result.ok).toBeDefined();
    });
  });

  describe("createWithOptions()", () => {
    it("should apply custom maxReadSize option", () => {
      const reader = FileReaderFactory.createWithOptions({
        maxReadSize: 5 * 1024 * 1024,
      });
      expect(reader).toBeInstanceOf(SecureFileReader);
    });

    it("should apply custom rate limiter options", () => {
      const reader = FileReaderFactory.createWithOptions({
        maxRequestsPerMinute: 30,
        maxRequestsPerHour: 200,
      });
      expect(reader).toBeInstanceOf(SecureFileReader);
    });

    it("should apply basePath option", () => {
      const reader = FileReaderFactory.createWithOptions({
        basePath: "/custom/path",
      });
      expect(reader).toBeInstanceOf(SecureFileReader);
    });

    it("should apply allowedPaths option", () => {
      const reader = FileReaderFactory.createWithOptions({
        allowedPaths: ["/allowed/path1", "/allowed/path2"],
      });
      expect(reader).toBeInstanceOf(SecureFileReader);
    });

    it("should accept custom audit logger", () => {
      const customLogger: IAuditLogger = {
        logOperationStart: jest.fn(),
        logOperationSuccess: jest.fn(),
        logOperationFailure: jest.fn(),
      };

      const reader = FileReaderFactory.createWithOptions({
        auditLogger: customLogger,
      });

      expect(reader).toBeInstanceOf(SecureFileReader);
    });

    it("should accept custom rate limiter instance", () => {
      const customRateLimiter = new RateLimiter(100, 1000);

      const reader = FileReaderFactory.createWithOptions({
        rateLimiter: customRateLimiter,
      });

      expect(reader).toBeInstanceOf(SecureFileReader);
    });

    it("should combine multiple options", () => {
      const reader = FileReaderFactory.createWithOptions({
        maxReadSize: 2 * 1024 * 1024,
        maxRequestsPerMinute: 15,
        basePath: "/test/base",
        allowedPaths: ["/allowed"],
      });

      expect(reader).toBeInstanceOf(SecureFileReader);
    });
  });

  describe("setDefaultAuditLogger()", () => {
    it("should set the default audit logger", () => {
      const newLogger: IAuditLogger = {
        logOperationStart: jest.fn(),
        logOperationSuccess: jest.fn(),
        logOperationFailure: jest.fn(),
      };

      FileReaderFactory.setDefaultAuditLogger(newLogger);

      const reader = FileReaderFactory.createDefault();
      expect((reader as any).auditLogger).toBe(newLogger);
    });
  });

  describe("default configuration", () => {
    it("should use sensible defaults", () => {
      const reader = FileReaderFactory.createDefault();
      expect(reader).toBeDefined();
      expect(reader).not.toBeNull();
    });

    it("should allow overriding with empty options", () => {
      const reader1 = FileReaderFactory.createDefault();
      const reader2 = FileReaderFactory.createWithOptions({});

      expect(reader1).toBeInstanceOf(SecureFileReader);
      expect(reader2).toBeInstanceOf(SecureFileReader);
    });
  });
});
