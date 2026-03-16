/**
 * File Organizer MCP Server v3.4.2
 * Batch File Reader Schemas
 */

import { z } from "zod";
import { CommonParamsSchema } from "./common.schemas.js";

/**
 * Schema for batch_read_files tool
 * Reads contents of all files in a folder for LLM context
 */
export const BatchReadFilesInputSchema = z
  .object({
    directory: z
      .string()
      .min(1, "Directory path cannot be empty")
      .describe("Full path to the directory containing files to read"),
    include_subdirs: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include subdirectories in the batch read"),
    max_files: z
      .number()
      .optional()
      .default(50)
      .describe("Maximum number of files to process (safety limit)"),
    max_file_size_mb: z
      .number()
      .optional()
      .default(10)
      .describe(
        "Maximum file size in MB to read content (larger files get metadata only)",
      ),
    include_content: z
      .boolean()
      .optional()
      .default(true)
      .describe("Include file content for text files"),
    include_metadata: z
      .boolean()
      .optional()
      .default(true)
      .describe("Include metadata for all files"),
    file_types: z
      .array(z.string())
      .optional()
      .describe(
        'Filter by specific file extensions (e.g., [".txt", ".pdf"]). Empty = all files',
      ),
  })
  .merge(CommonParamsSchema);

export type BatchReadFilesInput = z.infer<typeof BatchReadFilesInputSchema>;
