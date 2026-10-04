/**
 * File Organizer MCP Server v5.0.0
 * organize_by_date Tool
 *
 * @module tools/date-organization
 */

import { z } from "zod";
import path from "path";
import type { ToolDefinition, ToolResponse } from "../types.js";
import { validateStrictPath } from "../services/path-validator.service.js";
import { DateOrganizerService } from "../core/organize/date-organizer.js";
import { createErrorResponse } from "../utils/error-handler.js";
import { isSubPath } from "../utils/file-utils.js";
import { escapeMarkdown } from "../utils/index.js";
import { ValidationError } from "../types.js";
import { OrganizeByDateInputSchema } from "../schemas/organize.js";

export type OrganizeByDateInput = z.infer<typeof OrganizeByDateInputSchema>;

export { OrganizeByDateInputSchema } from "../schemas/organize.js";

export const organizeByDateToolDefinition: ToolDefinition = {
  name: "file_organizer_organize_by_date",
  title: "Organize Files by Date",
  description:
    "Sort any file into YYYY/MM folders using EXIF date taken for photos or file modification time. Photos fall back to mtime when EXIF is missing or malformed, and every file reports which date source chose its folder. Files with no usable date are left in place and listed. Use dry_run=true (the default) to preview changes.",
  inputSchema: {
    type: "object",
    properties: {
      source_dir: {
        type: "string",
        description: "Full path to the directory containing files to sort",
      },
      target_dir: {
        type: "string",
        description:
          "Full path to the directory where the date folders will be created",
      },
      date_format: {
        type: "string",
        enum: ["YYYY/MM", "YYYY/MM/DD", "YYYY"],
        description: "Date folder structure",
        default: "YYYY/MM",
      },
      date_source: {
        type: "string",
        enum: ["auto", "exif", "mtime"],
        description:
          "Where the folder date comes from: 'exif' for photo date taken only, 'mtime' for file timestamps only, 'auto' for EXIF with mtime fallback",
        default: "auto",
      },
      recursive: {
        type: "boolean",
        description: "Scan subdirectories of source_dir",
        default: false,
      },
      dry_run: {
        type: "boolean",
        description: "Preview changes without moving files",
        default: true,
      },
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        default: "markdown",
      },
    },
    required: ["source_dir", "target_dir"],
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    // A second run is only a no-op when the destination is already free; when a
    // file of the same name is present, it is de-duplicated as "name (1).ext".
    idempotentHint: false,
    openWorldHint: true,
  },
};

export async function handleOrganizeByDate(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = OrganizeByDateInputSchema.safeParse(args);
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
      source_dir,
      target_dir,
      date_format,
      date_source,
      recursive,
      dry_run,
      response_format,
    } = parsed.data;

    const validatedSourcePath = await validateStrictPath(source_dir);
    const validatedTargetPath = await validateStrictPath(target_dir);

    // Moving a tree into itself, or into a subdirectory of itself, would make
    // the scan see its own output.
    if (isSubPath(validatedSourcePath, validatedTargetPath)) {
      throw new ValidationError(
        "Target directory cannot be inside the source directory",
      );
    }
    if (isSubPath(validatedTargetPath, validatedSourcePath)) {
      throw new ValidationError(
        "Source directory cannot be inside the target directory",
      );
    }

    const result = await new DateOrganizerService().organize({
      sourceDir: validatedSourcePath,
      targetDir: validatedTargetPath,
      dateFormat: date_format,
      dateSource: date_source,
      recursive,
      dryRun: dry_run,
    });

    if (response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    }

    const dryRunText = dry_run ? "(Dry Run - No files were moved)" : "";
    const sourceCounts = result.moves.reduce<Record<string, number>>(
      (counts, move) => {
        counts[move.dateSource] = (counts[move.dateSource] ?? 0) + 1;
        return counts;
      },
      {},
    );
    const manifestLine = result.manifestId
      ? `- **Rollback Manifest ID:** \`${result.manifestId}\`\n`
      : dry_run || result.organizedFiles === 0
        ? ""
        : "- **Rollback Manifest:** unavailable — files moved by this run are NOT undoable\n";

    const folderLines = Object.keys(result.structure)
      .sort((a, b) => a.localeCompare(b))
      .map((folder) => {
        const files = result.moves
          .filter((move) => move.folder === folder)
          .sort((a, b) => path.basename(a.to).localeCompare(path.basename(b.to)))
          .map(
            (move) =>
              `  - \`${escapeMarkdown(path.basename(move.to))}\` — ${move.dateSource} (${move.calendarDate})`,
          );
        return `- \`${escapeMarkdown(folder)}\`: ${result.structure[folder]!.length} file(s)\n${files.join("\n")}`;
      });

    const markdown = `### Date Organization Result ${dryRunText}

**Source:** \`${validatedSourcePath}\`
**Target:** \`${validatedTargetPath}\`
**Date Format:** ${date_format}
**Date Source:** ${date_source}
**Recursive:** ${recursive ? "Yes" : "No"}

**Results:**
- **Success:** ${result.success ? "✅" : "❌"}
- **Organized Files:** ${result.organizedFiles}
- **Skipped Files:** ${result.skippedFiles}
- **Date Source Used:** ${
      Object.keys(sourceCounts).length === 0
        ? "n/a"
        : Object.entries(sourceCounts)
            .map(([source, count]) => `${source}: ${count}`)
            .join(", ")
    }
${manifestLine}- **Errors:** ${result.errors.length}

**Date Folders:**
${folderLines.length === 0 ? "- _none_" : folderLines.join("\n")}

${
  result.noDateFiles.length > 0
    ? `**Left In Place (no usable date, not moved):**\n${result.noDateFiles
        .map((f) => `- \`${escapeMarkdown(f)}\``)
        .join("\n")}`
    : ""
}

${
  result.errors.length > 0
    ? `**Errors:**\n${result.errors.map((e) => `- \`${escapeMarkdown(e.file)}\`: ${escapeMarkdown(e.error)}`).join("\n")}`
    : ""
}`;

    return {
      content: [{ type: "text", text: markdown }],
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}
