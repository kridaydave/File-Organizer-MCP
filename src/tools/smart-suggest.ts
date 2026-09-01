/**
 * File Organizer MCP Server v5.0.0
 * smart_suggest Tool
 *
 * Analyze directory health and get actionable suggestions for organization
 *
 * @module tools/smart-suggest
 */

import { z } from "zod";
import type { ToolDefinition, ToolResponse } from "../types.js";
import { validateStrictPath } from "../services/path-validator.service.js";
import {
  SmartSuggestService,
  type DirectoryHealthReport,
} from "../services/smart-suggest.service.js";
import { createErrorResponse } from "../utils/error-handler.js";
import { SmartSuggestInputSchema } from "../schemas/organize.js";

export { SmartSuggestInputSchema };
export type { SmartSuggestInput } from "../schemas/organize.js";
export const smartSuggestToolDefinition: ToolDefinition = {
  name: "file_organizer_smart_suggest",
  title: "Smart Suggest",
  description:
    "Analyze a directory and provide intelligent suggestions for organization, cleanup, and deduplication based on directory health metrics.",
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
    openWorldHint: true,
  },
};

export interface FormattedHealthReport extends DirectoryHealthReport {
  directory: string;
  analyzedAt: string;
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
        isError: true,
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

    const report = await service.analyzeHealth(validatedPath, {
      includeSubdirs: include_subdirs,
      includeDuplicates: include_duplicates,
      maxFiles: max_files,
      timeoutSeconds: timeout_seconds,
      sampleRate: sample_rate,
      useCache: use_cache,
    });

    const result: FormattedHealthReport = {
      ...report,
      directory: validatedPath,
      analyzedAt: new Date().toISOString(),
    };

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

function formatHealthReport(result: FormattedHealthReport): string {
  const { score, grade, metrics, suggestions, quickWins, directory, analyzedAt } = result;

  let report = `# Directory Health Report\n\n`;
  report += `**Directory:** \`${directory}\`\n`;
  report += `**Overall Score:** ${score}/100\n`;
  report += `**Grade:** ${grade}\n`;
  report += `**Analyzed:** ${analyzedAt}\n\n`;

  report += `## Metrics Breakdown\n\n`;
  report += `| Metric | Score | Details |\n`;
  report += `|--------|-------|---------|\n`;
  report += `| File Type Entropy | ${metrics.fileTypeEntropy.score}/100 | ${metrics.fileTypeEntropy.details} |\n`;
  report += `| Naming Consistency | ${metrics.namingConsistency.score}/100 | ${metrics.namingConsistency.details} |\n`;
  report += `| Depth Balance | ${metrics.depthBalance.score}/100 | ${metrics.depthBalance.details} |\n`;
  report += `| Duplicate Ratio | ${metrics.duplicateRatio.score}/100 | ${metrics.duplicateRatio.details} |\n`;
  report += `| Misplaced Files | ${metrics.misplacedFiles.score}/100 | ${metrics.misplacedFiles.details} |\n\n`;

  if (quickWins && quickWins.length > 0) {
    report += `## Quick Wins\n\n`;
    quickWins.forEach((win, i) => {
      report += `${i + 1}. **${win.action}** (+${win.estimatedScoreImprovement} score) using \`${win.tool}\`\n`;
    });
    report += `\n`;
  }

  if (suggestions.length > 0) {
    report += `## Suggestions\n\n`;
    suggestions.forEach((suggestion, i) => {
      report += `### ${i + 1}. [${suggestion.priority.toUpperCase()}] ${suggestion.message}\n\n`;
      if (suggestion.suggestedTool) {
        report += `**Suggested Tool:** \`${suggestion.suggestedTool}\`\n`;
      }
      if (suggestion.suggestedArgs) {
        report += `**Suggested Arguments:** \`${JSON.stringify(suggestion.suggestedArgs)}\`\n`;
      }
      report += `\n`;
    });
  } else {
    report += `## Suggestions\n\nNo suggestions at this time. Your directory is well-organized!\n`;
  }

  return report;
}
