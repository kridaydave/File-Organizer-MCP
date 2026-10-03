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
  PlanValidationResult,
} from "../types.js";
import { validateStrictPath } from "../services/path-validator.service.js";
import { FileScannerService } from "../core/scan/scanner.js";
import { OrganizerService } from "../core/organize/organizer.js";
import { validateOrganizationPlan } from "../core/organize/plan-validation.js";
import { CategorizerService } from "../services/categorizer.service.js";
import { createErrorResponse } from "../utils/error-handler.js";
import { PreviewOrganizationInputSchema } from "../schemas/organize.js";
import { ValidateOrganizationPlanInputSchema } from "../schemas/organize.js";
import {
  previewOrganizationOutputJsonSchema,
  validateOrganizationPlanOutputJsonSchema,
} from "../schemas/output.js";
import { createRequestContext, type ToolContext } from "../mcp/context.js";

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
export { ValidateOrganizationPlanInputSchema } from "../schemas/organize.js";
export type { ValidateOrganizationPlanInput } from "../schemas/organize.js";

/**
 * The plan both preview_organization and validate_organization_plan report on.
 * One builder, so the dry-run check is a check on the plan organize would run
 * rather than a second, drifting plan path.
 */
async function buildPlan(
  directory: string,
  conflictStrategy: "rename" | "skip" | "overwrite",
  includeSubdirs: boolean,
  ctx: ToolContext,
): Promise<OrganizationPlan> {
  // Services are stateless — build them per request from the request's config.
  const scanner = new FileScannerService();
  const organizer = new OrganizerService(
    new CategorizerService(ctx.config.customRules ?? []),
  );
  const files = await scanner.getAllFiles(directory, includeSubdirs);
  return organizer.generateOrganizationPlan(directory, files, conflictStrategy);
}

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
  outputSchema: previewOrganizationOutputJsonSchema,
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

    // Use provided strategy, or fall back to config, or default to 'rename'
    const effectiveConflictStrategy =
      conflict_strategy ?? ctx.config.conflictStrategy ?? "rename";

    const plan = await buildPlan(
      validatedPath,
      effectiveConflictStrategy,
      false,
      ctx,
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
      structuredContent: output as unknown as Record<string, unknown>,
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}

export const validateOrganizationPlanToolDefinition: ToolDefinition = {
  name: "file_organizer_validate_organization_plan",
  title: "Validate Organization Plan",
  description:
    "Checks the organization plan organize_files would execute and returns an ok / not-ok verdict. Read-only: nothing is moved, renamed, or deleted. Flags two or more sources landing on one destination name, destinations that already exist, moves that cross a device boundary (compared with fs.stat device ids), and sources the sensitive-file gate would refuse. Reports `checked` and `not_checked` so a clean result is not read as a guarantee. Builds the plan with the same conflict_strategy organize_files would use; pass include_subdirs=true to check a plan over subdirectories, which organize_files itself does not scan. Every path it reports (directory, sources, destinations) is an absolute filesystem path in the platform's native form, byte-identical to what preview_organization and organize_files report for the same plan; no separator normalization is applied, so match them with path-aware logic rather than string equality.",
  inputSchema: {
    type: "object",
    properties: {
      directory: {
        type: "string",
        description: "Full path to the directory",
      },
      include_subdirs: {
        type: "boolean",
        description:
          "Validate a plan built over subdirectories. Default false matches the depth organize_files scans",
        default: false,
      },
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        default: "markdown",
      },
      conflict_strategy: {
        type: "string",
        enum: ["rename", "skip", "overwrite"],
        description:
          "How to handle file conflicts for the validated plan. Uses config default if not specified",
      },
    },
    required: ["directory"],
  },
  outputSchema: validateOrganizationPlanOutputJsonSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
};

const FINDING_TITLES: Record<string, string> = {
  destination_name_collision: "Destination name collision",
  destination_exists: "Destination already exists",
  cross_device_move: "Cross-device move",
  sensitive_source: "Blocked by the sensitive-file gate",
  incomplete_plan: "Plan is incomplete",
};

function planMarkdown(result: PlanValidationResult): string {
  const verdict = result.ok ? "OK" : "NOT OK";
  const list = (paths: string[]) => paths.map((p) => `\`${p}\``).join(", ");
  const findings =
    result.findings.length === 0
      ? "No findings."
      : result.findings
          .map((f) => {
            const lines = [
              `- **${FINDING_TITLES[f.kind] ?? f.kind}** (${f.severity}): ${f.detail}`,
            ];
            if (f.sources.length > 0) {
              lines.push(`  - sources: ${list(f.sources)}`);
            }
            if (f.destinations.length > 0) {
              lines.push(`  - destinations: ${list(f.destinations)}`);
            }
            return lines.join("\n");
          })
          .join("\n");

  return `### Plan validation for \`${result.directory}\`: ${verdict}

**Summary:**
- Moves checked: ${result.moves_checked}
- Errors: ${result.counts.error}
- Warnings: ${result.counts.warning}

**Findings:**
${findings}

**Checked:**
${result.checked.map((c) => `- ${c}`).join("\n")}

**Not checked:**
${result.not_checked.map((c) => `- ${c}`).join("\n")}

_All paths above are absolute and in the platform's native form, the same strings preview_organization and organize_files report._`;
}

export async function handleValidateOrganizationPlan(
  args: Record<string, unknown>,
  ctx: ToolContext = createRequestContext(),
): Promise<ToolResponse> {
  try {
    const parsed = ValidateOrganizationPlanInputSchema.safeParse(args);
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

    const { directory, include_subdirs, response_format, conflict_strategy } =
      parsed.data;
    const validatedPath = await validateStrictPath(directory);

    const effectiveConflictStrategy =
      conflict_strategy ?? ctx.config.conflictStrategy ?? "rename";

    const plan = await buildPlan(
      validatedPath,
      effectiveConflictStrategy,
      include_subdirs,
      ctx,
    );
    const result = await validateOrganizationPlan(validatedPath, plan);

    if (response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    }

    // The markdown path still carries structuredContent because the tool
    // declares an outputSchema and the SDK rejects results without it.
    return {
      content: [{ type: "text", text: planMarkdown(result) }],
      structuredContent: result as unknown as Record<string, unknown>,
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}
