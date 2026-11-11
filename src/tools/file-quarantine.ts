/**
 * File Organizer MCP Server v5.0.0
 * quarantine_files / restore_quarantine Tools
 *
 * @module tools/file-quarantine
 */

import type { ToolDefinition, ToolResponse } from "../types.js";
import { QuarantineService } from "../core/organize/quarantine.js";
import { createErrorResponse } from "../utils/error-handler.js";
import { escapeMarkdown } from "../utils/index.js";
import {
  QuarantineFilesInputSchema,
  RestoreQuarantineInputSchema,
} from "../schemas/organize.js";
import {
  quarantineFilesOutputJsonSchema,
  restoreQuarantineOutputJsonSchema,
} from "../schemas/output.js";
import { createRequestContext, type ToolContext } from "../mcp/context.js";

export {
  QuarantineFilesInputSchema,
  RestoreQuarantineInputSchema,
} from "../schemas/organize.js";
export type {
  QuarantineFilesInput,
  RestoreQuarantineInput,
} from "../schemas/organize.js";

export const quarantineFilesToolDefinition: ToolDefinition = {
  name: "file_organizer_quarantine_files",
  title: "Quarantine Files",
  description:
    "Sets flagged files aside in a quarantine directory so they can be reviewed without being deleted. Nothing is removed from disk: each file is moved into a hidden quarantine directory and recorded in a rollback manifest, so file_organizer_undo_last_operation or file_organizer_restore_quarantine puts every file back where it came from. Defaults to dry_run=true, which lists what would be quarantined and changes nothing. Same-basename files never overwrite each other; a collision becomes name_1.ext.",
  inputSchema: {
    type: "object",
    properties: {
      directory: {
        type: "string",
        description: "Directory the flagged files live in",
      },
      files: {
        type: "array",
        items: { type: "string" },
        description: "Absolute paths of the flagged files, all inside directory",
      },
      quarantine_dir: {
        type: "string",
        description:
          "Where to move them. Defaults to a hidden .file-organizer-quarantine directory inside `directory`. Must pass the same path validation as any other directory, so it cannot escape the allowed directories.",
      },
      reason: {
        type: "string",
        description: "Note recorded in the manifest, e.g. why these were flagged",
      },
      dry_run: {
        type: "boolean",
        description: "List what would be quarantined without moving anything",
        default: true,
      },
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        default: "markdown",
      },
    },
    required: ["directory", "files"],
  },
  outputSchema: quarantineFilesOutputJsonSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    // A second run of the same call re-quarantines whatever is still in the
    // source, so it is not a no-op.
    idempotentHint: false,
    openWorldHint: true,
  },
};

export const restoreQuarantineToolDefinition: ToolDefinition = {
  name: "file_organizer_restore_quarantine",
  title: "Restore Quarantined Files",
  description:
    "Puts quarantined files back at the exact paths they were taken from, using the manifest quarantine_files wrote. The restore records its own manifest, so file_organizer_undo_last_operation can undo the restore and put the files back into quarantine. Defaults to dry_run=true, which lists what would be restored and changes nothing.",
  inputSchema: {
    type: "object",
    properties: {
      quarantine_id: {
        type: "string",
        description:
          "Manifest id returned by quarantine_files. If omitted, restores the most recent quarantine.",
      },
      dry_run: {
        type: "boolean",
        description: "List what would be restored without moving anything",
        default: true,
      },
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        default: "markdown",
      },
    },
    required: [],
  },
  outputSchema: restoreQuarantineOutputJsonSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    // The first run restores the files; a second finds nothing left in
    // quarantine, so it is not the same result twice.
    idempotentHint: false,
    openWorldHint: true,
  },
};

export async function handleQuarantineFiles(
  args: Record<string, unknown>,
  ctx: ToolContext = createRequestContext(),
): Promise<ToolResponse> {
  try {
    const parsed = QuarantineFilesInputSchema.safeParse(args);
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

    const { directory, files, quarantine_dir, reason, dry_run } = parsed.data;

    // Pure service, constructed per request like every other tool here.
    const service = new QuarantineService();
    const result = await service.quarantine({
      directory,
      files,
      dryRun: dry_run,
      ...(quarantine_dir !== undefined && { quarantineDir: quarantine_dir }),
      ...(reason !== undefined && { reason }),
    });

    if (!result.dry_run) {
      await logQuarantineToHistory(ctx, result);
    }

    if (parsed.data.response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
        ...(result.errors.length > 0 && { isError: true }),
      };
    }

    const markdown = `### Quarantine ${result.dry_run ? "would be quarantined" : "quarantined"}
**Quarantine directory:** \`${escapeMarkdown(result.quarantine_dir)}\`
**Planned:** ${result.planned} | **Moved:** ${result.quarantined}

${renderMoves(result.items)}${
      result.manifest_id
        ? `\n**Manifest:** \`${result.manifest_id}\` — undo with \`file_organizer_undo_last_operation\` or restore with \`file_organizer_restore_quarantine\`\n`
        : result.dry_run
          ? "\n*(Dry run: nothing was moved.)*\n"
          : ""
    }${renderList("Skipped", result.skipped.map((s) => `${s.path} (${s.reason})`))}${renderList("Errors", result.errors)}`;

    return {
      content: [{ type: "text", text: markdown }],
      structuredContent: result as unknown as Record<string, unknown>,
      ...(result.errors.length > 0 && { isError: true }),
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleRestoreQuarantine(
  args: Record<string, unknown>,
  ctx: ToolContext = createRequestContext(),
): Promise<ToolResponse> {
  try {
    const parsed = RestoreQuarantineInputSchema.safeParse(args);
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

    const { quarantine_id, dry_run } = parsed.data;
    const service = new QuarantineService();
    const result = await service.restore({
      dryRun: dry_run,
      ...(quarantine_id !== undefined && { quarantineId: quarantine_id }),
    });

    if (!result.dry_run) {
      await logRestoreToHistory(ctx, result);
    }

    if (parsed.data.response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
        ...(result.errors.length > 0 && { isError: true }),
      };
    }

    const markdown = `### Quarantine ${result.dry_run ? "would be restored" : "restored"}
**Quarantine manifest:** \`${result.quarantine_id}\`
**Planned:** ${result.planned} | **Restored:** ${result.restored}

${renderMoves(result.items)}${
      result.manifest_id
        ? `\n**Manifest:** \`${result.manifest_id}\` — undo the restore with \`file_organizer_undo_last_operation\`\n`
        : result.dry_run
          ? "\n*(Dry run: nothing was moved.)*\n"
          : ""
    }${renderList("Errors", result.errors)}`;

    return {
      content: [{ type: "text", text: markdown }],
      structuredContent: result as unknown as Record<string, unknown>,
      ...(result.errors.length > 0 && { isError: true }),
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}

const MOVE_LIMIT = 20;

function renderMoves(items: { file: string; from: string; to: string }[]): string {
  const lines = items
    .slice(0, MOVE_LIMIT)
    .map(
      (item) =>
        `- \`${escapeMarkdown(item.file)}\`: \`${escapeMarkdown(item.from)}\` → \`${escapeMarkdown(item.to)}\``,
    )
    .join("\n");
  const overflow =
    items.length > MOVE_LIMIT
      ? `\n*(...and ${items.length - MOVE_LIMIT} more)*\n`
      : "";
  return `${lines}${overflow}`;
}

function renderList(label: string, entries: string[]): string {
  if (entries.length === 0) return "";
  return `\n**${label}:**\n${entries
    .map((entry) => `- ${escapeMarkdown(entry)}`)
    .join("\n")}\n`;
}

/**
 * History is the audit trail, not the undo mechanism — the manifest is. A
 * failure to append is reported rather than swallowed, but it does not undo
 * work that already landed.
 */
async function logQuarantineToHistory(
  ctx: ToolContext,
  result: { quarantined: number; manifest_id?: string; errors: string[] },
): Promise<void> {
  try {
    await ctx.history.log({
      operation: "file_organizer_quarantine_files",
      source: "manual",
      status: result.errors.length > 0 ? "partial" : "success",
      durationMs: 0,
      filesProcessed: result.quarantined,
      details: `Quarantined ${result.quarantined} file(s) (manifest ${result.manifest_id ?? "none"})`,
    });
  } catch (error) {
    result.errors.push(
      `History entry was not written: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function logRestoreToHistory(
  ctx: ToolContext,
  result: { restored: number; manifest_id?: string; errors: string[] },
): Promise<void> {
  try {
    await ctx.history.log({
      operation: "file_organizer_restore_quarantine",
      source: "manual",
      status: result.errors.length > 0 ? "partial" : "success",
      durationMs: 0,
      filesProcessed: result.restored,
      details: `Restored ${result.restored} file(s) (manifest ${result.manifest_id ?? "none"})`,
    });
  } catch (error) {
    result.errors.push(
      `History entry was not written: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
