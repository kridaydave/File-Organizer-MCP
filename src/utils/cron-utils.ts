/**
 * File Organizer MCP Server v5.0.0
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
type CronField =
  | number
  | "*"
  | "*/n"
  | { type: "range"; start: number; end: number; step?: number }
  | { type: "list"; values: number[] };

interface CronComponents {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
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

  const parseField = (field: string): CronField => {
    if (field === "*") return "*";
    if (field.startsWith("*/")) {
      return field as "*/n";
    }
    // Handle step values with ranges like 1-10/2
    if (field.includes("/")) {
      const [rangePart, stepPart] = field.split("/");
      const step = parseInt(stepPart, 10);
      if (!isNaN(step) && rangePart === "*") {
        return `*/${step}` as "*/n";
      }
      if (!isNaN(step) && rangePart.includes("-")) {
        const [startStr, endStr] = rangePart.split("-");
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end)) {
          return { type: "range", start, end, step };
        }
      }
      // Fallback
      const num = parseInt(rangePart, 10);
      if (!isNaN(num)) return num;
      return "*";
    }
    // Handle lists like 1,2,3
    if (field.includes(",")) {
      const values = field
        .split(",")
        .map((v) => parseInt(v.trim(), 10))
        .filter((v) => !isNaN(v));
      if (values.length > 0) {
        return { type: "list", values };
      }
      return "*";
    }
    // Handle ranges like 9-17
    if (field.includes("-")) {
      const [startStr, endStr] = field.split("-");
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        return { type: "range", start, end };
      }
      // If parseInt truncates badly, try to be defensive
      return "*";
    }
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
 * Check if a cron field matches a given value
 */
function fieldMatches(field: CronField, value: number): boolean {
  if (field === "*") return true;
  if (typeof field === "string" && field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10);
    if (isNaN(step) || step === 0) return false;
    // For step values, check if value is divisible by step from 0
    return value % step === 0;
  }
  if (typeof field === "number") {
    return field === value;
  }
  if (typeof field === "object" && field.type === "list") {
    return field.values.includes(value);
  }
  if (typeof field === "object" && field.type === "range") {
    if (value < field.start || value > field.end) return false;
    if (field.step) {
      return (value - field.start) % field.step === 0;
    }
    return true;
  }
  return false;
}

/**
 * Get the next value in a field that >= currentValue
 */
function getNextInField(field: CronField, currentValue: number, max: number): number | null {
  if (field === "*") {
    return currentValue + 1 > max ? null : currentValue + 1;
  }
  if (typeof field === "string" && field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10);
    if (isNaN(step) || step === 0) return null;
    const next = Math.ceil((currentValue + 1) / step) * step;
    if (next > max) return null;
    return next;
  }
  if (typeof field === "number") {
    if (field > currentValue) return field;
    return null;
  }
  if (typeof field === "object" && field.type === "list") {
    const sorted = [...field.values].sort((a, b) => a - b);
    for (const v of sorted) {
      if (v > currentValue) return v;
    }
    return null;
  }
  if (typeof field === "object" && field.type === "range") {
    let start = field.start;
    if (currentValue >= field.start) {
      // Find next in range >= currentValue + 1
      let candidate = currentValue + 1;
      if (candidate < field.start) candidate = field.start;
      if (field.step) {
        // Align to step from start
        const diff = candidate - field.start;
        if (diff % field.step !== 0) {
          candidate = candidate + (field.step - (diff % field.step));
        }
      }
      if (candidate <= field.end) return candidate;
      return null;
    } else {
      // currentValue is before range, return first in range
      if (field.step) {
        return field.start;
      }
      return field.start > currentValue ? field.start : null;
    }
  }
  return null;
}

/**
 * Get the first value in a field
 */
function getFirstInField(field: CronField, min: number = 0): number | null {
  if (field === "*") return min;
  if (typeof field === "string" && field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10);
    if (isNaN(step) || step === 0) return null;
    return min % step === 0 ? min : Math.ceil(min / step) * step;
  }
  if (typeof field === "number") return field;
  if (typeof field === "object" && field.type === "list") {
    const sorted = [...field.values].sort((a, b) => a - b);
    return sorted[0] ?? null;
  }
  if (typeof field === "object" && field.type === "range") {
    return field.start;
  }
  return null;
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
  const getStep = (field: CronField): number | null => {
    if (typeof field === "string" && field.startsWith("*/")) {
      return parseInt(field.slice(2), 10);
    }
    if (typeof field === "object" && field.type === "range" && field.step) {
      return null; // Could be complex
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
  const isHourly =
    components.minute !== "*" &&
    (typeof components.minute === "number" ||
      typeof components.minute === "object") &&
    components.hour === "*" &&
    components.dayOfMonth === "*" &&
    components.month === "*" &&
    components.dayOfWeek === "*";
  const isDaily =
    components.minute !== "*" &&
    components.hour !== "*" &&
    components.hour !== (components.hour === "*" ? "*" : components.hour) && // hour is specific or range
    components.dayOfMonth === "*" &&
    components.month === "*" &&
    (components.dayOfWeek === "*" || components.dayOfWeek === undefined);
  // More specific checks
  const hourIsSpecific =
    components.hour === "*" ||
    (typeof components.hour === "string" && components.hour.startsWith("*/"))
      ? false
      : components.hour !== "*";
  const minuteIsSpecific =
    components.minute !== "*" &&
    !(typeof components.minute === "string" && components.minute.startsWith("*/"));
  const isDailyBetter =
    minuteIsSpecific &&
    components.hour !== "*" &&
    !(typeof components.hour === "string" && components.hour.startsWith("*/")) &&
    components.dayOfMonth === "*" &&
    (components.dayOfWeek === "*" || typeof components.dayOfWeek === "string" && (components.dayOfWeek as string) === "*");
  const isWeekly =
    components.minute !== "*" &&
    components.hour !== "*" &&
    components.dayOfWeek !== "*" &&
    components.dayOfMonth === "*";
  const isMonthly =
    components.minute !== "*" &&
    components.hour !== "*" &&
    components.dayOfMonth !== "*" &&
    components.dayOfWeek === "*";

  if (isWeekly) return 7 * 24 * 60 * 60 * 1000; // 7 days
  if (isMonthly) return 31 * 24 * 60 * 60 * 1000; // ~1 month
  if (isDaily || (minuteIsSpecific && components.hour !== "*" && components.dayOfMonth === "*")) return 24 * 60 * 60 * 1000; // 1 day
  if (isHourly || (minuteIsSpecific && components.hour === "*" && components.dayOfMonth === "*")) return 60 * 60 * 1000; // 1 hour

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

  // Helper to get a specific value from a field (for backward compat)
  const getFieldValue = (field: CronField): number | null => {
    if (typeof field === "number") return field;
    if (typeof field === "object" && field.type === "list" && field.values.length === 1)
      return field.values[0];
    return null;
  };

  const isStepMinute =
    typeof components.minute === "string" && components.minute.startsWith("*/");
  const isStepHour =
    typeof components.hour === "string" && components.hour.startsWith("*/");

  // Handle step values (e.g., */30 for every 30 minutes)
  if (isStepMinute) {
    const step = parseInt((components.minute as string).slice(2), 10);
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

  // Handle step values in hours with specific minute
  if (
    isStepHour &&
    components.minute !== "*" &&
    !(typeof components.minute === "string" && components.minute.startsWith("*/"))
  ) {
    const minuteVal = getFieldValue(components.minute);
    const step = parseInt((components.hour as string).slice(2), 10);
    next.setUTCMinutes(minuteVal !== null ? minuteVal : next.getUTCMinutes());
    // Find next hour divisible by step
    let hour = next.getUTCHours();
    if (next.getUTCMinutes() < (minuteVal !== null ? minuteVal : 0) || next.getTime() <= fromDate.getTime() || hour % step !== 0) {
      // simple approach
    }
    // easier: if current time is past this run, add interval
    if (next.getTime() <= fromDate.getTime()) {
      next.setUTCHours(next.getUTCHours() + step);
    }
    // normalize
    if (minuteVal !== null) {
      next.setUTCMinutes(minuteVal);
      if (next.getTime() <= fromDate.getTime()) {
        next.setUTCHours(next.getUTCHours() + step);
      }
    }
    return next;
  }

  // Handle hourly pattern: "0 * * * *" or "0 9-17 * * *" style (minute specific, hour any/range, DOM/month/DOW *)
  const minuteSpecific =
    components.minute !== "*" &&
    !isStepMinute;
  const hourWildcard =
    components.hour === "*" ||
    isStepHour;
  if (
    minuteSpecific &&
    hourWildcard &&
    components.dayOfMonth === "*" &&
    components.month === "*" &&
    components.dayOfWeek === "*"
  ) {
    const minuteVal = getFieldValue(components.minute);
    if (minuteVal !== null) {
      next.setUTCMinutes(minuteVal);
      if (next.getTime() <= fromDate.getTime()) {
        next.setUTCHours(next.getUTCHours() + 1);
      }
    }
    return next;
  }

  // Handle pattern with minute specific, hour is range/list/specific, DOM *, month *, DOW *
  if (
    minuteSpecific &&
    components.hour !== "*" &&
    !isStepHour &&
    components.dayOfMonth === "*" &&
    components.month === "*" &&
    components.dayOfWeek === "*"
  ) {
    const minuteVal = getFieldValue(components.minute);
    if (minuteVal !== null) {
      next.setUTCMinutes(minuteVal);
    }
    const currentHour = next.getUTCHours();
    // Check if current hour matches and time hasn't passed
    if (fieldMatches(components.hour, currentHour)) {
      if (next.getTime() <= fromDate.getTime()) {
        // Look for next hour in range
        const nextHour = getNextInField(components.hour, currentHour, 23);
        if (nextHour !== null) {
          next.setUTCHours(nextHour);
          return next;
        } else {
          // Move to next day, start at first hour in range
          next.setUTCDate(next.getUTCDate() + 1);
          const firstHour = getFirstInField(components.hour, 0);
          if (firstHour !== null) next.setUTCHours(firstHour);
          else next.setUTCHours(0);
          return next;
        }
      } else {
        return next;
      }
    } else {
      // Current hour doesn't match, look for next hour in range today
      const nextHour = getNextInField(components.hour, currentHour - 1, 23); // look from before current
      // easier: find next hour >= currentHour
      if (typeof components.hour === "object" && components.hour.type === "range") {
        if (currentHour < components.hour.start) {
          next.setUTCHours(components.hour.start);
          return next;
        } else if (currentHour <= components.hour.end) {
          // look for next in range
          let candidate = currentHour;
          // try to find next
          const nh = getNextInField(components.hour, currentHour, 23);
          if (nh !== null && nh >= currentHour) {
            // but if same hour doesn't match time? we need hour > currentHour or hour matches and time ok
            // check: is current hour in range and time not passed?
            if (fieldMatches(components.hour, currentHour) && next.getTime() > fromDate.getTime()) {
              return next;
            }
            if (nh !== currentHour || next.getTime() <= fromDate.getTime()) {
              // if nh is same as currentHour and time passed, need next
              if (nh === currentHour && next.getTime() <= fromDate.getTime()) {
                const nh2 = getNextInField(components.hour, currentHour, 23);
                if (nh2 !== null) { next.setUTCHours(nh2); return next; }
              } else if (nh > currentHour) {
                next.setUTCHours(nh);
                return next;
              }
            }
          }
          const nh2 = getNextInField(components.hour, currentHour, 23);
          if (nh2 !== null && nh2 > currentHour) { next.setUTCHours(nh2); return next; }
          if (nh2 !== null && nh2 === currentHour && next.getTime() > fromDate.getTime()) { return next; }
        }
        // move to next day
        next.setUTCDate(next.getUTCDate() + 1);
        next.setUTCHours(components.hour.start);
        return next;
      } else if (typeof components.hour === "object" && components.hour.type === "list") {
        const sorted = [...components.hour.values].sort((a,b)=>a-b);
        // find next > currentHour or first if none
        for (const h of sorted) {
          if (h > currentHour) { next.setUTCHours(h); return next; }
          if (h === currentHour && next.getTime() > fromDate.getTime()) { next.setUTCHours(h); return next; }
        }
        next.setUTCDate(next.getUTCDate() + 1);
        next.setUTCHours(sorted[0]);
        return next;
      } else if (typeof components.hour === "number") {
        next.setUTCHours(components.hour);
        if (next.getTime() <= fromDate.getTime()) {
          next.setUTCDate(next.getUTCDate() + 1);
        }
        return next;
      }
      // fallback
      next.setUTCDate(next.getUTCDate() + 1);
      const firstHour = getFirstInField(components.hour, 0);
      if (firstHour !== null) next.setUTCHours(firstHour);
      return next;
    }
  }

  // Handle daily pattern: "0 9 * * *" (daily at 9am)
  if (
    minuteSpecific &&
    components.hour !== "*" &&
    !isStepHour &&
    components.dayOfMonth === "*" &&
    components.month === "*" &&
    components.dayOfWeek === "*"
  ) {
    const minuteVal = getFieldValue(components.minute);
    const hourVal = getFieldValue(components.hour);
    if (minuteVal !== null) next.setUTCMinutes(minuteVal);
    if (hourVal !== null) next.setUTCHours(hourVal);
    else {
      // try to set first hour if range
      const fh = getFirstInField(components.hour, 0);
      if (fh !== null) next.setUTCHours(fh);
    }
    if (next.getTime() <= fromDate.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
      // if hour was a range, reset to first hour of range
      if (typeof components.hour === "object" && components.hour.type === "range") {
        next.setUTCHours(components.hour.start);
        if (minuteVal !== null) next.setUTCMinutes(minuteVal);
      }
    }
    return next;
  }

  // Handle weekly pattern: "0 9 * * 0" (weekly on Sunday at 9am)
  if (
    minuteSpecific &&
    components.hour !== "*" &&
    !isStepHour &&
    components.dayOfWeek !== "*" &&
    components.dayOfMonth === "*"
  ) {
    const minuteVal = getFieldValue(components.minute);
    const hourVal = getFieldValue(components.hour);
    if (minuteVal !== null) next.setUTCMinutes(minuteVal);
    if (hourVal !== null) next.setUTCHours(hourVal);
    else {
      const fh = getFirstInField(components.hour, 0);
      if (fh !== null) next.setUTCHours(fh);
    }
    if (typeof components.dayOfWeek === "number") {
      const targetDay = components.dayOfWeek;
      const currentDay = next.getUTCDay();
      const daysUntilTarget = (targetDay - currentDay + 7) % 7;
      next.setUTCDate(next.getUTCDate() + daysUntilTarget);
      if (next.getTime() <= fromDate.getTime()) {
        next.setUTCDate(next.getUTCDate() + 7);
      }
      return next;
    } else if (typeof components.dayOfWeek === "object" && components.dayOfWeek.type === "list") {
      // find next matching day
      const currentDay = next.getUTCDay();
      // check today
      for (let i = 0; i < 7; i++) {
        const checkDay = (currentDay + i) % 7;
        if (components.dayOfWeek.values.includes(checkDay)) {
          next.setUTCDate(next.getUTCDate() + i);
          if (i === 0 && next.getTime() <= fromDate.getTime()) {
            // try next week
            next.setUTCDate(next.getUTCDate() + 7);
          }
          return next;
        }
      }
      return next;
    } else {
      const targetDay = getFieldValue(components.dayOfWeek);
      if (targetDay !== null) {
        const currentDay = next.getUTCDay();
        const daysUntilTarget = (targetDay - currentDay + 7) % 7;
        next.setUTCDate(next.getUTCDate() + daysUntilTarget);
        if (next.getTime() <= fromDate.getTime()) {
          next.setUTCDate(next.getUTCDate() + 7);
        }
        return next;
      }
    }
  }

  // Handle monthly pattern: specific day of month, every month at specified time
  if (
    minuteSpecific &&
    components.hour !== "*" &&
    !isStepHour &&
    components.dayOfMonth !== "*" &&
    components.dayOfWeek === "*"
  ) {
    const minuteVal = getFieldValue(components.minute);
    const hourVal = getFieldValue(components.hour);
    if (minuteVal !== null) next.setUTCMinutes(minuteVal);
    if (hourVal !== null) next.setUTCHours(hourVal);
    else {
      const fh = getFirstInField(components.hour, 0);
      if (fh !== null) next.setUTCHours(fh);
    }
    const targetDom = getFieldValue(components.dayOfMonth);
    if (targetDom !== null) {
      const currentDom = next.getUTCDate();
      if (currentDom < targetDom) {
        next.setUTCDate(targetDom);
        if (next.getTime() <= fromDate.getTime()) {
          next.setUTCMonth(next.getUTCMonth() + 1);
          next.setUTCDate(targetDom);
        }
        return next;
      } else if (currentDom === targetDom) {
        if (next.getTime() <= fromDate.getTime()) {
          next.setUTCMonth(next.getUTCMonth() + 1);
          next.setUTCDate(targetDom);
        }
        return next;
      } else {
        next.setUTCMonth(next.getUTCMonth() + 1);
        next.setUTCDate(targetDom);
        return next;
      }
    } else if (typeof components.dayOfMonth === "object" && components.dayOfMonth.type === "list") {
      const currentDom = next.getUTCDate();
      const sorted = [...components.dayOfMonth.values].sort((a,b)=>a-b);
      for (const d of sorted) {
        if (d > currentDom) { next.setUTCDate(d); return next; }
        if (d === currentDom && next.getTime() > fromDate.getTime()) { next.setUTCDate(d); return next; }
      }
      next.setUTCMonth(next.getUTCMonth() + 1);
      next.setUTCDate(sorted[0]);
      return next;
    } else if (typeof components.dayOfMonth === "object" && components.dayOfMonth.type === "range") {
      const currentDom = next.getUTCDate();
      if (fieldMatches(components.dayOfMonth, currentDom)) {
        if (next.getTime() > fromDate.getTime()) {
          return next;
        }
      }
      // look for next
      const nd = getNextInField(components.dayOfMonth, currentDom, 31);
      if (nd !== null && nd > currentDom) {
        next.setUTCDate(nd);
        return next;
      }
      if (nd !== null && nd === currentDom && next.getTime() > fromDate.getTime()) {
        return next;
      }
      next.setUTCMonth(next.getUTCMonth() + 1);
      next.setUTCDate(components.dayOfMonth.start);
      return next;
    }
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

  const getFieldValue = (field: CronField): number | null => {
    if (typeof field === "number") return field;
    if (typeof field === "object" && field.type === "list" && field.values.length === 1)
      return field.values[0];
    return null;
  };

  const isStepMinute =
    typeof components.minute === "string" && components.minute.startsWith("*/");
  const isStepHour =
    typeof components.hour === "string" && components.hour.startsWith("*/");
  const minuteSpecific = components.minute !== "*" && !isStepMinute;

  // Handle step values (e.g., */30 for every 30 minutes)
  if (isStepMinute) {
    const step = parseInt((components.minute as string).slice(2), 10);
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

  // Handle hourly pattern: "0 * * * *" or minute specific with wildcard hour
  if (
    minuteSpecific &&
    (components.hour === "*" || isStepHour) &&
    components.dayOfMonth === "*" &&
    components.month === "*" &&
    components.dayOfWeek === "*"
  ) {
    const minuteVal = getFieldValue(components.minute);
    if (minuteVal !== null) prev.setUTCMinutes(minuteVal);
    if (prev.getTime() >= fromDate.getTime()) {
      prev.setUTCHours(prev.getUTCHours() - 1);
    }
    return prev;
  }

  // Handle patterns with hour range/list
  if (
    minuteSpecific &&
    components.hour !== "*" &&
    !isStepHour &&
    components.dayOfMonth === "*" &&
    components.month === "*" &&
    components.dayOfWeek === "*"
  ) {
    const minuteVal = getFieldValue(components.minute);
    if (minuteVal !== null) prev.setUTCMinutes(minuteVal);
    const currentHour = prev.getUTCHours();
    if (fieldMatches(components.hour, currentHour)) {
      if (prev.getTime() >= fromDate.getTime()) {
        // look for previous hour in range
        if (typeof components.hour === "object" && components.hour.type === "range") {
          let h = currentHour - 1;
          while (h >= components.hour.start) {
            if (components.hour.step) {
              if ((h - components.hour.start) % components.hour.step === 0) {
                prev.setUTCHours(h);
                return prev;
              }
            } else {
              prev.setUTCHours(h);
              return prev;
            }
            h--;
          }
          prev.setUTCDate(prev.getUTCDate() - 1);
          prev.setUTCHours(components.hour.end);
          if (components.hour.step) {
            let h2 = components.hour.end;
            while (h2 >= components.hour.start) {
              if ((h2 - components.hour.start) % components.hour.step === 0) {
                prev.setUTCHours(h2);
                break;
              }
              h2--;
            }
          }
          return prev;
        } else if (typeof components.hour === "object" && components.hour.type === "list") {
          const sorted = [...components.hour.values].sort((a,b)=>b-a);
          for (const h of sorted) {
            if (h < currentHour) { prev.setUTCHours(h); return prev; }
          }
          prev.setUTCDate(prev.getUTCDate() - 1);
          prev.setUTCHours(sorted[0]);
          return prev;
        } else if (typeof components.hour === "number") {
          prev.setUTCHours(components.hour);
          prev.setUTCDate(prev.getUTCDate() - 1);
          return prev;
        }
      } else {
        return prev;
      }
    } else {
      if (typeof components.hour === "object" && components.hour.type === "range") {
        if (currentHour > components.hour.end) {
          prev.setUTCHours(components.hour.end);
          if (components.hour.step) {
            let h2 = components.hour.end;
            while (h2 >= components.hour.start) {
              if ((h2 - components.hour.start) % components.hour.step === 0) { prev.setUTCHours(h2); break; }
              h2--;
            }
          }
          return prev;
        } else if (currentHour >= components.hour.start) {
          // find prev in range
        }
        prev.setUTCDate(prev.getUTCDate() - 1);
        prev.setUTCHours(components.hour.end);
        if (components.hour.step) {
          let h2 = components.hour.end;
          while (h2 >= components.hour.start) {
            if ((h2 - components.hour.start) % components.hour.step === 0) { prev.setUTCHours(h2); break; }
            h2--;
          }
        }
        return prev;
      } else if (typeof components.hour === "object" && components.hour.type === "list") {
        const sorted = [...components.hour.values].sort((a,b)=>b-a);
        for (const h of sorted) {
          if (h < currentHour) { prev.setUTCHours(h); return prev; }
        }
        prev.setUTCDate(prev.getUTCDate() - 1);
        prev.setUTCHours(sorted[sorted.length-1]);
        return prev;
      }
    }
  }

  // Handle daily pattern: "0 9 * * *"
  if (
    minuteSpecific &&
    components.hour !== "*" &&
    !isStepHour &&
    components.dayOfMonth === "*" &&
    components.month === "*" &&
    components.dayOfWeek === "*"
  ) {
    const minuteVal = getFieldValue(components.minute);
    const hourVal = getFieldValue(components.hour);
    if (minuteVal !== null) prev.setUTCMinutes(minuteVal);
    if (hourVal !== null) prev.setUTCHours(hourVal);
    else {
      const fh = getFirstInField(components.hour, 0);
      if (fh !== null) prev.setUTCHours(fh);
    }
    if (prev.getTime() >= fromDate.getTime()) {
      prev.setUTCDate(prev.getUTCDate() - 1);
    }
    return prev;
  }

  // Handle weekly pattern
  if (
    minuteSpecific &&
    components.hour !== "*" &&
    !isStepHour &&
    components.dayOfWeek !== "*" &&
    components.dayOfMonth === "*"
  ) {
    const minuteVal = getFieldValue(components.minute);
    const hourVal = getFieldValue(components.hour);
    if (minuteVal !== null) prev.setUTCMinutes(minuteVal);
    if (hourVal !== null) prev.setUTCHours(hourVal);
    else {
      const fh = getFirstInField(components.hour, 0);
      if (fh !== null) prev.setUTCHours(fh);
    }
    if (typeof components.dayOfWeek === "number") {
      const targetDay = components.dayOfWeek;
      const currentDay = prev.getUTCDay();
      const daysDiff = currentDay - targetDay;
      const daysToSubtract = daysDiff >= 0 ? daysDiff : daysDiff + 7;
      prev.setUTCDate(prev.getUTCDate() - daysToSubtract);
      if (prev.getTime() >= fromDate.getTime()) {
        prev.setUTCDate(prev.getUTCDate() - 7);
      }
      return prev;
    }
  }

  // Handle monthly pattern
  if (
    minuteSpecific &&
    components.hour !== "*" &&
    !isStepHour &&
    components.dayOfMonth !== "*" &&
    components.dayOfWeek === "*"
  ) {
    const minuteVal = getFieldValue(components.minute);
    const hourVal = getFieldValue(components.hour);
    if (minuteVal !== null) prev.setUTCMinutes(minuteVal);
    if (hourVal !== null) prev.setUTCHours(hourVal);
    else {
      const fh = getFirstInField(components.hour, 0);
      if (fh !== null) prev.setUTCHours(fh);
    }
    const targetDom = getFieldValue(components.dayOfMonth);
    if (targetDom !== null) {
      const currentDom = prev.getUTCDate();
      if (currentDom > targetDom) {
        prev.setUTCDate(targetDom);
        if (prev.getTime() >= fromDate.getTime()) {
          prev.setUTCMonth(prev.getUTCMonth() - 1);
          prev.setUTCDate(targetDom);
        }
        return prev;
      } else if (currentDom === targetDom) {
        if (prev.getTime() >= fromDate.getTime()) {
          prev.setUTCMonth(prev.getUTCMonth() - 1);
          prev.setUTCDate(targetDom);
        }
        return prev;
      } else {
        prev.setUTCMonth(prev.getUTCMonth() - 1);
        prev.setUTCDate(targetDom);
        return prev;
      }
    }
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
    // Handle step with range like 1-10/2
    if (field.includes("/")) {
      const [rangePart, stepPart] = field.split("/");
      const step = parseInt(stepPart, 10);
      if (isNaN(step) || step <= 0 || step > max) return false;
      if (rangePart === "*") return true;
      if (rangePart.includes("-")) {
        const [s, e] = rangePart.split("-");
        const start = parseInt(s, 10);
        const end = parseInt(e, 10);
        return !isNaN(start) && !isNaN(end) && start >= min && end <= max && start <= end;
      }
      return false;
    }
    // Handle lists like 1,2,3
    if (field.includes(",")) {
      const values = field.split(",").map((v) => v.trim());
      for (const v of values) {
        if (v === "*") continue;
        if (v.startsWith("*/")) {
          const step = parseInt(v.slice(2), 10);
          if (isNaN(step) || step <= 0 || step > max) return false;
          continue;
        }
        if (v.includes("-")) {
          const [s, e] = v.split("-");
          const start = parseInt(s, 10);
          const end = parseInt(e, 10);
          if (isNaN(start) || isNaN(end) || start < min || end > max || start > end) return false;
          continue;
        }
        const num = parseInt(v, 10);
        if (isNaN(num) || num < min || num > max) return false;
      }
      return true;
    }
    // Handle ranges like 9-17
    if (field.includes("-")) {
      const [s, e] = field.split("-");
      const start = parseInt(s, 10);
      const end = parseInt(e, 10);
      if (isNaN(start) || isNaN(end)) return false;
      if (start < min || end > max || start > end) return false;
      return true;
    }
    const num = parseInt(field, 10);
    return !isNaN(num) && num >= min && num <= max;
  };

  const startIdx = parts.length === 6 ? 1 : 0;
  // Ensure all required parts exist before validating
  if (parts.length < startIdx + 5) {
    return false;
  }
  try {
    return (
      validateField(parts[startIdx]!, 0, 59) && // minute
      validateField(parts[startIdx + 1]!, 0, 23) && // hour
      validateField(parts[startIdx + 2]!, 1, 31) && // day of month
      validateField(parts[startIdx + 3]!, 1, 12) && // month
      validateField(parts[startIdx + 4]!, 0, 6) // day of week
    );
  } catch {
    return false;
  }
}
