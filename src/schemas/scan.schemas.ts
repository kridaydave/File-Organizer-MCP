/**
 * File Organizer MCP Server v3.4.0
 * Scan Operation Schemas
 */

import { z } from "zod";
import {
  DirectoryInputSchema,
  RecursiveInputSchema,
} from "./common.schemas.js";

/**
 * Schema for list_files tool
 */
export const ListFilesInputSchema = DirectoryInputSchema;

/**
 * Schema for scan_directory tool
 */
export const ScanDirectoryInputSchema = RecursiveInputSchema.extend({
  max_depth: z.number().int().min(-1).max(50).default(-1),
});

/**
 * Schema for find_largest_files tool
 */
export const FindLargestFilesInputSchema = RecursiveInputSchema.extend({
  top_n: z.number().int().min(1).max(1000).default(10),
});

/**
 * Schema for find_duplicate_files tool
 */
export const FindDuplicateFilesInputSchema = DirectoryInputSchema;

/**
 * Schema for categorize_by_type tool
 */
export const CategorizeByTypeInputSchema = RecursiveInputSchema;

export type ListFilesInput = z.infer<typeof ListFilesInputSchema>;
export type ScanDirectoryInput = z.infer<typeof ScanDirectoryInputSchema>;
export type FindLargestFilesInput = z.infer<typeof FindLargestFilesInputSchema>;
export type FindDuplicateFilesInput = z.infer<
  typeof FindDuplicateFilesInputSchema
>;
export type CategorizeByTypeInput = z.infer<typeof CategorizeByTypeInputSchema>;
