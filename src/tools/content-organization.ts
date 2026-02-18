/**
 * File Organizer MCP Server v3.4.0
 * organize_by_content Tool
 *
 * @module tools/content-organization
 */

import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import type { ToolDefinition, ToolResponse } from "../types.js";
import { validateStrictPath } from "../services/path-validator.service.js";
import { FileScannerService } from "../services/file-scanner.service.js";
import {
  topicExtractorService,
  type TopicMatch,
} from "../services/topic-extractor.service.js";
import { textExtractionService } from "../services/text-extraction.service.js";
import { createErrorResponse } from "../utils/error-handler.js";
import { escapeMarkdown } from "../utils/index.js";
import { CommonParamsSchema } from "../schemas/common.schemas.js";
import { logger } from "../utils/logger.js";

export const OrganizeByContentInputSchema = z
  .object({
    source_dir: z
      .string()
      .min(1, "Source directory path cannot be empty")
      .describe("Full path to the directory containing document files"),
    target_dir: z
      .string()
      .min(1, "Target directory path cannot be empty")
      .describe(
        "Full path to the directory where organized documents will be placed",
      ),
    dry_run: z
      .boolean()
      .optional()
      .default(true)
      .describe("If true, only preview changes without moving files"),
    create_shortcuts: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "For multi-topic documents, create shortcuts/symlinks in additional topic folders",
      ),
    recursive: z
      .boolean()
      .optional()
      .default(true)
      .describe("Scan subdirectories recursively"),
  })
  .merge(CommonParamsSchema);

export type OrganizeByContentInput = z.infer<
  typeof OrganizeByContentInputSchema
>;

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
    "Organize document files into topic-based folders using content analysis. Supports PDF, DOCX, TXT, MD, RTF, ODT. Use dry_run=true to preview changes.",
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

    const scanner = new FileScannerService();

    const files = await scanner.getAllFiles(validatedSourcePath, recursive);

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

        const extractionResult = topicExtractorService.extractTopics(text);

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
