/**
 * Error Formatter for File Organizer MCP v3.0
 * Provides user-friendly error messages with actionable guidance
 */

import { sanitizeErrorMessage } from './path-utils.js';

/**
 * Error types for categorization
 */
export const ErrorTypes = {
    ACCESS_DENIED: 'ACCESS_DENIED',
    PATH_NOT_FOUND: 'PATH_NOT_FOUND',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    PERMISSION_ERROR: 'PERMISSION_ERROR',
    LIMIT_EXCEEDED: 'LIMIT_EXCEEDED',
    CONFIG_ERROR: 'CONFIG_ERROR',
    UNKNOWN: 'UNKNOWN'
};

/**
 * Categorize an error based on its type and message
 * @param {Error} error - Error to categorize
 * @returns {string} Error type
 */
export function categorizeError(error) {
    if (error.name === 'AccessDeniedError' || error.code === 'EACCES') {
        return ErrorTypes.ACCESS_DENIED;
    }

    if (error.code === 'ENOENT') {
        return ErrorTypes.PATH_NOT_FOUND;
    }

    if (error.name === 'ValidationError') {
        return ErrorTypes.VALIDATION_ERROR;
    }

    if (error.code === 'EPERM') {
        return ErrorTypes.PERMISSION_ERROR;
    }

    if (error.message && (
        error.message.includes('Maximum') ||
        error.message.includes('limit') ||
        error.message.includes('exceeded')
    )) {
        return ErrorTypes.LIMIT_EXCEEDED;
    }

    return ErrorTypes.UNKNOWN;
}

/**
 * Format access denied error with mode-specific guidance
 * @param {string} requestedPath - Path that was denied
 * @param {string} mode - Current security mode
 * @param {Object} context - Additional context
 * @returns {string} Formatted error message
 */
export function formatAccessDeniedError(requestedPath, mode = 'strict', context = {}) {
    const sanitizedPath = sanitizeErrorMessage(requestedPath);
    const { allowedDirs = [], cwd = process.cwd() } = context;

    let message = `❌ Access Denied: ${sanitizedPath}\n\n`;

    switch (mode.toLowerCase()) {
        case 'strict':
            message += `This directory is not allowed in STRICT mode.
STRICT mode only allows access to the current working directory.

Current working directory: ${cwd}

Options:
1. Switch to SANDBOXED mode and add this directory to the allow-list
2. Navigate to this directory and run the server from there
3. Enable UNRESTRICTED mode (advanced users only)`;
            break;

        case 'sandboxed':
            const allowedList = allowedDirs.length > 0
                ? allowedDirs.map(d => `  • ${d}`).join('\n')
                : '  (no directories configured)';

            message += `This directory is not in your allow-list.

Currently allowed directories:
${allowedList}

Options:
1. Add this directory: Use the add_allowed_directory tool
2. Use a different directory from the allow-list above
3. Switch to UNRESTRICTED mode (advanced users only)`;
            break;

        case 'unrestricted':
            message += `This is a protected system directory.

Even in UNRESTRICTED mode, critical system directories are blocked
for your protection.

If you really need access, use the --force flag (NOT RECOMMENDED).`;
            break;

        default:
            message += 'Access to this path has been denied by security policy.';
    }

    message += '\n\nLearn more: https://github.com/kridaydave/File-Organizer-MCP#security-modes';

    return message;
}

/**
 * Format path not found error
 * @param {string} requestedPath - Path that wasn't found
 * @returns {string} Formatted error message
 */
export function formatNotFoundError(requestedPath) {
    const sanitizedPath = sanitizeErrorMessage(requestedPath);

    return `❌ Path Not Found: ${sanitizedPath}

The specified path does not exist. Please check:
1. The path is spelled correctly
2. The directory/file hasn't been moved or deleted
3. You have the correct capitalization (case-sensitive on some systems)`;
}

/**
 * Format validation error
 * @param {string} message - Validation message
 * @returns {string} Formatted error message
 */
export function formatValidationError(message) {
    return `❌ Invalid Input: ${message}

Please check your input and try again.`;
}

/**
 * Format permission error
 * @param {string} requestedPath - Path with permission issue
 * @param {string} operation - Operation that failed
 * @returns {string} Formatted error message
 */
export function formatPermissionError(requestedPath, operation = 'access') {
    const sanitizedPath = sanitizeErrorMessage(requestedPath);

    return `❌ Permission Denied: Cannot ${operation} ${sanitizedPath}

You don't have the necessary permissions for this operation.

Solutions:
1. Check file/folder permissions
2. On Windows: Run as Administrator
3. On Mac/Linux: Check ownership with 'ls -la'`;
}

/**
 * Format limit exceeded error
 * @param {string} limitType - Type of limit that was exceeded
 * @param {number} current - Current value
 * @param {number} max - Maximum allowed value
 * @returns {string} Formatted error message
 */
export function formatLimitExceededError(limitType, current, max) {
    return `⚠️ Limit Exceeded: ${limitType}

Current: ${current}
Maximum: ${max}

This limit exists to protect system resources and prevent runaway operations.
You can adjust limits in your config.json file.`;
}

/**
 * Format any error with appropriate message
 * @param {Error} error - Error to format
 * @param {Object} context - Additional context
 * @returns {string} Formatted error message
 */
export function formatError(error, context = {}) {
    const type = categorizeError(error);
    const { mode = 'strict', path = '', allowedDirs = [] } = context;

    switch (type) {
        case ErrorTypes.ACCESS_DENIED:
            return formatAccessDeniedError(path || error.requestedPath || '', mode, { allowedDirs });

        case ErrorTypes.PATH_NOT_FOUND:
            return formatNotFoundError(path || '');

        case ErrorTypes.VALIDATION_ERROR:
            return formatValidationError(error.message);

        case ErrorTypes.PERMISSION_ERROR:
            return formatPermissionError(path || '', 'access');

        case ErrorTypes.LIMIT_EXCEEDED:
            return error.message; // Usually already formatted

        default:
            return `❌ Error: ${sanitizeErrorMessage(error)}

If this error persists, please report it at:
https://github.com/kridaydave/File-Organizer-MCP/issues`;
    }
}

export default {
    ErrorTypes,
    categorizeError,
    formatAccessDeniedError,
    formatNotFoundError,
    formatValidationError,
    formatPermissionError,
    formatLimitExceededError,
    formatError
};
