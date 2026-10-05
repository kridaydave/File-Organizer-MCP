/**
 * File Organizer MCP Server v5.0.0
 * Rollback Tool
 *
 * @module tools/rollback
 */

import { z } from "zod";
import type { ToolDefinition, ToolResponse } from "../types.js";
import { RollbackService } from "../core/organize/rollback.js";
import { verifyManifestFiles, type IntegrityReport } from "../core/organize/verify-integrity.js";
import { createErrorResponse, sanitizeErrorMessage } from "../utils/error-handler.js";
import {
  UndoLastOperationInputSchema,
  VerifyIntegrityInputSchema,
} from "../schemas/organize.js";
import {
  undoOutputJsonSchema,
  verifyIntegrityOutputJsonSchema,
} from "../schemas/output.js";

export { UndoLastOperationInputSchema } from "../schemas/organize.js";
export type { UndoLastOperationInput } from "../schemas/organize.js";
export const undoLastOperationToolDefinition: ToolDefinition = {
  name: "file_organizer_undo_last_operation",
  title: "Undo Last Organization Operation",
  description:
    "Reverses file moves and renames from a previous organization task. Pass manifest_id to undo one specific operation by the id that organize_files returned and file_organizer_view_history lists; omit it to undo the most recent operation. Undoing an operation that is not the newest is refused outright when a newer operation already moved any of the same paths, because undoing out of order would collide with it partway through. Undo the newer one first, then retry. The manifest is deleted only when the whole undo succeeds, so a refused or failed undo can be tried again.",
  inputSchema: {
    type: "object",
    properties: {
      manifest_id: {
        type: "string",
        description:
          "ID of the operation to undo. Omit to undo the most recent operation.",
      },
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        default: "markdown",
      },
    },
    required: [],
  },
  outputSchema: undoOutputJsonSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
};

export async function handleUndoLastOperation(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = UndoLastOperationInputSchema.safeParse(args);
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

    const { manifest_id, response_format } = parsed.data;

    // Reads manifests from disk — no shared state to preserve across calls.
    const rollbackService = new RollbackService();

    // Find manifest
    let targetId = manifest_id;
    if (!targetId) {
      const manifests = await rollbackService.listManifests();
      if (manifests.length === 0 || !manifests[0]) {
        return {
          content: [{ type: "text", text: "No undo history found." }],
          isError: true,
        };
      }
      targetId = manifests[0].id;
    }

    const result = await rollbackService.rollback(targetId!);
    const sanitizedResult = {
      ...result,
      errors: result.errors.map((e) => sanitizeErrorMessage(e)),
    };
    const hasFailures = sanitizedResult.failed > 0;

    if (response_format === "json") {
      return {
        content: [
          { type: "text", text: JSON.stringify(sanitizedResult, null, 2) },
        ],
        structuredContent: sanitizedResult as unknown as Record<
          string,
          unknown
        >,
        ...(hasFailures && { isError: true }),
      };
    }

    const markdown = `### Undo Result
**Manifest ID:** \`${targetId}\`
✅ **Restored:** ${sanitizedResult.success} files
❌ **Failed:** ${sanitizedResult.failed} files

${sanitizedResult.errors.length ? `**Errors:**\n${sanitizedResult.errors.map((e) => `- ${e}`).join("\n")}` : ""}
`;
    return {
      content: [{ type: "text", text: markdown }],
      structuredContent: sanitizedResult as unknown as Record<string, unknown>,
      ...(hasFailures && { isError: true }),
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}

// ==================== verify_integrity ====================

export const verifyIntegrityToolDefinition: ToolDefinition = {
  name: "file_organizer_verify_integrity",
  title: "Verify Last Operation Integrity",
  description:
    "Rehashes the files a rollback manifest names and reports which have drifted since that operation ran: unchanged, modified, or missing. Read-only; it never moves, restores, or deletes anything. A manifest only stores a content digest for the files it could hash inside a 32 MB read budget, and manifests written before content hashing existed store none at all, so those files are reported as unverifiable and never as unchanged. `verified` is only true when every file the manifest names was rehashed and matched. Use it after organizing to confirm the files are still where they were put.",
  inputSchema: {
    type: "object",
    properties: {
      manifest_id: {
        type: "string",
        description:
          "ID of the operation to verify. If omitted, verifies the last operation.",
      },
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        default: "markdown",
      },
    },
    required: [],
  },
  outputSchema: verifyIntegrityOutputJsonSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
};

function integrityMarkdown(report: IntegrityReport): string {
  const header = `### Integrity check
**Manifest ID:** \`${report.manifest_id}\`
**Operation:** ${report.description}

`;

  const verdict = report.verified
    ? `✅ **Verified:** all ${report.checked} file(s) are still exactly where the operation left them.\n`
    : "";
  // An unverifiable file is never folded into "unchanged": the honest summary
  // is what could be checked, what drifted, and what could not be answered.
  const summary =
    `**Checked:** ${report.checked}/${report.total_files} | ` +
    `**Unchanged:** ${report.unchanged} | ` +
    `**Modified:** ${report.modified} | ` +
    `**Missing:** ${report.missing} | ` +
    `**Unverifiable:** ${report.unverifiable}\n`;

  const drifted = report.files
    .filter((f) => f.status !== "unchanged")
    .map((f) => {
      const detail = f.reason ? ` - ${f.reason}` : "";
      return `- ${f.status === "unverifiable" ? "❔" : "⚠️"} \`${f.path}\` (${f.status})${detail}`;
    });

  return (
    header +
    verdict +
    summary +
    (drifted.length > 0 ? `\n**Needs attention:**\n${drifted.join("\n")}\n` : "\n")
  );
}

export async function handleVerifyIntegrity(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = VerifyIntegrityInputSchema.safeParse(args);
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

    const { manifest_id, response_format } = parsed.data;

    // Reads manifests from disk — no shared state to preserve across calls.
    const rollbackService = new RollbackService();

    let targetId = manifest_id;
    if (!targetId) {
      const manifests = await rollbackService.listManifests();
      if (manifests.length === 0 || !manifests[0]) {
        return {
          content: [
            { type: "text", text: "No undo history found, so nothing to verify." },
          ],
          isError: true,
        };
      }
      targetId = manifests[0].id;
    }

    // getManifest re-checks the manifest's own signature, so the paths it
    // names are this machine's own record before anything is read from them.
    const manifest = await rollbackService.getManifest(targetId);
    const report = await verifyManifestFiles(manifest);

    if (response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
        structuredContent: report as unknown as Record<string, unknown>,
      };
    }

    // The markdown path still carries structuredContent because the tool
    // declares an outputSchema and the SDK rejects results without it.
    return {
      content: [{ type: "text", text: integrityMarkdown(report) }],
      structuredContent: report as unknown as Record<string, unknown>,
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}
