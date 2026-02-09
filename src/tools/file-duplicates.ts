/**
 * File Organizer MCP Server v3.2.0
 * find_duplicate_files Tool
 *
 * @module tools/file-duplicates
 */

import { z } from 'zod';
import type { ToolDefinition, ToolResponse, DuplicateResult } from '../types.js';
import { validateStrictPath } from '../services/path-validator.service.js';
import { FileScannerService } from '../services/file-scanner.service.js';
import { HashCalculatorService } from '../services/hash-calculator.service.js';
import { createErrorResponse } from '../utils/error-handler.js';
import { formatBytes } from '../utils/formatters.js';
import { CommonParamsSchema, PaginationSchema } from '../schemas/common.schemas.js';

export const FindDuplicateFilesInputSchema = z
  .object({
    directory: z
      .string()
      .min(1, 'Directory path cannot be empty')
      .describe('Full path to the directory to search for duplicates'),
  })
  .merge(CommonParamsSchema)
  .merge(PaginationSchema);

export type FindDuplicateFilesInput = z.infer<typeof FindDuplicateFilesInputSchema>;

export const findDuplicateFilesToolDefinition: ToolDefinition = {
  name: 'file_organizer_find_duplicate_files',
  title: 'Find Duplicate Files',
  description:
    'Find duplicate files in a directory based on their content (SHA-256 hash). Shows potential wasted space.',
  inputSchema: {
    type: 'object',
    properties: {
      directory: { type: 'string', description: 'Full path to the directory' },
      limit: { type: 'number', description: 'Max groups to return', default: 100 },
      offset: { type: 'number', description: 'Groups to skip', default: 0 },
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

export async function handleFindDuplicateFiles(
  args: Record<string, unknown>
): Promise<ToolResponse> {
  try {
    const parsed = FindDuplicateFilesInputSchema.safeParse(args);
    if (!parsed.success) {
      return {
        content: [
          { type: 'text', text: `Error: ${parsed.error.issues.map((i) => i.message).join(', ')}` },
        ],
      };
    }

    const { directory, response_format, limit, offset } = parsed.data;
    const validatedPath = await validateStrictPath(directory);
    const scanner = new FileScannerService();
    const hashCalculator = new HashCalculatorService();

    const files = await scanner.getAllFiles(validatedPath, false);
    const allDuplicates = await hashCalculator.findDuplicates(files);

    const totalDuplicateSize = allDuplicates.reduce((sum, group) => {
      const fileSize = files.find((f) => f.name === group.files[0]?.name)?.size ?? 0;
      return sum + fileSize * (group.count - 1);
    }, 0);

    // Pagination logic (paginate groups)
    const total_count = allDuplicates.length;
    const paginatedDuplicates = allDuplicates.slice(offset, offset + limit);
    const returned_count = paginatedDuplicates.length;
    const has_more = offset + limit < total_count;
    const next_offset = has_more ? offset + limit : undefined;

    const result: DuplicateResult = {
      directory: validatedPath,
      total_count,
      returned_count,
      offset,
      has_more,
      next_offset,
      items: paginatedDuplicates,
      duplicate_groups: total_count,
      total_duplicate_files: allDuplicates.reduce((sum, g) => sum + g.count, 0),
      wasted_space: formatBytes(totalDuplicateSize),
    };

    if (response_format === 'json') {
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    }

    const markdown = `### Duplicate Files in \`${result.directory}\`
**Wasted Space:** ${result.wasted_space}
**Duplicate Groups:** ${result.total_count}
**Showing:** ${result.returned_count > 0 ? result.offset + 1 : 0} - ${result.offset + result.returned_count}

${result.items.map((g) => `**Group (${g.size} each):**\n${g.files.map((f) => `- ${f.path}`).join('\n')}`).join('\n\n')}

${result.has_more ? `*... ${result.total_count - (result.offset + result.returned_count)} more groups (use offset=${result.next_offset})*` : ''}`;

    return {
      content: [{ type: 'text', text: markdown }],
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}
