/**
 * File Organizer MCP Server v5.0.0
 * Auto-Organize Scheduler Service
 *
 * Smart scheduling with cron-based per-directory configuration.
 * The sweep itself is the shared pass in organize-pass.ts; this file owns the
 * timer, the catchup decision, and the per-directory tuning it supplies.
 * Includes smart catchup for missed schedules.
 */

import cron, { type ScheduledTask } from "node-cron";
import { existsSync } from "fs";
import {
  loadUserConfig,
  type UserConfig,
  type WatchConfig,
} from "../../config.js";
import { logger } from "../../utils/logger.js";
import { SchedulerStateService } from "./scheduler-state.service.js";
import { shouldCatchup } from "../../utils/cron-utils.js";
import { validateStrictPath } from "../../services/path-validator.service.js";
import { runOrganizePass } from "./organize-pass.js";
import { historyLogger } from "../../services/history-logger.service.js";

export type ConfigLoader = () => UserConfig;

/**
 * How long a file must have sat still before a sweep will touch it. A file
 * still being written to is half a file, and organizing it moves the half.
 */
const DEFAULT_MIN_FILE_AGE_MINUTES = 60;

/**
 * Ceiling on one pass, so a folder that accumulated a thousand files overnight
 * does not turn one tick into a thousand moves. The rest wait for the next one.
 */
const DEFAULT_MAX_FILES_PER_RUN = 300;

/**
 * Auto-Organize Scheduler Service
 * Manages cron-based scheduled tasks for multiple directories
 */
export class AutoOrganizeService {
  private tasks: Map<string, ScheduledTask> = new Map();
  /**
   * Directories with a pass in flight, counted rather than flagged. A Set would
   * under-report: two passes over one directory collapse to a single entry, and
   * the second one's `finally` would clear the flag while the first is still
   * moving files. Purely a report — `getStatus` surfaces it so a caller can see
   * that a tick is still running. It does not gate anything.
   */
  private inFlight: Map<string, number> = new Map();
  private stateService: SchedulerStateService | null = null;
  private missedSchedulesLock: Promise<void> | null = null;

  constructor(
    private configLoader: () => UserConfig = () => loadUserConfig(),
    stateService?: SchedulerStateService,
    /**
     * The sweep. Injectable so a test can assert the options the daemon hands
     * it without standing up a filesystem; defaults to the real pass.
     */
    private pass: typeof runOrganizePass = runOrganizePass,
  ) {
    this.stateService = stateService || null;
  }

  /**
   * Initialize the scheduler state service
   * Must be called before using smart catchup features
   */
  async initialize(): Promise<void> {
    if (!this.stateService) {
      const { getSchedulerStateService } =
        await import("./scheduler-state.service.js");
      this.stateService = await getSchedulerStateService();
    }
  }

  /**
   * Start the auto-organize scheduler
   * Loads watch list from config and creates cron tasks
   * @returns Result object with success status, task count, and any errors
   */
  async start(): Promise<{
    success: boolean;
    taskCount: number;
    errors: string[];
  }> {
    const errors: string[] = [];

    if (this.tasks.size > 0) {
      const msg = "Auto-organize scheduler already running";
      logger.warn(msg);
      return { success: true, taskCount: this.tasks.size, errors: [msg] };
    }

    logger.info("Starting smart auto-organize scheduler...");

    const result = this.reloadTasks();
    errors.push(...result.errors);

    if (result.taskCount === 0 && result.errors.length === 0) {
      const noTasksMsg = "No directories configured for auto-organize";
      logger.info(noTasksMsg);
      errors.push(noTasksMsg);
    }

    if (result.taskCount > 0) {
      logger.info(`Started ${result.taskCount} scheduled task(s)`);
      try {
        await this.runMissedSchedules();
      } catch (error: unknown) {
        const errorMsg = `Initial catchup failed: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    return {
      success: result.taskCount > 0 || result.errors.length === 0,
      taskCount: result.taskCount,
      errors,
    };
  }

  /**
   * Stop all scheduled tasks
   */
  stop(): void {
    try {
      for (const [directory, task] of this.tasks) {
        task.stop();
        logger.debug(`Stopped task for: ${directory}`);
      }
    } catch (error) {
      logger.error("Error stopping auto-organize tasks:", error);
    } finally {
      this.tasks.clear();
      // Cleared because stop() means "nothing is running here now". A pass
      // already in flight finishes on its own and decrements the counter, so
      // this only stops getStatus from reporting a directory that the daemon
      // has already shut down.
      this.inFlight.clear();
      logger.info("Auto-organize scheduler stopped");
    }
  }

  /**
   * Reload tasks from config (useful when config changes)
   * @returns Result object with task count and any errors encountered
   */
  reloadTasks(): { taskCount: number; errors: string[] } {
    const errors: string[] = [];

    // Stop existing tasks
    for (const task of this.tasks.values()) {
      task.stop();
    }
    this.tasks.clear();

    const userConfig = this.configLoader();

    // Load watch list
    const watchList = userConfig.watchList ?? [];

    // Also support legacy autoOrganize config for backward compatibility
    if (userConfig.autoOrganize?.enabled && userConfig.autoOrganize.schedule) {
      const legacyFolders = userConfig.customAllowedDirectories ?? [];
      const legacyCron = this.legacyScheduleToCron(
        userConfig.autoOrganize.schedule,
      );

      for (const folder of legacyFolders) {
        // Skip if already in watch list
        if (watchList.some((w) => w.directory === folder)) continue;

        watchList.push({
          directory: folder,
          schedule: legacyCron,
          rules: {
            auto_organize: true,
          },
        });
      }
    }

    // Create cron tasks for each watch config
    for (const watch of watchList) {
      if (!watch.rules.auto_organize) continue;

      try {
        if (!existsSync(watch.directory)) {
          const errorMsg = `Directory does not exist: ${watch.directory}`;
          logger.error(errorMsg);
          errors.push(errorMsg);
          continue;
        }
      } catch (error) {
        const errorMsg = `Cannot access directory ${watch.directory}: ${error}`;
        logger.error(errorMsg);
        errors.push(errorMsg);
        continue;
      }

      if (!cron.validate(watch.schedule)) {
        const errorMsg = `Invalid cron expression "${watch.schedule}" for ${watch.directory}. Use format like "0 9 * * *" (daily at 9am) or "0 * * * *" (hourly)`;
        logger.error(errorMsg);
        errors.push(errorMsg);
        continue;
      }

      try {
        // A tick that fires while the previous one is still moving files would
        // have both passes plan the same sources and race on the same
        // destinations. Different directories still run in parallel; this only
        // stops one watch from overlapping itself.
        const task = cron.schedule(
          watch.schedule,
          async () => {
            const maxRetries = 3;
            let attempt = 0;
            while (attempt < maxRetries) {
              try {
                await this.runOrganization(watch);
                break;
              } catch (error) {
                attempt++;
                if (attempt >= maxRetries) {
                  logger.error(
                    `Cron job failed for ${watch.directory} after ${maxRetries} attempts: ${error}`,
                  );
                } else {
                  logger.warn(
                    `Cron job failed for ${watch.directory}, retrying (attempt ${attempt}/${maxRetries}): ${error}`,
                  );
                  await new Promise((resolve) =>
                    setTimeout(resolve, 1000 * attempt),
                  );
                }
              }
            }
          },
          { noOverlap: true },
        );

        this.tasks.set(watch.directory, task);
        logger.info(
          `Scheduled "${watch.directory}" with cron: ${watch.schedule}`,
        );
      } catch (error) {
        const errorMsg = `Failed to schedule task for ${watch.directory}: ${error}`;
        logger.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    return { taskCount: this.tasks.size, errors };
  }

  /**
   * Check if scheduler is currently running
   */
  isActive(): boolean {
    return this.tasks.size > 0;
  }

  /**
   * Get the number of active tasks
   */
  getTaskCount(): number {
    return this.tasks.size;
  }

  /**
   * Get list of watched directories
   */
  getWatchedDirectories(): string[] {
    return Array.from(this.tasks.keys());
  }

  /**
   * Run one scheduled pass over a watched directory.
   *
   * Delegates to the shared pass, so a daemon sweep and a cron `--once` run the
   * same code, write the same history row, and leave the same rollback handle.
   * @param watch - Watch configuration containing directory and rules
   * @see startAutoOrganizeScheduler() - For starting all scheduled tasks
   * @see triggerNow() - For manually triggering a single directory
   * @see getStatus() - For checking which directories are mid-pass
   * @returns Promise<void>
   */
  private async runOrganization(watch: WatchConfig): Promise<void> {
    const { directory, rules } = watch;

    // Validate directory path before scanning and organizing
    const validatedDirectory = await validateStrictPath(directory);
    logger.info(`[${validatedDirectory}] Starting scheduled organization`);

    this.inFlight.set(
      validatedDirectory,
      (this.inFlight.get(validatedDirectory) ?? 0) + 1,
    );
    try {
      const result = await this.pass(
        {
          directory: validatedDirectory,
          // A scheduled pass exists to move files. The pass default is dry run
          // so a bare `--once` writes nothing; the daemon is the one caller
          // that always means apply.
          dryRun: false,
          // A cron tick, a catchup, and a manual trigger are all a schedule
          // being honoured rather than a person asking, and a process cannot
          // detect which one it is.
          source: "scheduled",
          minFileAgeMinutes: rules.min_file_age_minutes ?? DEFAULT_MIN_FILE_AGE_MINUTES,
          maxFiles: rules.max_files_per_run ?? DEFAULT_MAX_FILES_PER_RUN,
        },
        { config: this.configLoader(), history: historyLogger },
      );

      if (result.moved > 0) {
        logger.info(`[${validatedDirectory}] Moved ${result.moved} files`, {
          // scanned is pre-filter, so it stays visible here: without it a
          // sweep that held every file as too fresh is indistinguishable from
          // a sweep over an empty folder.
          scanned: result.scanned,
          planned: result.planned,
          skipped: result.skipped,
          statistics: result.statistics,
        });
      } else {
        logger.debug(
          `[${validatedDirectory}] Nothing to move (${result.scanned} scanned)`,
        );
      }

      if (result.errors.length > 0) {
        logger.warn(
          `[${validatedDirectory}] Had ${result.errors.length} errors`,
          result.errors,
        );
      }

      // Record successful run time for smart catchup
      if (this.stateService) {
        try {
          await this.stateService.setLastRunTime(
            validatedDirectory,
            new Date(),
            watch.schedule,
          );
          logger.debug(`[${validatedDirectory}] Recorded successful run time`);
        } catch (error) {
          logger.warn(`[${validatedDirectory}] Failed to record run time:`, {
            error: String(error),
          });
        }
      }
    } catch (error) {
      logger.error(`[${validatedDirectory}] Organization failed:`, error);
      throw error;
    } finally {
      const remaining = (this.inFlight.get(validatedDirectory) ?? 1) - 1;
      if (remaining > 0) {
        this.inFlight.set(validatedDirectory, remaining);
      } else {
        this.inFlight.delete(validatedDirectory);
      }
    }
  }

  /**
   * Convert legacy schedule ('hourly' | 'daily' | 'weekly') to cron expression
   */
  private legacyScheduleToCron(
    schedule: "hourly" | "daily" | "weekly",
  ): string {
    switch (schedule) {
      case "hourly":
        return "0 * * * *"; // At minute 0 of every hour
      case "daily":
        return "0 9 * * *"; // At 9:00 AM every day
      case "weekly":
        return "0 9 * * 0"; // At 9:00 AM every Sunday
      default:
        return "0 9 * * *";
    }
  }

  /**
   * Get scheduler status for monitoring
   */
  getStatus(): {
    active: boolean;
    taskCount: number;
    watchedDirectories: string[];
    runningDirectories: string[];
  } {
    return {
      active: this.isActive(),
      taskCount: this.getTaskCount(),
      watchedDirectories: this.getWatchedDirectories(),
      runningDirectories: Array.from(this.inFlight.keys()),
    };
  }

  /**
   * Manually trigger organization for a directory
   */
  async triggerNow(directory: string): Promise<boolean> {
    const userConfig = this.configLoader();
    const watch = userConfig.watchList?.find((w) => w.directory === directory);

    if (!watch) {
      logger.error(`Directory not in watch list: ${directory}`);
      return false;
    }

    await this.runOrganization(watch);
    return true;
  }

  /**
   * Check if a watch should be included in catchup checks
   * Returns true if the watch has auto_organize enabled
   */
  private shouldIncludeInCatchupCheck(watch: WatchConfig): boolean {
    return watch.rules?.auto_organize === true;
  }

  /**
   * Determine if a directory should run on startup based on catchup_mode and smart logic
   * @param watch - The watch configuration
   * @param lastRunTime - The last successful run time (null if never ran)
   * @returns true if catchup should run
   */
  private async shouldRunOnStartup(
    watch: WatchConfig,
    lastRunTime: Date | null,
  ): Promise<boolean> {
    const catchupMode = watch.rules?.catchup_mode ?? "smart";

    // 'never' mode: never run catchup
    if (catchupMode === "never") {
      logger.debug(`[${watch.directory}] Catchup mode is 'never', skipping`);
      return false;
    }

    // 'always' mode: always run on startup
    if (catchupMode === "always") {
      logger.debug(`[${watch.directory}] Catchup mode is 'always', running`);
      return true;
    }

    // 'smart' mode: only run if schedule was missed
    const needsCatchup = shouldCatchup(watch.schedule, lastRunTime, new Date());
    logger.debug(
      `[${watch.directory}] Smart catchup check: lastRun=${lastRunTime?.toISOString() ?? "never"}, needsCatchup=${needsCatchup}`,
    );
    return needsCatchup;
  }

  /**
   * Run missed schedules for all configured watches on startup
   * Uses smart catchup logic based on catchup_mode setting
   * Does not block server startup - runs in background with concurrency control
   */
  async runMissedSchedules(): Promise<void> {
    // Prevent overlapping executions of runMissedSchedules
    // Wait for any existing operation to complete (async-safe lock)
    while (this.missedSchedulesLock) {
      await this.missedSchedulesLock;
    }

    // Create lock for this operation
    let releaseLock: () => void;
    this.missedSchedulesLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    try {
      await this._runMissedSchedulesInternal();
    } finally {
      this.missedSchedulesLock = null;
      releaseLock!();
    }
  }

  private async _runMissedSchedulesInternal(): Promise<void> {
    // Ensure state service is initialized
    if (!this.stateService) {
      try {
        await this.initialize();
      } catch (error) {
        logger.error(
          "Failed to initialize state service for smart catchup:",
          error,
        );
        // Fall back to legacy behavior - run all watches
        logger.warn(
          "Falling back to legacy catchup behavior (running all watches)",
        );
      }
    }

    const userConfig = this.configLoader();
    const watchList = userConfig.watchList ?? [];

    // Filter watches that should be considered for catchup
    const watchesToCheck = watchList.filter((watch) =>
      this.shouldIncludeInCatchupCheck(watch),
    );

    if (watchesToCheck.length === 0) {
      logger.debug("No watches configured for auto-organize");
      return;
    }

    logger.info(
      `Checking missed schedules for ${watchesToCheck.length} directory(ies)...`,
    );

    // Determine which watches actually need to run
    const watchesToRun: WatchConfig[] = [];

    for (const watch of watchesToCheck) {
      const directory = watch.directory;

      try {
        // Check if directory exists
        if (!existsSync(directory)) {
          logger.warn(
            `[${directory}] Directory does not exist, skipping catchup`,
          );
          continue;
        }

        // Get last run time from state
        const lastRunTime =
          this.stateService?.getLastRunTime(directory) ?? null;

        // Check if catchup is needed
        const shouldRun = await this.shouldRunOnStartup(watch, lastRunTime);

        if (shouldRun) {
          watchesToRun.push(watch);
        } else {
          logger.info(`[${directory}] No catchup needed (schedule not missed)`);
        }
      } catch (error) {
        logger.error(`[${directory}] Error checking catchup status:`, error);
        // On error, include the watch to be safe
        watchesToRun.push(watch);
      }
    }

    if (watchesToRun.length === 0) {
      logger.info("No directories need catchup");
      return;
    }

    logger.info(`Running catchup for ${watchesToRun.length} directory(ies)...`);

    for (const watch of watchesToRun) {
      const directory = watch.directory;

      try {
        logger.info(`[${directory}] Running missed schedule catch-up`);
        await this.runOrganization(watch);
      } catch (error) {
        logger.error(`[${directory}] Missed schedule catch-up failed:`, error);
      }
    }
  }
}

// Singleton instance for the application
let globalScheduler: AutoOrganizeService | null = null;

/**
 * Initialize and start the global auto-organize scheduler
 * @returns Result object with success status, task count, and any errors
 */
export async function startAutoOrganizeScheduler(): Promise<{
  success: boolean;
  taskCount: number;
  errors: string[];
}> {
  if (!globalScheduler) {
    globalScheduler = new AutoOrganizeService();
    // Initialize state service for smart catchup
    await globalScheduler.initialize();
  }
  return globalScheduler.start();
}

/**
 * Stop the global auto-organize scheduler
 */
export function stopAutoOrganizeScheduler(): void {
  if (globalScheduler) {
    globalScheduler.stop();
  }
}
