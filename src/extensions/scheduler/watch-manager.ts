/**
 * File Organizer MCP Server v3.5.0
 * Watch Manager
 *
 * Watch-list management extracted from the former watch tools. The stdio MCP
 * server no longer registers watch tools — scheduled organization lives in
 * its own process (`bin/file-organizer-watch.mjs`). These functions back that
 * CLI's add/remove/list subcommands and keep the same result shapes the old
 * tool handlers returned, so tests re-point without churn.
 */

import cron from "node-cron";
import type { ToolResponse } from "../../types.js";
import { validateStrictPath } from "../../services/path-validator.service.js";
import {
  loadUserConfig,
  updateUserConfig,
  type WatchConfig,
} from "../../config.js";
import { createErrorResponse } from "../../utils/error-handler.js";
import {
  WatchDirectoryInputSchema,
  UnwatchDirectoryInputSchema,
  ListWatchesInputSchema,
} from "./watch.schemas.js";

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

Run \`file-organizer-watch\` to start (or restart) the watcher with this configuration.`;

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
          text: `Removed "${directory}" from watch list.`,
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
            text: "No directories are currently being watched. Use `file-organizer-watch add <directory> <cron>` to add one.",
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
