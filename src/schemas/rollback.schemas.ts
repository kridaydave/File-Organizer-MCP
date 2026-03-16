/**
 * File Organizer MCP Server v3.4.2
 * Rollback Schemas
 */

import { z } from "zod";
import { CommonParamsSchema } from "./common.schemas.js";

/**
 * Schema for undo_last_operation tool
 * Reverses file moves and renames from a previous organization task
 */
export const UndoLastOperationInputSchema = z
  .object({
    manifest_id: z
      .string()
      .optional()
      .describe(
        "ID of the operation to undo. if omitted, undoes the last operation.",
      ),
  })
  .merge(CommonParamsSchema);

export type UndoLastOperationInput = z.infer<
  typeof UndoLastOperationInputSchema
>;
