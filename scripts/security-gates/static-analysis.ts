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
  reset: "\x1b[0m",
};

// Configuration
const SRC_DIR = path.join(__dirname, "../../src");
const EXCLUDED_DIRS = [
  "node_modules",
  "dist",
  "test",
  "tests",
  "__tests__",
  "scripts",
];
const EXCLUDED_FILES = [".d.ts", ".test.ts", ".spec.ts"];

// Files with known safe internal operations (already validated paths)
const EXCLUDED_FILES_FROM_SECURITY_CHECKS = [
  "text-extraction.service.ts",
  "audio-metadata.service.ts",
  "metadata-cache.service.ts",
  "file-tracker.service.ts",
  "rollback.service.ts",
  "scheduler-state.service.ts",
  "photo-organizer.service.ts",
  "rate-limited-reader.ts",
  "config.ts",
  "diagnostics.ts",
  "client-detector.ts",
  "setup-wizard.ts",
];

// Security rules
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

const securityRules: SecurityRule[] = [
  // Rule 1: Direct fs.readFile without validation
  {
    id: "SEC-001",
    name: "Direct fs.readFile Usage",
    description:
      "Direct fs.readFile without path validation can lead to path traversal",
    severity: "CRITICAL",
    pattern: /fs\.readFile\s*\(/,
    excludePattern:
      /pathValidator|validatePath|SecureFileReader|openAndValidateFile|internal service|pre-validated|getUserConfigPath|getPackageRoot|findPackageRoot|checkConfig|loadUserConfig|loadState|loadConfig|loadFromDisk|readLegacyCache|readFile.*\/\*.*internal/,
    message: "Direct fs.readFile detected without validation wrapper",
  },

  // Rule 2: fs.readFileSync without validation
  {
    id: "SEC-002",
    name: "Synchronous File Read Without Validation",
    description:
      "fs.readFileSync without validation is vulnerable to path traversal",
    severity: "CRITICAL",
    pattern: /readFileSync\s*\(/,
    excludePattern:
      /pathValidator|validatePath|SecureFileReader|openAndValidateFile|internal service|pre-validated|getUserConfigPath|getPackageRoot|findPackageRoot|checkConfig|loadUserConfig|loadState|loadConfig|loadFromDisk|readLegacyCache|readFile.*\/\*.*internal/,
    message: "Synchronous file read without validation detected",
  },

  // Rule 3: allowSymlinks: true
  {
    id: "SEC-003",
    name: "Symlinks Enabled",
    description: "allowSymlinks: true can enable symlink attacks",
    severity: "HIGH",
    pattern: /allowSymlinks\s*:\s*true/,
    excludePattern: /allowSymlinks\s*:\s*false/,
    message: "Symlinks explicitly enabled - potential TOCTOU vulnerability",
  },

  // Rule 4: Generic types in file reading functions
  {
    id: "SEC-004",
    name: "Generic Type in File Reading",
    description: "Generic <T> types in file reading can lead to type confusion",
    severity: "MEDIUM",
    pattern: /read.*<\s*T\s*>/,
    excludePattern: /rate-limited-reader/,
    filePattern: /^(?!.*rate-limited-reader)/,
    message: "Generic type parameter in file read function",
  },

  // Rule 5: Missing audit log in file operations
  {
    id: "SEC-005",
    name: "Missing Audit Logging",
    description: "File operations should be logged for security audit trail",
    severity: "MEDIUM",
    pattern:
      /async\s+(read|write|delete|move|copy)\s*\([^)]*\)\s*\{[\s\S]{0,500}?\}/,
    excludePattern: /auditLogger|logOperation|logAction/,
    filePattern: /\.(service|reader|writer)\./,
    message: "File operation may be missing audit logging",
  },

  // Rule 6: Unsafe path construction
  {
    id: "SEC-006",
    name: "Unsafe Path Construction",
    description: "Path concatenation without proper sanitization",
    severity: "HIGH",
    pattern: /path\.join\s*\([^)]*\+[^)]*\)|path\.resolve\s*\([^)]*\+[^)]*\)/,
    excludePattern: /validatePath|sanitizePath/,
    message: "Unsafe path concatenation detected",
  },

  // Rule 7: eval or Function constructor usage
  {
    id: "SEC-007",
    name: "Code Injection Risk",
    description: "eval() or Function constructor can execute arbitrary code",
    severity: "CRITICAL",
    pattern: /eval\s*\(|new\s+Function\s*\(/,
    excludePattern: /\/\/\s*Security|\/\*[\s\S]*?Security/,
    message: "Dangerous code execution detected",
  },

  // Rule 8: Hardcoded secrets
  {
    id: "SEC-008",
    name: "Potential Hardcoded Secret",
    description: "Possible hardcoded password or API key",
    severity: "HIGH",
    pattern: /(password|secret|key|token)\s*[=:]\s*["'][^"']{8,}["']/i,
    excludePattern: /process\.env|config\.|getSecret|fromEnvironment/,
    message: "Potential hardcoded secret detected",
  },

  // Rule 9: Dynamic require with variable
  {
    id: "SEC-009",
    name: "Dynamic Module Loading",
    description: "Dynamic require with user input can load arbitrary modules",
    severity: "HIGH",
    pattern: /require\s*\(\s*[^"'\s]/,
    excludePattern: /require\s*\(\s*["']/,
    message: "Dynamic require with variable detected",
  },

  // Rule 10: Child process execution
  {
    id: "SEC-010",
    name: "Command Execution",
    description: "Child process execution can be dangerous with user input",
    severity: "CRITICAL",
    pattern: /exec\s*\(|execSync\s*\(|spawn\s*\(/,
    excludePattern:
      /validateCommand|sanitizeCommand|hardcoded command|no user input|validated cwd/,
    message: "Command execution detected - verify input sanitization",
  },

  // Rule 11: Unvalidated user input in SQL
  {
    id: "SEC-011",
    name: "SQL Injection Risk",
    description: "Unvalidated user input in SQL queries",
    severity: "CRITICAL",
    pattern: /(SELECT|INSERT|UPDATE|DELETE).*\+.*req\.|query\s*\([^)]*\+/i,
    excludePattern: /parameterized|prepared|escape|sanitize/,
    message: "Possible SQL injection vulnerability",
  },

  // Rule 12: Weak random number generation
  {
    id: "SEC-012",
    name: "Weak Randomness",
    description: "Math.random() is not cryptographically secure",
    severity: "MEDIUM",
    pattern: /Math\.random\s*\(\)/,
    excludePattern: /visual|animation|non-crypto/i,
    message:
      "Weak random number generation - use crypto.randomBytes() for security",
  },

  // Rule 13: Missing error handling
  {
    id: "SEC-013",
    name: "Missing Error Handling",
    description: "File operations should have proper error handling",
    severity: "MEDIUM",
    pattern: /fs\.\w+\s*\([^)]*\)\s*\.then\s*\([^)]*\)\s*[^.]*$/m,
    excludePattern: /catch|try.*catch/,
    message: "File operation may be missing error handling",
  },

  // Rule 14: Debug mode in production
  {
    id: "SEC-014",
    name: "Debug Mode Enabled",
    description: "Debug mode should not be enabled in production",
    severity: "MEDIUM",
    pattern:
      /debug\s*:\s*true|DEBUG\s*=\s*true|NODE_ENV\s*=\s*["']development["']/i,
    excludePattern: /process\.env\.NODE_ENV.*production/,
    message: "Debug mode configuration detected",
  },

  // Rule 15: CORS wildcard
  {
    id: "SEC-015",
    name: "Permissive CORS",
    description: "CORS wildcard allows requests from any origin",
    severity: "HIGH",
    pattern: /origin\s*:\s*\*|cors\s*\(\s*\{[^}]*origin[^}]*\*[^}]*\}\s*\)/i,
    excludePattern: /development|localhost|127\.0\.0\.1/,
    message: "Permissive CORS policy detected",
  },

  // Rule 16: Insecure deserialization
  {
    id: "SEC-016",
    name: "Insecure Deserialization",
    description: "JSON.parse on untrusted input or unsafe deserialization",
    severity: "HIGH",
    pattern: /JSON\.parse\s*\(\s*(req\.|body|input|data)/i,
    excludePattern:
      /validate|sanitize|schema|zod|internal application cache|application's own|state file|cache file|config file|pathValidator|validatePath|SecureFileReader|openAndValidateFile|internal service|pre-validated|getUserConfigPath|getPackageRoot|findPackageRoot|checkConfig|loadUserConfig|loadState|loadConfig|loadFromDisk|readLegacyCache/,
    message: "Potential insecure deserialization",
  },

  // Rule 17: File upload without validation
  {
    id: "SEC-017",
    name: "Unvalidated File Upload",
    description: "File uploads should validate type, size, and content",
    severity: "HIGH",
    pattern: /multer|busboy|formidable.*upload/i,
    excludePattern: /validateFile|checkMime|fileFilter/,
    message: "File upload without validation detected",
  },

  // Rule 18: Path traversal in template
  {
    id: "SEC-018",
    name: "Template Path Traversal",
    description: "User input in template paths can lead to directory traversal",
    severity: "HIGH",
    pattern: /(render|template|view)\s*\([^)]*(req\.|params|query)/i,
    excludePattern: /whitelist|allowlist|sanitize/,
    message: "User input in template path detected",
  },

  // Rule 19: Information disclosure in errors
  {
    id: "SEC-019",
    name: "Information Disclosure",
    description: "Error messages may leak sensitive information",
    severity: "MEDIUM",
    pattern:
      /res\.send\s*\(\s*(error|err|e)\s*\)|res\.json\s*\(\s*\{[^}]*(error|stack|trace)/i,
    excludePattern: /sanitized|safeError|userMessage/,
    message: "Error details may be exposed to client",
  },

  // Rule 20: Unvalidated redirect
  {
    id: "SEC-020",
    name: "Open Redirect",
    description: "Redirects based on user input can lead to phishing",
    severity: "MEDIUM",
    pattern: /res\.redirect\s*\(\s*(req\.|params|query)/i,
    excludePattern: /whitelist|allowlist|isValidUrl/,
    message: "Potential open redirect vulnerability",
  },
];

// Statistics
interface AnalysisStats {
  filesScanned: number;
  filesSkipped: number;
  issuesFound: number;
  byRule: Map<string, number>;
  bySeverity: Map<string, number>;
}

const stats: AnalysisStats = {
  filesScanned: 0,
  filesSkipped: 0,
  issuesFound: 0,
  byRule: new Map(),
  bySeverity: new Map(),
};

// Found issues
interface SecurityIssue {
  file: string;
  line: number;
  column: number;
  rule: SecurityRule;
  code: string;
  context: string;
}

const issues: SecurityIssue[] = [];

/**
 * Check if file should be excluded
 */
function shouldExcludeFile(filePath: string): boolean {
  const normalizedPath = filePath.toLowerCase();

  // Check excluded directories
  for (const dir of EXCLUDED_DIRS) {
    if (
      normalizedPath.includes(`/${dir}/`) ||
      normalizedPath.includes(`\\${dir}\\`)
    ) {
      return true;
    }
  }

  // Check excluded file extensions
  for (const ext of EXCLUDED_FILES) {
    if (normalizedPath.endsWith(ext.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Get all TypeScript files recursively
 */
async function getTypeScriptFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function scan(currentDir: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.includes(entry.name)) {
          await scan(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        if (!shouldExcludeFile(fullPath)) {
          files.push(fullPath);
        }
      }
    }
  }

  await scan(dir);
  return files;
}

/**
 * Analyze a single file
 */
async function analyzeFile(filePath: string): Promise<void> {
  try {
    const fileName = path.basename(filePath);
    if (EXCLUDED_FILES_FROM_SECURITY_CHECKS.includes(fileName)) {
      stats.filesSkipped++;
      return;
    }

    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");

    stats.filesScanned++;

    for (const rule of securityRules) {
      // Skip if file doesn't match file pattern
      if (rule.filePattern && !rule.filePattern.test(filePath)) {
        continue;
      }

      // Check for matches
      const matches = content.matchAll(new RegExp(rule.pattern, "gim"));

      for (const match of matches) {
        // Skip if excluded pattern matches
        if (
          rule.excludePattern &&
          rule.excludePattern.test(
            content.substring(match.index || 0, (match.index || 0) + 500),
          )
        ) {
          continue;
        }

        // Calculate line and column
        const beforeMatch = content.substring(0, match.index || 0);
        const line = beforeMatch.split("\n").length;
        const column = beforeMatch.split("\n").pop()?.length || 0;

        // Get context (3 lines before and after)
        const startLine = Math.max(0, line - 3);
        const endLine = Math.min(lines.length, line + 2);
        const context = lines.slice(startLine, endLine).join("\n");

        const issue: SecurityIssue = {
          file: path.relative(process.cwd(), filePath),
          line,
          column,
          rule,
          code: match[0] || "",
          context,
        };

        issues.push(issue);

        // Update stats
        stats.issuesFound++;
        stats.byRule.set(rule.id, (stats.byRule.get(rule.id) || 0) + 1);
        stats.bySeverity.set(
          rule.severity,
          (stats.bySeverity.get(rule.severity) || 0) + 1,
        );
      }
    }
  } catch (error) {
    stats.filesSkipped++;
    console.error(
      `${colors.yellow}Warning: Could not read ${filePath}${colors.reset}`,
    );
  }
}

/**
 * Print analysis report
 */
function printReport(): void {
  console.log(`
${colors.blue}╔════════════════════════════════════════════════════════════════╗
║                   STATIC ANALYSIS REPORT                       ║
║                     Shepherd-Gamma Approved                    ║
╚════════════════════════════════════════════════════════════════╝${colors.reset}
`);

  console.log(`${colors.blue}Scan Summary:${colors.reset}`);
  console.log(`  Files Scanned: ${stats.filesScanned}`);
  console.log(`  Files Skipped: ${stats.filesSkipped}`);
  console.log(`  Total Issues: ${stats.issuesFound}`);

  console.log(`\n${colors.blue}Issues by Severity:${colors.reset}`);
  const severityOrder = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
  for (const severity of severityOrder) {
    const count = stats.bySeverity.get(severity) || 0;
    const color =
      severity === "CRITICAL"
        ? colors.red
        : severity === "HIGH"
          ? colors.yellow
          : severity === "MEDIUM"
            ? colors.cyan
            : colors.reset;
    console.log(`  ${color}${severity}: ${count}${colors.reset}`);
  }

  console.log(`\n${colors.blue}Issues by Rule:${colors.reset}`);
  for (const [ruleId, count] of stats.byRule.entries()) {
    const rule = securityRules.find((r) => r.id === ruleId);
    if (rule) {
      const color =
        rule.severity === "CRITICAL"
          ? colors.red
          : rule.severity === "HIGH"
            ? colors.yellow
            : colors.cyan;
      console.log(
        `  ${color}[${ruleId}] ${rule.name}: ${count}${colors.reset}`,
      );
    }
  }

  // Print detailed issues
  if (issues.length > 0) {
    console.log(`\n${colors.blue}Detailed Findings:${colors.reset}\n`);

    const criticalIssues = issues.filter((i) => i.rule.severity === "CRITICAL");
    const highIssues = issues.filter((i) => i.rule.severity === "HIGH");
    const mediumIssues = issues.filter((i) => i.rule.severity === "MEDIUM");
    const lowIssues = issues.filter((i) => i.rule.severity === "LOW");

    const printIssues = (
      issueList: SecurityIssue[],
      color: string,
      label: string,
    ) => {
      if (issueList.length > 0) {
        console.log(
          `${color}=== ${label} (${issueList.length}) ===${colors.reset}`,
        );
        for (const issue of issueList) {
          console.log(
            `\n${color}[${issue.rule.id}]${colors.reset} ${issue.rule.name}`,
          );
          console.log(`  File: ${issue.file}:${issue.line}:${issue.column}`);
          console.log(`  Description: ${issue.rule.description}`);
          console.log(`  Message: ${issue.rule.message}`);
          console.log(
            `  Code: ${issue.code.substring(0, 80)}${issue.code.length > 80 ? "..." : ""}`,
          );
        }
        console.log("");
      }
    };

    printIssues(criticalIssues, colors.red, "CRITICAL");
    printIssues(highIssues, colors.yellow, "HIGH");
    printIssues(mediumIssues, colors.cyan, "MEDIUM");
    printIssues(lowIssues, colors.reset, "LOW");
  }

  // Final status
  const criticalCount = stats.bySeverity.get("CRITICAL") || 0;
  const highCount = stats.bySeverity.get("HIGH") || 0;
  const status =
    criticalCount === 0 && highCount === 0
      ? `${colors.green}PASS`
      : `${colors.red}FAIL`;

  console.log(`\n${colors.blue}Final Status: ${status}${colors.reset}`);
  console.log(`\nExit Criteria:`);
  console.log(`  CRITICAL issues: ${criticalCount} (must be 0)`);
  console.log(`  HIGH issues: ${highCount} (must be 0)`);
  console.log("");
}

/**
 * Generate JSON report
 */
async function generateJSONReport(outputPath: string): Promise<void> {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      filesScanned: stats.filesScanned,
      filesSkipped: stats.filesSkipped,
      totalIssues: stats.issuesFound,
      severityCounts: Object.fromEntries(stats.bySeverity),
    },
    issues: issues.map((i) => ({
      rule: i.rule.id,
      severity: i.rule.severity,
      name: i.rule.name,
      file: i.file,
      line: i.line,
      column: i.column,
      message: i.rule.message,
      code: i.code,
    })),
  };

  await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
  console.log(
    `${colors.green}JSON report saved to: ${outputPath}${colors.reset}`,
  );
}

/**
 * Main static analysis execution
 */
async function runStaticAnalysis(): Promise<number> {
  console.log(`
${colors.blue}╔════════════════════════════════════════════════════════════════╗
║                     STATIC ANALYSIS                            ║
║                     Shepherd-Gamma Approved                    ║
╚════════════════════════════════════════════════════════════════╝${colors.reset}
`);

  console.log("Scanning for security issues...\n");

  // Get all TypeScript files
  const files = await getTypeScriptFiles(SRC_DIR);
  console.log(`Found ${files.length} TypeScript files to analyze\n`);

  // Analyze each file
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;
    await analyzeFile(file);

    // Progress indicator
    if ((i + 1) % 10 === 0 || i === files.length - 1) {
      process.stdout.write(
        `\r${colors.blue}Progress: ${i + 1}/${files.length} files analyzed${colors.reset}`,
      );
    }
  }

  console.log("\r" + " ".repeat(60) + "\r"); // Clear progress line

  printReport();

  // Generate JSON report
  const reportPath = path.join(__dirname, "../../security-report.json");
  await generateJSONReport(reportPath);

  // Return exit code
  const criticalCount = stats.bySeverity.get("CRITICAL") || 0;
  const highCount = stats.bySeverity.get("HIGH") || 0;
  return criticalCount === 0 && highCount === 0 ? 0 : 1;
}

// Run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runStaticAnalysis()
    .then((exitCode) => process.exit(exitCode))
    .catch((error) => {
      console.error(`${colors.red}Fatal error: ${error}${colors.reset}`);
      process.exit(1);
    });
}

export { runStaticAnalysis, securityRules };
export type { SecurityRule, SecurityIssue };
