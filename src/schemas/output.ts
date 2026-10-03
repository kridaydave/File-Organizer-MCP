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

export const undoOutputSchema = z.object({
  success: z.number(),
  failed: z.number(),
  errors: z.array(z.string()),
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
export const doctorOutputJsonSchema = z.toJSONSchema(
  doctorOutputSchema,
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
