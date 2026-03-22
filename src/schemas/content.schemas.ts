/**
 * File Organizer MCP Server v3.4.2
 * Content-Based Organization Schemas
 */

import { z } from "zod";
import { CommonParamsSchema } from "./common.schemas.js";

/**
 * Schema for organize_by_content tool
 * Organizes document files into topic-based folders using content analysis
 */
export const OrganizeByContentInputSchema = z
  .object({
    source_dir: z
      .string()
      .min(1, "Source directory path cannot be empty")
      .describe("Full path to the directory containing document files"),
    target_dir: z
      .string()
      .min(1, "Target directory path cannot be empty")
      .describe(
        "Full path to the directory where organized documents will be placed",
      ),
    dry_run: z
      .boolean()
      .optional()
      .default(true)
      .describe("If true, only preview changes without moving files"),
    create_shortcuts: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "For multi-topic documents, create shortcuts/symlinks in additional topic folders",
      ),
    recursive: z
      .boolean()
      .optional()
      .default(true)
      .describe("Scan subdirectories recursively"),
  })
  .merge(CommonParamsSchema);

export type OrganizeByContentInput = z.infer<
  typeof OrganizeByContentInputSchema
>;
