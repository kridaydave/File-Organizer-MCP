/**
 * Security Gate: Sensitive File Access Tests
 *
 * Tests that all sensitive file patterns are properly blocked.
 * Attempts to read system files, credentials, and configuration files.
 *
 * @security Shepherd-Gamma Approved
 * @module scripts/security-gates/sensitive-file-test
 */
/**
 * Define sensitive file test cases by category
 */
declare function getSensitiveFileTestCases(): Array<{
    path: string;
    category: string;
    description: string;
}>;
/**
 * Main sensitive file test execution
 */
declare function runSensitiveFileTests(): Promise<number>;
export { runSensitiveFileTests, getSensitiveFileTestCases };
//# sourceMappingURL=sensitive-file-test.d.ts.map