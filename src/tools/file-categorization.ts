/**
 * File Organizer MCP Server v3.0.0
 * categorize_by_type Tool
 *
 * @module tools/file-categorization
 */

import { z } from 'zod';
import type { ToolDefinition, ToolResponse, CategorizedResult } from '../types.js';
import { validateStrictPath } from '../services/path-validator.service.js';
import { FileScannerService } from '../services/file-scanner.service.js';
import { CategorizerService } from '../services/categorizer.service.js';
import { createErrorResponse } from '../utils/error-handler.js';
import { CommonParamsSchema } from '../schemas/common.schemas.js';

export const CategorizeByTypeInputSchema = z
    .object({
        directory: z
            .string()
            .min(1, 'Directory path cannot be empty')
            .describe('Full path to the directory to categorize'),
        include_subdirs: z.boolean().optional().default(false).describe('Include subdirectories in categorization'),
    })
    .merge(CommonParamsSchema);

export type CategorizeByTypeInput = z.infer<typeof CategorizeByTypeInputSchema>;

export const categorizeByTypeToolDefinition: ToolDefinition = {
    name: 'file_organizer_categorize_by_type',
    title: 'Categorize Files by Type',
    description:
        'Categorize files by their type (Executables, Videos, Documents, etc.) and show statistics for each category.',
    inputSchema: {
        type: 'object',
        properties: {
            directory: { type: 'string', description: 'Full path to the directory to categorize' },
            include_subdirs: { type: 'boolean', description: 'Include subdirectories', default: false },
            response_format: { type: 'string', enum: ['json', 'markdown'], default: 'markdown' },
        },
        required: ['directory'],
    },
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
    },
};

export async function handleCategorizeByType(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
        const parsed = CategorizeByTypeInputSchema.safeParse(args);
        if (!parsed.success) {
            return {
                content: [{ type: 'text', text: `Error: ${parsed.error.issues.map((i) => i.message).join(', ')}` }],
            };
        }

        const { directory, include_subdirs, response_format } = parsed.data;
        const validatedPath = await validateStrictPath(directory);
        const scanner = new FileScannerService();
        const categorizer = new CategorizerService();

        const files = await scanner.getAllFiles(validatedPath, include_subdirs);
        const categories = categorizer.categorizeFiles(files);

        const result: CategorizedResult = {
            directory: validatedPath,
            categories,
        };

        if (response_format === 'json') {
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                structuredContent: result as unknown as Record<string, unknown>,
            };
        }

        const markdown = `### File Categories in \`${result.directory}\`

${Object.entries(result.categories)
                .map(([cat, stats]) => `#### ${cat} (${stats?.count} files, ${stats?.total_size_readable})\n${stats?.files.slice(0, 5).map(f => `- ${f}`).join('\n')}${stats && stats.count > 5 ? `\n- ...and ${stats.count - 5} more` : ''}`)
                .join('\n\n')}`;

        return {
            content: [{ type: 'text', text: markdown }],
        };
    } catch (error) {
        return createErrorResponse(error);
    }
}
