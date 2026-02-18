/**
 * File Organizer MCP Server v3.4.0
 * Organize Operation Schemas
 */

import { z } from "zod";
import { CommonParamsSchema } from "./common.schemas.js";

/**
 * Schema for organize_files tool
 */
export const OrganizeFilesInputSchema = z
  .object({
    directory: z
      .string()
      .min(1, "Directory path cannot be empty")
      .describe("Full path to the directory to organize"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe("If true, only simulate the organization without moving files"),
    conflict_strategy: z
      .enum(["rename", "skip", "overwrite"])
      .optional()
      .describe(
        "How to handle file conflicts. Uses config default if not specified",
      ),
    use_content_analysis: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Analyze file content for accurate type detection and security (slower)",
      ),
  })
  .merge(CommonParamsSchema);

export type OrganizeFilesInput = z.infer<typeof OrganizeFilesInputSchema>;
