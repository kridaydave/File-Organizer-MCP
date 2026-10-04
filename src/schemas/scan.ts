/**
 * Scan and read schemas.
 */

import { z } from "zod";
import { CommonParamsSchema, PaginationSchema } from "./common.js";

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
 * Schema for find_old_files tool
 *
 * 100 years is the ceiling: past that the threshold is a typo, not an intent,
 * and it silently returns every file in the directory.
 */
export const FindOldFilesInputSchema = z
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
    older_than_days: z
      .number()
      .int("older_than_days must be a whole number of days")
      .positive("older_than_days must be greater than 0")
      .max(36500, "older_than_days must be 36500 or less")
      .optional()
      .default(365)
      .describe("Only return files untouched for at least this many days"),
    age_source: z
      .enum(["mtime", "atime"])
      .optional()
      .default("mtime")
      .describe(
        "Timestamp to measure age from: mtime (last modified, default) or atime (last accessed)",
      ),
    top_n: z
      .number()
      .int()
      .positive()
      .max(100)
      .optional()
      .default(10)
      .describe("Number of oldest files to return"),
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

/**
 * Schema for disk_usage_by_category tool
 */
export const DiskUsageByCategoryInputSchema = z
  .object({
    directory: z
      .string()
      .min(1, "Directory path cannot be empty")
      .describe("Full path to the directory to measure"),
    include_subdirs: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        "Include subdirectories in the breakdown. Defaults to true because the space a category holds usually sits below the directory you point at",
      ),
  })
  .merge(CommonParamsSchema);

export type DiskUsageByCategoryInput = z.infer<
  typeof DiskUsageByCategoryInputSchema
>;

/**
 * Schema for find_broken_symlinks tool
 */
export const FindBrokenSymlinksInputSchema = z
  .object({
    directory: z
      .string()
      .min(1, "Directory path cannot be empty")
      .describe("Full path to the directory to audit for symlink problems"),
  })
  .merge(CommonParamsSchema);

export type FindBrokenSymlinksInput = z.infer<
  typeof FindBrokenSymlinksInputSchema
>;

/**
 * Schema for find_empty_directories tool
 */
export const FindEmptyDirectoriesInputSchema = z
  .object({
    directory: z
      .string()
      .min(1, "Directory path cannot be empty")
      .describe("Full path to the directory to search for empty directories"),
    include_subdirs: z
      .boolean()
      .optional()
      .default(true)
      .describe("Recurse into subdirectories (default true)"),
    max_depth: z
      .number()
      .int()
      .min(0)
      .max(100)
      .optional()
      .describe(
        "Levels below the root to walk (0 = root only). Defaults to the configured max scan depth",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .default(100)
      .describe("Maximum number of empty directories to return"),
  })
  .merge(CommonParamsSchema);

export type FindEmptyDirectoriesInput = z.infer<
  typeof FindEmptyDirectoriesInputSchema
>;

export type ListFilesInput = z.infer<typeof ListFilesInputSchema>;
export type ScanDirectoryInput = z.infer<typeof ScanDirectoryInputSchema>;
export type FindLargestFilesInput = z.infer<typeof FindLargestFilesInputSchema>;
export type FindOldFilesInput = z.infer<typeof FindOldFilesInputSchema>;
export type FindDuplicateFilesInput = z.infer<
  typeof FindDuplicateFilesInputSchema
>;
export type CategorizeByTypeInput = z.infer<typeof CategorizeByTypeInputSchema>;

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

/**
 * Input schema for file_organizer_read_file tool
 * Uses Zod for runtime validation
 */
export const ReadFileInputSchema = z
  .object({
    path: z
      .string()
      .min(1, "File path cannot be empty")
      .describe("Absolute path to the file to read"),
    encoding: z
      .enum(["utf-8", "base64", "binary"])
      .optional()
      .default("utf-8")
      .describe("Encoding for text files (utf-8, base64, or binary)"),
    maxBytes: z
      .number()
      .int()
      .min(1)
      .max(100 * 1024 * 1024) // Max 100MB
      .optional()
      .default(10 * 1024 * 1024) // Default 10MB
      .describe("Maximum bytes to read (1B to 100MB, default 10MB)"),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .default(0)
      .describe("Byte offset to start reading from"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100 * 1024 * 1024)
      .optional()
      .describe("Maximum bytes to read (alias for maxBytes)"),
    response_format: z
      .enum(["json", "markdown", "text"])
      .optional()
      .default("markdown")
      .describe("Response format: json, markdown, or text"),
    calculateChecksum: z
      .boolean()
      .optional()
      .default(true)
      .describe("Calculate SHA-256 checksum of content"),
  })
  .transform((data) => ({
    ...data,
    // Use limit as maxBytes if provided
    maxBytes: data.limit ?? data.maxBytes,
  }));

export type ReadFileInput = z.infer<typeof ReadFileInputSchema>;

/**
 * Schema for inspect_metadata tool
 * Inspects a file and returns comprehensive but privacy-safe metadata
 */
export const InspectMetadataInputSchema = z
  .object({
    file: z
      .string()
      .min(1, "File path cannot be empty")
      .describe("Full path to the file to inspect"),
  })
  .merge(CommonParamsSchema);

export type InspectMetadataInput = z.infer<typeof InspectMetadataInputSchema>;

/**
 * Schema for the sensitive_scan tool.
 * Screens a directory for files carrying personal metadata. Heuristic and
 * read-only: it reports what EXIF holds, it never removes anything.
 */
export const SensitiveScanInputSchema = z
  .object({
    directory: z
      .string()
      .min(1, "Directory path cannot be empty")
      .describe("Full path to the directory to screen"),
    include_subdirs: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Descend into real subdirectories. Symbolic links are never followed.",
      ),
  })
  .merge(CommonParamsSchema);

export type SensitiveScanInput = z.infer<typeof SensitiveScanInputSchema>;

/**
 * Schema for analyzing duplicate files
 */
export const AnalyzeDuplicatesInputSchema = z
  .object({
    directory: z.string().min(1, "Directory path cannot be empty"),
    recommendation_strategy: z
      .enum(["newest", "oldest", "best_location", "best_name"])
      .default("best_location"),
    auto_select_keep: z.boolean().default(false),
  })
  .merge(CommonParamsSchema);

export type AnalyzeDuplicatesInput = z.infer<
  typeof AnalyzeDuplicatesInputSchema
>;

/**
 * Schema for previewing a duplicate deletion
 */
export const PreviewDeleteDuplicatesInputSchema = z
  .object({
    directory: z.string().min(1, "Directory path cannot be empty"),
    /**
     * Which copy of each group survives. Unlike analyze_duplicates these name
     * the survivor outright instead of blending path depth and location into a
     * score, so "newest" always means the most recently modified copy.
     */
    keep_strategy: z
      .enum(["newest", "oldest", "keep_first"])
      .default("newest")
      .describe(
        'Survivor per group: "newest" (most recently modified), "oldest", or "keep_first" (first found by the scan)',
      ),
  })
  .merge(CommonParamsSchema);

export type PreviewDeleteDuplicatesInput = z.infer<
  typeof PreviewDeleteDuplicatesInputSchema
>;

/**
 * Schema for deleting duplicate files
 */
export const DeleteDuplicatesInputSchema = z
  .object({
    files_to_delete: z.array(z.string()).min(1),
    create_backup_manifest: z.boolean().default(true),
    /**
     * Hash every candidate and refuse to delete a file that has no surviving
     * copy anywhere in the searched directories. Defaults to true; turning it
     * off is reported back in the response so the caller knows the run was
     * unverified.
     */
    verify_before_delete: z.boolean().default(true),
    /**
     * Extra directories to search for surviving copies. Verification
     * otherwise scans each file's parent and grandparent directory only, so a
     * duplicate kept in an unrelated folder would look like a last copy.
     */
    candidate_directories: z.array(z.string()).default([]),
  })
  .merge(CommonParamsSchema);

export type DeleteDuplicatesInput = z.infer<typeof DeleteDuplicatesInputSchema>;
