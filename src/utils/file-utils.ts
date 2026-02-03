/**
 * File Organizer MCP Server v3.0.0
 * File System Utilities
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';

/**
 * Check if a file exists
 * @param filePath - Path to check
 * @returns True if file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Ensure a directory exists, creating it if necessary
 * @param dirPath - Directory path
 */
export async function ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Expand home directory (~) in path
 * @param inputPath - Path that may contain ~
 * @returns Path with ~ expanded
 */
export function expandHomePath(inputPath: string): string {
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
 * @param inputPath - Path with env vars
 * @returns Path with env vars expanded
 */
export function expandEnvVars(inputPath: string): string {
    if (!inputPath || typeof inputPath !== 'string') {
        return inputPath;
    }

    // Unix style: $VAR or ${VAR}
    let result = inputPath.replace(/\$\{([^}]+)\}/g, (_, name: string) => process.env[name] ?? '');
    result = result.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, name: string) => process.env[name] ?? '');

    // Windows style: %VAR%
    result = result.replace(/%([^%]+)%/g, (_, name: string) => process.env[name] ?? '');

    return result;
}

/**
 * Normalize path for cross-platform compatibility
 * @param inputPath - Path to normalize
 * @returns Normalized path
 */
export function normalizePath(inputPath: string): string {
    if (!inputPath || typeof inputPath !== 'string') {
        return inputPath;
    }

    // 1. Decode URI components (e.g. %2e%2e -> ..) to prevent bypasses
    try {
        inputPath = decodeURIComponent(inputPath);
    } catch {
        // Continue with original if malformed
    }

    // 2. Unicode Normalization (NFC)
    // Ensures consistent representation of characters
    inputPath = inputPath.normalize('NFC');

    // 3. Strip Null Bytes (prevent truncation attacks)
    inputPath = inputPath.replace(/\0/g, '');

    let normalized = expandHomePath(inputPath);
    normalized = expandEnvVars(normalized);
    normalized = path.normalize(normalized);

    return normalized;
}

/**
 * Check if child path is contained within parent path
 * @param parentPath - Parent directory
 * @param childPath - Child path to check
 * @returns True if child is within parent
 */
export function isSubPath(parentPath: string, childPath: string): boolean {
    if (!parentPath || !childPath) {
        return false;
    }

    const normalizedParent = path.resolve(parentPath);
    const normalizedChild = path.resolve(childPath);

    if (process.platform === 'win32') {
        const relative = path.relative(normalizedParent.toLowerCase(), normalizedChild.toLowerCase());
        return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    }

    const relative = path.relative(normalizedParent, normalizedChild);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
