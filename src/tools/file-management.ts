/**
 * File Organizer MCP Server v5.0.0
 * file-management Tool (Get Categories / Set Rules)
 *
 * @module tools/file-management
 */

import { z } from "zod";
import type { ToolDefinition, ToolResponse, CustomRule } from "../types.js";
import { CATEGORIES } from "../constants.js";
import { CategorizerService } from "../services/categorizer.service.js";
import { updateUserConfig } from "../config.js";
import { createErrorResponse } from "../utils/error-handler.js";
import {
  GetCategoriesInputSchema,
  SetCustomRulesInputSchema,
} from "../schemas/system.js";

export {
  GetCategoriesInputSchema,
  SetCustomRulesInputSchema,
} from "../schemas/system.js";
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
    // Custom rules affect categorization results, not the category list.

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
        isError: true,
      };
    }

    const { rules } = parsed.data;

    // Schema is snake_case on the wire; CustomRule is camelCase internally.
    // (The old singleton path cast these straight through, so filename
    // patterns from this tool never actually matched.)
    const normalized: CustomRule[] = rules.map((rule) => ({
      category: rule.category,
      ...(rule.extensions !== undefined && { extensions: rule.extensions }),
      ...(rule.filename_pattern !== undefined && {
        filenamePattern: rule.filename_pattern,
      }),
      priority: rule.priority,
    }));

    // Validate against a scratch instance, then persist the valid subset so
    // every future request loads them from config (stateless, survives restarts).
    const probe = new CategorizerService();
    const validRules = normalized.filter(
      (rule) => probe.setCustomRules([rule]) === 1,
    );

    if (validRules.length === 0) {
      return {
        content: [
          { type: "text", text: "No valid Custom Rules were applied." },
        ],
        isError: true,
      };
    }

    updateUserConfig({ customRules: validRules });

    return {
      content: [
        {
          type: "text",
          text: `✅ Applied ${validRules.length} custom organization rules`,
        },
      ],
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}
