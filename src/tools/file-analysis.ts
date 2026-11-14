/**
 * File Organizer MCP Server v5.0.0
* find_largest_files, find_old_files, find_empty_directories +
 * disk_usage_by_category Tools
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
  EmptyDirectoryResult,
  DiskUsageResult,
} from "../types.js";
import { validateStrictPath } from "../services/path-validator.service.js";
import { FileScannerService } from "../core/scan/scanner.js";
import { filterOldFiles } from "../core/scan/age-filter.js";
import { findEmptyDirectories } from "../core/scan/empty-dirs.js";
import { summarizeDiskUsage } from "../core/scan/disk-usage.js";
import { CategorizerService } from "../services/categorizer.service.js";
import { createErrorResponse } from "../utils/error-handler.js";
import { formatBytes } from "../utils/formatters.js";
import { createRequestContext, type ToolContext } from "../mcp/context.js";
import {
  FindLargestFilesInputSchema,
  FindOldFilesInputSchema,
  DiskUsageByCategoryInputSchema,
  FindEmptyDirectoriesInputSchema,
  type FindLargestFilesInput,
} from "../schemas/scan.js";
import {
  diskUsageByCategoryOutputJsonSchema,
  findEmptyDirectoriesOutputJsonSchema,
} from "../schemas/output.js";

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


export const findEmptyDirectoriesToolDefinition: ToolDefinition = {
  name: "file_organizer_find_empty_directories",
  title: "Find Empty Directories",
  description:
    "List directories under a root that contain no entries at all, for cleanup after a scan. Recurses by default, bounded by the configured max scan depth and a result cap. Emptiness is literal: a directory holding only dotfiles, only a subdirectory, or only a symlink has entries and is not reported, so a directory that merely looks idle is never proposed for removal. Walks real subdirectories but never enters a symlinked one; before each descent it re-resolves the subdirectory and skips it if it no longer sits under the root. `depth_limited` and `result_limited` report when the walk stopped early, so a short list is never mistaken for a complete one. Read-only: it reports, it never removes.",
  inputSchema: {
    type: "object",
    properties: {
      directory: {
        type: "string",
        description: "Full path to the directory to search",
      },
      include_subdirs: {
        type: "boolean",
        description: "Recurse into subdirectories",
        default: true,
      },
      max_depth: {
        type: "number",
        description:
          "Levels below the root to walk (0 = root only). Defaults to the configured max scan depth",
        minimum: 0,
        maximum: 100,
      },
      limit: {
        type: "number",
        description: "Maximum number of empty directories to return",
        minimum: 1,
        maximum: 1000,
        default: 100,
      },
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        default: "markdown",
      },
    },
    required: ["directory"],
  },
  outputSchema: findEmptyDirectoriesOutputJsonSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
};

function emptyDirsToMarkdown(result: EmptyDirectoryResult): string {
  const limits = [
    result.depth_limited ? " Max scan depth reached, so deeper directories were not walked." : "",
    result.result_limited
      ? ` Result cap of ${result.limit} reached, so the list is incomplete.`
      : "",
  ].join("");

  if (result.total_count === 0) {
    return `### Empty directories in \`${result.directory}\`\n\nNo empty directories found. Examined ${result.scanned_count} directory(ies).${limits}`;
  }

  const lines = result.empty_dirs.map((d) => `- \`${d}\``);

  return `### Empty directories in \`${result.directory}\`\n\nFound ${result.total_count} empty directory(ies). Examined ${result.scanned_count} directory(ies).${limits}\n\n${lines.join("\n")}`;
}

export async function handleFindEmptyDirectories(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = FindEmptyDirectoriesInputSchema.safeParse(args);
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

    const { directory, include_subdirs, max_depth, limit, response_format } =
      parsed.data;
    const validatedPath = await validateStrictPath(directory);
    const result = await findEmptyDirectories(validatedPath, {
      recurse: include_subdirs,
      maxDepth: max_depth,
      limit,
    });

    if (response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    }

    // The markdown path still carries structuredContent because the tool
    // declares an outputSchema and the SDK rejects results without it.
    return {
      content: [{ type: "text", text: emptyDirsToMarkdown(result) }],
      structuredContent: result as unknown as Record<string, unknown>,
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
