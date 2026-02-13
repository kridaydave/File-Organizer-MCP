module.exports = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  testTimeout: 60000,
  extensionsToTreatAsEsm: [".ts"],
  testMatch: ["**/tests/**/*.test.ts", "**/src/**/*.test.ts"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { useESM: true }],
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^pdf-parse$": "<rootDir>/tests/__mocks__/pdf-parse.js",
  },
  transformIgnorePatterns: ["/node_modules/(?!(pdf-parse)/)"],
  maxWorkers: "25%",
  workerIdleMemoryLimit: "256MB",
  cacheDirectory: "<rootDir>/.jest-cache",
};
