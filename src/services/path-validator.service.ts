/**
 * File Organizer MCP Server v3.4.1
 * Path Validator Service
 *
 * Implements 8-layer path validation for security:
 * 1. Type validation
 * 2. Expansion (env vars, ~)
 * 3. Character/length validation
 * 4. Absolute path resolution
 * 4.5. Security check (whitelist/blacklist)
 * 5. Symlink resolution
 * 6. Containment check
 * 7. Access permissions
 */

import fs from "fs/promises"; // for promise-based methods
import { constants } from "fs"; // for constants (O_NOFOLLOW, etc)
import path from "path";
import { AccessDeniedError, ValidationError } from "../types.js";
import { normalizePath, isSubPath } from "../utils/file-utils.js";
import { sanitizeErrorMessage } from "../utils/error-handler.js";
import { PathSchema } from "../schemas/security.schemas.js";
import { logger } from "../utils/logger.js";
import { CONFIG } from "../config.js";

/**
 * Layer 1: Type validation
 */
function validateType(inputPath: unknown): string {
  const result = PathSchema.safeParse(inputPath);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues[0]?.message ?? "Invalid path",
    );
  }
  return result.data;
}

/**
 * Layer 5: Resolve symlinks to get real path with containment verification
 * Security: Checks containment at each step of symlink resolution to prevent
 * symlink traversal attacks where a parent directory symlink escapes allowed roots
 */
async function resolveSymlinks(
  absolutePath: string,
  allowedPaths: string[] | null,
): Promise<{ realPath: string; exists: boolean }> {
  // First try to resolve the full path
  try {
    const realPath = await fs.realpath(absolutePath);
    // Verify the resolved path is still within bounds (skip in whitelist mode)
    if (allowedPaths !== null && !checkContainment(realPath, allowedPaths)) {
      throw new AccessDeniedError(
        absolutePath,
        "Path escapes allowed directories via symlink",
      );
    }
    return { realPath, exists: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ELOOP") {
      // Intercept symlink loops specifically
      throw new AccessDeniedError(absolutePath, "Circular symlink detected");
    }
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // Component-by-component resolution for non-existent paths
      // This prevents symlink traversal where parent is a symlink to /etc
      let currentPath = absolutePath;
      const components: string[] = [];

      while (currentPath !== path.dirname(currentPath)) {
        try {
          const realPath = await fs.realpath(currentPath);
          // CRITICAL: Verify resolved path is within bounds BEFORE proceeding (skip in whitelist mode)
          if (
            allowedPaths !== null &&
            !checkContainment(realPath, allowedPaths)
          ) {
            throw new AccessDeniedError(
              absolutePath,
              "Path escapes allowed directories via symlink",
            );
          }

          // Re-append any non-existent components to the resolved path
          const finalPath = path.join(realPath, ...components);
          // CRITICAL: Verify the FULL resolved path is also within bounds (skip in whitelist mode)
          if (
            allowedPaths !== null &&
            !checkContainment(finalPath, allowedPaths)
          ) {
            throw new AccessDeniedError(
              absolutePath,
              "Path escapes allowed directories via symlink",
            );
          }

          return {
            realPath: finalPath,
            exists: false,
          };
        } catch (innerError) {
          if ((innerError as NodeJS.ErrnoException).code === "ELOOP") {
            throw new AccessDeniedError(
              absolutePath,
              "Circular symlink detected",
            );
          }
          if ((innerError as NodeJS.ErrnoException).code === "ENOENT") {
            // Component doesn't exist yet, move up and remember it
            components.unshift(path.basename(currentPath));
            currentPath = path.dirname(currentPath);

            // CRITICAL: Check that the current parent path is still within allowed bounds
            // before continuing to resolve higher components (skip in whitelist mode)
            if (
              allowedPaths !== null &&
              !checkContainment(currentPath, allowedPaths)
            ) {
              throw new AccessDeniedError(
                absolutePath,
                "Path escapes allowed directories via symlink",
              );
            }
          } else if (innerError instanceof AccessDeniedError) {
            throw innerError;
          } else {
            throw innerError;
          }
        }
      }

      // Exhausted all components without finding an existing path
      // Verify the original absolute path is still contained (skip in whitelist mode)
      if (
        allowedPaths !== null &&
        !checkContainment(absolutePath, allowedPaths)
      ) {
        throw new AccessDeniedError(
          absolutePath,
          "Path escapes allowed directories",
        );
      }

      return { realPath: absolutePath, exists: false };
    }
    if (error instanceof AccessDeniedError) {
      throw error;
    }
    // Re-throw other unexpected errors
    throw error;
  }
}

/**
 * Layer 6: Containment check
 */
function checkContainment(
  realPath: string,
  allowedPaths: string | string[],
): boolean {
  const paths = Array.isArray(allowedPaths) ? allowedPaths : [allowedPaths];
  return paths.some((allowed) => isSubPath(allowed, realPath));
}

/**
 * Layer 7: Check file/directory access permissions
 * @param realPath - The resolved real path to check
 * @param options - Options for access check
 * @param options.requireExists - Whether the path must exist
 * @param options.checkWrite - Whether write permission is required
 * @returns Promise<boolean> - Resolves to true if access is allowed, false otherwise
 * @throws {AccessDeniedError} When path resolution encounters circular symlinks
 * @throws {Error} When unexpected filesystem errors occur during access check
 */
export async function checkAccess(
  realPath: string,
  options: { requireExists?: boolean; checkWrite?: boolean },
): Promise<boolean> {
  const { requireExists = false, checkWrite = false } = options;

  try {
    const mode = checkWrite
      ? fs.constants.R_OK | fs.constants.W_OK
      : fs.constants.R_OK;
    await fs.access(realPath, mode);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      if (requireExists) {
        return false;
      }
      // If the path doesn't exist and we don't require it to, check if we could create it.
      // This requires checking the parent directory for write permissions.
      let parentDir = path.dirname(realPath);
      while (parentDir && parentDir !== path.dirname(parentDir)) {
        try {
          await fs.access(parentDir, fs.constants.W_OK);
          return true;
        } catch (parentError) {
          const sanitizedError = sanitizeErrorMessage(
            parentError instanceof Error
              ? parentError.message
              : String(parentError),
          );
          if ((parentError as NodeJS.ErrnoException).code === "ENOENT") {
            parentDir = path.dirname(parentDir);
          } else {
            logger.debug("Unexpected error in checkAccess parent check", {
              path: parentDir,
              error: sanitizedError,
            });
            return false;
          }
        }
      }
      return false;
    }
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.debug("Unexpected error in checkAccess", {
        path: realPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return false;
  }
}

export interface ValidatePathOptions {
  basePath?: string;
  allowedPaths?: string | string[] | null;
  requireExists?: boolean;
  checkWrite?: boolean;
  allowSymlinks?: boolean;
}

/**
 * Full path validation pipeline
 */
export async function validatePathBase(
  inputPath: unknown,
  options: ValidatePathOptions = {},
): Promise<string> {
  const {
    basePath = process.cwd(),
    allowedPaths = null,
    requireExists = false,
    checkWrite = false,
    allowSymlinks = true,
  } = options;

  // Layer 1: Type check on raw input
  const rawValidatedPath = validateType(inputPath);

  // Layer 2: Expand environment variables and home directory first
  const expandedPath = normalizePath(rawValidatedPath);

  // Layer 3: Suspicious character check & Length check on the *expanded* path
  if (/[<>"|?*\x00-\x1f]/.test(expandedPath)) {
    throw new ValidationError(
      "Path contains invalid characters after variable expansion",
    );
  }
  if (expandedPath.length > 4096) {
    throw new ValidationError("Path exceeds maximum length (4096)");
  }

  // Layer 3.5: Block Windows Reserved Names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
  const baseName = path.basename(expandedPath).toUpperCase();
  // Check exact match or name with extension (e.g. CON.txt is also invalid on Windows)
  const nameWithoutExt = baseName.split(".")[0] ?? "";
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(nameWithoutExt)) {
    throw new ValidationError(
      `Path contains Windows reserved name: ${baseName}`,
    );
  }

  // Layer 4: Resolve to an absolute path
  const absolutePath = path.resolve(basePath, expandedPath);

  // Layer 4.5: Security check (whitelist/blacklist)
  if (CONFIG.security.enablePathValidation) {
    const { isPathAllowed, formatAccessDeniedMessage } =
      await import("../utils/path-security.js");
    const validation = await isPathAllowed(absolutePath);
    if (!validation.allowed) {
      const message = formatAccessDeniedMessage(rawValidatedPath, validation);
      throw new AccessDeniedError(rawValidatedPath, message);
    }
  }

  // Check for symlinks if disallowed (Before resolution)
  if (!allowSymlinks) {
    try {
      const stats = await fs.lstat(absolutePath);
      if (stats.isSymbolicLink()) {
        throw new ValidationError(
          "Symlink traversal detected (Symlinks are not allowed)",
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // Does not exist, proceed to resolution failing or handling it later
      } else {
        throw error;
      }
    }
  }

  // Layer 5: Symlink resolution
  let realPath: string;
  if (allowSymlinks) {
    // In whitelist mode (allowedPaths is null), pass null to skip containment checks in resolveSymlinks
    // The whitelist check already happens at Layer 4.5 before we get here
    const allowedPathsArray =
      allowedPaths === null
        ? null
        : Array.isArray(allowedPaths)
          ? allowedPaths
          : allowedPaths
            ? [allowedPaths]
            : [];
    const result = await resolveSymlinks(absolutePath, allowedPathsArray);
    realPath = result.realPath;
  } else {
    realPath = absolutePath;
  }

  // Layer 6: Containment check (if allowed paths specified)
  if (allowedPaths !== null) {
    const isContained = checkContainment(realPath, allowedPaths);
    if (!isContained) {
      // Use the original raw path in the error for clarity
      throw new AccessDeniedError(
        rawValidatedPath,
        "Path is outside the allowed directory",
      );
    }
  }

  // Layer 7: Access check
  if (requireExists || checkWrite) {
    const accessible = await checkAccess(realPath, {
      requireExists,
      checkWrite,
    });
    if (!accessible) {
      throw new AccessDeniedError(rawValidatedPath, "Path is not accessible");
    }
  }

  return realPath;
}

/**
 * Validate path in STRICT mode (CWD-only access)
 */
export async function validateStrictPath(inputPath: unknown): Promise<string> {
  const cwd = process.cwd();
  // If security validation is enabled, we default to Whitelist mode (Layer 4.5)
  // and disable implicit CWD containment (Layer 6) by passing null.
  // If disabled, we fallback to strict CWD containment.
  const allowedPaths = CONFIG.security.enablePathValidation ? null : [cwd];

  return validatePathBase(inputPath, {
    basePath: cwd,
    allowedPaths: allowedPaths,
  });
}

/**
 * Path Validator Service class for dependency injection
 */
export class PathValidatorService {
  private readonly basePath: string;
  private readonly allowedPaths: string[] | null;

  constructor(basePath?: string, allowedPaths?: string[]) {
    this.basePath = basePath ?? process.cwd();

    if (allowedPaths) {
      this.allowedPaths = allowedPaths;
    } else {
      // If secure validation is enabled, we rely on the whitelist (Layer 4.5)
      // and disable the implicit CWD restriction (Layer 6) by setting allowedPaths to null.
      // If disabled, we fallback to legacy CWD restriction.
      this.allowedPaths = CONFIG.security.enablePathValidation
        ? null
        : [this.basePath];
    }
  }

  async validatePath(
    inputPath: unknown,
    options: Omit<ValidatePathOptions, "basePath" | "allowedPaths"> = {},
  ): Promise<string> {
    return validatePathBase(inputPath, {
      ...options,
      basePath: this.basePath,
      allowedPaths: this.allowedPaths,
    });
  }

  isPathAllowed(inputPath: string): boolean {
    try {
      const absolutePath = path.resolve(
        this.basePath,
        normalizePath(inputPath),
      );
      // If allowedPaths is null (whitelist mode), this checking is skipped here
      // because strict validation happens in validatePath via Layer 4.5
      if (this.allowedPaths === null) return true;

      return checkContainment(absolutePath, this.allowedPaths);
    } catch {
      return false;
    }
  }

  /**
   * securely open a file for reading, returning a FileHandle
   * Mitigates TOCTOU by ensuring the file validated is the one opened
   */
  async openAndValidateFile(inputPath: string): Promise<fs.FileHandle> {
    // CRIT-002 FIX: Eliminate TOCTOU race by opening first, validating after
    // Resolve the absolute path for opening
    const absolutePath = path.resolve(this.basePath, normalizePath(inputPath));

    // Pre-check: Verify path is within basePath before attempting open
    // This prevents OS-level permission errors from leaking through
    const normalizedBasePath = path.resolve(this.basePath);
    if (
      !absolutePath.startsWith(normalizedBasePath) &&
      !absolutePath.toLowerCase().startsWith(normalizedBasePath.toLowerCase())
    ) {
      // Check if we have allowedPaths for more precise validation
      if (this.allowedPaths !== null) {
        if (!checkContainment(absolutePath, this.allowedPaths)) {
          throw new AccessDeniedError(
            inputPath,
            "File outside allowed directory",
          );
        }
      } else {
        // In whitelist mode, at minimum check it's under basePath
        throw new AccessDeniedError(
          inputPath,
          "File outside allowed directory",
        );
      }
    }

    try {
      // Open atomically with O_NOFOLLOW - single syscall, no race window
      const handle = await fs.open(
        absolutePath,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );

      try {
        // Post-open validation only - no pre-validation race window
        const stats = await handle.stat();
        if (!stats.isFile()) {
          await handle.close();
          throw new ValidationError("Path is not a file");
        }

        // Verify containment using realpath after open
        const realPath = await fs.realpath(absolutePath);
        if (
          this.allowedPaths !== null &&
          !checkContainment(realPath, this.allowedPaths)
        ) {
          await handle.close();
          throw new AccessDeniedError(
            inputPath,
            "File outside allowed directory",
          );
        }

        return handle;
      } catch (validationError) {
        await handle.close();
        throw validationError;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ELOOP") {
        throw new ValidationError(
          "Symlink traversal detected (O_NOFOLLOW blocked)",
        );
      }
      throw error;
    }
  }
}
