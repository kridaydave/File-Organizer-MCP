/**
 * File Organizer MCP Server v3.5.0
 * organize_by_content Tool
 *
 * @module tools/content-organization
 */

import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import type { ToolDefinition, ToolResponse, RollbackAction } from "../types.js";
import { validateStrictPath } from "../services/path-validator.service.js";
import { FileScannerService } from "../services/file-scanner.service.js";
import {
  TopicExtractorService,
  topicExtractorService,
  type TopicMatch,
} from "../services/topic-extractor.service.js";
import { textExtractionService } from "../services/text-extraction.service.js";
import { RollbackService } from "../services/rollback.service.js";
import {
  ProjectDetectorService,
  sanitizeProjectName,
} from "../services/project-detector.service.js";
import {
  createErrorResponse,
  sanitizeErrorMessage,
} from "../utils/error-handler.js";
import { escapeMarkdown } from "../utils/index.js";
import { fileExists } from "../utils/file-utils.js";
import { CommonParamsSchema } from "../schemas/common.schemas.js";
import {
  OrganizeByContentInputSchema,
  type OrganizeByContentInput,
} from "../schemas/content.schemas.js";
import { logger } from "../utils/logger.js";

// Re-export for module consumers
export { OrganizeByContentInputSchema };
export type { OrganizeByContentInput };

const DOCUMENT_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".doc",
  ".txt",
  ".md",
  ".rtf",
  ".odt",
];

interface DocumentOrganizationResult {
  file: string;
  topics: TopicMatch[];
  primaryTopic: string;
  targetPath: string;
  shortcuts: string[];
}

interface OrganizationResult {
  success: boolean;
  organizedFiles: number;
  skippedFiles: number;
  errors: Array<{ file: string; error: string }>;
  results: DocumentOrganizationResult[];
  structure: Record<string, string[]>;
}

export const organizeByContentToolDefinition: ToolDefinition = {
  name: "file_organizer_organize_by_content",
  title: "Organize Documents by Content",
  description:
    "Organize files based on content analysis. strategy='topic' groups documents (PDF, DOCX, TXT, MD, RTF, ODT) into topic-based folders. strategy='project' groups files across all types (documents, code, images) into detected project folders using shared name tokens, content terms, and identifiers. Use dry_run=true to preview changes.",
  inputSchema: {
    type: "object",
    properties: {
      source_dir: {
        type: "string",
        description: "Full path to the directory containing document files",
      },
      target_dir: {
        type: "string",
        description:
          "Full path to the directory where organized documents will be placed",
      },
      dry_run: {
        type: "boolean",
        description: "Preview changes without moving files",
        default: true,
      },
      create_shortcuts: {
        type: "boolean",
        description: "Create shortcuts/symlinks for multi-topic documents",
        default: false,
      },
      recursive: {
        type: "boolean",
        description: "Scan subdirectories recursively",
        default: true,
      },
      strategy: {
        type: "string",
        enum: ["topic", "project"],
        default: "topic",
        description:
          "'topic' groups documents by detected topic; 'project' groups files across types into detected project folders",
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

async function extractTextFromFile(filePath: string): Promise<string> {
  try {
    const result = await textExtractionService.extract(filePath);

    if (result.truncated) {
      logger.info(
        `Text extraction truncated for ${filePath} via ${result.extractionMethod}`,
      );
    }

    return result.text;
  } catch (error) {
    logger.warn(`Failed to extract text from ${filePath}: ${error}`);
    return "";
  }
}

export async function handleOrganizeByContent(
  args: Record<string, unknown>,
  services?: {
    scanner?: FileScannerService;
    topicExtractor?: TopicExtractorService;
    projectDetector?: ProjectDetectorService;
  },
): Promise<ToolResponse> {
  try {
    const parsed = OrganizeByContentInputSchema.safeParse(args);
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
      dry_run,
      create_shortcuts,
      recursive,
      response_format,
    } = parsed.data;

    const validatedSourcePath = await validateStrictPath(source_dir);
    if (!validatedSourcePath) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Invalid or forbidden source path: ${source_dir}`,
          },
        ],
      };
    }
    const validatedTargetPath = await validateStrictPath(target_dir);
    if (!validatedTargetPath) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Invalid or forbidden target path: ${target_dir}`,
          },
        ],
      };
    }

    if (target_dir === source_dir) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Error: Source and target directories cannot be the same",
          },
        ],
      };
    }

    if (parsed.data.strategy === "project") {
      return await handleProjectOrganization(
        validatedSourcePath,
        validatedTargetPath,
        dry_run,
        recursive,
        response_format,
        services,
      );
    }

    const scanner = services?.scanner ?? new FileScannerService();

    const files = await scanner.getAllFiles(validatedSourcePath, recursive);

    if (files.length === 0) {
      const emptyResult: OrganizationResult = {
        success: true,
        organizedFiles: 0,
        skippedFiles: 0,
        errors: [],
        results: [],
        structure: {},
      };

      if (response_format === "json") {
        return {
          content: [
            { type: "text", text: JSON.stringify(emptyResult, null, 2) },
          ],
          structuredContent: emptyResult as unknown as Record<string, unknown>,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: "No files found in the source directory.",
          },
        ],
      };
    }

    const documentFiles = files.filter((f) =>
      DOCUMENT_EXTENSIONS.includes(path.extname(f.path).toLowerCase()),
    );

    const result: OrganizationResult = {
      success: true,
      organizedFiles: 0,
      skippedFiles: 0,
      errors: [],
      results: [],
      structure: {},
    };

    // Track rollback actions for undo support
    const rollbackActions: RollbackAction[] = [];

    const topicExtractor =
      services?.topicExtractor ?? new TopicExtractorService();

    for (const file of documentFiles) {
      try {
        const text = await extractTextFromFile(file.path);

        if (!text || text.trim().length < 50) {
          result.skippedFiles++;
          result.errors.push({
            file: file.name,
            error: "Insufficient text content for analysis",
          });
          continue;
        }

        const extractionResult = topicExtractor.extractTopics(text);

        if (extractionResult.topics.length === 0) {
          result.skippedFiles++;
          result.errors.push({
            file: file.name,
            error: "No topics detected",
          });
          continue;
        }

        const primaryTopic = extractionResult.topics[0]!;
        const topicFolder = primaryTopic.topic;
        const targetFolder = path.join(validatedTargetPath, topicFolder);
        const targetPath = path.join(targetFolder, file.name);

        const docResult: DocumentOrganizationResult = {
          file: file.name,
          topics: extractionResult.topics,
          primaryTopic: topicFolder,
          targetPath,
          shortcuts: [],
        };

        if (!result.structure[topicFolder]) {
          result.structure[topicFolder] = [];
        }
        result.structure[topicFolder]!.push(file.name);

        if (!dry_run) {
          await fs.mkdir(targetFolder, { recursive: true });
          await fs.rename(file.path, targetPath);

          // Track rollback action for undo support
          rollbackActions.push({
            type: "move",
            originalPath: file.path,
            currentPath: targetPath,
            timestamp: Date.now(),
          });

          if (create_shortcuts && extractionResult.topics.length > 1) {
            for (const secondaryTopic of extractionResult.topics.slice(1)) {
              const shortcutFolder = path.join(
                validatedTargetPath,
                secondaryTopic.topic,
              );
              await fs.mkdir(shortcutFolder, { recursive: true });
              const shortcutPath = path.join(
                shortcutFolder,
                `${file.name}.lnk`,
              );

              try {
                await fs.symlink(targetPath, shortcutPath);
                docResult.shortcuts.push(shortcutPath);
                // Track symlink for rollback cleanup (reuses "copy" undo = delete)
                rollbackActions.push({
                  type: "copy",
                  originalPath: targetPath,
                  currentPath: shortcutPath,
                  timestamp: Date.now(),
                });
              } catch (symlinkError) {
                logger.warn(
                  `Failed to create symlink for ${file.name}: ${symlinkError}`,
                );
              }
            }
          }
        }

        result.results.push(docResult);
        result.organizedFiles++;
      } catch (error) {
        result.errors.push({
          file: file.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Save rollback manifest if any files were actually moved
    if (!dry_run && rollbackActions.length > 0) {
      try {
        const rollbackService = new RollbackService();
        await rollbackService.createManifest(
          `Content organization from ${validatedSourcePath} to ${validatedTargetPath} (${rollbackActions.length} files)`,
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
    const markdown = `### Content Organization Result ${dryRunText}

**Source:** \`${validatedSourcePath}\`
**Target:** \`${validatedTargetPath}\`
**Recursive:** ${recursive}
**Create Shortcuts:** ${create_shortcuts}

**Summary:**
- **Success:** ${result.success ? "✅" : "❌"}
- **Organized Files:** ${result.organizedFiles}
- **Skipped Files:** ${result.skippedFiles}
- **Errors:** ${result.errors.length}

**Organized by Topic:**
${Object.entries(result.structure)
  .map(
    ([folder, files]) =>
      `- **${escapeMarkdown(folder)}**: ${files.length} file(s)\n  ${files.map((f) => `  - \`${escapeMarkdown(f)}\``).join("\n")}`,
  )
  .join("\n")}

${
  result.results.length > 0
    ? `**File Details:**
${result.results
  .map(
    (r) =>
      `- \`${escapeMarkdown(r.file)}\` → **${escapeMarkdown(r.primaryTopic)}** (${r.topics.map((t) => `${escapeMarkdown(t.topic)}: ${(t.confidence * 100).toFixed(0)}%`).join(", ")})`,
  )
  .join("\n")}`
    : ""
}

${result.errors.length > 0 ? `**Errors:**\n${result.errors.map((e) => `- \`${escapeMarkdown(e.file)}\`: ${e.error}`).join("\n")}` : ""}`;

    return {
      content: [{ type: "text", text: markdown }],
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}

/**
 * Move a file safely, resolving destination conflicts and cross-device moves.
 * @returns the final destination path actually used
 */
async function moveFileSafely(source: string, target: string): Promise<string> {
  let dest = target;
  let counter = 2;
  while (await fileExists(dest)) {
    const ext = path.extname(target);
    const base = target.slice(0, target.length - ext.length);
    dest = `${base}-${counter}${ext}`;
    counter++;
  }

  try {
    await fs.rename(source, dest);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EXDEV") {
      await fs.copyFile(source, dest, fs.constants.COPYFILE_EXCL);
      await fs.unlink(source);
    } else {
      throw error;
    }
  }
  return dest;
}

/**
 * Project strategy: detect related files across types, group them into
 * project folders, and move them (or preview the proposed structure).
 */
async function handleProjectOrganization(
  sourceDir: string,
  targetDir: string,
  dryRun: boolean,
  recursive: boolean,
  responseFormat: OrganizeByContentInput["response_format"],
  services?: {
    scanner?: FileScannerService;
    projectDetector?: ProjectDetectorService;
  },
): Promise<ToolResponse> {
  const scanner = services?.scanner ?? new FileScannerService();
  const files = await scanner.getAllFiles(sourceDir, recursive);

  const result: OrganizationResult = {
    success: true,
    organizedFiles: 0,
    skippedFiles: 0,
    errors: [],
    results: [],
    structure: {},
  };

  if (files.length === 0) {
    if (responseFormat === "json") {
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

  const detector = services?.projectDetector ?? new ProjectDetectorService();
  const projects = await detector.detect(
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

    const targetFolder = path.join(targetDir, folder);
    const resolvedTargetRoot = path.resolve(targetDir);

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

      const docResult: DocumentOrganizationResult = {
        file: file.name,
        topics: [],
        primaryTopic: folder,
        targetPath,
        shortcuts: [],
      };

      if (dryRun) {
        result.structure[folder]!.push(file.name);
        result.results.push(docResult);
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
        result.results.push({ ...docResult, targetPath: finalPath });
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

  if (!dryRun && rollbackActions.length > 0) {
    try {
      const rollbackService = new RollbackService();
      await rollbackService.createManifest(
        `Project organization from ${sourceDir} to ${targetDir} (${rollbackActions.length} files)`,
        rollbackActions,
      );
    } catch (manifestErr) {
      logger.error(
        `Failed to create rollback manifest: ${manifestErr instanceof Error ? manifestErr.message : String(manifestErr)}`,
      );
    }
  }

  if (responseFormat === "json") {
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result as unknown as Record<string, unknown>,
    };
  }

  const dryRunText = dryRun ? "(Dry Run - No files were moved)" : "";
  const markdown = `### Project Organization Result ${dryRunText}

**Source:** \`${sourceDir}\`
**Target:** \`${targetDir}\`

**Summary:**
- **Success:** ${result.success ? "✅" : "❌"}
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
    ? `**Errors:**\n${result.errors.map((e) => `- \`${escapeMarkdown(e.file)}\`: ${e.error}`).join("\n")}`
    : ""
}`;

  return {
    content: [{ type: "text", text: markdown }],
  };
}
