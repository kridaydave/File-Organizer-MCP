/**
 * Comprehensive Logger Mock for Test Environment
 * Suppresses all console output and provides mock logger functionality
 */

import { Logger, LogLevel } from "../../src/utils/logger.js";

// Store original console methods
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug,
};

// Mock console methods to suppress output
const mockConsoleMethods = () => {
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
  console.info = jest.fn();
  console.debug = jest.fn();
};

// Restore original console methods
const restoreConsoleMethods = () => {
  console.log = originalConsole.log;
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;
  console.debug = originalConsole.debug;
};

// Mock Logger class that captures all calls
export class MockLogger {
  private logs: Array<{
    level: string;
    message: string;
    context?: Record<string, any>;
    timestamp: Date;
  }> = [];

  constructor(private level: LogLevel = "error") {}

  private captureLog(
    level: string,
    message: string,
    context?: Record<string, any>,
  ) {
    this.logs.push({
      level,
      message,
      context,
      timestamp: new Date(),
    });
  }

  debug(message: string, context?: Record<string, any>) {
    this.captureLog("debug", message, context);
  }

  info(message: string, context?: Record<string, any>) {
    this.captureLog("info", message, context);
  }

  warn(message: string, context?: Record<string, any>) {
    this.captureLog("warn", message, context);
  }

  error(
    message: string,
    error?: Error | unknown,
    context?: Record<string, any>,
  ) {
    this.captureLog("error", message, { ...context, error });
  }

  logMetadata(
    level: LogLevel,
    message: string,
    metadata: any,
    context?: Record<string, any>,
  ) {
    this.captureLog(level, message, { metadata, ...context });
  }

  logScanResult(filePath: string, scanResult: any, metadata?: any) {
    const level =
      scanResult.threatLevel === "high" || scanResult.threatLevel === "critical"
        ? "error"
        : scanResult.threatLevel === "medium"
          ? "warn"
          : "info";

    this.captureLog(level, "File analyzed", {
      filePath,
      detectedType: scanResult.detectedType,
      metadata,
      security: {
        threatLevel: scanResult.threatLevel,
        passed: scanResult.passed,
        issues: scanResult.issues,
      },
      duration: scanResult.duration,
    });
  }

  // Test helper methods
  getLogs(): Array<{
    level: string;
    message: string;
    context?: Record<string, any>;
    timestamp: Date;
  }> {
    return [...this.logs];
  }

  getLogsByLevel(level: string) {
    return this.logs.filter((log) => log.level === level);
  }

  getErrorLogs() {
    return this.getLogsByLevel("error");
  }

  getWarnLogs() {
    return this.getLogsByLevel("warn");
  }

  getInfoLogs() {
    return this.getLogsByLevel("info");
  }

  getDebugLogs() {
    return this.getLogsByLevel("debug");
  }

  clearLogs() {
    this.logs = [];
  }

  hasLogWithMessage(message: string) {
    return this.logs.some((log) => log.message.includes(message));
  }

  hasErrorWithMessage(message: string) {
    return this.getErrorLogs().some((log) => log.message.includes(message));
  }

  getLogCount() {
    return this.logs.length;
  }

  // Test mode methods (for compatibility)
  setTestMode(enabled: boolean) {
    // No-op for mock logger
  }
}

// Create a mock logger instance
export const mockLogger = new MockLogger();

// Factory function to create mock loggers
export function createMockLogger(level: LogLevel = "error"): MockLogger {
  return new MockLogger(level);
}

// Setup function to configure test environment
export function setupLoggerMocks() {
  // Mock console methods
  mockConsoleMethods();

  // Mock the logger export
  jest.mock("../../src/utils/logger.js", () => ({
    Logger: MockLogger,
    logger: mockLogger,
    LogLevel: {
      DEBUG: "debug",
      INFO: "info",
      WARN: "warn",
      ERROR: "error",
    } as const,
  }));

  return {
    mockLogger,
    restoreConsoleMethods,
  };
}

// Teardown function to clean up after tests
export function teardownLoggerMocks() {
  restoreConsoleMethods();
  mockLogger.clearLogs();
  jest.clearAllMocks();
}

// Test helper function to run tests with mocked logger
export function withMockedLogger(
  testFn: (logger: MockLogger) => void | Promise<void>,
) {
  return async () => {
    const { mockLogger, restoreConsoleMethods } = setupLoggerMocks();

    try {
      await testFn(mockLogger);
    } finally {
      teardownLoggerMocks();
    }
  };
}

// Global setup for all test files
export function globalLoggerSetup() {
  // Mock console methods globally
  beforeAll(() => {
    mockConsoleMethods();
  });

  afterAll(() => {
    restoreConsoleMethods();
  });

  // Clear logs between tests
  beforeEach(() => {
    mockLogger.clearLogs();
    jest.clearAllMocks();
  });
}

// Export types for use in tests
export type MockLoggerType = MockLogger;
export { LogLevel };
