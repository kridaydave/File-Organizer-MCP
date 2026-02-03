/**
 * File Organizer MCP Server v3.0.0
 * Rollback Service
 * 
 * Manages operation manifests and performs undo operations.
 */

import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import type { RollbackManifest, RollbackAction } from '../types.js';
import { fileExists } from '../utils/file-utils.js';
import { logger } from '../utils/logger.js';
import { CONFIG } from '../config.js';

export class RollbackService {
    private storageDir: string;

    constructor() {
        // Store manifests in .agent/rollbacks or similar if possible, 
        // but for this MCP, let's store in a hidden directory in the workspace or temp?
        // Let's use `.file-organizer-rollbacks` in the CWD (User's workspace root usually).
        this.storageDir = path.join(process.cwd(), '.file-organizer-rollbacks');
    }

    private async ensureStorage(): Promise<void> {
        if (!(await fileExists(this.storageDir))) {
            await fs.mkdir(this.storageDir, { recursive: true });
        }
    }

    /**
     * Create and save a new rollback manifest
     */
    async createManifest(description: string, actions: RollbackAction[]): Promise<string> {
        await this.ensureStorage();

        const id = randomUUID();
        const manifest: RollbackManifest = {
            id,
            timestamp: Date.now(),
            description,
            actions
        };

        const filePath = path.join(this.storageDir, `${id}.json`);
        await fs.writeFile(filePath, JSON.stringify(manifest, null, 2));

        logger.info(`Created rollback manifest: ${id} (${actions.length} actions)`);
        return id;
    }

    /**
     * List available rollbacks
     */
    async listManifests(): Promise<RollbackManifest[]> {
        if (!(await fileExists(this.storageDir))) return [];

        const files = await fs.readdir(this.storageDir);
        const manifests: RollbackManifest[] = [];

        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const content = await fs.readFile(path.join(this.storageDir, file), 'utf-8');
                    manifests.push(JSON.parse(content));
                } catch (e) {
                    logger.error(`Failed to parse rollback manifest ${file}: ${e}`);
                }
            }
        }

        return manifests.sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Restore state from a manifest (Undo)
     */
    async rollback(manifestId: string): Promise<{ success: number; failed: number; errors: string[] }> {
        // Security: Validate ID format (UUID)
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(manifestId)) {
            throw new Error(`Invalid manifest ID format: ${manifestId}`);
        }

        await this.ensureStorage();
        const filePath = path.join(this.storageDir, `${manifestId}.json`);

        if (!(await fileExists(filePath))) {
            throw new Error(`Manifest ${manifestId} not found`);
        }

        const manifest: RollbackManifest = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        const results = { success: 0, failed: 0, errors: [] as string[] };

        // Reverse actions: Undo last action first
        const reverseActions = [...manifest.actions].reverse();

        for (const action of reverseActions) {
            try {
                if (action.type === 'move' && action.currentPath) {
                    // Undo Move: Move currentPath -> originalPath
                    if (await fileExists(action.currentPath)) {
                        await fs.mkdir(path.dirname(action.originalPath), { recursive: true });

                        // 1. Move the organized file back to source
                        await fs.rename(action.currentPath, action.originalPath); // Move file_2.txt -> file.txt

                        // 2. Restore the overwritten file if it exists
                        if (action.overwrittenBackupPath) {
                            if (await fileExists(action.overwrittenBackupPath)) {
                                // Move backup -> currentPath (which is now empty)
                                await fs.rename(action.overwrittenBackupPath, action.currentPath);
                            } else {
                                results.errors.push(`Critical: Original file backup missing: ${action.overwrittenBackupPath}`);
                                results.failed++; // Partial failure?
                            }
                        }

                        results.success++;
                    } else {
                        throw new Error(`Current file not found: ${action.currentPath}`);
                    }
                } else if (action.type === 'copy' && action.currentPath) {
                    // Undo Copy: Delete the copied file (currentPath)
                    if (await fileExists(action.currentPath)) {
                        await fs.unlink(action.currentPath);
                        results.success++;
                    } else {
                        // If it's gone, maybe manual deletion? Consider success or warn.
                        results.errors.push(`File to un-copy not found: ${action.currentPath}`);
                        results.failed++; // Strict failure
                    }
                } else if (action.type === 'delete') {
                    // Undo Delete: Restore from backup
                    if (action.backupPath && await fileExists(action.backupPath)) {
                        await fs.mkdir(path.dirname(action.originalPath), { recursive: true });
                        await fs.rename(action.backupPath, action.originalPath);
                        results.success++;
                    } else {
                        results.failed++;
                        results.errors.push(`Cannot restore deleted file. Backup not found: ${action.backupPath}`);
                    }
                }
            } catch (error) {
                results.failed++;
                results.errors.push(`Failed to undo ${action.type} for ${action.originalPath}: ${(error as Error).message}`);
            }
        }

        // Cleanup manifest to prevent re-running
        try {
            await fs.unlink(filePath);
        } catch (e) {
            // Throwing is better here to warn the user that the manifest is still there
            // and might be re-runnable (risky). 
            throw new Error(`Rollback completed but failed to delete manifest ${manifestId}: ${(e as Error).message}`);
        }

        return results;
    }
}
