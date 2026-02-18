/**
 * File Organizer MCP Server v3.4.0
 * scan_directory Tool
 *
 * @module tools/file-scanning
 */

import { z } from "zod";
import fs from "fs/promises";
import type { ToolDefinition, ToolResponse, ScanResult } from "../types.js";
import { validateStrictPath } from "../services/path-validator.service.js";
import { FileScannerService } from "../services/file-scanner.service.js";
import { contentScreeningService } from "../services/content-screening.service.js";
import { createErrorResponse } from "../utils/error-handler.js";
import { formatBytes } from "../utils/formatters.js";
import { escapeMarkdown } from "../utils/index.js";
import {
  CommonParamsSchema,
  PaginationSchema,
} from "../schemas/common.schemas.js";
import { ValidationError } from "../types.js";

export const ScanDirectoryInputSchema = z
  .object({
    directory: z
      .string()
      .min(1, "Directory path cannot be empty")
      .describe("Full path to the directory to scan"),
    include_subdirs: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include subdirectories in the scan"),
    max_depth: z
      .number()
      .int()
      .min(-1)
      .max(100)
      .optional()
      .default(-1)
      .describe(
        "Maximum depth to scan (0 = current directory only, -1 = unlimited, max 100)",
      ),
    screen_files: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Screen files for security threats (malware detection, extension mismatches)",
      ),
  })
  .merge(CommonParamsSchema)
  .merge(PaginationSchema);

export type ScanDirectoryInput = z.infer<typeof ScanDirectoryInputSchema>;

export const scanDirectoryToolDefinition: ToolDefinition = {
  name: "file_organizer_scan_directory",
  title: "Scan Directory for Detailed Info",
  description:
    "Scan directory and get detailed file information including size, dates, and extensions. Supports recursive scanning and security screening.",
  inputSchema: {
    type: "object",
    properties: {
      directory: {
        type: "string",
        description: "Full path to the directory to scan",
      },
      include_subdirs: {
        type: "boolean",
        description: "Include subdirectories in the scan",
        default: false,
      },
      max_depth: {
        type: "number",
        description: "Maximum depth to scan",
        default: -1,
      },
      screen_files: {
        type: "boolean",
        description: "Screen files for security threats",
        default: false,
      },
      limit: {
        type: "number",
        description: "Max items to return",
        default: 100,
      },
      offset: { type: "number", description: "Items to skip", default: 0 },
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        default: "markdown",
      },
    },
    required: ["directory"],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
};

export async function handleScanDirectory(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = ScanDirectoryInputSchema.safeParse(args);
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
      directory,
      include_subdirs,
      max_depth,
      screen_files,
      response_format,
      limit,
      offset,
    } = parsed.data;
    const validatedPath = await validateStrictPath(directory);
    if (!validatedPath) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Invalid or forbidden source path: ${directory}`,
          },
        ],
      };
    }

    // Check if directory exists
    try {
      const stats = await fs.stat(validatedPath);
      if (!stats.isDirectory()) {
        throw new ValidationError("Path is not a directory");
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        throw new ValidationError(`Directory does not exist: ${directory}`);
      }
      throw error;
    }

    const scanner = new FileScannerService();
    const allFiles = await scanner.scanDirectory(validatedPath, {
      includeSubdirs: include_subdirs,
      maxDepth: max_depth,
    });

    let screeningReport = null;
    if (screen_files) {
      const filePaths = allFiles.map((f) => f.path);
      const screeningResults =
        await contentScreeningService.screenBatch(filePaths);
      screeningReport =
        contentScreeningService.generateScreeningReport(screeningResults);
    }

    const totalSize = allFiles.reduce((sum, file) => sum + file.size, 0);

    // Pagination logic
    const total_count = allFiles.length;
    const paginatedFiles = allFiles.slice(offset, offset + limit);
    const returned_count = paginatedFiles.length;
    const has_more = offset + limit < total_count;
    const next_offset = has_more ? offset + limit : undefined;

    const result: ScanResult = {
      directory: validatedPath,
      total_count,
      returned_count,
      offset,
      has_more,
      next_offset,
      items: paginatedFiles,
      total_size: totalSize,
      total_size_readable: formatBytes(totalSize),
      screening_report: screeningReport,
    };

    if (response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    }

    const markdown = `### Scan Results for \`${result.directory}\`
**Total Files:** ${result.total_count}
**Total Size:** ${result.total_size_readable}
**Showing:** ${result.offset + 1} - ${result.offset + result.returned_count}

${result.items.map((f) => `- **${escapeMarkdown(f.name)}** (${formatBytes(f.size)}) - ${f.modified.toISOString().split("T")[0]}`).join("\n")}

${result.has_more ? `*... ${result.total_count - (result.offset + result.returned_count)} more files (use offset=${result.next_offset})*` : ""}

${screeningReport ? `### Security Screening Report\n${screeningReport}` : ""}`;

    return {
      content: [{ type: "text", text: markdown }],
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}
