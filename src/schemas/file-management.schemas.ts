/**
 * File Organizer MCP Server v3.4.2
 * File Management Schemas
 *
 * @module schemas/file-management.schemas
 */

import { z } from "zod";
import { CommonParamsSchema } from "./common.schemas.js";

export const GetCategoriesInputSchema = z.object({}).merge(CommonParamsSchema);

export const SetCustomRulesInputSchema = z.object({
  rules: z.array(
    z.object({
      category: z.string(),
      extensions: z.array(z.string()).optional(),
      filename_pattern: z.string().optional(),
      priority: z.number().int().min(0).default(0),
    }),
  ),
});
