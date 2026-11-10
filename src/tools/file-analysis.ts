/**
 * File Organizer MCP Server v5.0.0
 * find_largest_files Tool
 *
 * @module tools/file-analysis
 */

import fs from "fs/promises";
import type {
  ToolDefinition,
  ToolResponse,
  LargestFilesResult,
  LargestFileInfo,
} from "../types.js";
import { validateStrictPath } from "../services/path-validator.service.js";
import { FileScannerService } from "../core/scan/scanner.js";
import { createErrorResponse, sanitizeErrorMessage } from "../utils/error-handler.js";
import { formatBytes } from "../utils/formatters.js";
import { ValidationError } from "../types.js";
import {
  FindLargestFilesInputSchema,
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
    if (!validatedPath) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: sanitizeErrorMessage(`Error: Invalid or forbidden source path: ${directory}`),
          },
        ],
      };
    }

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
