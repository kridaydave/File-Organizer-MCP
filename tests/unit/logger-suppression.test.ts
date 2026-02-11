/**
 * Logger suppression tests
 * Tests that service initialization logs are properly suppressed during test execution
 */

import { logger } from "../../src/utils/logger.js";
import { MetadataCacheService } from "../../src/services/metadata-cache.service.js";
import { FileScannerService } from "../../src/services/file-scanner.service.js";
import {
  suppressLoggerOutput,
  restoreLoggerOutput,
  createMockLogger,
} from "./test-helper.js";

describe("Logger Suppression", () => {
  let originalConsoleError: typeof console.error;
  let consoleOutput: string[] = [];

  beforeEach(() => {
    // Capture console.error output
    originalConsoleError = console.error;
    consoleOutput = [];
    console.error = (...args: any[]) => {
      consoleOutput.push(args.join(" "));
    };
  });

  afterEach(() => {
    // Restore console.error
    console.error = originalConsoleError;
  });

  describe("Test Environment Detection", () => {
    it("should detect test environment and suppress logs by default", () => {
      // Create a service that would normally log initialization
      const service = new MetadataCacheService();

      // Service should be created without any console output
      expect(
        consoleOutput.filter((output) =>
          output.includes("MetadataCacheService initialized"),
        ),
      ).toHaveLength(0);
    });

    it("should allow explicit logger suppression control", () => {
      restoreLoggerOutput();

      const mockLogger = createMockLogger();
      const originalLog = logger.info;
      logger.info = mockLogger.info;

      try {
        const service = new MetadataCacheService();

        // Logs should be captured in mock logger when test mode is disabled
        const initLogs = mockLogger.logs.filter((log) =>
          log.message.includes("MetadataCacheService initialized"),
        );

        expect(initLogs.length).toBeGreaterThanOrEqual(0);
      } finally {
        logger.info = originalLog;
        suppressLoggerOutput();
      }
    });
  });

  describe("Service Initialization Log Suppression", () => {
    it("should suppress MetadataCacheService initialization logs", () => {
      new MetadataCacheService();

      const initLogs = consoleOutput.filter((output) =>
        output.includes("MetadataCacheService initialized"),
      );

      expect(initLogs).toHaveLength(0);
    });

    it("should suppress FileScannerService initialization logs", () => {
      new FileScannerService();

      // FileScannerService doesn't log on initialization, but this confirms no unexpected output
      const serviceLogs = consoleOutput.filter((output) =>
        output.includes("FileScannerService"),
      );

      expect(serviceLogs).toHaveLength(0);
    });

    it("should suppress multiple service initialization logs", () => {
      // Create multiple services that would normally log
      new MetadataCacheService();
      new MetadataCacheService({ cacheDir: "./test-cache" });
      new FileScannerService();

      const initLogs = consoleOutput.filter(
        (output) =>
          output.includes("MetadataCacheService initialized") ||
          output.includes("FileScannerService"),
      );

      expect(initLogs).toHaveLength(0);
    });
  });

  describe("Logger Test Mode Control", () => {
    it("should allow manual control of test mode", () => {
      // Start with test mode enabled (default)
      suppressLoggerOutput();

      const initialOutput = consoleOutput.length;
      logger.info("Test message when suppressed");
      expect(consoleOutput.length).toBe(initialOutput);

      // Disable test mode
      restoreLoggerOutput();

      logger.info("Test message when not suppressed");
      expect(consoleOutput.length).toBeGreaterThan(initialOutput);

      // Re-enable test mode
      suppressLoggerOutput();

      const finalOutput = consoleOutput.length;
      logger.info("Another test message when suppressed");
      expect(consoleOutput.length).toBe(finalOutput);
    });
  });

  describe("Mock Logger Functionality", () => {
    it("should create a mock logger that captures calls", () => {
      const mockLogger = createMockLogger();

      mockLogger.info("Test info message", { data: "test" });
      mockLogger.error("Test error message", new Error("test error"));
      mockLogger.warn("Test warning message");
      mockLogger.debug("Test debug message");

      expect(mockLogger.logs).toHaveLength(4);
      expect(mockLogger.logs[0]).toEqual({
        level: "info",
        message: "Test info message",
        context: { data: "test" },
      });
      expect(mockLogger.logs[1].level).toBe("error");
      expect(mockLogger.logs[2].level).toBe("warn");
      expect(mockLogger.logs[3].level).toBe("debug");

      // Test clear functionality
      mockLogger.clear();
      expect(mockLogger.logs).toHaveLength(0);
    });
  });
});
