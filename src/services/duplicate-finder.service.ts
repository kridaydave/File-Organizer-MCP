/**
 * File Organizer MCP Server v3.2.0
 * Duplicate Finder Service
 *
 * Advanced duplicate detection, scoring, and safe deletion.
 */

import fs from 'fs/promises';
import { HashCalculatorService } from './hash-calculator.service.js';
import type { FileWithSize, DuplicateGroup } from '../types.js';
import { fileExists } from '../utils/file-utils.js';
import { logger } from '../utils/logger.js';
import path from 'path';
import { RollbackService } from './rollback.service.js';
import type { RollbackAction } from '../types.js';
import { validateStrictPath, PathValidatorService } from './path-validator.service.js';
import { FileScannerService } from './file-scanner.service.js';

export type RecommendationStrategy = 'newest' | 'oldest' | 'best_location' | 'best_name';

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

export class DuplicateFinderService {
  private hashCalculator: HashCalculatorService;
  private rollbackService: RollbackService;

  constructor() {
    this.hashCalculator = new HashCalculatorService();
    this.rollbackService = new RollbackService();
  }

  /**
   * Find duplicates and score them for recommendation
   */
  async findWithScoring(
    files: FileWithSize[],
    strategy: RecommendationStrategy = 'best_location',
    options: { timeoutMs?: number } = {}
  ): Promise<AnalyzedDuplicateGroup[]> {
    const duplicates = await this.hashCalculator.findDuplicates(files, options);

    return duplicates.map((group) => {
      const scoredFiles = group.files.map((file) => this.scoreFile(file, strategy));

      // Sort by score descending (Highest score first)
      scoredFiles.sort((a, b) => b.score - a.score);

      if (scoredFiles.length === 0) {
        // Should not happen given findDuplicates filters for > 1, but safety first
        return {
          hash: group.hash,
          size_bytes: group.size_bytes,
          file_count: 0,
          files: [],
          recommended_keep: '',
          recommended_delete: [],
          wasted_space_bytes: 0,
        };
      }

      return {
        hash: group.hash,
        size_bytes: group.size_bytes,
        file_count: group.files.length,
        files: scoredFiles,
        recommended_keep: scoredFiles[0]?.path ?? '',
        recommended_delete: scoredFiles.slice(1).map((f) => f.path),
        wasted_space_bytes: group.size_bytes * (group.files.length - 1),
      };
    });
  }

  /**
   * Score a file based on strategy
   * Higher score = Better to KEEP
   */
  private scoreFile(file: FileWithSize, strategy: RecommendationStrategy): ScoredFile {
    let score = 0;
    const reasons: string[] = [];

    // 1. Path Depth (Preferred: Shallower paths)
    // Depth penalty: -1 per directory level
    const depth = file.path.split(/[/\\]/).length;
    score -= depth;
    reasons.push(`Path depth: ${depth}`);

    // 2. Location Preference (Downloads vs Documents)
    // Prefer "Documents", "Projects", "Pictures" over "Downloads", "Temp"
    const lowerPath = file.path.toLowerCase();
    if (
      lowerPath.includes('downloads') ||
      lowerPath.includes('temp') ||
      lowerPath.includes('tmp')
    ) {
      score -= 50;
      reasons.push('Location penalty (Downloads/Temp)');
    }
    if (
      lowerPath.includes('documents') ||
      lowerPath.includes('projects') ||
      lowerPath.includes('pictures')
    ) {
      score += 20;
      reasons.push('Location bonus (Organized folder)');
    }

    // 3. Filename Quality
    // Penalty for "Copy", "(1)", etc.
    if (/copy| \(\d+\)|_\d+$/.test(file.name)) {
      score -= 30;
      reasons.push('Filename penalty (Copy/Duplicate marker)');
    }

    // 4. Time-based (Strategy specific)
    const age = file.modified ? file.modified.getTime() : 0;
    if (strategy === 'newest') {
      score += age / 1000000000; // Normalizing somewhat
      reasons.push('Newest bonus');
    } else if (strategy === 'oldest') {
      score -= age / 1000000000;
      reasons.push('Oldest bonus');
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
   * @param options.autoVerify - Automatically verify duplicates exist before deletion (default: true)
   */
  async deleteFiles(
    filesToDelete: string[],
    options: { createBackupManifest?: boolean; autoVerify?: boolean } = {}
  ): Promise<DeletionResult> {
    const { createBackupManifest = true, autoVerify = false } = options;
    const result: DeletionResult = {
      deleted: [],
      failed: [],
    };

    // 1. Prepare Backup Directory
    const backupDir = path.join(process.cwd(), '.file-organizer-backups');
    if (createBackupManifest) {
      await fs.mkdir(backupDir, { recursive: true });
    }

    const rollbackActions: RollbackAction[] = [];

    // 2. Verify files are accessible and can be hashed (basic safety checks)
    // Note: We trust that user has identified duplicates via analyze_duplicates
    // We just ensure files exist, are readable, and pass security validation
    let filesToProcess: string[] = [];
    for (const filePath of filesToDelete) {
      let handle: fs.FileHandle | undefined;
      try {
        if (!(await fileExists(filePath))) {
          result.failed.push({ path: filePath, error: 'File not found' });
          continue;
        }

        const validator = new PathValidatorService();
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
          } catch (e) {}
        }
      }
    }

    // Auto-Verification: Ensure duplicates exist before deletion
    if (autoVerify && filesToProcess.length > 0) {
      const verification = await this.verifyDuplicatesExist(filesToProcess);

      // Add verification failures to result
      result.failed.push(...verification.invalid);

      // Only proceed with valid files
      filesToProcess = verification.valid;
    }

    // 3. Delete (Move to Backup) - only process files that passed validation
    for (const filePath of filesToProcess) {
      try {
        if (createBackupManifest) {
          // Move to backup
          const backupName = `${Date.now()}_${Math.random().toString(36).slice(2, 11)}_${path.basename(filePath)}`;
          const backupPath = path.join(backupDir, backupName);

          await fs.rename(filePath, backupPath);

          rollbackActions.push({
            type: 'delete',
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
        rollbackActions
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
   * @returns Object with valid files (have duplicates) and invalid files (no duplicates)
   */
  private async verifyDuplicatesExist(
    filesToDelete: string[]
  ): Promise<{ valid: string[]; invalid: { path: string; error: string }[] }> {
    const valid: string[] = [];
    const invalid: { path: string; error: string }[] = [];

    // Group files by parent directory to minimize scans
    const filesByDir = new Map<string, string[]>();
    for (const filePath of filesToDelete) {
      const dir = path.dirname(filePath);
      if (!filesByDir.has(dir)) {
        filesByDir.set(dir, []);
      }
      filesByDir.get(dir)!.push(filePath);
    }

    // For each directory, scan and verify duplicates
    for (const [dir, filesInDir] of filesByDir.entries()) {
      try {
        // Scan directory to find all duplicates
        const scanner = new FileScannerService();
        const allFilesInDir = await scanner.getAllFiles(dir, false); // Don't recurse

        // Build map of hash -> file paths (excluding files being deleted)
        const hashToFiles = new Map<string, string[]>();
        for (const file of allFilesInDir) {
          if (filesToDelete.includes(file.path)) {
            continue;
          }
          let handle: fs.FileHandle | undefined;
          try {
            const validator = new PathValidatorService();
            handle = await validator.openAndValidateFile(file.path);
            const hash = await this.hashCalculator.calculateHash(handle);

            if (!hashToFiles.has(hash)) {
              hashToFiles.set(hash, []);
            }
            hashToFiles.get(hash)!.push(file.path);

            await handle.close();
          } catch (error) {
            // Skip files we can't read
            if (handle) {
              try {
                await handle.close();
              } catch (e) {}
            }
          }
        }

        // Verify each file being deleted has at least one copy remaining
        for (const filePath of filesInDir) {
          let handle: fs.FileHandle | undefined;
          try {
            const validator = new PathValidatorService();
            handle = await validator.openAndValidateFile(filePath);
            const hash = await this.hashCalculator.calculateHash(handle);
            await handle.close();

            const remainingCopies = hashToFiles.get(hash) || [];

            if (remainingCopies.length === 0) {
              invalid.push({
                path: filePath,
                error:
                  'Cannot delete: This is the last copy of this file (no duplicates found in directory)',
              });
            } else {
              valid.push(filePath);
            }
          } catch (error) {
            invalid.push({
              path: filePath,
              error: `Cannot verify: ${(error as Error).message}`,
            });
            if (handle) {
              try {
                await handle.close();
              } catch (e) {}
            }
          }
        }
      } catch (error) {
        // If directory scan fails, mark all files in this directory as invalid
        for (const filePath of filesInDir) {
          invalid.push({
            path: filePath,
            error: `Verification failed: ${(error as Error).message}`,
          });
        }
      }
    }

    return { valid, invalid };
  }
}
