/**
 * Security Gates Master Runner
 *
 * Executes all security gate tests:
 * 1. Path Traversal Fuzzing
 * 2. TOCTOU Race Condition Tests
 * 3. Sensitive File Access Tests
 * 4. Static Analysis
 *
 * Generates comprehensive security report and fails if any gate fails.
 *
 * @security Shepherd-Gamma Approved
 * @module scripts/security-gates/run-all
 */
interface GateResult {
    name: string;
    passed: boolean;
    exitCode: number;
    duration: number;
    error?: string;
}
/**
 * Main runner
 */
declare function runAllGates(): Promise<number>;
export { runAllGates, GateResult };
//# sourceMappingURL=run-all.d.ts.map