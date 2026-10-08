/**
 * File Organizer MCP Server v5.0.0
 * Watch Tool Zod Schemas
 *
 * @module schemas/watch
 */

import { z } from "zod";
import { CommonParamsSchema } from "../../schemas/common.js";

export const WatchDirectoryInputSchema = z
  .object({
    directory: z
      .string()
      .min(1, "Directory path cannot be empty")
      .describe("Full path to the directory to watch"),
    schedule: z
      .string()
      .min(1, "Schedule cannot be empty")
      .describe(
        'Cron expression (e.g., "0 9 * * *" for 9am daily, "*/30 * * * *" for every 30 min)',
      ),
    auto_organize: z
      .boolean()
      .default(true)
      .describe("Enable auto-organization on this schedule"),
    min_file_age_minutes: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "Minimum file age in minutes before organizing (prevents organizing files being written)",
      ),
    max_files_per_run: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Maximum files to process per run"),
  })
  .merge(CommonParamsSchema);

export type WatchDirectoryInput = z.infer<typeof WatchDirectoryInputSchema>;

export const UnwatchDirectoryInputSchema = z
  .object({
    directory: z
      .string()
      .min(1, "Directory path cannot be empty")
      .describe("Full path to the directory to remove from watch list"),
  })
  .merge(CommonParamsSchema);

export type UnwatchDirectoryInput = z.infer<typeof UnwatchDirectoryInputSchema>;

export const ListWatchesInputSchema = z.object({}).merge(CommonParamsSchema);

export type ListWatchesInput = z.infer<typeof ListWatchesInputSchema>;

/**
 * The `trigger` a pass records on its history row, as the `once` CLI accepts it.
 *
 * A process cannot detect that cron started it, so the caller asserts it and
 * this schema is where the assertion is checked. Same two values as
 * HistoryEntry.source (`src/services/history-logger.service.ts:23`), reused
 * deliberately: a third value would have to be threaded through both history
 * filter schemas and every consumer that reads the field.
 */
export const OnceSourceSchema = z.enum(["manual", "scheduled"]);

export type OnceSource = z.infer<typeof OnceSourceSchema>;
