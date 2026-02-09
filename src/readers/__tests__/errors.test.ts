import { describe, it, expect } from "@jest/globals";
import {
  FileReadError,
  FileTooLargeError,
  PathValidationError,
  RateLimitError,
  FileAccessDeniedError,
  FileNotFoundError,
  FileReadAbortedError,
  InvalidEncodingError,
} from "../errors.js";
import { FileOrganizerError } from "../../errors.js";

describe("File Reader Errors", () => {
  describe("FileReadError", () => {
    it("should extend FileOrganizerError", () => {
      const error = new FileReadError(
        "test message",
        "/path/to/file",
        "TEST_CODE",
      );
      expect(error).toBeInstanceOf(FileOrganizerError);
      expect(error).toBeInstanceOf(Error);
    });

    it("should have correct error code", () => {
      const error = new FileReadError(
        "message",
        "/path/file",
        "FILE_READ_ERROR",
      );
      expect(error.code).toBe("FILE_READ_ERROR");
    });

    it("should have correct error message", () => {
      const message = "Unable to read file";
      const error = new FileReadError(message, "/path/file", "CODE");
      expect(error.message).toBe(message);
    });

    it("should store filePath property", () => {
      const filePath = "/test/path/file.txt";
      const error = new FileReadError("msg", filePath, "CODE");
      expect(error.filePath).toBe(filePath);
    });

    it("should include suggestion when provided", () => {
      const error = new FileReadError("msg", "/path", "CODE", "Try again");
      expect(error.suggestion).toBe("Try again");
    });

    it("should generate correct toResponse()", () => {
      const error = new FileReadError(
        "Read failed",
        "/test.txt",
        "ERR_READ",
        "Check permissions",
      );
      const response = error.toResponse();

      expect(response.isError).toBe(true);
      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe("text");
      expect(response.content[0].text).toContain("Read failed");
      expect(response.content[0].text).toContain("/test.txt");
      expect(response.content[0].text).toContain("Check permissions");
    });
  });

  describe("FileTooLargeError", () => {
    it("should extend FileReadError", () => {
      const error = new FileTooLargeError("/path/file.txt", 15000000, 10000000);
      expect(error).toBeInstanceOf(FileReadError);
      expect(error).toBeInstanceOf(FileOrganizerError);
    });

    it("should have FILE_TOO_LARGE code", () => {
      const error = new FileTooLargeError("/path", 100, 50);
      expect(error.code).toBe("FILE_TOO_LARGE");
    });

    it("should include file size and max allowed in message", () => {
      const error = new FileTooLargeError("/test.txt", 15000000, 10000000);
      expect(error.message).toContain("15000000");
      expect(error.message).toContain("10000000");
    });

    it("should store fileSize and maxAllowed", () => {
      const error = new FileTooLargeError("/path", 150, 100);
      expect(error.fileSize).toBe(150);
      expect(error.maxAllowed).toBe(100);
    });

    it("should include suggestion in message", () => {
      const error = new FileTooLargeError("/path", 100, 50);
      expect(error.suggestion).toContain("readStream()");
    });

    it("should generate correct toResponse()", () => {
      const error = new FileTooLargeError("/large.txt", 20000000, 10000000);
      const response = error.toResponse();

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain("exceeds maximum");
    });
  });

  describe("PathValidationError", () => {
    it("should extend FileReadError", () => {
      const error = new PathValidationError("/path", "Invalid chars", 1);
      expect(error).toBeInstanceOf(FileReadError);
      expect(error).toBeInstanceOf(FileOrganizerError);
    });

    it("should have PATH_VALIDATION_FAILED code", () => {
      const error = new PathValidationError("/path", "reason", 2);
      expect(error.code).toBe("PATH_VALIDATION_FAILED");
    });

    it("should include validation layer in message", () => {
      const error = new PathValidationError("/test", "reason", 3);
      expect(error.message).toContain("layer 3");
    });

    it("should store reason and validationLayer", () => {
      const error = new PathValidationError("/path", "Invalid format", 1);
      expect(error.reason).toBe("Invalid format");
      expect(error.validationLayer).toBe(1);
    });

    it("should generate correct toResponse()", () => {
      const error = new PathValidationError("/bad", "Traversal", 1);
      const response = error.toResponse();

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain("Traversal");
    });
  });

  describe("RateLimitError", () => {
    it("should extend FileReadError", () => {
      const error = new RateLimitError("/path", 30, "perMinute");
      expect(error).toBeInstanceOf(FileReadError);
      expect(error).toBeInstanceOf(FileOrganizerError);
    });

    it("should have RATE_LIMIT_EXCEEDED code", () => {
      const error = new RateLimitError("/path", 60, "perMinute");
      expect(error.code).toBe("RATE_LIMIT_EXCEEDED");
    });

    it("should include retry info in message", () => {
      const error = new RateLimitError("/test", 45, "perMinute");
      expect(error.message).toContain("45");
      expect(error.message).toContain("perMinute");
    });

    it("should store retryAfter and limitType", () => {
      const error = new RateLimitError("/path", 120, "perHour");
      expect(error.retryAfter).toBe(120);
      expect(error.limitType).toBe("perHour");
    });

    it("should include suggestion with retry time", () => {
      const error = new RateLimitError("/path", 30, "perMinute");
      expect(error.suggestion).toContain("30");
    });

    it("should generate correct toResponse()", () => {
      const error = new RateLimitError("/path", 60, "perMinute");
      const response = error.toResponse();

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain("Rate limit");
    });
  });

  describe("FileAccessDeniedError", () => {
    it("should extend FileReadError", () => {
      const error = new FileAccessDeniedError("/path", "No permission");
      expect(error).toBeInstanceOf(FileReadError);
      expect(error).toBeInstanceOf(FileOrganizerError);
    });

    it("should have FILE_ACCESS_DENIED code", () => {
      const error = new FileAccessDeniedError("/path", "reason");
      expect(error.code).toBe("FILE_ACCESS_DENIED");
    });

    it("should include reason in message", () => {
      const error = new FileAccessDeniedError("/test", "Readonly filesystem");
      expect(error.message).toContain("Readonly filesystem");
    });

    it("should store reason and resolvedPath", () => {
      const error = new FileAccessDeniedError("/path", "reason", "/resolved");
      expect(error.reason).toBe("reason");
      expect(error.resolvedPath).toBe("/resolved");
    });

    it("should generate correct toResponse()", () => {
      const error = new FileAccessDeniedError("/denied", "Access denied");
      const response = error.toResponse();

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain("Access denied");
    });
  });

  describe("FileNotFoundError", () => {
    it("should extend FileReadError", () => {
      const error = new FileNotFoundError("/path");
      expect(error).toBeInstanceOf(FileReadError);
      expect(error).toBeInstanceOf(FileOrganizerError);
    });

    it("should have FILE_NOT_FOUND code", () => {
      const error = new FileNotFoundError("/path");
      expect(error.code).toBe("FILE_NOT_FOUND");
    });

    it('should have "File not found" message', () => {
      const error = new FileNotFoundError("/test.txt");
      expect(error.message).toBe("File not found");
    });

    it("should store filePath", () => {
      const error = new FileNotFoundError("/missing/file.txt");
      expect(error.filePath).toBe("/missing/file.txt");
    });

    it("should generate correct toResponse()", () => {
      const error = new FileNotFoundError("/missing.txt");
      const response = error.toResponse();

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain("File not found");
    });
  });

  describe("FileReadAbortedError", () => {
    it("should extend FileReadError", () => {
      const error = new FileReadAbortedError("/path");
      expect(error).toBeInstanceOf(FileReadError);
      expect(error).toBeInstanceOf(FileOrganizerError);
    });

    it("should have FILE_READ_ABORTED code", () => {
      const error = new FileReadAbortedError("/path");
      expect(error.code).toBe("FILE_READ_ABORTED");
    });

    it("should include abort reason in message when provided", () => {
      const error = new FileReadAbortedError("/test", "User cancelled");
      expect(error.message).toContain("User cancelled");
    });

    it("should have basic message without reason", () => {
      const error = new FileReadAbortedError("/test");
      expect(error.message).toBe("Read operation aborted");
    });

    it("should store abortReason", () => {
      const error = new FileReadAbortedError("/path", "Timeout");
      expect(error.abortReason).toBe("Timeout");
    });

    it("should generate correct toResponse()", () => {
      const error = new FileReadAbortedError("/aborted", "Cancelled");
      const response = error.toResponse();

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain("Cancelled");
    });
  });

  describe("InvalidEncodingError", () => {
    it("should extend FileReadError", () => {
      const error = new InvalidEncodingError("/path", "invalid-encoding");
      expect(error).toBeInstanceOf(FileReadError);
      expect(error).toBeInstanceOf(FileOrganizerError);
    });

    it("should have INVALID_ENCODING code", () => {
      const error = new InvalidEncodingError("/path", "utf-16");
      expect(error.code).toBe("INVALID_ENCODING");
    });

    it("should include encoding in message", () => {
      const error = new InvalidEncodingError("/test", "xyz-encoding");
      expect(error.message).toContain("xyz-encoding");
    });

    it("should store encoding", () => {
      const error = new InvalidEncodingError("/path", "utf-8");
      expect(error.encoding).toBe("utf-8");
    });

    it("should generate correct toResponse()", () => {
      const error = new InvalidEncodingError("/bad.txt", "invalid");
      const response = error.toResponse();

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain(
        "Invalid or unsupported encoding",
      );
    });
  });

  describe("Error inheritance chain", () => {
    it("all errors should be instanceof Error", () => {
      const errors = [
        new FileReadError("msg", "/p", "CODE"),
        new FileTooLargeError("/p", 100, 50),
        new PathValidationError("/p", "r", 1),
        new RateLimitError("/p", 60, "perMinute"),
        new FileAccessDeniedError("/p", "r"),
        new FileNotFoundError("/p"),
        new FileReadAbortedError("/p"),
        new InvalidEncodingError("/p", "enc"),
      ];

      for (const error of errors) {
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(FileOrganizerError);
        expect(error).toBeInstanceOf(FileReadError);
      }
    });

    it("all errors should have stack traces", () => {
      const errors = [
        new FileReadError("msg", "/p", "CODE"),
        new FileTooLargeError("/p", 100, 50),
        new PathValidationError("/p", "r", 1),
        new RateLimitError("/p", 60, "perMinute"),
        new FileAccessDeniedError("/p", "r"),
        new FileNotFoundError("/p"),
        new FileReadAbortedError("/p"),
        new InvalidEncodingError("/p", "enc"),
      ];

      for (const error of errors) {
        expect(error.stack).toBeDefined();
        expect(typeof error.stack).toBe("string");
      }
    });
  });
});
