/**
 * File Organizer MCP Server v3.4.0
 * list_files Tool
 *
 * @module tools/file-listing
 */

import fs from "fs/promises";
import path from "path";
import type {
  ToolDefinition,
  ToolResponse,
  BasicFileInfo,
  ListResult,
} from "../types.js";
import { validateStrictPath } from "../services/path-validator.service.js";
import { createErrorResponse } from "../utils/error-handler.js";
import {
  ListFilesInputSchema,
  type ListFilesInput,
} from "../schemas/scan.schemas.js";

export const listFilesToolDefinition: ToolDefinition = {
  name: "file_organizer_list_files",
  title: "List Files in Directory",
  description:
    "List all files in a directory with basic information. Returns file names and paths. Does not recurse into subdirectories.",
  inputSchema: {
    type: "object",
    properties: {
      directory: { type: "string", description: "Full path to the directory" },
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

export async function handleListFiles(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = ListFilesInputSchema.safeParse(args);
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

    const { directory, response_format, limit, offset } = parsed.data;
    const validatedPath = await validateStrictPath(directory);
    const entries = await fs.readdir(validatedPath, { withFileTypes: true });

    const allFiles: BasicFileInfo[] = entries
      .filter((entry) => entry.isFile())
      .map((entry) => ({
        name: entry.name,
        path: path.join(validatedPath, entry.name),
      }));

    // Pagination logic
    const total_count = allFiles.length;
    const paginatedFiles = allFiles.slice(offset, offset + limit);
    const returned_count = paginatedFiles.length;
    const has_more = offset + limit < total_count;
    const next_offset = has_more ? offset + limit : undefined;

    const result: ListResult = {
      directory: validatedPath,
      total_count,
      returned_count,
      offset,
      has_more,
      next_offset,
      items: paginatedFiles,
    };

    if (response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    }

    const markdown = `### Files in \`${result.directory}\`
**Total Files:** ${result.total_count}
**Showing:** ${result.returned_count > 0 ? result.offset + 1 : 0} - ${result.offset + result.returned_count}

${result.items.map((f) => `- [${f.name}](file://${f.path})`).join("\n")}

${result.has_more ? `*... ${result.total_count - (result.offset + result.returned_count)} more files (use offset=${result.next_offset})*` : ""}`;

    return {
      content: [{ type: "text", text: markdown }],
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}
