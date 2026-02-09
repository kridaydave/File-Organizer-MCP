module.exports = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  testTimeout: 30000,
<<<<<<< Updated upstream
  extensionsToTreatAsEsm: [".ts"],
  testMatch: ["**/tests/**/*.test.ts", "**/src/**/*.test.ts"],
=======
  extensionsToTreatAsEsm: ['.ts'],
  testMatch: ['**/tests/**/*.test.ts', '**/src/readers/__tests__/**/*.test.ts'],
>>>>>>> Stashed changes
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { useESM: true }],
  },
  moduleNameMapper: {
    "^(\.{1,2}/.*)\\.js$": "$1",
  },
  maxWorkers: "50%",
  workerIdleMemoryLimit: "512MB",
  cacheDirectory: "<rootDir>/.jest-cache",
};
