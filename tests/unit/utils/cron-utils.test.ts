/**
 * File Organizer MCP Server - Cron Utils Tests
 * Tests for cron expression parsing and time calculation utilities
 *
 * The calculation functions run in LOCAL time (the same clock node-cron fires
 * on, issue #99), so every assertion here is built from local Date components
 * and read back with local getters: that stays correct on any machine, and it
 * fails on any non-UTC machine if the code ever drifts back to setUTC*. The
 * two pinned-offset describes go further and force a specific zone, so a
 * UTC-only CI machine still exercises the bug. They cannot do that with a
 * runtime process.env.TZ: jest's vm sandbox never forwards it to V8's date
 * cache, so an in-process pin silently does nothing (it only looks right on a
 * machine already sitting in that zone). The zone is inherited at child
 * process spawn instead, which is the same workaround the EXIF calendar suites
 * in tests/unit/services/ use.
 */

import { describe, it, expect } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import {
  getNextRunTime,
  getPreviousRunTime,
  shouldCatchup,
  getTimeUntilNextRun,
  isValidCronExpression,
} from '../../../src/utils/cron-utils.js';

type PinnedResult = {
  offsetMinutes: number;
  next: string;
  previous: string;
  timeUntil: number;
};

/**
 * Run one cron calculation in a child process pinned to `tz`.
 *
 * The child transpiles src/utils/cron-utils.ts at call time rather than
 * importing dist/: the pinned contract exists to catch a regression in the
 * source, and a stale build could answer for code that no longer exists. The
 * returned offset is the pin's own guard — if the platform cannot load the
 * zone, it comes back as 0 and the caller's first assertion fails instead of
 * every later one answering for UTC.
 */
function runCronUnderTz(
  cron: string,
  iso: string,
  tz: string,
): PinnedResult {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cron-utils-tz-'));
  try {
    const source = fs.readFileSync(
      path.resolve('src/utils/cron-utils.ts'),
      'utf8',
    );
    const js = ts.transpileModule(source, {
      fileName: 'cron-utils.ts',
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const modulePath = path.join(dir, 'cron-utils.mjs');
    fs.writeFileSync(modulePath, js);

    const script = [
      `import { getNextRunTime, getPreviousRunTime, getTimeUntilNextRun } from ${JSON.stringify(pathToFileURL(modulePath).href)};`,
      `const base = new Date(${JSON.stringify(iso)});`,
      `const next = getNextRunTime(${JSON.stringify(cron)}, base);`,
      `const previous = getPreviousRunTime(${JSON.stringify(cron)}, base);`,
      `const timeUntil = getTimeUntilNextRun(${JSON.stringify(cron)}, base);`,
      `console.log(JSON.stringify({`,
      `  offsetMinutes: base.getTimezoneOffset(),`,
      `  next: next.toISOString(),`,
      `  previous: previous.toISOString(),`,
      `  timeUntil,`,
      `}));`,
    ].join('\n');

    const out = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', script],
      { env: { ...process.env, TZ: tz }, encoding: 'utf8' },
    );
    return JSON.parse(out) as PinnedResult;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('cron-utils', () => {
  describe('getNextRunTime', () => {
    it('should calculate next run for hourly cron', () => {
      const baseTime = new Date(2026, 1, 8, 10, 30);
      const nextRun = getNextRunTime('0 * * * *', baseTime);

      // Should be at 11:00 local
      expect(nextRun.getHours()).toBe(11);
      expect(nextRun.getMinutes()).toBe(0);
      expect(nextRun.getDate()).toBe(baseTime.getDate());
    });

    it('should calculate next run for daily cron', () => {
      const baseTime = new Date(2026, 1, 8, 10, 30);
      const nextRun = getNextRunTime('0 9 * * *', baseTime);

      // Should be next day at 9:00 local since we passed 9:00
      expect(nextRun.getDate()).toBe(9);
      expect(nextRun.getHours()).toBe(9);
      expect(nextRun.getMinutes()).toBe(0);
    });

    it('should calculate next run for daily cron when still before scheduled time', () => {
      const baseTime = new Date(2026, 1, 8, 8, 0);
      const nextRun = getNextRunTime('0 9 * * *', baseTime);

      // Should be same day at 9:00 local
      expect(nextRun.getDate()).toBe(8);
      expect(nextRun.getHours()).toBe(9);
      expect(nextRun.getMinutes()).toBe(0);
    });

    it('should calculate next run for weekly cron', () => {
      // Feb 8, 2026 is a Sunday (day 0)
      const baseTime = new Date(2026, 1, 8, 10, 0);
      const nextRun = getNextRunTime('0 9 * * 0', baseTime);

      // Should be next Sunday at 9:00 local
      expect(nextRun.getDay()).toBe(0);
      expect(nextRun.getHours()).toBe(9);
      expect(nextRun.getMinutes()).toBe(0);
      // Since baseTime is already Sunday after 9am, next run is next week
      expect(nextRun.getTime()).toBeGreaterThan(baseTime.getTime());
    });

    it('should calculate next run for step values (every 30 minutes)', () => {
      const baseTime = new Date(2026, 1, 8, 10, 15);
      const nextRun = getNextRunTime('*/30 * * * *', baseTime);

      // Should be at 10:30 local
      expect(nextRun.getHours()).toBe(10);
      expect(nextRun.getMinutes()).toBe(30);
    });

    it('should handle step values crossing hour boundary', () => {
      const baseTime = new Date(2026, 1, 8, 10, 45);
      const nextRun = getNextRunTime('*/30 * * * *', baseTime);

      // Should be at 11:00 local
      expect(nextRun.getHours()).toBe(11);
      expect(nextRun.getMinutes()).toBe(0);
    });

    it('should calculate next run for hour steps (every 2 hours)', () => {
      // 15:10 local. This fires at 16:00: the interval fallback answered
      // 17:10, which has the right spacing and the wrong time.
      const baseTime = new Date(2026, 1, 8, 15, 10);

      const nextRun = getNextRunTime('0 */2 * * *', baseTime);

      expect(nextRun.getDate()).toBe(8);
      expect(nextRun.getHours()).toBe(16);
      expect(nextRun.getMinutes()).toBe(0);
    });

    it('should step forward a whole step when the base sits on a run', () => {
      const baseTime = new Date(2026, 1, 8, 16, 0);

      const nextRun = getNextRunTime('0 */2 * * *', baseTime);

      expect(nextRun.getHours()).toBe(18);
      expect(nextRun.getMinutes()).toBe(0);
    });

    it('should not throw on a step in a field it cannot evaluate', () => {
      // `0 9 * * */2` reached the weekly branch, where the step became a NaN
      // day-of-week and toISOString() threw on the Invalid Date.
      const baseTime = new Date(2026, 1, 8, 10, 0);

      const nextRun = getNextRunTime('0 9 * * */2', baseTime);

      expect(Number.isFinite(nextRun.getTime())).toBe(true);
      expect(nextRun.getTime()).toBeGreaterThan(baseTime.getTime());
    });

    it('should treat every minute as one minute apart', () => {
      // "* * * * *" used to fall through to the 1-day interval fallback.
      const baseTime = new Date(2026, 1, 8, 10, 30, 45);
      const nextRun = getNextRunTime('* * * * *', baseTime);

      // 10:30:45 -> the next whole minute, 10:31:00.
      expect(nextRun.getTime() - baseTime.getTime()).toBe(15_000);
      expect(nextRun.getHours()).toBe(10);
      expect(nextRun.getMinutes()).toBe(31);
    });

    it('should return valid date for invalid cron (fallback)', () => {
      const baseTime = new Date(2026, 1, 8, 10, 0);
      const nextRun = getNextRunTime('invalid', baseTime);

      // Should return a date 1 day later (fallback behavior)
      expect(nextRun).toBeInstanceOf(Date);
      expect(nextRun.getTime()).toBeGreaterThan(baseTime.getTime());
    });
  });

  describe('getPreviousRunTime', () => {
    it('should calculate previous run for hourly cron', () => {
      const baseTime = new Date(2026, 1, 8, 10, 30);
      const prevRun = getPreviousRunTime('0 * * * *', baseTime);

      // Should be at 10:00 local
      expect(prevRun.getHours()).toBe(10);
      expect(prevRun.getMinutes()).toBe(0);
    });

    it('should calculate previous run for daily cron', () => {
      const baseTime = new Date(2026, 1, 8, 10, 30);
      const prevRun = getPreviousRunTime('0 9 * * *', baseTime);

      // Should be today at 9:00 local since we passed 9:00
      expect(prevRun.getDate()).toBe(8);
      expect(prevRun.getHours()).toBe(9);
      expect(prevRun.getMinutes()).toBe(0);
    });

    it('should calculate previous run for daily cron before scheduled time', () => {
      const baseTime = new Date(2026, 1, 8, 8, 0);
      const prevRun = getPreviousRunTime('0 9 * * *', baseTime);

      // Should be yesterday at 9:00 local
      expect(prevRun.getDate()).toBe(7);
      expect(prevRun.getHours()).toBe(9);
      expect(prevRun.getMinutes()).toBe(0);
    });

    it('should calculate previous run for weekly cron', () => {
      // Feb 8, 2026 is a Sunday (day 0)
      const baseTime = new Date(2026, 1, 8, 10, 0);
      const prevRun = getPreviousRunTime('0 9 * * 0', baseTime);

      // Should be today at 9:00 local (Sunday)
      expect(prevRun.getDay()).toBe(0);
      expect(prevRun.getHours()).toBe(9);
      expect(prevRun.getMinutes()).toBe(0);
    });

    it('should calculate previous run for step values', () => {
      const baseTime = new Date(2026, 1, 8, 10, 45);
      const prevRun = getPreviousRunTime('*/30 * * * *', baseTime);

      // Should be at 10:30 local
      expect(prevRun.getHours()).toBe(10);
      expect(prevRun.getMinutes()).toBe(30);
    });

    it('should calculate previous run for hour steps (every 2 hours)', () => {
      const baseTime = new Date(2026, 1, 8, 15, 10);

      const prevRun = getPreviousRunTime('0 */2 * * *', baseTime);

      expect(prevRun.getHours()).toBe(14);
      expect(prevRun.getMinutes()).toBe(0);
    });

    it('should step back a whole step when the base sits on a run', () => {
      const baseTime = new Date(2026, 1, 8, 16, 0);

      const prevRun = getPreviousRunTime('0 */2 * * *', baseTime);

      expect(prevRun.getHours()).toBe(14);
      expect(prevRun.getMinutes()).toBe(0);
    });

    it('should not throw on a step in a field it cannot evaluate', () => {
      const baseTime = new Date(2026, 1, 8, 10, 0);

      const prevRun = getPreviousRunTime('0 9 * * */2', baseTime);

      expect(Number.isFinite(prevRun.getTime())).toBe(true);
      expect(prevRun.getTime()).toBeLessThan(baseTime.getTime());
    });

    it('should treat every minute as one minute apart', () => {
      const baseTime = new Date(2026, 1, 8, 10, 30, 45);
      const prevRun = getPreviousRunTime('* * * * *', baseTime);

      expect(prevRun.getTime()).toBe(
        new Date(2026, 1, 8, 10, 30, 0).getTime(),
      );
      expect(prevRun.getTime()).toBeLessThan(baseTime.getTime());
    });

    it('should return valid date for invalid cron (fallback)', () => {
      const baseTime = new Date(2026, 1, 8, 10, 0);
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
      // Fixed local times: current 10:00, last run at 9:30 (after today's
      // 9 AM schedule) on the same local day.
      const currentTime = new Date(2026, 1, 8, 10, 0);
      const lastRunTime = new Date(2026, 1, 8, 9, 30);

      const result = shouldCatchup('0 9 * * *', lastRunTime, currentTime);
      expect(result).toBe(false);
    });

    it('should return true when never ran before', () => {
      const currentTime = new Date();
      const result = shouldCatchup('0 9 * * *', null, currentTime);
      expect(result).toBe(true);
    });

    it('should return false for hourly schedule when ran recently', () => {
      // Fixed local times: 10:30 current, last run at 10:00 (within the
      // same hour).
      const currentTime = new Date(2026, 1, 8, 10, 30);
      const lastRunTime = new Date(2026, 1, 8, 10, 0);

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
      // Last run exactly at the expected time.
      const currentTime = new Date(2026, 1, 8, 10, 0);
      const lastRunTime = new Date(2026, 1, 8, 9, 0);

      // With the 1 second buffer, running exactly at 9:00 is not a miss.
      const result = shouldCatchup('0 9 * * *', lastRunTime, currentTime);
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
      const baseTime = new Date(2026, 1, 8, 10, 0);
      const timeUntil = getTimeUntilNextRun('0 11 * * *', baseTime);

      // Should be 1 hour
      expect(timeUntil).toBe(60 * 60 * 1000);
    });

    it('should return time until next run even if scheduled time passed today', () => {
      // Scheduled 9am has passed (local noon).
      const baseTime = new Date(2026, 1, 8, 12, 0);
      const timeUntil = getTimeUntilNextRun('0 9 * * *', baseTime);

      // Next run is tomorrow at 9am, so should be 21 hours
      expect(timeUntil).toBe(21 * 60 * 60 * 1000);
    });

    it('should calculate correctly for hourly schedule', () => {
      const baseTime = new Date(2026, 1, 8, 10, 30);
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

/**
 * The bug that issue #99 exists for: computing run times in UTC while
 * node-cron fires in local time. These cases run in child processes pinned to
 * a known offset and assert fixed instants, so they fail even on a UTC machine
 * if the UTC implementation comes back — a plain-UTC test suite is exactly why
 * the bug shipped.
 */
describe('cron-utils local timezone contract', () => {
  describe('Asia/Kolkata (UTC+5:30)', () => {
    const zone = 'Asia/Kolkata';
    // 10:30 local on Feb 8, 2026 = 05:00Z at this offset.
    const baseIso = '2026-02-08T05:00:00.000Z';

    it('applies the pinned offset before anything else is asserted', () => {
      // Guards the fixture: if the child came back unpinned (zone unloadable,
      // TZ dropped from the env), the assertions below would be answering for
      // whatever zone the runner happens to sit in.
      const { offsetMinutes } = runCronUnderTz('0 9 * * *', baseIso, zone);
      expect(offsetMinutes).toBe(-330);
    });

    it('computes 0 9 * * * as 9am local, not 9am UTC', () => {
      // Past 9am local, so the next run is 9am local on Feb 9.
      const { next } = runCronUnderTz('0 9 * * *', baseIso, zone);

      // 9am IST on Feb 9 = 03:30Z. The old UTC code returned 09:00Z, which
      // is 14:30 for this user: wrong by exactly the offset (issue #99).
      expect(next).toBe('2026-02-09T03:30:00.000Z');
    });

    it('computes the previous run at 9am local too', () => {
      const { previous } = runCronUnderTz('0 9 * * *', baseIso, zone);

      // 9am IST on Feb 8 = 03:30Z.
      expect(previous).toBe('2026-02-08T03:30:00.000Z');
    });

    it('measures time until the next local run', () => {
      // 10:30 today to 9:00 tomorrow is 22h30m.
      const { timeUntil } = runCronUnderTz('0 9 * * *', baseIso, zone);
      expect(timeUntil).toBe(22.5 * 60 * 60 * 1000);
    });
  });

  describe('Europe/Berlin (UTC+1 in February)', () => {
    const zone = 'Europe/Berlin';
    // 8:00 local on Feb 8, 2026 = 07:00Z at this offset.
    const baseIso = '2026-02-08T07:00:00.000Z';

    it('applies the pinned offset before anything else is asserted', () => {
      const { offsetMinutes } = runCronUnderTz('0 9 * * *', baseIso, zone);
      expect(offsetMinutes).toBe(-60);
    });

    it('computes a run due later today at the local wall clock', () => {
      const { next } = runCronUnderTz('0 9 * * *', baseIso, zone);

      // A negative offset catches the sign of the bug, which a UTC+ zone
      // alone would not.
      expect(next).toBe('2026-02-08T08:00:00.000Z');
    });
  });
});
