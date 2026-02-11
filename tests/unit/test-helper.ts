/**
 * Test helpers for service tests
 */

import { logger } from "../../src/utils/logger.js";

/**
 * Suppress logger output for a specific test
 * Call this in beforeEach if you need additional suppression
 */
export function suppressLoggerOutput(): void {
  logger.setTestMode(true);
}

/**
 * Restore normal logger output (useful for testing logging behavior)
 */
export function restoreLoggerOutput(): void {
  logger.setTestMode(false);
}

/**
 * Create a mock logger that captures log calls for testing
 */
export function createMockLogger() {
  const logs: Array<{ level: string; message: string; context?: any }> = [];

  return {
    logs,
    info: (message: string, context?: any) => {
      logs.push({ level: "info", message, context });
    },
    error: (message: string, error?: any, context?: any) => {
      logs.push({ level: "error", message, context } as any);
    },
    warn: (message: string, context?: any) => {
      logs.push({ level: "warn", message, context });
    },
    debug: (message: string, context?: any) => {
      logs.push({ level: "debug", message, context });
    },
    clear: () => {
      logs.length = 0;
    },
  };
}
