/**
 * File Organizer MCP Server - Auto-Organize Service Tests
 * Tests for cron scheduling logic, missed schedule catch-up, and configuration
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { WatchConfig } from '../../../src/config.js';

describe('AutoOrganizeService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Service Lifecycle', () => {
    it('should start with no tasks initially', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');
      const { FileScannerService } = await import('../../../src/core/scan/scanner.js');
      const { OrganizerService } = await import('../../../src/core/organize/organizer.js');

      const mockConfig = { watchList: [] };
      const service = new AutoOrganizeService(
        new FileScannerService(),
        new OrganizerService(),
        () => mockConfig
      );
      expect(service.isActive()).toBe(false);
      expect(service.getTaskCount()).toBe(0);
      service.stop();
    });

    it('should be inactive before start', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');
      const { FileScannerService } = await import('../../../src/core/scan/scanner.js');
      const { OrganizerService } = await import('../../../src/core/organize/organizer.js');

      const mockConfig = { watchList: [] };
      const service = new AutoOrganizeService(
        new FileScannerService(),
        new OrganizerService(),
        () => mockConfig
      );
      expect(service.isActive()).toBe(false);
      service.stop();
    });

    it('should return empty watched directories initially', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');
      const { FileScannerService } = await import('../../../src/core/scan/scanner.js');
      const { OrganizerService } = await import('../../../src/core/organize/organizer.js');

      const mockConfig = { watchList: [] };
      const service = new AutoOrganizeService(
        new FileScannerService(),
        new OrganizerService(),
        () => mockConfig
      );
      expect(service.getWatchedDirectories()).toEqual([]);
      service.stop();
    });
  });

  describe('Cron Schedule Conversion', () => {
    it('should convert hourly to correct cron', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');
      const { FileScannerService } = await import('../../../src/core/scan/scanner.js');
      const { OrganizerService } = await import('../../../src/core/organize/organizer.js');

      const mockConfig = { watchList: [] };
      const service = new AutoOrganizeService(
        new FileScannerService(),
        new OrganizerService(),
        () => mockConfig
      );
      const hourlyCron = (service as any).legacyScheduleToCron('hourly');
      expect(hourlyCron).toBe('0 * * * *');
      service.stop();
    });

    it('should convert daily to correct cron', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');
      const { FileScannerService } = await import('../../../src/core/scan/scanner.js');
      const { OrganizerService } = await import('../../../src/core/organize/organizer.js');

      const mockConfig = { watchList: [] };
      const service = new AutoOrganizeService(
        new FileScannerService(),
        new OrganizerService(),
        () => mockConfig
      );
      const dailyCron = (service as any).legacyScheduleToCron('daily');
      expect(dailyCron).toBe('0 9 * * *');
      service.stop();
    });

    it('should convert weekly to correct cron', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');
      const { FileScannerService } = await import('../../../src/core/scan/scanner.js');
      const { OrganizerService } = await import('../../../src/core/organize/organizer.js');

      const mockConfig = { watchList: [] };
      const service = new AutoOrganizeService(
        new FileScannerService(),
        new OrganizerService(),
        () => mockConfig
      );
      const weeklyCron = (service as any).legacyScheduleToCron('weekly');
      expect(weeklyCron).toBe('0 9 * * 0');
      service.stop();
    });

    it('should default to daily for unknown schedules', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');
      const { FileScannerService } = await import('../../../src/core/scan/scanner.js');
      const { OrganizerService } = await import('../../../src/core/organize/organizer.js');

      const mockConfig = { watchList: [] };
      const service = new AutoOrganizeService(
        new FileScannerService(),
        new OrganizerService(),
        () => mockConfig
      );
      const defaultCron = (service as any).legacyScheduleToCron('unknown');
      expect(defaultCron).toBe('0 9 * * *');
      service.stop();
    });
  });

  describe('getStatus', () => {
    it('should return correct initial status', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');
      const { FileScannerService } = await import('../../../src/core/scan/scanner.js');
      const { OrganizerService } = await import('../../../src/core/organize/organizer.js');

      const mockConfig = { watchList: [] };
      const service = new AutoOrganizeService(
        new FileScannerService(),
        new OrganizerService(),
        () => mockConfig
      );
      const status = service.getStatus();
      expect(status.active).toBe(false);
      expect(status.taskCount).toBe(0);
      expect(status.watchedDirectories).toEqual([]);
      expect(status.runningDirectories).toEqual([]);
      service.stop();
    });
  });

  describe('shouldIncludeInCatchupCheck', () => {
    it('should return true when auto_organize is enabled', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');
      const { FileScannerService } = await import('../../../src/core/scan/scanner.js');
      const { OrganizerService } = await import('../../../src/core/organize/organizer.js');

      const mockConfig = { watchList: [] };
      const service = new AutoOrganizeService(
        new FileScannerService(),
        new OrganizerService(),
        () => mockConfig
      );
      const watch: WatchConfig = {
        directory: '/test',
        schedule: '0 9 * * *',
        rules: { auto_organize: true },
      };
      expect((service as any).shouldIncludeInCatchupCheck(watch)).toBe(true);
      service.stop();
    });

    it('should return false when auto_organize is disabled', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');
      const { FileScannerService } = await import('../../../src/core/scan/scanner.js');
      const { OrganizerService } = await import('../../../src/core/organize/organizer.js');

      const mockConfig = { watchList: [] };
      const service = new AutoOrganizeService(
        new FileScannerService(),
        new OrganizerService(),
        () => mockConfig
      );
      const watch: WatchConfig = {
        directory: '/test',
        schedule: '0 9 * * *',
        rules: { auto_organize: false },
      };
      expect((service as any).shouldIncludeInCatchupCheck(watch)).toBe(false);
      service.stop();
    });
  });

  describe('runMissedSchedules', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auto-organize-test-'));
    });

    afterEach(async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should not throw when watchList is empty', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');
      const { FileScannerService } = await import('../../../src/core/scan/scanner.js');
      const { OrganizerService } = await import('../../../src/core/organize/organizer.js');

      const mockConfig = { watchList: [] };
      const service = new AutoOrganizeService(
        new FileScannerService(),
        new OrganizerService(),
        () => mockConfig
      );
      await expect(service.runMissedSchedules()).resolves.not.toThrow();
      service.stop();
    });

    it('should skip directories already in runningDirectories', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');
      const { FileScannerService } = await import('../../../src/core/scan/scanner.js');
      const { OrganizerService } = await import('../../../src/core/organize/organizer.js');

      const watches: WatchConfig[] = [
        {
          directory: tempDir,
          schedule: '0 9 * * *',
          rules: { auto_organize: true },
        },
      ];
      const mockConfig = { watchList: watches };
      const service = new AutoOrganizeService(
        new FileScannerService(),
        new OrganizerService(),
        () => mockConfig
      );

      (service as any).runningDirectories = new Set([tempDir]);

      const runOrgSpy = jest.spyOn(service as any, 'runOrganization').mockResolvedValue(undefined);

      await service.runMissedSchedules();

      expect(runOrgSpy).not.toHaveBeenCalled();

      (service as any).runningDirectories = new Set();
      runOrgSpy.mockRestore();
      service.stop();
    });

    it('should allow processing different directories even when one is running', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');
      const { FileScannerService } = await import('../../../src/core/scan/scanner.js');
      const { OrganizerService } = await import('../../../src/core/organize/organizer.js');

      const dir1 = tempDir;
      const dir2 = await fs.mkdtemp(path.join(os.tmpdir(), 'auto-organize-test-2-'));

      try {
        const watches: WatchConfig[] = [
          {
            directory: dir1,
            schedule: '0 9 * * *',
            rules: { auto_organize: true, catchup_mode: 'always' },
          },
          {
            directory: dir2,
            schedule: '0 10 * * *',
            rules: { auto_organize: true, catchup_mode: 'always' },
          },
        ];
        const mockConfig = { watchList: watches };

        const mockStateService: any = {
          initialize: jest.fn(() => Promise.resolve()) as any,
          getLastRunTime: jest.fn().mockReturnValue(null),
          recordRunTime: jest.fn(),
        };

        const service = new AutoOrganizeService(
          new FileScannerService(),
          new OrganizerService(),
          () => mockConfig,
          mockStateService
        );

        (service as any).runningDirectories = new Set([dir1]);

        const runOrgSpy = jest
          .spyOn(service as any, 'runOrganization')
          .mockResolvedValue(undefined);

        await service.runMissedSchedules();

        expect(runOrgSpy).toHaveBeenCalledTimes(1);
        expect(runOrgSpy).toHaveBeenCalledWith(watches[1]);

        (service as any).runningDirectories = new Set();
        runOrgSpy.mockRestore();
        service.stop();
      } finally {
        await fs.rm(dir2, { recursive: true, force: true });
      }
    });

    it('should handle errors when catch-up fails for a directory without throwing', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');
      const { FileScannerService } = await import('../../../src/core/scan/scanner.js');
      const { OrganizerService } = await import('../../../src/core/organize/organizer.js');

      const dir1 = tempDir;
      const dir2 = await fs.mkdtemp(path.join(os.tmpdir(), 'auto-organize-test-2-'));

      try {
        const watches: WatchConfig[] = [
          {
            directory: dir1,
            schedule: '0 9 * * *',
            rules: { auto_organize: true, catchup_mode: 'always' },
          },
          {
            directory: dir2,
            schedule: '0 10 * * *',
            rules: { auto_organize: true, catchup_mode: 'always' },
          },
        ];
        const mockConfig = { watchList: watches };

        const mockStateService: any = {
          initialize: jest.fn(() => Promise.resolve()) as any,
          getLastRunTime: jest.fn().mockReturnValue(null),
          recordRunTime: jest.fn(),
        };

        const service = new AutoOrganizeService(
          new FileScannerService(),
          new OrganizerService(),
          () => mockConfig,
          mockStateService
        );

        let callCount = 0;
        const runOrgSpy = jest
          .spyOn(service as any, 'runOrganization')
          .mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
              throw new Error('Simulated error');
            }
          });

        await expect(service.runMissedSchedules()).resolves.not.toThrow();

        expect(callCount).toBe(2);

        runOrgSpy.mockRestore();
        service.stop();
      } finally {
        await fs.rm(dir2, { recursive: true, force: true });
      }
    });
  });

  describe('triggerNow', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'trigger-test-'));
    });

    afterEach(async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should return false when directory is not in watch list', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');
      const { FileScannerService } = await import('../../../src/core/scan/scanner.js');
      const { OrganizerService } = await import('../../../src/core/organize/organizer.js');

      const mockConfig = { watchList: [] };
      const service = new AutoOrganizeService(
        new FileScannerService(),
        new OrganizerService(),
        () => mockConfig
      );

      const result = await service.triggerNow('/nonexistent');
      expect(result).toBe(false);
      service.stop();
    });

    it('should return true and run organization when directory is in watch list', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');
      const { FileScannerService } = await import('../../../src/core/scan/scanner.js');
      const { OrganizerService } = await import('../../../src/core/organize/organizer.js');

      const watches: WatchConfig[] = [
        {
          directory: tempDir,
          schedule: '0 9 * * *',
          rules: { auto_organize: true },
        },
      ];
      const mockConfig = { watchList: watches };
      const service = new AutoOrganizeService(
        new FileScannerService(),
        new OrganizerService(),
        () => mockConfig
      );

      const runOrgSpy = jest.spyOn(service as any, 'runOrganization').mockResolvedValue(undefined);

      const result = await service.triggerNow(tempDir);

      expect(result).toBe(true);
      expect(runOrgSpy).toHaveBeenCalledTimes(1);

      runOrgSpy.mockRestore();
      service.stop();
    });

    it('should not run if already running for directory', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');
      const { FileScannerService } = await import('../../../src/core/scan/scanner.js');
      const { OrganizerService } = await import('../../../src/core/organize/organizer.js');

      const watches: WatchConfig[] = [
        {
          directory: tempDir,
          schedule: '0 9 * * *',
          rules: { auto_organize: true },
        },
      ];
      const mockConfig = { watchList: watches };
      const service = new AutoOrganizeService(
        new FileScannerService(),
        new OrganizerService(),
        () => mockConfig
      );

      (service as any).runningDirectories = new Set([tempDir]);

      const runOrgSpy = jest.spyOn(service as any, 'runOrganization').mockResolvedValue(undefined);

      const result = await service.triggerNow(tempDir);

      expect(result).toBe(false);
      expect(runOrgSpy).not.toHaveBeenCalled();

      (service as any).runningDirectories = new Set();
      runOrgSpy.mockRestore();
      service.stop();
    });
  });

  describe('BUG-57 symlinked watch directories', () => {
    let realDir: string;
    let symlinkDir: string;

    beforeEach(async () => {
      realDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bug57-real-'));
      const symlinkBase = await fs.mkdtemp(path.join(os.tmpdir(), 'bug57-linkbase-'));
      symlinkDir = path.join(symlinkBase, 'link-to-real');
      await fs.symlink(realDir, symlinkDir);
    });

    afterEach(async () => {
      try {
        await fs.rm(realDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
      try {
        await fs.rm(path.dirname(symlinkDir), { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
      jest.restoreAllMocks();
    });

    it('should find state written via symlink path when looking up via missed schedule logic', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');
      const { FileScannerService } = await import('../../../src/core/scan/scanner.js');
      const { OrganizerService } = await import('../../../src/core/organize/organizer.js');
      const { SchedulerStateService } = await import('../../../src/extensions/scheduler/scheduler-state.service.js');
      const { validateStrictPath } = await import('../../../src/services/path-validator.service.js');

      const watches: WatchConfig[] = [
        {
          directory: symlinkDir,
          schedule: '0 9 * * *',
          rules: { auto_organize: true, catchup_mode: 'smart' },
        },
      ];
      const mockConfig = { watchList: watches };

      const stateFile = path.join(os.tmpdir(), `scheduler-state-bug57-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      const stateService = new SchedulerStateService(stateFile);
      await stateService.initialize();

      const service = new AutoOrganizeService(
        new FileScannerService(),
        new OrganizerService(),
        () => mockConfig,
        stateService
      );
      await service.initialize();

      // Write state as runOrganization would (under validated/realpath)
      const validatedDirectory = await validateStrictPath(symlinkDir);
      await stateService.setLastRunTime(validatedDirectory, new Date(Date.now() - 25 * 60 * 60 * 1000), '0 9 * * *');

      // Mock shouldCatchup to indicate it was missed if looked up correctly
      const cronUtils = await import('../../../src/utils/cron-utils.js');
      const shouldCatchupSpy = jest.spyOn(cronUtils, 'shouldCatchup').mockReturnValue(true);

      const runOrgSpy = jest.spyOn(service as any, 'runOrganization').mockResolvedValue(undefined);

      // Look up the way missed-schedule path does
      await service.runMissedSchedules();

      // If lookup uses raw symlink path incorrectly, it won't find state -> may trigger catchup
      // With fix, it finds state using resolved key -> shouldCatchup called with correct lookup
      expect(shouldCatchupSpy).toHaveBeenCalled();
      const lastRunArg = shouldCatchupSpy.mock.calls[0][1];
      expect(lastRunArg).not.toBeNull();

      shouldCatchupSpy.mockRestore();
      runOrgSpy.mockRestore();
      service.stop();
      try {
        await fs.rm(stateFile, { force: true });
      } catch {
        // ignore
      }
    });
  });
});
