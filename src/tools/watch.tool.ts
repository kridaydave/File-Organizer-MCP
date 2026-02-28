/**
 * File Organizer MCP Server v3.4.1
 * Watch Directory Tool
 *
 * @module tools/watch
 */

import { z } from "zod";
import cron from "node-cron";
import type { ToolDefinition, ToolResponse } from "../types.js";
import { validateStrictPath } from "../services/path-validator.service.js";
import {
  loadUserConfig,
  updateUserConfig,
  type WatchConfig,
} from "../config.js";
import { reloadAutoOrganizeScheduler } from "../services/auto-organize.service.js";
import { createErrorResponse } from "../utils/error-handler.js";
import { CommonParamsSchema } from "../schemas/common.schemas.js";

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

export const watchDirectoryToolDefinition: ToolDefinition = {
  name: "file_organizer_watch_directory",
  title: "Watch Directory",
  description:
    "Add a directory to the watch list with a cron-based schedule for automatic organization. " +
    'When the user specifies a schedule in natural language (e.g., "every day at 10am"), ' +
    'convert it to a standard cron expression. Cron format: "minute hour day month weekday". ' +
    'Common conversions: "every day at 10am" → "0 10 * * *", "every 30 minutes" → "*/30 * * * *", ' +
    '"every Monday at 9am" → "0 9 * * 1", "every hour" → "0 * * * *".',
  inputSchema: {
    type: "object",
    properties: {
      directory: {
        type: "string",
        description:
          'Full path to the directory to watch (e.g., "C:\\Users\\John\\Desktop\\Work-Notes")',
      },
      schedule: {
        type: "string",
        description:
          'Cron expression. Convert natural language to cron: "every day at 10am" → "0 10 * * *", "every 30 minutes" → "*/30 * * * *", "every Monday at 9am" → "0 9 * * 1", "every hour" → "0 * * * *", "daily at midnight" → "0 0 * * *"',
      },
      auto_organize: {
        type: "boolean",
        description: "Enable auto-organization",
        default: true,
      },
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        default: "markdown",
      },
      min_file_age_minutes: {
        type: "number",
        description: "Minimum file age in minutes before organizing",
        minimum: 0,
      },
      max_files_per_run: {
        type: "number",
        description: "Maximum files to process per run",
        minimum: 1,
      },
    },
    required: ["directory", "schedule"],
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

/**
 * Remove a directory from the watch list
 */
export const UnwatchDirectoryInputSchema = z
  .object({
    directory: z
      .string()
      .min(1, "Directory path cannot be empty")
      .describe("Full path to the directory to remove from watch list"),
  })
  .merge(CommonParamsSchema);

export type UnwatchDirectoryInput = z.infer<typeof UnwatchDirectoryInputSchema>;

export const unwatchDirectoryToolDefinition: ToolDefinition = {
  name: "file_organizer_unwatch_directory",
  title: "Unwatch Directory",
  description: "Remove a directory from the watch list.",
  inputSchema: {
    type: "object",
    properties: {
      directory: { type: "string", description: "Full path to the directory" },
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        default: "markdown",
      },
    },
    required: ["directory"],
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

/**
 * List all watched directories
 */
export const ListWatchesInputSchema = z.object({}).merge(CommonParamsSchema);

export type ListWatchesInput = z.infer<typeof ListWatchesInputSchema>;

export const listWatchesToolDefinition: ToolDefinition = {
  name: "file_organizer_list_watches",
  title: "List Watched Directories",
  description:
    "List all directories currently being watched with their schedules.",
  inputSchema: {
    type: "object",
    properties: {
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        default: "markdown",
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

export async function handleWatchDirectory(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = WatchDirectoryInputSchema.safeParse(args);
    if (!parsed.success) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
          },
        ],
      };
    }

    const {
      directory,
      schedule,
      auto_organize,
      min_file_age_minutes,
      max_files_per_run,
      response_format,
    } = parsed.data;

    // Validate directory path
    const validatedPath = await validateStrictPath(directory);

    // Validate cron expression
    if (!cron.validate(schedule)) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Invalid cron expression "${schedule}". Use standard cron syntax (e.g., "0 9 * * *" for daily at 9am).`,
          },
        ],
        isError: true,
      };
    }

    // Build watch config
    const watchConfig: WatchConfig = {
      directory: validatedPath,
      schedule,
      rules: {
        auto_organize,
        ...(min_file_age_minutes !== undefined && { min_file_age_minutes }),
        ...(max_files_per_run !== undefined && { max_files_per_run }),
      },
    };

    // Load existing config
    const userConfig = loadUserConfig();
    const watchList = userConfig.watchList ?? [];

    // Check if directory already exists in watch list
    const existingIndex = watchList.findIndex(
      (w) => w.directory === validatedPath,
    );

    if (existingIndex >= 0) {
      // Update existing watch
      watchList[existingIndex] = watchConfig;
    } else {
      // Add new watch
      watchList.push(watchConfig);
    }

    // Save config
    updateUserConfig({ watchList });

    // Reload scheduler to pick up changes
    reloadAutoOrganizeScheduler();

    const action = existingIndex >= 0 ? "Updated" : "Added";
    const result = {
      success: true,
      action,
      directory: validatedPath,
      schedule,
      rules: watchConfig.rules,
    };

    if (response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }

    const markdown = `### ${action} Watch for \`${validatedPath}\`

**Schedule:** ${schedule}
**Auto-organize:** ${auto_organize ? "Enabled" : "Disabled"}
${min_file_age_minutes !== undefined ? `**Min File Age:** ${min_file_age_minutes} minutes` : ""}
${max_files_per_run !== undefined ? `**Max Files Per Run:** ${max_files_per_run}` : ""}

The scheduler has been reloaded with the new configuration.`;

    return {
      content: [{ type: "text", text: markdown }],
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleUnwatchDirectory(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = UnwatchDirectoryInputSchema.safeParse(args);
    if (!parsed.success) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
          },
        ],
      };
    }

    const { directory, response_format } = parsed.data;

    // Load existing config
    const userConfig = loadUserConfig();
    let watchList = userConfig.watchList ?? [];

    // Find and remove the watch
    const initialCount = watchList.length;
    watchList = watchList.filter((w) => w.directory !== directory);

    if (watchList.length === initialCount) {
      return {
        content: [
          {
            type: "text",
            text: `Directory "${directory}" was not in the watch list.`,
          },
        ],
        isError: true,
      };
    }

    // Save config
    updateUserConfig({ watchList });

    // Reload scheduler
    reloadAutoOrganizeScheduler();

    const result = {
      success: true,
      action: "Removed",
      directory,
    };

    if (response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Removed "${directory}" from watch list. The scheduler has been updated.`,
        },
      ],
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleListWatches(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = ListWatchesInputSchema.safeParse(args);
    if (!parsed.success) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
          },
        ],
      };
    }

    const { response_format } = parsed.data;

    // Load config
    const userConfig = loadUserConfig();
    const watchList = userConfig.watchList ?? [];

    const result = {
      count: watchList.length,
      watches: watchList.map((w) => ({
        directory: w.directory,
        schedule: w.schedule,
        rules: w.rules,
      })),
    };

    if (response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }

    if (watchList.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No directories are currently being watched. Use `file_organizer_watch_directory` to add one.",
          },
        ],
      };
    }

    const markdown = `### Watched Directories (${watchList.length})

${watchList
  .map(
    (w, i) => `${i + 1}. **${w.directory}**
   - Schedule: \`${w.schedule}\`
   - Auto-organize: ${w.rules.auto_organize ? "✓" : "✗"}
   ${w.rules.min_file_age_minutes !== undefined ? `- Min file age: ${w.rules.min_file_age_minutes} min` : ""}
   ${w.rules.max_files_per_run !== undefined ? `- Max files/run: ${w.rules.max_files_per_run}` : ""}`,
  )
  .join("\n\n")}`;

    return {
      content: [{ type: "text", text: markdown }],
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}
