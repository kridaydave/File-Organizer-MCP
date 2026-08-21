/**
 * File Organizer MCP Server v3.5.0
 * Server Initialization
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { CONFIG } from "./config.js";
import { TOOLS, getToolHandler } from "./mcp/registry.js";
import { sanitizeErrorMessage } from "./utils/error-handler.js";
import { logger } from "./utils/logger.js";
import { RateLimiter } from "./services/security/rate-limiter.service.js";
import { historyLogger } from "./services/history-logger.service.js";

interface MCPToolResponse {
  content: Array<{ type: "text"; text: string }>;
  [key: string]: unknown;
}

const rateLimiter = new RateLimiter();

/**
 * Create and configure the MCP server
 */
export function createServer(): Server {
  const server = new Server(
    {
      name: "file-organizer",
      version: CONFIG.VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const typedArgs = args && typeof args === "object" ? args : {};
      return await handleToolCall(name, typedArgs as Record<string, unknown>);
    } catch (error) {
      const message =
        error instanceof Error ? sanitizeErrorMessage(error) : "Unknown error";
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
      };
    }
  });

  return server;
}

/**
 * Route tool calls via registry lookup (replaces switch/case).
 * Rate-limit + audit + history wrapper stays data-driven.
 */
async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<MCPToolResponse> {
  if (
    name.includes("scan") ||
    name.includes("list_files") ||
    name.includes("find_largest") ||
    name.includes("find_duplicate")
  ) {
    const limit = rateLimiter.checkLimit("scan_operations");
    if (!limit.allowed) {
      return {
        content: [
          {
            type: "text",
            text: `Rate limit exceeded. Please wait ${limit.resetIn} seconds.`,
          },
        ],
        isError: true,
      };
    }
  }

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

    const response = (await handler(args)) as MCPToolResponse;

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
      await historyLogger.log({
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
