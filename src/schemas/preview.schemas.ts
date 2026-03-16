/**
 * File Organizer MCP Server v3.4.2
 * Organization Preview Schemas
 */

import { z } from "zod";
import { CommonParamsSchema } from "./common.schemas.js";

/**
 * Schema for preview_organization tool
 * Shows what would happen if files were organized, WITHOUT making any changes
 */
export const PreviewOrganizationInputSchema = z
  .object({
    directory: z
      .string()
      .min(1, "Directory path cannot be empty")
      .describe("Full path to the directory to preview organization for"),
    show_conflicts_only: z
      .boolean()
      .default(false)
      .describe("Only show files that will cause naming conflicts"),
    conflict_strategy: z
      .enum(["rename", "skip", "overwrite"])
      .optional()
      .describe(
        "How to handle file conflicts for preview. Uses config default if not specified",
      ),
  })
  .merge(CommonParamsSchema);

export type PreviewOrganizationInput = z.infer<
  typeof PreviewOrganizationInputSchema
>;
