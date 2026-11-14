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
import { loadUserConfig, updateUserConfig } from "../config.js";
import { createErrorResponse } from "../utils/error-handler.js";
import { validateStrictPath } from "../services/path-validator.service.js";
import { getEffectiveConfig } from "../core/config/effective-config.js";
import type { ToolContext } from "../mcp/context.js";
import {
  buildConfigBundle,
  writeConfigBundleFile,
  serializeConfigBundle,
  CONFIG_BUNDLE_FORMAT,
  type ConfigBundleDocument,
} from "../core/config/portable-bundle.js";
import { exportConfigOutputJsonSchema } from "../schemas/output.js";
import {
  GetCategoriesInputSchema,
  SetCustomRulesInputSchema,
  ExportConfigInputSchema,
} from "../schemas/system.js";

export {
  GetCategoriesInputSchema,
  SetCustomRulesInputSchema,
  ExportConfigInputSchema,
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
    "Customize how files are categorized. Persists custom rules to user configuration, replacing any rules saved earlier. Invalid rules are skipped; if the rules cannot be written to disk the call reports an error instead of a success.",
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
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        default: "markdown",
      },
    },
    required: ["rules"],
  },
  annotations: {
    readOnlyHint: false,
    // The write replaces the whole persisted customRules array, so rules saved
    // by an earlier call are lost — that is a destructive update to user config.
    destructiveHint: true,
    // Repeating the same call converges on the same config file; nothing is
    // appended or consumed.
    idempotentHint: true,
    openWorldHint: false,
  },
};

export const exportConfigToolDefinition: ToolDefinition = {
  name: "file_organizer_export_config",
  title: "Export Config Bundle",
  description:
    "Bundle the user config — custom allowed directories, categorization rules, conflict strategy, watch entries, auto-organize and history settings — into one JSON document to carry to another machine. The directory paths are absolute and machine-specific, so the reply always states which fields must be edited on the target; pass rebase_root (normally the home directory) to emit ~-relative paths instead. Reads the config, then writes the bundle to output_path if one is given. Never touches the config file itself.",
  inputSchema: {
    type: "object",
    properties: {
      output_path: {
        type: "string",
        description:
          "Where to write the bundle JSON. Must pass path validation. The write refuses to overwrite an existing file. Omit to receive the bundle in the response instead of writing one.",
      },
      rebase_root: {
        type: "string",
        description:
          "Directory on this machine that the target machine's home directory is expected to occupy, normally the home directory. Paths under it are exported as ~-relative instead of absolute.",
      },
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        default: "markdown",
      },
    },
    required: [],
  },
  outputSchema: exportConfigOutputJsonSchema,
  annotations: {
    // Writes the bundle file when output_path is given, so it is not read-only.
    readOnlyHint: false,
    // It never deletes or overwrites: the exclusive write fails when the
    // chosen path already holds a file.
    destructiveHint: false,
    // Re-running against the same output_path fails on the existing file, so a
    // repeat is not a no-op that converges.
    idempotentHint: false,
    openWorldHint: false,
  },
};

function countEntries(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function exportConfigReport(
  bundle: ConfigBundleDocument,
  writtenPath: string | null,
  bytesWritten: number,
  configFilePresent: boolean,
) {
  return {
    format_version: bundle.format_version,
    mode: bundle.portability.mode,
    rebase_root: bundle.portability.rebase_root,
    output_path: writtenPath,
    written: writtenPath !== null,
    bytes_written: bytesWritten,
    config_file_present: configFilePresent,
    counts: {
      custom_allowed_directories: countEntries(
        bundle.config.customAllowedDirectories,
      ),
      custom_rules: countEntries(bundle.config.customRules),
      rules: countEntries(bundle.config.rules),
      watch_entries: countEntries(bundle.config.watchList),
    },
    requires_editing: bundle.portability.requires_editing,
    non_portable_paths: bundle.portability.non_portable_paths,
    notes: bundle.portability.notes,
    config: bundle.config as Record<string, unknown>,
  };
}

function exportConfigMarkdown(
  report: ReturnType<typeof exportConfigReport>,
  bundle: ConfigBundleDocument,
): string {
  const lines = [
    `### Config Bundle (format v${report.format_version})`,
    "",
    `- Portability mode: **${report.mode}**`,
    `- Config file present: ${report.config_file_present}`,
    `- Allowed directories: ${report.counts.custom_allowed_directories}`,
    `- Custom rules: ${report.counts.custom_rules}`,
    `- Watch entries: ${report.counts.watch_entries}`,
    report.output_path === null
      ? "- Written: no (no output_path was given)"
      : `- Written: ${report.bytes_written} bytes`,
    "",
  ];

  if (report.requires_editing.length > 0) {
    lines.push(
      `**Edit on the target machine:** ${report.requires_editing.join(", ")}`,
      "",
    );
  } else {
    lines.push(
      "**Edit on the target machine:** nothing — this bundle is portable as written.",
      "",
    );
  }

  if (report.non_portable_paths.length > 0) {
    lines.push(
      report.mode === "rebased"
        ? "**Exported unchanged (outside the rebase root):**"
        : "**Exported unchanged (absolute paths of this machine):**",
      "",
    );
    for (const entry of report.non_portable_paths) {
      lines.push(`- \`${entry.field}\` = ${entry.value}`);
    }
    lines.push("");
  }

  for (const note of report.notes) lines.push(`- ${note}`);
  lines.push("");

  if (report.output_path === null) {
    lines.push("```json", serializeConfigBundle(bundle).trimEnd(), "```");
  }

  return lines.join("\n");
}

export async function handleExportConfig(
  args: Record<string, unknown>,
  ctx?: ToolContext,
): Promise<ToolResponse> {
  try {
    const parsed = ExportConfigInputSchema.safeParse(args);
    if (!parsed.success) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`,
          },
        ],
        isError: true,
      };
    }

    const { output_path, rebase_root, response_format } = parsed.data;
    // The request context carries the config as read for this call, like every
    // other tool. The fallback is only for a direct call with no context.
    const config = ctx?.config ?? loadUserConfig();
    const bundle = buildConfigBundle(config, {
      rebaseRoot: rebase_root ?? null,
    });

    let writtenPath: string | null = null;
    let bytesWritten = 0;
    if (output_path !== undefined) {
      // The one write in this tool goes through the full validation pipeline.
      const validated = await validateStrictPath(output_path);
      try {
        bytesWritten = writeConfigBundleFile(bundle, validated);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          // Naming the path back would leak a directory layout, and the caller
          // supplied it anyway, so say what happened and what to do.
          return {
            content: [
              {
                type: "text",
                text: "Error: a file already exists at the requested output path, and this tool never overwrites one. Nothing was written. Export again with a different output_path, or remove the existing file first.",
              },
            ],
            isError: true,
          };
        }
        throw error;
      }
      writtenPath = validated;
    }

    const report = exportConfigReport(
      bundle,
      writtenPath,
      bytesWritten,
      getEffectiveConfig(config).configFilePresent,
    );

    return {
      content: [
        {
          type: "text",
          text:
            response_format === "json"
              ? JSON.stringify(report, null, 2)
              : exportConfigMarkdown(report, bundle),
        },
      ],
      structuredContent: report,
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}

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

    // The write is the whole point of this tool: in-memory-only rules are lost
    // on restart. A failed write must not be reported as success — the caller
    // would believe the rules are saved and they would be gone next session.
    // updateUserConfig logs the underlying cause (including the config path)
    // server-side; the reply stays path-free.
    if (!updateUserConfig({ customRules: validRules })) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${validRules.length} custom rules validated but could not be written to the user configuration. They are not saved and will be lost on restart. See the server log for the underlying cause.`,
          },
        ],
        isError: true,
      };
    }

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
