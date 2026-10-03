/**
 * File Organizer MCP Server v5.0.0
 * find_largest_files + disk_usage_by_category Tools
 *
 * @module tools/file-analysis
 */

import type {
  ToolDefinition,
  ToolResponse,
  LargestFilesResult,
  LargestFileInfo,
  DiskUsageResult,
} from "../types.js";
import { validateStrictPath } from "../services/path-validator.service.js";
import { FileScannerService } from "../core/scan/scanner.js";
import { summarizeDiskUsage } from "../core/scan/disk-usage.js";
import { CategorizerService } from "../services/categorizer.service.js";
import { createErrorResponse } from "../utils/error-handler.js";
import { formatBytes } from "../utils/formatters.js";
import { createRequestContext, type ToolContext } from "../mcp/context.js";
import {
  FindLargestFilesInputSchema,
  DiskUsageByCategoryInputSchema,
  type FindLargestFilesInput,
} from "../schemas/scan.js";
import { diskUsageByCategoryOutputJsonSchema } from "../schemas/output.js";

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

export const diskUsageByCategoryToolDefinition: ToolDefinition = {
  name: "file_organizer_disk_usage_by_category",
  title: "Disk Usage by Category",
  description:
    "Report how much space a directory holds per category: bytes, file count, and share of the total. Categories come from the same categorizer organize_files uses, including your custom rules, and sizes are summed from the scan, so this costs one directory walk and no extra dependency. `include_subdirs` defaults to true because the space a category holds usually sits below the directory you point at. Read-only.",
  inputSchema: {
    type: "object",
    properties: {
      directory: {
        type: "string",
        description: "Full path to the directory to measure",
      },
      include_subdirs: {
        type: "boolean",
        description: "Include subdirectories",
        default: true,
      },
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        default: "markdown",
      },
    },
    required: ["directory"],
  },
  outputSchema: diskUsageByCategoryOutputJsonSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
};

function usageMarkdown(result: DiskUsageResult): string {
  if (result.categories.length === 0) {
    return `### Disk usage by category in \`${result.directory}\`\n\nNo files found.`;
  }

  const rows = result.categories
    .map(
      (c) =>
        `| ${c.category} | ${c.file_count} | ${c.total_size_readable} | ${c.percent_of_total}% |`,
    )
    .join("\n");

  return `### Disk usage by category in \`${result.directory}\`

**Total:** ${result.total_files} file(s), ${result.total_size_readable}

| Category | Files | Size | Share |
| -------- | ----: | ---: | ----: |
${rows}`;
}

export async function handleDiskUsageByCategory(
  args: Record<string, unknown>,
  ctx: ToolContext = createRequestContext(),
): Promise<ToolResponse> {
  try {
    const parsed = DiskUsageByCategoryInputSchema.safeParse(args);
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

    const { directory, include_subdirs, response_format } = parsed.data;
    const validatedPath = await validateStrictPath(directory);
    const scanner = new FileScannerService();
    const files = await scanner.getAllFiles(validatedPath, include_subdirs);
    // Categorizer is pure — construct per request from config rules.
    const categorizer = new CategorizerService(ctx.config.customRules ?? []);

    const result: DiskUsageResult = {
      directory: validatedPath,
      ...summarizeDiskUsage(files, (name) => categorizer.getCategory(name)),
    };

    if (response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    }

    // The markdown path still carries structuredContent because the tool
    // declares an outputSchema and the SDK rejects results without it.
    return {
      content: [{ type: "text", text: usageMarkdown(result) }],
      structuredContent: result as unknown as Record<string, unknown>,
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}
