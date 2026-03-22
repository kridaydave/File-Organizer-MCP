/**
 * File Organizer MCP Server v3.4.2
 * System Organization Schemas
 */

import { z } from "zod";
import { CommonParamsSchema } from "./common.schemas.js";

/**
 * Schema for system_organization tool
 * Organizes files into OS-standard system directories (Music, Documents, Pictures, Videos)
 */
export const SystemOrganizationInputSchema = z
  .object({
    source_dir: z
      .string()
      .min(1)
      .describe("Source directory (must be Downloads, Desktop, or Temp)"),
    use_system_dirs: z
      .boolean()
      .optional()
      .default(true)
      .describe("Use OS system directories"),
    create_subfolders: z
      .boolean()
      .optional()
      .default(true)
      .describe("Create organized subfolders"),
    fallback_to_local: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        "Fallback to local Organized folder if system dir not writable",
      ),
    local_fallback_prefix: z
      .string()
      .optional()
      .default("Organized")
      .describe("Prefix for local fallback folder"),
    conflict_strategy: z
      .enum(["skip", "rename", "overwrite"])
      .optional()
      .default("rename")
      .describe("How to handle file conflicts"),
    dry_run: z
      .boolean()
      .optional()
      .default(true)
      .describe("Preview without moving"),
    copy_instead_of_move: z
      .boolean()
      .optional()
      .default(false)
      .describe("Copy instead of move"),
  })
  .merge(CommonParamsSchema);

export type SystemOrganizationInput = z.infer<
  typeof SystemOrganizationInputSchema
>;
