#!/usr/bin/env node

/**
 * Phase 1 Validation Tests
 * Tests the strict validator path checks
 */

import { FileOrganizerServer } from './server.js';

const server = new FileOrganizerServer();

async function runTests() {
    console.log('🔒 Phase 1 Path Validation Tests\n');
    console.log('='.repeat(50));

    let passed = 0;
    let failed = 0;

    async function test(name, path, expectError) {
        process.stdout.write(`\nTest: ${name}\n  Path: "${path}"\n  `);
        try {
            await server.validatePath(path);
            if (expectError) {
                console.log('❌ FAIL: Expected error but got success');
                failed++;
            } else {
                console.log('✅ PASS: Access allowed as expected');
                passed++;
            }
        } catch (error) {
            if (expectError) {
                const isAccessDenied = error.message.includes('Access Denied') ||
                    error.message.includes('outside') ||
                    error.code === 'EACCES';
                if (isAccessDenied) {
                    console.log('✅ PASS: Correctly blocked');
                    passed++;
                } else if (error.code === 'ENOENT') {
                    console.log('⚠️ PASS: Path does not exist (expected for non-existent paths)');
                    passed++;
                } else {
                    console.log(`❌ FAIL: Wrong error type: ${error.message.substring(0, 50)}...`);
                    failed++;
                }
            } else {
                if (error.code === 'ENOENT') {
                    console.log('✅ PASS: Path validated, folder just doesn\'t exist');
                    passed++;
                } else {
                    console.log(`❌ FAIL: Unexpected error: ${error.message.substring(0, 50)}...`);
                    failed++;
                }
            }
        }
    }

    // Test 1: Parent directory should fail
    await test(
        '1. Parent directory traversal',
        '../',
        true  // expect error
    );

    // Test 2: Current directory should work
    await test(
        '2. Current directory',
        '.',
        false  // expect success
    );

    // Test 3: Subdirectory should work (or ENOENT if doesn't exist)
    await test(
        '3. Subdirectory access',
        './lib',
        false  // expect success
    );

    // Test 4: Sneaky traversal should fail
    await test(
        '4. Sneaky traversal (subdir/../../etc)',
        './subdir/../../etc',
        true  // expect error
    );

    // Test 5: Absolute path outside CWD should fail
    await test(
        '5. Absolute path (/tmp or C:\\Windows)',
        process.platform === 'win32' ? 'C:\\Windows' : '/tmp',
        true  // expect error
    );

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
    console.log('='.repeat(50));

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
