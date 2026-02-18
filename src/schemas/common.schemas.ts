/**
 * File Organizer MCP Server v3.4.0
 * Common Validation Schemas
 */

import { z } from "zod";

/**
 * Base directory input schema
 */
const DirectoryInputSchema = z.object({
  directory: z.string().min(1, "Directory path is required"),
});

/**
 * Schema for operations that can include subdirectories
 */
const RecursiveInputSchema = DirectoryInputSchema.extend({
  include_subdirs: z.boolean().default(false),
});

/**
 * Pagination schema for list operations
 */
export const PaginationSchema = z.object({
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().nonnegative().default(0),
});

/**
 * Common parameters for all tools
 */
export const CommonParamsSchema = z.object({
  response_format: z
    .enum(["json", "markdown"])
    .default("markdown")
    .describe(
      'Output format: "markdown" for human-readable, "json" for programmatic use',
    ),
});

export type PaginationInput = z.infer<typeof PaginationSchema>;
export type CommonParams = z.infer<typeof CommonParamsSchema>;

type DirectoryInput = z.infer<typeof DirectoryInputSchema>;
type RecursiveInput = z.infer<typeof RecursiveInputSchema>;
