/**
 * defineTool — minimal helper for typed tool definitions
 *
 * Pairs a ToolDefinition with its handler so the registry can
 * build TOOLS[] + handler Map from a single declaration.
 * No magic, no framework — just a typed passthrough.
 *
 * DX: add a file in src/tools/my-tool.ts:
 *   export const myTool = defineTool({
 *     name: "file_organizer_my_tool",
 *     description: "...",
 *     inputSchema: { type: "object", properties: {...}, required: [...] },
 *     annotations: { readOnlyHint: true },
 *     handler: async (args) => { ... }
 *   });
 * Then import & register it in src/mcp/registry.ts (one line).
 */

import type { ToolDefinition, ToolResponse } from "./types.js";

export type ToolHandler = (
  args: Record<string, unknown>,
) => Promise<ToolResponse>;

export interface DefineToolOptions {
  name: string;
  description: string;
  title?: string;
  inputSchema: ToolDefinition["inputSchema"];
  annotations?: ToolDefinition["annotations"];
  handler: ToolHandler;
}

export interface DefinedTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

/**
 * Create a typed tool definition + handler pair.
 * Accepts flat options object (name, description, ..., handler)
 * and returns definition + handler.
 */
export function defineTool(options: DefineToolOptions): DefinedTool {
  const { name, description, title, inputSchema, annotations, handler } =
    options;

  const definition: ToolDefinition = {
    name,
    description,
    inputSchema,
    ...(title !== undefined && { title }),
    ...(annotations !== undefined && { annotations }),
  };

  return { definition, handler };
}
