/**
 * File Organizer MCP Server - Watch Mode Integration Tests
 * End-to-end tests for watch directory scheduling
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import {
  handleWatchDirectory,
  handleUnwatchDirectory,
  handleListWatches,
} from '../../src/tools/watch.tool.js';
import { loadUserConfig, updateUserConfig, getUserConfigPath } from '../../src/config.js';

describe('Watch Mode Integration', () => {
  let testDir: string;
  let testDir2: string;
  let originalConfig: string | null = null;
  const configPath = getUserConfigPath();

  beforeAll(async () => {
    // Backup existing config
    if (fs.existsSync(configPath)) {
      originalConfig = fs.readFileSync(configPath, 'utf-8');
    }

    // Use temp directory for tests (works on all platforms and CI)
    // This is within the project directory which is allowed in test mode
    const tempTestDir = path.join(process.cwd(), 'tests', 'temp', 'watch-test-folder');
    const tempTestDir2 = path.join(process.cwd(), 'tests', 'temp', 'watch-test-folder-2');

    // Create test directories
    if (!fs.existsSync(tempTestDir)) {
      fs.mkdirSync(tempTestDir, { recursive: true });
    }
    if (!fs.existsSync(tempTestDir2)) {
      fs.mkdirSync(tempTestDir2, { recursive: true });
    }

    testDir = tempTestDir;
    testDir2 = tempTestDir2;
  });

  afterAll(() => {
    // Cleanup test directories
    try {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
      if (fs.existsSync(testDir2)) {
        fs.rmSync(testDir2, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }

    // Restore original config
    if (originalConfig !== null) {
      fs.writeFileSync(configPath, originalConfig);
    } else if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
  });

  beforeEach(() => {
    // Clear watch list before each test
    updateUserConfig({ watchList: [] });
  });

  describe('End-to-End Watch Workflow', () => {
    it('should add watch, verify in list, and remove successfully', async () => {
      // Step 1: Add watch
      const watchResult = await handleWatchDirectory({
        directory: testDir,
        schedule: '0 10 * * *',
        auto_organize: true,
        min_file_age_minutes: 5,
        response_format: 'json',
      });

      expect(watchResult.isError).toBeFalsy();
      let watchData;
      try {
        watchData = JSON.parse(watchResult.content[0].text);
      } catch (e) {
        throw new Error(`Failed to parse watch add response: ${watchResult.content[0].text}`);
      }
      expect(watchData.success).toBe(true);

      // Step 2: Verify in list
      const listResult = await handleListWatches({ response_format: 'json' });
      let listData;
      try {
        listData = JSON.parse(listResult.content[0].text);
      } catch (e) {
        throw new Error(`Failed to parse list response: ${listResult.content[0].text}`);
      }
      expect(listData.count).toBe(1);
      expect(listData.watches[0].directory).toBe(testDir);
      expect(listData.watches[0].schedule).toBe('0 10 * * *');

      // Step 3: Remove watch
      const unwatchResult = await handleUnwatchDirectory({
        directory: testDir,
        response_format: 'json',
      });

      expect(unwatchResult.isError).toBeFalsy();

      // Step 4: Verify list is empty
      const finalListResult = await handleListWatches({ response_format: 'json' });
      let finalListData;
      try {
        finalListData = JSON.parse(finalListResult.content[0].text);
      } catch (e) {
        throw new Error(`Failed to parse final list response: ${finalListResult.content[0].text}`);
      }
      expect(finalListData.count).toBe(0);
    });

    it('should update existing watch without creating duplicate', async () => {
      // Add first watch
      await handleWatchDirectory({
        directory: testDir,
        schedule: '0 10 * * *',
        response_format: 'json',
      });

      // Update same directory with different schedule
      const updateResult = await handleWatchDirectory({
        directory: testDir,
        schedule: '*/30 * * * *',
        auto_organize: false,
        response_format: 'json',
      });

      let updateData;
      try {
        updateData = JSON.parse(updateResult.content[0].text);
      } catch (e) {
        throw new Error(`Failed to parse update response: ${updateResult.content[0].text}`);
      }
      expect(updateData.action).toBe('Updated');

      // Verify only one entry exists with new values
      const listResult = await handleListWatches({ response_format: 'json' });
      let listData;
      try {
        listData = JSON.parse(listResult.content[0].text);
      } catch (e) {
        throw new Error(`Failed to parse updated list response: ${listResult.content[0].text}`);
      }
      expect(listData.count).toBe(1);
      expect(listData.watches[0].schedule).toBe('*/30 * * * *');
    });
  });

  describe('Config Persistence', () => {
    it('should persist watch configuration to disk', async () => {
      // Add watch
      await handleWatchDirectory({
        directory: testDir,
        schedule: '0 15 * * *',
        auto_organize: true,
        max_files_per_run: 25,
        response_format: 'json',
      });

      // Load config directly from disk
      const config = loadUserConfig();

      expect(config.watchList).toBeDefined();
      expect(config.watchList!.length).toBeGreaterThan(0);

      const watch = config.watchList!.find((w) => w.directory === testDir);
      expect(watch).toBeDefined();
      expect(watch!.schedule).toBe('0 15 * * *');
      expect(watch!.rules.max_files_per_run).toBe(25);
    });
  });

  describe('Cron Expression Validation', () => {
    const validCronExpressions = [
      { expr: '0 10 * * *', desc: 'daily at 10am' },
      { expr: '*/30 * * * *', desc: 'every 30 minutes' },
      { expr: '0 */6 * * *', desc: 'every 6 hours' },
      { expr: '0 9 * * 1', desc: 'every Monday at 9am' },
      { expr: '* * * * *', desc: 'every minute' },
      { expr: '0 0 * * 0', desc: 'weekly at midnight' },
    ];

    validCronExpressions.forEach(({ expr, desc }) => {
      it(`should accept valid cron: "${expr}" (${desc})`, async () => {
        const result = await handleWatchDirectory({
          directory: testDir,
          schedule: expr,
          response_format: 'json',
        });

        // Clean up
        await handleUnwatchDirectory({ directory: testDir, response_format: 'json' });

        expect(result.isError).toBeFalsy();
      });
    });

    const invalidCronExpressions = [
      { expr: 'invalid', desc: 'invalid string' },
      { expr: '10 * *', desc: 'too few parts' },
      { expr: '0 0 0 0 0 0', desc: 'too many parts' },
    ];

    invalidCronExpressions.forEach(({ expr, desc }) => {
      it(`should reject invalid cron: "${expr}" (${desc})`, async () => {
        const result = await handleWatchDirectory({
          directory: testDir,
          schedule: expr,
          response_format: 'json',
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Invalid cron expression');
      });
    });

    it('should reject empty schedule via schema validation', async () => {
      // Empty string is caught by Zod schema (min length 1)
      const result = await handleWatchDirectory({
        directory: testDir,
        schedule: '',
        response_format: 'json',
      });

      // Schema validation should fail before cron validation
      expect(result.content[0].text).toContain('Error');
    });
  });

  describe('Multiple Watches', () => {
    it('should handle multiple directories with different schedules', async () => {
      try {
        // Add multiple watches
        await handleWatchDirectory({
          directory: testDir,
          schedule: '0 9 * * *',
          response_format: 'json',
        });

        await handleWatchDirectory({
          directory: testDir2,
          schedule: '0 10 * * *',
          auto_organize: false,
          response_format: 'json',
        });

        // Verify both in list
        const listResult = await handleListWatches({ response_format: 'json' });
        let listData;
        try {
          listData = JSON.parse(listResult.content[0].text);
        } catch (e) {
          throw new Error(
            `Failed to parse multiple watches list response: ${listResult.content[0].text}`
          );
        }

        expect(listData.count).toBe(2);
        const directories = listData.watches.map((w: any) => w.directory);
        expect(directories).toContain(testDir);
        expect(directories).toContain(testDir2);
      } finally {
        // Cleanup
        await handleUnwatchDirectory({ directory: testDir, response_format: 'json' }).catch(
          () => {}
        );
        await handleUnwatchDirectory({ directory: testDir2, response_format: 'json' }).catch(
          () => {}
        );
      }
    });

    it('should allow removing one watch while keeping others', async () => {
      try {
        // Add two watches
        await handleWatchDirectory({
          directory: testDir,
          schedule: '0 9 * * *',
          response_format: 'json',
        });
        await handleWatchDirectory({
          directory: testDir2,
          schedule: '0 10 * * *',
          response_format: 'json',
        });

        // Remove first
        await handleUnwatchDirectory({ directory: testDir, response_format: 'json' });

        // Verify only second remains
        const listResult = await handleListWatches({ response_format: 'json' });
        let listData;
        try {
          listData = JSON.parse(listResult.content[0].text);
        } catch (e) {
          throw new Error(`Failed to parse filtered list response: ${listResult.content[0].text}`);
        }

        expect(listData.count).toBe(1);
        expect(listData.watches[0].directory).toBe(testDir2);
      } finally {
        // Cleanup
        await handleUnwatchDirectory({ directory: testDir, response_format: 'json' }).catch(
          () => {}
        );
        await handleUnwatchDirectory({ directory: testDir2, response_format: 'json' }).catch(
          () => {}
        );
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle removing from empty watch list gracefully', async () => {
      // Ensure watch list is empty
      updateUserConfig({ watchList: [] });

      const result = await handleUnwatchDirectory({
        directory: testDir,
        response_format: 'json',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('was not in the watch list');
    });

    it('should return helpful message when no watches configured', async () => {
      updateUserConfig({ watchList: [] });

      const result = await handleListWatches({ response_format: 'markdown' });

      expect(result.content[0].text).toContain('No directories are currently being watched');
    });
  });
});
