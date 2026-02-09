/**
 * File Organizer MCP Server v3.2.0
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

import fs from 'fs/promises'; // for promise-based methods
import { constants } from 'fs'; // for constants (O_NOFOLLOW, etc)
import path from 'path';
import { AccessDeniedError, ValidationError } from '../types.js';
import { normalizePath, isSubPath } from '../utils/file-utils.js';
import { PathSchema } from '../schemas/security.schemas.js';
import { CONFIG } from '../config.js';

/**
 * Layer 1: Type validation
 */
function validateType(inputPath: unknown): string {
  const result = PathSchema.safeParse(inputPath);
  if (!result.success) {
    throw new ValidationError(result.error.issues[0]?.message ?? 'Invalid path');
  }
  return result.data;
}

/**
 * Layer 5: Resolve symlinks to get real path
 */
async function resolveSymlinks(
  absolutePath: string
): Promise<{ realPath: string; exists: boolean }> {
  try {
    const realPath = await fs.realpath(absolutePath);
    return { realPath, exists: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      // Intercept symlink loops specifically
      throw new AccessDeniedError(absolutePath, 'Circular symlink detected');
    }
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // Try to resolve the parent of the non-existent path
      const parentDir = path.dirname(absolutePath);
      try {
        const realParent = await fs.realpath(parentDir);
        // Re-append the non-existent part to the resolved parent path
        const realPath = path.join(realParent, path.basename(absolutePath));
        return { realPath, exists: false };
      } catch (parentError) {
        if ((parentError as NodeJS.ErrnoException).code === 'ELOOP') {
          throw new AccessDeniedError(absolutePath, 'Circular symlink detected in parent path');
        }
        // If the parent also doesn't exist or has issues, return the original path
        return { realPath: absolutePath, exists: false };
      }
    }
    // Re-throw other unexpected errors
    throw error;
  }
}

/**
 * Layer 6: Containment check
 */
function checkContainment(realPath: string, allowedPaths: string | string[]): boolean {
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
  options: { requireExists?: boolean; checkWrite?: boolean }
): Promise<boolean> {
  const { requireExists = false, checkWrite = false } = options;

  try {
    const mode = checkWrite ? fs.constants.R_OK | fs.constants.W_OK : fs.constants.R_OK;
    await fs.access(realPath, mode);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      if (requireExists) {
        return false;
      }
      // If the path doesn't exist and we don't require it to, check if we could create it.
      // This requires checking the parent directory for write permissions.
      let parentDir = path.dirname(realPath);
      while (parentDir && parentDir !== path.dirname(parentDir)) {
        try {
          await fs.access(parentDir, fs.constants.W_OK);
          // Found a writable parent directory
          return true;
        } catch (parentError) {
          if ((parentError as NodeJS.ErrnoException).code === 'ENOENT') {
            // Parent doesn't exist, so try the grandparent
            parentDir = path.dirname(parentDir);
          } else {
            // A different error occurred (e.g., EACCES), so we can't write.
            return false;
          }
        }
      }
      return false;
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
  options: ValidatePathOptions = {}
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
    throw new ValidationError('Path contains invalid characters after variable expansion');
  }
  if (expandedPath.length > 4096) {
    throw new ValidationError('Path exceeds maximum length (4096)');
  }

  // Layer 3.5: Block Windows Reserved Names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
  const baseName = path.basename(expandedPath).toUpperCase();
  // Check exact match or name with extension (e.g. CON.txt is also invalid on Windows)
  const nameWithoutExt = baseName.split('.')[0] ?? '';
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(nameWithoutExt)) {
    throw new ValidationError(`Path contains Windows reserved name: ${baseName}`);
  }

  // Layer 4: Resolve to an absolute path
  const absolutePath = path.resolve(basePath, expandedPath);

  // Layer 4.5: Security check (whitelist/blacklist)
  if (CONFIG.security.enablePathValidation) {
    const { isPathAllowed, formatAccessDeniedMessage } = await import('../utils/path-security.js');
    const validation = isPathAllowed(absolutePath);
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
        throw new ValidationError('Symlink traversal detected (Symlinks are not allowed)');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Does not exist, proceed to resolution failing or handling it later
      } else {
        throw error;
      }
    }
  }

  // Layer 5: Symlink resolution
  let realPath: string;
  if (allowSymlinks) {
    const result = await resolveSymlinks(absolutePath);
    realPath = result.realPath;
  } else {
    realPath = absolutePath;
  }

  // Layer 6: Containment check (if allowed paths specified)
  if (allowedPaths !== null) {
    const isContained = checkContainment(realPath, allowedPaths);
    if (!isContained) {
      // Use the original raw path in the error for clarity
      throw new AccessDeniedError(rawValidatedPath, 'Path is outside the allowed directory');
    }
  }

  // Layer 7: Access check
  if (requireExists || checkWrite) {
    const accessible = await checkAccess(realPath, { requireExists, checkWrite });
    if (!accessible) {
      throw new AccessDeniedError(rawValidatedPath, 'Path is not accessible');
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
      this.allowedPaths = CONFIG.security.enablePathValidation ? null : [this.basePath];
    }
  }

  async validatePath(
    inputPath: unknown,
    options: Omit<ValidatePathOptions, 'basePath' | 'allowedPaths'> = {}
  ): Promise<string> {
    return validatePathBase(inputPath, {
      ...options,
      basePath: this.basePath,
      allowedPaths: this.allowedPaths,
    });
  }

  isPathAllowed(inputPath: string): boolean {
    try {
      const absolutePath = path.resolve(this.basePath, normalizePath(inputPath));
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
    // 1. Validate the path string first (checks permissions, whitelist, etc.)
    await this.validatePath(inputPath, { allowSymlinks: false });

    // 2. Resolve the absolute path manually to ensuring we open the exact path we requested
    const absolutePath = path.resolve(this.basePath, normalizePath(inputPath));

    // 3. Open with O_NOFOLLOW to ensure we don't follow symlinks at the last mile
    try {
      // Use constants directly from 'fs' import
      // constants.O_RDONLY | constants.O_NOFOLLOW
      const handle = await fs.open(absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW);

      try {
        const stats = await handle.stat();
        if (!stats.isFile()) {
          throw new ValidationError('Path is not a file');
        }
        return handle;
      } catch (statError) {
        await handle.close();
        throw statError;
      }
    } catch (error) {
      if ((error as any).code === 'ELOOP') {
        throw new ValidationError('Symlink traversal detected (O_NOFOLLOW blocked)');
      }
      throw error;
    }
  }
}
