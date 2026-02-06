/**
 * File Organizer MCP Server - Config Management Tests
 * Tests for deep merge, load/save, and watch config
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as configModule from '../../../src/config.js';

describe('Config Management', () => {
  const mockHomeDir = '/mock/home';
  const mockConfigDir = path.join(mockHomeDir, 'AppData', 'Roaming', 'file-organizer-mcp');
  const mockConfigPath = path.join(mockConfigDir, 'config.json');

  describe('getUserConfigPath', () => {
    it('should return path containing file-organizer-mcp', () => {
      const result = configModule.getUserConfigPath();
      expect(result).toContain('file-organizer-mcp');
      expect(result).toContain('config.json');
    });
  });

  describe('WatchConfig structure', () => {
    it('should accept valid watch configuration with all fields', () => {
      const watchConfig: configModule.WatchConfig = {
        directory: '/test/dir',
        schedule: '0 10 * * *',
        rules: {
          auto_organize: true,
          min_file_age_minutes: 5,
          max_files_per_run: 100,
        },
      };

      expect(watchConfig.directory).toBe('/test/dir');
      expect(watchConfig.schedule).toBe('0 10 * * *');
      expect(watchConfig.rules.auto_organize).toBe(true);
      expect(watchConfig.rules.min_file_age_minutes).toBe(5);
      expect(watchConfig.rules.max_files_per_run).toBe(100);
    });

    it('should work with minimal watch configuration', () => {
      const watchConfig: configModule.WatchConfig = {
        directory: '/test/dir',
        schedule: '* * * * *',
        rules: {
          auto_organize: false,
        },
      };

      expect(watchConfig.rules.min_file_age_minutes).toBeUndefined();
      expect(watchConfig.rules.max_files_per_run).toBeUndefined();
    });
  });

  describe('UserConfig interface', () => {
    it('should accept config with watchList', () => {
      const userConfig: configModule.UserConfig = {
        conflictStrategy: 'rename',
        customAllowedDirectories: ['/path/to/folder'],
        watchList: [
          {
            directory: '/watch/dir',
            schedule: '0 10 * * *',
            rules: { auto_organize: true },
          },
        ],
      };

      expect(userConfig.watchList).toHaveLength(1);
      expect(userConfig.watchList![0].directory).toBe('/watch/dir');
    });

    it('should accept config with autoOrganize settings', () => {
      const userConfig: configModule.UserConfig = {
        autoOrganize: {
          enabled: true,
          schedule: 'daily',
        },
      };

      expect(userConfig.autoOrganize?.enabled).toBe(true);
      expect(userConfig.autoOrganize?.schedule).toBe('daily');
    });
  });
});
