/**
 * File Organizer MCP Server v5.0.0
 * batch_rename Tool
 *
 * @module tools/file-renaming
 */

import { z } from "zod";
import path from "path";
import type { ToolDefinition, ToolResponse } from "../types.js";
import { validateStrictPath } from "../services/path-validator.service.js";
import { FileScannerService } from "../core/scan/scanner.js";
import {
  RenamingService,
  detectRenameCollisions,
  type RenameCollision,
  type RenamePreview,
} from "../core/organize/rename.js";
import { BatchRenameInputSchema } from "../schemas/organize.js";
import { batchRenameOutputJsonSchema } from "../schemas/output.js";
import { createErrorResponse } from "../utils/error-handler.js";

export type BatchRenameInput = z.infer<typeof BatchRenameInputSchema>;

export { BatchRenameInputSchema } from "../schemas/organize.js";

const COLLISION_REMEDY =
  "No files were renamed. Adjust the rules or move the files already holding these names, then run again; \"dry_run\" (the default) previews the plan without touching anything.";

/**
 * The rejection is an error the caller has to act on, so it carries the
 * collisions as structured data instead of only prose. A caller that asked for
 * markdown still gets the same payload, because an agent should not have to
 * switch formats to learn why the batch did not run.
 */
function collisionRejection(
  collisions: RenameCollision[],
  processed: number,
  rules: unknown[],
  responseFormat: string,
): ToolResponse {
  const outputData = {
    dry_run: false,
    rejected: true,
    renamed: 0,
    processed,
    conflicts: collisions,
    rules,
  };

  if (responseFormat === "json") {
    return {
      content: [{ type: "text", text: JSON.stringify(outputData, null, 2) }],
      structuredContent: outputData as Record<string, unknown>,
      isError: true,
    };
  }

  let md = `### Batch Rename Rejected\n\n`;
  md += `**Collisions:** ${collisions.length} of ${processed} file(s)\n\n`;
  md += collisionsToMarkdown(collisions);
  md += `\n${COLLISION_REMEDY}\n`;

  return {
    content: [{ type: "text", text: md }],
    structuredContent: outputData as Record<string, unknown>,
    isError: true,
  };
}

function collisionsToMarkdown(collisions: RenameCollision[]): string {
  const lines = collisions.map(
    (c) =>
      `| \`${c.destination}\` | ${c.kind} | ${c.sources
        .map((s) => `\`${s}\``)
        .join(", ")} |`,
  );
  return `| Destination | Kind | Sources |\n|---|---|---|\n${lines.join("\n")}\n`;
}

export const batchRenameToolDefinition: ToolDefinition = {
  name: "file_organizer_batch_rename",
  title: "Batch Rename Files",
  description:
    'Rename multiple files using rules (find/replace, case, add text, numbering). "dry_run" defaults to true for safety. Before any file moves, the whole plan is checked for collisions: two files landing on one name, or a destination name a different file already holds. When a real run finds collisions it is rejected whole, no file is renamed, and the conflicts come back as structured data so the rules can be adjusted and retried.',
  inputSchema: {
    type: "object",
    properties: {
      files: {
        type: "array",
        items: { type: "string" },
        description: "List of absolute file paths",
      },
      directory: {
        type: "string",
        description: "Directory to scan (optional)",
      },
      rules: {
        type: "array",
        description: "List of renaming rules. See specific rule schemas.",
        items: { type: "object" }, // Generic description as specific schemas are complex to inline for MCP prompts sometimes
      },
      dry_run: {
        type: "boolean",
        description: "Simulate renaming",
        default: true,
      },
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        default: "markdown",
      },
    },
    required: ["rules"],
  },
  outputSchema: batchRenameOutputJsonSchema,
  annotations: {
    readOnlyHint: false, // It modifies files if dry_run is false
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
};

export async function handleBatchRename(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = BatchRenameInputSchema.safeParse(args);
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
      files: explicitFiles,
      directory,
      rules,
      dry_run,
      response_format,
    } = parsed.data;

    let filesToProcess: string[] = [];

    if (explicitFiles && explicitFiles.length > 0) {
      const validatedFiles: string[] = [];
      const errors: string[] = [];
      for (const f of explicitFiles) {
        const validated = await validateStrictPath(f);
        if (validated) {
          validatedFiles.push(validated);
        } else {
          errors.push(`Invalid path: ${f}`);
        }
      }
      filesToProcess = validatedFiles;
      if (errors.length > 0 && filesToProcess.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `Error: All provided paths are invalid.\n${errors.join("\n")}`,
            },
          ],
          isError: true,
        };
      }
    } else if (directory) {
      const validatedDir = await validateStrictPath(directory);
      const scanner = new FileScannerService();
      // Just scan for files, not recursive by default unless we want to?
      // Let's assume non-recursive for safety unless implied?
      // The Scanner `getAllFiles` is recursive if recursive flag is true.
      // Let's default to false (single directory) for batch rename to avoid accidents.
      const scanned = await scanner.getAllFiles(validatedDir, false);
      filesToProcess = scanned.map((f) => f.path);
    }

    if (filesToProcess.length === 0) {
      const empty = {
        dry_run,
        rejected: false,
        renamed: 0,
        processed: 0,
        conflicts: [],
        rules,
      };
      return {
        content: [{ type: "text", text: "No files found to rename." }],
        structuredContent: empty as Record<string, unknown>,
      };
    }

    const renamingService = new RenamingService();

    // 1. Calculate Previews
    const previews = await renamingService.applyRenameRules(
      filesToProcess,
      rules,
    );

    // 2. Read collisions off the plan, before the first rename moves anything.
    const collisions = detectRenameCollisions(previews);

    // A real run with collisions is rejected whole. Renaming the files that
    // happen to be clear and leaving the rest would move files the caller
    // never saw succeed, which is harder to reason about than no run at all.
    if (!dry_run && collisions.length > 0) {
      return collisionRejection(
        collisions,
        previews.length,
        rules,
        response_format,
      );
    }

    // 3. Execute if not dry_run
    const result = await renamingService.executeRename(previews, dry_run);
    const hasError = !dry_run && (result.statistics.failed > 0 || result.errors.length > 0);

    // 4. Format Output

    const outputData = {
      dry_run,
      rejected: false,
      renamed: result.statistics.renamed,
      processed: previews.length,
      conflicts: collisions,
      rules,
      previews: dry_run ? previews : undefined, // show previews in dry run
      result: !dry_run ? result : undefined, // show result in execution
    };

    if (response_format === "json") {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(outputData, null, 2),
          },
        ],
        structuredContent: outputData as Record<string, unknown>,
        ...(hasError && { isError: true }),
      };
    }

    // Markdown Output
    let md = `### Batch Rename ${dry_run ? "(Dry Run)" : "Result"}\n\n`;
    md += `**Rules Applied:** ${rules.length}\n`;
    md += `**Files Processed:** ${previews.length}\n`;
    md += `**Collisions:** ${collisions.length}\n\n`;

    if (collisions.length > 0) {
      md += `#### Collisions\n\n${collisionsToMarkdown(collisions)}`;
      md += `_A real run would be rejected until these are resolved. Re-check with "dry_run" (the default) after adjusting the rules._\n\n`;
    }

    if (dry_run) {
      md += `#### Preview Changes\n`;
      const changes = previews.filter((p) => p.willChange);
      if (changes.length === 0) {
        md += `_No files will be changed by these rules._\n`;
      } else {
        md += `| Original | New | Status |\n|---|---|---|\n`;
        for (const p of changes.slice(0, 50)) {
          // limit output
          const status = p.conflict
            ? "⚠️ Conflict"
            : p.error
              ? `❌ ${p.error}`
              : "✅ OK";
          md += `| \`${path.basename(p.original)}\` | \`${path.basename(p.new)}\` | ${status} |\n`;
        }
        if (changes.length > 50) md += `| ... | ... | ... |\n`;
      }
    } else {
      md += `#### Execution Summary\n`;
      md += `- **Renamed:** ${result.statistics.renamed}\n`;
      md += `- **Failed:** ${result.statistics.failed}\n`;
      md += `- **Skipped:** ${result.statistics.skipped}\n\n`;

      if (result.errors.length > 0) {
        md += `**Errors:**\n${result.errors.map((e) => `- ${e}`).join("\n")}\n`;
      }
    }

    // The markdown path carries structuredContent too: the tool declares an
    // outputSchema and the SDK rejects results from such tools without it.
    return {
      content: [{ type: "text", text: md }],
      structuredContent: outputData as Record<string, unknown>,
      ...(hasError && { isError: true }),
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}
