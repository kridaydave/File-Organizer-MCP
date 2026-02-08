#!/usr/bin/env node

/**
 * Phase 1 Validation Tests
 * Tests the strict validator path checks
 */

import { validateStrictPath } from '../services/path-validator.service.js';

async function runTests(): Promise<void> {
  console.log('🔒 Phase 1 Path Validation Tests\n');
  console.log('='.repeat(50));

  let passed = 0;
  let failed = 0;

  async function test(name: string, testPath: string, expectError: boolean): Promise<void> {
    process.stdout.write(`\nTest: ${name}\n  Path: "${testPath}"\n  `);
    try {
      await validateStrictPath(testPath);
      if (expectError) {
        console.log('❌ FAIL: Expected error but got success');
        failed++;
      } else {
        console.log('✅ PASS: Access allowed as expected');
        passed++;
      }
    } catch {
      if (expectError) {
        console.log('✅ PASS: Correctly blocked');
        passed++;
      } else {
        console.log('❌ FAIL: Unexpected error');
        failed++;
      }
    }
  }

  await test('1. Parent directory traversal', '../', true);
  await test('2. Current directory', '.', false);
  await test('3. Subdirectory access', './src', false);
  await test('4. Sneaky traversal (subdir/../../etc)', './subdir/../../etc', true);
  await test('5. Absolute path (C:\\Windows)', 'C:\\Windows', true);

  console.log('\n' + '='.repeat(50));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
