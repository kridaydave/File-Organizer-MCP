/**
 * Directory Manager for File Organizer MCP v3.0
 * Manages the allow-list for sandboxed mode
 */

import fs from 'fs/promises';
import path from 'path';
import { loadConfig, saveConfig, getConfigPath, ensureConfigDir } from '../config/config.loader.js';
import { expandHomePath, expandEnvVars, resolvePath } from '../utils/path-utils.js';

/**
 * Normalize a directory path for comparison and storage
 * @param {string} directory - Directory path
 * @returns {Promise<string>} Normalized absolute path
 */
export async function normalizeDirectory(directory) {
    if (!directory || typeof directory !== 'string') {
        throw new Error('Directory must be a non-empty string');
    }

    // Expand ~ and env vars
    let expanded = expandHomePath(directory.trim());
    expanded = expandEnvVars(expanded);

    // Resolve to absolute path
    const absolutePath = resolvePath(expanded);

    return absolutePath;
}

/**
 * Check if a directory exists
 * @param {string} directory - Directory path
 * @returns {Promise<boolean>} True if exists and is directory
 */
export async function directoryExists(directory) {
    try {
        const stats = await fs.stat(directory);
        return stats.isDirectory();
    } catch {
        return false;
    }
}

/**
 * Get list of allowed directories from config
 * @returns {Promise<string[]>} List of allowed directories
 */
export async function getAllowedDirectories() {
    const config = await loadConfig();
    return config.security?.allowed_directories || [];
}

/**
 * Get list of allowed directories with normalized paths
 * @returns {Promise<{original: string, normalized: string, exists: boolean}[]>} Detailed directory list
 */
export async function getAllowedDirectoriesDetailed() {
    const directories = await getAllowedDirectories();
    const result = [];

    for (const dir of directories) {
        try {
            const normalized = await normalizeDirectory(dir);
            const exists = await directoryExists(normalized);
            result.push({
                original: dir,
                normalized,
                exists
            });
        } catch (error) {
            result.push({
                original: dir,
                normalized: null,
                exists: false,
                error: error.message
            });
        }
    }

    return result;
}

/**
 * Add a directory to the allow-list
 * @param {string} directory - Directory to add
 * @param {Object} options - Options
 * @param {boolean} options.createIfMissing - Create directory if it doesn't exist
 * @param {boolean} options.validateExists - Require directory to exist
 * @returns {Promise<{success: boolean, message: string, normalized?: string}>}
 */
export async function addAllowedDirectory(directory, options = {}) {
    const { createIfMissing = false, validateExists = true } = options;

    try {
        const normalized = await normalizeDirectory(directory);

        // Check if already in list
        const currentDirs = await getAllowedDirectories();
        const normalizedCurrent = await Promise.all(
            currentDirs.map(d => normalizeDirectory(d).catch(() => null))
        );

        if (normalizedCurrent.includes(normalized)) {
            return {
                success: false,
                message: `Directory already in allow-list: ${normalized}`,
                normalized
            };
        }

        // Check if directory exists
        const exists = await directoryExists(normalized);

        if (!exists) {
            if (createIfMissing) {
                await fs.mkdir(normalized, { recursive: true });
            } else if (validateExists) {
                return {
                    success: false,
                    message: `Directory does not exist: ${normalized}. Use createIfMissing option to create it.`,
                    normalized
                };
            }
        }

        // Add to config
        const config = await loadConfig();
        if (!config.security) {
            config.security = {};
        }
        if (!Array.isArray(config.security.allowed_directories)) {
            config.security.allowed_directories = [];
        }

        // Store the original (unexpanded) path for portability
        config.security.allowed_directories.push(directory);
        await saveConfig(config);

        return {
            success: true,
            message: `Added directory to allow-list: ${normalized}`,
            normalized
        };
    } catch (error) {
        return {
            success: false,
            message: `Failed to add directory: ${error.message}`
        };
    }
}

/**
 * Remove a directory from the allow-list
 * @param {string} directory - Directory to remove
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function removeAllowedDirectory(directory) {
    try {
        const normalized = await normalizeDirectory(directory);

        const config = await loadConfig();
        const currentDirs = config.security?.allowed_directories || [];

        // Find matching entry (either original or normalized matches)
        const indexToRemove = [];
        for (let i = 0; i < currentDirs.length; i++) {
            try {
                const normalizedCurrent = await normalizeDirectory(currentDirs[i]);
                if (normalizedCurrent === normalized || currentDirs[i] === directory) {
                    indexToRemove.push(i);
                }
            } catch {
                // If normalization fails, try exact match
                if (currentDirs[i] === directory) {
                    indexToRemove.push(i);
                }
            }
        }

        if (indexToRemove.length === 0) {
            return {
                success: false,
                message: `Directory not found in allow-list: ${directory}`
            };
        }

        // Remove entries (in reverse order to preserve indices)
        for (let i = indexToRemove.length - 1; i >= 0; i--) {
            currentDirs.splice(indexToRemove[i], 1);
        }

        config.security.allowed_directories = currentDirs;
        await saveConfig(config);

        return {
            success: true,
            message: `Removed directory from allow-list: ${normalized}`
        };
    } catch (error) {
        return {
            success: false,
            message: `Failed to remove directory: ${error.message}`
        };
    }
}

/**
 * Clear all allowed directories
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function clearAllowedDirectories() {
    try {
        const config = await loadConfig();
        const count = config.security?.allowed_directories?.length || 0;

        if (!config.security) {
            config.security = {};
        }
        config.security.allowed_directories = [];
        await saveConfig(config);

        return {
            success: true,
            message: `Cleared ${count} directories from allow-list`
        };
    } catch (error) {
        return {
            success: false,
            message: `Failed to clear directories: ${error.message}`
        };
    }
}

/**
 * Check if a path is within any allowed directory
 * @param {string} inputPath - Path to check
 * @returns {Promise<{allowed: boolean, containingDir?: string}>}
 */
export async function isPathAllowed(inputPath) {
    try {
        const normalized = await normalizeDirectory(inputPath);
        const allowedDirs = await getAllowedDirectoriesDetailed();

        for (const dir of allowedDirs) {
            if (!dir.normalized) continue;

            // Check if path is within or equal to allowed directory
            if (normalized === dir.normalized ||
                normalized.startsWith(dir.normalized + path.sep)) {
                return {
                    allowed: true,
                    containingDir: dir.original
                };
            }
        }

        return { allowed: false };
    } catch (error) {
        return { allowed: false, error: error.message };
    }
}

export default {
    normalizeDirectory,
    directoryExists,
    getAllowedDirectories,
    getAllowedDirectoriesDetailed,
    addAllowedDirectory,
    removeAllowedDirectory,
    clearAllowedDirectories,
    isPathAllowed
};
