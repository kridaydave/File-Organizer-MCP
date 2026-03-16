/**
 * File Organizer MCP Server v3.4.2
 * Smart Organization Schemas
 */

import { z } from "zod";
import { CommonParamsSchema } from "./common.schemas.js";

/**
 * Schema for organize_smart tool
 * Unified organization tool that auto-detects file types and applies
 * the appropriate organization strategy (music, photos, or content-based).
 */
export const OrganizeSmartInputSchema = z
  .object({
    source_dir: z
      .string()
      .min(1, "Source directory path cannot be empty")
      .describe(
        "Full path to the directory containing mixed files (music, photos, documents)",
      ),
    target_dir: z
      .string()
      .min(1, "Target directory path cannot be empty")
      .describe(
        "Full path to the directory where organized files will be placed",
      ),
    // Music options
    music_structure: z
      .enum(["artist/album", "album", "genre/artist", "flat"])
      .optional()
      .default("artist/album")
      .describe("Folder structure for music files"),
    // Photo options
    photo_date_format: z
      .enum(["YYYY/MM/DD", "YYYY-MM-DD", "YYYY/MM", "YYYY"])
      .optional()
      .default("YYYY/MM")
      .describe("Date format for photo folder structure"),
    photo_group_by_camera: z
      .boolean()
      .optional()
      .default(false)
      .describe("Group photos by camera model within date folders"),
    strip_gps: z
      .boolean()
      .optional()
      .default(false)
      .describe("Strip GPS location data from photos for privacy"),
    // Document options
    create_shortcuts: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "For multi-topic documents, create shortcuts in additional topic folders",
      ),
    // Common options
    dry_run: z
      .boolean()
      .optional()
      .default(true)
      .describe("If true, only preview changes without moving files"),
    copy_instead_of_move: z
      .boolean()
      .optional()
      .default(false)
      .describe("Copy files instead of moving them"),
    recursive: z
      .boolean()
      .optional()
      .default(true)
      .describe("Scan subdirectories recursively"),
  })
  .merge(CommonParamsSchema);

export type OrganizeSmartInput = z.infer<typeof OrganizeSmartInputSchema>;

/**
 * Schema for smart_suggest tool
 * Analyze directory health and get actionable suggestions for organization
 */
export const SmartSuggestInputSchema = z
  .object({
    directory: z
      .string()
      .min(1, "Directory path cannot be empty")
      .describe("Directory to analyze"),
    include_subdirs: z
      .boolean()
      .optional()
      .default(true)
      .describe("Include subdirectories"),
    include_duplicates: z
      .boolean()
      .optional()
      .default(true)
      .describe("Check for duplicates (slower)"),
    max_files: z
      .number()
      .min(1)
      .max(100000)
      .optional()
      .default(10000)
      .describe("Maximum files to scan"),
    timeout_seconds: z
      .number()
      .min(10)
      .max(300)
      .optional()
      .default(60)
      .describe("Timeout in seconds"),
    sample_rate: z
      .number()
      .min(0.01)
      .max(1)
      .optional()
      .default(1)
      .describe("Sample rate for large dirs"),
    use_cache: z
      .boolean()
      .optional()
      .default(true)
      .describe("Use cached results"),
  })
  .merge(CommonParamsSchema);

export type SmartSuggestInput = z.infer<typeof SmartSuggestInputSchema>;
