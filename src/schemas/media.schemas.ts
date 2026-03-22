/**
 * File Organizer MCP Server v3.4.2
 * Media organization schemas
 *
 * @module schemas/media
 */

import { z } from "zod";
import { CommonParamsSchema } from "./common.schemas.js";

// ==================== Music Organization Schema ====================

export const OrganizeMusicInputSchema = z
  .object({
    source_dir: z
      .string()
      .min(1, "Source directory path cannot be empty")
      .describe("Full path to the directory containing music files"),
    target_dir: z
      .string()
      .min(1, "Target directory path cannot be empty")
      .describe(
        "Full path to the directory where organized music will be placed",
      ),
    structure: z
      .enum(["artist/album", "album", "genre/artist", "flat"])
      .optional()
      .default("artist/album")
      .describe("Folder structure for organization"),
    filename_pattern: z
      .enum(["{track} - {title}", "{artist} - {title}", "{title}"])
      .optional()
      .default("{track} - {title}")
      .describe("Pattern for renaming files"),
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
    skip_if_missing_metadata: z
      .boolean()
      .optional()
      .default(false)
      .describe("Skip files that are missing artist/album metadata"),
  })
  .merge(CommonParamsSchema);

export type OrganizeMusicInput = z.infer<typeof OrganizeMusicInputSchema>;

// ==================== Photo Organization Schema ====================

export const OrganizePhotosInputSchema = z
  .object({
    source_dir: z
      .string()
      .min(1, "Source directory path cannot be empty")
      .describe("Full path to the directory containing photos"),
    target_dir: z
      .string()
      .min(1, "Target directory path cannot be empty")
      .describe(
        "Full path to the directory where organized photos will be placed",
      ),
    date_format: z
      .enum(["YYYY/MM/DD", "YYYY-MM-DD", "YYYY/MM", "YYYY"])
      .optional()
      .default("YYYY/MM")
      .describe("Date format for folder structure"),
    group_by_camera: z
      .boolean()
      .optional()
      .default(false)
      .describe("Group photos by camera model within date folders"),
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
    strip_gps: z
      .boolean()
      .optional()
      .default(false)
      .describe("Strip GPS location data from photos for privacy"),
    unknown_date_folder: z
      .string()
      .optional()
      .default("Unknown Date")
      .describe("Folder name for photos without date metadata"),
  })
  .merge(CommonParamsSchema);

export type OrganizePhotosInput = z.infer<typeof OrganizePhotosInputSchema>;
