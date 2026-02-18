/**
 * File Organizer MCP Server v3.4.0
 * File System Utilities
 */

import fs from "fs/promises";
import path from "path";
import os from "os";
import { logger } from "./logger.js";

/**
 * Check if a file exists
 * @param filePath - Path to check
 * @returns True if file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fs.constants.F_OK);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "EACCES" || err.code === "EPERM") {
        throw error;
      }
    }
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
  if (!inputPath || typeof inputPath !== "string") {
    return inputPath;
  }

  if (inputPath === "~") {
    return os.homedir();
  }

  if (inputPath.startsWith("~/") || inputPath.startsWith("~\\")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }

  return inputPath;
}

/**
 * Expand environment variables in path
 * Supports: $VAR, ${VAR}, %VAR%
 * Also handles escape sequences: $$ and \$ become literal $
 * @param inputPath - Path with env vars
 * @returns Path with env vars expanded
 */
export function expandEnvVars(inputPath: string): string {
  if (!inputPath || typeof inputPath !== "string") {
    return inputPath;
  }

  const ESCAPE_MARKER = "\x00ENV_ESCAPE\x00";

  let result = inputPath;

  // Step 1: Escape literal dollar signs ($$ and \$ become placeholder)
  // $$ -> escape marker (literal $)
  result = result.replace(/\$\$/g, ESCAPE_MARKER);
  // \$ -> escape marker (literal $)
  result = result.replace(/\\\$/g, ESCAPE_MARKER);

  // Step 2: Expand Windows-style %VAR% first (they take precedence)
  result = result.replace(
    /%([^%]+)%/g,
    (_, name: string) => process.env[name] ?? "",
  );

  // Step 3: Expand ${VAR} - braces take precedence over bare $VAR
  result = result.replace(
    /\$\{([^}]+)\}/g,
    (_, name: string) => process.env[name] ?? "",
  );

  // Step 4: Expand $VAR (bare variable names)
  result = result.replace(
    /\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (_, name: string) => process.env[name] ?? "",
  );

  // Step 5: Restore escaped dollar signs to literal $
  result = result.replace(new RegExp(ESCAPE_MARKER, "g"), "$");

  return result;
}

/**
 * Normalize path for cross-platform compatibility
 * @param inputPath - Path to normalize
 * @returns Normalized path
 */
export function normalizePath(inputPath: string): string {
  if (!inputPath || typeof inputPath !== "string") {
    return inputPath;
  }

  // 1. Decode URI components (e.g. %2e%2e -> ..) to prevent bypasses
  // SECURITY FIX: Iterative decoding to prevent double-encoding bypass (%252e -> %2e -> .)
  // Example attack: %252e%252e%252f -> %2e%2e%2f -> ../
  try {
    let decoded = inputPath;
    let previous: string;
    let iterations = 0;
    const MAX_ITERATIONS = 3; // Prevent ReDoS attacks

    do {
      previous = decoded;
      decoded = decodeURIComponent(decoded);
      iterations++;
    } while (decoded !== previous && iterations < MAX_ITERATIONS);

    inputPath = decoded;
  } catch {
    // Malformed URI - continue with original path
    logger.debug("URI decode error, using original path");
  }

  // 2. Unicode Normalization (NFC)
  // Ensures consistent representation of characters
  inputPath = inputPath.normalize("NFC");

  // 3. Strip Null Bytes (prevent truncation attacks)
  inputPath = inputPath.replace(/\0/g, "");

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

  if (process.platform === "win32") {
    const relative = path.relative(
      normalizedParent.toLocaleLowerCase("en"),
      normalizedChild.toLocaleLowerCase("en"),
    );
    return (
      relative === "" ||
      (!relative.startsWith("..") && !path.isAbsolute(relative))
    );
  }

  const relative = path.relative(normalizedParent, normalizedChild);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}
