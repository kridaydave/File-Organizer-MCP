/**
 * File Organizer MCP Server v3.1.3
 * Renaming Service
 */

import fs from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import type { RenameRule } from '../schemas/rename.schemas.js';
import type { FileWithSize, RollbackAction } from '../types.js';
import { logger } from '../utils/logger.js';
import { fileExists } from '../utils/file-utils.js';
import { RollbackService } from './rollback.service.js';
import { PathValidatorService } from './path-validator.service.js';

export interface RenameResult {
    statistics: {
        total: number;
        renamed: number;
        skipped: number;
        failed: number;
    };
    successes: { original: string; new: string }[];
    errors: string[];
}

export interface RenamePreview {
    original: string;
    new: string;
    willChange: boolean;
    conflict: boolean;
    error?: string;
}

export class RenamingService {
    constructor(private rollbackService = new RollbackService()) { }

    /**
     * Preview renaming results without modifying files
     */
    async applyRenameRules(files: string[], rules: RenameRule[]): Promise<RenamePreview[]> {
        const previews: RenamePreview[] = [];
        const usedNames = new Set<string>();

        // Pre-populate usedNames with existing files that are NOT in the list being renamed
        // Actually this is complex because we don't know all files in directory.
        // For accurate conflict detection, we should rely on fileExists check during execution
        // or accept that preview only shows internal conflicts within the batch + naive disk check.

        // For sequential operations (like Numbering), order matters.
        // We process files in the order provided.

        for (let i = 0; i < files.length; i++) {
            const originalPath = files[i];
            if (!originalPath) continue;
            const dirname = path.dirname(originalPath);
            const ext = path.extname(originalPath);
            const basename = path.basename(originalPath, ext);
            // Note: basename in Node.js path module excludes extension if provided.

            let newBasename = basename;
            let newExt = ext;

            try {
                for (const rule of rules) {
                    try {
                        switch (rule.type) {
                            case 'find_replace':
                                // TS Narrowing helper
                                const frRule = rule;
                                if (frRule.type !== 'find_replace') break;

                                if (frRule.use_regex) {
                                    const flags = (frRule.global ? 'g' : '') + (frRule.case_sensitive ? '' : 'i');
                                    const regex = new RegExp(frRule.find, flags);
                                    newBasename = newBasename.replace(regex, frRule.replace);
                                } else {
                                    if (frRule.global) {
                                        const split = frRule.case_sensitive
                                            ? newBasename.split(frRule.find)
                                            : newBasename.split(new RegExp(escapeRegExp(frRule.find), 'gi'));
                                        newBasename = split.join(frRule.replace);
                                    } else {
                                        newBasename = newBasename.replace(frRule.find, frRule.replace);
                                    }
                                }
                                break;

                            case 'case':
                                switch (rule.conversion) {
                                    case 'lowercase':
                                        newBasename = newBasename.toLowerCase();
                                        newExt = newExt.toLowerCase();
                                        break;
                                    case 'uppercase':
                                        newBasename = newBasename.toUpperCase();
                                        newExt = newExt.toUpperCase();
                                        break;
                                    case 'camelCase': newBasename = toCamelCase(newBasename); break;
                                    case 'PascalCase': newBasename = toPascalCase(newBasename); break;
                                    case 'snake_case': newBasename = toSnakeCase(newBasename); break;
                                    case 'kebab-case': newBasename = toKebabCase(newBasename); break;
                                    case 'Title Case': newBasename = toTitleCase(newBasename); break;
                                }
                                break;

                            case 'add_text':
                                if (rule.position === 'start') {
                                    newBasename = rule.text + newBasename;
                                } else {
                                    newBasename = newBasename + rule.text;
                                }
                                break;

                            case 'numbering':
                                // index is 0-based, start_at defaults to 1
                                const num = rule.start_at + (i * rule.increment_by);
                                const numStr = String(num);
                                const sep = rule.separator ?? ' ';

                                let textToAdd = '';
                                if (rule.format === 'search_index') {
                                    textToAdd = numStr;
                                } else {
                                    textToAdd = rule.format.replace('%n', numStr);
                                }

                                if (rule.location === 'start') {
                                    newBasename = textToAdd + sep + newBasename;
                                } else {
                                    newBasename = newBasename + sep + textToAdd;
                                }
                                break;

                            case 'trim':
                                if (rule.position === 'start' || rule.position === 'both') newBasename = newBasename.trimStart();
                                if (rule.position === 'end' || rule.position === 'both') newBasename = newBasename.trimEnd();
                                break;
                        }
                    } catch (ruleErr) {
                        // warning for rule failure? ignore for now
                        logger.warn(`Rule failed for file ${basename}: ${(ruleErr as Error).message}`);
                    }
                }

                // Reconstruct path
                const newName = newBasename + newExt;
                const newPath = path.join(dirname, newName);

                // Detect Change
                const willChange = newPath !== originalPath;

                // Internal Conflict Check
                let conflict = false;
                if (willChange && usedNames.has(newPath)) {
                    conflict = true;
                }
                usedNames.add(newPath);

                // Disk Conflict Check (Naive)
                if (willChange && !conflict) {
                    try {
                        // Check if destination exists
                        await fs.access(newPath); // Will throw if not exists

                        // If exists, check if it's the SAME file (case-only rename)
                        const srcStat = await fs.stat(originalPath);
                        const destStat = await fs.stat(newPath);

                        // On Windows/Mac (case-insensitive), ino/dev should match if it's the same file
                        // Note: ino might be 0 on some systems but usually consistent for same file handle
                        if (srcStat.ino !== destStat.ino || srcStat.dev !== destStat.dev) {
                            // Fallback for systems where ino is unreliable (e.g. Windows sometimes)
                            // If full paths match case-insensitively, assume it's the same file
                            const isSamePath = path.resolve(originalPath).toLowerCase() === path.resolve(newPath).toLowerCase();
                            if (!isSamePath) {
                                conflict = true;
                            }
                        }
                    } catch (err) {
                        // Destination does not exist, no conflict
                    }
                }

                previews.push({
                    original: originalPath,
                    new: newPath,
                    willChange,
                    conflict
                });

            } catch (err) {
                previews.push({
                    original: originalPath,
                    new: originalPath,
                    willChange: false,
                    conflict: false,
                    error: (err as Error).message
                });
            }
        }
        return previews;
    }

    /**
     * Execute renaming plan
     */
    async executeRename(previews: RenamePreview[], dryRun: boolean = false): Promise<RenameResult> {
        const result: RenameResult = {
            statistics: { total: previews.length, renamed: 0, skipped: 0, failed: 0 },
            successes: [],
            errors: []
        };

        if (dryRun) {
            return result; // logic should be handled by tool returning preview
        }

        const rollbackActions: RollbackAction[] = [];

        // Sort: Process renames that don't conflict first?
        // Or process carefully. 
        // If we have A -> B and B -> C. We must do B -> C first, then A -> B.
        // This is a topological sort problem if we want to be perfect.
        // Simplified approach: Atomic moves with temp names if needed?
        // OR: Just fail on conflict for now as per plan. (User seeing conflict in preview should fix rules).

        // Actually, conflicts in preview means "STOP".
        // But let's try to execute non-conflicting ones.

        for (const item of previews) {
            if (!item.willChange) {
                result.statistics.skipped++;
                continue;
            }
            if (item.conflict) {
                result.statistics.failed++;
                result.errors.push(`Skipped ${path.basename(item.original)} due to conflict with ${path.basename(item.new)}`);
                continue;
            }
            if (item.error) {
                result.statistics.failed++;
                result.errors.push(`Skipped ${path.basename(item.original)}: ${item.error}`);
                continue;
            }

            try {
                // Perform Rename
                // Use Atomic Copy-Delete strategies from OrganizerService?
                // For Rename in same folder, fs.rename is usually atomic.

                // CHECK AGAIN for conflict just in case (race condition)
                // CHECK AGAIN for conflict just in case (race condition)
                if (await fileExists(item.new)) {
                    // Verify if it is strictly a different file (e.g. A.txt -> a.txt on Windows should pass)
                    try {
                        const srcStat = await fs.stat(item.original);
                        const destStat = await fs.stat(item.new);
                        const isSameFile = srcStat.ino === destStat.ino && srcStat.dev === destStat.dev;
                        const isSamePath = path.resolve(item.original).toLowerCase() === path.resolve(item.new).toLowerCase();

                        if (!isSameFile && !isSamePath) {
                            throw new Error('Destination file exists (Race Condition)');
                        }
                    } catch (e) {
                        // If stat fails but access worked?
                        throw new Error('Destination file exists (Race Condition)');
                    }
                }

                // Security Check
                const validator = new PathValidatorService();
                await validator.validatePath(item.original);
                await validator.validatePath(item.new);

                await fs.rename(item.original, item.new);

                result.statistics.renamed++;
                result.successes.push({ original: item.original, new: item.new });

                rollbackActions.push({
                    type: 'rename',
                    originalPath: item.original,
                    currentPath: item.new,
                    timestamp: Date.now()
                });

            } catch (error) {
                result.statistics.failed++;
                const msg = `Failed to rename ${path.basename(item.original)}: ${(error as Error).message}`;
                result.errors.push(msg);
                logger.error(msg);
            }
        }

        if (rollbackActions.length > 0) {
            await this.rollbackService.createManifest(
                `Batch Rename of ${rollbackActions.length} files`,
                rollbackActions as RollbackAction[]
            );
        }

        return result;
    }
}

// Helpers
function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toCamelCase(str: string) {
    return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
        return index === 0 ? word.toLowerCase() : word.toUpperCase();
    }).replace(/\s+/g, '');
}

function toPascalCase(str: string) {
    return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (word) => {
        return word.toUpperCase();
    }).replace(/\s+/g, '');
}

function toSnakeCase(str: string) {
    return str.match(/[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g)
        ?.map(x => x.toLowerCase())
        .join('_') ?? str;
}

function toKebabCase(str: string) {
    return str.match(/[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g)
        ?.map(x => x.toLowerCase())
        .join('-') ?? str;
}

function toTitleCase(str: string) {
    return str.replace(
        /\w\S*/g,
        text => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase()
    );
}
