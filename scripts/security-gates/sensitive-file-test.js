/**
 * Security Gate: Sensitive File Access Tests
 *
 * Tests that all sensitive file patterns are properly blocked.
 * Attempts to read system files, credentials, and configuration files.
 *
 * @security Shepherd-Gamma Approved
 * @module scripts/security-gates/sensitive-file-test
 */
import { SecureFileReader } from "../../src/readers/secure-file-reader.js";
import { PathValidatorService } from "../../src/services/path-validator.service.js";
import { RateLimiter } from "../../src/services/security/rate-limiter.service.js";
import { SENSITIVE_PATTERNS, SENSITIVE_DIRECTORIES, checkSensitiveFile, } from "../../src/readers/security/sensitive-file-patterns.js";
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
    reset: "\x1b[0m",
};
// Test configuration
const TEST_DIR = path.join(__dirname, "../../test-sensitive-temp");
const ALLOWED_DIR = path.join(TEST_DIR, "allowed");
const stats = {
    totalTests: 0,
    blocked: 0,
    allowed: 0,
    byCategory: new Map(),
};
// Mock audit logger
class MockAuditLogger {
    logOperationStart() { }
    logOperationSuccess() { }
    logOperationFailure() { }
}
/**
 * Define sensitive file test cases by category
 */
function getSensitiveFileTestCases() {
    const testCases = [];
    // Category 1: Environment files
    const envFiles = [
        ".env",
        ".env.local",
        ".env.development",
        ".env.production",
        ".env.test",
        ".env.staging",
        ".env.example",
        ".env.backup",
        ".env.old",
        ".env.bak",
        "/app/.env",
        "/home/user/.env",
        "config/.env",
        "app/.env",
        "project/.env.local",
        "/var/www/.env",
        "C:\\Users\\User\\.env",
        "C:\\project\\.env",
    ];
    envFiles.forEach((p) => testCases.push({
        path: p,
        category: "env-files",
        description: "Environment file",
    }));
    // Category 2: SSH keys
    const sshFiles = [
        ".ssh/id_rsa",
        ".ssh/id_ed25519",
        ".ssh/id_ecdsa",
        ".ssh/id_dsa",
        ".ssh/identity",
        ".ssh/id_rsa.pub",
        ".ssh/id_ed25519.pub",
        ".ssh/authorized_keys",
        ".ssh/known_hosts",
        "/home/user/.ssh/id_rsa",
        "/root/.ssh/id_rsa",
        "~/.ssh/id_rsa",
        "C:\\Users\\User\\.ssh\\id_rsa",
        ".ssh/config",
        ".ssh/id_rsa_backup",
    ];
    sshFiles.forEach((p) => testCases.push({
        path: p,
        category: "ssh-keys",
        description: "SSH key file",
    }));
    // Category 3: AWS credentials
    const awsFiles = [
        ".aws/credentials",
        ".aws/config",
        "/home/user/.aws/credentials",
        "~/.aws/credentials",
        "C:\\Users\\User\\.aws\\credentials",
        "aws/credentials.json",
    ];
    awsFiles.forEach((p) => testCases.push({
        path: p,
        category: "aws-credentials",
        description: "AWS credentials",
    }));
    // Category 4: Docker configuration
    const dockerFiles = [
        ".docker/config.json",
        "/home/user/.docker/config.json",
        "~/.docker/config.json",
    ];
    dockerFiles.forEach((p) => testCases.push({
        path: p,
        category: "docker-config",
        description: "Docker config",
    }));
    // Category 5: System password files
    const systemFiles = [
        "/etc/passwd",
        "/etc/shadow",
        "/etc/master.passwd",
        "/etc/group",
        "/etc/gshadow",
        "/etc/security/passwd",
        "C:\\Windows\\System32\\config\\SAM",
        "C:\\Windows\\System32\\config\\SECURITY",
        "C:\\Windows\\System32\\config\\SYSTEM",
        "passwd",
        "shadow",
        "master.passwd",
    ];
    systemFiles.forEach((p) => testCases.push({
        path: p,
        category: "system-passwords",
        description: "System password file",
    }));
    // Category 6: TLS/SSL certificates and keys
    const tlsFiles = [
        "server.key",
        "server.pem",
        "private.key",
        "ssl.key",
        "tls.key",
        "cert.pem",
        "certificate.pem",
        "server.p12",
        "keystore.pfx",
        "truststore.jks",
        "id_rsa.pem",
        "/etc/ssl/private/server.key",
        "/etc/ssl/certs/server.crt",
    ];
    tlsFiles.forEach((p) => testCases.push({
        path: p,
        category: "tls-keys",
        description: "TLS/SSL key",
    }));
    // Category 7: Database files
    const dbFiles = [
        "database.sqlite",
        "app.db",
        "data.sqlite3",
        "users.db",
        "/var/lib/mysql/mysql.user",
        "C:\\ProgramData\\MySQL\\MySQL Server 8.0\\Data\\mysql\\user.MYD",
    ];
    dbFiles.forEach((p) => testCases.push({
        path: p,
        category: "database-files",
        description: "Database file",
    }));
    // Category 8: Configuration files with secrets
    const configFiles = [
        "config.json",
        "secrets.json",
        "credentials.json",
        "api_keys.json",
        "auth.json",
        "tokens.json",
        "passwords.txt",
        "secrets.yml",
        "secrets.yaml",
        "config/secrets.json",
        "app/config/credentials.json",
        ".npmrc",
        ".pypirc",
        ".gemrc",
    ];
    configFiles.forEach((p) => testCases.push({
        path: p,
        category: "config-secrets",
        description: "Config with secrets",
    }));
    // Category 9: Kubernetes secrets
    const k8sFiles = [
        ".kube/config",
        "kubeconfig",
        "/home/user/.kube/config",
        "~/.kube/config",
        "k8s/secrets.yaml",
        "kubernetes/secrets.yml",
    ];
    k8sFiles.forEach((p) => testCases.push({
        path: p,
        category: "kubernetes-secrets",
        description: "Kubernetes secret",
    }));
    // Category 10: Generic secret patterns
    const genericSecrets = [
        "api_key.txt",
        "secret.key",
        "private_token",
        "bearer_token.json",
        "oauth_token",
        "jwt_secret",
        "encryption_key",
        "master_key",
        ".vault_key",
        "vault_password",
    ];
    genericSecrets.forEach((p) => testCases.push({
        path: p,
        category: "generic-secrets",
        description: "Generic secret",
    }));
    // Category 11: Backup files (may contain sensitive data)
    const backupFiles = [
        "config.json.bak",
        ".env.backup",
        "secrets.json.old",
        "credentials.bak",
        "database.sql.bak",
        "dump.sql.backup",
        "data.tar.gz",
        "archive.zip",
    ];
    backupFiles.forEach((p) => testCases.push({
        path: p,
        category: "backup-files",
        description: "Backup file",
    }));
    // Category 12: IDE/Editor config with credentials
    const ideFiles = [
        ".vscode/settings.json",
        ".idea/workspace.xml",
        ".idea/dataSources.xml",
        ".idea/deployment.xml",
        "nbproject/private/private.properties",
    ];
    ideFiles.forEach((p) => testCases.push({
        path: p,
        category: "ide-config",
        description: "IDE config",
    }));
    // Category 13: CI/CD secrets
    const cicdFiles = [
        ".github/workflows/deploy.yml",
        ".gitlab-ci.yml",
        ".travis.yml",
        "jenkins_credentials.xml",
        ".circleci/config.yml",
        ".github/secrets.json",
    ];
    cicdFiles.forEach((p) => testCases.push({
        path: p,
        category: "cicd-secrets",
        description: "CI/CD secret",
    }));
    // Category 14: Shell history
    const shellHistory = [
        ".bash_history",
        ".zsh_history",
        ".sh_history",
        ".history",
        "/home/user/.bash_history",
        "~/.zsh_history",
    ];
    shellHistory.forEach((p) => testCases.push({
        path: p,
        category: "shell-history",
        description: "Shell history",
    }));
    // Category 15: Variations and bypass attempts
    const bypassVariations = [
        ".ENV",
        ".Env",
        ".env.LOCAL",
        "CONFIG.JSON",
        "Config.Json",
        ".SSH/id_rsa",
        ".Ssh/Id_Rsa",
        "ID_RSA",
        "config/.ENV",
        "app/CONFIG.json",
        "AWS/credentials",
        ".AWS/CREDENTIALS",
        "passwd.BAK",
        ".env%00.txt",
        ".env.local.txt",
        ".env%2ebackup",
    ];
    bypassVariations.forEach((p) => testCases.push({
        path: p,
        category: "bypass-variations",
        description: "Bypass attempt",
    }));
    return testCases;
}
/**
 * Test a single sensitive file path
 */
async function testSensitiveFile(reader, filePath, category) {
    // First check pattern matching
    const patternCheck = checkSensitiveFile(filePath);
    if (!patternCheck.success) {
        return { blocked: true, pattern: patternCheck.error?.patternMatched };
    }
    // Try to read (should fail at validation layer)
    try {
        const result = await reader.read(filePath);
        if (!result.ok) {
            return { blocked: true };
        }
        return { blocked: false };
    }
    catch (error) {
        return { blocked: true };
    }
}
/**
 * Update statistics
 */
function updateStats(category, blocked) {
    stats.totalTests++;
    if (blocked) {
        stats.blocked++;
    }
    else {
        stats.allowed++;
    }
    const catStats = stats.byCategory.get(category) || { blocked: 0, allowed: 0 };
    if (blocked) {
        catStats.blocked++;
    }
    else {
        catStats.allowed++;
    }
    stats.byCategory.set(category, catStats);
}
/**
 * Setup test environment
 */
async function setup() {
    await fs.mkdir(TEST_DIR, { recursive: true });
    await fs.mkdir(ALLOWED_DIR, { recursive: true });
    // Create some test files that look like sensitive files but in allowed dir
    // These should STILL be blocked by pattern matching
    await fs.writeFile(path.join(ALLOWED_DIR, ".env"), "TEST_VAR=value");
    await fs.writeFile(path.join(ALLOWED_DIR, "config.json"), '{"key": "value"}');
    await fs.writeFile(path.join(ALLOWED_DIR, "secrets.json"), '{"secret": "data"}');
    await fs.writeFile(path.join(ALLOWED_DIR, "id_rsa"), "FAKE SSH KEY");
}
/**
 * Cleanup test environment
 */
async function cleanup() {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
}
/**
 * Print final statistics
 */
function printFinalStats() {
    console.log(`
${colors.blue}╔════════════════════════════════════════════════════════════════╗
║               SENSITIVE FILE TEST RESULTS                      ║
╚════════════════════════════════════════════════════════════════╝${colors.reset}
`);
    console.log(`Total Tests: ${stats.totalTests}`);
    console.log(`${colors.green}Blocked: ${stats.blocked}${colors.reset}`);
    console.log(`${colors.red}Allowed (Security Risk): ${stats.allowed}${colors.reset}`);
    const blockRate = stats.totalTests > 0 ? (stats.blocked / stats.totalTests) * 100 : 0;
    console.log(`Block Rate: ${blockRate.toFixed(2)}%`);
    console.log(`\n${colors.blue}Results by Category:${colors.reset}`);
    for (const [category, catStats] of stats.byCategory.entries()) {
        const total = catStats.blocked + catStats.allowed;
        const rate = total > 0 ? (catStats.blocked / total) * 100 : 0;
        const color = rate === 100 ? colors.green : colors.red;
        console.log(`  ${category}: ${color}${catStats.blocked}/${total} blocked (${rate.toFixed(1)}%)${colors.reset}`);
    }
    const status = stats.allowed === 0 ? `${colors.green}PASS` : `${colors.red}FAIL`;
    console.log(`\nStatus: ${status}${colors.reset}`);
    console.log("");
}
/**
 * Main sensitive file test execution
 */
async function runSensitiveFileTests() {
    console.log(`
${colors.blue}╔════════════════════════════════════════════════════════════════╗
║            SENSITIVE FILE ACCESS TESTS                         ║
║                     Shepherd-Gamma Approved                    ║
╚════════════════════════════════════════════════════════════════╝${colors.reset}
`);
    await setup();
    // Initialize SecureFileReader
    const pathValidator = new PathValidatorService(ALLOWED_DIR, [ALLOWED_DIR]);
    const rateLimiter = new RateLimiter(10000, 100000);
    const auditLogger = new MockAuditLogger();
    const reader = new SecureFileReader(pathValidator, rateLimiter, auditLogger, 1024 * 1024);
    // Get test cases
    const testCases = getSensitiveFileTestCases();
    console.log(`Testing ${testCases.length} sensitive file patterns\n`);
    // Print pattern counts
    console.log(`${colors.blue}Registered Security Patterns:${colors.reset}`);
    console.log(`  File patterns: ${SENSITIVE_PATTERNS.length}`);
    console.log(`  Directory patterns: ${SENSITIVE_DIRECTORIES.length}`);
    console.log("");
    // Test each case
    const failedCases = [];
    for (let i = 0; i < testCases.length; i++) {
        const { path: filePath, category, description } = testCases[i];
        const result = await testSensitiveFile(reader, filePath, category);
        updateStats(category, result.blocked);
        if (!result.blocked) {
            failedCases.push({ path: filePath, category, description });
            console.log(`${colors.red}[FAIL]${colors.reset} ${category}: ${description}`);
            console.log(`       Path: ${filePath}`);
        }
        // Progress indicator
        if ((i + 1) % 50 === 0) {
            process.stdout.write(`\r${colors.blue}Progress: ${i + 1}/${testCases.length} tests completed${colors.reset}`);
        }
    }
    console.log("\r" + " ".repeat(60) + "\r"); // Clear progress line
    printFinalStats();
    // Print failed cases if any
    if (failedCases.length > 0) {
        console.log(`${colors.red}\nCRITICAL: ${failedCases.length} sensitive file patterns were NOT blocked!${colors.reset}`);
        console.log(`${colors.red}These represent potential information disclosure vulnerabilities.${colors.reset}\n`);
        failedCases.forEach((f, i) => {
            console.log(`  ${i + 1}. [${f.category}] ${f.description}`);
            console.log(`     Path: ${f.path}`);
        });
        console.log("");
    }
    await cleanup();
    // Return exit code
    return stats.allowed === 0 ? 0 : 1;
}
// Run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    runSensitiveFileTests()
        .then((exitCode) => process.exit(exitCode))
        .catch((error) => {
        console.error(`${colors.red}Fatal error: ${error}${colors.reset}`);
        process.exit(1);
    });
}
export { runSensitiveFileTests, getSensitiveFileTestCases };
//# sourceMappingURL=sensitive-file-test.js.map