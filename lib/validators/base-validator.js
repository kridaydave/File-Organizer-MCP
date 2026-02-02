/**
 * Base Validator for File Organizer MCP v3.0
 * Provides shared validation logic used by all security modes
 */

import fs from 'fs/promises';
import path from 'path';
import {
    normalizePath,
    isSubPath,
    sanitizeErrorMessage,
    resolvePath,
    getBasename,
    getDirname
} from '../utils/path-utils.js';

/**
 * Custom error class for access denied errors
 */
export class AccessDeniedError extends Error {
    constructor(requestedPath, reason = 'Path is outside allowed directory') {
        super(`Access denied: ${reason}`);
        this.name = 'AccessDeniedError';
        this.requestedPath = requestedPath;
        this.code = 'EACCES';
    }
}

/**
 * Custom error class for validation errors
 */
export class ValidationError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = 'ValidationError';
        this.details = details;
    }
}

/**
 * 7-Layer Path Validation
 * 
 * Layer 1: Type Check - Verify input is a string
 * Layer 2: Normalize - Handle . and .. and slashes
 * Layer 3: Expand - Handle ~ and environment variables
 * Layer 4: Resolve - Convert to absolute path
 * Layer 5: Symlink Resolution - Get real path (if exists)
 * Layer 6: Containment Check - Mode-specific validation
 * Layer 7: Access Check - Verify readable/writable permissions
 */

/**
 * Layer 1: Type validation
 * @param {*} inputPath - Path to validate
 * @throws {ValidationError} If not a valid string
 */
export function validateType(inputPath) {
    if (inputPath === null || inputPath === undefined) {
        throw new ValidationError('Path cannot be null or undefined');
    }

    if (typeof inputPath !== 'string') {
        throw new ValidationError(`Path must be a string, got ${typeof inputPath}`);
    }

    if (inputPath.trim() === '') {
        throw new ValidationError('Path cannot be empty');
    }

    // Check for null bytes (security)
    if (inputPath.includes('\0')) {
        throw new ValidationError('Path contains invalid null byte');
    }

    return true;
}

/**
 * Layer 2-4: Normalize, expand, and resolve path
 * @param {string} inputPath - Path to process
 * @param {string} basePath - Base path for relative resolution
 * @returns {string} Normalized absolute path
 */
export function normalizeAndResolve(inputPath, basePath = process.cwd()) {
    // Normalize (handles . and .. and slashes, expands ~ and env vars)
    const normalized = normalizePath(inputPath);

    // Resolve to absolute path
    const absolutePath = resolvePath(basePath, normalized);

    return absolutePath;
}

/**
 * Layer 5: Resolve symlinks to get real path
 * @param {string} absolutePath - Absolute path to resolve
 * @returns {Promise<{realPath: string, exists: boolean}>} Real path and existence flag
 */
export async function resolveSymlinks(absolutePath) {
    try {
        const realPath = await fs.realpath(absolutePath);
        return { realPath, exists: true };
    } catch (error) {
        if (error.code === 'ENOENT') {
            // File doesn't exist - validate parent directory instead
            const parentDir = getDirname(absolutePath);
            try {
                const realParent = await fs.realpath(parentDir);
                const realPath = path.join(realParent, getBasename(absolutePath));
                return { realPath, exists: false };
            } catch (parentError) {
                // Parent doesn't exist either - use absolute path as-is
                return { realPath: absolutePath, exists: false };
            }
        }
        throw error;
    }
}

/**
 * Layer 6: Containment check (base implementation - override in specific validators)
 * @param {string} realPath - Real resolved path
 * @param {string|string[]} allowedPaths - Allowed path(s)
 * @returns {boolean} True if path is within allowed paths
 */
export function checkContainment(realPath, allowedPaths) {
    const paths = Array.isArray(allowedPaths) ? allowedPaths : [allowedPaths];

    for (const allowed of paths) {
        if (isSubPath(allowed, realPath)) {
            return true;
        }
    }

    return false;
}

/**
 * Layer 7: Check file/directory access permissions
 * @param {string} realPath - Path to check
 * @param {Object} options - Access options
 * @param {boolean} options.requireExists - Whether file must exist
 * @param {boolean} options.checkWrite - Whether to check write access
 * @returns {Promise<{accessible: boolean, reason?: string}>}
 */
export async function checkAccess(realPath, options = {}) {
    const { requireExists = false, checkWrite = false } = options;

    try {
        const mode = checkWrite ? fs.constants.R_OK | fs.constants.W_OK : fs.constants.R_OK;
        await fs.access(realPath, mode);
        return { accessible: true };
    } catch (error) {
        if (error.code === 'ENOENT') {
            if (requireExists) {
                return { accessible: false, reason: 'Path does not exist' };
            }
            // For new files, check parent directory
            const parentDir = getDirname(realPath);
            try {
                const parentMode = checkWrite ? fs.constants.W_OK : fs.constants.R_OK;
                await fs.access(parentDir, parentMode);
                return { accessible: true };
            } catch {
                return { accessible: false, reason: 'Parent directory not accessible' };
            }
        }
        return { accessible: false, reason: error.message };
    }
}

/**
 * Full path validation pipeline
 * @param {string} inputPath - Path to validate
 * @param {Object} options - Validation options
 * @param {string} options.basePath - Base path for resolution
 * @param {string|string[]} options.allowedPaths - Allowed paths for containment
 * @param {boolean} options.requireExists - Whether path must exist
 * @param {boolean} options.checkWrite - Whether to check write access
 * @param {boolean} options.resolveSymlinks - Whether to resolve symlinks
 * @returns {Promise<string>} Validated real path
 * @throws {ValidationError|AccessDeniedError} If validation fails
 */
export async function validatePathBase(inputPath, options = {}) {
    const {
        basePath = process.cwd(),
        allowedPaths = null,
        requireExists = false,
        checkWrite = false,
        resolveSymlinks: shouldResolveSymlinks = true
    } = options;

    // Layer 1: Type check
    validateType(inputPath);

    // Layers 2-4: Normalize and resolve
    const absolutePath = normalizeAndResolve(inputPath, basePath);

    // Layer 5: Symlink resolution
    let realPath = absolutePath;
    let exists = false;

    if (shouldResolveSymlinks) {
        const result = await resolveSymlinks(absolutePath);
        realPath = result.realPath;
        exists = result.exists;
    }

    // Layer 6: Containment check (if allowed paths specified)
    if (allowedPaths !== null) {
        const isContained = checkContainment(realPath, allowedPaths);
        if (!isContained) {
            throw new AccessDeniedError(
                inputPath,
                'Path is outside the allowed directory'
            );
        }
    }

    // Layer 7: Access check
    if (requireExists || checkWrite) {
        const { accessible, reason } = await checkAccess(realPath, { requireExists, checkWrite });
        if (!accessible) {
            throw new AccessDeniedError(inputPath, reason);
        }
    }

    return realPath;
}

/**
 * Sanitize error for safe display
 * @param {Error} error - Error to sanitize
 * @returns {string} Sanitized error message
 */
export function sanitizeError(error) {
    return sanitizeErrorMessage(error);
}

export default {
    validatePathBase,
    validateType,
    normalizeAndResolve,
    resolveSymlinks,
    checkContainment,
    checkAccess,
    sanitizeError,
    AccessDeniedError,
    ValidationError
};
