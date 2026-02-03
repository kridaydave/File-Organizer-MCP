/**
 * File Organizer MCP Server v3.0.0
 * Centralized Error Handling
 */

import crypto from 'crypto';
import { AccessDeniedError, ValidationError, type ToolResponse } from '../types.js';
import { FileOrganizerError } from '../errors.js';
import { logger } from './logger.js';

/**
 * Sanitize error message to prevent path disclosure
 * Improved regex to handle paths with spaces
 */
export function sanitizeErrorMessage(error: Error | string): string {
    const message = error instanceof Error ? error.message : String(error);

    // Replace Windows paths (Look for drive letter, colon, backslash, then chars including spaces until end or distinct break)
    let sanitized = message.replace(/[a-zA-Z]:\\[\w\s\-\.\(\)\\$]+/g, '[PATH]');

    // Replace Unix paths (start with / and contain path chars)
    sanitized = sanitized.replace(/(^|\s)\/[\w\s\-\.\/]+/g, '$1[PATH]');

    return sanitized;
}

/**
 * Create standardized error response string with Error ID
 */
export function createErrorResponse(error: unknown): ToolResponse {
    const errorId = crypto.randomUUID();
    let clientMessage: string;

    // Log full details server-side
    const fullMessage = error instanceof Error ? error.stack || error.message : String(error);
    logger.error(`Error ID ${errorId}: ${fullMessage}`);

    if (error instanceof FileOrganizerError) {
        return error.toResponse();
    } else if (error instanceof AccessDeniedError) {
        // Safe to show sanitized message for expected errors
        clientMessage = `Access Denied: ${sanitizeErrorMessage(error)}`;
    } else if (error instanceof ValidationError) {
        clientMessage = `Validation Error: ${sanitizeErrorMessage(error.message)}`;
    } else {
        // Hide internal details for unknown errors
        clientMessage = `An unexpected error occurred. Error ID: ${errorId}. Please check server logs.`;
    }

    return {
        content: [
            {
                type: 'text',
                text: `Error: ${clientMessage}`,
            },
        ],
    };
}

/**
 * Format access denied error with helpful guidance
 * @param requestedPath - Path that was denied
 * @returns Formatted error message
 */
export function formatAccessDeniedError(requestedPath: string): string {
    const sanitizedPath = sanitizeErrorMessage(requestedPath);

    return `❌ Access Denied: ${sanitizedPath}

This directory is not allowed in STRICT mode.
STRICT mode only allows access to the current working directory.

Options:
1. Switch to SANDBOXED mode and add this directory to the allow-list
2. Navigate to this directory and run the server from there
3. Enable UNRESTRICTED mode (advanced users only)

Learn more: https://github.com/kridaydave/File-Organizer-MCP#security-modes`;
}
