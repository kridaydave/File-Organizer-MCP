/**
 * File Organizer MCP Server Configuration
 * Secure defaults with platform-aware directory access
 */

import os from 'os';
import path from 'path';
import fs from 'fs';

export const CONFIG = {
    VERSION: '3.0.0',

    // Security Settings
    security: {
        enablePathValidation: true,
        allowCustomDirectories: true,
        logAccess: true,
        maxScanDepth: 10,
        maxFilesPerOperation: 10000,
    },

    // Path Access Control
    paths: {
        defaultAllowed: getDefaultAllowedDirs(),
        customAllowed: loadCustomAllowedDirs(),
        alwaysBlocked: getAlwaysBlockedPatterns(),
    },
};

/**
 * Get default allowed directories based on platform
 */
function getDefaultAllowedDirs(): string[] {
    const platform = os.platform();
    const home = os.homedir();

    let commonDirs = [
        path.join(home, 'Desktop'),
        path.join(home, 'Documents'),
        path.join(home, 'Downloads'),
        path.join(home, 'Pictures'),
        path.join(home, 'Videos'),
        path.join(home, 'Music'),
    ];

    // Add common project directories if they exist
    const projectDirs = [
        path.join(home, 'Projects'),
        path.join(home, 'Workspace'),
        path.join(home, 'workspace'),
        path.join(home, 'Development'),
        path.join(home, 'Code'),
    ];

    commonDirs = [...commonDirs, ...projectDirs];

    // Platform-specific additions
    if (platform === 'win32') {
        // Windows: Add OneDrive if it exists
        const oneDrive = process.env.OneDrive || process.env.OneDriveConsumer;
        if (oneDrive) commonDirs.push(oneDrive);
    } else if (platform === 'darwin') {
        // macOS: Add iCloud Drive if it exists
        const iCloudDrive = path.join(
            home,
            'Library',
            'Mobile Documents',
            'com~apple~CloudDocs'
        );
        commonDirs.push(iCloudDrive);

        // Add common macOS locations
        commonDirs.push(path.join(home, 'Movies'));
    } else if (platform === 'linux') {
        // Linux: Add common development directories
        commonDirs.push(path.join(home, 'dev'));
    }

    // Only return directories that actually exist
    return commonDirs.filter((dir) => {
        try {
            return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
        } catch {
            return false;
        }
    });
}

/**
 * Load custom allowed directories from user config file
 */
function loadCustomAllowedDirs(): string[] {
    try {
        const configPath = getUserConfigPath();

        if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, 'utf-8');
            const config = JSON.parse(configData);

            if (Array.isArray(config.customAllowedDirectories)) {
                // Validate that custom directories exist
                return config.customAllowedDirectories.filter((dir: string) => {
                    try {
                        return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
                    } catch {
                        console.error(`Warning: Custom directory does not exist: ${dir}`);
                        return false;
                    }
                });
            }
        }
    } catch (error) {
        console.error('Error loading custom config:', (error as Error).message);
    }

    return [];
}

/**
 * Get path to user config file
 */
function getUserConfigPath(): string {
    const platform = os.platform();
    const home = os.homedir();

    if (platform === 'win32') {
        // Windows: %APPDATA%\file-organizer-mcp\config.json
        const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
        return path.join(appData, 'file-organizer-mcp', 'config.json');
    } else if (platform === 'darwin') {
        // macOS: ~/Library/Application Support/file-organizer-mcp/config.json
        return path.join(home, 'Library', 'Application Support', 'file-organizer-mcp', 'config.json');
    } else {
        // Linux: ~/.config/file-organizer-mcp/config.json
        return path.join(home, '.config', 'file-organizer-mcp', 'config.json');
    }
}

/**
 * Get always-blocked path patterns
 */
function getAlwaysBlockedPatterns(): RegExp[] {
    const platform = os.platform();

    // Common patterns across all platforms
    const common = [
        /node_modules/i,
        /\.git[\/\\]/i,
        /\.vscode[\/\\]/i,
        /\.idea[\/\\]/i,
        /\.next[\/\\]/i,
        /dist[\/\\]/i,
        /build[\/\\]/i,
    ];

    if (platform === 'win32') {
        return [
            ...common,
            /^[A-Z]:[\/\\]Windows[\/\\]/i,
            /^[A-Z]:[\/\\]Program Files[\/\\]/i,
            /^[A-Z]:[\/\\]Program Files \(x86\)[\/\\]/i,
            /^[A-Z]:[\/\\]ProgramData[\/\\]/i,
            /[\/\\]AppData[\/\\]/i,
            /^[A-Z]:[\/\\]\$Recycle\.Bin[\/\\]/i,
            /^[A-Z]:[\/\\]System Volume Information[\/\\]/i,
        ];
    } else if (platform === 'darwin') {
        return [
            ...common,
            /^\/System[\/]/,
            /^\/Library[\/]/,
            /^\/Applications[\/]/,
            /^\/private[\/]/,
            /^\/usr[\/]/,
            /^\/bin[\/]/,
            /^\/sbin[\/]/,
            /^\/opt[\/]/,
            /\/Library\/Application Support[\/]/,
        ];
    } else {
        return [
            ...common,
            /^\/etc[\/]/,
            /^\/usr[\/]/,
            /^\/bin[\/]/,
            /^\/sbin[\/]/,
            /^\/sys[\/]/,
            /^\/proc[\/]/,
            /^\/root[\/]/,
            /^\/var[\/]/,
            /^\/boot[\/]/,
            /^\/opt[\/]/,
        ];
    }
}

/**
 * Create default user config file if it doesn't exist
 */
export function initializeUserConfig(): void {
    try {
        const configPath = getUserConfigPath();
        const configDir = path.dirname(configPath);

        // Create directory if it doesn't exist
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }

        // Create default config file if it doesn't exist
        if (!fs.existsSync(configPath)) {
            const defaultConfig = {
                customAllowedDirectories: [],
                settings: {
                    maxScanDepth: 10,
                    logAccess: true,
                },
                _comment:
                    "Add custom directories to 'customAllowedDirectories' array. Example: 'C:\\\\Users\\\\YourName\\\\CustomFolder'",
            };

            fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
            console.error(`Created default config file at: ${configPath}`);
        }
    } catch (error) {
        console.error('Error initializing user config:', (error as Error).message);
    }
}

// Initialize config on module load
initializeUserConfig();

// Backward compatibility exports
export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
export const MAX_FILES = CONFIG.security.maxFilesPerOperation;
export const MAX_DEPTH = CONFIG.security.maxScanDepth;

export const SKIP_DIRECTORIES = ['node_modules', '.git', '__pycache__', '.venv'] as const;

export const SKIP_PATTERNS = {
    HIDDEN_FILES: /^\./,
} as const;
