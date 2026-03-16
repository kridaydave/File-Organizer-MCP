/**
 * File Organizer MCP Server v3.4.2
 * organize_music Tool
 *
 * @module tools/music-organization
 */

import { z } from "zod";
import type { ToolDefinition, ToolResponse, RollbackAction } from "../types.js";
import { validateStrictPath } from "../services/path-validator.service.js";
import { MusicOrganizerService } from "../services/music-organizer.service.js";
import { RollbackService } from "../services/rollback.service.js";
import { createErrorResponse } from "../utils/error-handler.js";
import { OrganizeMusicInputSchema } from "../schemas/media.schemas.js";
import { logger } from "../utils/logger.js";

export type OrganizeMusicInput = z.infer<typeof OrganizeMusicInputSchema>;

export const organizeMusicToolDefinition: ToolDefinition = {
  name: "file_organizer_organize_music",
  title: "Organize Music Files",
  description:
    "Organize music files into structured folders based on metadata (Artist/Album). Supports MP3, FLAC, OGG, WAV, M4A, AAC. Use dry_run=true to preview changes.",
  inputSchema: {
    type: "object",
    properties: {
      source_dir: {
        type: "string",
        description: "Full path to the directory containing music files",
      },
      target_dir: {
        type: "string",
        description:
          "Full path to the directory where organized music will be placed",
      },
      structure: {
        type: "string",
        enum: ["artist/album", "album", "genre/artist", "flat"],
        description: "Folder structure for organization",
        default: "artist/album",
      },
      filename_pattern: {
        type: "string",
        enum: ["{track} - {title}", "{artist} - {title}", "{title}"],
        description: "Pattern for renaming files",
        default: "{track} - {title}",
      },
      dry_run: {
        type: "boolean",
        description: "Preview changes without moving files",
        default: true,
      },
      copy_instead_of_move: {
        type: "boolean",
        description: "Copy files instead of moving them",
        default: false,
      },
      skip_if_missing_metadata: {
        type: "boolean",
        description: "Skip files missing artist/album metadata",
        default: false,
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
    idempotentHint: false,
    openWorldHint: true,
  },
};

export async function handleOrganizeMusic(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = OrganizeMusicInputSchema.safeParse(args);
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
      target_dir,
      structure,
      filename_pattern,
      dry_run,
      copy_instead_of_move,
      skip_if_missing_metadata,
      response_format,
    } = parsed.data;

    const validatedSourcePath = await validateStrictPath(source_dir);
    const validatedTargetPath = await validateStrictPath(target_dir);

    const musicOrganizer = new MusicOrganizerService();

    const result = await musicOrganizer.organize({
      sourceDir: validatedSourcePath,
      targetDir: validatedTargetPath,
      structure,
      filenamePattern: filename_pattern,
      copyInsteadOfMove: copy_instead_of_move,
      skipIfMissingMetadata: skip_if_missing_metadata,
      dryRun: dry_run,
    });

    // Create rollback manifest for moved files (not copies)
    if (!dry_run && !copy_instead_of_move && result.movedFiles.length > 0) {
      try {
        const rollbackService = new RollbackService();
        const rollbackActions: RollbackAction[] = result.movedFiles.map(
          (f) => ({
            type: "move" as const,
            originalPath: f.originalPath,
            currentPath: f.currentPath,
            timestamp: Date.now(),
          }),
        );
        await rollbackService.createManifest(
          `Music organization from ${validatedSourcePath} to ${validatedTargetPath} (${rollbackActions.length} files)`,
          rollbackActions,
        );
      } catch (manifestErr) {
        logger.error(
          `Failed to create rollback manifest: ${manifestErr instanceof Error ? manifestErr.message : String(manifestErr)}`,
        );
      }
    }

    if (response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    }

    const dryRunText = dry_run ? "(Dry Run - No files were moved)" : "";
    const markdown = `### Music Organization Result ${dryRunText}

**Source:** \`${validatedSourcePath}\`
**Target:** \`${validatedTargetPath}\`
**Structure:** ${structure}
**Filename Pattern:** ${filename_pattern}

**Results:**
- **Success:** ${result.success ? "✅" : "❌"}
- **Organized Files:** ${result.organizedFiles}
- **Skipped Files:** ${result.skippedFiles}
- **Errors:** ${result.errors.length}

**Organized Structure:**
${Object.entries(result.structure)
  .map(([folder, files]) => `- \`${folder}\`: ${files.length} file(s)`)
  .join("\n")}

${result.errors.length > 0 ? `**Errors:**\n${result.errors.map((e) => `- \`${e.file}\`: ${e.error}`).join("\n")}` : ""}`;

    return {
      content: [{ type: "text", text: markdown }],
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}
