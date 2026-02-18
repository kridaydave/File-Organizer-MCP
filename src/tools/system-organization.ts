/**
 * File Organizer MCP Server v3.4.0
 * System Organization Tool
 *
 * Organizes files into OS-standard system directories
 * (Music, Documents, Pictures, Videos)
 *
 * @module tools/system-organization
 */

import { z } from "zod";
import type { ToolDefinition, ToolResponse } from "../types.js";
import { validateStrictPath } from "../services/path-validator.service.js";
import { SystemOrganizeService } from "../services/system-organize.service.js";
import { createErrorResponse } from "../utils/error-handler.js";
import { CommonParamsSchema } from "../schemas/common.schemas.js";
import { logger } from "../utils/logger.js";

const VALID_SOURCE_DIRS = ["Downloads", "Desktop", "Temp"];

const SystemOrganizationInputSchema = z
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

export const systemOrganizationToolDefinition: ToolDefinition = {
  name: "file_organizer_system_organize",
  title: "System Organize",
  description:
    "Organize files into OS-standard system directories (Music, Documents, Pictures, Videos)",
  inputSchema: {
    type: "object",
    properties: {
      source_dir: {
        type: "string",
        description: "Source directory (must be Downloads, Desktop, or Temp)",
      },
      use_system_dirs: {
        type: "boolean",
        description: "Use OS system directories",
        default: true,
      },
      create_subfolders: {
        type: "boolean",
        description: "Create organized subfolders",
        default: true,
      },
      fallback_to_local: {
        type: "boolean",
        description:
          "Fallback to local Organized folder if system dir not writable",
        default: true,
      },
      local_fallback_prefix: {
        type: "string",
        description: "Prefix for local fallback folder",
        default: "Organized",
      },
      conflict_strategy: {
        type: "string",
        enum: ["skip", "rename", "overwrite"],
        description: "How to handle file conflicts",
        default: "rename",
      },
      dry_run: {
        type: "boolean",
        description: "Preview without moving",
        default: true,
      },
      copy_instead_of_move: {
        type: "boolean",
        description: "Copy instead of move",
        default: false,
      },
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        description:
          'Output format: "markdown" for human-readable, "json" for programmatic use',
        default: "markdown",
      },
    },
    required: ["source_dir"],
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
  },
};

export async function handleSystemOrganization(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = SystemOrganizationInputSchema.safeParse(args);
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

    const {
      source_dir,
      use_system_dirs,
      create_subfolders,
      fallback_to_local,
      local_fallback_prefix,
      conflict_strategy,
      dry_run,
      copy_instead_of_move,
    } = parsed.data;

    const normalizedSource = source_dir.trim();
    const isValidSource = VALID_SOURCE_DIRS.some(
      (dir) => dir.toLowerCase() === normalizedSource.toLowerCase(),
    );

    if (!isValidSource) {
      return {
        content: [
          {
            type: "text",
            text: `Error: source_dir must be one of: ${VALID_SOURCE_DIRS.join(", ")}`,
          },
        ],
      };
    }

    const validatedSource = await validateStrictPath(normalizedSource);

    const service = new SystemOrganizeService();

    logger.info("Starting system organization", {
      source: validatedSource,
      useSystemDirs: use_system_dirs,
      dryRun: dry_run,
    });

    const result = await service.systemOrganize({
      sourceDir: validatedSource,
      useSystemDirs: use_system_dirs,
      createSubfolders: create_subfolders,
      fallbackToLocal: fallback_to_local,
      localFallbackPrefix: local_fallback_prefix,
      conflictStrategy: conflict_strategy,
      dryRun: dry_run,
      copyInsteadOfMove: copy_instead_of_move,
    });

    const lines: string[] = [];
    lines.push("# System Organization Results\n");

    if (dry_run) {
      lines.push("**DRY RUN MODE** - No files were actually moved\n");
    }

    lines.push("## Summary");
    lines.push(`- **Moved to System Directories:** ${result.movedToSystem}`);
    lines.push(`- **Organized Locally:** ${result.organizedLocally}`);
    lines.push(`- **Failed:** ${result.failed}`);
    lines.push(`- **Total Processed:** ${result.details.length}\n`);

    const byCategory: Record<string, number> = {};
    for (const detail of result.details) {
      byCategory[detail.category] = (byCategory[detail.category] || 0) + 1;
    }

    if (Object.keys(byCategory).length > 0) {
      lines.push("## Files by Category");
      for (const [category, count] of Object.entries(byCategory)) {
        lines.push(`- **${category}:** ${count}`);
      }
      lines.push("");
    }

    const systemCount = result.details.filter(
      (d) => d.destination === "system",
    ).length;
    const localCount = result.details.filter(
      (d) => d.destination === "local",
    ).length;

    if (systemCount > 0 || localCount > 0) {
      lines.push("## Destination Summary");
      lines.push(`- **System Directories:** ${systemCount}`);
      lines.push(`- **Local Fallback:** ${localCount}\n`);
    }

    if (result.details.length > 0) {
      const displayLimit = 20;
      lines.push("## Files Processed");
      lines.push("```");
      for (let i = 0; i < Math.min(result.details.length, displayLimit); i++) {
        const detail = result.details[i];
        if (detail) {
          lines.push(
            `${detail.file} -> ${detail.category} (${detail.destination})`,
          );
        }
      }
      if (result.details.length > displayLimit) {
        lines.push(`... and ${result.details.length - displayLimit} more`);
      }
      lines.push("```\n");
    }

    if (result.failed > 0) {
      lines.push(`## ⚠️ Failures (${result.failed})`);
      lines.push(
        "Some files could not be organized. Check logs for details.\n",
      );
    }

    if (result.undoManifest && result.undoManifest.operations.length > 0) {
      lines.push("## Undo Information");
      lines.push(`- **Manifest ID:** ${result.undoManifest.manifestId}`);
      lines.push(`- **Operations:** ${result.undoManifest.operations.length}`);
    }

    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}
