/**
 * File Organizer MCP Server - Cron Utils Tests
 * Tests for cron expression parsing and time calculation utilities
 */

import { jest, describe, it, expect } from '@jest/globals';
import {
  getNextRunTime,
  getPreviousRunTime,
  shouldCatchup,
  getTimeUntilNextRun,
  isValidCronExpression,
} from '../../../src/utils/cron-utils.js';

describe('cron-utils', () => {
  describe('getNextRunTime', () => {
    it('should calculate next run for hourly cron', () => {
      const baseTime = new Date('2026-02-08T10:30:00.000Z');
      const nextRun = getNextRunTime('0 * * * *', baseTime);

      // Should be at 11:00
      expect(nextRun.getUTCHours()).toBe(11);
      expect(nextRun.getUTCMinutes()).toBe(0);
      expect(nextRun.getUTCDate()).toBe(baseTime.getUTCDate());
    });

    it('should calculate next run for daily cron', () => {
      const baseTime = new Date('2026-02-08T10:30:00.000Z');
      const nextRun = getNextRunTime('0 9 * * *', baseTime);

      // Should be next day at 9:00 since we passed 9:00
      expect(nextRun.getUTCDate()).toBe(9);
      expect(nextRun.getUTCHours()).toBe(9);
      expect(nextRun.getUTCMinutes()).toBe(0);
    });

    it('should calculate next run for daily cron when still before scheduled time', () => {
      const baseTime = new Date('2026-02-08T08:00:00.000Z');
      const nextRun = getNextRunTime('0 9 * * *', baseTime);

      // Should be same day at 9:00
      expect(nextRun.getUTCDate()).toBe(8);
      expect(nextRun.getUTCHours()).toBe(9);
      expect(nextRun.getUTCMinutes()).toBe(0);
    });

    it('should calculate next run for weekly cron', () => {
      // Feb 8, 2026 is a Sunday (day 0)
      const baseTime = new Date('2026-02-08T10:00:00.000Z');
      const nextRun = getNextRunTime('0 9 * * 0', baseTime);

      // Should be next Sunday at 9:00
      expect(nextRun.getUTCDay()).toBe(0);
      expect(nextRun.getUTCHours()).toBe(9);
      expect(nextRun.getUTCMinutes()).toBe(0);
      // Since baseTime is already Sunday after 9am, next run is next week
      expect(nextRun.getTime()).toBeGreaterThan(baseTime.getTime());
    });

    it('should calculate next run for step values (every 30 minutes)', () => {
      const baseTime = new Date('2026-02-08T10:15:00.000Z');
      const nextRun = getNextRunTime('*/30 * * * *', baseTime);

      // Should be at 10:30
      expect(nextRun.getUTCHours()).toBe(10);
      expect(nextRun.getUTCMinutes()).toBe(30);
    });

    it('should handle step values crossing hour boundary', () => {
      const baseTime = new Date('2026-02-08T10:45:00.000Z');
      const nextRun = getNextRunTime('*/30 * * * *', baseTime);

      // Should be at 11:00
      expect(nextRun.getUTCHours()).toBe(11);
      expect(nextRun.getUTCMinutes()).toBe(0);
    });

    it('should return valid date for invalid cron (fallback)', () => {
      const baseTime = new Date('2026-02-08T10:00:00.000Z');
      const nextRun = getNextRunTime('invalid', baseTime);

      // Should return a date 1 day later (fallback behavior)
      expect(nextRun).toBeInstanceOf(Date);
      expect(nextRun.getTime()).toBeGreaterThan(baseTime.getTime());
    });
  });

  describe('getPreviousRunTime', () => {
    it('should calculate previous run for hourly cron', () => {
      const baseTime = new Date('2026-02-08T10:30:00.000Z');
      const prevRun = getPreviousRunTime('0 * * * *', baseTime);

      // Should be at 10:00
      expect(prevRun.getUTCHours()).toBe(10);
      expect(prevRun.getUTCMinutes()).toBe(0);
    });

    it('should calculate previous run for daily cron', () => {
      const baseTime = new Date('2026-02-08T10:30:00.000Z');
      const prevRun = getPreviousRunTime('0 9 * * *', baseTime);

      // Should be today at 9:00 since we passed 9:00
      expect(prevRun.getUTCDate()).toBe(8);
      expect(prevRun.getUTCHours()).toBe(9);
      expect(prevRun.getUTCMinutes()).toBe(0);
    });

    it('should calculate previous run for daily cron before scheduled time', () => {
      const baseTime = new Date('2026-02-08T08:00:00.000Z');
      const prevRun = getPreviousRunTime('0 9 * * *', baseTime);

      // Should be yesterday at 9:00
      expect(prevRun.getUTCDate()).toBe(7);
      expect(prevRun.getUTCHours()).toBe(9);
      expect(prevRun.getUTCMinutes()).toBe(0);
    });

    it('should calculate previous run for weekly cron', () => {
      // Feb 8, 2026 is a Sunday (day 0)
      const baseTime = new Date('2026-02-08T10:00:00.000Z');
      const prevRun = getPreviousRunTime('0 9 * * 0', baseTime);

      // Should be today at 9:00 (Sunday)
      expect(prevRun.getUTCDay()).toBe(0);
      expect(prevRun.getUTCHours()).toBe(9);
      expect(prevRun.getUTCMinutes()).toBe(0);
    });

    it('should calculate previous run for step values', () => {
      const baseTime = new Date('2026-02-08T10:45:00.000Z');
      const prevRun = getPreviousRunTime('*/30 * * * *', baseTime);

      // Should be at 10:30
      expect(prevRun.getUTCHours()).toBe(10);
      expect(prevRun.getUTCMinutes()).toBe(30);
    });

    it('should return valid date for invalid cron (fallback)', () => {
      const baseTime = new Date('2026-02-08T10:00:00.000Z');
      const prevRun = getPreviousRunTime('invalid', baseTime);

      // Should return a valid date
      expect(prevRun).toBeInstanceOf(Date);
      expect(prevRun.getTime()).toBeLessThan(baseTime.getTime());
    });
  });

  describe('shouldCatchup', () => {
    it('should return true when schedule was missed (daily)', () => {
      // Last run was 25 hours ago, daily schedule
      const lastRunTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
      const currentTime = new Date();

      const result = shouldCatchup('0 9 * * *', lastRunTime, currentTime);
      expect(result).toBe(true);
    });

    it('should return false when recently ran (daily)', () => {
      // Use fixed times for consistent testing
      // Current time: 10:00 AM, last run at 9:30 AM (after today's 9 AM schedule)
      const currentTime = new Date('2026-02-08T10:00:00.000Z');
      const lastRunTime = new Date('2026-02-08T09:30:00.000Z');

      const result = shouldCatchup('0 9 * * *', lastRunTime, currentTime);
      expect(result).toBe(false);
    });

    it('should return true when never ran before', () => {
      const currentTime = new Date();
      const result = shouldCatchup('0 9 * * *', null, currentTime);
      expect(result).toBe(true);
    });

    it('should return false for hourly schedule when ran recently', () => {
      // Use fixed times for consistent testing
      // 10:30 current time, last run at 10:00 (within the same hour)
      const currentTime = new Date('2026-02-08T10:30:00.000Z');
      const lastRunTime = new Date('2026-02-08T10:00:00.000Z');

      const result = shouldCatchup('0 * * * *', lastRunTime, currentTime);
      expect(result).toBe(false);
    });

    it('should return true for hourly schedule when missed', () => {
      // Last run was 2 hours ago, hourly schedule
      const lastRunTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const currentTime = new Date();

      const result = shouldCatchup('0 * * * *', lastRunTime, currentTime);
      expect(result).toBe(true);
    });

    it('should handle edge case at exact boundary', () => {
      // Set up a scenario where last run was exactly at the expected time
      const currentTime = new Date('2026-02-08T10:00:00.000Z');
      const lastRunTime = new Date('2026-02-08T09:00:00.000Z');

      // Should not need catchup since we ran at the expected time (with buffer)
      const result = shouldCatchup('0 9 * * *', lastRunTime, currentTime);
      // Result depends on exact timing; with 1 second buffer, should be false
      expect(result).toBe(false);
    });

    it('should handle weekly schedule correctly', () => {
      // Last run was 8 days ago
      const lastRunTime = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      const currentTime = new Date();

      const result = shouldCatchup('0 9 * * 0', lastRunTime, currentTime);
      expect(result).toBe(true);
    });
  });

  describe('getTimeUntilNextRun', () => {
    it('should return positive time until next run', () => {
      const baseTime = new Date('2026-02-08T10:00:00.000Z');
      const timeUntil = getTimeUntilNextRun('0 11 * * *', baseTime);

      // Should be 1 hour
      expect(timeUntil).toBe(60 * 60 * 1000);
    });

    it('should return time until next run even if scheduled time passed today', () => {
      // Use a time where the scheduled time (9am) has passed (12pm)
      const baseTime = new Date('2026-02-08T12:00:00.000Z');
      const timeUntil = getTimeUntilNextRun('0 9 * * *', baseTime);

      // Next run is tomorrow at 9am, so should be 21 hours
      expect(timeUntil).toBe(21 * 60 * 60 * 1000);
    });

    it('should calculate correctly for hourly schedule', () => {
      const baseTime = new Date('2026-02-08T10:30:00.000Z');
      const timeUntil = getTimeUntilNextRun('0 * * * *', baseTime);

      // Should be 30 minutes until 11:00
      expect(timeUntil).toBe(30 * 60 * 1000);
    });
  });

  describe('isValidCronExpression', () => {
    it('should return true for valid 5-part cron', () => {
      expect(isValidCronExpression('0 9 * * *')).toBe(true);
      expect(isValidCronExpression('*/30 * * * *')).toBe(true);
      expect(isValidCronExpression('0 0 * * 0')).toBe(true);
    });

    it('should return true for valid 6-part cron (with seconds)', () => {
      expect(isValidCronExpression('0 0 9 * * *')).toBe(true);
      expect(isValidCronExpression('0 */30 * * * *')).toBe(true);
    });

    it('should return false for invalid cron', () => {
      expect(isValidCronExpression('invalid')).toBe(false);
      expect(isValidCronExpression('')).toBe(false);
      expect(isValidCronExpression('* * *')).toBe(false); // Too few parts
    });

    it('should return false for out-of-range values', () => {
      expect(isValidCronExpression('60 * * * *')).toBe(false); // minute > 59
      expect(isValidCronExpression('* 24 * * *')).toBe(false); // hour > 23
      expect(isValidCronExpression('* * 32 * *')).toBe(false); // day > 31
      expect(isValidCronExpression('* * * 13 *')).toBe(false); // month > 12
      expect(isValidCronExpression('* * * * 7')).toBe(false); // dayOfWeek > 6
    });

    it('should return true for valid step values', () => {
      expect(isValidCronExpression('*/5 * * * *')).toBe(true);
      expect(isValidCronExpression('*/30 * * * *')).toBe(true);
    });

    it('should return false for invalid step values', () => {
      expect(isValidCronExpression('*/0 * * * *')).toBe(false);
      expect(isValidCronExpression('*/70 * * * *')).toBe(false);
    });
  });
});
