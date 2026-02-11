// Global test setup to mock console.error and prevent Jest from treating it as test failures
import { globalLoggerSetup } from "./utils/logger-mock.js";

// Setup global logger mocks for all test files
globalLoggerSetup();
