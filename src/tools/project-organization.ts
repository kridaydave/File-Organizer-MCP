/**
 * File Organizer MCP Server v5.0.0
 * organize_by_project Tool
 *
 * @module tools/project-organization
 */

import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import type { ToolDefinition, ToolResponse, RollbackAction } from "../types.js";
import { validateStrictPath } from "../services/path-validator.service.js";
import { FileScannerService } from "../core/scan/scanner.js";
import {
  detectProjects,
} from "../core/detect/project.js";
import { sanitizeProjectName } from "../core/detect/tokens.js";
import { RollbackService } from "../core/organize/rollback.js";
import { createErrorResponse, sanitizeErrorMessage } from "../utils/error-handler.js";
import { escapeMarkdown } from "../utils/index.js";
import { fileExists } from "../utils/file-utils.js";
import { OrganizeByProjectInputSchema } from "../schemas/organize.js";
import { logger } from "../utils/logger.js";

export type OrganizeByProjectInput = z.infer<typeof OrganizeByProjectInputSchema>;

export { OrganizeByProjectInputSchema } from "../schemas/organize.js";

export const organizeByProjectToolDefinition: ToolDefinition = {
  name: "file_organizer_organize_by_project",
  title: "Organize Files by Detected Project",
  description:
    "Group files across all types (documents, code, images) into detected project folders using shared name tokens, content terms (text-like files only), and identifier markers. Deterministic, local-only detection. Use dry_run=true to preview changes.",
  inputSchema: {
    type: "object",
    properties: {
      source_dir: {
        type: "string",
        description: "Full path to the directory containing files to organize",
      },
      target_dir: {
        type: "string",
        description:
          "Full path to the directory where detected projects will be placed",
      },
      dry_run: {
        type: "boolean",
        description: "Preview changes without moving files",
        default: true,
      },
      recursive: {
        type: "boolean",
        description: "Scan subdirectories recursively",
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
    idempotentHint: false,
    openWorldHint: true,
  },
};

interface ProjectOrganizationResult {
  success: boolean;
  organizedFiles: number;
  skippedFiles: number;
  errors: Array<{ file: string; error: string }>;
  results: Array<{ file: string; project: string; targetPath: string; signal: string }>;
  structure: Record<string, string[]>;
}

/**
 * Move a file safely, resolving destination conflicts and cross-device moves.
 * @returns the final destination path actually used
 */
async function moveFileSafely(source: string, target: string): Promise<string> {
  const ext = path.extname(target);
  const base = target.slice(0, target.length - ext.length);

  let dest = target;
  let counter = 1;

  while (counter <= 100) {
    try {
      await fs.copyFile(source, dest, fs.constants.COPYFILE_EXCL);
      await fs.unlink(source);
      return dest;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "EEXIST") {
        counter++;
        dest = `${base}-${counter}${ext}`;
      } else {
        throw error;
      }
    }
  }

  throw new Error(`Failed to move ${source} after 100 collision retries`);
}

export async function handleOrganizeByProject(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = OrganizeByProjectInputSchema.safeParse(args);
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

    const { source_dir, target_dir, dry_run, recursive, response_format } =
      parsed.data;

    const validatedSourcePath = await validateStrictPath(source_dir);
    const validatedTargetPath = await validateStrictPath(target_dir);

    const files = await new FileScannerService().getAllFiles(
      validatedSourcePath,
      recursive,
    );

    const result: ProjectOrganizationResult = {
      success: true,
      organizedFiles: 0,
      skippedFiles: 0,
      errors: [],
      results: [],
      structure: {},
    };

    if (files.length === 0) {
      if (response_format === "json") {
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      }
      return {
        content: [
          { type: "text", text: "No files found in the source directory." },
        ],
      };
    }

    const projects = await detectProjects(
      files.map((f) => ({ path: f.path, name: f.name })),
    );

    const rollbackActions: RollbackAction[] = [];
    const usedFolders = new Set<string>();

    for (const project of projects) {
      let folder = sanitizeProjectName(project.name);
      const folderBase = folder;
      let folderCounter = 2;
      while (usedFolders.has(folder)) {
        folder = `${folderBase}-${folderCounter}`;
        folderCounter++;
      }
      usedFolders.add(folder);

      const targetFolder = path.join(validatedTargetPath, folder);
      const resolvedTargetRoot = path.resolve(validatedTargetPath);

      if (!result.structure[folder]) {
        result.structure[folder] = [];
      }

      for (const file of project.files) {
        const targetPath = path.join(targetFolder, file.name);

        // Defense-in-depth: reject names that could escape the target directory
        // (e.g. ".." or names containing path separators from a hostile source).
        if (
          file.name === "." ||
          file.name === ".." ||
          path.basename(file.name) !== file.name
        ) {
          result.skippedFiles++;
          result.errors.push({
            file: file.name,
            error: "Unsafe file name rejected",
          });
          continue;
        }

        if (!path.resolve(targetPath).startsWith(resolvedTargetRoot + path.sep)) {
          result.skippedFiles++;
          result.errors.push({
            file: file.name,
            error: "Unsafe destination path rejected",
          });
          continue;
        }

        if (dry_run) {
          result.structure[folder]!.push(file.name);
          result.results.push({
            file: file.name,
            project: folder,
            targetPath,
            signal: file.signal,
          });
          result.organizedFiles++;
          continue;
        }

        try {
          await fs.mkdir(targetFolder, { recursive: true });
          const finalPath = await moveFileSafely(file.path, targetPath);
          rollbackActions.push({
            type: "move",
            originalPath: file.path,
            currentPath: finalPath,
            timestamp: Date.now(),
          });
          result.structure[folder]!.push(file.name);
          result.results.push({
            file: file.name,
            project: folder,
            targetPath: finalPath,
            signal: file.signal,
          });
          result.organizedFiles++;
        } catch (error) {
          result.skippedFiles++;
          result.errors.push({
            file: file.name,
            error: sanitizeErrorMessage(
              error instanceof Error ? error : String(error),
            ),
          });
        }
      }
    }

    // Files that no project claimed are neither moved nor counted elsewhere;
    // surface them as skipped so the summary accounts for every scanned file.
    const claimedPaths = new Set<string>();
    for (const project of projects) {
      for (const f of project.files) {
        claimedPaths.add(f.path);
      }
    }
    result.skippedFiles += files.length - claimedPaths.size;

    if (!dry_run && rollbackActions.length > 0) {
      try {
        const rollbackService = new RollbackService();
        await rollbackService.createManifest(
          `Project organization from ${validatedSourcePath} to ${validatedTargetPath} (${rollbackActions.length} files)`,
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
    const markdown = `### Project Organization Result ${dryRunText}

**Source:** \`${validatedSourcePath}\`
**Target:** \`${validatedTargetPath}\`

**Summary:**
- **Success:** ${result.success ? "\u2705" : "\u274c"}
- **Projects Detected:** ${Object.keys(result.structure).length}
- **Organized Files:** ${result.organizedFiles}
- **Skipped Files:** ${result.skippedFiles}
- **Errors:** ${result.errors.length}

**Detected Projects:**
${Object.entries(result.structure)
  .map(
    ([folder, fileNames]) =>
      `- **${escapeMarkdown(folder)}**: ${fileNames.length} file(s)\n  ${fileNames.map((f) => `  - \`${escapeMarkdown(f)}\``).join("\n")}`,
  )
  .join("\n")}

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
