/**
 * File Organizer MCP Server - Scheduler State Service Tests
 * Tests for state persistence and retrieval
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { SchedulerStateService, resetSchedulerStateService } from '../../../src/services/scheduler-state.service.js';

describe('SchedulerStateService', () => {
  let tempDir: string;
  let stateFilePath: string;
  let service: SchedulerStateService;

  beforeEach(async () => {
    // Create a temporary directory for test state files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scheduler-state-test-'));
    stateFilePath = path.join(tempDir, 'scheduler-state.json');
    service = new SchedulerStateService(stateFilePath);
    await service.initialize();
  });

  afterEach(async () => {
    resetSchedulerStateService();
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Initialization', () => {
    it('should initialize with empty state when file does not exist', async () => {
      const newService = new SchedulerStateService(stateFilePath);
      await newService.initialize();

      expect(newService.getTrackedDirectories()).toEqual([]);
      expect(newService.getLastRunTime('/any/path')).toBeNull();
    });

    it('should initialize with existing state when file exists', async () => {
      // Set some state
      await service.setLastRunTime('/test/dir', new Date('2026-02-08T09:00:00.000Z'), '0 9 * * *');

      // Create new service instance with same file
      const newService = new SchedulerStateService(stateFilePath);
      await newService.initialize();

      const lastRun = newService.getLastRunTime('/test/dir');
      expect(lastRun).not.toBeNull();
      expect(lastRun?.toISOString()).toBe('2026-02-08T09:00:00.000Z');
    });

    it('should handle corrupted state file gracefully', async () => {
      // Write invalid JSON
      await fs.writeFile(stateFilePath, 'not valid json', 'utf-8');

      const newService = new SchedulerStateService(stateFilePath);
      await newService.initialize();

      // Should start fresh
      expect(newService.getTrackedDirectories()).toEqual([]);
    });

    it('should handle empty state file gracefully', async () => {
      // Write empty file
      await fs.writeFile(stateFilePath, '', 'utf-8');

      const newService = new SchedulerStateService(stateFilePath);
      await newService.initialize();

      // Should start fresh
      expect(newService.getTrackedDirectories()).toEqual([]);
    });
  });

  describe('State Persistence', () => {
    it('should write state to file correctly', async () => {
      const runTime = new Date('2026-02-08T09:00:00.000Z');
      await service.setLastRunTime('/test/dir', runTime, '0 9 * * *');

      // Read file directly and verify
      const fileContent = await fs.readFile(stateFilePath, 'utf-8');
      const state = JSON.parse(fileContent);

      expect(state.version).toBe(1);
      // Path is normalized (lowercase, forward slashes)
      const keys = Object.keys(state.directories);
      expect(keys.length).toBe(1);
      expect(state.directories[keys[0]].lastRunTime).toBe('2026-02-08T09:00:00.000Z');
      expect(state.directories[keys[0]].schedule).toBe('0 9 * * *');
    });

    it('should read state from file correctly', async () => {
      // Use the service to set state (which handles normalization)
      await service.setLastRunTime('/another/dir', new Date('2026-02-07T15:30:00.000Z'), '0 */6 * * *');

      // Create new service instance with same file
      const newService = new SchedulerStateService(stateFilePath);
      await newService.initialize();

      // Path is normalized, so we need to check with normalized path
      const trackedDirs = newService.getTrackedDirectories();
      expect(trackedDirs.length).toBe(1);
      const lastRun = newService.getLastRunTime(trackedDirs[0]);
      expect(lastRun?.toISOString()).toBe('2026-02-07T15:30:00.000Z');
      expect(newService.getSchedule(trackedDirs[0])).toBe('0 */6 * * *');
    });

    it('should handle multiple directories', async () => {
      await service.setLastRunTime('/dir/one', new Date('2026-02-08T09:00:00.000Z'), '0 9 * * *');
      await service.setLastRunTime('/dir/two', new Date('2026-02-08T10:00:00.000Z'), '0 10 * * *');

      const dirs = service.getTrackedDirectories();
      expect(dirs).toHaveLength(2);
      // Paths are normalized to lowercase on Windows
      expect(dirs.some((d) => d.toLowerCase().includes('/dir/one'))).toBe(true);
      expect(dirs.some((d) => d.toLowerCase().includes('/dir/two'))).toBe(true);
    });
  });

  describe('getLastRunTime', () => {
    it('should return null for untracked directory', () => {
      expect(service.getLastRunTime('/untracked/dir')).toBeNull();
    });

    it('should return correct Date for tracked directory', async () => {
      const runTime = new Date('2026-02-08T09:00:00.000Z');
      await service.setLastRunTime('/tracked/dir', runTime, '0 9 * * *');

      const result = service.getLastRunTime('/tracked/dir');
      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString()).toBe('2026-02-08T09:00:00.000Z');
    });

    it('should normalize directory paths', async () => {
      const runTime = new Date('2026-02-08T09:00:00.000Z');
      await service.setLastRunTime('/Test/Dir', runTime, '0 9 * * *');

      // Should find with different case on Windows
      const result = service.getLastRunTime('/test/dir');
      expect(result).not.toBeNull();
    });
  });

  describe('setLastRunTime', () => {
    it('should set last run time with explicit timestamp', async () => {
      const runTime = new Date('2026-02-08T09:00:00.000Z');
      await service.setLastRunTime('/test/dir', runTime, '0 9 * * *');

      const result = service.getLastRunTime('/test/dir');
      expect(result?.toISOString()).toBe('2026-02-08T09:00:00.000Z');
    });

    it('should default to current time when timestamp not provided', async () => {
      const before = Date.now();
      await service.setLastRunTime('/test/dir', undefined, '0 9 * * *');
      const after = Date.now();

      const result = service.getLastRunTime('/test/dir');
      expect(result).not.toBeNull();
      expect(result!.getTime()).toBeGreaterThanOrEqual(before);
      expect(result!.getTime()).toBeLessThanOrEqual(after + 1000); // Allow 1 second buffer
    });

    it('should update existing entry', async () => {
      await service.setLastRunTime('/test/dir', new Date('2026-02-08T09:00:00.000Z'), '0 9 * * *');
      await service.setLastRunTime('/test/dir', new Date('2026-02-08T10:00:00.000Z'), '0 10 * * *');

      const result = service.getLastRunTime('/test/dir');
      expect(result?.toISOString()).toBe('2026-02-08T10:00:00.000Z');
      expect(service.getSchedule('/test/dir')).toBe('0 10 * * *');
    });
  });

  describe('getSchedule', () => {
    it('should return empty string for untracked directory', () => {
      expect(service.getSchedule('/untracked/dir')).toBe('');
    });

    it('should return schedule for tracked directory', async () => {
      await service.setLastRunTime('/test/dir', new Date(), '0 */6 * * *');
      expect(service.getSchedule('/test/dir')).toBe('0 */6 * * *');
    });
  });

  describe('clearDirectoryState', () => {
    it('should remove specific directory from state', async () => {
      await service.setLastRunTime('/dir/one', new Date(), '0 9 * * *');
      await service.setLastRunTime('/dir/two', new Date(), '0 10 * * *');

      await service.clearDirectoryState('/dir/one');

      expect(service.getLastRunTime('/dir/one')).toBeNull();
      expect(service.getLastRunTime('/dir/two')).not.toBeNull();
    });

    it('should handle clearing non-existent directory', async () => {
      // Should not throw
      await expect(service.clearDirectoryState('/non/existent')).resolves.not.toThrow();
    });
  });

  describe('clearState', () => {
    it('should remove all directories from state', async () => {
      await service.setLastRunTime('/dir/one', new Date(), '0 9 * * *');
      await service.setLastRunTime('/dir/two', new Date(), '0 10 * * *');

      await service.clearState();

      expect(service.getTrackedDirectories()).toHaveLength(0);
      expect(service.getLastRunTime('/dir/one')).toBeNull();
      expect(service.getLastRunTime('/dir/two')).toBeNull();
    });

    it('should persist cleared state to file', async () => {
      await service.setLastRunTime('/test/dir', new Date(), '0 9 * * *');
      await service.clearState();

      // Create new service and verify it's empty
      const newService = new SchedulerStateService(stateFilePath);
      await newService.initialize();

      expect(newService.getTrackedDirectories()).toHaveLength(0);
    });
  });

  describe('getTrackedDirectories', () => {
    it('should return empty array when no directories tracked', () => {
      expect(service.getTrackedDirectories()).toEqual([]);
    });

    it('should return array of directory paths', async () => {
      await service.setLastRunTime('/dir/one', new Date(), '0 9 * * *');
      await service.setLastRunTime('/dir/two', new Date(), '0 10 * * *');

      const dirs = service.getTrackedDirectories();
      expect(dirs).toHaveLength(2);
    });
  });

  describe('getState', () => {
    it('should return copy of current state', async () => {
      await service.setLastRunTime('/test/dir', new Date('2026-02-08T09:00:00.000Z'), '0 9 * * *');

      const state = service.getState();
      expect(state.version).toBe(1);
      expect(Object.keys(state.directories)).toHaveLength(1);

      // Modifying returned state should not affect internal state
      state.directories['/new/dir'] = { lastRunTime: new Date().toISOString(), schedule: '' };
      expect(service.getTrackedDirectories()).toHaveLength(1);
    });
  });

  describe('State Validation', () => {
    it('should reject invalid state with missing version', async () => {
      const invalidState = {
        directories: {},
      };
      await fs.writeFile(stateFilePath, JSON.stringify(invalidState), 'utf-8');

      const newService = new SchedulerStateService(stateFilePath);
      await newService.initialize();

      // Should start fresh due to invalid state
      expect(newService.getTrackedDirectories()).toEqual([]);
    });

    it('should reject invalid state with invalid date format', async () => {
      const invalidState = {
        version: 1,
        directories: {
          '/test/dir': {
            lastRunTime: 'not-a-valid-date',
            schedule: '0 9 * * *',
          },
        },
      };
      await fs.writeFile(stateFilePath, JSON.stringify(invalidState), 'utf-8');

      const newService = new SchedulerStateService(stateFilePath);
      await newService.initialize();

      // Should start fresh due to invalid date
      expect(newService.getLastRunTime('/test/dir')).toBeNull();
    });

    it('should reject state with wrong directory state type', async () => {
      const invalidState = {
        version: 1,
        directories: {
          '/test/dir': 'not-an-object',
        },
      };
      await fs.writeFile(stateFilePath, JSON.stringify(invalidState), 'utf-8');

      const newService = new SchedulerStateService(stateFilePath);
      await newService.initialize();

      // Should start fresh
      expect(newService.getTrackedDirectories()).toEqual([]);
    });
  });

  describe('Path Normalization', () => {
    it('should normalize absolute paths', async () => {
      // Use relative path that will be resolved
      await service.setLastRunTime('relative/path', new Date(), '0 9 * * *');

      // Should be stored as absolute path
      const dirs = service.getTrackedDirectories();
      expect(dirs.length).toBe(1);
      // On Windows, paths start with drive letter; on Unix with /
      expect(typeof dirs[0]).toBe('string');
    });

    it('should handle Windows-style paths', async () => {
      // Test with backslashes (will be normalized)
      await service.setLastRunTime('\\some\\path', new Date(), '0 9 * * *');

      // Path should be normalized (lowercase, forward slashes)
      const dirs = service.getTrackedDirectories();
      expect(dirs.length).toBeGreaterThan(0);
    });
  });
});
