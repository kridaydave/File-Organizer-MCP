/**
 * Path Utilities for File Organizer MCP v3.0
 * Cross-platform path manipulation and validation helpers
 */

import path from 'path';
import os from 'os';

/**
 * Expand home directory (~) in path
 * @param {string} inputPath - Path that may contain ~
 * @returns {string} Path with ~ expanded to home directory
 */
export function expandHomePath(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') {
    return inputPath;
  }
  
  if (inputPath === '~') {
    return os.homedir();
  }
  
  if (inputPath.startsWith('~/') || inputPath.startsWith('~\\')) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  
  return inputPath;
}

/**
 * Expand environment variables in path
 * Supports: $VAR, ${VAR}, %VAR%
 * @param {string} inputPath - Path with env vars
 * @returns {string} Path with env vars expanded
 */
export function expandEnvVars(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') {
    return inputPath;
  }
  
  // Unix style: $VAR or ${VAR}
  let result = inputPath.replace(/\$\{([^}]+)\}/g, (_, name) => process.env[name] || '');
  result = result.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => process.env[name] || '');
  
  // Windows style: %VAR%
  result = result.replace(/%([^%]+)%/g, (_, name) => process.env[name] || '');
  
  return result;
}

/**
 * Normalize path for cross-platform compatibility
 * @param {string} inputPath - Path to normalize
 * @returns {string} Normalized path
 */
export function normalizePath(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') {
    return inputPath;
  }
  
  // Expand home and env vars first
  let normalized = expandHomePath(inputPath);
  normalized = expandEnvVars(normalized);
  
  // Use path.normalize to handle . and .. and slashes
  normalized = path.normalize(normalized);
  
  return normalized;
}

/**
 * Check if child path is contained within parent path
 * Safe containment check that handles edge cases
 * @param {string} parentPath - Parent directory (must be resolved absolute path)
 * @param {string} childPath - Child path to check (must be resolved absolute path)
 * @returns {boolean} True if child is within or equal to parent
 */
export function isSubPath(parentPath, childPath) {
  if (!parentPath || !childPath) {
    return false;
  }
  
  // Normalize both paths
  const normalizedParent = path.resolve(parentPath);
  const normalizedChild = path.resolve(childPath);
  
  // Exact match
  if (normalizedChild === normalizedParent) {
    return true;
  }
  
  // Child must start with parent + separator
  const parentWithSep = normalizedParent + path.sep;
  return normalizedChild.startsWith(parentWithSep);
}

/**
 * Sanitize error message to prevent path disclosure
 * @param {Error|string} error - Error to sanitize
 * @returns {string} Sanitized error message
 */
export function sanitizeErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  
  // Replace Unix paths
  let sanitized = message.replace(/\/[^\s'"]+/g, '[PATH]');
  
  // Replace Windows paths
  sanitized = sanitized.replace(/[A-Z]:\\[^\s'"]+/gi, '[PATH]');
  
  return sanitized;
}

/**
 * Get platform-appropriate path separator
 * @returns {string} Path separator
 */
export function getPathSeparator() {
  return path.sep;
}

/**
 * Check if path is absolute
 * @param {string} inputPath - Path to check
 * @returns {boolean} True if absolute
 */
export function isAbsolutePath(inputPath) {
  return path.isAbsolute(inputPath);
}

/**
 * Join paths safely
 * @param {...string} paths - Paths to join
 * @returns {string} Joined path
 */
export function joinPaths(...paths) {
  return path.join(...paths);
}

/**
 * Resolve path to absolute
 * @param {...string} paths - Paths to resolve
 * @returns {string} Resolved absolute path
 */
export function resolvePath(...paths) {
  return path.resolve(...paths);
}

/**
 * Get basename of path
 * @param {string} inputPath - Path
 * @returns {string} Base name
 */
export function getBasename(inputPath) {
  return path.basename(inputPath);
}

/**
 * Get directory name of path
 * @param {string} inputPath - Path
 * @returns {string} Directory name
 */
export function getDirname(inputPath) {
  return path.dirname(inputPath);
}

/**
 * Get home directory path
 * @returns {string} Home directory
 */
export function getHomeDir() {
  return os.homedir();
}
