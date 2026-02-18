/**
 * File Organizer MCP Server v3.4.0
 * Server Initialization
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { CONFIG } from "./config.js";
import {
  TOOLS,
  handleListFiles,
  handleScanDirectory,
  handleCategorizeByType,
  handleFindLargestFiles,
  handleFindDuplicateFiles,
  handleOrganizeFiles,
  handlePreviewOrganization,
  handleGetCategories,
  handleSetCustomRules,
  handleAnalyzeDuplicates,
  handleDeleteDuplicates,
  handleUndoLastOperation,
  handleBatchRename,
  handleInspectMetadata,
  handleWatchDirectory,
  handleUnwatchDirectory,
  handleListWatches,
  handleReadFile,
  handleOrganizeMusic,
  handleOrganizePhotos,
  handleOrganizeByContent,
  handleOrganizeSmart,
  handleSystemOrganization,
  handleBatchReadFiles,
  handleViewHistory,
  handleSmartSuggest,
} from "./tools/index.js";
import { sanitizeErrorMessage } from "./utils/error-handler.js";
import { logger } from "./utils/logger.js";

interface MCPToolResponse {
  content: Array<{ type: "text"; text: string }>;
  [key: string]: unknown;
}

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

  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const typedArgs = args && typeof args === "object" ? args : {};
      return await handleToolCall(name, typedArgs);
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
 * Route tool calls to appropriate handlers
 */
import { RateLimiter } from "./services/security/rate-limiter.service.js";
import { HistoryLoggerService } from "./services/history-logger.service.js";

const rateLimiter = new RateLimiter();
export const historyLogger = new HistoryLoggerService();

/**
 * Route tool calls to appropriate handlers
 */
async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<MCPToolResponse> {
  // Apply Rate Limiter to heavy scanning tools
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

  // Logging Wrapper
  const startTime = Date.now();
  const logEntry = {
    timestamp: new Date().toISOString(),
    tool: name,
    args: args,
    success: false,
    durationMs: 0,
    result: undefined as unknown,
    error: undefined as string | undefined,
  };

  logger.info(`[AUDIT] Tool Call: ${name}`, { args });

  try {
    let response: MCPToolResponse;
    switch (name) {
      case "file_organizer_list_files":
        response = await handleListFiles(args);
        break;
      case "file_organizer_scan_directory":
        response = await handleScanDirectory(args);
        break;
      case "file_organizer_categorize_by_type":
        response = await handleCategorizeByType(args);
        break;
      case "file_organizer_find_largest_files":
        response = await handleFindLargestFiles(args);
        break;
      case "file_organizer_find_duplicate_files":
        response = await handleFindDuplicateFiles(args);
        break;
      case "file_organizer_organize_files":
        response = await handleOrganizeFiles(args);
        break;
      case "file_organizer_preview_organization":
        response = await handlePreviewOrganization(args);
        break;
      case "file_organizer_get_categories":
        response = await handleGetCategories(args);
        break;
      case "file_organizer_set_custom_rules":
        response = await handleSetCustomRules(args);
        break;
      case "file_organizer_analyze_duplicates":
        response = await handleAnalyzeDuplicates(args);
        break;
      case "file_organizer_delete_duplicates":
        response = await handleDeleteDuplicates(args);
        break;
      case "file_organizer_undo_last_operation":
        response = await handleUndoLastOperation(args);
        break;
      case "file_organizer_batch_rename":
        response = await handleBatchRename(args);
        break;
      case "file_organizer_inspect_metadata":
        response = await handleInspectMetadata(args);
        break;
      case "file_organizer_watch_directory":
        response = await handleWatchDirectory(args);
        break;
      case "file_organizer_unwatch_directory":
        response = await handleUnwatchDirectory(args);
        break;
      case "file_organizer_view_history":
        response = await handleViewHistory(args);
        break;
      case "file_organizer_list_watches":
        response = await handleListWatches(args);
        break;
      case "file_organizer_read_file":
        response = await handleReadFile(args);
        break;
      case "file_organizer_organize_music":
        response = await handleOrganizeMusic(args);
        break;
      case "file_organizer_organize_photos":
        response = await handleOrganizePhotos(args);
        break;
      case "file_organizer_organize_by_content":
        response = await handleOrganizeByContent(args);
        break;
      case "file_organizer_organize_smart":
        response = await handleOrganizeSmart(args);
        break;
      case "file_organizer_smart_suggest":
        response = await handleSmartSuggest(args);
        break;
      case "file_organizer_system_organize":
        response = await handleSystemOrganization(args);
        break;
      case "file_organizer_batch_read_files":
        response = await handleBatchReadFiles(args);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    logEntry.success = true;
    logEntry.result = response; // Be careful if response is huge

    // Log simplified result for audit to avoid spamming console with huge file lists
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
    // Could enable structured JSON logging to file here if Config allowed it

    // Log operation to history (non-blocking, graceful failure)
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
