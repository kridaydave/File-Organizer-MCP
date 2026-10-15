/**
 * Notify — one command per moving pass, throttled per directory.
 *
 * A pass that actually moved files runs `config.notify.command` once. A dry
 * run, a pass that found nothing, and a pass inside the throttle window are
 * all silence. Nothing here is reachable from a tool call: the command is a
 * value only the user can write into config.json, it is tokenized into argv and
 * spawned with no shell, and nothing a tool argument sends reaches it.
 *
 * Throttle state is a sibling key inside scheduler-state.json — the file
 * SchedulerStateService already owns — rather than a new file. A top-level
 * `notifications` key rather than a field on each directory entry, because
 * `setLastRunTime` replaces an entry wholesale and would drop anything extra,
 * while the state validator ignores keys it does not know and `migrateState`
 * spreads the object it read. The cost of that choice is that this module does
 * its own read-modify-write of the file, so a notification write concurrent
 * with a scheduler write reverts the other's change; the worst case is one
 * directory whose catch-up timestamp looks stale, which re-runs a pass. A
 * notification timestamp is not worth a lock file.
 */

import { spawn } from "child_process";
import fsSync from "fs";
import path from "path";
import { sanitizeErrorMessage } from "../../utils/error-handler.js";
import { logger } from "../../utils/logger.js";
import type { NotifyConfig, UserConfig } from "../config/loader.js";
import { getConfigDirectory } from "../config/paths.js";

/**
 * Minutes between two notifications for one directory when config says
 * nothing. A folder swept every few minutes would otherwise ping 15 times an
 * hour, which is how a notification becomes a notification nobody reads.
 */
export const DEFAULT_NOTIFY_THROTTLE_MINUTES = 60;

/** The scheduler state file, shared with SchedulerStateService. */
const SCHEDULER_STATE_FILE = "scheduler-state.json";

/** Our slice of that file: directory -> ISO timestamp of the last command. */
const NOTIFY_STATE_KEY = "notifications";

/** Why no command ran. Absent only when a command did run. */
export type NotifySkipReason =
  | "not-configured"
  | "invalid-config"
  | "nothing-moved"
  | "throttled";

export interface NotifyResult {
  /** True when a command was spawned. */
  sent: boolean;
  /** Why nothing was spawned. Absent when `sent` is true. */
  reason?: NotifySkipReason;
  /** The argv that was spawned, so a caller or a test can see exactly what ran. */
  argv?: string[];
}

export interface NotifyRequest {
  /** Directory the pass covered. Key for the throttle, so it is per-directory. */
  directory: string;
  /** Files the pass moved. 0 is silence, which is what a dry run reports too. */
  moved: number;
  /** The whole user config, so the pass does not have to reach into notify. */
  config: UserConfig;
}

/**
 * The slice of `spawn` this module uses. Narrow on purpose: it is the seam a
 * test injects to assert argv without running a process.
 */
export type NotifySpawnFn = (
  command: string,
  args: readonly string[],
  options: {
    stdio: "ignore";
    windowsHide: boolean;
    env: NodeJS.ProcessEnv;
  },
) => {
  unref(): void;
  on(event: "error", listener: (error: Error) => void): unknown;
};

export interface NotifyDeps {
  /** Defaults to the real `child_process.spawn`. */
  spawnFn?: NotifySpawnFn;
  /** Defaults to scheduler-state.json in the platform config directory. */
  stateFilePath?: string;
  /** Clock, so a throttle test does not depend on the wall clock. */
  now?: () => number;
}

/**
 * Split a command line into argv, honouring single and double quotes.
 *
 * The config field is one string, and spawn takes argv, so something has to
 * split it. There is no shell to do it: `notify-send "Moved 3 files"` has to
 * arrive as two arguments, and a tokenizer that split on whitespace alone
 * would hand notify-send four.
 *
 * Returns null for a command that cannot be split — an unterminated quote, or
 * one that yields no argv. Null means "not configured properly", which is
 * silence plus a logged reason, never a half-spawned process.
 */
export function tokenizeNotifyCommand(command: string): string[] | null {
  const argv: string[] = [];
  let current = "";
  let open = false;
  let quote: '"' | "'" | null = null;

  for (const char of command) {
    if (quote !== null) {
      if (char === quote) {
        quote = null;
        continue;
      }
      current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      open = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (open) {
        argv.push(current);
        current = "";
        open = false;
      }
      continue;
    }
    current += char;
    open = true;
  }

  // A quote still open at the end means the line is malformed, not that the
  // rest of it should run.
  if (quote !== null) return null;
  if (open) argv.push(current);
  return argv.length > 0 ? argv : null;
}

/**
 * Throttle window in minutes, or null when the configured value is unusable.
 *
 * loadUserConfig() parses JSONC and casts, so nothing has checked this field.
 * A value that becomes argv deserves a type check before it is used, and this
 * is the last point where that is possible.
 */
export function resolveNotifyThrottleMinutes(value: unknown): number | null {
  if (value === undefined) return DEFAULT_NOTIFY_THROTTLE_MINUTES;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

/** scheduler-state.json in the platform config directory. */
export function defaultNotifyStateFilePath(): string {
  return path.join(getConfigDirectory(), SCHEDULER_STATE_FILE);
}

/**
 * Every recorded notification timestamp, as epoch ms keyed by resolved
 * directory. Unreadable, unparseable, or absent state is an empty map, which
 * means "never notified" — the state that always sends.
 */
export function readNotifyTimestamps(
  stateFilePath: string,
): Record<string, number> {
  try {
    const raw = fsSync.readFileSync(stateFilePath, "utf-8"); // internal service state file
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const stamps = (parsed as Record<string, unknown>)[NOTIFY_STATE_KEY];
    if (typeof stamps !== "object" || stamps === null || Array.isArray(stamps)) {
      return {};
    }
    const resolved: Record<string, number> = {};
    for (const [directory, value] of Object.entries(stamps)) {
      if (typeof value !== "string") continue;
      const ms = Date.parse(value);
      if (!Number.isNaN(ms)) resolved[directory] = ms;
    }
    return resolved;
  } catch {
    return {};
  }
}

/**
 * True when this directory notified inside the throttle window.
 *
 * A directory with no recorded timestamp is never throttled: the first
 * notification is always sent, whatever the window, so a wide window cannot
 * mute a directory that has never spoken.
 */
export function isNotifyThrottled(
  stamps: Readonly<Record<string, number>>,
  directory: string,
  throttleMinutes: number,
  now: number,
): boolean {
  const last = stamps[directory];
  if (last === undefined) return false;
  return now - last < throttleMinutes * 60_000;
}

/**
 * Record a notification for one directory, leaving the rest of the state file
 * — including SchedulerStateService's own `directories` — exactly as it was.
 */
export function writeNotifyTimestamp(
  stateFilePath: string,
  directory: string,
  at: Date,
): void {
  let root: Record<string, unknown> = {};
  try {
    const raw = fsSync.readFileSync(stateFilePath, "utf-8"); // internal service state file
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      root = parsed as Record<string, unknown>;
    }
  } catch {
    // No file yet, or one this module cannot read. Start a new object rather
    // than failing: the throttle degrades to "always notify", never to a
    // refusal to organize.
  }

  const existing = root[NOTIFY_STATE_KEY];
  const stamps =
    typeof existing === "object" &&
    existing !== null &&
    !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  stamps[directory] = at.toISOString();
  root[NOTIFY_STATE_KEY] = stamps;

  fsSync.mkdirSync(path.dirname(stateFilePath), { recursive: true });
  fsSync.writeFileSync(stateFilePath, JSON.stringify(root, null, 2), "utf-8");
}

/**
 * Fire the configured command for one pass. Returns what happened instead of
 * throwing: every caller is a pass that has already moved its files, and a
 * broken notification must not turn that into a failed pass.
 */
export async function runNotify(
  request: NotifyRequest,
  deps: NotifyDeps = {},
): Promise<NotifyResult> {
  if (request.moved <= 0) return { sent: false, reason: "nothing-moved" };

  const notify: NotifyConfig | undefined = request.config.notify;
  if (!notify) return { sent: false, reason: "not-configured" };

  const argv =
    typeof notify.command === "string"
      ? tokenizeNotifyCommand(notify.command)
      : null;
  const throttleMinutes = resolveNotifyThrottleMinutes(notify.throttleMinutes);
  if (argv === null || throttleMinutes === null) {
    logger.error(
      "notify.command must be a command line and notify.throttleMinutes a non-negative number; nothing was notified",
    );
    return { sent: false, reason: "invalid-config" };
  }

  const now = deps.now ?? (() => Date.now());
  const stateFilePath = deps.stateFilePath ?? defaultNotifyStateFilePath();
  const directory = path.resolve(request.directory);

  if (
    isNotifyThrottled(
      readNotifyTimestamps(stateFilePath),
      directory,
      throttleMinutes,
      now(),
    )
  ) {
    return { sent: false, reason: "throttled" };
  }

  // Recorded before the spawn, not after. Two passes that both clear the window
  // in the same second must not both notify, and a spawn whose exit status is
  // never read cannot tell us anything to record anyway.
  try {
    writeNotifyTimestamp(stateFilePath, directory, new Date(now()));
  } catch (error) {
    logger.warn(
      `Notification throttle state was not saved: ${sanitizeErrorMessage(
        error instanceof Error ? error.message : String(error),
      )}`,
    );
  }

  const command = argv[0] as string;
  const args = argv.slice(1);

  // shell:false, so `|`, `>` and `&&` in a configured command are arguments to
  // the program named first, not instructions to a shell. A user who wants a
  // pipeline writes `sh -c "..."` and gets exactly that, with no second code
  // path and no shell in between for anything else.
  //
  // The argv is the user's own config value, checked by tokenizeNotifyCommand.
  // No user input from a tool call reaches this spawn.
  const child = (deps.spawnFn ?? spawn)(command, args, {
    stdio: "ignore",
    windowsHide: true,
    // The only way a command learns what moved without a hardcoded path in
    // config.json. A shell would expand $1; with no shell, env is the channel.
    env: {
      ...process.env,
      FOM_NOTIFY_DIRECTORY: directory,
      FOM_NOTIFY_MOVED: String(request.moved),
    },
  });

  child.on("error", (error) => {
    logger.warn(
      `Notification command could not be started: ${sanitizeErrorMessage(
        error.message,
      )}`,
    );
  });
  // Not awaited and not held open. The exit status of a notification cannot
  // change the pass, and a command that hangs must not keep the CLI process
  // alive past its report.
  child.unref();

  return { sent: true, argv };
}

/**
 * Pass entry point: notify if this pass moved files and the directory is not
 * throttled. Never throws — the files have already moved by the time this
 * runs, and organize-pass.ts treats a failed history write as a pass failure
 * but a failed notification as none of the pass's business.
 */
export async function notifyIfMovedFiles(
  request: NotifyRequest,
  deps: NotifyDeps = {},
): Promise<boolean> {
  try {
    const result = await runNotify(request, deps);
    if (!result.sent && result.reason !== undefined) {
      logger.debug(`Notification not sent (${result.reason})`);
    }
    return result.sent;
  } catch (error) {
    logger.warn(
      `Notification failed: ${sanitizeErrorMessage(
        error instanceof Error ? error.message : String(error),
      )}`,
    );
    return false;
  }
}
