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
  reason: z.enum(["empty_file", "exceeds_size_cap", "hash_failed", "timed_out"]),
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

export const undoOutputSchema = z.object({
  success: z.number(),
  failed: z.number(),
  errors: z.array(z.string()),
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
export const undoOutputJsonSchema = z.toJSONSchema(
  undoOutputSchema,
) as JsonSchemaObject;
