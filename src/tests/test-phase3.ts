import path from 'path';
import fs from 'fs/promises';
import { handlePreviewOrganization } from '../tools/organization-preview.js';
import { handleGetCategories, handleSetCustomRules } from '../tools/file-management.js';
import { handleAnalyzeDuplicates } from '../tools/duplicate-management.js';
import { globalCategorizerService } from '../services/index.js';

// Helper to create test files
async function createTestFiles(dir: string, files: Record<string, string>) {
  await fs.mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(path.join(dir, name), content);
  }
}

async function runTests() {
  const testDir = path.resolve('./test-phase3-env');
  console.log(`Setting up test environment in ${testDir}...`);

  try {
    // Cleanup old test dir
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(testDir, { recursive: true });

    // 1. Test Custom Rules & Categorization
    console.log('\n--- Testing Custom Rules ---');

    // Default check
    const cats1 = await handleGetCategories({});
    console.log('Default categories:', (cats1.content[0] as any).text.includes('Documents'));

    // Set custom rule: *.log -> 'Logs' (custom category) or map to 'Others'
    // Let's try to map .log to 'Documents' with high priority
    const setRuleRes = await handleSetCustomRules({
      rules: [
        {
          category: 'Documents',
          extensions: ['log'],
          priority: 100,
        },
      ],
    });
    console.log('Set Rule Result:', (setRuleRes.content[0] as any).text);

    // Verify rule exists in service
    // (We can't easily check internal state, but we can test behavior via categorization)

    // 2. Test Organization Preview
    console.log('\n--- Testing Organization Preview ---');
    await createTestFiles(testDir, {
      'test1.log': 'log content', // Should go to Documents due to custom rule
      'test2.txt': 'text content', // Documents
      'image.png': 'image content', // Images
    });

    const previewRes = await handlePreviewOrganization({
      directory: testDir,
    });
    const previewText = (previewRes.content[0] as any).text;
    console.log('Preview Result:\n', previewText);

    if (previewText.includes('test1.log` -> `Documents')) {
      console.log('✅ Custom rule applied correctly: .log -> Documents');
    } else {
      console.log('❌ Custom rule failed');
    }

    // 3. Test Duplicate Analysis
    console.log('\n--- Testing Duplicate Analysis ---');
    await createTestFiles(testDir, {
      'original.txt': 'duplicate content',
      'copy.txt': 'duplicate content', // Duplicate
      'unique.txt': 'unique content',
    });

    const dupRes = await handleAnalyzeDuplicates({
      directory: testDir,
      recommendation_strategy: 'newest',
    });
    const dupText = (dupRes.content[0] as any).text;
    console.log('Duplicate Analysis:\n', dupText);

    if (
      dupText.includes('Duplicate Groups:** 1') ||
      dupText.includes('total_duplicate_groups": 1')
    ) {
      console.log('✅ Duplicates detected correctly');
    } else {
      console.log('❌ Duplicate detection failed. Output was:', dupText);
    }
  } catch (error) {
    console.error('Test Failed:', error);
  } finally {
    // Cleanup
    // await fs.rm(testDir, { recursive: true, force: true });
  }
}

runTests();
