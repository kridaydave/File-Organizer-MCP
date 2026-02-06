/**
 * File Organizer MCP Server v3.1.3
 * organization-preview Tool
 *
 * @module tools/organization-preview
 */

import { z } from 'zod';
import type { ToolDefinition, ToolResponse, OrganizationPlan } from '../types.js';
import { validateStrictPath } from '../services/path-validator.service.js';
import { FileScannerService } from '../services/file-scanner.service.js';
import { globalOrganizerService } from '../services/index.js';
import { createErrorResponse } from '../utils/error-handler.js';
import { CommonParamsSchema } from '../schemas/common.schemas.js';
import { loadUserConfig } from '../config.js';

export const PreviewOrganizationInputSchema = z
    .object({
        directory: z
            .string()
            .min(1, 'Directory path cannot be empty')
            .describe('Full path to the directory to preview organization for'),
        show_conflicts_only: z.boolean().default(false).describe('Only show files that will cause naming conflicts'),
        conflict_strategy: z
            .enum(['rename', 'skip', 'overwrite'])
            .optional()
            .describe('How to handle file conflicts for preview. Uses config default if not specified'),
    })
    .merge(CommonParamsSchema);

export const previewOrganizationToolDefinition: ToolDefinition = {
    name: 'file_organizer_preview_organization',
    title: 'Preview File Organization Plan',
    description:
        'Shows what would happen if files were organized, WITHOUT making any changes. Shows moves, conflicts, and skip reasons.',
    inputSchema: {
        type: 'object',
        properties: {
            directory: { type: 'string', description: 'Full path to the directory' },
            show_conflicts_only: { type: 'boolean', default: false },
            response_format: { type: 'string', enum: ['json', 'markdown'], default: 'markdown' },
            conflict_strategy: { 
                type: 'string', 
                enum: ['rename', 'skip', 'overwrite'],
                description: 'How to handle file conflicts for preview (rename/skip/overwrite). Uses config default if not specified'
            },
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

/**
 * Get conflict strategy from user config or return default
 */
function getConflictStrategy(): 'rename' | 'skip' | 'overwrite' {
    const userConfig = loadUserConfig();
    return userConfig.conflictStrategy ?? 'rename';
}

export async function handlePreviewOrganization(
    args: Record<string, unknown>
): Promise<ToolResponse> {
    try {
        const parsed = PreviewOrganizationInputSchema.safeParse(args);
        if (!parsed.success) {
            return {
                content: [{ type: 'text', text: `Error: ${parsed.error.issues.map((i) => i.message).join(', ')}` }],
            };
        }

        const { directory, show_conflicts_only, response_format, conflict_strategy } = parsed.data;
        const validatedPath = await validateStrictPath(directory);

        const scanner = new FileScannerService();
        const organizer = globalOrganizerService;

        // Use provided strategy, or fall back to config, or default to 'rename'
        const effectiveConflictStrategy = conflict_strategy ?? getConflictStrategy();

        const files = await scanner.getAllFiles(validatedPath, false);
        const plan = await organizer.generateOrganizationPlan(validatedPath, files, effectiveConflictStrategy);

        const output = {
            summary: {
                total_files: plan.moves.length,
                categories_affected: plan.categoryCounts,
                estimated_duration_seconds: plan.estimatedDuration,
                warnings: plan.warnings,
            },
            moves: plan.moves.map((m: OrganizationPlan['moves'][0]) => ({
                source: m.source,
                destination: m.destination,
                category: m.category,
                conflict: m.hasConflict,
                conflict_resolution: m.conflictResolution,
            })),
            conflicts: plan.conflicts,
            skipped_files: plan.skippedFiles.map((f: { path: string; reason: string }) => ({
                path: f.path,
                reason: f.reason,
            })),
        };

        if (show_conflicts_only) {
            output.moves = output.moves.filter((m: any) => m.conflict);
        }

        if (response_format === 'json') {
            return {
                content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
                structuredContent: output as unknown as Record<string, unknown>,
            };
        }

        const markdown = `### Organization Preview for \`${directory}\`

**Summary:**
- Files to Move: ${output.summary.total_files}
- Estimated Time: ${output.summary.estimated_duration_seconds.toFixed(2)}s
- Conflicts: ${output.moves.filter((m: any) => m.conflict).length}
- Conflict Strategy: ${effectiveConflictStrategy}

**Category Breakdown:**
${Object.entries(output.summary.categories_affected).map(([cat, count]) => `- **${cat}**: ${count}`).join('\n')}

**Proposed Moves:**
${output.moves.map((m: any) => `- \`${m.source}\` -> \`${m.destination}\` ${m.conflict ? `⚠️ (${m.conflict_resolution || 'Rename'})` : ''}`).join('\n')}

${output.skipped_files.length ? `**Skipped Files:**\n${output.skipped_files.map((f: any) => `- ${f.path}: ${f.reason}`).join('\n')}` : ''}
`;

        return {
            content: [{ type: 'text', text: markdown }],
        };
    } catch (error) {
        return createErrorResponse(error);
    }
}
