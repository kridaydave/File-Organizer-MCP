/**
 * File Organizer MCP Server v5.0.0
 * Rollback Tool
 *
 * @module tools/rollback
 */

import { z } from "zod";
import type { ToolDefinition, ToolResponse } from "../types.js";
import { RollbackService } from "../core/organize/rollback.js";
import { createErrorResponse } from "../utils/error-handler.js";
import { UndoLastOperationInputSchema } from "../schemas/organize.js";

export { UndoLastOperationInputSchema } from "../schemas/organize.js";
export type { UndoLastOperationInput } from "../schemas/organize.js";
export const undoLastOperationToolDefinition: ToolDefinition = {
  name: "file_organizer_undo_last_operation",
  title: "Undo Last Organization Operation",
  description:
    "Reverses file moves and renames from a previous organization task.",
  inputSchema: {
    type: "object",
    properties: {
      manifest_id: { type: "string" },
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        default: "markdown",
      },
    },
    required: [],
  },
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
    const hasFailures = result.failed > 0;

    if (response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
        ...(hasFailures && { isError: true }),
      };
    }

    const markdown = `### Undo Result
**Manifest ID:** \`${targetId}\`
✅ **Restored:** ${result.success} files
❌ **Failed:** ${result.failed} files

${result.errors.length ? `**Errors:**\n${result.errors.map((e) => `- ${e}`).join("\n")}` : ""}
`;
    return {
      content: [{ type: "text", text: markdown }],
      ...(hasFailures && { isError: true }),
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}
