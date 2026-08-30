/**
 * Organize, rename, organize.
 */

import { z } from "zod";
import { CommonParamsSchema } from "./common.js";


/**
 * Schema for organize_files tool
 */
export const OrganizeFilesInputSchema = z
  .object({
    directory: z
      .string()
      .min(1, "Directory path cannot be empty")
      .describe("Full path to the directory to organize"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe("If true, only simulate the organization without moving files"),
    conflict_strategy: z
      .enum(["rename", "skip", "overwrite"])
      .optional()
      .describe(
        "How to handle file conflicts. Uses config default if not specified",
      ),
    use_content_analysis: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Analyze file content for accurate type detection and security (slower)",
      ),
  })
  .merge(CommonParamsSchema);

export type OrganizeFilesInput = z.infer<typeof OrganizeFilesInputSchema>;

/**
 * Schema for preview_organization tool
 * Shows what would happen if files were organized, WITHOUT making any changes
 */
export const PreviewOrganizationInputSchema = z
  .object({
    directory: z
      .string()
      .min(1, "Directory path cannot be empty")
      .describe("Full path to the directory to preview organization for"),
    show_conflicts_only: z
      .boolean()
      .default(false)
      .describe("Only show files that will cause naming conflicts"),
    conflict_strategy: z
      .enum(["rename", "skip", "overwrite"])
      .optional()
      .describe(
        "How to handle file conflicts for preview. Uses config default if not specified",
      ),
  })
  .merge(CommonParamsSchema);

export type PreviewOrganizationInput = z.infer<
  typeof PreviewOrganizationInputSchema
>;

export const FindReplaceRuleSchema = z.object({
  type: z.literal("find_replace"),
  find: z.string().min(1),
  replace: z.string(),
  use_regex: z.boolean().default(false),
  case_sensitive: z.boolean().default(false),
  global: z.boolean().default(true), // Replace all occurrences
});

export const CaseRuleSchema = z.object({
  type: z.literal("case"),
  conversion: z.enum([
    "lowercase",
    "uppercase",
    "camelCase",
    "PascalCase",
    "snake_case",
    "kebab-case",
    "Title Case",
  ]),
});

export const AddTextRuleSchema = z.object({
  type: z.literal("add_text"),
  text: z.string().min(1),
  position: z.enum(["start", "end"]),
});

export const NumberingRuleSchema = z.object({
  type: z.literal("numbering"),
  start_at: z.number().int().min(0).max(99999).default(1),
  increment_by: z.number().int().min(1).max(1000).default(1),
  format: z.string().default("search_index"),
  separator: z.string().default(" "),
  location: z.enum(["start", "end"]).default("end"),
});

export const TrimRuleSchema = z.object({
  type: z.literal("trim"),
  chars: z.string().optional(), // Characters to trim, defaults to whitespace
  position: z.enum(["start", "end", "both"]).default("both"),
});

export const RenameRuleSchema = z.discriminatedUnion("type", [
  FindReplaceRuleSchema,
  CaseRuleSchema,
  AddTextRuleSchema,
  NumberingRuleSchema,
  TrimRuleSchema,
]);

export type RenameRule = z.infer<typeof RenameRuleSchema>;

/**
 * Schema for batch_rename tool
 * Rename multiple files using rules (find/replace, case, add text, numbering)
 */
export const BatchRenameInputSchema = z
  .object({
    files: z
      .array(z.string())
      .optional()
      .describe("List of absolute file paths to rename"),
    directory: z
      .string()
      .optional()
      .describe('Directory to scan for files (if "files" is not provided)'),
    rules: z
      .array(RenameRuleSchema)
      .min(1, "At least one renaming rule is required"),
    dry_run: z
      .boolean()
      .optional()
      .default(true)
      .describe("If true, only simulate renaming. Default: true"),
  })
  .merge(CommonParamsSchema)
  .refine((data) => data.files || data.directory, {
    message: 'Either "files" or "directory" must be provided',
    path: ["files", "directory"],
  });

export type BatchRenameInput = z.infer<typeof BatchRenameInputSchema>;

/**
 * Schema for undo_last_operation tool
 * Reverses file moves and renames from a previous organization task
 */
export const UndoLastOperationInputSchema = z
  .object({
    manifest_id: z
      .string()
      .optional()
      .describe(
        "ID of the operation to undo. if omitted, undoes the last operation.",
      ),
  })
  .merge(CommonParamsSchema);

export type UndoLastOperationInput = z.infer<
  typeof UndoLastOperationInputSchema
>;

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

/**
 * Schema for organize_smart tool
 * Unified organization tool that auto-detects file types and applies
 * the appropriate organization strategy (music, photos, or content-based).
 */

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

/**
 * Schema for organize_by_project tool
 * Groups files across types into detected project folders
 */
export const OrganizeByProjectInputSchema = z
  .object({
    source_dir: z
      .string()
      .min(1, "Source directory path cannot be empty")
      .describe("Full path to the directory containing files to organize"),
    target_dir: z
      .string()
      .min(1, "Target directory path cannot be empty")
      .describe(
        "Full path to the directory where detected projects will be placed",
      ),
    dry_run: z
      .boolean()
      .optional()
      .default(true)
      .describe("If true, only preview the project grouping without moving files"),
    recursive: z
      .boolean()
      .optional()
      .default(true)
      .describe("Scan subdirectories recursively"),
  })
  .merge(CommonParamsSchema);

export type OrganizeByProjectInput = z.infer<typeof OrganizeByProjectInputSchema>;
