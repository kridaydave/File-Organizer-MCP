/**
 * File Organizer MCP Server v3.5.0
 * Centralized Error Handling
 */

import crypto from "crypto";
import {
  AccessDeniedError,
  ValidationError,
  type ToolResponse,
} from "../types.js";
import { FileOrganizerError } from "../errors.js";
import { logger } from "./logger.js";

/**
 * Sanitize error message to prevent path disclosure
 * Improved regex to handle paths with spaces
 */
export function sanitizeErrorMessage(error: Error | string): string {
  const message = error instanceof Error ? error.message : String(error);

  // Replace Windows paths (improved pattern for paths with/without trailing backslash)
  let sanitized = message.replace(
    /[a-zA-Z]:\\(?:[^\\/:*?"<>|\r\n]+(?:\\[^\\/:*?"<>|\r\n]+)*)/g,
    "[PATH]",
  );

  // Replace forward-slash Windows paths (e.g., C:/Users)
  sanitized = sanitized.replace(
    /[a-zA-Z]:\/(?:[^/:*?"<>|\r\n]+(?:\/[^/:*?"<>|\r\n]+)*)/g,
    "[PATH]",
  );

  // Replace UNC paths (e.g., \\server\share)
  sanitized = sanitized.replace(
    /\\\\[\w\-\.]+\\(?:[^\r\n\\]+(?:\\[^\r\n\\]+)*)/g,
    "[PATH]",
  );

  // Replace relative paths (e.g., ./foo, ../bar)
  sanitized = sanitized.replace(
    /(?:^|[\s"']+)(\.\.?\/[^\s"'\/\0\r\n]+(?:\/[^\s"'\/\0\r\n]+)*)/g,
    (match, p) => match.slice(0, match.length - p.length) + "[PATH]",
  );

  // Replace Unix absolute paths (e.g., /home/user, /var/log)
  // Only match paths that look like actual file paths with proper separators
  sanitized = sanitized.replace(
    /(?:^|[\s"']+)(\/(?:[^\s"'\/\0\r\n]+\/)*[^\s"'\/\0\r\n]*)/g,
    (match, p) => match.slice(0, match.length - p.length) + "[PATH]",
  );

  // Replace parent directory traversal (../ with path separators)
  sanitized = sanitized.replace(
    /(?:^|[\s"']+)(\.\.(?:\/[^\s"'\/\0\r\n]+)*)/g,
    (match, p) => match.slice(0, match.length - p.length) + "[PATH]",
  );

  return sanitized;
}

/**
 * Create standardized error response string with Error ID
 */
export function createErrorResponse(error: unknown): ToolResponse {
  const errorId = crypto.randomUUID();
  let clientMessage: string;

  // Log full details server-side
  const fullMessage =
    error instanceof Error ? error.stack || error.message : String(error);
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
    isError: true,
    content: [
      {
        type: "text",
        text: `Error: ${clientMessage}`,
      },
    ],
  };
}

/**
 * Type guard to check if an error is a NodeJS.ErrnoException
 */
export function isErrnoException(
  error: unknown,
): error is NodeJS.ErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as Record<string, unknown>).code === "string"
  );
}
