/**
 * File Organizer MCP Server v3.4.1
 * duplicate-management Tool (Analyze and Delete Duplicates)
 *
 * @module tools/duplicate-management
 */

import { z } from "zod";
import type { ToolDefinition, ToolResponse } from "../types.js";
import { validateStrictPath } from "../services/path-validator.service.js";
import { FileScannerService } from "../services/file-scanner.service.js";
import { DuplicateFinderService } from "../services/duplicate-finder.service.js";
import { createErrorResponse } from "../utils/error-handler.js";
import { formatBytes } from "../utils/formatters.js";
import { CommonParamsSchema } from "../schemas/common.schemas.js";

export const AnalyzeDuplicatesInputSchema = z
  .object({
    directory: z.string().min(1, "Directory path cannot be empty"),
    recommendation_strategy: z
      .enum(["newest", "oldest", "best_location", "best_name"])
      .default("best_location"),
    auto_select_keep: z.boolean().default(false),
  })
  .merge(CommonParamsSchema);

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

export const DeleteDuplicatesInputSchema = z
  .object({
    files_to_delete: z.array(z.string()).min(1),
    create_backup_manifest: z.boolean().default(true),
  })
  .merge(CommonParamsSchema);

export const deleteDuplicatesToolDefinition: ToolDefinition = {
  name: "file_organizer_delete_duplicates",
  title: "Delete Duplicate Files",
  description:
    "Permanently deletes specified duplicate files. DESTRUCTIVE. Verifies hash/size before deletion.",
  inputSchema: {
    type: "object",
    properties: {
      files_to_delete: { type: "array", items: { type: "string" } },
      create_backup_manifest: { type: "boolean", default: true },
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
      };
    }

    const { directory, recommendation_strategy, response_format } = parsed.data;
    const validatedPath = await validateStrictPath(directory);

    const scanner = new FileScannerService();
    const duplicateFinder = new DuplicateFinderService(); // Stateless service is fine

    const files = await scanner.getAllFiles(validatedPath, true); // Recursive? User usually expects deep dupes
    const analyzed = await duplicateFinder.findWithScoring(
      files,
      recommendation_strategy,
    );

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
    };

    if (response_format === "json") {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { summary, duplicate_groups: analyzed },
              null,
              2,
            ),
          },
        ],
        structuredContent: { summary, duplicate_groups: analyzed },
      };
    }

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
  .join("\n")}
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
      };
    }

    const { files_to_delete, create_backup_manifest, response_format } =
      parsed.data;
    const duplicateFinder = new DuplicateFinderService();

    const result = await duplicateFinder.deleteFiles(files_to_delete, {
      createBackupManifest: create_backup_manifest,
    });

    const output = {
      deleted_count: result.deleted.length,
      failed_count: result.failed.length,
      deleted_files: result.deleted,
      failures: result.failed,
    };

    if (response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output as unknown as Record<string, unknown>,
      };
    }

    const markdown = `### Deletion Report
✅ **Deleted:** ${output.deleted_count} files
❌ **Failed:** ${output.failed_count} files

${output.failures.length > 0 ? `**Failures:**\n${output.failures.map((f) => `- ${f.path}: ${f.error}`).join("\n")}` : ""}
`;
    return { content: [{ type: "text", text: markdown }] };
  } catch (error) {
    return createErrorResponse(error);
  }
}
