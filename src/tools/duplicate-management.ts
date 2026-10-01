/**
 * File Organizer MCP Server v5.0.0
 * duplicate-management Tool (Analyze and Delete Duplicates)
 *
 * @module tools/duplicate-management
 */

import type { ToolDefinition, ToolResponse } from "../types.js";
import { validateStrictPath } from "../services/path-validator.service.js";
import { FileScannerService } from "../core/scan/scanner.js";
import { DuplicateFinderService } from "../core/hash/duplicate-finder.js";
import { createErrorResponse } from "../utils/error-handler.js";
import { formatBytes, renderSkippedNotice } from "../utils/formatters.js";
import {
  AnalyzeDuplicatesInputSchema,
  DeleteDuplicatesInputSchema,
} from "../schemas/scan.js";

export {
  AnalyzeDuplicatesInputSchema,
  DeleteDuplicatesInputSchema,
} from "../schemas/scan.js";
export type {
  AnalyzeDuplicatesInput,
  DeleteDuplicatesInput,
} from "../schemas/scan.js";
export const analyzeDuplicatesToolDefinition: ToolDefinition = {
  name: "file_organizer_analyze_duplicates",
  title: "Analyze Duplicate Files with Smart Recommendations",
  description:
    "Finds duplicate files and suggests which to keep/delete based on location, name quality, and age.",
  inputSchema: {
    type: "object",
    properties: {
      directory: { type: "string" },
      recommendation_strategy: {
        type: "string",
        enum: ["newest", "oldest", "best_location", "best_name"],
        default: "best_location",
      },
      auto_select_keep: { type: "boolean", default: false },
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        default: "markdown",
      },
    },
    required: ["directory"],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
};

export const deleteDuplicatesToolDefinition: ToolDefinition = {
  name: "file_organizer_delete_duplicates",
  title: "Delete Duplicate Files",
  description:
    "Deletes specified duplicate files. DESTRUCTIVE. Every candidate is hashed and checked against surviving copies before anything is removed. The search walks each candidate's parent and grandparent directory recursively, plus any candidate_directories you pass, up to 10 levels deep and 10000 files, skipping dot-entries and node_modules/.git/__pycache__/.venv; a copy kept outside those roots is not found and the deletion is refused, so pass its directory if the surviving copy lives elsewhere. Files over the hashing size cap are checked by size plus sampled content, which is weaker than a full hash and is reported as partially verified. Deleted files go to a recoverable backup dir; pass the returned manifest_id to file_organizer_undo_last_operation to restore them.",
  inputSchema: {
    type: "object",
    properties: {
      files_to_delete: { type: "array", items: { type: "string" } },
      create_backup_manifest: { type: "boolean", default: true },
      verify_before_delete: {
        type: "boolean",
        default: true,
        description:
          "Hash each candidate and refuse to delete a file with no surviving copy in the searched directories (default true)",
      },
      candidate_directories: {
        type: "array",
        items: { type: "string" },
        default: [],
        description:
          "Extra directories to search for surviving copies during verification, walked the same way as the candidate's parent and grandparent. Without these, only those two roots are searched recursively, so a copy kept in an unrelated directory is not found and the deletion is refused.",
      },
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        default: "markdown",
      },
    },
    required: ["files_to_delete"],
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
};

export async function handleAnalyzeDuplicates(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = AnalyzeDuplicatesInputSchema.safeParse(args);
    if (!parsed.success) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
          },
        ],
        isError: true,
      };
    }

    const { directory, recommendation_strategy, response_format } = parsed.data;
    const validatedPath = await validateStrictPath(directory);

    const scanner = new FileScannerService();
    const duplicateFinder = new DuplicateFinderService(); // Stateless service is fine

    const files = await scanner.getAllFiles(validatedPath, true); // Recursive? User usually expects deep dupes
    const analysis = await duplicateFinder.findWithScoring(
      files,
      recommendation_strategy,
    );
    const analyzed = analysis.groups;

    const summary = {
      total_duplicate_groups: analyzed.length,
      total_duplicate_files: analyzed.reduce(
        (sum, g) => sum + g.file_count - 1,
        0,
      ),
      total_wasted_space_bytes: analyzed.reduce(
        (sum, g) => sum + g.wasted_space_bytes,
        0,
      ),
      total_wasted_space_readable: formatBytes(
        analyzed.reduce((sum, g) => sum + g.wasted_space_bytes, 0),
      ),
      not_analyzed_files: analysis.skipped.length,
      not_analyzed_bytes: analysis.skipped_bytes,
    };

    if (response_format === "json") {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                summary,
                duplicate_groups: analyzed,
                skipped: analysis.skipped,
              },
              null,
              2,
            ),
          },
        ],
        structuredContent: {
          summary,
          duplicate_groups: analyzed,
          skipped: analysis.skipped,
        },
      };
    }

    const skippedNotice = renderSkippedNotice(
      analysis.skipped,
      analysis.skipped_bytes,
      "the analysis above is partial.",
    );

    const markdown = `### Duplicate Analysis for \`${directory}\`
**Strategy:** ${recommendation_strategy}
**Wasted Space:** ${summary.total_wasted_space_readable}
**Duplicate Groups:** ${summary.total_duplicate_groups}

${analyzed
  .map(
    (g, i) => `
#### Group ${i + 1} (${formatBytes(g.size_bytes)})
**Keep:** \`${g.recommended_keep}\`
**Delete:**
${g.files
  .slice(1)
  .map(
    (f) => `- \`${f.path}\` (Score: ${f.score})
  - ${f.reasons.join(", ")}`,
  )
  .join("\n")}
`,
  )
  .join("\n")}${skippedNotice ? `\n${skippedNotice}` : ""}
`;
    return { content: [{ type: "text", text: markdown }] };
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleDeleteDuplicates(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = DeleteDuplicatesInputSchema.safeParse(args);
    if (!parsed.success) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
          },
        ],
        isError: true,
      };
    }

    const {
      files_to_delete,
      create_backup_manifest,
      verify_before_delete,
      candidate_directories,
      response_format,
    } = parsed.data;
    const duplicateFinder = new DuplicateFinderService();

    // Verification is on by default: this tool hands paths to a filesystem
    // mutation, and an unverified delete can take the last copy of a file.
    const result = await duplicateFinder.deleteFiles(files_to_delete, {
      createBackupManifest: create_backup_manifest,
      autoVerify: verify_before_delete,
      candidateDirectories: candidate_directories,
    });

    const output = {
      deleted_count: result.deleted.length,
      failed_count: result.failed.length,
      deleted_files: result.deleted,
      failures: result.failed,
      verified: verify_before_delete,
      manifest_id: result.manifestPath ?? null,
      partially_verified_files: result.partiallyVerified ?? [],
    };
    const hasFailures = output.failed_count > 0;

    if (response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output as unknown as Record<string, unknown>,
        ...(hasFailures && { isError: true }),
      };
    }

    const markdown = `### Deletion Report
✅ **Deleted:** ${output.deleted_count} files
❌ **Failed:** ${output.failed_count} files
${output.verified ? "🔎 **Verified:** each file was hashed and confirmed to have a surviving copy" : "⚠️ **Unverified:** deletion ran without confirming a surviving copy exists"}

${output.partially_verified_files.length > 0 ? `\n🟡 **Partially verified:** ${output.partially_verified_files.length} file(s) exceed the hashing size cap, so their surviving-copy check compared size plus the first and last 64KB rather than the full content. Treat this as a weaker check, not proof of equality.\n` : ""}
${output.manifest_id ? `↩️ **Recoverable:** pass manifest_id \`${output.manifest_id}\` to \`file_organizer_undo_last_operation\` to restore the deleted files.\n` : ""}
${output.failures.length > 0 ? `**Failures:**\n${output.failures.map((f) => `- ${f.path}: ${f.error}`).join("\n")}` : ""}
`;
    return {
      content: [{ type: "text", text: markdown }],
      ...(hasFailures && { isError: true }),
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}
