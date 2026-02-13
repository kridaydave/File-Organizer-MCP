/**
 * File Organizer MCP Server v3.2.0
 * Structured Logging Utility
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

// Ensure LogLevel is available at runtime for type checking
export const LogLevel = {
  debug: "debug" as const,
  info: "info" as const,
  warn: "warn" as const,
  error: "error" as const,
};

export class Logger {
  private logLevel: LogLevel;
  private isTestEnvironment: boolean;

  constructor(level: LogLevel = "info") {
    this.logLevel = level;
    this.isTestEnvironment = this.detectTestEnvironment();
  }

  private detectTestEnvironment(): boolean {
    return (
      process.env.NODE_ENV === "test" ||
      process.env.JEST_WORKER_ID !== undefined ||
      typeof (globalThis as any).jest !== "undefined" ||
      // Check if we're running under a test runner
      process.argv.some((arg) => arg.includes("jest") || arg.includes("test"))
    );
  }

  private log(level: string, message: string, context?: Record<string, any>) {
    if (!this.shouldLog(level)) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    };

    // Suppress console output during tests
    if (!this.isTestEnvironment) {
      console.error(JSON.stringify(entry)); // stderr for stdio servers
    }
  }

  debug(message: string, context?: Record<string, any>) {
    this.log("debug", message, context);
  }

  info(message: string, context?: Record<string, any>) {
    this.log("info", message, context);
  }

  warn(message: string, context?: Record<string, any>) {
    this.log("warn", message, context);
  }

  error(
    message: string,
    error?: Error | unknown,
    context?: Record<string, any>,
  ) {
    this.log("error", message, {
      ...context,
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
            }
          : error,
    });
  }

  /**
   * Log metadata extraction results
   */
  logMetadata(
    level: LogLevel,
    message: string,
    metadata: any,
    context?: Record<string, any>,
  ): void {
    this.log(level, message, {
      metadata,
      ...context,
    });
  }

  /**
   * Control test mode for suppressing logs during tests
   */
  setTestMode(enabled: boolean): void {
    this.isTestEnvironment = enabled;
  }

  /**
   * Log security scan results with metadata
   */
  logScanResult(filePath: string, scanResult: any, metadata?: any): void {
    const level =
      scanResult.threatLevel === "high" || scanResult.threatLevel === "critical"
        ? "error"
        : scanResult.threatLevel === "medium"
          ? "warn"
          : "info";

    this.log(level, "File analyzed", {
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

  private shouldLog(level: string): boolean {
    const levels = ["debug", "info", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }
}

export const logger = new Logger((process.env.LOG_LEVEL as LogLevel) || "info");
