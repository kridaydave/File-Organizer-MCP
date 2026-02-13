/**
 * File Organizer MCP Server v3.2.0
 * organize_files Tool
 *
 * @module tools/file-organization
 */

import { z } from 'zod';
import type { ToolDefinition, ToolResponse, OrganizeResult } from '../types.js';
import { validateStrictPath } from '../services/path-validator.service.js';
import { FileScannerService } from '../services/file-scanner.service.js';
import { globalOrganizerService } from '../services/index.js';
import { createErrorResponse } from '../utils/error-handler.js';
import { CommonParamsSchema } from '../schemas/common.schemas.js';
import { loadUserConfig } from '../config.js';

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
    conflict_strategy: z
      .enum(['rename', 'skip', 'overwrite'])
      .optional()
      .describe('How to handle file conflicts. Uses config default if not specified'),
    use_content_analysis: z
      .boolean()
      .optional()
      .default(false)
      .describe('Analyze file content for accurate type detection and security (slower)'),
  })
  .merge(CommonParamsSchema);

export type OrganizeFilesInput = z.infer<typeof OrganizeFilesInputSchema>;

export const organizeFilesToolDefinition: ToolDefinition = {
  name: 'file_organizer_organize_files',
  title: 'Organize Files',
  description:
    'Automatically organize files into categorized folders. Enable use_content_analysis to detect file type mismatches and potential security threats. Use dry_run=true to preview changes.',
  inputSchema: {
    type: 'object',
    properties: {
      directory: { type: 'string', description: 'Full path to the directory' },
      dry_run: { type: 'boolean', description: 'Simulate organization', default: true },
      use_content_analysis: { 
        type: 'boolean', 
        description: 'Analyze file content for accurate type detection and security (slower)',
        default: false 
      },
      response_format: { type: 'string', enum: ['json', 'markdown'], default: 'markdown' },
      conflict_strategy: {
        type: 'string',
        enum: ['rename', 'skip', 'overwrite'],
        description:
          'How to handle file conflicts (rename/skip/overwrite). Uses config default if not specified',
      },
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

/**
 * Get conflict strategy from user config or return default
 */
function getConflictStrategy(): 'rename' | 'skip' | 'overwrite' {
  const userConfig = loadUserConfig();
  return userConfig.conflictStrategy ?? 'rename';
}

export async function handleOrganizeFiles(args: Record<string, unknown>): Promise<ToolResponse> {
  try {
    const parsed = OrganizeFilesInputSchema.safeParse(args);
    if (!parsed.success) {
      return {
        content: [
          { type: 'text', text: `Error: ${parsed.error.issues.map((i) => i.message).join(', ')}` },
        ],
      };
    }

    const { directory, dry_run, response_format, conflict_strategy, use_content_analysis } = parsed.data;
    const validatedPath = await validateStrictPath(directory);
    const scanner = new FileScannerService();
    // Use global organizer service which has content analyzer enabled
    const organizer = globalOrganizerService;

    // Use provided strategy, or fall back to config, or default to 'rename'
    const effectiveConflictStrategy = conflict_strategy ?? getConflictStrategy();

    const files = await scanner.getAllFiles(validatedPath, false);
    
    // Note: use_content_analysis is available in the categorizer service
    // but the organize method uses the categorizer which now has content analysis enabled
    // Full content analysis per-file would require modifying the organizer service
    // For now, we document that content analysis is available in categorize_by_type
    
    const { statistics, actions, errors } = await organizer.organize(validatedPath, files, {
      dryRun: dry_run,
      conflictStrategy: effectiveConflictStrategy,
      useContentAnalysis: use_content_analysis,
    });

    const result: OrganizeResult & { content_analysis_enabled?: boolean } = {
      directory: validatedPath,
      dry_run,
      total_files: files.length,
      statistics,
      actions,
      errors,
    };
    
    if (use_content_analysis) {
      result.content_analysis_enabled = true;
    }

    if (response_format === 'json') {
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    }

    let markdown = `### Organization Result for \`${result.directory}\` ${dry_run ? '(Dry Run)' : ''}`;
    
    if (use_content_analysis) {
      markdown += '\n*(Content analysis enabled in categorizer)*';
    }
    
    markdown += `

**Total Files Processed:** ${result.total_files}
**Errors:** ${result.errors.length}
**Conflict Strategy:** ${effectiveConflictStrategy}

**Statistics:**
${Object.entries(result.statistics)
  .map(([cat, count]) => `- ${cat}: ${count}`)
  .join('\n')}

**Actions:**
${result.actions
  .slice(0, 20)
  .map((a) => `- Moved \`${a.file}\` → \`${a.to}\``)
  .join('\n')}
${result.actions.length > 20 ? `\n*(...and ${result.actions.length - 20} more actions)*` : ''}

${result.errors.length > 0 ? `\n**Errors:**\n${result.errors.join('\n')}` : ''}`;

    return {
      content: [{ type: 'text', text: markdown }],
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}
