import { DuplicateFinderService } from '../services/duplicate-finder.service.js';
import type { FileWithSize } from '../types.js';
import path from 'path';

async function runTests() {
  console.log('--- Test: Duplicate Recommendation Scoring ---');

  // Mock files
  const badFile: FileWithSize = {
    name: 'report (1).pdf',
    path: path.resolve('C:/Downloads/report (1).pdf'),
    size: 1024,
    modified: new Date(),
  };

  const goodFile: FileWithSize = {
    name: 'report.pdf',
    path: path.resolve('C:/Documents/report.pdf'),
    size: 1024,
    modified: new Date(),
  };

  // Instantiate service
  const service = new DuplicateFinderService();

  // We need to bypass HashCalculator because it hits disk.
  // We can Mock hashCalculator or ensure files exist properly.
  // Easier strategy: Hack the scoreFile method? No, that's private.
  // We must rely on `findWithScoring`.
  // `findWithScoring` calls `this.hashCalculator.findDuplicates`.
  // Since `findDuplicates` calculates hashes from REAL files, we need REAL files.

  // SETUP REAL FILES
  const testDir = path.resolve('./test-scoring-env');
  const fs = await import('fs/promises');
  await fs.rm(testDir, { recursive: true, force: true });
  await fs.mkdir(testDir, { recursive: true });
  await fs.mkdir(path.join(testDir, 'Downloads'), { recursive: true });
  await fs.mkdir(path.join(testDir, 'Documents'), { recursive: true });

  const p1 = path.join(testDir, 'Downloads', 'report (1).pdf');
  const p2 = path.join(testDir, 'Documents', 'report.pdf');

  await fs.writeFile(p1, 'CONTENT_HASH');
  await fs.writeFile(p2, 'CONTENT_HASH'); // Same content = duplicate

  // Re-create FileWithSize objects with real paths
  const files: FileWithSize[] = [
    { ...badFile, path: p1 },
    { ...goodFile, path: p2 },
  ];

  console.log('Running finding...');
  // We pass 'best_location' strategy
  const results = await service.findWithScoring(files, 'best_location');

  if (results.length === 0) {
    console.error('❌ Failed: No duplicates found. Hash calculation might have failed?');
    return;
  }

  const group = results[0];

  if (!group) {
    console.error('❌ Failed: Duplicate group is undefined.');
    return;
  }

  console.log(`Found group with ${group.files.length} files.`);

  // Log scores
  group.files.forEach((f) => {
    console.log(
      `File: ${path.basename(f.path)} | Score: ${f.score} | Reasons: ${f.reasons.join(', ')}`
    );
  });

  console.log(`Recommended Keep: ${path.basename(group.recommended_keep)}`);

  // Verification
  // The "Documents/report.pdf" should have higher score (Location bonus + No filename penalty)
  // The "Downloads/report (1).pdf" should have lower score (Location penalty + Filename penalty)

  // Current Bug: It picks files[0] which is p1 (Downloads/bad).
  // Expected: p2 (Documents/good).

  if (group.recommended_keep === p2) {
    console.log('✅ PASS: Recommended the better file.');
  } else {
    console.log('❌ FAIL: Recommended the wrong file (likely just took the first one).');
    // Check if scores were actually different
    const score1 = group.files.find((f) => f.path === p1)?.score || 0;
    const score2 = group.files.find((f) => f.path === p2)?.score || 0;
    if (score2 > score1) {
      console.log('   (Scores confirm p2 > p1, so logic is definitely broken)');
    } else {
      console.log('   (Scores were insufficient to differentiate?)');
    }
  }

  // Cleanup
  // await fs.rm(testDir, { recursive: true, force: true });
}

runTests();
