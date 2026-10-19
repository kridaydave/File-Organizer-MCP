/**
 * File Organizer MCP Server
 * file_organizer_watch_status Tool
 *
 * Read-only status over the configured watch list: the cron each watch runs
 * on, when it is next due, and whether passes have been keeping up. It reads
 * config.json (through the same list the watch CLI serves), the operation
 * history, and scheduler state. It never writes and never starts a pass.
 *
 * Liveness is inferred from the last recorded pass, because kriday ruled out
 * a heartbeat file (metadata writes on every tick are felt on btrfs). That
 * inference has three honest failure modes — never ran, ran too long ago, ran
 * but failed — which are reported as distinct states instead of one boolean.
 *
 * @module tools/watch-status
 */

import { z } from "zod";
import type { ToolDefinition, ToolResponse } from "../types.js";
import { WatchStatusInputSchema } from "../schemas/system.js";
import {
  createErrorResponse,
  sanitizeErrorMessage,
} from "../utils/error-handler.js";
import {
  createRequestContext,
  type ToolContext,
} from "../mcp/context.js";
import { handleListWatches } from "../extensions/scheduler/watch-manager.js";
import {
  getSchedulerStateService,
  type SchedulerStateService,
} from "../extensions/scheduler/scheduler-state.service.js";
import {
  getNextRunTime,
  getPreviousRunTime,
  getTimeUntilNextRun,
  isValidCronExpression,
} from "../utils/cron-utils.js";
import type { HistoryEntry } from "../services/history-logger.service.js";

/**
 * How a watch's last pass looks relative to its schedule. Four values, not a
 * boolean: "never configured", "crashed", "machine asleep", and "the pass
 * failed" all read as `alive: false` but need four different responses.
 * `unknown` covers the last two cases where the record exists but the verdict
 * cannot honestly be made (the newest pass errored, or the schedule cannot be
 * evaluated).
 */
export type WatchLiveness = "never_run" | "ok" | "stale" | "unknown";

/**
 * Which mechanism has been observed firing this watch. Evidence, not a process
 * probe: there is deliberately no pidfile or heartbeat to poll. The daemon's
 * scheduler-state entry is its fingerprint (nothing else writes that file);
 * `source: "scheduled"` history rows without that fingerprint are what an OS
 * timer driving `once --source scheduled` leaves behind; `none` means no
 * scheduled firing has ever been recorded.
 */
export type WatchSchedulerKind = "daemon" | "cron" | "none";

/** The last pass that touched a watch directory, wherever the record came from. */
interface PassRecord {
  /** ISO timestamp, or null when privacy mode stripped it from the record. */
  timestamp: string | null;
  status: "success" | "error" | "partial";
  source: "manual" | "scheduled";
  recorded_by: "history" | "scheduler-state";
  /** Only set when privacy mode allows the message through. */
  error?: string;
}

export interface WatchStatusEntry {
  directory: string;
  schedule: string;
  schedule_valid: boolean;
  rules: {
    auto_organize: boolean;
    min_file_age_minutes?: number;
    max_files_per_run?: number;
    catchup_mode?: "smart" | "always" | "never";
  };
  /** Next scheduled run as an ISO instant, computed in local time (issue #99). */
  next_run: string | null;
  minutes_until_next_run: number | null;
  expected_interval_minutes: number | null;
  liveness: WatchLiveness;
  liveness_evidence: string;
  last_pass: PassRecord | null;
  scheduler: WatchSchedulerKind;
}

export interface WatchStatusReport {
  count: number;
  watches: WatchStatusEntry[];
}

/**
 * The shape handleListWatches puts in structuredContent, re-checked here
 * because it arrives as `unknown` and config.json is hand-editable. A missing
 * schedule should come back as a reported error, not a crash in the handler.
 */
const ListedWatchesSchema = z.object({
  watches: z.array(
    z.object({
      directory: z.string(),
      schedule: z.string(),
      rules: z.object({
        auto_organize: z.boolean(),
        min_file_age_minutes: z.number().optional(),
        max_files_per_run: z.number().optional(),
        catchup_mode: z.enum(["smart", "always", "never"]).optional(),
      }),
    }),
  ),
});

type ListedWatch = z.infer<typeof ListedWatchesSchema>["watches"][number];

export const watchStatusToolDefinition: ToolDefinition = {
  name: "file_organizer_watch_status",
  title: "Watch Status",
  description:
    "Report every directory in the watch list with its cron schedule, the next time the schedule is due (computed in local time, the timezone node-cron actually fires in), and a liveness state per watch: never_run, ok, stale, or unknown, each with the evidence behind it (for example \"last pass was 6 minutes ago, expected every 5 minutes\"). Liveness is derived from the last recorded pass in history or scheduler state, not from a heartbeat, so it also reports where the record came from and which scheduler (daemon, cron, none) has been observed firing each watch. Read-only: reads config, history, and scheduler state, writes nothing and starts nothing.",
  inputSchema: {
    type: "object",
    properties: {
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        default: "markdown",
        description:
          'Output format: "markdown" for human-readable, "json" for programmatic use',
      },
    },
    required: [],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

interface EvaluateDeps {
  now: Date;
  ctx: ToolContext;
  stateService: SchedulerStateService | null;
  privacyMode: "full" | "redacted" | "none";
}

export async function handleWatchStatus(
  args: Record<string, unknown>,
  ctx: ToolContext = createRequestContext(),
): Promise<ToolResponse> {
  try {
    const parsed = WatchStatusInputSchema.safeParse(args);
    if (!parsed.success) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${sanitizeErrorMessage(
              parsed.error.issues.map((i) => i.message).join(", "),
            )}`,
          },
        ],
        isError: true,
      };
    }

    const listed = await handleListWatches({ response_format: "json" });
    if (listed.isError) {
      // The list command already failed (unreadable config, bad input); its
      // error response is the honest answer, not a second guess of it.
      return listed;
    }

    const list = ListedWatchesSchema.safeParse(listed.structuredContent);
    if (!list.success) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${sanitizeErrorMessage(
              `watch list is malformed: ${list.error.issues
                .map((i) => i.message)
                .join(", ")}`,
            )}`,
          },
        ],
        isError: true,
      };
    }

    const now = new Date();
    const stateService = await loadStateService();
    const deps: EvaluateDeps = {
      now,
      ctx,
      stateService,
      privacyMode: ctx.config.historyLogging?.privacyMode ?? "full",
    };

    const watches: WatchStatusEntry[] = [];
    for (const watch of list.data.watches) {
      watches.push(await evaluateWatch(watch, deps));
    }

    const report: WatchStatusReport = { count: watches.length, watches };

    if (parsed.data.response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
        structuredContent: report,
      };
    }

    return {
      content: [{ type: "text", text: renderWatchStatus(report) }],
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}

/** Scheduler state is optional: a failure to read it degrades to "no state". */
async function loadStateService(): Promise<SchedulerStateService | null> {
  try {
    const service = await getSchedulerStateService();
    // The daemon is a separate process and writes this file as passes run, so
    // re-read it: the singleton alone answers from this server's startup.
    await service.reload();
    return service;
  } catch {
    return null;
  }
}

async function evaluateWatch(
  watch: ListedWatch,
  deps: EvaluateDeps,
): Promise<WatchStatusEntry> {
  const { now, ctx, stateService, privacyMode } = deps;

  const scheduleValid = isValidCronExpression(watch.schedule);
  const nextRun = scheduleValid ? getNextRunTime(watch.schedule, now) : null;
  const previousRun = scheduleValid
    ? getPreviousRunTime(watch.schedule, now)
    : null;
  // The interval is the gap between two adjacent scheduled runs, measured
  // from the previous run rather than from `now`: that is the schedule's own
  // spacing. Subtracting now from nextRun would measure the rest of the
  // current wait, which is not what "expected every X" means.
  const intervalMs =
    previousRun !== null
      ? getNextRunTime(watch.schedule, previousRun).getTime() -
        previousRun.getTime()
      : null;

  const { lastPass, historyError } = await findLastPass(
    watch,
    privacyMode,
    ctx,
    stateService,
  );

  const { liveness, liveness_evidence } = decideLiveness({
    lastPass,
    historyError,
    scheduleValid,
    schedule: watch.schedule,
    intervalMs,
    now,
  });

  return {
    directory: watch.directory,
    schedule: watch.schedule,
    schedule_valid: scheduleValid,
    rules: watch.rules,
    next_run: nextRun ? nextRun.toISOString() : null,
    minutes_until_next_run: nextRun
      ? Math.round(getTimeUntilNextRun(watch.schedule, now) / 60_000)
      : null,
    expected_interval_minutes:
      intervalMs !== null ? Math.max(1, Math.round(intervalMs / 60_000)) : null,
    liveness,
    liveness_evidence,
    last_pass: lastPass,
    scheduler: detectScheduler(watch, lastPass, stateService),
  };
}

/**
 * The watch's directory as a glob that matches only itself.
 *
 * `searchHistory` takes a glob, and a directory name is not one: a real folder
 * called `[archive]` or `notes 2024?` is read as a character class or a
 * wildcard, matches no row, and the watch reports `never_run` while its passes
 * sit in history. Backslashes are folded to "/" first, so compilePathGlob's
 * Windows normalisation cannot eat the escapes that follow.
 */
function literalPathGlob(directory: string): string {
  return directory.replace(/\\/g, "/").replace(/[*?[\]{}()!+@]/g, "\\$&");
}

/**
 * Newest organize pass recorded for this directory: history first (it carries
 * status for both the daemon and cron paths since #95), scheduler state as the
 * fallback when history has no row. The newer of the two wins when both exist,
 * because a daemon run whose history append failed still stamps state.
 */
async function findLastPass(
  watch: ListedWatch,
  privacyMode: "full" | "redacted" | "none",
  ctx: ToolContext,
  stateService: SchedulerStateService | null,
): Promise<{ lastPass: PassRecord | null; historyError: string | null }> {
  let historyPass: PassRecord | null = null;
  let historyError: string | null = null;

  try {
    const result = await ctx.history.searchHistory({
      pathGlob: literalPathGlob(watch.directory),
      // Only organize passes count as passes. The server audit-logs every tool
      // call with its directory argument, so a path match alone would let
      // preview or scan calls pose as scheduled work.
      operation: "file_organizer_organize_files",
      limit: 1,
      privacyMode,
    });
    const entry = result.entries[0];
    if (entry) {
      historyPass = passFromHistory(entry, privacyMode);
    }
  } catch (error) {
    // A directory whose path is not a parseable glob must not become
    // "never run": that would be a lie about a record we failed to search.
    historyError = error instanceof Error ? error.message : String(error);
  }

  let statePass: PassRecord | null = null;
  try {
    const lastRun = stateService?.getLastRunTime(watch.directory) ?? null;
    if (lastRun) {
      statePass = {
        timestamp: lastRun.toISOString(),
        status: "success",
        // State is written only by the daemon's pass, which always records
        // its history rows as scheduled.
        source: "scheduled",
        recorded_by: "scheduler-state",
      };
    }
  } catch {
    statePass = null;
  }

  if (historyPass && statePass) {
    const historyAt = historyPass.timestamp
      ? Date.parse(historyPass.timestamp)
      : Number.POSITIVE_INFINITY; // undated by privacy mode: it is the newest row we saw
    const stateAt = statePass.timestamp ? Date.parse(statePass.timestamp) : 0;
    return {
      lastPass: historyAt >= stateAt ? historyPass : statePass,
      historyError,
    };
  }
  return { lastPass: historyPass ?? statePass, historyError };
}

function passFromHistory(
  entry: HistoryEntry,
  privacyMode: "full" | "redacted" | "none",
): PassRecord {
  const timestamp = entry.timestamp ?? "";
  const parsed = Date.parse(timestamp);
  return {
    timestamp: Number.isFinite(parsed) ? new Date(parsed).toISOString() : null,
    status: entry.status,
    source: entry.source,
    recorded_by: "history",
    // Privacy mode "none" strips everything but operation/status/duration;
    // a message that may quote paths must not be smuggled out here instead.
    ...(privacyMode !== "none" && entry.error?.message
      ? { error: entry.error.message }
      : {}),
  };
}

/**
 * Verdict over one watch's record, in order of certainty:
 *
 * 1. No record (and history searched cleanly) -> never_run, a fact.
 * 2. No record but history could not be searched -> unknown, because "no
 *    record" was not actually observable.
 * 3. Newest pass errored -> unknown: a failed pass proves an attempt but not
 *    a schedule being kept.
 * 4. Record exists but its time is hidden (privacy mode) or the schedule is
 *    not a valid cron expression -> unknown, nothing can be judged.
 * 5. Otherwise: stale when the last pass is older than the schedule's own
 *    interval, ok when it is not.
 */
function decideLiveness(input: {
  lastPass: PassRecord | null;
  historyError: string | null;
  scheduleValid: boolean;
  schedule: string;
  intervalMs: number | null;
  now: Date;
}): { liveness: WatchLiveness; liveness_evidence: string } {
  const { lastPass, historyError, scheduleValid, schedule, intervalMs, now } =
    input;

  if (!lastPass) {
    if (historyError) {
      return {
        liveness: "unknown",
        liveness_evidence: `history could not be searched for this directory (${sanitizeErrorMessage(historyError)}) and scheduler state has no record`,
      };
    }
    return {
      liveness: "never_run",
      liveness_evidence:
        "no pass has ever been recorded for this directory",
    };
  }

  const age = lastPass.timestamp
    ? now.getTime() - Date.parse(lastPass.timestamp)
    : null;

  if (lastPass.status === "error") {
    const detail = lastPass.error ? `: ${sanitizeErrorMessage(lastPass.error)}` : "";
    const when = age !== null ? ` (${formatSpan(age)} ago)` : "";
    return {
      liveness: "unknown",
      liveness_evidence: `the newest pass recorded an error${detail}${when}`,
    };
  }

  if (age === null) {
    return {
      liveness: "unknown",
      liveness_evidence:
        "a pass has been recorded for this directory but privacy mode hides when it ran",
    };
  }

  if (!scheduleValid || intervalMs === null) {
    return {
      liveness: "unknown",
      liveness_evidence: `"${schedule}" is not a valid cron expression, so the last pass (${formatSpan(age)} ago) cannot be judged against it`,
    };
  }

  const origin = lastPass.recorded_by === "history" ? "history" : "scheduler state";
  const evidence = `last pass was ${formatSpan(age)} ago, expected every ${formatSpan(intervalMs)} (${origin}, ${lastPass.status})`;

  if (age > intervalMs) {
    return { liveness: "stale", liveness_evidence: evidence };
  }
  return { liveness: "ok", liveness_evidence: evidence };
}

function detectScheduler(
  watch: ListedWatch,
  lastPass: PassRecord | null,
  stateService: SchedulerStateService | null,
): WatchSchedulerKind {
  let hasState: boolean;
  try {
    hasState =
      (stateService?.getLastRunTime(watch.directory) ?? null) !== null;
  } catch {
    hasState = false;
  }

  // The daemon fingerprint wins only while the watch is one the daemon would
  // actually schedule: auto_organize off means reloadTasks skips it, so a
  // leftover state entry is history, not evidence of a live mechanism.
  if (hasState && watch.rules.auto_organize) return "daemon";
  if (lastPass?.source === "scheduled") return "cron";
  return "none";
}

/** "5 minutes", "2 hours", "7 days" — presentation only, verdicts use raw ms. */
function formatSpan(ms: number): string {
  const totalMinutes = Math.round(Math.abs(ms) / 60_000);
  if (totalMinutes < 1) return "under a minute";
  if (totalMinutes < 60) {
    return `${totalMinutes} minute${totalMinutes === 1 ? "" : "s"}`;
  }
  const totalHours = Math.round(totalMinutes / 60);
  if (totalHours < 24) {
    return `${totalHours} hour${totalHours === 1 ? "" : "s"}`;
  }
  const totalDays = Math.round(totalHours / 24);
  return `${totalDays} day${totalDays === 1 ? "" : "s"}`;
}

function renderWatchStatus(report: WatchStatusReport): string {
  if (report.watches.length === 0) {
    return "No directories are currently being watched. Use `file-organizer-watch add <directory> <cron>` to add one.";
  }

  let markdown = `### Watch Status (${report.count} watch${report.count === 1 ? "" : "es"})\n\n`;

  report.watches.forEach((watch, index) => {
    const validity = watch.schedule_valid ? "valid" : "INVALID";
    const next = watch.next_run
      ? `next run: ${new Date(watch.next_run).toLocaleString()} (in ${watch.minutes_until_next_run} minute${watch.minutes_until_next_run === 1 ? "" : "s"})`
      : "next run: cannot be computed";
    markdown += `${index + 1}. **${watch.directory}**\n`;
    markdown += `   - Schedule: \`${watch.schedule}\` (${validity}), ${next}\n`;
    markdown += `   - Liveness: ${watch.liveness} — ${watch.liveness_evidence}\n`;
    markdown += `   - Scheduler: ${watch.scheduler}\n`;
  });

  return markdown;
}
