/**
 * File Organizer MCP Server v3.4.2
 * History Schemas
 */

import { z } from "zod";
import { CommonParamsSchema } from "./common.schemas.js";

/**
 * Schema for view_history tool
 * View the history of file organization operations
 */
export const ViewHistoryInputSchema = z
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
