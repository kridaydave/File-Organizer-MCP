/**
 * File Organizer MCP Server v3.4.1
 * smart_suggest Tool
 *
 * Analyze directory health and get actionable suggestions for organization
 *
 * @module tools/smart-suggest
 */

import { z } from "zod";
import type { ToolDefinition, ToolResponse } from "../types.js";
import { validateStrictPath } from "../services/path-validator.service.js";
import { SmartSuggestService } from "../services/smart-suggest.service.js";
import { createErrorResponse } from "../utils/error-handler.js";
import { CommonParamsSchema } from "../schemas/common.schemas.js";
import { loadUserConfig } from "../config.js";

export const SmartSuggestInputSchema = z
  .object({
    directory: z
      .string()
      .min(1, "Directory path cannot be empty")
      .describe("Directory to analyze"),
    include_subdirs: z
      .boolean()
      .optional()
      .default(true)
      .describe("Include subdirectories"),
    include_duplicates: z
      .boolean()
      .optional()
      .default(true)
      .describe("Check for duplicates (slower)"),
    max_files: z
      .number()
      .min(1)
      .max(100000)
      .optional()
      .default(10000)
      .describe("Maximum files to scan"),
    timeout_seconds: z
      .number()
      .min(10)
      .max(300)
      .optional()
      .default(60)
      .describe("Timeout in seconds"),
    sample_rate: z
      .number()
      .min(0.01)
      .max(1)
      .optional()
      .default(1)
      .describe("Sample rate for large dirs"),
    use_cache: z
      .boolean()
      .optional()
      .default(true)
      .describe("Use cached results"),
  })
  .merge(CommonParamsSchema);

export type SmartSuggestInput = z.infer<typeof SmartSuggestInputSchema>;

export const smartSuggestToolDefinition: ToolDefinition = {
  name: "file_organizer_smart_suggest",
  title: "Smart Suggest",
  description:
    "Analyze directory health and get actionable suggestions for organization",
  inputSchema: {
    type: "object",
    properties: {
      directory: {
        type: "string",
        description: "Directory to analyze",
      },
      include_subdirs: {
        type: "boolean",
        description: "Include subdirectories",
        default: true,
      },
      include_duplicates: {
        type: "boolean",
        description: "Check for duplicates (slower)",
        default: true,
      },
      max_files: {
        type: "number",
        description: "Maximum files to scan",
        default: 10000,
      },
      timeout_seconds: {
        type: "number",
        description: "Timeout in seconds",
        default: 60,
      },
      sample_rate: {
        type: "number",
        description: "Sample rate for large dirs",
        default: 1,
      },
      use_cache: {
        type: "boolean",
        description: "Use cached results",
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
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
};

interface HealthResult {
  directory: string;
  score: number;
  grade: string;
  metrics: {
    totalFiles: number;
    totalSizeReadable: string;
    duplicateGroups: number;
    duplicateSpaceReadable: string;
    unorganizedFiles: number;
    organizationScore: number;
    filesByCategory: string;
  };
  suggestions: Array<{
    title: string;
    description: string;
    priority: string;
    impact: string;
    estimatedSavings?: string;
  }>;
  analyzedAt: Date;
}

export async function handleSmartSuggest(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = SmartSuggestInputSchema.safeParse(args);
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
      include_duplicates,
      max_files,
      timeout_seconds,
      sample_rate,
      use_cache,
      response_format,
    } = parsed.data;

    const validatedPath = await validateStrictPath(directory);

    const service = new SmartSuggestService();

    const result = (await service.analyzeHealth(validatedPath, {
      includeSubdirs: include_subdirs,
      includeDuplicates: include_duplicates,
      maxFiles: max_files,
      timeoutSeconds: timeout_seconds,
      sampleRate: sample_rate,
      useCache: use_cache,
    })) as unknown as HealthResult;

    if (response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    }

    const markdown = formatHealthReport(result);
    return {
      content: [{ type: "text", text: markdown }],
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}

function formatHealthReport(result: HealthResult): string {
  const { score, grade, metrics, suggestions, analyzedAt } = result;

  let report = `# Directory Health Report\n\n`;
  report += `**Directory:** \`${result.directory}\`\n`;
  report += `**Overall Score:** ${score}/100\n`;
  report += `**Grade:** ${grade}\n`;
  report += `**Analyzed:** ${analyzedAt.toISOString()}\n\n`;

  report += `## Metrics Breakdown\n\n`;
  report += `| Metric | Value |\n`;
  report += `|--------|-------|\n`;
  report += `| Total Files | ${metrics.totalFiles.toLocaleString()} |\n`;
  report += `| Total Size | ${metrics.totalSizeReadable} |\n`;
  report += `| Duplicate Groups | ${metrics.duplicateGroups} |\n`;
  report += `| Duplicate Space Wasted | ${metrics.duplicateSpaceReadable} |\n`;
  report += `| Unorganized Files | ${metrics.unorganizedFiles.toLocaleString()} |\n`;
  report += `| Organization Score | ${metrics.organizationScore}/100 |\n`;
  report += `| Files by Category | ${metrics.filesByCategory} |\n\n`;

  if (suggestions.length > 0) {
    report += `## Suggestions\n\n`;
    suggestions.forEach((suggestion, i) => {
      report += `### ${i + 1}. ${suggestion.title}\n\n`;
      report += `${suggestion.description}\n\n`;
      report += `**Priority:** ${suggestion.priority}\n`;
      report += `**Impact:** ${suggestion.impact}\n`;
      if (suggestion.estimatedSavings) {
        report += `**Estimated Savings:** ${suggestion.estimatedSavings}\n`;
      }
      report += `\n`;
    });
  } else {
    report += `## Suggestions\n\nNo suggestions at this time. Your directory is well-organized!\n`;
  }

  return report;
}
