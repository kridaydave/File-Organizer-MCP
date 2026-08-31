/**
 * File Organizer MCP Server v5.0.0
 * Duplicate Finder Service
 *
 * Advanced duplicate detection, scoring, and safe deletion.
 */

import fs from "fs/promises";
import crypto from "crypto";
import { HashCalculatorService } from "./hasher.js";
import type { FileWithSize, DuplicateGroup } from "../../types.js";
import { fileExists } from "../../utils/file-utils.js";
import { logger } from "../../utils/logger.js";
import path from "path";
import { RollbackService } from "../organize/rollback.js";
import type { RollbackAction } from "../../types.js";
import {
  validateStrictPath,
  PathValidatorService,
} from "../../services/path-validator.service.js";
import { FileScannerService } from "../scan/scanner.js";
import { getBackupDirectory } from "../config/paths.js";

export type RecommendationStrategy =
  | "newest"
  | "oldest"
  | "best_location"
  | "best_name";

export interface ScoredFile {
  path: string;
  score: number;
  reasons: string[];
}

export interface AnalyzedDuplicateGroup {
  hash: string;
  size_bytes: number;
  file_count: number;
  files: ScoredFile[];
  recommended_keep: string;
  recommended_delete: string[];
  wasted_space_bytes: number;
}

export interface DeletionResult {
  deleted: string[];
  failed: { path: string; error: string }[];
  manifestPath?: string;
}

async function safeMoveFile(src: string, dest: string): Promise<void> {
  try {
    await fs.rename(src, dest);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error && (error.code === "EXDEV" || error.message?.includes("EXDEV"))) {
      await fs.copyFile(src, dest);
      await fs.unlink(src);
    } else {
      throw err;
    }
  }
}

export class DuplicateFinderService {
  private hashCalculator: HashCalculatorService;
  private rollbackService: RollbackService;
  private fileScanner: FileScannerService;
  private pathValidator: PathValidatorService;

  constructor(pathValidator?: PathValidatorService) {
    this.hashCalculator = new HashCalculatorService();
    this.rollbackService = new RollbackService();
    this.fileScanner = new FileScannerService();
    this.pathValidator = pathValidator ?? new PathValidatorService();
  }

  /**
   * Find duplicates and score them for recommendation
   */
  async findWithScoring(
    files: FileWithSize[],
    strategy: RecommendationStrategy = "best_location",
    options: { timeoutMs?: number } = {},
  ): Promise<AnalyzedDuplicateGroup[]> {
    // Explicitly filter out 0-byte (empty) files from duplicate detection
    const nonZeroFiles = files.filter((file) => file.size > 0);
    const duplicates = await this.hashCalculator.findDuplicates(
      nonZeroFiles,
      options,
    );

    return duplicates
      .filter((group) => group.size_bytes > 0)
      .map((group) => {
      const scoredFiles = group.files.map((file) =>
        this.scoreFile(file, strategy),
      );

      // Sort by score descending (Highest score first)
      scoredFiles.sort((a, b) => b.score - a.score);

      if (scoredFiles.length === 0) {
        // Should not happen given findDuplicates filters for > 1, but safety first
        return {
          hash: group.hash,
          size_bytes: group.size_bytes,
          file_count: 0,
          files: [],
          recommended_keep: "",
          recommended_delete: [],
          wasted_space_bytes: 0,
        };
      }

      return {
        hash: group.hash,
        size_bytes: group.size_bytes,
        file_count: group.files.length,
        files: scoredFiles,
        recommended_keep: scoredFiles[0]?.path ?? "",
        recommended_delete: scoredFiles.slice(1).map((f) => f.path),
        wasted_space_bytes: group.size_bytes * (group.files.length - 1),
      };
    });
  }

  /**
   * Score a file based on strategy
   * Higher score = Better to KEEP
   */
  private scoreFile(
    file: FileWithSize,
    strategy: RecommendationStrategy,
  ): ScoredFile {
    let score = 0;
    const reasons: string[] = [];

    // 1. Path Depth (Preferred: Shallower paths)
    // Depth penalty: -1 per directory level
    const normalizedPath = path.normalize(file.path);
    const depth = normalizedPath.split(/[/\\]/).filter(Boolean).length - 1;
    score -= depth;
    reasons.push(`Path depth: ${depth}`);

    // 2. Location Preference (Downloads vs Documents)
    // Prefer "Documents", "Projects", "Pictures" over "Downloads", "Temp"
    const lowerPath = file.path.toLowerCase();
    if (
      lowerPath.includes("downloads") ||
      lowerPath.includes("temp") ||
      lowerPath.includes("tmp")
    ) {
      score -= 50;
      reasons.push("Location penalty (Downloads/Temp)");
    }
    if (
      lowerPath.includes("documents") ||
      lowerPath.includes("projects") ||
      lowerPath.includes("pictures")
    ) {
      score += 20;
      reasons.push("Location bonus (Organized folder)");
    }

    // 3. Filename Quality
    // Penalty for "Copy", "(1)", etc.
    if (/copy| \(\d+\)|_\d+$/.test(file.name)) {
      score -= 30;
      reasons.push("Filename penalty (Copy/Duplicate marker)");
    }

    // 4. Time-based (Strategy specific)
    // Calculate age in days relative to now
    let ageInDays = 0;
    if (file.modified) {
      const ageMs = Date.now() - file.modified.getTime();
      ageInDays = ageMs / (1000 * 60 * 60 * 24);
    } else {
      reasons.push("No modification date available");
    }

    if (strategy === "newest") {
      // Newer files get higher score (no cap - raw subtraction)
      // ageInDays is smaller for newer files, so 50 - smaller = higher score
      const newestBonus = 50 - ageInDays * 0.5;
      score += newestBonus;
      reasons.push(
        `Newest bonus (${newestBonus >= 0 ? "+" : ""}${newestBonus.toFixed(1)})`,
      );
    } else if (strategy === "oldest") {
      // Older files get higher score
      // ageInDays is larger for older files
      const oldestBonus = ageInDays * 0.5;
      score += oldestBonus;
      reasons.push(`Oldest bonus (+${oldestBonus.toFixed(1)})`);
    }

    return {
      path: file.path,
      score,
      reasons,
    };
  }

  /**
   * Safely delete files with verification and manifest
   *
   * @param filesToDelete - Array of file paths to delete
   * @param options - Deletion options
   * @param options.createBackupManifest - Create backup and rollback manifest (default: true)
   * @param options.autoVerify - Automatically verify duplicates exist before deletion (default: false, WARNING: disabling verification may cause data loss)
   */
  async deleteFiles(
    filesToDelete: string[],
    options:
      | boolean
      | {
          createBackupManifest?: boolean;
          autoVerify?: boolean;
          candidateDirectories?: string[];
        } = {},
  ): Promise<DeletionResult> {
    const opts =
      typeof options === "boolean" ? { autoVerify: options } : options;
    const {
      createBackupManifest = true,
      autoVerify = false,
      candidateDirectories = [],
    } = opts;

    if (!autoVerify) {
      logger.warn(
        "autoVerify is disabled - file deletion proceeds without verification. This may cause data loss if file paths are invalid.",
      );
    }

    // Validate input: check for empty array and deduplicate paths
    if (!Array.isArray(filesToDelete) || filesToDelete.length === 0) {
      logger.warn("No files provided for deletion");
      return { deleted: [], failed: [] };
    }

    // Deduplicate paths in the array
    const uniquePaths = [...new Set(filesToDelete)];

    const result: DeletionResult = {
      deleted: [],
      failed: [],
    };

    // 1. Prepare Backup Directory
    const backupDir = getBackupDirectory();
    if (createBackupManifest) {
      await fs.mkdir(backupDir, { recursive: true });
    }

    const rollbackActions: RollbackAction[] = [];

    // 2. Verify files are accessible and can be hashed (basic safety checks)
    // Note: We trust that user has identified duplicates via analyze_duplicates
    // We just ensure files exist, are readable, and pass security validation
    let filesToProcess: string[] = [];
    for (const filePath of uniquePaths) {
      let handle: fs.FileHandle | undefined;
      try {
        if (!(await fileExists(filePath))) {
          result.failed.push({ path: filePath, error: "File not found" });
          continue;
        }

        const validator = this.pathValidator;
        handle = await validator.openAndValidateFile(filePath);

        // Verify file can be read/hashed
        await this.hashCalculator.calculateHash(handle);

        filesToProcess.push(filePath);
      } catch (error) {
        result.failed.push({ path: filePath, error: (error as Error).message });
      } finally {
        if (handle) {
          try {
            await handle.close();
          } catch (e) {
            logger.debug("Failed to close file handle", e as Error);
          }
        }
      }
    }

    // Auto-Verification: Ensure duplicates exist before deletion
    if (autoVerify && filesToProcess.length > 0) {
      const verification = await this.verifyDuplicatesExist(
        filesToProcess,
        candidateDirectories,
      );

      // Add verification failures to result
      result.failed.push(...verification.invalid);

      // Only proceed with valid files
      filesToProcess = verification.valid;
    }

    // 3. Delete (Move to Backup) - only process files that passed validation
    for (const filePath of filesToProcess) {
      try {
        if (createBackupManifest) {
          // Move to backup - use path.parse to safely extract filename components
          // and sanitize to prevent path traversal attacks
          const parsed = path.parse(filePath);
          const safeExt = (parsed.ext || ".bin").replace(/[^a-zA-Z0-9.]/g, "");
          const safeName =
            parsed.name.replace(/[^a-zA-Z0-9_-]/g, "") || "file";
          const backupName = `${crypto.randomUUID()}_${Date.now()}_${safeName}${safeExt}`;
          const backupPath = path.join(backupDir, backupName);

          await safeMoveFile(filePath, backupPath);

          rollbackActions.push({
            type: "delete",
            originalPath: filePath,
            backupPath: backupPath,
            timestamp: Date.now(),
          });

          result.deleted.push(filePath);
        } else {
          // Permanent Delete (Legacy/Unsafe mode)
          await fs.unlink(filePath);
          result.deleted.push(filePath);
        }
      } catch (error) {
        result.failed.push({ path: filePath, error: (error as Error).message });
      }
    }

    // 3. Create Manifest
    if (createBackupManifest && rollbackActions.length > 0) {
      const manifestId = await this.rollbackService.createManifest(
        `Deletion of ${rollbackActions.length} duplicates`,
        rollbackActions,
      );
      result.manifestPath = manifestId;
    }

    return result;
  }

  /**
   * Verify that duplicates exist for files being deleted
   * Scans parent directories to ensure at least one copy remains
   *
   * @param filesToDelete - Files that will be deleted
   * @param candidateDirectories - Optional additional directories to scan
   * @returns Object with valid files (have duplicates) and invalid files (no duplicates)
   */
  private async verifyDuplicatesExist(
    filesToDelete: string[],
    candidateDirectories: string[] = [],
  ): Promise<{ valid: string[]; invalid: { path: string; error: string }[] }> {
    const valid: string[] = [];
    const invalid: { path: string; error: string }[] = [];

    // Collect all directories to scan
    const dirsToScan = new Set<string>(candidateDirectories);
    for (const filePath of filesToDelete) {
      const parent = path.dirname(filePath);
      dirsToScan.add(parent);
      const grandParent = path.dirname(parent);
      if (grandParent && grandParent !== parent) {
        dirsToScan.add(grandParent);
      }
    }

    // Build unified map of hash -> surviving file paths across all scanned directories
    const hashToFiles = new Map<string, string[]>();
    for (const dir of dirsToScan) {
      try {
        const allFilesInDir = await this.fileScanner.getAllFiles(dir, true);
        for (const file of allFilesInDir) {
          if (filesToDelete.includes(file.path)) {
            continue;
          }
          let handle: fs.FileHandle | undefined;
          try {
            const validator = this.pathValidator;
            handle = await validator.openAndValidateFile(file.path);
            const hash = await this.hashCalculator.calculateHash(handle);

            if (!hashToFiles.has(hash)) {
              hashToFiles.set(hash, []);
            }
            hashToFiles.get(hash)!.push(file.path);
          } catch (error) {
            logger.debug(
              `Skipping file during verification: ${file.path}`,
              error as Error,
            );
          } finally {
            if (handle) {
              try {
                await handle.close();
              } catch (e) {
                logger.debug(
                  "Failed to close file handle during verification",
                  e as Error,
                );
              }
            }
          }
        }
      } catch (error) {
        logger.warn(
          `Could not scan directory during verification: ${dir}`,
          error as Error,
        );
      }
    }

    // Verify each file being deleted has at least one surviving copy in hashToFiles
    for (const filePath of filesToDelete) {
      let handle: fs.FileHandle | undefined;
      try {
        const validator = this.pathValidator;
        handle = await validator.openAndValidateFile(filePath);
        const hash = await this.hashCalculator.calculateHash(handle);

        const remainingCopies = hashToFiles.get(hash) || [];

        if (remainingCopies.length === 0) {
          invalid.push({
            path: filePath,
            error:
              "Cannot delete: This is the last copy of this file (no duplicates found)",
          });
        } else {
          valid.push(filePath);
        }
      } catch (error) {
        invalid.push({
          path: filePath,
          error: `Cannot verify: ${(error as Error).message}`,
        });
      } finally {
        if (handle) {
          try {
            await handle.close();
          } catch (e) {
            logger.debug(
              "Failed to close file handle during verification",
              e as Error,
            );
          }
        }
      }
    }

    return { valid, invalid };
  }
}
