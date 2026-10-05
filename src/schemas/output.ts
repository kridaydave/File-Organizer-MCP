/**
 * Output Schemas
 *
 * Zod schemas for the structuredContent payloads of tools. The MCP server
 * needs JSON Schema, so each schema is converted once via z.toJSONSchema and
 * both forms are exported: the zod schema for tests, the JSON Schema for the
 * tool definition.
 */

import { z } from "zod";

const skippedFileSchema = z.object({
  path: z.string(),
  name: z.string(),
  size_bytes: z.number(),
  reason: z.enum([
    "empty_file",
    "exceeds_size_cap",
    "hash_failed",
    "timed_out",
  ]),
  detail: z.string(),
});

const duplicateFileSchema = z.object({
  name: z.string(),
  path: z.string(),
  size: z.number(),
  // Date instance in-process, ISO string on the wire. Either is acceptable.
  modified: z.unknown().optional(),
});

const duplicateGroupSchema = z.object({
  hash: z.string(),
  count: z.number(),
  size: z.string(),
  size_bytes: z.number(),
  files: z.array(duplicateFileSchema),
});

export const findDuplicatesOutputSchema = z.object({
  directory: z.string(),
  total_count: z.number(),
  returned_count: z.number(),
  offset: z.number(),
  has_more: z.boolean(),
  next_offset: z.number().optional(),
  items: z.array(duplicateGroupSchema),
  duplicate_groups: z.number(),
  total_duplicate_files: z.number(),
  wasted_space: z.string(),
  skipped: z.array(skippedFileSchema),
  skipped_bytes: z.number(),
});

const scoredFileSchema = z.object({
  path: z.string(),
  score: z.number(),
  reasons: z.array(z.string()),
});

const analyzedGroupSchema = z.object({
  hash: z.string(),
  size_bytes: z.number(),
  file_count: z.number(),
  files: z.array(scoredFileSchema),
  recommended_keep: z.string(),
  recommended_delete: z.array(z.string()),
  wasted_space_bytes: z.number(),
});

export const analyzeDuplicatesOutputSchema = z.object({
  summary: z.object({
    total_duplicate_groups: z.number(),
    total_duplicate_files: z.number(),
    total_wasted_space_bytes: z.number(),
    total_wasted_space_readable: z.string(),
    not_analyzed_files: z.number(),
    not_analyzed_bytes: z.number(),
  }),
  duplicate_groups: z.array(analyzedGroupSchema),
  skipped: z.array(skippedFileSchema),
});

export const deleteDuplicatesOutputSchema = z.object({
  deleted_count: z.number(),
  failed_count: z.number(),
  deleted_files: z.array(z.string()),
  failures: z.array(z.object({ path: z.string(), error: z.string() })),
  verified: z.boolean(),
  manifest_id: z.string().nullable(),
  partially_verified_files: z.array(z.string()),
});

const previewDeleteGroupSchema = z.object({
  hash: z.string(),
  size_bytes: z.number(),
  file_count: z.number(),
  keep: z.string(),
  would_delete: z.array(z.string()),
  wasted_space_bytes: z.number(),
});

export const previewDeleteDuplicatesOutputSchema = z.object({
  dry_run: z.boolean(),
  keep_strategy: z.enum(["newest", "oldest", "keep_first"]),
  summary: z.object({
    total_duplicate_groups: z.number(),
    total_files_to_delete: z.number(),
    total_wasted_space_bytes: z.number(),
    total_wasted_space_readable: z.string(),
    not_analyzed_files: z.number(),
    not_analyzed_bytes: z.number(),
  }),
  duplicate_groups: z.array(previewDeleteGroupSchema),
  files_to_delete: z.array(z.string()),
  skipped: z.array(skippedFileSchema),
});

export const organizeFilesOutputSchema = z.object({
  directory: z.string(),
  dry_run: z.boolean(),
  total_files: z.number(),
  statistics: z.record(z.string(), z.number()),
  actions: z.array(
    z.object({
      file: z.string(),
      from: z.string(),
      to: z.string(),
      category: z.string(),
    }),
  ),
  errors: z.array(z.string()),
  errorCount: z.number(),
  successCount: z.number(),
  aborted: z.boolean(),
  content_analysis_enabled: z.boolean().optional(),
});

export const previewOrganizationOutputSchema = z.object({
  summary: z.object({
    total_files: z.number(),
    categories_affected: z.record(z.string(), z.number()),
    estimated_duration_seconds: z.number(),
    warnings: z.array(z.string()),
  }),
  moves: z.array(
    z.object({
      source: z.string(),
      destination: z.string(),
      category: z.string(),
      conflict: z.boolean(),
      conflict_resolution: z
        .enum(["rename", "skip", "overwrite", "overwrite_if_newer"])
        .optional(),
    }),
  ),
  conflicts: z.array(z.object({ file: z.string(), reason: z.string() })),
  skipped_files: z.array(z.object({ path: z.string(), reason: z.string() })),
});

export const validateOrganizationPlanOutputSchema = z.object({
  directory: z.string(),
  ok: z.boolean(),
  moves_checked: z.number(),
  counts: z.object({ error: z.number(), warning: z.number() }),
  findings: z.array(
    z.object({
      kind: z.enum([
        "destination_name_collision",
        "destination_exists",
        "cross_device_move",
        "sensitive_source",
        "incomplete_plan",
      ]),
      severity: z.enum(["error", "warning"]),
      sources: z.array(z.string()),
      destinations: z.array(z.string()),
      detail: z.string(),
    }),
  ),
  checked: z.array(z.string()),
  not_checked: z.array(z.string()),
});

export const findBrokenSymlinksOutputSchema = z.object({
  directory: z.string(),
  scanned_count: z.number(),
  truncated: z.boolean(),
  total_count: z.number(),
  dangling_count: z.number(),
  escaping_count: z.number(),
  circular_count: z.number(),
  findings: z.array(
    z.object({
      path: z.string(),
      link_target: z.string(),
      kind: z.enum(["dangling", "escapes_allowed_roots", "circular"]),
      detail: z.string(),
      resolved_target: z.string().optional(),
    }),
  ),
});

const renameCollisionSchema = z.object({
  kind: z.enum(["duplicate_target", "destination_exists"]),
  destination: z.string(),
  sources: z.array(z.string()),
});

const renamePreviewSchema = z.object({
  original: z.string(),
  new: z.string(),
  willChange: z.boolean(),
  conflict: z.boolean(),
  error: z.string().optional(),
});

/**
 * batch_rename reports collisions on every response, in both formats, so an
 * agent can act on them without re-running in json. `rejected` is the field to
 * branch on: it is true only when a real run was stopped before the first
 * rename, which is the only case where nothing moved.
 */
export const findEmptyDirectoriesOutputSchema = z.object({
  directory: z.string(),
  scanned_count: z.number(),
  depth_limited: z.boolean(),
  result_limited: z.boolean(),
  limit: z.number(),
  total_count: z.number(),
  empty_dirs: z.array(z.string()),
});

export const batchRenameOutputSchema = z.object({
  dry_run: z.boolean(),
  rejected: z.boolean(),
  renamed: z.number(),
  processed: z.number(),
  rules: z.array(z.record(z.string(), z.unknown())),
  conflicts: z.array(renameCollisionSchema),
  previews: z.array(renamePreviewSchema).optional(),
  result: z
    .object({
      statistics: z.object({
        total: z.number(),
        renamed: z.number(),
        skipped: z.number(),
        failed: z.number(),
      }),
      successes: z.array(
        z.object({ original: z.string(), new: z.string() }),
      ),
      errors: z.array(z.string()),
    })
    .optional(),
});

export const diskUsageByCategoryOutputSchema = z.object({
  directory: z.string(),
  total_files: z.number(),
  total_size: z.number(),
  total_size_readable: z.string(),
  categories: z.array(
    z.object({
      category: z.string(),
      file_count: z.number(),
      total_size: z.number(),
      total_size_readable: z.string(),
      percent_of_total: z.number(),
    }),
  ),
});

/**
 * sensitive_scan. `limits` is part of the contract, not decoration: the risk
 * score is a heuristic and a caller that drops the caveat reads a zero as a
 * clearance the scan never gave.
 */
export const sensitiveScanOutputSchema = z.object({
  directory: z.string(),
  scanned_count: z.number(),
  skipped_count: z.number(),
  flagged_count: z.number(),
  highest_risk_score: z.number(),
  truncated: z.boolean(),
  files: z.array(
    z.object({
      path: z.string(),
      name: z.string(),
      format: z.string(),
      risk_score: z.number(),
      risk_level: z.enum(["none", "low", "medium", "high"]),
      reasons: z.array(
        z.object({
          kind: z.enum([
            "gps_coordinates",
            "gps_altitude",
            "gps_timestamp",
            "owner_name",
            "serial_number",
            "camera_device",
            "copyright",
            "software",
            "notes_or_comment",
          ]),
          weight: z.number(),
          detail: z.string(),
          exif_tags: z.array(z.string()),
          value: z.string().optional(),
        }),
      ),
    }),
  ),
  skipped: z.array(
    z.object({
      path: z.string(),
      name: z.string(),
      reason: z.enum(["format_not_analyzed", "unreadable"]),
      detail: z.string(),
    }),
  ),
  limits: z.array(z.string()),
});

export const undoOutputSchema = z.object({
  success: z.number(),
  failed: z.number(),
  errors: z.array(z.string()),
});

export const verifyIntegrityOutputSchema = z.object({
  manifest_id: z.string(),
  description: z.string(),
  recorded_at: z.number(),
  total_files: z.number(),
  checked: z.number(),
  unchanged: z.number(),
  modified: z.number(),
  missing: z.number(),
  unverifiable: z.number(),
  drift_detected: z.boolean(),
  verified: z.boolean(),
  files: z.array(
    z.object({
      path: z.string(),
      status: z.enum(["unchanged", "modified", "missing", "unverifiable"]),
      reason: z.string().optional(),
      expected_hash: z.string().optional(),
      actual_hash: z.string().optional(),
    }),
  ),
});

export const doctorOutputSchema = z.object({
  version: z.string(),
  platform: z.string(),
  config_file_present: z.boolean(),
  security: z.object({
    enable_path_validation: z.boolean(),
    allow_custom_directories: z.boolean(),
    log_access: z.boolean(),
    max_scan_depth: z.number(),
    max_files_per_operation: z.number(),
  }),
  conflict_strategy: z.string(),
  allow_external_volumes: z.boolean(),
  custom_rule_count: z.number(),
  history_logging: z
    .object({
      enabled: z.boolean().optional(),
      maxFileSizeMB: z.number().optional(),
      keepRotatedFiles: z.number().optional(),
      privacyMode: z.string().optional(),
    })
    .optional(),
  auto_organize: z
    .object({
      enabled: z.boolean(),
      schedule: z.string().optional(),
    })
    .optional(),
  default_allowed: z.array(z.string()),
  configured_allowed_dirs: z.array(
    z.object({
      configured: z.string(),
      resolved: z.string(),
      exists: z.boolean(),
      is_directory: z.boolean(),
      symlink: z.boolean(),
      accepted: z.boolean(),
      rejection: z.string().optional(),
      blocked_by_policy: z.boolean(),
    }),
  ),
  effective_allowed_dirs: z.array(z.string()),
  unknown_config_keys: z.array(z.string()),
  problems: z.array(z.string()),
  healthy: z.boolean(),
});

const quarantineItemSchema = z.object({
  file: z.string(),
  from: z.string(),
  to: z.string(),
});

export const quarantineFilesOutputSchema = z.object({
  directory: z.string(),
  quarantine_dir: z.string(),
  dry_run: z.boolean(),
  requested: z.number(),
  planned: z.number(),
  quarantined: z.number(),
  items: z.array(quarantineItemSchema),
  skipped: z.array(z.object({ path: z.string(), reason: z.string() })),
  errors: z.array(z.string()),
  manifest_id: z.string().optional(),
  reason: z.string().optional(),
});

export const restoreQuarantineOutputSchema = z.object({
  dry_run: z.boolean(),
  quarantine_id: z.string(),
  requested: z.number(),
  planned: z.number(),
  restored: z.number(),
  items: z.array(quarantineItemSchema),
  errors: z.array(z.string()),
  manifest_id: z.string().optional(),
});

export const exportConfigOutputSchema = z.object({
  format_version: z.number(),
  mode: z.enum(["absolute", "rebased"]),
  rebase_root: z.string().nullable(),
  output_path: z.string().nullable(),
  written: z.boolean(),
  bytes_written: z.number(),
  config_file_present: z.boolean(),
  counts: z.object({
    custom_allowed_directories: z.number(),
    custom_rules: z.number(),
    rules: z.number(),
    watch_entries: z.number(),
  }),
  requires_editing: z.array(z.string()),
  non_portable_paths: z.array(
    z.object({
      field: z.string(),
      value: z.string(),
      reason: z.string(),
    }),
  ),
  notes: z.array(z.string()),
  config: z.record(z.string(), z.unknown()),
});

/**
 * export_report. The four sections are the point of the tool, so they are the
 * shape:
 *
 * - `scan` totals and `categories` come from ONE directory walk. `categories`
 *   is `summarizeDiskUsage` verbatim, so the breakdown here and the one
 *   `disk_usage_by_category` reports cannot drift apart.
 * - `duplicates` totals cover EVERY group found; `groups` is the bounded slice
 *   `duplicate_limit` asked for. Reporting totals over a truncated list would
 *   let a report say "3 duplicate groups" and then show none of them.
 * - `top_files` is bounded by `top_n`, largest first.
 * - `limits` states in prose whatever the numbers above under-report, so a
 *   partial analysis is never read as a complete one.
 *
 * `written` is the field to branch on for "did this touch the disk": it is false
 * exactly when no output_path was given, which is also the only case in which
 * nothing was written.
 *
 * Every path here is a real filesystem path the scanner returned, not a value
 * assembled from segments, so it carries the platform separator on purpose. A
 * contract string such as a folder label must never be built this way.
 */
export const exportReportOutputSchema = z.object({
  directory: z.string(),
  include_subdirs: z.boolean(),
  generated_at: z.string(),
  output_path: z.string().nullable(),
  written: z.boolean(),
  // Absent from the file on disk, because the size of a write cannot be known
  // before the bytes exist. The response always carries it.
  bytes_written: z.number().optional(),
  scan: z.object({
    total_files: z.number(),
    total_size: z.number(),
    total_size_readable: z.string(),
  }),
  categories: z.array(
    z.object({
      category: z.string(),
      file_count: z.number(),
      total_size: z.number(),
      total_size_readable: z.string(),
      percent_of_total: z.number(),
    }),
  ),
  duplicates: z.object({
    total_groups: z.number(),
    total_files: z.number(),
    wasted_space: z.number(),
    wasted_space_readable: z.string(),
    groups_listed: z.number(),
    groups: z.array(
      z.object({
        hash: z.string(),
        count: z.number(),
        size: z.string(),
        size_bytes: z.number(),
        files: z.array(z.string()),
      }),
    ),
    skipped_count: z.number(),
    skipped_bytes: z.number(),
  }),
  top_files: z.array(
    z.object({
      name: z.string(),
      path: z.string(),
      size: z.number(),
      size_readable: z.string(),
    }),
  ),
  limits: z.array(z.string()),
});

type JsonSchemaObject = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
};

export const findDuplicatesOutputJsonSchema = z.toJSONSchema(
  findDuplicatesOutputSchema,
) as JsonSchemaObject;
export const analyzeDuplicatesOutputJsonSchema = z.toJSONSchema(
  analyzeDuplicatesOutputSchema,
) as JsonSchemaObject;
export const deleteDuplicatesOutputJsonSchema = z.toJSONSchema(
  deleteDuplicatesOutputSchema,
) as JsonSchemaObject;
export const previewDeleteDuplicatesOutputJsonSchema = z.toJSONSchema(
  previewDeleteDuplicatesOutputSchema,
) as JsonSchemaObject;
export const organizeFilesOutputJsonSchema = z.toJSONSchema(
  organizeFilesOutputSchema,
) as JsonSchemaObject;
export const previewOrganizationOutputJsonSchema = z.toJSONSchema(
  previewOrganizationOutputSchema,
) as JsonSchemaObject;
export const validateOrganizationPlanOutputJsonSchema = z.toJSONSchema(
  validateOrganizationPlanOutputSchema,
) as JsonSchemaObject;
export const undoOutputJsonSchema = z.toJSONSchema(
  undoOutputSchema,
) as JsonSchemaObject;
export const verifyIntegrityOutputJsonSchema = z.toJSONSchema(
  verifyIntegrityOutputSchema,
) as JsonSchemaObject;
export const doctorOutputJsonSchema = z.toJSONSchema(
  doctorOutputSchema,
) as JsonSchemaObject;
export const findEmptyDirectoriesOutputJsonSchema = z.toJSONSchema(
  findEmptyDirectoriesOutputSchema,
) as JsonSchemaObject;
export const findBrokenSymlinksOutputJsonSchema = z.toJSONSchema(
  findBrokenSymlinksOutputSchema,
) as JsonSchemaObject;
export const batchRenameOutputJsonSchema = z.toJSONSchema(
  batchRenameOutputSchema,
) as JsonSchemaObject;
export const diskUsageByCategoryOutputJsonSchema = z.toJSONSchema(
  diskUsageByCategoryOutputSchema,
) as JsonSchemaObject;
export const quarantineFilesOutputJsonSchema = z.toJSONSchema(
  quarantineFilesOutputSchema,
) as JsonSchemaObject;
export const restoreQuarantineOutputJsonSchema = z.toJSONSchema(
  restoreQuarantineOutputSchema,
) as JsonSchemaObject;
export const exportConfigOutputJsonSchema = z.toJSONSchema(
  exportConfigOutputSchema,
) as JsonSchemaObject;
export const exportReportOutputJsonSchema = z.toJSONSchema(
  exportReportOutputSchema,
) as JsonSchemaObject;
export const sensitiveScanOutputJsonSchema = z.toJSONSchema(
  sensitiveScanOutputSchema,
) as JsonSchemaObject;
