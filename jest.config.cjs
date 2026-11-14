module.exports = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  testTimeout: 60000,
  extensionsToTreatAsEsm: [".ts"],
  testMatch: ["**/tests/**/*.test.ts", "**/src/**/*.test.ts"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  // Portability perturbation profile: FO_PORTABILITY=1 makes Linux lie about
  // readdir order and tmpdir resolution for one run. See tests/perturb/setup.ts.
  setupFiles: process.env.FO_PORTABILITY ? ["<rootDir>/tests/perturb/setup.ts"] : [],
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
