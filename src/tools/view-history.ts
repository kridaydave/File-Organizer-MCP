/**
 * File Organizer MCP Server v3.4.1
 * view_history Tool
 *
 * @module tools/view-history
 */

import { z } from "zod";
import type { ToolDefinition, ToolResponse } from "../types.js";
import { historyLogger } from "../services/history-logger.service.js";
import { CommonParamsSchema } from "../schemas/common.schemas.js";
import { loadUserConfig } from "../config.js";
import { createErrorResponse } from "../utils/error-handler.js";

const ViewHistoryInputSchema = z
  .object({
    limit: z
      .number()
      .min(1)
      .max(1000)
      .optional()
      .default(20)
      .describe("Maximum number of entries to return"),
    since: z
      .string()
      .optional()
      .describe("ISO date string - return entries after this time"),
    until: z
      .string()
      .optional()
      .describe("ISO date string - return entries before this time"),
    operation: z.string().optional().describe("Filter by operation name"),
    status: z
      .enum(["success", "error", "partial"])
      .optional()
      .describe("Filter by operation status"),
    source: z
      .enum(["manual", "scheduled"])
      .optional()
      .describe("Filter by operation source"),
    privacy_mode: z
      .enum(["full", "redacted", "none"])
      .optional()
      .describe(
        "Privacy mode for output: full (all details), redacted (paths hidden), none (minimal info)",
      ),
  })
  .merge(CommonParamsSchema);

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
  },
};

export async function handleViewHistory(
  args: Record<string, unknown>,
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

    const userConfig = loadUserConfig();
    const effectivePrivacyMode =
      privacy_mode ?? userConfig.historyLogging?.privacyMode ?? "full";

    const result = await historyLogger.getHistory({
      limit,
      startDate: since,
      endDate: until,
      operation,
      status,
      source,
      privacyMode: effectivePrivacyMode,
    });

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

    const markdown = formatHistoryAsMarkdown(
      result.entries,
      result.total,
      result.hasMore,
      limit,
    );

    return {
      content: [{ type: "text", text: markdown }],
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}

function formatHistoryAsMarkdown(
  entries: Array<{
    id: string;
    timestamp: string;
    operation: string;
    source: "manual" | "scheduled";
    status: "success" | "error" | "partial";
    durationMs: number;
    filesProcessed?: number;
    filesSkipped?: number;
    details?: string;
    error?: { message: string; code?: string };
  }>,
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
    "| Timestamp | Operation | Source | Status | Duration | Files |\n";
  markdown +=
    "|-----------|-----------|--------|--------|----------|-------|\n";

  for (const entry of entries) {
    const timestamp = new Date(entry.timestamp).toLocaleString();
    const duration =
      entry.durationMs < 1000
        ? `${entry.durationMs}ms`
        : `${(entry.durationMs / 1000).toFixed(1)}s`;
    const files = entry.filesProcessed ?? "-";
    const statusEmoji =
      entry.status === "success" ? "✓" : entry.status === "error" ? "✗" : "⚠";

    markdown += `| ${timestamp} | ${entry.operation} | ${entry.source} | ${statusEmoji} ${entry.status} | ${duration} | ${files} |\n`;
  }

  markdown += "\n";

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
