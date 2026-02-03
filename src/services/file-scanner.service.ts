/**
 * File Organizer MCP Server v3.0.0
 * File Scanner Service
 */

import fs from 'fs/promises';
import path from 'path';
import type { FileInfo, FileWithSize, ScanOptions } from '../types.js';
import { CONFIG, SKIP_DIRECTORIES } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * File Scanner Service - core scanning logic
 */
export class FileScannerService {
    private readonly maxFiles: number;
    private readonly maxDepth: number;

    constructor(maxFiles = CONFIG.security.maxFilesPerOperation, maxDepth = CONFIG.security.maxScanDepth) {
        this.maxFiles = maxFiles;
        this.maxDepth = maxDepth;
    }

    /**
     * Scan directory for files with full metadata
     */
    async scanDirectory(directory: string, options: ScanOptions = {}): Promise<FileInfo[]> {
        const { includeSubdirs = false, maxDepth = -1 } = options;
        const results: FileInfo[] = [];

        await this.scanDir(directory, results, includeSubdirs, maxDepth, 0, new Set());
        return results;
    }

    /**
     * Get all files with basic info (name, path, size)
     */
    async getAllFiles(directory: string, includeSubdirs = false): Promise<FileWithSize[]> {
        const results: FileWithSize[] = [];

        const scanDir = async (dir: string, depth = 0, visited = new Set<string>()): Promise<void> => {
            if (includeSubdirs && depth > this.maxDepth) {
                return;
            }

            try {
                const realPath = await fs.realpath(dir);
                if (visited.has(realPath)) return;
                visited.add(realPath);
            } catch {
                // Ignore realpath errors
            }

            let items;
            try {
                items = await fs.readdir(dir, { withFileTypes: true });
            } catch (error) {
                const err = error as NodeJS.ErrnoException;
                if (err.code === 'EACCES' || err.code === 'EPERM' || err.code === 'ENOENT') return;
                throw error;
            }

            for (const item of items) {
                if (item.name.startsWith('.')) continue;
                if (SKIP_DIRECTORIES.includes(item.name as typeof SKIP_DIRECTORIES[number])) continue;

                const fullPath = path.join(dir, item.name);

                try {
                    if (item.isFile()) {
                        if (results.length >= this.maxFiles) {
                            throw new Error(`Maximum file limit (${this.maxFiles}) reached`);
                        }

                        // Security: Open with O_NOFOLLOW to avoid symlinks and race conditions
                        // Use usage of file handle for stat
                        let handle: fs.FileHandle | undefined;
                        let statError: Error | undefined;
                        try {
                            // We use O_RDONLY | O_NOFOLLOW
                            handle = await fs.open(fullPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
                            const stats = await handle.stat();

                            results.push({
                                name: item.name,
                                path: fullPath,
                                size: stats.size,
                                modified: stats.mtime,
                            });
                        } catch (error) {
                            // BUG-003 FIX: Store error instead of throwing to ensure finally executes
                            const err = error as NodeJS.ErrnoException;
                            if (err.code === 'ELOOP' || err.code === 'EACCES' || err.code === 'EPERM' || err.code === 'EBUSY') {
                                // Skip file silently
                            } else {
                                statError = err;
                            }
                        } finally {
                            // BUG-003 FIX: Always close handle
                            if (handle) {
                                await handle.close();
                            }
                        }

                        // Now throw the error after cleanup if needed
                        if (statError) {
                            throw statError;
                        }

                    } else if (item.isDirectory() && includeSubdirs) {
                        await scanDir(fullPath, depth + 1, visited);
                    }
                } catch (error) {
                    const err = error as NodeJS.ErrnoException;
                    if (err.message.includes('Maximum file limit')) throw error;
                    if (err.code === 'EACCES' || err.code === 'ENOENT') continue;
                }
            }
        };

        await scanDir(directory);
        return results;
    }

    private async scanDir(
        dir: string,
        results: FileInfo[],
        includeSubdirs: boolean,
        maxDepth: number,
        currentDepth: number,
        visited: Set<string> = new Set()
    ): Promise<void> {
        // Enforce limits
        if (maxDepth !== -1 && currentDepth > maxDepth) return;
        if (currentDepth > this.maxDepth) {
            logger.warn(`Max depth ${this.maxDepth} reached at ${dir}`);
            return;
        }

        // Detect loops using realpath
        try {
            const realPath = await fs.realpath(dir);
            if (visited.has(realPath)) {
                logger.warn(`Circular symlink detected at ${dir}, skipping`);
                return;
            }
            visited.add(realPath);
        } catch (error) {
            // If realpath fails (e.g. permission), fallback to path
            // But if we can't resolve it, might be safer to skip or proceed with caution?
            // We'll log and proceed with the original path, assuming it's linear.
            logger.debug(`Could not resolve realpath for ${dir}: ${error}`);
        }

        let items;
        try {
            items = await fs.readdir(dir, { withFileTypes: true });
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code === 'EACCES' || err.code === 'EPERM') {
                logger.warn(`Permission denied at ${dir}, skipping`);
                return;
            }
            if (err.code === 'ENOENT') {
                // Directory disappeared
                return;
            }
            throw error;
        }

        for (const item of items) {
            if (item.name.startsWith('.')) continue;
            if (SKIP_DIRECTORIES.includes(item.name as typeof SKIP_DIRECTORIES[number])) continue;

            const fullPath = path.join(dir, item.name);

            try {
                if (item.isFile()) {
                    if (results.length >= this.maxFiles) {
                        // We stop strictly if max files reached
                        // But we throw to break the recursion efficiently
                        throw new Error(`Maximum file limit (${this.maxFiles}) reached`);
                    }

                    // Security: Open with O_NOFOLLOW to avoid symlinks and race conditions
                    let handle: fs.FileHandle | undefined;
                    let statError: Error | undefined;
                    try {
                        handle = await fs.open(fullPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
                        const stats = await handle.stat();

                        results.push({
                            name: item.name,
                            path: fullPath,
                            size: stats.size,
                            extension: path.extname(item.name),
                            created: stats.birthtime,
                            modified: stats.mtime,
                        });
                    } catch (error) {
                        // BUG-003 FIX: Store error instead of throwing to ensure finally executes
                        const err = error as NodeJS.ErrnoException;
                        // Skip if symlink or access denied
                        if (err.code === 'ELOOP' || err.code === 'EACCES' || err.code === 'EPERM' || err.code === 'EBUSY') {
                            // Skip file silently
                        } else {
                            statError = err;
                        }
                    } finally {
                        // BUG-003 FIX: Always close handle
                        if (handle) {
                            await handle.close();
                        }
                    }

                    // Now throw the error after cleanup if needed
                    if (statError) {
                        throw statError;
                    }
                } else if (item.isDirectory() && includeSubdirs) {
                    await this.scanDir(fullPath, results, includeSubdirs, maxDepth, currentDepth + 1, visited);
                }
            } catch (error) {
                const err = error as NodeJS.ErrnoException;
                if (err.message.includes('Maximum file limit')) throw error;

                // Ignore individual file access errors (race condition or permission)
                if (err.code === 'EACCES' || err.code === 'EPERM' || err.code === 'ENOENT' || err.code === 'EINVAL') {
                    continue;
                }
                logger.error(`Error processing ${fullPath}: ${err.message}`);
            }
        }
    }
}
