module.exports = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  testTimeout: 30000,
  extensionsToTreatAsEsm: [".ts"],
  testMatch: ["**/tests/**/*.test.ts", "**/src/**/*.test.ts"],
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
