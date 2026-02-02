/**
 * Sandboxed Validator for File Organizer MCP v3.0
 * SANDBOXED Mode: Allow-list based access (recommended for most users)
 * 
 * Allows access to user-configured directories.
 * Each directory must be explicitly added to the allow-list.
 */

import path from 'path';
import {
    validatePathBase,
    AccessDeniedError,
    ValidationError,
    normalizeAndResolve,
    resolveSymlinks,
    checkContainment,
    sanitizeError
} from './base-validator.js';
import {
    expandHomePath,
    expandEnvVars,
    resolvePath,
    isSubPath
} from '../utils/path-utils.js';

/**
 * Normalize allowed directories list
 * Expands ~ and env vars, resolves to absolute paths
 * 
 * @param {string[]} directories - List of allowed directories
 * @returns {Promise<string[]>} Resolved directory paths
 */
export async function normalizeAllowedDirectories(directories) {
    if (!Array.isArray(directories)) {
        return [];
    }

    const normalized = [];

    for (const dir of directories) {
        if (typeof dir !== 'string' || dir.trim() === '') {
            continue;
        }

        try {
            // Expand ~ and env vars
            let expanded = expandHomePath(dir);
            expanded = expandEnvVars(expanded);

            // Resolve to absolute path
            const absolutePath = resolvePath(expanded);

            normalized.push(absolutePath);
        } catch (error) {
            // Skip invalid paths
            console.warn(`Warning: Invalid allowed directory "${dir}": ${error.message}`);
        }
    }

    return normalized;
}

/**
 * Validate path in SANDBOXED mode
 * Allows paths within any of the allowed directories
 * 
 * @param {string} inputPath - Path to validate
 * @param {string[]} allowedDirectories - List of allowed directories
 * @param {Object} options - Validation options
 * @param {boolean} options.requireExists - Whether path must exist
 * @param {boolean} options.checkWrite - Whether to check write access
 * @returns {Promise<string>} Validated real path
 * @throws {AccessDeniedError} If path is not in any allowed directory
 * @throws {ValidationError} If path is invalid
 */
export async function validateSandboxedPath(inputPath, allowedDirectories, options = {}) {
    // Normalize the allowed directories
    const normalizedAllowed = await normalizeAllowedDirectories(allowedDirectories);

    if (normalizedAllowed.length === 0) {
        throw new ValidationError(
            'No allowed directories configured for SANDBOXED mode. ' +
            'Add directories using the add_allowed_directory tool or update config.json.'
        );
    }

    return validatePathBase(inputPath, {
        ...options,
        basePath: process.cwd(),
        allowedPaths: normalizedAllowed
    });
}

/**
 * Create a sandboxed validator instance with specific allowed directories
 * 
 * @param {string[]} allowedDirectories - List of allowed directories
 * @returns {Object} Validator object with validatePath method
 */
export function createSandboxedValidator(allowedDirectories = []) {
    let currentAllowedDirs = [...allowedDirectories];

    return {
        mode: 'sandboxed',

        /**
         * Get current allowed directories
         * @returns {string[]} Current allowed directories
         */
        getAllowedDirectories() {
            return [...currentAllowedDirs];
        },

        /**
         * Add directory to allow-list
         * @param {string} directory - Directory to add
         * @returns {Promise<boolean>} True if added successfully
         */
        async addDirectory(directory) {
            const [normalized] = await normalizeAllowedDirectories([directory]);
            if (normalized && !currentAllowedDirs.includes(normalized)) {
                currentAllowedDirs.push(normalized);
                return true;
            }
            return false;
        },

        /**
         * Remove directory from allow-list
         * @param {string} directory - Directory to remove
         * @returns {Promise<boolean>} True if removed
         */
        async removeDirectory(directory) {
            const [normalized] = await normalizeAllowedDirectories([directory]);
            const index = currentAllowedDirs.indexOf(normalized);
            if (index !== -1) {
                currentAllowedDirs.splice(index, 1);
                return true;
            }
            return false;
        },

        /**
         * Validate path against allowed directories
         * @param {string} inputPath - Path to validate
         * @param {Object} options - Validation options
         * @returns {Promise<string>} Validated real path
         */
        async validatePath(inputPath, options = {}) {
            return validateSandboxedPath(inputPath, currentAllowedDirs, options);
        },

        /**
         * Check if a path would be allowed without throwing
         * @param {string} inputPath - Path to check
         * @returns {Promise<boolean>} True if path would be allowed
         */
        async isPathAllowed(inputPath) {
            try {
                await this.validatePath(inputPath);
                return true;
            } catch {
                return false;
            }
        },

        /**
         * Get the allowed directory that contains a path
         * @param {string} inputPath - Path to check
         * @returns {Promise<string|null>} Containing allowed directory or null
         */
        async getContainingAllowedDir(inputPath) {
            try {
                const normalized = await normalizeAllowedDirectories([inputPath]);
                if (normalized.length === 0) return null;

                const resolvedInput = normalized[0];

                for (const allowed of currentAllowedDirs) {
                    if (isSubPath(allowed, resolvedInput)) {
                        return allowed;
                    }
                }
                return null;
            } catch {
                return null;
            }
        }
    };
}

/**
 * Format error message for SANDBOXED mode
 * Provides helpful guidance including the allow-list
 * 
 * @param {Error} error - Original error
 * @param {string} requestedPath - Path that was requested
 * @param {string[]} allowedDirs - Current allowed directories
 * @returns {string} Formatted error message
 */
export function formatSandboxedModeError(error, requestedPath, allowedDirs = []) {
    const sanitizedPath = sanitizeError({ message: requestedPath });

    let allowedList = 'No directories configured';
    if (allowedDirs.length > 0) {
        allowedList = allowedDirs.map(d => `  • ${d}`).join('\n');
    }

    return `❌ Access Denied: ${sanitizedPath}

This directory is not in your allow-list.

Currently allowed directories:
${allowedList}

Options:
1. Add this directory: "Add allowed directory ${requestedPath}"
2. Use a different directory from the allow-list above
3. Switch to UNRESTRICTED mode (advanced users only)

Learn more: https://github.com/kridaydave/File-Organizer-MCP#security-modes`;
}

export default {
    validateSandboxedPath,
    createSandboxedValidator,
    normalizeAllowedDirectories,
    formatSandboxedModeError
};
