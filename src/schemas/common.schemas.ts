/**
 * File Organizer MCP Server v3.2.0
 * Common Validation Schemas
 */

import { z } from "zod";

/**
 * Base directory input schema
 */
export const DirectoryInputSchema = z.object({
  directory: z.string().min(1, "Directory path is required"),
});

/**
 * Schema for operations that can include subdirectories
 */
export const RecursiveInputSchema = DirectoryInputSchema.extend({
  include_subdirs: z.boolean().default(false),
});

/**
 * Pagination schema for list operations
 */
export const PaginationSchema = z.object({
  limit: z.number().int().positive().default(100),
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

export type DirectoryInput = z.infer<typeof DirectoryInputSchema>;
export type RecursiveInput = z.infer<typeof RecursiveInputSchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;
export type CommonParams = z.infer<typeof CommonParamsSchema>;
