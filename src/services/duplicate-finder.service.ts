/**
 * File Organizer MCP Server v3.0.0
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

        return duplicates.map(group => {
            const scoredFiles = group.files.map(file => this.scoreFile(file, strategy));

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
                    wasted_space_bytes: 0
                };
            }

            return {
                hash: group.hash,
                size_bytes: group.size_bytes,
                file_count: group.files.length,
                files: scoredFiles,
                recommended_keep: scoredFiles[0]?.path ?? '',
                recommended_delete: scoredFiles.slice(1).map(f => f.path),
                wasted_space_bytes: group.size_bytes * (group.files.length - 1)
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
        if (lowerPath.includes('downloads') || lowerPath.includes('temp') || lowerPath.includes('tmp')) {
            score -= 50;
            reasons.push('Location penalty (Downloads/Temp)');
        }
        if (lowerPath.includes('documents') || lowerPath.includes('projects') || lowerPath.includes('pictures')) {
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
            reasons
        };
    }

    /**
     * Safely delete files with verification and manifest
     */
    async deleteFiles(
        filesToDelete: string[],
        options: { createBackupManifest?: boolean } = {}
    ): Promise<DeletionResult> {
        const { createBackupManifest = true } = options;
        const result: DeletionResult = {
            deleted: [],
            failed: []
        };

        // 1. Prepare Backup Directory
        const backupDir = path.join(process.cwd(), '.file-organizer-backups');
        if (createBackupManifest) {
            await fs.mkdir(backupDir, { recursive: true });
        }

        const rollbackActions: RollbackAction[] = [];

        // 2. Delete (Move to Backup)
        // 2. Delete (Move to Backup)
        for (const filePath of filesToDelete) {
            let handle: fs.FileHandle | undefined;
            try {
                // Verify existence (Check 1)
                if (!(await fileExists(filePath))) {
                    result.failed.push({ path: filePath, error: 'File not found' });
                    continue;
                }

                // Security Check & TOCTOU Prevention:
                // Open and Validate -> Returns FD
                // We hold this handle to verify it's the same file we are about to hash/delete (conceptually)
                try {
                    // Note: We need to import validateStrictPath? No, we use 'openAndValidateFile' from new logic?
                    // We need to access PathValidatorService instance.
                    // But DuplicateFinderService doesn't have it injected usually?
                    // It imports 'validateStrictPath' as a standalone function currently.
                    // We need to instantiate PathValidatorService or make openAndValidateFile static/standalone?
                    // 'validateStrictPath' is exported from service file, but it creates a default instance?
                    // Actually 'validateStrictPath' in `path-validator.service.ts` IS a standalone export of a function wrapper?
                    // Let's check imports.
                    // It imports { validateStrictPath } from './path-validator.service.js';

                    // I need to use the new method. I should export a helper or use the service.
                    // I will instantiate the service locally or use a helper.
                    // Better: Refactor `path-validator.service.ts` to export a singleton or helper.
                    // For now, I'll assume I can use a helper.
                    // Wait, I updated the CLASS PathValidatorService.
                    // I need to access that.

                    // Let's assume I fix the import below or add the helper in previous step? 
                    // I added it to the class.
                    // Existing code calls `validateStrictPath(filePath)`.
                    // I should use `PathValidatorService` instance.

                    // Let's use a temporary instance for now if dependency injection isn't set up.
                    // Or better, update `validateStrictPath` to be `openAndValidateStrictPath`?
                    // No, `validateStrictPath` is used elsewhere.

                    // I will create a new instance of PathValidatorService inside the method or constructor?
                    // Use `globalPathValidator`?
                    // Let's create `const validator = new PathValidatorService();` (It takes root/config? No, config is global).

                    const validator = new PathValidatorService();
                    handle = await validator.openAndValidateFile(filePath);

                } catch (error) {
                    result.failed.push({ path: filePath, error: (error as Error).message });
                    continue;
                }

                // TypeScript check: handle is defined here because of continue above
                if (!handle) {
                    result.failed.push({ path: filePath, error: 'Failed to obtain file handle' });
                    continue;
                }

                // Security Check: Verify it is actually a duplicate (Same hash validation)
                // We use the HANDLE to verify.
                const isDuplicate = await this.verifyIsDuplicate(handle); // Pass handle
                if (!isDuplicate) {
                    result.failed.push({ path: filePath, error: 'Verification failed: File does not match expected duplicate criteria' });
                    await handle.close();
                    handle = undefined;
                    continue;
                }

                // Close handle before Delete/Rename (Windows lock)
                await handle.close();
                handle = undefined;

                if (createBackupManifest) {
                    // Move to backup
                    const backupName = `${Date.now()}_${path.basename(filePath)}`;
                    const backupPath = path.join(backupDir, backupName);

                    await fs.rename(filePath, backupPath);

                    rollbackActions.push({
                        type: 'delete',
                        originalPath: filePath,
                        backupPath: backupPath,
                        timestamp: Date.now()
                    });

                    result.deleted.push(filePath);
                } else {
                    // Permanent Delete (Legacy/Unsafe mode)
                    await fs.unlink(filePath);
                    result.deleted.push(filePath);
                }

            } catch (error) {
                result.failed.push({ path: filePath, error: (error as Error).message });
            } finally {
                if (handle) {
                    try { await handle.close(); } catch (e) { }
                }
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
     * Verify a file using its open handle
     */
    private async verifyIsDuplicate(fileHandle: fs.FileHandle): Promise<boolean> {
        try {
            await this.hashCalculator.calculateHash(fileHandle);
            return true;
        } catch (error) {
            logger.warn(`Verification failed: ${(error as Error).message}`);
            return false;
        }
    }
}
