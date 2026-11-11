/**
 * File Organizer MCP Server v5.0.0
 * file_organizer_doctor Tool
 *
 * @module tools/doctor
 */

import { z } from "zod";
import type { ToolDefinition, ToolResponse } from "../types.js";
import { DoctorInputSchema } from "../schemas/system.js";
import { doctorOutputJsonSchema } from "../schemas/output.js";
import {
  getEffectiveConfig,
  type EffectiveConfig,
} from "../core/config/effective-config.js";
import {
  createErrorResponse,
  sanitizeErrorMessage,
} from "../utils/error-handler.js";
import { createRequestContext, type ToolContext } from "../mcp/context.js";

export type DoctorInput = z.infer<typeof DoctorInputSchema>;

export const doctorToolDefinition: ToolDefinition = {
  name: "file_organizer_doctor",
  title: "Diagnose Configuration",
  description:
    "Report the effective configuration after built-in defaults and config.json are layered, and flag every configured allowed directory that is missing, blocked by security policy, or rejected by the home-directory gate. No config value comes from the environment: APPDATA, XDG_CONFIG_HOME and OneDrive only decide where the config directory sits, which holds config.json, operations.jsonl, the rollback manifests and the backups. On Linux and Windows, setting XDG_CONFIG_HOME or APPDATA relocates all four. Use this first when a call fails unexpectedly: it explains which directories are actually usable.",
  inputSchema: {
    type: "object",
    properties: {
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        default: "markdown",
        description:
          'Output format: "markdown" for human-readable, "json" for programmatic use',
      },
    },
    required: [],
  },
  outputSchema: doctorOutputJsonSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const REJECTION_ADVICE: Record<string, string> = {
  missing:
    "does not exist. Check the spelling, or create it, or remove it from customAllowedDirectories",
  not_a_directory:
    "exists but is a file, not a directory. Point customAllowedDirectories at a directory",
  symlink:
    "is a symlink. Custom allowed directories must be real directories, not links",
  path_traversal:
    "contains a '..' segment. Use a plain absolute or ~-prefixed path",
  null_byte: "contains a null byte and can never resolve",
  outside_home:
    "is outside your home directory and external volumes are not allowed. Move it under your home, or set allowExternalVolumes if it is a real external volume",
  external_volume_not_allowed:
    "is on an external volume. Set allowExternalVolumes to true to allow it",
};

function describeRejection(configured: string, rejection: string): string {
  const advice =
    REJECTION_ADVICE[rejection] ?? "was rejected by the security gate";
  return `${configured} ${advice}.`;
}

export function buildDoctorReport(effective: EffectiveConfig): {
  problems: string[];
  healthy: boolean;
} {
  const problems: string[] = [];

  if (!effective.configFilePresent) {
    problems.push(
      "No config.json found. The server is running on built-in defaults only.",
    );
  }

  for (const verdict of effective.configuredAllowedDirs) {
    if (verdict.blockedByPolicy) {
      // Two independent facts: the home-directory gate may well accept this
      // path, but the always-blocked pattern list rejects it at request time.
      problems.push(
        verdict.accepted
          ? `${verdict.configured} is configured, but the security policy always blocks that path, so every call into it will fail. Choose a different directory.`
          : `${verdict.configured} is on a path the security policy always blocks, so it can never be used. Choose a different directory.`,
      );
      continue;
    }
    if (verdict.accepted) continue;
    if (verdict.rejection === "missing") {
      // A missing directory is almost always a typo, so say so rather than
      // lumping it in with the security rejections.
      problems.push(
        `${verdict.configured} does not exist (likely a typo in customAllowedDirectories).`,
      );
      continue;
    }
    problems.push(
      describeRejection(verdict.configured, verdict.rejection ?? "unknown"),
    );
  }

  for (const key of effective.unknownConfigKeys) {
    problems.push(
      `config.json contains the unrecognized key "${key}". It is ignored.`,
    );
  }

  if (
    effective.configuredAllowedDirs.length === 0 &&
    effective.configFilePresent
  ) {
    problems.push(
      "No custom allowed directories are configured, so only the default directories are usable.",
    );
  }

  return { problems, healthy: problems.length === 0 };
}

function formatAsMarkdown(report: {
  effective: EffectiveConfig;
  problems: string[];
  healthy: boolean;
}): string {
  const { effective, problems, healthy } = report;
  let markdown = "### File Organizer Configuration\n\n";
  markdown += `Server version ${effective.version} on ${effective.platform}. `;
  markdown += effective.configFilePresent
    ? "A config.json was found.\n\n"
    : "No config.json was found, so only built-in defaults apply.\n\n";

  markdown += "**Effective security settings**\n\n";
  markdown += "| Setting | Value |\n| --- | --- |\n";
  markdown += `| Path validation | ${effective.security.enablePathValidation} |\n`;
  markdown += `| Custom directories | ${effective.security.allowCustomDirectories} |\n`;
  markdown += `| Access logging | ${effective.security.logAccess} |\n`;
  markdown += `| Max scan depth | ${effective.security.maxScanDepth} |\n`;
  markdown += `| Conflict strategy | ${effective.conflictStrategy} |\n`;
  markdown += `| External volumes | ${effective.allowExternalVolumes} |\n`;
  markdown += `| Custom rules | ${effective.customRuleCount} |\n\n`;

  if (effective.configuredAllowedDirs.length > 0) {
    markdown += "**Configured allowed directories**\n\n";
    markdown +=
      "| Path | Exists | Usable | Reason |\n| --- | --- | --- | --- |\n";
    for (const verdict of effective.configuredAllowedDirs) {
      const reason = verdict.accepted
        ? "ok"
        : verdict.blockedByPolicy
          ? "blocked by security policy"
          : (verdict.rejection ?? "rejected");
      markdown += `| ${verdict.configured} | ${verdict.exists ? "yes" : "no"} | ${verdict.accepted ? "yes" : "no"} | ${reason} |\n`;
    }
    markdown += "\n";
  }

  markdown += `Default allowed directories: ${effective.defaultAllowed.length}\n\n`;

  if (problems.length === 0) {
    markdown += "No configuration problems found.\n";
  } else {
    markdown += "**Problems**\n\n";
    for (const problem of problems) markdown += `- ${problem}\n`;
  }
  markdown += `\nStatus: ${healthy ? "healthy" : "needs attention"}\n`;
  return markdown;
}

export async function handleDoctor(
  args: Record<string, unknown>,
  ctx: ToolContext = createRequestContext(),
): Promise<ToolResponse> {
  try {
    const parsed = DoctorInputSchema.safeParse(args);
    if (!parsed.success) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${sanitizeErrorMessage(parsed.error.issues.map((i) => i.message).join(", "))}`,
          },
        ],
        isError: true,
      };
    }

    const effective = getEffectiveConfig(ctx.config);
    const { problems, healthy } = buildDoctorReport(effective);

    const report = {
      version: effective.version,
      platform: effective.platform,
      config_file_present: effective.configFilePresent,
      security: {
        enable_path_validation: effective.security.enablePathValidation,
        allow_custom_directories: effective.security.allowCustomDirectories,
        log_access: effective.security.logAccess,
        max_scan_depth: effective.security.maxScanDepth,
        max_files_per_operation: effective.security.maxFilesPerOperation,
      },
      conflict_strategy: effective.conflictStrategy,
      allow_external_volumes: effective.allowExternalVolumes,
      custom_rule_count: effective.customRuleCount,
      history_logging: effective.historyLogging,
      auto_organize: effective.autoOrganize,
      default_allowed: effective.defaultAllowed,
      configured_allowed_dirs: effective.configuredAllowedDirs.map(
        (verdict) => ({
          configured: verdict.configured,
          resolved: verdict.resolved,
          exists: verdict.exists,
          is_directory: verdict.isDirectory,
          symlink: verdict.symlink,
          accepted: verdict.accepted,
          rejection: verdict.rejection,
          blocked_by_policy: verdict.blockedByPolicy,
        }),
      ),
      effective_allowed_dirs: effective.effectiveAllowedDirs,
      unknown_config_keys: effective.unknownConfigKeys,
      problems,
      healthy,
    };

    if (parsed.data.response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
        structuredContent: report,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: formatAsMarkdown({ effective, problems, healthy }),
        },
      ],
      // The MCP server validates outputSchema against structuredContent, so a
      // tool that declares one must return it in both formats.
      structuredContent: report,
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}
