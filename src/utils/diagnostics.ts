/**
 * File Organizer MCP - Diagnostic Tool
 * Comprehensive health checks for installation and configuration
 */

import os from "os";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import {
  CONFIG,
  loadUserConfig,
  getUserConfigPath,
  UserConfig,
} from "../config.js";

// ANSI color helper for CLI diagnostic output
const chalk = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
  bold: {
    cyan: (s: string) => `\x1b[1m\x1b[36m${s}\x1b[0m`,
    green: (s: string) => `\x1b[1m\x1b[32m${s}\x1b[0m`,
    red: (s: string) => `\x1b[1m\x1b[31m${s}\x1b[0m`,
  },
};

export interface DiagnosticResult {
  name: string;
  success: boolean;
  message: string;
  fix?: string;
  details?: string[];
}

export interface DiagnosticSummary {
  passed: number;
  failed: number;
  warnings: number;
  results: DiagnosticResult[];
}

/**
 * Run all diagnostic checks
 */
export async function runDiagnostics(): Promise<DiagnosticSummary> {
  console.log(chalk.bold.cyan("\n🔍 File Organizer MCP - Diagnostics\n"));
  console.log(chalk.gray("Running comprehensive health checks...\n"));

  const results: DiagnosticResult[] = [];

  // Run all diagnostic checks
  const checks = [
    checkNodeVersion,
    checkPackageInstallation,
    checkConfigFile,
    checkDirectoryPermissions,
    checkWSLStatus,
    checkClaudeDesktopConfig,
    checkAutoOrganizeScheduler,
    checkFileSystemPermissions,
  ];

  for (const check of checks) {
    const result = await check();
    results.push(result);
    printResult(result);

    // Add newline after each result for better readability
    console.log("");
  }

  // Calculate summary
  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const warnings = results.filter((r) => r.message.includes("⚠")).length;

  const summary: DiagnosticSummary = { passed, failed, warnings, results };

  printSummary(summary);

  return summary;
}

/**
 * Print a single diagnostic result
 */
function printResult(result: DiagnosticResult): void {
  const icon = result.success ? chalk.green("✓") : chalk.red("✗");
  const name = result.name.padEnd(30);

  console.log(`  ${icon} ${name} ${result.message}`);

  if (result.details && result.details.length > 0) {
    result.details.forEach((detail) => {
      console.log(`      ${chalk.gray(detail)}`);
    });
  }

  if (!result.success && result.fix) {
    console.log(`      ${chalk.yellow("💡 Fix:")} ${result.fix}`);
  }
}

/**
 * Print diagnostic summary
 */
function printSummary(summary: DiagnosticSummary): void {
  console.log(
    "\n" +
      chalk.bold.cyan(
        "═══════════════════════════════════════════════════════════",
      ),
  );
  console.log(chalk.bold.cyan("  Summary"));
  console.log(
    chalk.bold.cyan(
      "═══════════════════════════════════════════════════════════\n",
    ),
  );

  const total = summary.results.length;

  if (summary.failed === 0) {
    console.log(chalk.bold.green(`  ✓ All ${total} checks passed!`));
    console.log(
      chalk.gray("\n  Your File Organizer MCP installation is healthy."),
    );
    console.log(chalk.gray("  You can start using it with Claude Desktop.\n"));
  } else {
    console.log(
      `  ${chalk.green(`${summary.passed} passed`)}, ${chalk.red(`${summary.failed} failed`)} out of ${total} checks`,
    );

    if (summary.warnings > 0) {
      console.log(`  ${chalk.yellow(`${summary.warnings} warnings`)}`);
    }

    console.log(
      chalk.yellow(
        "\n  ⚠️  Some checks failed. Please review the issues above.",
      ),
    );
    console.log(chalk.gray("\n  To fix configuration issues:"));
    console.log(chalk.cyan("    npx file-organizer-mcp --setup\n"));
  }
}

/**
 * Check 1: Node.js version compatibility
 */
async function checkNodeVersion(): Promise<DiagnosticResult> {
  const currentVersion = process.versions.node ?? "0.0.0";
  const versionParts = currentVersion.split(".");
  const majorVersion = parseInt(versionParts[0] ?? "0", 10);
  const minVersion = 18;

  if (majorVersion >= minVersion) {
    return {
      name: "Node.js Version",
      success: true,
      message: `${currentVersion} (✓ meets requirement of ${minVersion}+)`,
    };
  }

  return {
    name: "Node.js Version",
    success: false,
    message: `${currentVersion} (✗ requires ${minVersion}+)`,
    fix: `Upgrade Node.js to version ${minVersion} or higher from https://nodejs.org/`,
  };
}

/**
 * Check 2: Package installation integrity
 */
async function checkPackageInstallation(): Promise<DiagnosticResult> {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const distPath = path.resolve(__dirname, "..", "..", "dist");
    const indexPath = path.join(distPath, "src", "index.js");

    if (!fs.existsSync(distPath)) {
      return {
        name: "Package Installation",
        success: false,
        message: "dist/ directory not found",
        fix: "Run: npm run build",
        details: [`Expected: ${distPath}`],
      };
    }

    if (!fs.existsSync(indexPath)) {
      return {
        name: "Package Installation",
        success: false,
        message: "Main entry point missing",
        fix: "Run: npm run build",
        details: [`Expected: ${indexPath}`],
      };
    }

    // Check key files exist
    const requiredFiles = [
      "src/index.js",
      "src/server.js",
      "src/config.js",
      "src/utils/logger.js",
      "src/tui/setup-wizard.js",
    ];

    const missingFiles = requiredFiles.filter((file) => {
      return !fs.existsSync(path.join(distPath, file));
    });

    if (missingFiles.length > 0) {
      return {
        name: "Package Installation",
        success: false,
        message: `${missingFiles.length} required files missing`,
        fix: "Run: npm run build to rebuild the package",
        details: missingFiles.map((f) => `Missing: ${f}`),
      };
    }

    return {
      name: "Package Installation",
      success: true,
      message: "✓ All required files present",
      details: [`Location: ${distPath}`],
    };
  } catch (error) {
    return {
      name: "Package Installation",
      success: false,
      message: `Error checking installation: ${(error as Error).message}`,
      fix: "Try reinstalling: npm install -g file-organizer-mcp",
    };
  }
}

/**
 * Check 3: Configuration file validity
 */
async function checkConfigFile(): Promise<DiagnosticResult> {
  const configPath = getUserConfigPath();

  try {
    // Check if config file exists
    if (!fs.existsSync(configPath)) {
      return {
        name: "Configuration File",
        success: true,
        message: "⚠ No config file (will use defaults)",
        details: [`Path: ${configPath}`],
      };
    }

    // Try to read and parse
    // SECURITY: configPath is determined by getUserConfigPath() - an internal path, NOT user-provided input
    // This reads the application config file (not external/user data), and readFileSync is appropriate
    // for synchronous diagnostic checking during startup/validation
    const configData = fs.readFileSync(configPath, "utf-8");

    if (!configData.trim()) {
      return {
        name: "Configuration File",
        success: false,
        message: "Config file is empty",
        fix: "Run: npx file-organizer-mcp --setup",
        details: [`Path: ${configPath}`],
      };
    }

    // Validate JSON
    let config: UserConfig;
    try {
      config = JSON.parse(configData) as UserConfig;
    } catch (parseError) {
      return {
        name: "Configuration File",
        success: false,
        message: "Invalid JSON syntax",
        fix: "Delete corrupted config and run setup wizard",
        details: [
          `Path: ${configPath}`,
          `Error: ${(parseError as Error).message}`,
        ],
      };
    }

    // Validate schema
    const issues: string[] = [];

    if (
      config.customAllowedDirectories !== undefined &&
      !Array.isArray(config.customAllowedDirectories)
    ) {
      issues.push("customAllowedDirectories must be an array");
    }

    if (
      config.conflictStrategy !== undefined &&
      !["rename", "skip", "overwrite"].includes(config.conflictStrategy)
    ) {
      issues.push(`Invalid conflictStrategy: ${config.conflictStrategy}`);
    }

    if (
      config.autoOrganize !== undefined &&
      typeof config.autoOrganize !== "object"
    ) {
      issues.push("autoOrganize must be an object");
    }

    if (issues.length > 0) {
      return {
        name: "Configuration File",
        success: false,
        message: `${issues.length} schema validation errors`,
        fix: "Run: npx file-organizer-mcp --setup",
        details: [`Path: ${configPath}`, ...issues],
      };
    }

    // Count custom directories
    const customDirCount = config.customAllowedDirectories?.length || 0;

    return {
      name: "Configuration File",
      success: true,
      message: `✓ Valid (${customDirCount} custom directories)`,
      details: [`Path: ${configPath}`],
    };
  } catch (error) {
    return {
      name: "Configuration File",
      success: false,
      message: `Error reading config: ${(error as Error).message}`,
      fix: "Check file permissions or delete and recreate config",
      details: [`Path: ${configPath}`],
    };
  }
}

/**
 * Check 4: Directory permissions for allowed directories
 */
async function checkDirectoryPermissions(): Promise<DiagnosticResult> {
  const issues: string[] = [];
  const checkedDirs: string[] = [];

  // Check default allowed directories
  const defaultDirs = CONFIG.paths.defaultAllowed;
  const customDirs = CONFIG.paths.customAllowed;

  // Check a sample of directories (first 3 default + all custom)
  const dirsToCheck = [...defaultDirs.slice(0, 3), ...customDirs];

  for (const dir of dirsToCheck) {
    try {
      if (!fs.existsSync(dir)) {
        issues.push(`Directory does not exist: ${dir}`);
        continue;
      }

      const stats = fs.statSync(dir);
      if (!stats.isDirectory()) {
        issues.push(`Not a directory: ${dir}`);
        continue;
      }

      // Try to read directory
      fs.readdirSync(dir);
      checkedDirs.push(dir);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EACCES" || code === "EPERM") {
        issues.push(`Permission denied: ${dir}`);
      } else {
        issues.push(`Access error (${code}): ${dir}`);
      }
    }
  }

  if (issues.length > 0) {
    return {
      name: "Directory Permissions",
      success: false,
      message: `${issues.length} permission issues`,
      fix: "Check directory permissions or remove inaccessible directories from config",
      details: issues.slice(0, 5), // Show first 5 issues
    };
  }

  return {
    name: "Directory Permissions",
    success: true,
    message: `✓ All ${checkedDirs.length} directories accessible`,
    details:
      checkedDirs.length > 0
        ? [
            checkedDirs[0] +
              (checkedDirs.length > 1
                ? ` and ${checkedDirs.length - 1} others`
                : ""),
          ]
        : undefined,
  };
}

/**
 * Check 5: WSL environment status
 */
async function checkWSLStatus(): Promise<DiagnosticResult> {
  const isWSL = !!(
    process.env.WSL_DISTRO_NAME ||
    process.env.WSL_INTEROP ||
    os.release().toLowerCase().includes("microsoft")
  );

  if (isWSL) {
    return {
      name: "WSL Environment",
      success: true,
      message: "⚠ Running in WSL",
      details: [
        "WSL detected - paths will be converted for Windows compatibility",
        `Distro: ${process.env.WSL_DISTRO_NAME || "Unknown"}`,
      ],
    };
  }

  const platform = os.platform();
  const platformNames: Record<string, string> = {
    win32: "Windows",
    darwin: "macOS",
    linux: "Linux",
  };

  return {
    name: "WSL Environment",
    success: true,
    message: `✓ Native ${platformNames[platform] || platform}`,
  };
}

/**
 * Check 6: Claude Desktop configuration
 */
async function checkClaudeDesktopConfig(): Promise<DiagnosticResult> {
  try {
    // Get Claude Desktop config path
    const platform = os.platform();
    const home = os.homedir();
    let configDir: string;

    if (platform === "win32") {
      const appData =
        process.env.APPDATA || path.join(home, "AppData", "Roaming");
      configDir = path.join(appData, "Claude");
    } else if (platform === "darwin") {
      configDir = path.join(home, "Library", "Application Support", "Claude");
    } else {
      configDir = path.join(home, ".config", "Claude");
    }

    const configPath = path.join(configDir, "claude_desktop_config.json");

    if (!fs.existsSync(configPath)) {
      return {
        name: "Claude Desktop Config",
        success: true,
        message: "⚠ Not configured (optional)",
        details: [
          `Config path: ${configPath}`,
          "Run setup wizard to configure: npx file-organizer-mcp --setup",
        ],
      };
    }

    // Try to read and parse
    // SECURITY: configPath is determined by getUserConfigPath() - an internal path, NOT user-provided input
    // This reads the application config file (not external/user data), and readFileSync is appropriate
    // for synchronous diagnostic checking during startup/validation
    const configData = fs.readFileSync(configPath, "utf-8");
    let config: Record<string, unknown>;

    try {
      config = JSON.parse(configData) as Record<string, unknown>;
    } catch (parseError) {
      return {
        name: "Claude Desktop Config",
        success: false,
        message: "Invalid JSON in Claude config",
        fix: "Fix or delete the Claude Desktop config file",
        details: [
          `Path: ${configPath}`,
          `Error: ${(parseError as Error).message}`,
        ],
      };
    }

    // Check if file-organizer is configured
    const mcpServers = (config.mcpServers ?? {}) as Record<
      string,
      { command?: string; args?: string[] }
    >;
    const fileOrganizerConfig = mcpServers["file-organizer"];

    if (!fileOrganizerConfig) {
      return {
        name: "Claude Desktop Config",
        success: true,
        message: "⚠ Claude config exists but file-organizer not added",
        details: [
          `Path: ${configPath}`,
          "Run setup wizard to add file-organizer to Claude: npx file-organizer-mcp --setup",
        ],
      };
    }

    // Validate file-organizer config
    const issues: string[] = [];

    if (!fileOrganizerConfig.command) {
      issues.push('Missing "command" field');
    }

    if (!fileOrganizerConfig.args || !Array.isArray(fileOrganizerConfig.args)) {
      issues.push('Missing or invalid "args" field');
    }

    if (issues.length > 0) {
      return {
        name: "Claude Desktop Config",
        success: false,
        message: "Incomplete file-organizer configuration",
        fix: "Run setup wizard to regenerate config: npx file-organizer-mcp --setup",
        details: [`Path: ${configPath}`, ...issues],
      };
    }

    return {
      name: "Claude Desktop Config",
      success: true,
      message: "✓ Properly configured",
      details: [
        `Path: ${configPath}`,
        `Command: ${fileOrganizerConfig.command}`,
      ],
    };
  } catch (error) {
    return {
      name: "Claude Desktop Config",
      success: false,
      message: `Error checking config: ${(error as Error).message}`,
      fix: "Check file permissions or run setup wizard",
    };
  }
}

/**
 * Check 7: Watch configuration
 *
 * The scheduler runs as its own process (file-organizer-watch); diagnostics
 * only inspects the shared config, never the watcher itself.
 */
async function checkAutoOrganizeScheduler(): Promise<DiagnosticResult> {
  try {
    const config = loadUserConfig();
    const watchList = config.watchList ?? [];

    if (watchList.length === 0) {
      return {
        name: "Watch Configuration",
        success: true,
        message: "⚠ No directories configured",
        details: [
          "Scheduled organization is not configured",
          'Add a watch: file-organizer-watch add <directory> "<cron>"',
        ],
      };
    }

    return {
      name: "Watch Configuration",
      success: true,
      message: `✓ Configured (${watchList.length} task${watchList.length !== 1 ? "s" : ""})`,
      details: [
        `Watching: ${watchList.map((w) => w.directory).join(", ")}`,
        "Start the watcher: file-organizer-watch",
      ],
    };
  } catch (error) {
    return {
      name: "Watch Configuration",
      success: false,
      message: `Error checking watch config: ${(error as Error).message}`,
      fix: "Check the config file or re-run setup",
    };
  }
}

/**
 * Check 8: File system write permissions
 */
async function checkFileSystemPermissions(): Promise<DiagnosticResult> {
  const issues: string[] = [];
  const testDirs = [os.tmpdir()];

  // Add config directory to test
  try {
    const configDir = path.dirname(getUserConfigPath());
    testDirs.push(configDir);
  } catch {
    // Config directory may not exist yet - not critical for write test
  }

  for (const dir of testDirs) {
    try {
      if (!fs.existsSync(dir)) {
        issues.push(`Directory does not exist: ${dir}`);
        continue;
      }

      // Try to create a temporary file
      const testFile = path.join(dir, `.file-organizer-test-${Date.now()}`);
      fs.writeFileSync(testFile, "test");
      fs.unlinkSync(testFile);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EACCES" || code === "EPERM") {
        issues.push(`Write permission denied: ${dir}`);
      } else if (code === "ENOSPC") {
        issues.push(`No disk space: ${dir}`);
      } else {
        issues.push(`Write error (${code}): ${dir}`);
      }
    }
  }

  if (issues.length > 0) {
    return {
      name: "File System Permissions",
      success: false,
      message: `${issues.length} write permission issues`,
      fix: "Check directory permissions and disk space",
      details: issues,
    };
  }

  return {
    name: "File System Permissions",
    success: true,
    message: "✓ Write access confirmed",
  };
}

