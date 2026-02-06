import { input, confirm, select, checkbox } from '@inquirer/prompts';
import chalk from 'chalk';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { updateUserConfig, getUserConfigPath, loadUserConfig, type UserConfig } from '../config.js';

interface SetupAnswers {
  folders: string[];
  customFolders: string[];
  autoOrganize: boolean;
  conflictStrategy: 'rename' | 'skip' | 'overwrite';
  generateClaudeConfig: boolean;
}

interface ClaudeDesktopConfig {
  mcpServers?: Record<string, {
    command: string;
    args: string[];
    env?: Record<string, string>;
  }>;
}

/**
 * Start the interactive setup wizard
 */
export async function startSetupWizard(): Promise<void> {
  console.clear();
  console.log(chalk.cyan.bold('╔════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('║     File Organizer MCP - Setup Wizard                  ║'));
  console.log(chalk.cyan.bold('╚════════════════════════════════════════════════════════╝'));
  console.log();
  console.log(chalk.gray('This wizard will help you configure the File Organizer MCP server.'));
  console.log();

  try {
    const answers = await promptUser();
    await applyConfiguration(answers);

    console.log();
    console.log(chalk.green.bold('✓ Setup complete!'));
    console.log();
    console.log(chalk.gray('You can re-run this wizard anytime with:'));
    console.log(chalk.cyan('  npx file-organizer-mcp --setup'));
  } catch (error) {
    console.error(chalk.red('Setup failed:'), (error as Error).message);
    process.exit(1);
  }
}

/**
 * Prompt user for configuration options
 */
async function promptUser(): Promise<SetupAnswers> {
  const home = os.homedir();

  // Predefined folder options
  const folderOptions = [
    { name: 'Desktop', value: path.join(home, 'Desktop') },
    { name: 'Downloads', value: path.join(home, 'Downloads') },
    { name: 'Documents', value: path.join(home, 'Documents') },
    { name: 'Pictures', value: path.join(home, 'Pictures') },
    { name: 'Videos', value: path.join(home, 'Videos') },
    { name: 'Music', value: path.join(home, 'Music') },
  ].filter(option => fs.existsSync(option.value));

  // Select folders to organize
  console.log(chalk.yellow.bold('📁 Step 1: Select folders to organize'));
  const selectedFolders = await checkbox({
    message: 'Choose folders to organize (Space to select, Enter to confirm):',
    choices: folderOptions.map(option => ({
      name: option.name,
      value: option.value,
      checked: ['Desktop', 'Downloads'].includes(option.name),
    })),
  });

  // Custom folders
  const customFolders: string[] = [];
  let addCustom = true;

  while (addCustom) {
    const addMore = await confirm({
      message: 'Would you like to add a custom folder path?',
      default: false,
    });

    if (!addMore) break;

    const customPath = await input({
      message: 'Enter the full path to the custom folder:',
      validate: (value) => {
        if (!value.trim()) return 'Please enter a path';
        if (!fs.existsSync(value)) return 'Path does not exist';
        if (!fs.statSync(value).isDirectory()) return 'Path is not a directory';
        return true;
      },
    });

    customFolders.push(customPath);
    console.log(chalk.green(`  Added: ${customPath}`));
  }

  // Auto-organize schedule
  console.log();
  console.log(chalk.yellow.bold('⏰ Step 2: Auto-organize schedule'));
  const autoOrganize = await confirm({
    message: 'Enable automatic organization on a schedule?',
    default: false,
  });

  // Conflict strategy
  console.log();
  console.log(chalk.yellow.bold('⚡ Step 3: Conflict resolution strategy'));
  console.log(chalk.gray('What should happen when a file with the same name already exists?'));

  const conflictStrategy = await select<'rename' | 'skip' | 'overwrite'>({
    message: 'Select conflict strategy:',
    choices: [
      {
        name: 'rename - Rename the new file (e.g., file (1).txt)',
        value: 'rename',
        description: 'Safest option - keeps all files',
      },
      {
        name: 'skip - Skip the file and keep the existing one',
        value: 'skip',
        description: 'Preserves existing files only',
      },
      {
        name: 'overwrite - Replace the existing file',
        value: 'overwrite',
        description: 'Use with caution - data loss risk',
      },
    ],
    default: 'rename',
  });

  // Claude Desktop config
  console.log();
  console.log(chalk.yellow.bold('🤖 Step 4: Claude Desktop integration'));
  const generateClaudeConfig = await confirm({
    message: 'Generate/update claude_desktop_config.json?',
    default: true,
  });

  return {
    folders: selectedFolders,
    customFolders,
    autoOrganize,
    conflictStrategy,
    generateClaudeConfig,
  };
}

/**
 * Apply the configuration based on user answers
 */
async function applyConfiguration(answers: SetupAnswers): Promise<void> {
  console.log();
  console.log(chalk.blue.bold('💾 Applying configuration...'));

  // Merge all folders
  const allFolders = [...answers.folders, ...answers.customFolders];

  // Update user config
  const configUpdate: Partial<UserConfig> = {
    customAllowedDirectories: allFolders,
    conflictStrategy: answers.conflictStrategy,
    autoOrganize: {
      enabled: answers.autoOrganize,
      schedule: answers.autoOrganize ? 'daily' : undefined,
    },
  };

  updateUserConfig(configUpdate);
  console.log(chalk.green(`  ✓ Saved configuration to ${getUserConfigPath()}`));

  // Generate Claude Desktop config if requested
  if (answers.generateClaudeConfig) {
    await generateClaudeDesktopConfig();
  }
}

/**
 * Generate or update Claude Desktop configuration
 */
async function generateClaudeDesktopConfig(): Promise<void> {
  const configDir = getClaudeConfigDir();
  const configPath = path.join(configDir, 'claude_desktop_config.json');

  let existingConfig: ClaudeDesktopConfig = {};

  // Read existing config if it exists
  if (fs.existsSync(configPath)) {
    try {
      const data = fs.readFileSync(configPath, 'utf-8');
      existingConfig = JSON.parse(data);
      console.log(chalk.gray(`  Found existing Claude Desktop config`));
    } catch {
      console.log(chalk.yellow(`  Warning: Could not parse existing config, creating new one`));
    }
  }

  // Build the MCP server entry
  const serverEntry = buildServerEntry();

  // Merge with existing config
  const newConfig: ClaudeDesktopConfig = {
    ...existingConfig,
    mcpServers: {
      ...existingConfig.mcpServers,
      'file-organizer': serverEntry,
    },
  };

  // Ensure directory exists
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Write config
  fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
  console.log(chalk.green(`  ✓ Updated Claude Desktop config at ${configPath}`));
}

/**
 * Get Claude Desktop config directory based on OS
 */
function getClaudeConfigDir(): string {
  const platform = os.platform();
  const home = os.homedir();

  if (platform === 'win32') {
    // Windows: %APPDATA%\Claude
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appData, 'Claude');
  } else if (platform === 'darwin') {
    // macOS: ~/Library/Application Support/Claude
    return path.join(home, 'Library', 'Application Support', 'Claude');
  } else {
    // Linux: ~/.config/Claude
    return path.join(home, '.config', 'Claude');
  }
}

/**
 * Build the server entry for Claude Desktop config
 */
function buildServerEntry(): { command: string; args: string[]; env?: Record<string, string> } {
  // Determine if running from npx or local
  const isNpx = process.argv[1]?.includes('npx') || false;

  if (isNpx || process.env.NODE_ENV === 'production') {
    // Production: use npx
    return {
      command: 'npx',
      args: ['-y', 'file-organizer-mcp'],
    };
  } else {
    // Development: use node directly
    return {
      command: 'node',
      args: [path.resolve(process.cwd(), 'dist/index.js')],
    };
  }
}
