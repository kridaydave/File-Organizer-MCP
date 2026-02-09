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
import { runFuzzing } from "./path-traversal-fuzz.js";
import { runTOCTOUTests } from "./toctou-test.js";
import { runSensitiveFileTests } from "./sensitive-file-test.js";
import { runStaticAnalysis } from "./static-analysis.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Colors for output
const colors = {
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
    bold: "\x1b[1m",
    reset: "\x1b[0m",
};
const results = [];
/**
 * Print banner
 */
function printBanner() {
    console.log(`
${colors.bold}${colors.blue}
╔══════════════════════════════════════════════════════════════════════════╗
║                                                                          ║
║                    SECURITY GATES MASTER RUNNER                          ║
║                                                                          ║
║                    File Organizer MCP Server                             ║
║                         Shepherd-Gamma Approved                          ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
${colors.reset}
`);
}
/**
 * Print section header
 */
function printSection(name) {
    console.log(`
${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.bold}${colors.blue}  Running: ${name}${colors.reset}`);
    console.log(`${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
}
/**
 * Run a single security gate
 */
async function runGate(name, runner) {
    printSection(name);
    const startTime = Date.now();
    let exitCode = 1;
    let error;
    try {
        exitCode = await runner();
    }
    catch (e) {
        error = e instanceof Error ? e.message : String(e);
        console.error(`${colors.red}Gate execution failed: ${error}${colors.reset}`);
    }
    const duration = Date.now() - startTime;
    const passed = exitCode === 0;
    const result = {
        name,
        passed,
        exitCode,
        duration,
        error,
    };
    results.push(result);
    // Print immediate result
    const status = passed ? `${colors.green}✓ PASS` : `${colors.red}✗ FAIL`;
    console.log(`\n${status} ${name} (${duration}ms)${colors.reset}\n`);
    return result;
}
/**
 * Print final summary
 */
function printFinalSummary() {
    console.log(`
${colors.bold}${colors.blue}
╔══════════════════════════════════════════════════════════════════════════╗
║                          FINAL SECURITY REPORT                           ║
╚══════════════════════════════════════════════════════════════════════════╝
${colors.reset}
`);
    const totalGates = results.length;
    const passedGates = results.filter((r) => r.passed).length;
    const failedGates = totalGates - passedGates;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    console.log(`${colors.bold}Summary:${colors.reset}`);
    console.log(`  Total Gates: ${totalGates}`);
    console.log(`${colors.green}  Passed: ${passedGates}${colors.reset}`);
    console.log(`${colors.red}  Failed: ${failedGates}${colors.reset}`);
    console.log(`  Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);
    console.log(`\n${colors.bold}Detailed Results:${colors.reset}\n`);
    for (const result of results) {
        const status = result.passed
            ? `${colors.green}✓ PASS`
            : `${colors.red}✗ FAIL`;
        const code = result.exitCode !== 0 ? ` (exit: ${result.exitCode})` : "";
        console.log(`  ${status}${colors.reset} ${result.name}${code}`);
        console.log(`         Duration: ${result.duration}ms`);
        if (result.error) {
            console.log(`         Error: ${result.error}`);
        }
    }
    // Security certification
    console.log(`\n${colors.blue}══════════════════════════════════════════════════════════════════════════${colors.reset}`);
    if (failedGates === 0) {
        console.log(`
${colors.green}${colors.bold}
  ┌─────────────────────────────────────────────────────────────────────┐
  │                                                                     │
  │              ✓ ALL SECURITY GATES PASSED                            │
  │                                                                     │
  │         Code is certified for deployment by Shepherd-Gamma          │
  │                                                                     │
  └─────────────────────────────────────────────────────────────────────┘
${colors.reset}`);
    }
    else {
        console.log(`
${colors.red}${colors.bold}
  ┌─────────────────────────────────────────────────────────────────────┐
  │                                                                     │
  │              ✗ SECURITY GATES FAILED                                │
  │                                                                     │
  │         ${failedGates} gate(s) failed - Deployment BLOCKED              │
  │                                                                     │
  └─────────────────────────────────────────────────────────────────────┘
${colors.reset}`);
    }
    console.log(`${colors.blue}══════════════════════════════════════════════════════════════════════════${colors.reset}\n`);
}
/**
 * Generate security report file
 */
async function generateReport() {
    const report = {
        timestamp: new Date().toISOString(),
        summary: {
            totalGates: results.length,
            passed: results.filter((r) => r.passed).length,
            failed: results.filter((r) => !r.passed).length,
            totalDuration: results.reduce((sum, r) => sum + r.duration, 0),
        },
        gates: results.map((r) => ({
            name: r.name,
            passed: r.passed,
            exitCode: r.exitCode,
            duration: r.duration,
            error: r.error,
        })),
        certification: results.every((r) => r.passed) ? "APPROVED" : "REJECTED",
        certifiedBy: "Shepherd-Gamma",
    };
    const reportPath = path.join(__dirname, "../../security-gates-report.json");
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`${colors.cyan}Security report saved to: ${reportPath}${colors.reset}\n`);
}
/**
 * Print security requirements checklist
 */
function printRequirementsChecklist() {
    console.log(`${colors.bold}Security Requirements:${colors.reset}\n`);
    const requirements = [
        {
            id: "SEC-REQ-001",
            description: "ALL path traversal attempts must be blocked",
            gate: "Path Traversal Fuzzing",
        },
        {
            id: "SEC-REQ-002",
            description: "TOCTOU race conditions must be mitigated",
            gate: "TOCTOU Race Condition Tests",
        },
        {
            id: "SEC-REQ-003",
            description: "Sensitive files must never be readable",
            gate: "Sensitive File Access Tests",
        },
        {
            id: "SEC-REQ-004",
            description: "No direct fs calls without validation",
            gate: "Static Analysis",
        },
        {
            id: "SEC-REQ-005",
            description: "Static analysis must pass cleanly",
            gate: "Static Analysis",
        },
    ];
    for (const req of requirements) {
        console.log(`  ${colors.blue}[${req.id}]${colors.reset} ${req.description}`);
        console.log(`            Gate: ${req.gate}`);
    }
    console.log("");
}
/**
 * Main runner
 */
async function runAllGates() {
    printBanner();
    printRequirementsChecklist();
    console.log(`${colors.yellow}Starting security gate execution...${colors.reset}\n`);
    // Run all gates
    await runGate("Path Traversal Fuzzing", runFuzzing);
    await runGate("TOCTOU Race Condition Tests", runTOCTOUTests);
    await runGate("Sensitive File Access Tests", runSensitiveFileTests);
    await runGate("Static Analysis", runStaticAnalysis);
    // Print summary
    printFinalSummary();
    // Generate report
    await generateReport();
    // Return exit code
    const allPassed = results.every((r) => r.passed);
    return allPassed ? 0 : 1;
}
// Run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    runAllGates()
        .then((exitCode) => {
        console.log(`${colors.bold}Exit code: ${exitCode}${colors.reset}\n`);
        process.exit(exitCode);
    })
        .catch((error) => {
        console.error(`${colors.red}Fatal error: ${error}${colors.reset}`);
        process.exit(1);
    });
}
export { runAllGates };
//# sourceMappingURL=run-all.js.map