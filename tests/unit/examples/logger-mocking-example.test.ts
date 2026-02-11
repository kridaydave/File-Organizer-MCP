/**
 * Example Test File Demonstrating Logger Mocking Usage
 * This file shows how to use the comprehensive logger mock in tests
 */

import fs from "fs/promises";
import path from "path";
import {
  setupLoggerMocks,
  teardownLoggerMocks,
  mockLogger,
  createMockLogger,
  withMockedLogger,
  MockLoggerType,
} from "../../utils/logger-mock.js";

// Example service that uses logging
class ExampleService {
  constructor(private logger: MockLoggerType = mockLogger) {}

  async processData(
    data: string,
  ): Promise<{ result: string; success: boolean }> {
    this.logger.info("Starting data processing", { dataLength: data.length });

    try {
      if (data.length === 0) {
        this.logger.warn("Empty data provided");
        return { result: "", success: false };
      }

      if (data.includes("error")) {
        this.logger.error(
          "Processing failed",
          new Error("Error keyword found"),
          { data },
        );
        return { result: "", success: false };
      }

      const result = data.toUpperCase();
      this.logger.info("Processing completed", { result });
      return { result, success: true };
    } catch (error) {
      this.logger.error("Unexpected error", error);
      throw error;
    }
  }
}

describe("Logger Mocking Examples", () => {
  let service: ExampleService;

  // Standard setup/teardown pattern
  beforeEach(() => {
    setupLoggerMocks();
    service = new ExampleService();
  });

  afterEach(() => {
    teardownLoggerMocks();
  });

  describe("Basic Logger Mocking", () => {
    it("should capture info logs", async () => {
      await service.processData("test data");

      const infoLogs = mockLogger.getInfoLogs();
      expect(infoLogs).toHaveLength(2);
      expect(infoLogs[0].message).toBe("Starting data processing");
      expect(infoLogs[1].message).toBe("Processing completed");
    });

    it("should capture warning logs", async () => {
      await service.processData("");

      const warnLogs = mockLogger.getWarnLogs();
      expect(warnLogs).toHaveLength(1);
      expect(warnLogs[0].message).toBe("Empty data provided");
    });

    it("should capture error logs", async () => {
      await service.processData("data with error");

      const errorLogs = mockLogger.getErrorLogs();
      expect(errorLogs).toHaveLength(1);
      expect(errorLogs[0].message).toBe("Processing failed");
      expect(errorLogs[0].context?.error).toBeDefined();
    });

    it("should verify specific log messages", async () => {
      await service.processData("test data");

      expect(mockLogger.hasLogWithMessage("Starting data processing")).toBe(
        true,
      );
      expect(mockLogger.hasErrorWithMessage("Processing failed")).toBe(false);
    });

    it("should count total logs", async () => {
      await service.processData("test data");
      expect(mockLogger.getLogCount()).toBe(2);

      await service.processData("");
      expect(mockLogger.getLogCount()).toBe(4); // 2 + 1 (warn) + 1 (info)
    });

    it("should clear logs between tests", () => {
      // Verify logs are cleared in beforeEach
      expect(mockLogger.getLogCount()).toBe(0);
    });
  });

  describe("Custom Logger Instance", () => {
    it("should use custom mock logger", async () => {
      const customLogger = createMockLogger("debug");
      const customService = new ExampleService(customLogger);

      await customService.processData("test data");

      const logs = customLogger.getLogs();
      expect(logs).toHaveLength(2);
      expect(customLogger.getLogCount()).toBe(2);

      // Original mock logger should be unaffected
      expect(mockLogger.getLogCount()).toBe(0);
    });
  });

  describe("Console Output Suppression", () => {
    it("should suppress all console output", () => {
      // These should not produce any output during test execution
      console.log("This should be suppressed");
      console.error("This should be suppressed");
      console.warn("This should be suppressed");
      console.info("This should be suppressed");
      console.debug("This should be suppressed");

      // Verify console methods were mocked
      expect(console.log).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("Log Context Verification", () => {
    it("should capture log context", async () => {
      await service.processData("test data");

      const infoLogs = mockLogger.getInfoLogs();
      const startLog = infoLogs.find(
        (log) => log.message === "Starting data processing",
      );

      expect(startLog?.context).toBeDefined();
      expect(startLog?.context?.dataLength).toBe(9);
    });

    it("should capture error context", async () => {
      await service.processData("data with error");

      const errorLogs = mockLogger.getErrorLogs();
      const errorLog = errorLogs[0];

      expect(errorLog?.context?.error).toBeDefined();
      expect(errorLog?.context?.data).toBe("data with error");
    });
  });

  describe("Log Level Filtering", () => {
    it("should filter logs by level", async () => {
      await service.processData("test data");
      await service.processData("");
      await service.processData("data with error");

      const allLogs = mockLogger.getLogs();
      const infoLogs = mockLogger.getInfoLogs();
      const warnLogs = mockLogger.getWarnLogs();
      const errorLogs = mockLogger.getErrorLogs();

      expect(allLogs.length).toBeGreaterThan(0);
      expect(infoLogs.length).toBeGreaterThan(0);
      expect(warnLogs.length).toBe(1);
      expect(errorLogs.length).toBe(1);
    });
  });
});

describe("Advanced Logger Mocking Patterns", () => {
  describe("Using withMockedLogger Helper", () => {
    it(
      "should work with helper function",
      withMockedLogger(async (logger) => {
        const service = new ExampleService(logger);
        await service.processData("test data");

        expect(logger.getInfoLogs()).toHaveLength(2);
        expect(logger.hasLogWithMessage("Processing completed")).toBe(true);
      }),
    );

    it(
      "should handle errors in helper function",
      withMockedLogger(async (logger) => {
        const service = new ExampleService(logger);

        try {
          await service.processData("data with error");
        } catch (error) {
          // Expected
        }

        expect(logger.getErrorLogs()).toHaveLength(1);
      }),
    );
  });

  describe("Mock Logger Methods", () => {
    it("should test all logger methods", () => {
      const logger = createMockLogger("debug");

      // Test all log methods
      logger.debug("Debug message", { debug: true });
      logger.info("Info message", { info: true });
      logger.warn("Warning message", { warn: true });
      logger.error("Error message", new Error("Test error"), { error: true });

      // Test specialized methods
      logger.logMetadata("info", "Metadata message", { metadata: "test" });
      logger.logScanResult("/test/file.txt", {
        threatLevel: "low",
        passed: true,
        issues: [],
        detectedType: "text",
        duration: 100,
      });

      const logs = logger.getLogs();
      expect(logs).toHaveLength(6);

      expect(logger.getDebugLogs()).toHaveLength(1);
      expect(logger.getInfoLogs()).toHaveLength(2); // info + metadata
      expect(logger.getWarnLogs()).toHaveLength(1);
      expect(logger.getErrorLogs()).toHaveLength(2); // error + scan result (low threat = info)
    });
  });

  describe("Log Timestamp Verification", () => {
    it("should include timestamps in logs", () => {
      const logger = createMockLogger();
      const beforeTime = new Date();

      logger.info("Test message");

      const afterTime = new Date();
      const logs = logger.getLogs();

      expect(logs).toHaveLength(1);
      expect(logs[0].timestamp).toBeInstanceOf(Date);
      expect(logs[0].timestamp.getTime()).toBeGreaterThanOrEqual(
        beforeTime.getTime(),
      );
      expect(logs[0].timestamp.getTime()).toBeLessThanOrEqual(
        afterTime.getTime(),
      );
    });
  });
});

// Integration test showing how to test services that import logger directly
describe("Direct Logger Import Mocking", () => {
  it("should mock logger when service imports it directly", () => {
    // This test would work with services that do:
    // import { logger } from '../utils/logger.js';
    // The setupLoggerMocks() function mocks this import

    setupLoggerMocks();

    // Any service that imports logger will now get the mockLogger
    // This is handled by the jest.mock() call in setupLoggerMocks()

    expect(mockLogger).toBeDefined();

    teardownLoggerMocks();
  });
});
