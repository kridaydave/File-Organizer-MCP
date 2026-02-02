/**
 * Configuration Loader for File Organizer MCP v3.0
 * Loads and validates configuration from file and environment
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
    version: '3.0.0',
    security: {
        mode: 'strict',
        allowed_directories: [],
        enable_symlinks: false,
        blacklist_system_paths: true
    },
    limits: {
        max_file_size: 100 * 1024 * 1024, // 100MB
        max_files_per_operation: 10000,
        max_directory_depth: 10
    },
    behavior: {
        dry_run_default: false,
        skip_hidden_files: true
    },
    logging: {
        audit_enabled: false,
        log_level: 'info'
    }
};

/**
 * Get the configuration directory path
 * @returns {string} Config directory path
 */
export function getConfigDir() {
    return path.join(os.homedir(), '.file-organizer-mcp');
}

/**
 * Get the configuration file path
 * @returns {string} Config file path
 */
export function getConfigPath() {
    // Check for custom config path via env var
    if (process.env.FILE_ORGANIZER_CONFIG) {
        return process.env.FILE_ORGANIZER_CONFIG;
    }
    return path.join(getConfigDir(), 'config.json');
}

/**
 * Ensure config directory exists
 * @returns {Promise<void>}
 */
export async function ensureConfigDir() {
    const configDir = getConfigDir();
    try {
        await fs.mkdir(configDir, { recursive: true });
    } catch (error) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
    }
}

/**
 * Load configuration from file
 * @returns {Promise<Object>} Loaded configuration or null
 */
async function loadConfigFile() {
    const configPath = getConfigPath();

    try {
        const content = await fs.readFile(configPath, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null; // File doesn't exist, will use defaults
        }
        console.warn(`Warning: Could not parse config file: ${error.message}`);
        return null;
    }
}

/**
 * Apply environment variable overrides
 * @param {Object} config - Current configuration
 * @returns {Object} Configuration with env overrides applied
 */
function applyEnvOverrides(config) {
    const result = JSON.parse(JSON.stringify(config)); // Deep clone

    // Security mode
    if (process.env.FILE_ORGANIZER_MODE) {
        const mode = process.env.FILE_ORGANIZER_MODE.toLowerCase();
        if (['strict', 'sandboxed', 'unrestricted'].includes(mode)) {
            result.security.mode = mode;
        }
    }

    // Allowed directories (comma-separated)
    if (process.env.FILE_ORGANIZER_ALLOWED_DIRS) {
        const dirs = process.env.FILE_ORGANIZER_ALLOWED_DIRS
            .split(',')
            .map(d => d.trim())
            .filter(d => d.length > 0);
        result.security.allowed_directories = dirs;
    }

    // Audit logging
    if (process.env.FILE_ORGANIZER_AUDIT) {
        result.logging.audit_enabled = process.env.FILE_ORGANIZER_AUDIT.toLowerCase() === 'true';
    }

    // Debug mode
    if (process.env.FILE_ORGANIZER_DEBUG) {
        if (process.env.FILE_ORGANIZER_DEBUG.toLowerCase() === 'true') {
            result.logging.log_level = 'debug';
        }
    }

    // Max file size
    if (process.env.FILE_ORGANIZER_MAX_FILE_SIZE) {
        const size = parseInt(process.env.FILE_ORGANIZER_MAX_FILE_SIZE, 10);
        if (!isNaN(size) && size > 0) {
            result.limits.max_file_size = size;
        }
    }

    // Max files
    if (process.env.FILE_ORGANIZER_MAX_FILES) {
        const count = parseInt(process.env.FILE_ORGANIZER_MAX_FILES, 10);
        if (!isNaN(count) && count > 0) {
            result.limits.max_files_per_operation = count;
        }
    }

    // Max depth
    if (process.env.FILE_ORGANIZER_MAX_DEPTH) {
        const depth = parseInt(process.env.FILE_ORGANIZER_MAX_DEPTH, 10);
        if (!isNaN(depth) && depth > 0) {
            result.limits.max_directory_depth = depth;
        }
    }

    return result;
}

/**
 * Deep merge configuration objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} Merged object
 */
function deepMerge(target, source) {
    const result = { ...target };

    for (const key of Object.keys(source)) {
        if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = deepMerge(target[key] || {}, source[key]);
        } else if (source[key] !== undefined) {
            result[key] = source[key];
        }
    }

    return result;
}

/**
 * Validate configuration values
 * @param {Object} config - Configuration to validate
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
export function validateConfig(config) {
    const errors = [];

    // Validate security mode
    if (config.security?.mode) {
        const validModes = ['strict', 'sandboxed', 'unrestricted'];
        if (!validModes.includes(config.security.mode)) {
            errors.push(`Invalid security mode: ${config.security.mode}. Must be one of: ${validModes.join(', ')}`);
        }
    }

    // Validate allowed_directories is array
    if (config.security?.allowed_directories && !Array.isArray(config.security.allowed_directories)) {
        errors.push('allowed_directories must be an array');
    }

    // Validate limits
    if (config.limits) {
        if (config.limits.max_file_size && (config.limits.max_file_size < 1048576 || config.limits.max_file_size > 1073741824)) {
            errors.push('max_file_size must be between 1MB and 1GB');
        }
        if (config.limits.max_files_per_operation && (config.limits.max_files_per_operation < 10 || config.limits.max_files_per_operation > 100000)) {
            errors.push('max_files_per_operation must be between 10 and 100000');
        }
        if (config.limits.max_directory_depth && (config.limits.max_directory_depth < 1 || config.limits.max_directory_depth > 50)) {
            errors.push('max_directory_depth must be between 1 and 50');
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Load complete configuration
 * Merges: defaults <- config file <- environment variables
 * @returns {Promise<Object>} Final configuration
 */
export async function loadConfig() {
    // Start with defaults
    let config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

    // Load and merge config file
    const fileConfig = await loadConfigFile();
    if (fileConfig) {
        config = deepMerge(config, fileConfig);
    }

    // Apply environment overrides
    config = applyEnvOverrides(config);

    // Force audit logging in unrestricted mode
    if (config.security.mode === 'unrestricted') {
        config.logging.audit_enabled = true;
    }

    // Validate
    const { valid, errors } = validateConfig(config);
    if (!valid) {
        console.warn('Configuration validation warnings:');
        errors.forEach(e => console.warn(`  - ${e}`));
    }

    return config;
}

/**
 * Save configuration to file
 * @param {Object} config - Configuration to save
 * @returns {Promise<void>}
 */
export async function saveConfig(config) {
    await ensureConfigDir();
    const configPath = getConfigPath();
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Update specific configuration values
 * @param {Object} updates - Partial configuration to update
 * @returns {Promise<Object>} Updated configuration
 */
export async function updateConfig(updates) {
    const currentConfig = await loadConfig();
    const newConfig = deepMerge(currentConfig, updates);
    await saveConfig(newConfig);
    return newConfig;
}

/**
 * Get current security mode
 * @returns {Promise<string>} Current mode
 */
export async function getSecurityMode() {
    const config = await loadConfig();
    return config.security.mode;
}

/**
 * Switch security mode
 * @param {string} mode - New mode ('strict', 'sandboxed', 'unrestricted')
 * @returns {Promise<Object>} Updated configuration
 */
export async function switchSecurityMode(mode) {
    const validModes = ['strict', 'sandboxed', 'unrestricted'];
    if (!validModes.includes(mode)) {
        throw new Error(`Invalid mode: ${mode}. Must be one of: ${validModes.join(', ')}`);
    }

    return updateConfig({ security: { mode } });
}

export default {
    DEFAULT_CONFIG,
    loadConfig,
    saveConfig,
    updateConfig,
    validateConfig,
    getConfigDir,
    getConfigPath,
    ensureConfigDir,
    getSecurityMode,
    switchSecurityMode
};
