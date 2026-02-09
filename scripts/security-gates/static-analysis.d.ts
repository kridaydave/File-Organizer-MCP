/**
 * Security Gate: Static Analysis
 *
 * Scans the codebase for security issues:
 * - Direct fs.readFile without validation
 * - allowSymlinks: true usage
 * - Generic <T> types in file reading
 * - Missing audit log calls
 *
 * @security Shepherd-Gamma Approved
 * @module scripts/security-gates/static-analysis
 */
interface SecurityRule {
    id: string;
    name: string;
    description: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    pattern: RegExp;
    excludePattern?: RegExp;
    filePattern?: RegExp;
    message: string;
}
declare const securityRules: SecurityRule[];
interface SecurityIssue {
    file: string;
    line: number;
    column: number;
    rule: SecurityRule;
    code: string;
    context: string;
}
/**
 * Main static analysis execution
 */
declare function runStaticAnalysis(): Promise<number>;
export { runStaticAnalysis, securityRules, SecurityRule, SecurityIssue };
//# sourceMappingURL=static-analysis.d.ts.map