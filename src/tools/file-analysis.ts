/**
 * File Organizer MCP Server v5.0.0
 * find_largest_files and find_old_files Tools
 *
 * @module tools/file-analysis
 */

import type {
  ToolDefinition,
  ToolResponse,
  LargestFilesResult,
  LargestFileInfo,
  OldFilesResult,
  OldFileInfo,
} from "../types.js";
import { validateStrictPath } from "../services/path-validator.service.js";
import { FileScannerService } from "../core/scan/scanner.js";
import { filterOldFiles } from "../core/scan/age-filter.js";
import { createErrorResponse } from "../utils/error-handler.js";
import { formatBytes } from "../utils/formatters.js";
import {
  FindLargestFilesInputSchema,
  FindOldFilesInputSchema,
  type FindLargestFilesInput,
} from "../schemas/scan.js";

export const findLargestFilesToolDefinition: ToolDefinition = {
  name: "file_organizer_find_largest_files",
  title: "Find Largest Files",
  description:
    "Find the largest files in a directory. Useful for identifying space-consuming files and cleanup opportunities.",
  inputSchema: {
    type: "object",
    properties: {
      directory: { type: "string", description: "Full path to the directory" },
      include_subdirs: {
        type: "boolean",
        description: "Include subdirectories",
        default: false,
      },
      top_n: {
        type: "number",
        description: "Number of files to return",
        default: 10,
      },
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

export async function handleFindLargestFiles(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = FindLargestFilesInputSchema.safeParse(args);
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

    const { directory, include_subdirs, top_n, response_format } = parsed.data;
    const validatedPath = await validateStrictPath(directory);
    const scanner = new FileScannerService();
    const files = await scanner.getAllFiles(validatedPath, include_subdirs);

    const sorted: LargestFileInfo[] = files
      .sort((a, b) => b.size - a.size)
      .slice(0, top_n)
      .map((f) => ({
        name: f.name,
        path: f.path,
        size: f.size,
        size_readable: formatBytes(f.size),
      }));

    const result: LargestFilesResult = {
      directory: validatedPath,
      largest_files: sorted,
    };

    if (response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    }

    const markdown = `### Largest ${sorted.length} Files in \`${result.directory}\`

${sorted.map((f, i) => `${i + 1}. **${f.name}** - ${f.size_readable}`).join("\n")}`;

    return {
      content: [{ type: "text", text: markdown }],
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}

export const findOldFilesToolDefinition: ToolDefinition = {
  name: "file_organizer_find_old_files",
  title: "Find Old Files",
  description:
    "Find files in a directory that have not been touched for N days, oldest first. Age is measured from the last modification time by default, or from the last access time when asked. Read-only: nothing is moved or deleted. Useful for finding forgotten archives and long-untouched downloads before deciding what to clean up.",
  inputSchema: {
    type: "object",
    properties: {
      directory: { type: "string", description: "Full path to the directory" },
      include_subdirs: {
        type: "boolean",
        description: "Include subdirectories",
        default: false,
      },
      older_than_days: {
        type: "number",
        description:
          "Only return files untouched for at least this many days (1-36500)",
        default: 365,
      },
      age_source: {
        type: "string",
        enum: ["mtime", "atime"],
        description:
          "Timestamp to measure age from: mtime (last modified) or atime (last accessed)",
        default: "mtime",
      },
      top_n: {
        type: "number",
        description: "Number of oldest files to return",
        default: 10,
      },
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

export async function handleFindOldFiles(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = FindOldFilesInputSchema.safeParse(args);
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
      directory,
      include_subdirs,
      older_than_days,
      age_source,
      top_n,
      response_format,
    } = parsed.data;
    const validatedPath = await validateStrictPath(directory);
    const scanner = new FileScannerService();
    const files = await scanner.getAllFiles(validatedPath, include_subdirs);

    const matches = filterOldFiles(files, {
      olderThanDays: older_than_days,
      source: age_source,
    });

    const oldFiles: OldFileInfo[] = matches.slice(0, top_n).map((m) => ({
      name: m.name,
      path: m.path,
      size: m.size,
      size_readable: formatBytes(m.size),
      age_days: m.age_days,
      accessed_or_modified: m.date.toISOString(),
    }));

    const result: OldFilesResult = {
      directory: validatedPath,
      age_source,
      older_than_days,
      total_count: matches.length,
      returned_count: oldFiles.length,
      old_files: oldFiles,
    };

    if (response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    }

    const basis = age_source === "atime" ? "not accessed" : "not modified";
    const markdown =
      oldFiles.length === 0
        ? `### No files in \`${result.directory}\` ${basis} in the last ${older_than_days} day(s)`
        : `### ${oldFiles.length} file(s) in \`${result.directory}\` ${basis} in the last ${older_than_days} day(s)\n\n${oldFiles
            .map(
              (f, i) =>
                `${i + 1}. **${f.name}** - ${f.age_days} days, ${f.size_readable}`,
            )
            .join("\n")}`;

    return {
      content: [{ type: "text", text: markdown }],
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}
