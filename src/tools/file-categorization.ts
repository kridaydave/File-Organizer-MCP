/**
 * File Organizer MCP Server v3.4.1
 * categorize_by_type Tool
 *
 * @module tools/file-categorization
 */

import {
  CategorizeByTypeInputSchema,
  type CategorizeByTypeInput,
} from "../schemas/scan.schemas.js";
export { CategorizeByTypeInputSchema } from "../schemas/scan.schemas.js";
export type { CategorizeByTypeInput } from "../schemas/scan.schemas.js";
import type {
  ToolDefinition,
  ToolResponse,
  CategorizedResult,
  CategoryName,
} from "../types.js";
import { validateStrictPath } from "../services/path-validator.service.js";
import { FileScannerService } from "../services/file-scanner.service.js";
import { globalCategorizerService } from "../services/index.js";
import { createErrorResponse } from "../utils/error-handler.js";

export const categorizeByTypeToolDefinition: ToolDefinition = {
  name: "file_organizer_categorize_by_type",
  title: "Categorize Files by Type",
  description:
    "Categorize files by their type (Executables, Videos, Documents, etc.) and show statistics for each category. Enable use_content_analysis to detect file type mismatches and security threats.",
  inputSchema: {
    type: "object",
    properties: {
      directory: {
        type: "string",
        description: "Full path to the directory to categorize",
      },
      include_subdirs: {
        type: "boolean",
        description: "Include subdirectories",
        default: false,
      },
      use_content_analysis: {
        type: "boolean",
        description:
          "Analyze file content for accurate type detection (slower but detects mismatches and threats)",
        default: false,
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

export async function handleCategorizeByType(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = CategorizeByTypeInputSchema.safeParse(args);
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
      use_content_analysis,
      response_format,
    } = parsed.data;
    const validatedPath = await validateStrictPath(directory);
    const scanner = new FileScannerService();
    // Use global categorizer which has content analyzer and metadata cache
    const categorizer = globalCategorizerService;

    const files = await scanner.getAllFiles(validatedPath, include_subdirs);

    // Track content analysis warnings
    const contentWarnings: Array<{
      file: string;
      warnings: string[];
      category: string;
    }> = [];

    let categories: CategorizedResult["categories"];

    if (use_content_analysis) {
      // Perform content-based categorization for each file
      // Build a map of file paths to their content-analyzed categories
      const fileCategoryMap = new Map<string, string>();
      for (const file of files) {
        const result = await categorizer.getCategoryByContent(file.path);
        fileCategoryMap.set(file.path, result.category);
        if (result.warnings.length > 0) {
          contentWarnings.push({
            file: file.path,
            warnings: result.warnings,
            category: result.category,
          });
        }
      }
      // Create a modified categorizer that uses our content-based categories
      const originalGetCategory = categorizer.getCategory.bind(categorizer);
      categorizer.getCategory = (name: string) => {
        // Find the file in our map
        for (const [path, cat] of fileCategoryMap.entries()) {
          if (path.endsWith(name)) {
            return cat as CategoryName;
          }
        }
        return originalGetCategory(name);
      };
      categories = await categorizer.categorizeFiles(files);
      // Restore original method
      categorizer.getCategory = originalGetCategory;
    } else {
      categories = await categorizer.categorizeFiles(files);
    }

    const result: CategorizedResult & {
      content_warnings?: typeof contentWarnings;
    } = {
      directory: validatedPath,
      categories,
    };

    if (contentWarnings.length > 0) {
      result.content_warnings = contentWarnings;
    }

    if (response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    }

    let markdown = `### File Categories in \`${result.directory}\``;

    if (use_content_analysis) {
      markdown += "\n*(Content analysis enabled)*";
    }

    markdown += "\n\n";

    markdown += Object.entries(result.categories)
      .map(
        ([cat, stats]) =>
          `#### ${cat} (${stats?.count} files, ${stats?.total_size_readable})\n${stats?.files
            .slice(0, 5)
            .map((f) => `- ${f}`)
            .join(
              "\n",
            )}${stats && stats.count > 5 ? `\n- ...and ${stats.count - 5} more` : ""}`,
      )
      .join("\n\n");

    if (contentWarnings.length > 0) {
      markdown += "\n\n#### ⚠️ Content Analysis Warnings\n\n";
      markdown += contentWarnings
        .map((w) => `- \`${w.file}\`: ${w.warnings.join(", ")}`)
        .join("\n");
    }

    return {
      content: [{ type: "text", text: markdown }],
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}
