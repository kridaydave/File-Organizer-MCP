/**
 * File Organizer MCP Server v5.0.0
 * organization-preview Tool
 *
 * @module tools/organization-preview
 */

import { z } from "zod";
import type {
  ToolDefinition,
  ToolResponse,
  OrganizationPlan,
} from "../types.js";
import { validateStrictPath } from "../services/path-validator.service.js";
import { FileScannerService } from "../core/scan/scanner.js";
import { OrganizerService } from "../core/organize/organizer.js";
import { CategorizerService } from "../services/categorizer.service.js";
import { createErrorResponse } from "../utils/error-handler.js";
import { PreviewOrganizationInputSchema } from "../schemas/organize.js";
import {
  createRequestContext,
  type ToolContext,
} from "../mcp/context.js";

export interface MoveItem {
  source: string;
  destination: string;
  category: string;
  conflict: boolean;
  conflict_resolution?: "rename" | "skip" | "overwrite" | "overwrite_if_newer";
}

export interface SkippedFile {
  path: string;
  reason: string;
}

export { PreviewOrganizationInputSchema } from "../schemas/organize.js";
export type { PreviewOrganizationInput } from "../schemas/organize.js";
export const previewOrganizationToolDefinition: ToolDefinition = {
  name: "file_organizer_preview_organization",
  title: "Preview File Organization Plan",
  description:
    "Shows what would happen if files were organized, WITHOUT making any changes. Shows moves, conflicts, and skip reasons.",
  inputSchema: {
    type: "object",
    properties: {
      directory: { type: "string", description: "Full path to the directory" },
      show_conflicts_only: { type: "boolean", default: false },
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        default: "markdown",
      },
      conflict_strategy: {
        type: "string",
        enum: ["rename", "skip", "overwrite"],
        description:
          "How to handle file conflicts for preview (rename/skip/overwrite). Uses config default if not specified",
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

export async function handlePreviewOrganization(
  args: Record<string, unknown>,
  ctx: ToolContext = createRequestContext(),
): Promise<ToolResponse> {
  try {
    const parsed = PreviewOrganizationInputSchema.safeParse(args);
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
      directory,
      show_conflicts_only,
      response_format,
      conflict_strategy,
    } = parsed.data;
    const validatedPath = await validateStrictPath(directory);

    const scanner = new FileScannerService();
    const organizer = new OrganizerService(
      new CategorizerService(ctx.config.customRules ?? []),
    );

    // Use provided strategy, or fall back to config, or default to 'rename'
    const effectiveConflictStrategy =
      conflict_strategy ?? ctx.config.conflictStrategy ?? "rename";

    const files = await scanner.getAllFiles(validatedPath, false);
    const plan = await organizer.generateOrganizationPlan(
      validatedPath,
      files,
      effectiveConflictStrategy,
    );

    const output = {
      summary: {
        total_files: plan.moves.length,
        categories_affected: plan.categoryCounts,
        estimated_duration_seconds: plan.estimatedDuration,
        warnings: plan.warnings,
      },
      moves: plan.moves.map((m: OrganizationPlan["moves"][0]) => ({
        source: m.source,
        destination: m.destination,
        category: m.category,
        conflict: m.hasConflict,
        conflict_resolution: m.conflictResolution,
      })),
      conflicts: plan.conflicts,
      skipped_files: plan.skippedFiles.map(
        (f: { path: string; reason: string }) => ({
          path: f.path,
          reason: f.reason,
        }),
      ),
    };

    if (show_conflicts_only) {
      output.moves = output.moves.filter((m: MoveItem) => m.conflict);
    }

    if (response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output as unknown as Record<string, unknown>,
      };
    }

    const markdown = `### Organization Preview for \`${directory}\`

**Summary:**
- Files to Move: ${output.summary.total_files}
- Estimated Time: ${output.summary.estimated_duration_seconds.toFixed(2)}s
- Conflicts: ${output.moves.filter((m: MoveItem) => m.conflict).length}
- Conflict Strategy: ${effectiveConflictStrategy}

**Category Breakdown:**
${Object.entries(output.summary.categories_affected)
  .map(([cat, count]) => `- **${cat}**: ${count}`)
  .join("\n")}

**Proposed Moves:**
${output.moves.map((m: MoveItem) => `- \`${m.source}\` -> \`${m.destination}\` ${m.conflict ? `⚠️ (${m.conflict_resolution || "Rename"})` : ""}`).join("\n")}

${output.skipped_files.length ? `**Skipped Files:**\n${output.skipped_files.map((f: SkippedFile) => `- ${f.path}: ${f.reason}`).join("\n")}` : ""}
`;

    return {
      content: [{ type: "text", text: markdown }],
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}
