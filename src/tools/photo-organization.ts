/**
 * File Organizer MCP Server v3.4.0
 * organize_photos Tool
 *
 * @module tools/photo-organization
 */

import { z } from "zod";
import type { ToolDefinition, ToolResponse } from "../types.js";
import { validateStrictPath } from "../services/path-validator.service.js";
import { PhotoOrganizerService } from "../services/photo-organizer.service.js";
import { createErrorResponse } from "../utils/error-handler.js";
import { CommonParamsSchema } from "../schemas/common.schemas.js";

export const OrganizePhotosInputSchema = z
  .object({
    source_dir: z
      .string()
      .min(1, "Source directory path cannot be empty")
      .describe("Full path to the directory containing photos"),
    target_dir: z
      .string()
      .min(1, "Target directory path cannot be empty")
      .describe(
        "Full path to the directory where organized photos will be placed",
      ),
    date_format: z
      .enum(["YYYY/MM/DD", "YYYY-MM-DD", "YYYY/MM", "YYYY"])
      .optional()
      .default("YYYY/MM")
      .describe("Date format for folder structure"),
    group_by_camera: z
      .boolean()
      .optional()
      .default(false)
      .describe("Group photos by camera model within date folders"),
    dry_run: z
      .boolean()
      .optional()
      .default(true)
      .describe("If true, only preview changes without moving files"),
    copy_instead_of_move: z
      .boolean()
      .optional()
      .default(false)
      .describe("Copy files instead of moving them"),
    strip_gps: z
      .boolean()
      .optional()
      .default(false)
      .describe("Strip GPS location data from photos for privacy"),
    unknown_date_folder: z
      .string()
      .optional()
      .default("Unknown Date")
      .describe("Folder name for photos without date metadata"),
  })
  .merge(CommonParamsSchema);

export type OrganizePhotosInput = z.infer<typeof OrganizePhotosInputSchema>;

export const organizePhotosToolDefinition: ToolDefinition = {
  name: "file_organizer_organize_photos",
  title: "Organize Photo Files",
  description:
    "Organize photos into date-based folders using EXIF metadata. Supports JPG, PNG, TIFF, HEIC, RAW formats. Can group by camera model and strip GPS data for privacy. Use dry_run=true to preview changes.",
  inputSchema: {
    type: "object",
    properties: {
      source_dir: {
        type: "string",
        description: "Full path to the directory containing photos",
      },
      target_dir: {
        type: "string",
        description:
          "Full path to the directory where organized photos will be placed",
      },
      date_format: {
        type: "string",
        enum: ["YYYY/MM/DD", "YYYY-MM-DD", "YYYY/MM", "YYYY"],
        description: "Date format for folder structure",
        default: "YYYY/MM",
      },
      group_by_camera: {
        type: "boolean",
        description: "Group photos by camera model within date folders",
        default: false,
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
      strip_gps: {
        type: "boolean",
        description: "Strip GPS location data from photos for privacy",
        default: false,
      },
      unknown_date_folder: {
        type: "string",
        description: "Folder name for photos without date metadata",
        default: "Unknown Date",
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

export async function handleOrganizePhotos(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = OrganizePhotosInputSchema.safeParse(args);
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
      date_format,
      group_by_camera,
      dry_run,
      copy_instead_of_move,
      strip_gps,
      unknown_date_folder,
      response_format,
    } = parsed.data;

    const validatedSourcePath = await validateStrictPath(source_dir);
    const validatedTargetPath = await validateStrictPath(target_dir);

    const photoOrganizer = new PhotoOrganizerService();

    const result = await photoOrganizer.organize({
      sourceDir: validatedSourcePath,
      targetDir: validatedTargetPath,
      dateFormat: date_format,
      useDateCreated: false, // Always use EXIF date taken
      groupByCamera: group_by_camera,
      copyInsteadOfMove: copy_instead_of_move,
      stripGPS: strip_gps,
      unknownDateFolder: unknown_date_folder,
      dryRun: dry_run,
    });

    if (response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    }

    const dryRunText = dry_run ? "(Dry Run - No files were moved)" : "";
    const markdown = `### Photo Organization Result ${dryRunText}

**Source:** \`${validatedSourcePath}\`
**Target:** \`${validatedTargetPath}\`
**Date Format:** ${date_format}
**Group by Camera:** ${group_by_camera ? "Yes" : "No"}
**Strip GPS:** ${strip_gps ? "Yes" : "No"}

**Results:**
- **Success:** ${result.success ? "✅" : "❌"}
- **Organized Files:** ${result.organizedFiles}
- **Skipped Files:** ${result.skippedFiles}
- **GPS Stripped:** ${result.strippedGPSFiles} file(s)
- **Errors:** ${result.errors.length}

**Organized Structure:**
${Object.entries(result.structure)
  .map(([folder, count]) => `- \`${folder}\`: ${count} file(s)`)
  .join("\n")}

${result.errors.length > 0 ? `**Errors:**\n${result.errors.map((e) => `- \`${e.file}\`: ${e.error}`).join("\n")}` : ""}`;

    return {
      content: [{ type: "text", text: markdown }],
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}
