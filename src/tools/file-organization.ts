/**
 * File Organizer MCP Server v3.0.0
 * organize_files Tool
 *
 * @module tools/file-organization
 */

import { z } from 'zod';
import type { ToolDefinition, ToolResponse, OrganizeResult } from '../types.js';
import { validateStrictPath } from '../services/path-validator.service.js';
import { FileScannerService } from '../services/file-scanner.service.js';
import { OrganizerService } from '../services/organizer.service.js';
import { createErrorResponse } from '../utils/error-handler.js';
import { CommonParamsSchema } from '../schemas/common.schemas.js';

export const OrganizeFilesInputSchema = z
    .object({
        directory: z
            .string()
            .min(1, 'Directory path cannot be empty')
            .describe('Full path to the directory to organize'),
        dry_run: z
            .boolean()
            .optional()
            .default(false)
            .describe('If true, only simulate the organization without moving files'),
    })
    .merge(CommonParamsSchema);

export type OrganizeFilesInput = z.infer<typeof OrganizeFilesInputSchema>;

export const organizeFilesToolDefinition: ToolDefinition = {
    name: 'file_organizer_organize_files',
    title: 'Organize Files',
    description:
        'Automatically organize files into categorized folders. Use dry_run=true to preview changes.',
    inputSchema: {
        type: 'object',
        properties: {
            directory: { type: 'string', description: 'Full path to the directory' },
            dry_run: { type: 'boolean', description: 'Simulate organization', default: true },
            response_format: { type: 'string', enum: ['json', 'markdown'], default: 'markdown' },
        },
        required: ['directory'],
    },
    annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
    },
};

export async function handleOrganizeFiles(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
        const parsed = OrganizeFilesInputSchema.safeParse(args);
        if (!parsed.success) {
            return {
                content: [{ type: 'text', text: `Error: ${parsed.error.issues.map((i) => i.message).join(', ')}` }],
            };
        }

        const { directory, dry_run, response_format } = parsed.data;
        const validatedPath = await validateStrictPath(directory);
        const scanner = new FileScannerService();
        const organizer = new OrganizerService();

        const files = await scanner.getAllFiles(validatedPath, false);
        const { statistics, actions, errors } = await organizer.organize(validatedPath, files, {
            dryRun: dry_run,
        });

        const result: OrganizeResult = {
            directory: validatedPath,
            dry_run,
            total_files: files.length,
            statistics,
            actions,
            errors,
        };

        if (response_format === 'json') {
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                structuredContent: result as unknown as Record<string, unknown>,
            };
        }

        const markdown = `### Organization Result for \`${result.directory}\` ${dry_run ? '(Dry Run)' : ''}

**Total Files Processed:** ${result.total_files}
**Errors:** ${result.errors.length}

**Statistics:**
${Object.entries(result.statistics).map(([cat, count]) => `- ${cat}: ${count}`).join('\n')}

**Actions:**
${result.actions.slice(0, 20).map(a => `- Moved \`${a.file}\` → \`${a.to}\``).join('\n')}
${result.actions.length > 20 ? `\n*(...and ${result.actions.length - 20} more actions)*` : ''}

${result.errors.length > 0 ? `\n**Errors:**\n${result.errors.join('\n')}` : ''}`;

        return {
            content: [{ type: 'text', text: markdown }],
        };
    } catch (error) {
        return createErrorResponse(error);
    }
}
