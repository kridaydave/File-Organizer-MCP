#!/usr/bin/env node

/**
 * File Organizer MCP - Streamlined Setup Wizard
 *
 * User-friendly setup that:
 * 1. Auto-detects installed MCP clients
 * 2. Lets users select which clients to configure
 * 3. Auto-installs dependencies
 * 4. Configures everything with minimal user input
 */

import { input, confirm, select, checkbox, Separator } from "@inquirer/prompts";
import { fileURLToPath } from "url";
import chalk from "chalk";
import os from "os";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import {
  updateUserConfig,
  getUserConfigPath,
  loadUserConfig,
  type UserConfig,
} from "../config.js";
import {
  detectMCPClients,
  writeClientConfig,
  type MCPClient,
} from "./client-detector.js";
import { validateStrictPath } from "../services/path-validator.service.js";

/**
 * Robustly find the package root by searching upward for package.json
 * Uses import.meta.dirname if available (Node 20.11+), falls back to fileURLToPath
 */
function findPackageRoot(): string {
  // Use import.meta.dirname if available (Node 20.11+)
  const currentDir =
    (import.meta as { dirname?: string }).dirname ??
    path.dirname(fileURLToPath(import.meta.url));

  // Search upward for package.json
  let dir = currentDir;
  const maxIterations = 10; // Prevent infinite loop

  for (let i = 0; i < maxIterations; i++) {
    const packageJsonPath = path.join(dir, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      try {
        const content = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
        if (content.name === "file-organizer-mcp") {
          return dir;
        }
      } catch {
        // Continue searching if JSON parsing fails
      }
    }
    const parentDir = path.dirname(dir);
    if (parentDir === dir) {
      break;
    }
    dir = parentDir;
  }

  // Fallback to the old method with validation
  const fallbackRoot = path.resolve(currentDir, "..", "..", "..");
  if (fs.existsSync(path.join(fallbackRoot, "package.json"))) {
    return fallbackRoot;
  }

  throw new Error(
    "Could not find package root. Please ensure package.json exists.",
  );
}

interface SetupAnswers {
  folders: string[];
  customFolders: string[];
  conflictStrategy: "rename" | "skip" | "overwrite";
  selectedClients: string[];
}

// Color scheme for better UX
const colors = {
  primary: chalk.cyan,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  info: chalk.blue,
  muted: chalk.gray,
  bold: chalk.bold,
};

/**
 * Print the welcome banner
 */
function printWelcomeBanner(): void {
  console.clear();
  console.log(
    colors.primary.bold(
      "╔════════════════════════════════════════════════════════════════╗",
    ),
  );
  console.log(
    colors.primary.bold(
      "║                                                                ║",
    ),
  );
  console.log(
    colors.primary.bold(
      "║              🗂️  File Organizer MCP Server                    ║",
    ),
  );
  console.log(
    colors.primary.bold(
      "║                                                                ║",
    ),
  );
  console.log(
    colors.primary.bold(
      "║     Organize your files automatically with AI assistance       ║",
    ),
  );
  console.log(
    colors.primary.bold(
      "║                                                                ║",
    ),
  );
  console.log(
    colors.primary.bold(
      "╚════════════════════════════════════════════════════════════════╝",
    ),
  );
  console.log();
}

/**
 * Print a section header
 */
function printSection(title: string, icon: string = ""): void {
  console.log();
  console.log(colors.warning.bold(`${icon} ${title}`));
  console.log(colors.muted("─".repeat(60)));
}

/**
 * Print a success message
 */
function printSuccess(message: string): void {
  console.log(colors.success(`  ✓ ${message}`));
}

/**
 * Print an info message
 */
function printInfo(message: string): void {
  console.log(colors.info(`  ℹ ${message}`));
}

/**
 * Print a step indicator
 */
function printStep(step: number, total: number, message: string): void {
  console.log();
  console.log(colors.primary.bold(`Step ${step}/${total}: ${message}`));
}

/**
 * Get the package root directory with robust fallback and validation
 */
function getPackageRoot(): string {
  try {
    const root = findPackageRoot();
    if (fs.existsSync(path.join(root, "package.json"))) {
      return root;
    }
  } catch {
    // Fall through to fallback
  }

  // Fallback to process.cwd() if findPackageRoot fails
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "package.json"))) {
    return cwd;
  }

  throw new Error(
    "Could not determine package root. Please run this script from the package directory.",
  );
}

/**
 * Check if dependencies are installed
 * Returns true if dependencies exist, false if npm install needed
 */
function checkDependencies(): boolean {
  const packageRoot = getPackageRoot();
  const nodeModulesPath = path.join(packageRoot, "node_modules");

  const criticalDeps = ["@modelcontextprotocol/sdk", "chalk", "node-cron"];

  for (const dep of criticalDeps) {
    const depPath = path.join(nodeModulesPath, dep);
    try {
      if (!fs.existsSync(depPath)) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Install dependencies
 */
async function installDependencies(): Promise<boolean> {
  const packageRoot = getPackageRoot();

  printInfo("Installing dependencies (this may take a minute)...");

  try {
    execSync("npm install", {
      cwd: packageRoot,
      stdio: "inherit",
      timeout: 120000,
    });
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(colors.error(`  ✗ Install failed: ${errorMessage}`));
    return false;
  }
}

/**
 * Check and install if TypeScript build is needed
 */
async function ensureBuild(): Promise<boolean> {
  const packageRoot = getPackageRoot();
  const distPath = path.join(packageRoot, "dist", "src", "index.js");

  try {
    if (fs.existsSync(distPath)) {
      return true;
    }
  } catch {
    // Permission error - will try to build
  }

  printInfo("Building the application...");

  try {
    execSync("npm run build", {
      cwd: packageRoot,
      stdio: "inherit",
      timeout: 120000,
    });
    return fs.existsSync(distPath);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(colors.error(`  ✗ Build failed: ${errorMessage}`));
    console.log();
    console.log(colors.info("Please try running manually:"));
    console.log(colors.primary("  npm run build"));
    console.log();
    console.log(colors.info("Or install dependencies first:"));
    console.log(colors.primary("  npm install"));
    return false;
  }
}

/**
 * Start the interactive setup wizard
 */
export async function startSetupWizard(): Promise<void> {
  printWelcomeBanner();

  // Step 0: Check and install dependencies
  printStep(0, 4, "Checking installation...");

  if (!checkDependencies()) {
    printInfo("Some dependencies are missing. Installing now...");
    const depsInstalled = await installDependencies();
    if (!depsInstalled) {
      console.log(
        colors.error("\n✗ Failed to install dependencies. Please try:"),
      );
      console.log(colors.info("  npm install"));
      process.exit(1);
    }
    printSuccess("Dependencies installed!");
  }

  // Ensure the app is built
  const built = await ensureBuild();
  if (!built) {
    process.exit(1);
  }

  try {
    const answers = await promptUser();
    await applyConfiguration(answers);

    printWelcomeBanner();
    console.log(colors.success.bold("🎉 Setup Complete!"));
    console.log();
    console.log(colors.muted("Your file organizer is ready to use. You can:"));
    console.log();
    console.log(colors.info("  1. Open your AI client (Claude, Cursor, etc.)"));
    console.log(colors.info('  2. Try saying: "Organize my Downloads folder"'));
    console.log(colors.info('  3. Or: "Find duplicate files in my Documents"'));
    console.log();
    console.log(colors.muted("To re-run this setup anytime:"));
    console.log(colors.primary("  npx file-organizer-mcp --setup"));
    console.log();
  } catch (error) {
    if ((error as Error).message.includes("User force closed")) {
      console.log(
        colors.muted("\n\nSetup cancelled. You can re-run it anytime."),
      );
      process.exit(0);
    }
    console.error(colors.error("\n✗ Setup failed:"), (error as Error).message);
    process.exit(1);
  }
}

/**
 * Detect and display MCP clients
 */
async function detectAndSelectClients(): Promise<string[]> {
  printSection("Detecting AI Clients", "🤖");

  printInfo("Scanning for installed MCP-compatible clients...");
  const detection = detectMCPClients();

  const installedClients = detection.clients.filter((c) => c.installed);
  const availableClients = detection.clients.filter((c) => !c.installed);

  if (installedClients.length === 0) {
    console.log(colors.warning("\n  No MCP clients detected on your system."));
    console.log(
      colors.muted("\n  Don't worry! You can still use the file organizer."),
    );
    console.log(colors.muted("  Popular options:"));
    console.log(
      colors.info("    • Claude Desktop - https://claude.ai/download"),
    );
    console.log(colors.info("    • Cursor - https://cursor.com"));
    console.log(colors.info("    • Cline (VS Code extension)"));
    return [];
  }

  console.log();
  console.log(colors.success(`  Found ${installedClients.length} client(s):`));

  for (const client of installedClients) {
    console.log(colors.success(`    ${client.icon} ${client.name}`));
  }

  console.log();
  try {
    const selectedClients = await checkbox({
      message:
        "Select which clients to configure (Space to select, Enter to confirm):",
      choices: installedClients.map((client) => ({
        name: `${client.icon} ${client.name}`,
        value: client.id,
        description: client.description,
        checked: true,
      })),
    });

    return selectedClients;
  } catch (error) {
    if ((error as Error).message.includes("User force closed")) {
      throw error;
    }
    return [];
  }
}

/**
 * Prompt user for configuration options
 */
async function promptUser(): Promise<SetupAnswers> {
  const home = os.homedir();

  // Step 1: Select folders to organize
  printStep(1, 4, "Choose folders to organize");

  // Predefined folder options - only show existing ones
  const folderOptions: { name: string; value: string }[] = [];
  const standardFolders = [
    "Desktop",
    "Downloads",
    "Documents",
    "Pictures",
    "Videos",
    "Music",
  ];

  for (const folder of standardFolders) {
    const folderPath = path.join(home, folder);
    try {
      if (fs.existsSync(folderPath)) {
        folderOptions.push({ name: folder, value: folderPath });
      }
    } catch {
      // Skip folders we can't access
    }
  }

  if (folderOptions.length === 0) {
    console.log(
      colors.warning(
        "  No standard folders found. You can add custom folders.",
      ),
    );
  }

  let selectedFolders: string[] = [];
  try {
    selectedFolders = await checkbox({
      message: "Select folders to organize:",
      choices: folderOptions.map((option) => ({
        name: option.name,
        value: option.value,
        checked: ["Desktop", "Downloads"].includes(option.name),
      })),
    });
  } catch (error) {
    if ((error as Error).message.includes("User force closed")) {
      throw error;
    }
    selectedFolders = [];
  }

  // Custom folders
  const customFolders: string[] = [];

  while (true) {
    const addMore = await confirm({
      message: "Add a custom folder?",
      default: false,
    });

    if (!addMore) break;

    const customPath = await input({
      message: "Enter the full folder path:",
      validate: (value) => {
        if (!value.trim()) return "Please enter a path";
        try {
          if (!fs.existsSync(value)) return "Path does not exist";
          if (!fs.statSync(value).isDirectory()) return "Path is not a folder";
        } catch {
          return "Cannot access path - permission denied or inaccessible";
        }
        return true;
      },
    });

    // Security validation for custom paths
    try {
      await validateStrictPath(customPath);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Security validation failed";
      console.log(colors.error(`  ✗ Security check failed: ${message}`));
      console.log(
        colors.warning("  This path is not allowed for security reasons."),
      );
      continue;
    }

    customFolders.push(customPath);
    printSuccess(`Added: ${customPath}`);
  }

  // Step 2: Conflict strategy (simplified)
  printStep(2, 4, "Choose how to handle duplicate files");

  console.log(
    colors.muted("\n  What happens when a file with the same name exists?"),
  );

  const conflictStrategy = await select<"rename" | "skip" | "overwrite">({
    message: "Select option:",
    choices: [
      {
        name: "Rename the new file (safest)",
        value: "rename",
        description: 'Example: file.txt becomes "file (1).txt"',
      },
      {
        name: "Skip the new file",
        value: "skip",
        description: "Keep the existing file only",
      },
      {
        name: "Overwrite the existing file",
        value: "overwrite",
        description: "Replaces old file (backup created automatically)",
      },
    ],
    default: "rename",
  });

  // Step 3: Detect and select MCP clients
  const selectedClients = await detectAndSelectClients();

  // Step 4: Review
  printStep(4, 4, "Review your settings");

  const allFolders = [...selectedFolders, ...customFolders];

  console.log();
  console.log(colors.muted("Folders to organize:"));
  if (allFolders.length > 0) {
    allFolders.forEach((f) => console.log(colors.info(`  • ${f}`)));
  } else {
    console.log(colors.warning("  (none selected - will use defaults)"));
  }

  console.log();
  console.log(colors.muted("Conflict strategy:"));
  console.log(
    colors.info(
      `  ${conflictStrategy === "rename" ? "✨ Rename new files" : conflictStrategy === "skip" ? "⏭️ Skip duplicates" : "📝 Overwrite existing"}`,
    ),
  );

  console.log();
  console.log(colors.muted("AI clients to configure:"));
  if (selectedClients.length > 0) {
    selectedClients.forEach((c) => console.log(colors.info(`  • ${c}`)));
  } else {
    console.log(colors.warning("  (none selected)"));
  }

  const confirmed = await confirm({
    message: "\nSave these settings?",
    default: true,
  });

  if (!confirmed) {
    throw new Error("Setup cancelled by user");
  }

  return {
    folders: selectedFolders,
    customFolders,
    conflictStrategy,
    selectedClients,
  };
}

/**
 * Apply the configuration based on user answers
 */
async function applyConfiguration(answers: SetupAnswers): Promise<void> {
  console.log();
  printSection("Saving configuration...", "💾");

  // Merge all folders
  const allFolders = [...answers.folders, ...answers.customFolders];

  // Update user config
  const configUpdate: Partial<UserConfig> = {
    customAllowedDirectories: allFolders,
    conflictStrategy: answers.conflictStrategy,
  };

  const configSaved = updateUserConfig(configUpdate);
  if (!configSaved) {
    throw new Error(`Failed to save configuration to ${getUserConfigPath()}`);
  }
  printSuccess(`Settings saved to ${getUserConfigPath()}`);

  // Configure selected clients
  if (answers.selectedClients.length > 0) {
    printSection("Configuring AI clients...", "🤖");

    const detection = detectMCPClients();

    for (const clientId of answers.selectedClients) {
      const client = detection.clients.find((c) => c.id === clientId);
      if (client) {
        const result = await writeClientConfig(client);
        if (result.success) {
          printSuccess(`${client.icon} ${client.name} configured`);
        } else {
          console.log(colors.error(`  ✗ ${client.name}: ${result.message}`));
        }
      }
    }
  }
}

export default {
  startSetupWizard,
};
