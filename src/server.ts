/**
 * File Organizer MCP Server v3.0.0
 * Server Initialization
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { CONFIG } from './config.js';
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
} from './tools/index.js';
import { sanitizeErrorMessage } from './utils/error-handler.js';

interface MCPToolResponse {
    content: Array<{ type: 'text'; text: string }>;
    [key: string]: unknown;
}

/**
 * Create and configure the MCP server
 */
export function createServer(): Server {
    const server = new Server(
        {
            name: 'file-organizer',
            version: CONFIG.VERSION,
        },
        {
            capabilities: {
                tools: {},
            },
        }
    );

    // Register tool list handler
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: TOOLS,
    }));

    // Register tool call handler
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        try {
            const typedArgs = (args ?? {}) as Record<string, unknown>;
            return await handleToolCall(name, typedArgs);
        } catch (error) {
            const message = error instanceof Error ? sanitizeErrorMessage(error) : 'Unknown error';
            return {
                content: [{ type: 'text' as const, text: `Error: ${message}` }],
            };
        }
    });

    return server;
}

/**
 * Route tool calls to appropriate handlers
 */
import { RateLimiter } from './services/security/rate-limiter.service.js';

const rateLimiter = new RateLimiter();

/**
 * Route tool calls to appropriate handlers
 */
async function handleToolCall(
    name: string,
    args: Record<string, unknown>
): Promise<MCPToolResponse> {

    // Apply Rate Limiter to heavy scanning tools
    if (name.includes('scan') || name.includes('list_files') || name.includes('find_largest') || name.includes('find_duplicate')) {
        const limit = rateLimiter.checkLimit('scan_operations');
        if (!limit.allowed) {
            return {
                content: [{ type: 'text', text: `Rate limit exceeded. Please wait ${limit.resetIn} seconds.` }],
                isError: true
            };
        }
    }

    switch (name) {
        case 'file_organizer_list_files':
            return handleListFiles(args as Record<string, unknown>);

        case 'file_organizer_scan_directory':
            return handleScanDirectory(args as Record<string, unknown>);

        case 'file_organizer_categorize_by_type':
            return handleCategorizeByType(args as Record<string, unknown>);

        case 'file_organizer_find_largest_files':
            return handleFindLargestFiles(args as Record<string, unknown>);

        case 'file_organizer_find_duplicate_files':
            return handleFindDuplicateFiles(args as Record<string, unknown>);

        case 'file_organizer_organize_files':
            return handleOrganizeFiles(args as Record<string, unknown>);

        case 'file_organizer_preview_organization':
            return handlePreviewOrganization(args as Record<string, unknown>);

        case 'file_organizer_get_categories':
            return handleGetCategories(args as Record<string, unknown>);

        case 'file_organizer_set_custom_rules':
            return handleSetCustomRules(args as Record<string, unknown>);

        case 'file_organizer_analyze_duplicates':
            return handleAnalyzeDuplicates(args as Record<string, unknown>);

        case 'file_organizer_delete_duplicates':
            return handleDeleteDuplicates(args as Record<string, unknown>);

        case 'file_organizer_undo_last_operation':
            return handleUndoLastOperation(args as Record<string, unknown>);

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}
