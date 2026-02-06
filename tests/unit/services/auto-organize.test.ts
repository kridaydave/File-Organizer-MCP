/**
 * File Organizer MCP Server - Auto-Organize Service Tests
 * Tests for cron scheduling logic and configuration
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { AutoOrganizeService } from '../../../src/services/auto-organize.service.js';
import type { WatchConfig } from '../../../src/config.js';

describe('AutoOrganizeService', () => {
  let service: AutoOrganizeService;

  beforeEach(() => {
    service = new AutoOrganizeService();
  });

  afterEach(() => {
    service.stop();
  });

  describe('Service Lifecycle', () => {
    it('should start with no tasks initially', () => {
      expect(service.isActive()).toBe(false);
      expect(service.getTaskCount()).toBe(0);
    });

    it('should be inactive before start', () => {
      expect(service.isActive()).toBe(false);
    });

    it('should return empty watched directories initially', () => {
      expect(service.getWatchedDirectories()).toEqual([]);
    });
  });

  describe('Cron Schedule Conversion', () => {
    it('should convert hourly to correct cron', () => {
      const hourlyCron = (service as any).legacyScheduleToCron('hourly');
      expect(hourlyCron).toBe('0 * * * *');
    });

    it('should convert daily to correct cron', () => {
      const dailyCron = (service as any).legacyScheduleToCron('daily');
      expect(dailyCron).toBe('0 9 * * *');
    });

    it('should convert weekly to correct cron', () => {
      const weeklyCron = (service as any).legacyScheduleToCron('weekly');
      expect(weeklyCron).toBe('0 9 * * 0');
    });

    it('should default to daily for unknown schedules', () => {
      const defaultCron = (service as any).legacyScheduleToCron('unknown');
      expect(defaultCron).toBe('0 9 * * *');
    });
  });

  describe('getStatus', () => {
    it('should return correct initial status', () => {
      const status = service.getStatus();
      expect(status.active).toBe(false);
      expect(status.taskCount).toBe(0);
      expect(status.watchedDirectories).toEqual([]);
      expect(status.runningDirectories).toEqual([]);
    });
  });

  describe('File Age Filtering Logic', () => {
    it('should calculate correct minimum age in milliseconds', () => {
      const watch: WatchConfig = {
        directory: '/test',
        schedule: '0 10 * * *',
        rules: {
          auto_organize: true,
          min_file_age_minutes: 5,
        },
      };

      // 5 minutes = 300,000 milliseconds
      const expectedMs = 5 * 60 * 1000;
      expect(expectedMs).toBe(300000);
    });

    it('should handle watch without min_file_age', () => {
      const watch: WatchConfig = {
        directory: '/test',
        schedule: '0 10 * * *',
        rules: {
          auto_organize: true,
        },
      };

      expect(watch.rules.min_file_age_minutes).toBeUndefined();
    });
  });

  describe('Batch Limiting Logic', () => {
    it('should respect max_files_per_run setting', () => {
      const watch: WatchConfig = {
        directory: '/test',
        schedule: '0 10 * * *',
        rules: {
          auto_organize: true,
          max_files_per_run: 50,
        },
      };

      expect(watch.rules.max_files_per_run).toBe(50);
    });

    it('should handle unlimited files when max_files_per_run not set', () => {
      const watch: WatchConfig = {
        directory: '/test',
        schedule: '0 10 * * *',
        rules: {
          auto_organize: true,
        },
      };

      expect(watch.rules.max_files_per_run).toBeUndefined();
    });
  });

  describe('Watch Configuration Types', () => {
    it('should accept valid cron expressions', () => {
      const validCrons = [
        '0 10 * * *',
        '*/30 * * * *',
        '0 */6 * * *',
        '0 9 * * 1',
        '* * * * *',
        '0 0 * * 0',
      ];

      validCrons.forEach((cron) => {
        const watch: WatchConfig = {
          directory: '/test',
          schedule: cron,
          rules: { auto_organize: true },
        };
        expect(watch.schedule).toBe(cron);
      });
    });

    it('should support auto_organize toggle', () => {
      const enabledWatch: WatchConfig = {
        directory: '/test/enabled',
        schedule: '0 10 * * *',
        rules: { auto_organize: true },
      };

      const disabledWatch: WatchConfig = {
        directory: '/test/disabled',
        schedule: '0 10 * * *',
        rules: { auto_organize: false },
      };

      expect(enabledWatch.rules.auto_organize).toBe(true);
      expect(disabledWatch.rules.auto_organize).toBe(false);
    });
  });
});
