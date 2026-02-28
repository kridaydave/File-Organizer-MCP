/**
 * File Organizer MCP Server v3.4.1
 * Scan Operation Schemas
 */

import { z } from "zod";
import { CommonParamsSchema, PaginationSchema } from "./common.schemas.js";

/**
 * Schema for list_files tool
 */
export const ListFilesInputSchema = z
  .object({
    directory: z
      .string()
      .min(1, "Directory path cannot be empty")
      .describe("Full path to the directory to list files from"),
  })
  .merge(CommonParamsSchema)
  .merge(PaginationSchema);

/**
 * Schema for scan_directory tool
 */
export const ScanDirectoryInputSchema = z
  .object({
    directory: z
      .string()
      .min(1, "Directory path cannot be empty")
      .describe("Full path to the directory to scan"),
    include_subdirs: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include subdirectories in the scan"),
    max_depth: z
      .number()
      .int()
      .min(-1)
      .max(100)
      .optional()
      .default(-1)
      .describe(
        "Maximum depth to scan (0 = current directory only, -1 = unlimited, max 100)",
      ),
    screen_files: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Screen files for security threats (malware detection, extension mismatches)",
      ),
  })
  .merge(CommonParamsSchema)
  .merge(PaginationSchema);

/**
 * Schema for find_largest_files tool
 */
export const FindLargestFilesInputSchema = z
  .object({
    directory: z
      .string()
      .min(1, "Directory path cannot be empty")
      .describe("Full path to the directory to search"),
    include_subdirs: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include subdirectories in search"),
    top_n: z
      .number()
      .int()
      .positive()
      .max(100)
      .optional()
      .default(10)
      .describe("Number of largest files to return"),
  })
  .merge(CommonParamsSchema);

/**
 * Schema for find_duplicate_files tool
 */
export const FindDuplicateFilesInputSchema = z
  .object({
    directory: z
      .string()
      .min(1, "Directory path cannot be empty")
      .describe("Full path to the directory to search for duplicates"),
  })
  .merge(CommonParamsSchema)
  .merge(PaginationSchema);

/**
 * Schema for categorize_by_type tool
 */
export const CategorizeByTypeInputSchema = z
  .object({
    directory: z
      .string()
      .min(1, "Directory path cannot be empty")
      .describe("Full path to the directory to categorize"),
    include_subdirs: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include subdirectories in categorization"),
    use_content_analysis: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Analyze file content for accurate type detection (slower but more secure)",
      ),
  })
  .merge(CommonParamsSchema);

export type ListFilesInput = z.infer<typeof ListFilesInputSchema>;
export type ScanDirectoryInput = z.infer<typeof ScanDirectoryInputSchema>;
export type FindLargestFilesInput = z.infer<typeof FindLargestFilesInputSchema>;
export type FindDuplicateFilesInput = z.infer<
  typeof FindDuplicateFilesInputSchema
>;
export type CategorizeByTypeInput = z.infer<typeof CategorizeByTypeInputSchema>;
