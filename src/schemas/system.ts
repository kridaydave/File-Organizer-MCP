/**
 * System: history, security, category management schemas.
 */

import { z } from "zod";
import { CommonParamsSchema } from "./common.js";

/**
 * Schema for view_history tool
 * View the history of file organization operations
 */
export const ViewHistoryInputSchema = z
  .object({
    limit: z
      .number()
      .min(1)
      .max(1000)
      .optional()
      .default(20)
      .describe("Maximum number of entries to return"),
    since: z
      .string()
      .optional()
      .describe("ISO date string - return entries after this time"),
    until: z
      .string()
      .optional()
      .describe("ISO date string - return entries before this time"),
    operation: z.string().optional().describe("Filter by operation name"),
    status: z
      .enum(["success", "error", "partial"])
      .optional()
      .describe("Filter by operation status"),
    source: z
      .enum(["manual", "scheduled"])
      .optional()
      .describe("Filter by operation source"),
    privacy_mode: z
      .enum(["full", "redacted", "none"])
      .optional()
      .describe(
        "Privacy mode for output: full (all details), redacted (paths hidden), none (minimal info)",
      ),
  })
  .merge(CommonParamsSchema);

export type ViewHistoryInput = z.infer<typeof ViewHistoryInputSchema>;

/**
 * Schema for path validation - ensures path is a valid non-empty string
 * without null bytes (security check)
 */
export const PathSchema = z
  .string()
  .min(1, "Path cannot be empty")
  .max(4096, "Path too long")
  .refine((path) => !path.includes("\0"), {
    message: "Path cannot contain null bytes",
  })
  .refine((p) => !/(^|[/\\])\.\.([/\\]|$)/.test(p), {
    message: "Path cannot contain parent directory traversal",
  });

/**
* Schema for a user-supplied FOLDER NAME — a single path segment, not a path.
 *
 * These values get joined onto an already-validated directory and then
 * mkdir'd, so anything that could walk out of that directory (separators,
 * "..", NUL, control characters) is rejected outright rather than sanitized
 * into something the caller did not ask for. Legitimate names such as
 * "Unknown Date" or "2024 Unsorted" pass untouched.
 */
export const FolderNameSchema = z
  .string()
  .min(1, "Folder name cannot be empty")
  .max(255, "Folder name too long")
  .refine((name) => !/[/\\]/.test(name), {
    message: "Folder name cannot contain path separators",
  })
  .refine((name) => !name.includes(".."), {
    message: "Folder name cannot contain parent directory traversal",
  })
  .refine((name) => !/[\x00-\x1F]/.test(name), {
    message: "Folder name cannot contain control characters",
  })
  .refine((name) => name.trim() !== "", {
    message: "Folder name cannot be blank",
  });

/**
 * Schema for search_history tool — the filtered read over the same history.
 * Every filter is optional; supplied filters combine.
 */
export const SearchHistoryInputSchema = z
  .object({
    path_glob: PathSchema.optional().describe(
      "Glob matched against the paths each entry recorded (full path, POSIX-style full path, or bare filename)",
    ),
    from: z
      .string()
      .optional()
      .describe("ISO date string - return entries at or after this time"),
    to: z
      .string()
      .optional()
      .describe("ISO date string - return entries at or before this time"),
    operation: z
      .string()
      .optional()
      .describe("Filter by operation name"),
    status: z
      .enum(["success", "error", "partial"])
      .optional()
      .describe("Filter by operation status"),
    source: z
      .enum(["manual", "scheduled"])
      .optional()
      .describe("Filter by operation source"),
    limit: z
      .number()
      .min(1)
      .max(1000)
      .optional()
      .default(20)
      .describe("Maximum number of entries to return"),
    privacy_mode: z
      .enum(["full", "redacted", "none"])
      .optional()
      .describe(
        "Privacy mode for output: full (all details), redacted (paths hidden), none (minimal info)",
      ),
  })
  .merge(CommonParamsSchema);

export type SearchHistoryInput = z.infer<typeof SearchHistoryInputSchema>;

/**
 * Schema for security mode configuration
 */
const SecurityModeSchema = z.enum(["strict", "sandboxed", "unrestricted"]);

/**
 * Schema for allowed paths configuration
 */
const AllowedPathsSchema = z.array(PathSchema).min(1);

type SecurityMode = z.infer<typeof SecurityModeSchema>;
type AllowedPaths = z.infer<typeof AllowedPathsSchema>;

export const GetCategoriesInputSchema = z.object({}).merge(CommonParamsSchema);

export const DoctorInputSchema = z.object({}).merge(CommonParamsSchema);

export type DoctorInput = z.infer<typeof DoctorInputSchema>;

export const SetCustomRulesInputSchema = z
  .object({
    rules: z.array(
      z.object({
        category: z.string(),
        extensions: z.array(z.string()).optional(),
        filename_pattern: z.string().optional(),
        priority: z.number().int().min(0).default(0),
      }),
    ),
  })
  .merge(CommonParamsSchema);

/**
 * Schema for export_config tool.
 *
 * output_path is optional: omit it and the bundle comes back in the response
 * without anything being written. rebaseRoot turns the machine-specific
 * directory paths into `~/relative` values that survive a different home.
 */
export const ExportConfigInputSchema = z
  .object({
    output_path: PathSchema.optional().describe(
      "Where to write the bundle JSON. Must pass path validation. The write refuses to overwrite an existing file. Omit to receive the bundle in the response instead of writing one.",
    ),
    rebase_root: PathSchema.optional().describe(
      "Directory on this machine that the target machine's home directory is expected to occupy, normally the home directory. Paths under it are exported as ~-relative instead of absolute.",
    ),
  })
  .merge(CommonParamsSchema);

export type ExportConfigInput = z.infer<typeof ExportConfigInputSchema>;

/**
 * Schema for export_report tool.
 *
 * output_path is optional on the same terms as export_config: omit it and the
 * report comes back in the response with nothing written, so there is no dry-run
 * flag to enforce and no way to call this tool that writes by accident.
 */
export const ExportReportInputSchema = z
  .object({
    directory: PathSchema.describe("Full path to the directory to report on"),
    include_subdirs: z
      .boolean()
      .default(true)
      .describe(
        "Recurse into subdirectories. Defaults to true because the files that matter for a health report usually sit below the directory you point at.",
      ),
    top_n: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(10)
      .describe("How many of the largest files to report (1-100)"),
    duplicate_limit: z
      .number()
      .int()
      .min(0)
      .max(1000)
      .default(10)
      .describe(
        "How many duplicate groups to list (0-1000). The group and wasted-space totals always cover every group found, so 0 reports the totals without listing any.",
      ),
    output_path: PathSchema.optional().describe(
      "Where to write the report. Must pass path validation. The write refuses to overwrite an existing file. Omit to receive the report in the response instead of writing one.",
    ),
  })
  .merge(CommonParamsSchema);

export type ExportReportInput = z.infer<typeof ExportReportInputSchema>;

/**
 * The exported bundle document, as read back off disk.
 *
 * `config` is deliberately loose: it is the config.json subset, already shaped
 * by UserConfig when it is built, and a bundle written by another version may
 * carry keys this one does not know. The envelope is what must match, so the
 * envelope is what is checked.
 *
 * format_version is a literal, not a range: loadConfigBundle names the version
 * it supports when it rejects a file, and a bundle of some future format must
 * fail here rather than load as this one.
 */
export const ConfigBundleSchema = z.object({
  format_version: z.literal(1),
  exported_by: z.string(),
  exported_at: z.string(),
  config: z.record(z.string(), z.unknown()),
  portability: z.object({
    mode: z.enum(["absolute", "rebased"]),
    rebase_root: z.string().nullable(),
    requires_editing: z.array(z.string()),
    non_portable_paths: z.array(
      z.object({
        field: z.string(),
        value: z.string(),
        reason: z.literal("outside_rebase_root"),
      }),
    ),
    notes: z.array(z.string()),
  }),
});

export type ConfigBundle = z.infer<typeof ConfigBundleSchema>;
