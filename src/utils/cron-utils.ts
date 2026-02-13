/**
 * File Organizer MCP Server v3.2.0
 * Cron Utility Functions
 *
 * Utilities for parsing cron expressions and calculating run times.
 * Supports common cron patterns (hourly, daily, weekly) with fallback
 * heuristics for complex patterns.
 */

/**
 * Parse a cron expression and extract its components
 * Format: second(optional) minute hour day-of-month month day-of-week
 * or: minute hour day-of-month month day-of-week
 */
interface CronComponents {
  minute: number | "*/n" | "*";
  hour: number | "*/n" | "*";
  dayOfMonth: number | "*/n" | "*";
  month: number | "*/n" | "*";
  dayOfWeek: number | "*/n" | "*";
}

/**
 * Parse a cron expression into its components
 * Supports both 5-part (standard) and 6-part (with seconds) cron expressions
 */
function parseCronExpression(expression: string): CronComponents | null {
  const parts = expression.trim().split(/\s+/);

  // Handle both 5-part (standard) and 6-part (with seconds) cron
  let minute: string,
    hour: string,
    dayOfMonth: string,
    month: string,
    dayOfWeek: string;

  if (parts.length === 5) {
    [minute, hour, dayOfMonth, month, dayOfWeek] = parts as [
      string,
      string,
      string,
      string,
      string,
    ];
  } else if (parts.length === 6) {
    // Skip seconds part
    [, minute, hour, dayOfMonth, month, dayOfWeek] = parts as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];
  } else {
    return null;
  }

  const parseField = (field: string): number | "*/n" | "*" => {
    if (field === "*") return "*";
    if (field.startsWith("*/")) return field as "*/n";
    const num = parseInt(field, 10);
    return isNaN(num) ? "*" : num;
  };

  return {
    minute: parseField(minute),
    hour: parseField(hour),
    dayOfMonth: parseField(dayOfMonth),
    month: parseField(month),
    dayOfWeek: parseField(dayOfWeek),
  };
}

/**
 * Get the minimum interval in milliseconds from a cron expression
 * Used as a heuristic for complex patterns
 */
function getMinimumIntervalMs(expression: string): number {
  const components = parseCronExpression(expression);
  if (!components) {
    // Default to 1 day if parsing fails
    return 24 * 60 * 60 * 1000;
  }

  // Check for step values like */n
  const getStep = (field: number | "*/n" | "*"): number | null => {
    if (typeof field === "string" && field.startsWith("*/")) {
      return parseInt(field.slice(2), 10);
    }
    return null;
  };

  const minuteStep = getStep(components.minute);
  const hourStep = getStep(components.hour);

  // If */n in minutes, it's every n minutes
  if (minuteStep !== null) {
    return minuteStep * 60 * 1000;
  }

  // If */n in hours, it's every n hours
  if (hourStep !== null) {
    return hourStep * 60 * 60 * 1000;
  }

  // Check for specific values to determine frequency
  const isHourly = components.minute !== "*" && components.hour === "*";
  const isDaily =
    components.minute !== "*" &&
    components.hour !== "*" &&
    components.dayOfMonth === "*";
  const isWeekly =
    components.minute !== "*" &&
    components.hour !== "*" &&
    components.dayOfWeek !== "*";

  if (isWeekly) return 7 * 24 * 60 * 60 * 1000; // 7 days
  if (isDaily) return 24 * 60 * 60 * 1000; // 1 day
  if (isHourly) return 60 * 60 * 1000; // 1 hour

  // Default to 1 day
  return 24 * 60 * 60 * 1000;
}

/**
 * Calculate the next run time from a given date based on a cron expression
 * @param cronExpression - The cron expression
 * @param fromDate - The date to calculate from (defaults to now)
 * @returns The next scheduled run time
 */
export function getNextRunTime(
  cronExpression: string,
  fromDate: Date = new Date(),
): Date {
  const components = parseCronExpression(cronExpression);
  if (!components) {
    // Fallback: return 1 day from now
    return new Date(fromDate.getTime() + 24 * 60 * 60 * 1000);
  }

  const next = new Date(fromDate.getTime());
  next.setUTCSeconds(0);
  next.setUTCMilliseconds(0);

  // Handle step values (e.g., */30 for every 30 minutes)
  if (
    typeof components.minute === "string" &&
    components.minute.startsWith("*/")
  ) {
    const step = parseInt(components.minute.slice(2), 10);
    const currentMinute = next.getUTCMinutes();
    const nextMinute = Math.ceil((currentMinute + 1) / step) * step;

    if (nextMinute >= 60) {
      next.setUTCHours(next.getUTCHours() + 1);
      next.setUTCMinutes(0);
    } else {
      next.setUTCMinutes(nextMinute);
    }
    return next;
  }

  // Handle hourly pattern: "0 * * * *"
  if (
    components.minute !== "*" &&
    components.hour === "*" &&
    components.dayOfMonth === "*" &&
    components.month === "*" &&
    components.dayOfWeek === "*"
  ) {
    next.setUTCMinutes(components.minute as number);
    if (next.getTime() <= fromDate.getTime()) {
      next.setUTCHours(next.getUTCHours() + 1);
    }
    return next;
  }

  // Handle daily pattern: "0 9 * * *" (daily at 9am)
  if (
    components.minute !== "*" &&
    components.hour !== "*" &&
    components.dayOfMonth === "*" &&
    components.month === "*" &&
    components.dayOfWeek === "*"
  ) {
    next.setUTCMinutes(components.minute as number);
    next.setUTCHours(components.hour as number);
    if (next.getTime() <= fromDate.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next;
  }

  // Handle weekly pattern: "0 9 * * 0" (weekly on Sunday at 9am)
  if (
    components.minute !== "*" &&
    components.hour !== "*" &&
    components.dayOfWeek !== "*" &&
    components.dayOfMonth === "*"
  ) {
    next.setUTCMinutes(components.minute as number);
    next.setUTCHours(components.hour as number);
    const targetDay = components.dayOfWeek as number;
    const currentDay = next.getUTCDay();
    const daysUntilTarget = (targetDay - currentDay + 7) % 7;
    next.setUTCDate(next.getUTCDate() + daysUntilTarget);
    if (next.getTime() <= fromDate.getTime()) {
      next.setUTCDate(next.getUTCDate() + 7);
    }
    return next;
  }

  // Fallback: use minimum interval
  const interval = getMinimumIntervalMs(cronExpression);
  return new Date(fromDate.getTime() + interval);
}

/**
 * Calculate the previous run time before a given date based on a cron expression
 * @param cronExpression - The cron expression
 * @param fromDate - The date to calculate from (defaults to now)
 * @returns The most recent scheduled run time before fromDate
 */
export function getPreviousRunTime(
  cronExpression: string,
  fromDate: Date = new Date(),
): Date {
  const components = parseCronExpression(cronExpression);
  if (!components) {
    // Fallback: return 1 day ago
    return new Date(fromDate.getTime() - 24 * 60 * 60 * 1000);
  }

  const prev = new Date(fromDate.getTime());
  prev.setUTCSeconds(0);
  prev.setUTCMilliseconds(0);

  // Handle step values (e.g., */30 for every 30 minutes)
  if (
    typeof components.minute === "string" &&
    components.minute.startsWith("*/")
  ) {
    const step = parseInt(components.minute.slice(2), 10);
    const currentMinute = prev.getUTCMinutes();
    const prevMinute = Math.floor(currentMinute / step) * step;

    if (prevMinute < 0) {
      prev.setUTCHours(prev.getUTCHours() - 1);
      prev.setUTCMinutes(60 - step);
    } else {
      prev.setUTCMinutes(prevMinute);
    }
    if (prev.getTime() >= fromDate.getTime()) {
      prev.setUTCMinutes(prev.getUTCMinutes() - step);
      if (prev.getUTCMinutes() < 0) {
        prev.setUTCHours(prev.getUTCHours() - 1);
        prev.setUTCMinutes(60 + prev.getUTCMinutes());
      }
    }
    return prev;
  }

  // Handle hourly pattern: "0 * * * *"
  if (
    components.minute !== "*" &&
    components.hour === "*" &&
    components.dayOfMonth === "*" &&
    components.month === "*" &&
    components.dayOfWeek === "*"
  ) {
    prev.setUTCMinutes(components.minute as number);
    if (prev.getTime() >= fromDate.getTime()) {
      prev.setUTCHours(prev.getUTCHours() - 1);
    }
    return prev;
  }

  // Handle daily pattern: "0 9 * * *" (daily at 9am)
  if (
    components.minute !== "*" &&
    components.hour !== "*" &&
    components.dayOfMonth === "*" &&
    components.month === "*" &&
    components.dayOfWeek === "*"
  ) {
    prev.setUTCMinutes(components.minute as number);
    prev.setUTCHours(components.hour as number);
    if (prev.getTime() >= fromDate.getTime()) {
      prev.setUTCDate(prev.getUTCDate() - 1);
    }
    return prev;
  }

  // Handle weekly pattern: "0 9 * * 0" (weekly on Sunday at 9am)
  if (
    components.minute !== "*" &&
    components.hour !== "*" &&
    components.dayOfWeek !== "*" &&
    components.dayOfMonth === "*"
  ) {
    prev.setUTCMinutes(components.minute as number);
    prev.setUTCHours(components.hour as number);
    const targetDay = components.dayOfWeek as number;
    const currentDay = prev.getUTCDay();
    const daysDiff = currentDay - targetDay;
    const daysToSubtract = daysDiff >= 0 ? daysDiff : daysDiff + 7;
    prev.setUTCDate(prev.getUTCDate() - daysToSubtract);
    if (prev.getTime() >= fromDate.getTime()) {
      prev.setUTCDate(prev.getUTCDate() - 7);
    }
    return prev;
  }

  // Fallback: use minimum interval
  const interval = getMinimumIntervalMs(cronExpression);
  return new Date(fromDate.getTime() - interval);
}

/**
 * Determine if a catchup run is needed based on the cron schedule and last run time
 * @param cronExpression - The cron expression
 * @param lastRunTime - The last successful run time (null if never ran)
 * @param currentTime - The current time (defaults to now)
 * @returns true if catchup is needed, false otherwise
 */
export function shouldCatchup(
  cronExpression: string,
  lastRunTime: Date | null,
  currentTime: Date = new Date(),
): boolean {
  // If never ran before, we should run (first time initialization)
  if (!lastRunTime) {
    return true;
  }

  // Get the expected previous run time
  const expectedPreviousRun = getPreviousRunTime(cronExpression, currentTime);

  // If the last run was before the expected previous run, we missed a schedule
  // We add a small buffer (1 second) to handle timing edge cases
  const buffer = 1000; // 1 second buffer
  return lastRunTime.getTime() < expectedPreviousRun.getTime() - buffer;
}

/**
 * Calculate time until next run in milliseconds
 * @param cronExpression - The cron expression
 * @param fromDate - The date to calculate from (defaults to now)
 * @returns Milliseconds until next run (0 if should have run already)
 */
export function getTimeUntilNextRun(
  cronExpression: string,
  fromDate: Date = new Date(),
): number {
  const nextRun = getNextRunTime(cronExpression, fromDate);
  return Math.max(0, nextRun.getTime() - fromDate.getTime());
}

/**
 * Check if a cron expression is valid
 * @param expression - The cron expression to validate
 * @returns true if valid, false otherwise
 */
export function isValidCronExpression(expression: string): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5 && parts.length !== 6) {
    return false;
  }

  // Basic validation of each field
  const validateField = (field: string, min: number, max: number): boolean => {
    if (field === "*") return true;
    if (field.startsWith("*/")) {
      const step = parseInt(field.slice(2), 10);
      return !isNaN(step) && step > 0 && step <= max;
    }
    const num = parseInt(field, 10);
    return !isNaN(num) && num >= min && num <= max;
  };

  const startIdx = parts.length === 6 ? 1 : 0;
  // Ensure all required parts exist before validating
  if (parts.length < startIdx + 5) {
    return false;
  }
  return (
    validateField(parts[startIdx]!, 0, 59) && // minute
    validateField(parts[startIdx + 1]!, 0, 23) && // hour
    validateField(parts[startIdx + 2]!, 1, 31) && // day of month
    validateField(parts[startIdx + 3]!, 1, 12) && // month
    validateField(parts[startIdx + 4]!, 0, 6) // day of week
  );
}
