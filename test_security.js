#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { FileOrganizerServer } from './server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SecurityTester {
    constructor() {
        this.testsPassed = 0;
        this.testsFailed = 0;
        this.server = new FileOrganizerServer();
    }

    async test(name, fn) {
        try {
            await fn();
            console.log(`✅ PASS: ${name}`);
            this.testsPassed++;
        } catch (error) {
            console.log(`❌ FAIL: ${name}`);
            console.log(`   Error: ${error.message}`);
            this.testsFailed++;
        }
    }

    async runTests() {
        console.log('🔒 Running Security Tests...\n');

        // Test 1: Path Traversal Attack
        await this.test('Sanitize or Reject path traversal with ..', async () => {
            const maliciousPath = '../../../etc/passwd';
            try {
                const resolved = await this.server.validatePath(maliciousPath);
                // If it returns, it MUST be inside CWD
                const cwd = process.cwd();
                if (!resolved.startsWith(cwd)) {
                    throw new Error(`Path escaped CWD: ${resolved}`);
                }
                console.log(`   (Sanitized to: ${resolved})`);
            } catch (e) {
                if (!e.message.includes('Access denied')) throw e;
            }
        });

        // Test 2: Symlink Attack
        await this.test('Reject symlink outside CWD', async () => {
            // Only run on systems that support symlinks easily or mock it
            // We'll try to create a symlink to parent dir
            const target = path.join(__dirname, '..');
            const linkPath = path.join(__dirname, 'symlink_test');

            try {
                await fs.symlink(target, linkPath, 'dir');
                try {
                    await this.server.validatePath(linkPath);
                    throw new Error('Should have rejected outside symlink');
                } catch (e) {
                    if (!e.message.includes('Access denied')) throw e;
                }
            } catch (e) {
                // Windows requires admin for symlinks usually, so this might fail to create symlink
                // We'll skip if symlink creation fails
                if (e.code === 'EPERM') {
                    console.log('   (Skipped symlink test due to permissions)');
                    return;
                }
                throw e;
            } finally {
                try { await fs.unlink(linkPath); } catch { }
            }
        });

        // Test 3: Large File Handling
        await this.test('Skip files larger than MAX_FILE_SIZE', async () => {
            // Temporarily lower limit to 1MB for testing
            this.server.MAX_FILE_SIZE = 1024 * 1024;

            const testFile = path.join(__dirname, 'large_test_file.bin');
            const size = 2 * 1024 * 1024; // 2MB

            // Create sparse file
            const fh = await fs.open(testFile, 'w');
            await fh.truncate(size);
            await fh.close();

            try {
                await this.server.calculateFileHash(testFile);
                throw new Error('Should have rejected large file');
            } catch (e) {
                if (!e.message.includes('exceeds maximum size')) throw e;
            } finally {
                await fs.unlink(testFile);
                // Restore limit
                this.server.MAX_FILE_SIZE = 100 * 1024 * 1024;
            }
        });

        // Test 3b: Graceful Duplicate Finding with Large Files
        await this.test('Gracefully handle large files in duplicate find', async () => {
            // Lower limit
            this.server.MAX_FILE_SIZE = 1024 * 1024; // 1MB
            const testDir = path.join(__dirname, 'dup_test_large');
            await fs.mkdir(testDir, { recursive: true });

            const largeFile = path.join(testDir, 'large.bin');
            const fd = await fs.open(largeFile, 'w');
            await fd.truncate(2 * 1024 * 1024); // 2MB
            await fd.close();

            const smallFile = path.join(testDir, 'small.txt');
            await fs.writeFile(smallFile, 'test content');

            try {
                // This should NOT throw, just log error for large file and process small one
                const result = await this.server.findDuplicateFiles(testDir);
                // Ensure result is valid
                if (!result || !result.content) throw new Error('No result returned');
            } finally {
                await fs.rm(testDir, { recursive: true });
                this.server.MAX_FILE_SIZE = 100 * 1024 * 1024;
            }
        });

        // Test 4: Deep Directory Scan
        await this.test('Enforce MAX_DEPTH limit', async () => {
            // Lower limit to 3 for testing
            this.server.MAX_DEPTH = 3;

            const baseDir = path.join(__dirname, 'deep_test');
            await fs.mkdir(baseDir, { recursive: true });

            let currentPath = baseDir;
            for (let i = 0; i < 5; i++) {
                currentPath = path.join(currentPath, `level_${i}`);
                await fs.mkdir(currentPath, { recursive: true });
            }

            // This shouldn't throw, but it should limit recursion
            // We can verify by checking output or just ensuring it doesn't crash/hang
            // The implementation prints a warning and returns.
            // We'll scan and see if deeper files are missing if we were to check results, 
            // but for now checking it doesn't error is a basic check.
            // Ideally we'd modify scanDirectory to return results and check them.

            // Monkey patch console.error to catch the warning
            let warningCaught = false;
            const originalError = console.error;
            console.error = (msg) => {
                if (msg.includes('Max depth')) warningCaught = true;
                // originalError(msg); // suppress output
            };

            try {
                await this.server.scanDirectory(baseDir, true);
                if (!warningCaught) throw new Error('Should have triggered max depth warning');
            } finally {
                console.error = originalError;
                await fs.rm(baseDir, { recursive: true });
                this.server.MAX_DEPTH = 10;
            }
        });

        // Test 5: File Count Limit
        await this.test('Enforce MAX_FILES limit', async () => {
            // Lower limit to 5
            this.server.MAX_FILES = 5;

            const testDir = path.join(__dirname, 'many_files_test');
            await fs.mkdir(testDir, { recursive: true });

            for (let i = 0; i < 10; i++) {
                await fs.writeFile(path.join(testDir, `file_${i}.txt`), 'test');
            }

            try {
                await this.server.scanDirectory(testDir, false); // non-recursive scan also checks limit in my impl? 
                // Wait, my impl check limits in SCAN directory loops.
                // listFiles impl didn't get the limit check in my multi_replace? 
                // I added limits to scanDirectory inner loop.
                // Let's check scanDirectory.
                throw new Error('Should have thrown MAX_FILES limit error');
            } catch (e) {
                if (!e.message.includes('Maximum file limit')) throw e;
            } finally {
                await fs.rm(testDir, { recursive: true });
                this.server.MAX_FILES = 10000;
            }
        });

        // Summary
        console.log('\n' + '='.repeat(50));
        console.log(`Tests Passed: ${this.testsPassed}`);
        console.log(`Tests Failed: ${this.testsFailed}`);
        console.log('='.repeat(50));

        process.exit(this.testsFailed > 0 ? 1 : 0);
    }
}

const tester = new SecurityTester();
tester.runTests().catch(console.error);
