/**
 * Strict Validator for File Organizer MCP v3.0
 * STRICT Mode: CWD-only access (safest mode)
 * 
 * This is the default mode for new users.
 * All paths must resolve to within the current working directory.
 */

import {
    validatePathBase,
    AccessDeniedError,
    ValidationError,
    normalizeAndResolve,
    resolveSymlinks,
    checkContainment,
    sanitizeError
} from './base-validator.js';

/**
 * Validate path in STRICT mode
 * Only allows paths within the current working directory
 * 
 * @param {string} inputPath - Path to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.requireExists - Whether path must exist
 * @param {boolean} options.checkWrite - Whether to check write access
 * @returns {Promise<string>} Validated real path
 * @throws {AccessDeniedError} If path is outside CWD
 * @throws {ValidationError} If path is invalid
 */
export async function validateStrictPath(inputPath, options = {}) {
    const cwd = process.cwd();

    return validatePathBase(inputPath, {
        ...options,
        basePath: cwd,
        allowedPaths: cwd
    });
}

/**
 * Create a strict validator instance with custom CWD
 * Useful for testing or when running from a specific directory
 * 
 * @param {string} workingDirectory - Directory to use as CWD
 * @returns {Object} Validator object with validatePath method
 */
export function createStrictValidator(workingDirectory) {
    const cwd = workingDirectory || process.cwd();

    return {
        mode: 'strict',
        cwd,

        /**
         * Validate path against this validator's CWD
         * @param {string} inputPath - Path to validate
         * @param {Object} options - Validation options
         * @returns {Promise<string>} Validated real path
         */
        async validatePath(inputPath, options = {}) {
            return validatePathBase(inputPath, {
                ...options,
                basePath: cwd,
                allowedPaths: cwd
            });
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
         * Get validation error for a path (null if valid)
         * @param {string} inputPath - Path to check
         * @returns {Promise<Error|null>} Error or null
         */
        async getValidationError(inputPath) {
            try {
                await this.validatePath(inputPath);
                return null;
            } catch (error) {
                return error;
            }
        }
    };
}

/**
 * Quick check if path is within CWD (no async, no symlink resolution)
 * Use for preliminary checks only, not for actual validation
 * 
 * @param {string} inputPath - Path to check
 * @returns {boolean} True if path appears to be within CWD
 */
export function quickCheckStrictPath(inputPath) {
    try {
        const cwd = process.cwd();
        const absolutePath = normalizeAndResolve(inputPath, cwd);
        return checkContainment(absolutePath, cwd);
    } catch {
        return false;
    }
}

/**
 * Format error message for STRICT mode
 * Provides helpful guidance on how to proceed
 * 
 * @param {Error} error - Original error
 * @param {string} requestedPath - Path that was requested
 * @returns {string} Formatted error message
 */
export function formatStrictModeError(error, requestedPath) {
    const sanitizedPath = sanitizeError({ message: requestedPath });

    return `❌ Access Denied: ${sanitizedPath}

This directory is not allowed in STRICT mode.
STRICT mode only allows access to the current working directory.

Options:
1. Switch to SANDBOXED mode and add this directory to the allow-list
2. Navigate to this directory and run the server from there
3. Enable UNRESTRICTED mode (advanced users only)

Learn more: https://github.com/kridaydave/File-Organizer-MCP#security-modes`;
}

export default {
    validateStrictPath,
    createStrictValidator,
    quickCheckStrictPath,
    formatStrictModeError
};
