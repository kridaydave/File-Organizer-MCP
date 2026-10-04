/**
 * File Organizer MCP Server v5.0.0
 * sensitive_scan Tool
 *
 * @module tools/sensitive-scan
 */

import type {
  ToolDefinition,
  ToolResponse,
  SensitiveScanResult,
} from "../types.js";
import { validateStrictPath } from "../services/path-validator.service.js";
import { scanForSensitiveData } from "../core/scan/sensitive-scan.js";
import { createErrorResponse } from "../utils/error-handler.js";
import { SensitiveScanInputSchema } from "../schemas/scan.js";
import { sensitiveScanOutputJsonSchema } from "../schemas/output.js";

export const sensitiveScanToolDefinition: ToolDefinition = {
  name: "file_organizer_sensitive_scan",
  title: "Scan for Sensitive Metadata",
  description:
    "Screen a directory for files that carry personal metadata, and score each one 0-100 for the risk of sharing it. Detects EXIF GPS coordinates and altitude, GPS fix timestamps, owner/artist names, camera and lens serial numbers, camera or computer make and model, copyright lines, capture/editing software, and free-text notes. Each file comes back with the individual findings and the weight each one added, so the score is a sum of stated causes rather than an unexplained number. HEURISTIC DETECTION, NOT REDACTION: the tool reads and reports, it never modifies or strips anything, and a risk score of 0 means no recognized EXIF tag was found, NOT that the file is safe to share. Metadata outside EXIF (PDF annotations, XMP, IPTC, embedded thumbnails), the file name, and the visible image content are not analyzed, and only the head of each file is read. Treat a clean result as 'nothing known', and treat this tool's own output as sensitive because it echoes the values it found. Coverage is limited to JPEG and TIFF; every other file is reported under `skipped` with a reason. Read-only.",
  inputSchema: {
    type: "object",
    properties: {
      directory: {
        type: "string",
        description: "Full path to the directory to screen",
      },
      include_subdirs: {
        type: "boolean",
        description:
          "Descend into real subdirectories. Symbolic links are never followed.",
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
  outputSchema: sensitiveScanOutputJsonSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
};

/**
 * The caveat travels with the prose as well as the payload, because markdown is
 * the default format and an agent reading only the text must still see it.
 */
function limitsBlock(limits: readonly string[]): string {
  return limits.map((line) => `> ${line}`).join("\n");
}

function toMarkdown(result: SensitiveScanResult): string {
  const head =
    `### Sensitive scan: \`${result.directory}\`\n\n` +
    `Analyzed ${result.scanned_count} file(s), ${result.flagged_count} carrying personal metadata, ` +
    `${result.skipped_count} skipped. Highest risk ${result.highest_risk_score}/100.` +
    `${result.truncated ? " Max scan depth reached, so deeper directories were not walked." : ""}\n\n`;

  const caveat = `#### What this result does and does not mean\n\n${limitsBlock(result.limits)}\n\n`;

  if (result.files.length === 0) {
    return `${head}${caveat}No analyzable image files were found in this directory.`;
  }

  const worst = result.files.filter((f) => f.risk_score > 0);
  if (worst.length === 0) {
    return (
      `${head}${caveat}No recognized personal metadata was found in the ` +
      `${result.files.length} analyzed file(s). Per the limits above, that is not a clearance to share them.\n\n` +
      `#### Analyzed files (all scored 0)\n\n` +
      result.files
        .map((f) => `- \`${f.name}\` (${f.format}) — no recognized EXIF tags`)
        .join("\n")
    );
  }

  const sections = worst.map((f) => {
    const reasons = f.reasons
      .map(
        (r) => `  - +${r.weight} — ${r.detail} (\`${r.exif_tags.join(", ")}\`)`,
      )
      .join("\n");
    return `- \`${f.name}\` — **${f.risk_score}/100 (${f.risk_level})**\n${reasons}`;
  });

  const clean = result.files.filter((f) => f.risk_score === 0);
  const tail =
    clean.length > 0
      ? `\n\n${clean.length} other analyzed file(s) scored 0.`
      : "";

  return `${head}${caveat}#### Flagged files\n\n${sections.join("\n")}${tail}`;
}

export async function handleSensitiveScan(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = SensitiveScanInputSchema.safeParse(args);
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
    const result = await scanForSensitiveData(validatedPath, {
      includeSubdirs: include_subdirs,
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
      content: [{ type: "text", text: toMarkdown(result) }],
      structuredContent: result as unknown as Record<string, unknown>,
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}
