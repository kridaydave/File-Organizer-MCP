/**
 * File Organizer MCP Server v5.0.0
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
        ...(tool.outputSchema !== undefined && {
          outputSchema: fromJsonSchema(
            tool.outputSchema as unknown as JsonSchemaType,
          ),
        }),
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

    const isError = Boolean(response.isError);
    logEntry.success = !isError;
    logEntry.result = response;

    const summary = {
      ...response,
      content: Array.isArray(response.content)
        ? response.content.map((c) => {
            if (
              typeof c === "object" &&
              c &&
              "text" in c &&
              typeof (c as { text: unknown }).text === "string"
            ) {
              const text = (c as { text: string }).text;
              return {
                ...c,
                text:
                  text.length > 500
                    ? text.substring(0, 500) + "..."
                    : text,
              };
            }
            return c;
          })
        : response.content,
    };

    if (isError) {
      logEntry.error = "Tool returned error response";
      logger.error(`[AUDIT] Failed: ${name}`, { summary });
    } else {
      logger.info(`[AUDIT] Success: ${name}`, { summary });
    }

    return response;
  } catch (error) {
    logEntry.success = false;
    logEntry.error = error instanceof Error ? error.message : String(error);
    logger.error(`[AUDIT] Failed: ${name}`, { error: logEntry.error });
    throw error;
  } finally {
    logEntry.durationMs = Date.now() - startTime;
    try {
      const hasError = !logEntry.success || Boolean(logEntry.error);
      await ctx.history.log({
        operation: name,
        source: "manual",
        status: hasError ? "error" : "success",
        durationMs: logEntry.durationMs,
        details: hasError ? `Failed ${name}` : `Completed ${name}`,
        error: logEntry.error ? { message: logEntry.error } : undefined,
        // Every path-taking tool names its root `directory`. Recording it is
        // what makes the history searchable by path; a value that is not a
        // plain single-line string is dropped rather than half-validated here.
        paths: historyPathsFromArgs(args),
        // The tool's own undo handle. Without it a past organize is only
        // reachable through "undo whatever ran last", which is the gap
        // selective undo was meant to close.
        manifestId: historyManifestId(logEntry.result),
      });
    } catch {
      // History logging should never break operations
    }
  }
}

/** The `directory` argument of a tool call, when it is usable as a path. */
function historyPathsFromArgs(
  args: Record<string, unknown>,
): string[] | undefined {
  const directory = args.directory;
  if (typeof directory !== "string" || directory.length === 0) return undefined;
  if (directory.length > 4096 || directory.includes("\0")) return undefined;
  return [directory];
}

/**
 * The rollback manifest a tool response reports, when it reports one.
 *
 * Read from `structuredContent` rather than from args because the id is minted
 * during the call: only the handler knows it. A tool that moves files and
 * returns `manifest_id` (organize_files) or `undoManifest.manifestId` (the
 * variant organizers) is what makes its own entry undoable by id.
 */
export function historyManifestId(result: unknown): string | undefined {
  if (typeof result !== "object" || result === null) return undefined;
  const structured = (result as { structuredContent?: unknown })
    .structuredContent;
  if (typeof structured !== "object" || structured === null) return undefined;

  const record = structured as Record<string, unknown>;
  const direct = record.manifest_id ?? record.manifestId;
  if (typeof direct === "string" && direct.length > 0) return direct;

  const nested = record.undoManifest;
  if (typeof nested === "object" && nested !== null) {
    const nestedId = (nested as Record<string, unknown>).manifestId;
    if (typeof nestedId === "string" && nestedId.length > 0) return nestedId;
  }
  return undefined;
}
