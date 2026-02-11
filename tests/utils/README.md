# Logger Mocking System

This directory contains a comprehensive logger mocking system designed to suppress all console output during tests while providing powerful log verification capabilities.

## Overview

The logger mocking system addresses the 86+ `console.error` occurrences across the codebase by providing:

- Complete suppression of console output during tests
- Mock logger class that captures all log calls
- Powerful test helpers for log verification
- Global setup for all test files
- Compatibility with existing Logger class methods

## Files

- **`logger-mock.ts`** - Main logger mocking utility
- **`../setup.ts`** - Global test setup (updated to use logger mocks)
- **`../unit/examples/logger-mocking-example.test.ts`** - Comprehensive usage examples

## Quick Start

### Basic Usage in Test Files

```typescript
import {
  setupLoggerMocks,
  teardownLoggerMocks,
  mockLogger,
} from "../utils/logger-mock.js";

describe("MyService", () => {
  beforeEach(() => {
    setupLoggerMocks();
    // ... your test setup
  });

  afterEach(() => {
    // ... your test cleanup
    teardownLoggerMocks();
  });

  it("should capture logs", () => {
    // Your test code that uses logger
    service.doSomething();

    // Verify logs
    expect(mockLogger.getInfoLogs()).toHaveLength(1);
    expect(mockLogger.hasLogWithMessage("Operation completed")).toBe(true);
  });
});
```

### Using the Helper Function

```typescript
import { withMockedLogger } from "../utils/logger-mock.js";

describe("MyService", () => {
  it(
    "should work with helper",
    withMockedLogger(async (logger) => {
      const service = new MyService(logger);
      await service.doSomething();

      expect(logger.getInfoLogs()).toHaveLength(1);
    }),
  );
});
```

## API Reference

### Main Functions

#### `setupLoggerMocks()`

Sets up global logger mocks and suppresses console output.

- Returns: `{ mockLogger, restoreConsoleMethods }`

#### `teardownLoggerMocks()`

Cleans up logger mocks and restores console methods.

#### `createMockLogger(level?: LogLevel)`

Creates a new MockLogger instance.

- Parameters: `level` - Log level (default: "error")
- Returns: `MockLogger` instance

#### `withMockedLogger(testFn)`

Higher-order function for tests with automatic setup/teardown.

- Parameters: `testFn` - Test function receiving a MockLogger
- Returns: Test function compatible with Jest

### MockLogger Class

#### Log Methods

- `debug(message, context?)`
- `info(message, context?)`
- `warn(message, context?)`
- `error(message, error?, context?)`
- `logMetadata(level, message, metadata, context?)`
- `logScanResult(filePath, scanResult, metadata?)`

#### Verification Methods

- `getLogs()` - All captured logs
- `getLogsByLevel(level)` - Logs filtered by level
- `getErrorLogs()` - Error logs only
- `getWarnLogs()` - Warning logs only
- `getInfoLogs()` - Info logs only
- `getDebugLogs()` - Debug logs only
- `hasLogWithMessage(message)` - Check if message exists
- `hasErrorWithMessage(message)` - Check if error message exists
- `getLogCount()` - Total log count
- `clearLogs()` - Clear all captured logs

## Patterns for Different Test Scenarios

### 1. Standard Service Tests

```typescript
describe("ServiceTest", () => {
  let service: MyService;

  beforeEach(() => {
    setupLoggerMocks();
    service = new MyService();
  });

  afterEach(() => {
    teardownLoggerMocks();
  });

  it("should log appropriately", () => {
    service.performAction();

    const infoLogs = mockLogger.getInfoLogs();
    expect(infoLogs.some((log) => log.message.includes("Action started"))).toBe(
      true,
    );
  });
});
```

### 2. Replacing console.error Calls

```typescript
// Before
console.error("Cleanup error:", error);

// After
mockLogger.error("Cleanup error:", error);
```

### 3. Testing Error Scenarios

```typescript
it("should handle errors and log them", async () => {
  try {
    await service.failingOperation();
  } catch {
    // Expected error
  }

  const errorLogs = mockLogger.getErrorLogs();
  expect(errorLogs).toHaveLength(1);
  expect(errorLogs[0].message).toBe("Operation failed");
  expect(errorLogs[0].context?.error).toBeDefined();
});
```

### 4. Verifying Log Context

```typescript
it("should include proper context", () => {
  service.processData("test");

  const infoLogs = mockLogger.getInfoLogs();
  const processingLog = infoLogs.find((log) =>
    log.message.includes("Processing"),
  );

  expect(processingLog?.context).toBeDefined();
  expect(processingLog?.context?.dataLength).toBe(4);
});
```

## Migration Guide

### For Existing Test Files

1. **Add the import:**

```typescript
import {
  setupLoggerMocks,
  teardownLoggerMocks,
  mockLogger,
} from "../utils/logger-mock.js";
```

2. **Update beforeEach:**

```typescript
beforeEach(() => {
  setupLoggerMocks();
  // ... existing setup
});
```

3. **Update afterEach:**

```typescript
afterEach(() => {
  // ... existing cleanup
  teardownLoggerMocks();
});
```

4. **Replace console.error:**

```typescript
// Before
console.error("Error:", error);

// After
mockLogger.error("Error:", error);
```

### For Files with Direct Logger Imports

The mocking system automatically handles services that import logger directly:

```typescript
// This will automatically get the mock logger
import { logger } from "../utils/logger.js";

class MyService {
  doSomething() {
    logger.info("Doing something"); // This will be captured by mockLogger
  }
}
```

## Advanced Usage

### Custom Logger Instances

```typescript
it("should use isolated logger", () => {
  const customLogger = createMockLogger("debug");
  const service = new MyService(customLogger);

  service.doSomething();

  expect(customLogger.getLogCount()).toBe(1);
  expect(mockLogger.getLogCount()).toBe(0); // Original logger unaffected
});
```

### Timestamp Verification

```typescript
it("should timestamp logs correctly", () => {
  const before = new Date();
  mockLogger.info("Test message");
  const after = new Date();

  const logs = mockLogger.getLogs();
  expect(logs[0].timestamp).toBeInstanceOf(Date);
  expect(logs[0].timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
  expect(logs[0].timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
});
```

### Testing All Logger Methods

```typescript
it("should test all logger methods", () => {
  const logger = createMockLogger("debug");

  logger.debug("Debug", { debug: true });
  logger.info("Info", { info: true });
  logger.warn("Warning", { warn: true });
  logger.error("Error", new Error("test"), { error: true });

  expect(logger.getDebugLogs()).toHaveLength(1);
  expect(logger.getInfoLogs()).toHaveLength(1);
  expect(logger.getWarnLogs()).toHaveLength(1);
  expect(logger.getErrorLogs()).toHaveLength(1);
});
```

## Benefits

1. **No Console Noise:** All console output is suppressed during tests
2. **Log Verification:** Powerful assertions to verify logging behavior
3. **Test Isolation:** Each test gets clean logger state
4. **Backward Compatibility:** Works with existing Logger class methods
5. **Type Safety:** Full TypeScript support
6. **Performance:** Minimal overhead during test execution

## Troubleshooting

### Console Output Still Appearing

Make sure you call `setupLoggerMocks()` in your `beforeEach` or at the beginning of your test.

### Mock Logger Not Capturing Logs

Ensure your service is using the imported `logger` from the utils module, which is automatically mocked.

### Tests Failing After Migration

Check that you're calling `teardownLoggerMocks()` in `afterEach` to clean up between tests.

## Examples

See `tests/unit/examples/logger-mocking-example.test.ts` for comprehensive examples of all patterns and features.
