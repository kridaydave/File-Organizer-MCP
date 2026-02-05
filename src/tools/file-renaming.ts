/**
 * File Organizer MCP Server v3.0.0
 * batch_rename Tool
 *
 * @module tools/file-renaming
 */

import { z } from 'zod';
import path from 'path';
import type { ToolDefinition, ToolResponse } from '../types.js';
import { validateStrictPath } from '../services/path-validator.service.js';
import { FileScannerService } from '../services/file-scanner.service.js';
import { RenamingService } from '../services/renaming.service.js';
import { RenameRuleSchema } from '../schemas/rename.schemas.js';
import { createErrorResponse } from '../utils/error-handler.js';
import { CommonParamsSchema } from '../schemas/common.schemas.js';

export const BatchRenameInputSchema = z
    .object({
        files: z.array(z.string()).optional().describe('List of absolute file paths to rename'),
        directory: z.string().optional().describe('Directory to scan for files (if "files" is not provided)'),
        rules: z.array(RenameRuleSchema).min(1, 'At least one renaming rule is required'),
        dry_run: z
            .boolean()
            .optional()
            .default(true)
            .describe('If true, only simulate renaming. Default: true'),
    })
    .merge(CommonParamsSchema)
    .refine((data) => data.files || data.directory, {
        message: 'Either "files" or "directory" must be provided',
        path: ['files', 'directory'],
    });

export type BatchRenameInput = z.infer<typeof BatchRenameInputSchema>;

export const batchRenameToolDefinition: ToolDefinition = {
    name: 'file_organizer_batch_rename',
    title: 'Batch Rename Files',
    description:
        'Rename multiple files using rules (find/replace, case, add text, numbering). "dry_run" defaults to true for safety.',
    inputSchema: {
        type: 'object',
        properties: {
            files: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of absolute file paths',
            },
            directory: { type: 'string', description: 'Directory to scan (optional)' },
            rules: {
                type: 'array',
                description: 'List of renaming rules. See specific rule schemas.',
                items: { type: 'object' }, // Generic description as specific schemas are complex to inline for MCP prompts sometimes
            },
            dry_run: { type: 'boolean', description: 'Simulate renaming', default: true },
            response_format: { type: 'string', enum: ['json', 'markdown'], default: 'markdown' },
        },
        required: ['rules'],
    },
    annotations: {
        readOnlyHint: false, // It modifies files if dry_run is false
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
    },
};

export async function handleBatchRename(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
        const parsed = BatchRenameInputSchema.safeParse(args);
        if (!parsed.success) {
            return {
                content: [{ type: 'text', text: `Error: ${parsed.error.issues.map((i) => i.message).join(', ')}` }],
            };
        }

        const { files: explicitFiles, directory, rules, dry_run, response_format } = parsed.data;

        let filesToProcess: string[] = [];

        if (explicitFiles && explicitFiles.length > 0) {
            // Validate each file path
            for (const f of explicitFiles) {
                await validateStrictPath(f);
            }
            filesToProcess = explicitFiles;
        } else if (directory) {
            const validatedDir = await validateStrictPath(directory);
            const scanner = new FileScannerService();
            // Just scan for files, not recursive by default unless we want to?
            // Let's assume non-recursive for safety unless implied?
            // The Scanner `getAllFiles` is recursive if recursive flag is true.
            // Let's default to false (single directory) for batch rename to avoid accidents.
            const scanned = await scanner.getAllFiles(validatedDir, false);
            filesToProcess = scanned.map(f => f.path);
        }

        if (filesToProcess.length === 0) {
            return {
                content: [{ type: 'text', text: 'No files found to rename.' }],
            };
        }

        const renamingService = new RenamingService();

        // 1. Calculate Previews
        const previews = await renamingService.applyRenameRules(filesToProcess, rules);

        // 2. Execute if not dry_run
        const result = await renamingService.executeRename(previews, dry_run);

        // 3. Format Output

        if (response_format === 'json') {
            return {
                content: [{
                    type: 'text', text: JSON.stringify({
                        dry_run,
                        rules,
                        previews: dry_run ? previews : undefined, // show previews in dry run
                        result: !dry_run ? result : undefined // show result in execution
                    }, null, 2)
                }],
            };
        }

        // Markdown Output
        let md = `### Batch Rename ${dry_run ? '(Dry Run)' : 'Result'}\n\n`;
        md += `**Rules Applied:** ${rules.length}\n`;
        md += `**Files Processed:** ${previews.length}\n\n`;

        if (dry_run) {
            md += `#### Preview Changes\n`;
            const changes = previews.filter(p => p.willChange);
            if (changes.length === 0) {
                md += `_No files will be changed by these rules._\n`;
            } else {
                md += `| Original | New | Status |\n|---|---|---|\n`;
                for (const p of changes.slice(0, 50)) { // limit output
                    const status = p.conflict ? '⚠️ Conflict' : (p.error ? `❌ ${p.error}` : '✅ OK');
                    md += `| \`${path.basename(p.original)}\` | \`${path.basename(p.new)}\` | ${status} |\n`;
                }
                if (changes.length > 50) md += `| ... | ... | ... |\n`;
            }
        } else {
            md += `#### Execution Summary\n`;
            md += `- **Renamed:** ${result.statistics.renamed}\n`;
            md += `- **Failed:** ${result.statistics.failed}\n`;
            md += `- **Skipped:** ${result.statistics.skipped}\n\n`;

            if (result.errors.length > 0) {
                md += `**Errors:**\n${result.errors.map(e => `- ${e}`).join('\n')}\n`;
            }
        }

        return {
            content: [{ type: 'text', text: md }],
        };

    } catch (error) {
        return createErrorResponse(error);
    }
}
