/**
 * Jest config for mutation runs only (stryker.conf.json points here).
 *
 * The full suite's integration tier is too slow a substrate for mutation
 * testing and carries workflow tests unrelated to the mutated files (the
 * Stryker dry run needs every configured test green before it mutates
 * anything, so one flaky organize test would block the whole gate). The
 * mutation tier is the unit suites that directly exercise the mutated
 * modules; `enableFindRelatedTests` in stryker.conf.json then runs each
 * mutant against only the tests that cover it.
 */

const base = require("./jest.config.cjs");

module.exports = {
  ...base,
  testMatch: [
    "**/tests/unit/services/path-validator.test.ts",
    "**/tests/unit/core/io/read-file.test.ts",
    "**/tests/unit/security_suite.test.ts",
    "**/tests/unit/security_repro.test.ts",
    "**/tests/unit/services/adversarial-deep-audit.test.ts",
    "**/tests/unit/services/adversarial-tool-gates.test.ts",
  ],
};
