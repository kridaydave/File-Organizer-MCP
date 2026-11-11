/**
 * File Organizer MCP Server v5.0.0
 * find_broken_symlinks Tool
 *
 * @module tools/symlink-audit
 */

import type {
  ToolDefinition,
  ToolResponse,
  BrokenSymlinkResult,
} from "../types.js";
import { validateStrictPath } from "../services/path-validator.service.js";
import { auditSymlinks } from "../core/scan/symlink-audit.js";
import { createErrorResponse } from "../utils/error-handler.js";
import { FindBrokenSymlinksInputSchema } from "../schemas/scan.js";
import { findBrokenSymlinksOutputJsonSchema } from "../schemas/output.js";

export const findBrokenSymlinksToolDefinition: ToolDefinition = {
  name: "file_organizer_find_broken_symlinks",
  title: "Find Broken Symlinks",
  description:
    "Audit a directory for symlinks that dangle (target missing), resolve outside the allowed directories, or loop. Walks real subdirectories but never enters a symlinked one; before each descent it re-resolves the subdirectory and skips it if it no longer sits under the root, so the walk stays inside the directory you passed. Link targets are canonicalized to classify them, which resolves them but does not open or read them. Stops at the configured max scan depth; `truncated` reports that the tree was only partly covered. Read-only audit, useful before organizing a directory.",
  inputSchema: {
    type: "object",
    properties: {
      directory: {
        type: "string",
        description: "Full path to the directory to audit",
      },
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        default: "markdown",
      },
    },
    required: ["directory"],
  },
  outputSchema: findBrokenSymlinksOutputJsonSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
};

function truncationNote(result: BrokenSymlinkResult): string {
  return result.truncated
    ? " Max scan depth reached, so deeper directories were not audited."
    : "";
}

function toMarkdown(result: BrokenSymlinkResult): string {
  if (result.total_count === 0) {
    return `### Symlink audit: \`${result.directory}\`\n\nNo broken symlinks found. Scanned ${result.scanned_count} symlink(s).${truncationNote(result)}`;
  }

  const lines = result.findings.map((f) => {
    const target = f.resolved_target ? ` -> ${f.resolved_target}` : "";
    return `- \`${f.path}\` (${f.kind}) links to \`${f.link_target}\`${target}`;
  });

  return `### Symlink audit: \`${result.directory}\`\n\nScanned ${result.scanned_count} symlink(s).${truncationNote(result)}\n\n**Dangling:** ${result.dangling_count} | **Escaping:** ${result.escaping_count} | **Circular:** ${result.circular_count}\n\n${lines.join("\n")}`;
}

export async function handleFindBrokenSymlinks(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = FindBrokenSymlinksInputSchema.safeParse(args);
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

    const { directory, response_format } = parsed.data;
    const validatedPath = await validateStrictPath(directory);
    const result = await auditSymlinks(validatedPath);

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
