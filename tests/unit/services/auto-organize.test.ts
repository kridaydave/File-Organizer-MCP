/**
 * File Organizer MCP Server - Auto-Organize Service Tests
 * Tests for cron scheduling logic, missed schedule catch-up, and configuration
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { WatchConfig } from '../../../src/config.js';
import type {
  OrganizePassOptions,
  OrganizePassResult,
} from '../../../src/extensions/scheduler/organize-pass.js';

describe('AutoOrganizeService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Service Lifecycle', () => {
    it('should start with no tasks initially', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');

      const mockConfig = { watchList: [] };
      const service = new AutoOrganizeService(
        () => mockConfig
      );
      expect(service.isActive()).toBe(false);
      expect(service.getTaskCount()).toBe(0);
      service.stop();
    });

    it('should be inactive before start', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');

      const mockConfig = { watchList: [] };
      const service = new AutoOrganizeService(
        () => mockConfig
      );
      expect(service.isActive()).toBe(false);
      service.stop();
    });

    it('should return empty watched directories initially', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');

      const mockConfig = { watchList: [] };
      const service = new AutoOrganizeService(
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

      const mockConfig = { watchList: [] };
      const service = new AutoOrganizeService(
        () => mockConfig
      );
      const hourlyCron = (service as any).legacyScheduleToCron('hourly');
      expect(hourlyCron).toBe('0 * * * *');
      service.stop();
    });

    it('should convert daily to correct cron', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');

      const mockConfig = { watchList: [] };
      const service = new AutoOrganizeService(
        () => mockConfig
      );
      const dailyCron = (service as any).legacyScheduleToCron('daily');
      expect(dailyCron).toBe('0 9 * * *');
      service.stop();
    });

    it('should convert weekly to correct cron', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');

      const mockConfig = { watchList: [] };
      const service = new AutoOrganizeService(
        () => mockConfig
      );
      const weeklyCron = (service as any).legacyScheduleToCron('weekly');
      expect(weeklyCron).toBe('0 9 * * 0');
      service.stop();
    });

    it('should default to daily for unknown schedules', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');

      const mockConfig = { watchList: [] };
      const service = new AutoOrganizeService(
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

      const mockConfig = { watchList: [] };
      const service = new AutoOrganizeService(
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

      const mockConfig = { watchList: [] };
      const service = new AutoOrganizeService(
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

      const mockConfig = { watchList: [] };
      const service = new AutoOrganizeService(
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
    let originalCustomAllowed: string[];

    beforeEach(async () => {
      // Canonicalise once. validateStrictPath resolves through realpath, so on
      // macOS os.tmpdir() (/var/...) and the path the code compares against
      // (/private/var/...) differ, and an assertion on the raw string fails
      // there while passing in CI. Assert the canonical value throughout.
      tempDir = await fs.realpath(
        await fs.mkdtemp(path.join(os.tmpdir(), 'auto-organize-test-')),
      );
      // The tests below reach runOrganization, which validates the directory
      // against the allow-list. os.tmpdir() is outside the default roots.
      const { CONFIG } = await import('../../../src/core/config/defaults.js');
      originalCustomAllowed = CONFIG.paths.customAllowed;
      CONFIG.paths.customAllowed = [...originalCustomAllowed, tempDir];
    });

    afterEach(async () => {
      const { CONFIG } = await import('../../../src/core/config/defaults.js');
      CONFIG.paths.customAllowed = originalCustomAllowed;
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should not throw when watchList is empty', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');

      const mockConfig = { watchList: [] };
      const service = new AutoOrganizeService(
        () => mockConfig
      );
      await expect(service.runMissedSchedules()).resolves.not.toThrow();
      service.stop();
    });

    it('moves files on a scheduled sweep instead of planning only', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');
      await fs.writeFile(path.join(tempDir, 'invoice.txt'), 'hello');

      const watches: WatchConfig[] = [
        { directory: tempDir, schedule: '0 9 * * *', rules: { auto_organize: true } },
      ];

      // Asserted on the options the daemon hands the shared pass, not on the
      // file outcome. The pass default is dry run, so a daemon that dropped the
      // explicit false would plan every move and move nothing, and every other
      // test here stubs the pass and would stay green through that regression.
      const calls: OrganizePassOptions[] = [];
      const service = new AutoOrganizeService(
        () => ({ watchList: watches }),
        undefined,
        async (options: OrganizePassOptions): Promise<OrganizePassResult> => {
          calls.push(options);
          return {
            directory: tempDir, dryRun: false, scanned: 1, planned: 1, moved: 1,
            skipped: 0, statistics: {}, errors: [], aborted: false, historyLogged: true,
          };
        },
      );

      const result = await service.triggerNow(tempDir);

      expect(calls).toHaveLength(1);
      expect(result).toEqual({ status: 'ran', directory: tempDir });
      expect(calls[0]).toMatchObject({
        directory: tempDir,
        dryRun: false,
        source: 'scheduled',
      });

      service.stop();
    });

    it('supplies the daemon age and size defaults to the shared pass', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');

      const watches: WatchConfig[] = [
        { directory: tempDir, schedule: '0 9 * * *', rules: { auto_organize: true } },
      ];
      const calls: OrganizePassOptions[] = [];
      const service = new AutoOrganizeService(
        () => ({ watchList: watches }),
        undefined,
        async (options: OrganizePassOptions): Promise<OrganizePassResult> => {
          calls.push(options);
          return {
            directory: tempDir, dryRun: false, scanned: 0, planned: 0, moved: 0,
            skipped: 0, statistics: {}, errors: [], aborted: false, historyLogged: false,
          };
        },
      );

      await service.triggerNow(tempDir);

      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ minFileAgeMinutes: 60, maxFiles: 300 });

      service.stop();
    });

    it('does not skip a directory that is already in flight', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');

      const watches: WatchConfig[] = [
        {
          directory: tempDir,
          schedule: '0 9 * * *',
          rules: { auto_organize: true },
        },
      ];
      const mockConfig = { watchList: watches };
      const service = new AutoOrganizeService(
        () => mockConfig
      );

      // One daemon runs every watch concurrently, so an overlap is a normal
      // pass and not something to refuse. Pinning the opposite of the old
      // guard: this is the behavior change, so it needs a test that fails if
      // the gate comes back.
      (service as any).inFlight = new Map([[tempDir, 1]]);

      // What the guard would decide here, so the stub answers the way the real
      // runOrganization does for a directory already mid-pass.
      const runOrgSpy = jest
        .spyOn(service as any, 'runOrganization')
        .mockResolvedValue({
          status: 'skipped',
          directory: tempDir,
          reason: 'in-flight',
        });

      await service.runMissedSchedules();

      expect(runOrgSpy).toHaveBeenCalledTimes(1);

      (service as any).inFlight = new Map();
      runOrgSpy.mockRestore();
      service.stop();
    });

    it('should allow processing different directories even when one is running', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');

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
          () => mockConfig,
          mockStateService
        );

        (service as any).inFlight = new Map([[dir1, 1]]);

        const runOrgSpy = jest
          .spyOn(service as any, 'runOrganization')
          .mockResolvedValue({
            status: 'skipped',
            directory: dir1,
            reason: 'in-flight',
          });

        await service.runMissedSchedules();

        // Both directories run. dir1 is already in flight, and nothing skips it.
        expect(runOrgSpy).toHaveBeenCalledTimes(2);
        expect(runOrgSpy).toHaveBeenCalledWith(watches[0]);
        expect(runOrgSpy).toHaveBeenCalledWith(watches[1]);

        (service as any).inFlight = new Map();
        runOrgSpy.mockRestore();
        service.stop();
      } finally {
        await fs.rm(dir2, { recursive: true, force: true });
      }
    });

    it('schedules each watch with noOverlap so a tick cannot race its own predecessor', async () => {
      const cron = (await import('node-cron')).default;
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');

      const watches: WatchConfig[] = [
        { directory: tempDir, schedule: '*/5 * * * *', rules: { auto_organize: true } },
      ];
      const service = new AutoOrganizeService(() => ({ watchList: watches }));

      // The old code refused a second pass over one directory with an in-memory
      // Set. The gate moved into the scheduler, where node-cron can hold it per
      // task instead of per daemon. Pinned here because dropping the option
      // would let two ticks plan the same moves with nothing left to stop them.
      const scheduleSpy = jest.spyOn(cron, 'schedule');

      try {
        service.reloadTasks();

        expect(scheduleSpy).toHaveBeenCalledTimes(1);
        expect(scheduleSpy.mock.calls[0]?.[2]).toEqual({ noOverlap: true });
      } finally {
        scheduleSpy.mockRestore();
        service.stop();
      }
    });

    it('should handle errors when catch-up fails for a directory without throwing', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');

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
          () => mockConfig,
          mockStateService
        );

        let callCount = 0;
        // Only the call count matters here, so the stub reports a plain
        // completed pass for whichever directory the catchup handed it.
        const runOrgSpy = jest
          .spyOn(service as any, 'runOrganization')
          .mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
              throw new Error('Simulated error');
            }
            return { status: 'ran', directory: tempDir };
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
    let originalCustomAllowed: string[];

    beforeEach(async () => {
      // Canonicalise once, for the same reason as the catchup describe:
      // validateStrictPath resolves through realpath, so the key the in-flight
      // guard uses is the canonical path rather than the mkdtemp spelling.
      tempDir = await fs.realpath(
        await fs.mkdtemp(path.join(os.tmpdir(), 'trigger-test-')),
      );
      // The skip tests below run the real runOrganization, which validates the
      // directory against the allow-list. os.tmpdir() is not in the default
      // roots, so it is whitelisted for the duration of the test.
      const { CONFIG } = await import('../../../src/core/config/defaults.js');
      originalCustomAllowed = CONFIG.paths.customAllowed;
      CONFIG.paths.customAllowed = [...originalCustomAllowed, tempDir];
    });

    afterEach(async () => {
      const { CONFIG } = await import('../../../src/core/config/defaults.js');
      CONFIG.paths.customAllowed = originalCustomAllowed;
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should report a skip when directory is not in watch list', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');

      const mockConfig = { watchList: [] };
      const service = new AutoOrganizeService(
        () => mockConfig
      );

      const result = await service.triggerNow(tempDir);
      expect(result).toEqual({
        status: 'skipped',
        directory: tempDir,
        reason: 'not-watched',
      });
      service.stop();
    });

    it('should return the pass outcome when directory is in watch list', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');

      const watches: WatchConfig[] = [
        {
          directory: tempDir,
          schedule: '0 9 * * *',
          rules: { auto_organize: true },
        },
      ];
      const mockConfig = { watchList: watches };
      const service = new AutoOrganizeService(
        () => mockConfig
      );

      const runOrgSpy = jest.spyOn(service as any, 'runOrganization').mockResolvedValue({
        status: 'ran',
        directory: tempDir,
      });

      const result = await service.triggerNow(tempDir);

      expect(result).toEqual({ status: 'ran', directory: tempDir });
      expect(runOrgSpy).toHaveBeenCalledTimes(1);

      runOrgSpy.mockRestore();
      service.stop();
    });

    it('reports the skip when the pass is already in flight', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');

      const watches: WatchConfig[] = [
        {
          directory: tempDir,
          schedule: '0 9 * * *',
          rules: { auto_organize: true },
        },
      ];
      const mockConfig = { watchList: watches };
      const service = new AutoOrganizeService(
        () => mockConfig
      );

      (service as any).inFlight = new Map([[tempDir, 1]]);

      // Stubbed so the test pins triggerNow alone: it must hand back whatever
      // runOrganization decided instead of reporting success. The version that
      // stubbed this with `mockResolvedValue(undefined)` asserted `true` for a
      // pass that never ran, which is the returned-value lie.
      const runOrgSpy = jest.spyOn(service as any, 'runOrganization').mockResolvedValue({
        status: 'skipped',
        directory: tempDir,
        reason: 'in-flight',
      });

      const result = await service.triggerNow(tempDir);

      expect(result).toEqual({
        status: 'skipped',
        directory: tempDir,
        reason: 'in-flight',
      });
      expect(runOrgSpy).toHaveBeenCalledTimes(1);

      (service as any).inFlight = new Map();
      runOrgSpy.mockRestore();
      service.stop();
    });

    it('reports a skip from the real in-flight guard, with no pass behind it', async () => {
      const { AutoOrganizeService } =
        await import('../../../src/extensions/scheduler/auto-organize.service.js');

      const watches: WatchConfig[] = [
        {
          directory: tempDir,
          schedule: '0 9 * * *',
          rules: { auto_organize: true },
        },
      ];

      // No stub on runOrganization this time. The sweep is injected so that
      // "the guard refused it" is observable: a pass that was never handed to
      // the sweep means the outcome came from the guard and not from a pass.
      const sweep = jest.fn(
        async (): Promise<OrganizePassResult> => ({
          directory: tempDir,
          dryRun: false,
          scanned: 0,
          planned: 0,
          moved: 0,
          skipped: 0,
          statistics: {},
          errors: [],
          aborted: false,
          historyLogged: false,
        }),
      );
      const service = new AutoOrganizeService(
        () => ({ watchList: watches }),
        undefined,
        sweep,
      );

      // Seeded with the canonical directory, which is the key runOrganization
      // compares after validateStrictPath resolves it.
      (service as any).inFlight = new Map([[tempDir, 1]]);

      const result = await service.triggerNow(tempDir);

      expect(result).toEqual({
        status: 'skipped',
        directory: tempDir,
        reason: 'in-flight',
      });
      // The setup fired: the pass was refused before the sweep was reached.
      expect(sweep).not.toHaveBeenCalled();
      // The seeded counter survives a refusal. A skip that returned after
      // claiming the directory, or from a finally that ran anyway, would clear
      // it and un-guard the pass that is genuinely still in flight.
      expect(service.getStatus().runningDirectories).toEqual([tempDir]);

      service.stop();
    });
  });
});
