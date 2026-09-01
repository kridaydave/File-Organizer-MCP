/**
 * System: history, security, category management schemas.
 */

import { z } from "zod";
import { CommonParamsSchema } from "./common.js";


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

/**
 * Schema for path validation - ensures path is a valid non-empty string
 * without null bytes (security check)
 */
export const PathSchema = z
  .string()
  .min(1, "Path cannot be empty")
  .max(4096, "Path too long")
  .refine((path) => !path.includes("\0"), {
    message: "Path cannot contain null bytes",
  })
  .refine((p) => !/(^|[/\\])\.\.([/\\]|$)/.test(p), {
    message: "Path cannot contain parent directory traversal",
  });

/**
 * Schema for security mode configuration
 */
const SecurityModeSchema = z.enum(["strict", "sandboxed", "unrestricted"]);

/**
 * Schema for allowed paths configuration
 */
const AllowedPathsSchema = z.array(PathSchema).min(1);

type SecurityMode = z.infer<typeof SecurityModeSchema>;
type AllowedPaths = z.infer<typeof AllowedPathsSchema>;

export const GetCategoriesInputSchema = z.object({}).merge(CommonParamsSchema);

export const SetCustomRulesInputSchema = z
  .object({
    rules: z.array(
      z.object({
        category: z.string(),
        extensions: z.array(z.string()).optional(),
        filename_pattern: z.string().optional(),
        priority: z.number().int().min(0).default(0),
      }),
    ),
  })
  .merge(CommonParamsSchema);
