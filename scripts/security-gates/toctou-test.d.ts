/**
 * Security Gate: TOCTOU (Time-of-Check-Time-of-Use) Race Condition Tests
 *
 * Tests for race conditions between path validation and file operations.
 * Uses O_NOFOLLOW to prevent symlink attacks and ensures atomic validation.
 *
 * @security Shepherd-Gamma Approved
 * @module scripts/security-gates/toctou-test
 */
/**
 * Main TOCTOU test execution
 */
declare function runTOCTOUTests(): Promise<number>;
export { runTOCTOUTests };
//# sourceMappingURL=toctou-test.d.ts.map