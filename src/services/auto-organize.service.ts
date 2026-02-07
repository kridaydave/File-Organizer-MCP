/**
 * File Organizer MCP Server v3.1.3
 * Auto-Organize Scheduler Service
 *
 * Smart scheduling with cron-based per-directory configuration.
 * Supports min_file_age filtering and batch limits.
 */

import cron from 'node-cron';
import fs, { existsSync } from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { FileScannerService } from './file-scanner.service.js';
import { OrganizerService } from './organizer.service.js';
import { loadUserConfig, type UserConfig, type WatchConfig } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * Auto-Organize Scheduler Service
 * Manages cron-based scheduled tasks for multiple directories
 */
export class AutoOrganizeService {
  private tasks: Map<string, cron.ScheduledTask> = new Map();
  private isRunning = false;
  private runningDirectories: Set<string> = new Set();

  constructor(
    private scanner = new FileScannerService(),
    private organizer = new OrganizerService()
  ) { }

  /**
   * Start the auto-organize scheduler
   * Loads watch list from config and creates cron tasks
   * @returns Result object with success status, task count, and any errors
   */
  start(): { success: boolean; taskCount: number; errors: string[] } {
    const errors: string[] = [];

    if (this.tasks.size > 0) {
      const msg = 'Auto-organize scheduler already running';
      logger.warn(msg);
      return { success: true, taskCount: this.tasks.size, errors: [msg] };
    }

    logger.info('Starting smart auto-organize scheduler...');

    const result = this.reloadTasks();
    errors.push(...result.errors);

    if (result.taskCount === 0 && result.errors.length === 0) {
      const noTasksMsg = 'No directories configured for auto-organize';
      logger.info(noTasksMsg);
      errors.push(noTasksMsg);
    }

    if (result.taskCount > 0) {
      logger.info(`Started ${result.taskCount} scheduled task(s)`);
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
      logger.error('Error stopping auto-organize tasks:', error);
    } finally {
      this.tasks.clear();
      this.runningDirectories.clear();
      logger.info('Auto-organize scheduler stopped');
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

    const userConfig = loadUserConfig();

    // Load watch list
    const watchList = userConfig.watchList ?? [];

    // Also support legacy autoOrganize config for backward compatibility
    if (userConfig.autoOrganize?.enabled && userConfig.autoOrganize.schedule) {
      const legacyFolders = userConfig.customAllowedDirectories ?? [];
      const legacyCron = this.legacyScheduleToCron(userConfig.autoOrganize.schedule);

      for (const folder of legacyFolders) {
        // Skip if already in watch list
        if (watchList.some(w => w.directory === folder)) continue;

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
        const task = cron.schedule(watch.schedule, async () => {
          await this.runOrganization(watch);
        });

        this.tasks.set(watch.directory, task);
        logger.info(`Scheduled "${watch.directory}" with cron: ${watch.schedule}`);
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
   * Run organization for a specific watch config
   */
  private async runOrganization(watch: WatchConfig): Promise<void> {
    const { directory, rules } = watch;

    // Prevent concurrent runs for the same directory
    if (this.runningDirectories.has(directory)) {
      logger.warn(`Previous run still active for ${directory}, skipping this cycle`);
      return;
    }

    this.runningDirectories.add(directory);
    logger.info(`[${directory}] Starting scheduled organization`);

    try {
      // Get all files
      let files = await this.scanner.getAllFiles(directory, false);

      if (files.length === 0) {
        logger.debug(`[${directory}] No files to organize`);
        return;
      }

      logger.info(`[${directory}] Found ${files.length} files`);

      // Apply min_file_age filter if configured
      if (rules.min_file_age_minutes && rules.min_file_age_minutes > 0) {
        files = await this.filterByAge(files, rules.min_file_age_minutes);
        logger.info(`[${directory}] ${files.length} files meet age requirement (${rules.min_file_age_minutes} min)`);
      }

      if (files.length === 0) {
        logger.debug(`[${directory}] No files meet criteria after filtering`);
        return;
      }

      // Apply max_files_per_run limit if configured
      const originalCount = files.length;
      if (rules.max_files_per_run && rules.max_files_per_run > 0 && files.length > rules.max_files_per_run) {
        files = files.slice(0, rules.max_files_per_run);
        logger.info(`[${directory}] Limited to ${files.length} files (from ${originalCount}) due to max_files_per_run`);
      }

      // Get conflict strategy from config
      const userConfig = loadUserConfig();
      const conflictStrategy = userConfig.conflictStrategy ?? 'rename';

      // Run organization
      const result = await this.organizer.organize(directory, files, {
        dryRun: false,
        conflictStrategy,
      });

      const totalMoved = Object.values(result.statistics).reduce((a, b) => a + b, 0);
      logger.info(`[${directory}] Organized ${totalMoved} files`, {
        statistics: result.statistics,
        errors: result.errors.length,
      });

      if (result.errors.length > 0) {
        logger.warn(`[${directory}] Had ${result.errors.length} errors`, result.errors);
      }

    } catch (error) {
      logger.error(`[${directory}] Organization failed:`, error);
    } finally {
      this.runningDirectories.delete(directory);
    }
  }

  /**
   * Filter files by minimum age
   */
  private async filterByAge(
    files: Array<{ path: string; name: string; size: number }>,
    minAgeMinutes: number
  ): Promise<Array<{ path: string; name: string; size: number }>> {
    const now = Date.now();
    const minAgeMs = minAgeMinutes * 60 * 1000;
    const filtered: Array<{ path: string; name: string; size: number }> = [];

    for (const file of files) {
      try {
        const stats = await fsPromises.stat(file.path);
        const fileAge = now - stats.mtime.getTime();

        if (fileAge >= minAgeMs) {
          filtered.push(file);
        }
      } catch (error) {
        logger.warn(`Could not stat file ${file.path}`, { error: String(error) });
        // Include file if we can't determine age (safer to process it)
        filtered.push(file);
      }
    }

    return filtered;
  }

  /**
   * Convert legacy schedule ('hourly' | 'daily' | 'weekly') to cron expression
   */
  private legacyScheduleToCron(schedule: 'hourly' | 'daily' | 'weekly'): string {
    switch (schedule) {
      case 'hourly':
        return '0 * * * *'; // At minute 0 of every hour
      case 'daily':
        return '0 9 * * *'; // At 9:00 AM every day
      case 'weekly':
        return '0 9 * * 0'; // At 9:00 AM every Sunday
      default:
        return '0 9 * * *';
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
      runningDirectories: Array.from(this.runningDirectories),
    };
  }

  /**
   * Manually trigger organization for a directory
   */
  async triggerNow(directory: string): Promise<boolean> {
    const userConfig = loadUserConfig();
    const watch = userConfig.watchList?.find(w => w.directory === directory);

    if (!watch) {
      logger.error(`Directory not in watch list: ${directory}`);
      return false;
    }

    await this.runOrganization(watch);
    return true;
  }
}

// Singleton instance for the application
let globalScheduler: AutoOrganizeService | null = null;

/**
 * Initialize and start the global auto-organize scheduler
 * @returns Result object with success status, task count, and any errors
 */
export function startAutoOrganizeScheduler(): { success: boolean; taskCount: number; errors: string[] } {
  if (!globalScheduler) {
    globalScheduler = new AutoOrganizeService();
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

/**
 * Reload the global scheduler tasks
 */
export function reloadAutoOrganizeScheduler(): void {
  if (globalScheduler) {
    globalScheduler.reloadTasks();
  }
}

/**
 * Get the global scheduler instance
 */
export function getAutoOrganizeScheduler(): AutoOrganizeService | null {
  return globalScheduler;
}
