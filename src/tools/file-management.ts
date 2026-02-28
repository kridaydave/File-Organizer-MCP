/**
 * File Organizer MCP Server v3.4.1
 * file-management Tool (Get Categories / Set Rules)
 *
 * @module tools/file-management
 */

import { z } from "zod";
import type { ToolDefinition, ToolResponse, CustomRule } from "../types.js";
import { CATEGORIES } from "../constants.js";
import { createErrorResponse } from "../utils/error-handler.js";
import { CommonParamsSchema } from "../schemas/common.schemas.js";
// We need a singleton service to persist rules across calls in this process
import { globalCategorizerService } from "../services/index.js";

export const GetCategoriesInputSchema = z.object({}).merge(CommonParamsSchema);

export const getCategoriesToolDefinition: ToolDefinition = {
  name: "file_organizer_get_categories",
  title: "Get Available File Categories",
  description: "Returns the list of categories used for file organization",
  inputSchema: {
    type: "object",
    properties: {
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        default: "markdown",
      },
    },
    required: [],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

export const SetCustomRulesInputSchema = z.object({
  rules: z.array(
    z.object({
      category: z.string(),
      extensions: z.array(z.string()).optional(),
      filename_pattern: z.string().optional(),
      priority: z.number().int().min(0).default(0),
    }),
  ),
});

export const setCustomRulesToolDefinition: ToolDefinition = {
  name: "file_organizer_set_custom_rules",
  title: "Set Custom Organization Rules",
  description:
    "Customize how files are categorized. Rules persist for the current session.",
  inputSchema: {
    type: "object",
    properties: {
      rules: {
        type: "array",
        items: {
          type: "object",
          properties: {
            category: { type: "string" },
            extensions: { type: "array", items: { type: "string" } },
            filename_pattern: { type: "string" },
            priority: { type: "number" },
          },
          required: ["category"],
        },
      },
    },
    required: ["rules"],
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};

export async function handleGetCategories(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = GetCategoriesInputSchema.safeParse(args);
    // default args is empty, so it should pass if we handle undefined?
    // Zod merge might make it strict.

    const response_format = parsed.success
      ? parsed.data.response_format
      : "markdown";

    const categories = { ...CATEGORIES }; // Static defaults
    // In future we might fetch dynamic categories from globalCategorizerService if needed

    if (response_format === "json") {
      return {
        content: [
          { type: "text", text: JSON.stringify({ categories }, null, 2) },
        ],
        structuredContent: { categories },
      };
    }

    const markdown = `### Available Categories
${Object.entries(categories)
  .map(([key, exts]) => `- **${key}**: \`${exts.join(", ")}\``)
  .join("\n")}
`;
    return { content: [{ type: "text", text: markdown }] };
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleSetCustomRules(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = SetCustomRulesInputSchema.safeParse(args);
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

    const { rules } = parsed.data;

    // Apply to singleton
    const appliedCount = globalCategorizerService.setCustomRules(
      rules as CustomRule[],
    );

    if (appliedCount === 0) {
      return {
        content: [
          { type: "text", text: "No valid Custom Rules were applied." },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `✅ Applied ${appliedCount} custom organization rules`,
        },
      ],
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}
