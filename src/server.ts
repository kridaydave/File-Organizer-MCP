/**
 * File Organizer MCP Server v3.5.0
 * Server Initialization
 */

import { McpServer, fromJsonSchema } from "@modelcontextprotocol/server";
import type { JsonSchemaType } from "@modelcontextprotocol/server";
import { CONFIG } from "./config.js";
import { TOOLS, getToolHandler } from "./mcp/registry.js";
import { createRequestContext, type ToolContext } from "./mcp/context.js";
import { sanitizeErrorMessage } from "./utils/error-handler.js";
import { logger } from "./utils/logger.js";

interface MCPToolResponse {
  content: Array<{ type: "text"; text: string }>;
  [key: string]: unknown;
}

/**
 * How long a `tools/list` or `server/discover` result may be cached by the
 * client. The tool list only changes on server restart, so an hour is
 * conservative for the 2026-07-28 protocol's `ttlMs` field.
 */
const CACHEABLE_LIST_TTL_MS = 60 * 60 * 1000;

/**
 * Create and configure the MCP server
 */
export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: "file-organizer",
      version: CONFIG.VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
      cacheHints: {
        "tools/list": { ttlMs: CACHEABLE_LIST_TTL_MS, cacheScope: "private" },
        "server/discover": {
          ttlMs: CACHEABLE_LIST_TTL_MS,
          cacheScope: "private",
        },
      },
    },
  );

  // Register every tool from the shared registry. Input schemas are plain
  // JSON Schema; fromJsonSchema converts them so tools/list output stays
  // identical to before.
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: fromJsonSchema(
          tool.inputSchema as unknown as JsonSchemaType,
        ),
        annotations: tool.annotations,
      },
      async (args) => {
        try {
          return await handleToolCall(
            tool.name,
            (args ?? {}) as Record<string, unknown>,
            createRequestContext(),
          );
        } catch (error) {
          const message =
            error instanceof Error
              ? sanitizeErrorMessage(error)
              : "Unknown error";
          return {
            content: [{ type: "text" as const, text: `Error: ${message}` }],
            isError: true,
          };
        }
      },
    );
  }

  return server;
}

/**
 * Route tool calls via registry lookup.
 * Audit + history wrapper stays data-driven.
 */
async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<MCPToolResponse> {
  const startTime = Date.now();
  const logEntry = {
    timestamp: new Date().toISOString(),
    tool: name,
    args,
    success: false,
    durationMs: 0,
    result: undefined as unknown,
    error: undefined as string | undefined,
  };

  logger.info(`[AUDIT] Tool Call: ${name}`, { args });

  try {
    const handler = getToolHandler(name);
    if (!handler) throw new Error(`Unknown tool: ${name}`);

    const response = (await handler(args, ctx)) as MCPToolResponse;

    logEntry.success = true;
    logEntry.result = response;

    const summary = {
      ...response,
      content: response.content.map((c) => ({
        ...c,
        text: c.text.length > 500 ? c.text.substring(0, 500) + "..." : c.text,
      })),
    };
    logger.info(`[AUDIT] Success: ${name}`, { summary });

    return response;
  } catch (error) {
    logEntry.success = false;
    logEntry.error = error instanceof Error ? error.message : String(error);
    logger.error(`[AUDIT] Failed: ${name}`, { error: logEntry.error });
    throw error;
  } finally {
    logEntry.durationMs = Date.now() - startTime;
    try {
      await ctx.history.log({
        operation: name,
        source: "manual",
        status: logEntry.error ? "error" : "success",
        durationMs: logEntry.durationMs,
        details: logEntry.error ? undefined : `Completed ${name}`,
        error: logEntry.error ? { message: logEntry.error } : undefined,
      });
    } catch {
      // History logging should never break operations
    }
  }
}
