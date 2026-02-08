module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  testTimeout: 30000,
  extensionsToTreatAsEsm: ['.ts'],
  testMatch: ['**/tests/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
  },
  moduleNameMapper: {
    '^(\.{1,2}/.*)\\.js$': '$1',
  },
  // CI-specific settings
  maxWorkers: '50%',
  workerIdleMemoryLimit: '512MB',
  // Cache settings for CI
  cacheDirectory: '<rootDir>/.jest-cache',
};
