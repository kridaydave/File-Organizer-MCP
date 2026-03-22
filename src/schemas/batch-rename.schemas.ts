/**
 * File Organizer MCP Server v3.4.2
 * Batch Rename Schemas
 */

import { z } from "zod";
import { CommonParamsSchema } from "./common.schemas.js";
import { RenameRuleSchema } from "./rename.schemas.js";

/**
 * Schema for batch_rename tool
 * Rename multiple files using rules (find/replace, case, add text, numbering)
 */
export const BatchRenameInputSchema = z
  .object({
    files: z
      .array(z.string())
      .optional()
      .describe("List of absolute file paths to rename"),
    directory: z
      .string()
      .optional()
      .describe('Directory to scan for files (if "files" is not provided)'),
    rules: z
      .array(RenameRuleSchema)
      .min(1, "At least one renaming rule is required"),
    dry_run: z
      .boolean()
      .optional()
      .default(true)
      .describe("If true, only simulate renaming. Default: true"),
  })
  .merge(CommonParamsSchema)
  .refine((data) => data.files || data.directory, {
    message: 'Either "files" or "directory" must be provided',
    path: ["files", "directory"],
  });

export type BatchRenameInput = z.infer<typeof BatchRenameInputSchema>;
