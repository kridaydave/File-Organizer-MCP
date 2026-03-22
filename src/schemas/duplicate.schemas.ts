/**
 * File Organizer MCP Server v3.4.2
 * Duplicate Management Validation Schemas
 */

import { z } from "zod";
import { CommonParamsSchema } from "./common.schemas.js";

/**
 * Schema for analyzing duplicate files
 */
export const AnalyzeDuplicatesInputSchema = z
  .object({
    directory: z.string().min(1, "Directory path cannot be empty"),
    recommendation_strategy: z
      .enum(["newest", "oldest", "best_location", "best_name"])
      .default("best_location"),
    auto_select_keep: z.boolean().default(false),
  })
  .merge(CommonParamsSchema);

export type AnalyzeDuplicatesInput = z.infer<
  typeof AnalyzeDuplicatesInputSchema
>;

/**
 * Schema for deleting duplicate files
 */
export const DeleteDuplicatesInputSchema = z
  .object({
    files_to_delete: z.array(z.string()).min(1),
    create_backup_manifest: z.boolean().default(true),
  })
  .merge(CommonParamsSchema);

export type DeleteDuplicatesInput = z.infer<typeof DeleteDuplicatesInputSchema>;
