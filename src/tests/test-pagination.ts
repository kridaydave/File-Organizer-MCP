#!/usr/bin/env node

/**
 * Pagination Tests
 * Tests the pagination logic in tools
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleListFiles } from '../tools/file-listing.js';
import { ListResult } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests(): Promise<void> {
    console.log('📄 Pagination Verification Tests\n');
    console.log('='.repeat(50));

    let passed = 0;
    let failed = 0;

    async function test(name: string, fn: () => Promise<void>): Promise<void> {
        try {
            await fn();
            console.log(`✅ PASS: ${name}`);
            passed++;
        } catch (error) {
            console.log(`❌ FAIL: ${name}`);
            console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown'}`);
            failed++;
        }
    }

    // Setup 5 dummy files
    const testDir = path.join(__dirname, 'test_pagination');
    await fs.mkdir(testDir, { recursive: true });
    for (let i = 1; i <= 5; i++) {
        await fs.writeFile(path.join(testDir, `file${i}.txt`), `content ${i}`);
    }

    try {
        // Test 1: limit=2, offset=0
        await test('Page 1 (limit=2, offset=0)', async () => {
            const result = await handleListFiles({
                directory: testDir,
                limit: 2,
                offset: 0,
                response_format: 'json',
            });
            const data = result.structuredContent as unknown as ListResult;

            if (data.items.length !== 2) throw new Error(`Expected 2 items, got ${data.items.length}`);
            if (data.returned_count !== 2) throw new Error(`Expected returned_count=2, got ${data.returned_count}`);
            if (data.total_count !== 5) throw new Error(`Expected total_count=5, got ${data.total_count}`);
            if (data.has_more !== true) throw new Error('Expected has_more=true');
            if (data.next_offset !== 2) throw new Error('Expected next_offset=2');
            if (data.items[0]?.name !== 'file1.txt') throw new Error(`Expected file1.txt, got ${data.items[0]?.name}`);
        });

        // Test 2: limit=2, offset=2
        await test('Page 2 (limit=2, offset=2)', async () => {
            const result = await handleListFiles({
                directory: testDir,
                limit: 2,
                offset: 2,
                response_format: 'json',
            });
            const data = result.structuredContent as unknown as ListResult;

            if (data.items.length !== 2) throw new Error(`Expected 2 items, got ${data.items.length}`);
            if (data.items[0]?.name !== 'file3.txt') throw new Error(`Expected file3.txt, got ${data.items[0]?.name}`);
            if (data.has_more !== true) throw new Error('Expected has_more=true');
            if (data.next_offset !== 4) throw new Error('Expected next_offset=4');
        });

        // Test 3: limit=2, offset=4
        await test('Page 3 (limit=2, offset=4)', async () => {
            const result = await handleListFiles({
                directory: testDir,
                limit: 2,
                offset: 4,
                response_format: 'json',
            });
            const data = result.structuredContent as unknown as ListResult;

            if (data.items.length !== 1) throw new Error(`Expected 1 item, got ${data.items.length}`);
            if (data.items[0]?.name !== 'file5.txt') throw new Error(`Expected file5.txt, got ${data.items[0]?.name}`);
            if (data.has_more !== false) throw new Error('Expected has_more=false');
            if (data.next_offset !== undefined) throw new Error('Expected next_offset=undefined');
        });

    } finally {
        await fs.rm(testDir, { recursive: true, force: true }).catch(() => { });
    }

    console.log('\n' + '='.repeat(50));
    console.log(`Tests Passed: ${passed}`);
    console.log(`Tests Failed: ${failed}`);
    console.log('='.repeat(50));

    process.exit(failed > 0 ? 1 : 0);
}

runTests();
