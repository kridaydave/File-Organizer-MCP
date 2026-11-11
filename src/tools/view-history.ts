/**
 * File Organizer MCP Server v5.0.0
 * view_history Tool
 *
 * @module tools/view-history
 */

import { z } from "zod";
import type { ToolDefinition, ToolResponse } from "../types.js";
import {
  SearchHistoryInputSchema,
  ViewHistoryInputSchema,
} from "../schemas/system.js";
import { createErrorResponse } from "../utils/error-handler.js";
import type {
  HistoryEntry,
  HistoryResult,
} from "../services/history-logger.service.js";
import {
  createRequestContext,
  type ToolContext,
} from "../mcp/context.js";

export type ViewHistoryInput = z.infer<typeof ViewHistoryInputSchema>;

export const viewHistoryToolDefinition: ToolDefinition = {
  name: "file_organizer_view_history",
  title: "View History",
  description:
    "View the history of file organization operations. Supports filtering by date range, operation type, status, and source. Use privacy_mode to control output detail level.",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "Maximum number of entries to return",
        default: 20,
        minimum: 1,
        maximum: 1000,
      },
      since: {
        type: "string",
        description: "ISO date string - return entries after this time",
      },
      until: {
        type: "string",
        description: "ISO date string - return entries before this time",
      },
      operation: {
        type: "string",
        description: "Filter by operation name",
      },
      status: {
        type: "string",
        enum: ["success", "error", "partial"],
        description: "Filter by operation status",
      },
      source: {
        type: "string",
        enum: ["manual", "scheduled"],
        description: "Filter by operation source",
      },
      privacy_mode: {
        type: "string",
        enum: ["full", "redacted", "none"],
        description:
          "Privacy mode for output: full (all details), redacted (paths hidden), none (minimal info)",
      },
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
    openWorldHint: true,
  },
};

export async function handleViewHistory(
  args: Record<string, unknown>,
  ctx: ToolContext = createRequestContext(),
): Promise<ToolResponse> {
  try {
    const parsed = ViewHistoryInputSchema.safeParse(args);
    if (!parsed.success) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
          },
        ],
        isError: true,
      };
    }

    const {
      limit,
      since,
      until,
      operation,
      status,
      source,
      privacy_mode,
      response_format,
    } = parsed.data;

    const effectivePrivacyMode =
      privacy_mode ?? ctx.config.historyLogging?.privacyMode ?? "full";

    const result = await ctx.history.getHistory({
      limit,
      startDate: since,
      endDate: until,
      operation,
      status,
      source,
      privacyMode: effectivePrivacyMode,
    });

    return renderHistoryResult(result, response_format, limit);
  } catch (error) {
    return createErrorResponse(error);
  }
}

export const searchHistoryToolDefinition: ToolDefinition = {
  name: "file_organizer_search_history",
  title: "Search History",
  description:
    "Search the file organization history. Filter entries by path glob, date range (from/to), operation type, status, or source — all optional and combinable. Entries only match a path_glob when the operation recorded the path it touched.",
  inputSchema: {
    type: "object",
    properties: {
      path_glob: {
        type: "string",
        description:
          "Glob matched against the paths each entry recorded — full path, the same path with / separators, or the bare filename",
      },
      from: {
        type: "string",
        description: "ISO date string - return entries at or after this time",
      },
      to: {
        type: "string",
        description: "ISO date string - return entries at or before this time",
      },
      operation: {
        type: "string",
        description: "Filter by operation name",
      },
      status: {
        type: "string",
        enum: ["success", "error", "partial"],
        description: "Filter by operation status",
      },
      source: {
        type: "string",
        enum: ["manual", "scheduled"],
        description: "Filter by operation source",
      },
      limit: {
        type: "number",
        description: "Maximum number of entries to return",
        default: 20,
        minimum: 1,
        maximum: 1000,
      },
      privacy_mode: {
        type: "string",
        enum: ["full", "redacted", "none"],
        description:
          "Privacy mode for output: full (all details), redacted (paths hidden), none (minimal info)",
      },
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
    openWorldHint: true,
  },
};

export type SearchHistoryInput = z.infer<typeof SearchHistoryInputSchema>;

/**
 * Filtered read over the same history as view_history. Every filter is
 * optional; the ones supplied combine.
 */
export async function handleSearchHistory(
  args: Record<string, unknown>,
  ctx: ToolContext = createRequestContext(),
): Promise<ToolResponse> {
  try {
    const parsed = SearchHistoryInputSchema.safeParse(args);
    if (!parsed.success) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
          },
        ],
        isError: true,
      };
    }

    const {
      path_glob,
      from,
      to,
      operation,
      status,
      source,
      limit,
      privacy_mode,
      response_format,
    } = parsed.data;

    const effectivePrivacyMode =
      privacy_mode ?? ctx.config.historyLogging?.privacyMode ?? "full";

    const result = await ctx.history.searchHistory({
      pathGlob: path_glob,
      startDate: from,
      endDate: to,
      operation,
      status,
      source,
      limit,
      privacyMode: effectivePrivacyMode,
    });

    return renderHistoryResult(result, response_format, limit);
  } catch (error) {
    return createErrorResponse(error);
  }
}

/** Both history tools render the same result the same way. */
function renderHistoryResult(
  result: HistoryResult,
  response_format: "json" | "markdown",
  limit: number,
): ToolResponse {
  if (response_format === "json") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
      structuredContent: result as unknown as Record<string, unknown>,
    };
  }

  if (result.entries.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: "No history entries found matching the specified criteria.",
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: formatHistoryAsMarkdown(
          result.entries,
          result.total,
          result.hasMore,
          limit,
        ),
      },
    ],
  };
}

function formatHistoryAsMarkdown(
  entries: HistoryEntry[],
  total: number,
  hasMore: boolean,
  limit: number,
): string {
  let markdown = "### File Organization History\n\n";

  markdown += `Showing ${entries.length} of ${total} entries`;
  if (hasMore) {
    markdown += ` (use higher limit to see more)`;
  }
  markdown += "\n\n";

  markdown +=
    "| Timestamp | Operation | Source | Status | Duration | Files | Undo Manifest |\n";
  markdown +=
    "|---|---|---|---|---|---|---|\n";

  for (const entry of entries) {
    const timestamp = new Date(entry.timestamp).toLocaleString();
    const duration =
      entry.durationMs < 1000
        ? `${entry.durationMs}ms`
        : `${(entry.durationMs / 1000).toFixed(1)}s`;
    const files = entry.filesProcessed ?? "-";
    const statusEmoji =
      entry.status === "success" ? "✓" : entry.status === "error" ? "✗" : "⚠";
    // The undo handle, rendered as the bare contract string. An entry without
    // one can only be undone as "whatever ran last".
    const manifest = entry.manifestId ? `\`${entry.manifestId}\`` : "-";

    markdown += `| ${timestamp} | ${entry.operation} | ${entry.source} | ${statusEmoji} ${entry.status} | ${duration} | ${files} | ${manifest} |\n`;
  }

  markdown += "\n";

  const undoable = entries.filter((e) => e.manifestId !== undefined);
  if (undoable.length > 0) {
    markdown +=
      "Pass an id from the Undo Manifest column to `undo_last_operation` to undo that specific operation.\n\n";
  }

  const errorEntries = entries.filter(
    (e) => e.status === "error" || e.status === "partial",
  );
  if (errorEntries.length > 0) {
    markdown += "### Errors\n\n";
    for (const entry of errorEntries) {
      markdown += `**${entry.operation}** (${new Date(entry.timestamp).toLocaleString()})\n`;
      if (entry.error?.message) {
        markdown += `- Error: ${entry.error.message}\n`;
      }
      if (entry.details) {
        markdown += `- Details: ${entry.details}\n`;
      }
      markdown += "\n";
    }
  }

  return markdown;
}
