/**
 * File Organizer MCP Server v3.1.3
 * find_largest_files Tool
 *
 * @module tools/file-analysis
 */

import { z } from 'zod';
import type {
  ToolDefinition,
  ToolResponse,
  LargestFilesResult,
  LargestFileInfo,
} from '../types.js';
import { validateStrictPath } from '../services/path-validator.service.js';
import { FileScannerService } from '../services/file-scanner.service.js';
import { createErrorResponse } from '../utils/error-handler.js';
import { formatBytes } from '../utils/formatters.js';
import { CommonParamsSchema } from '../schemas/common.schemas.js';

export const FindLargestFilesInputSchema = z
  .object({
    directory: z
      .string()
      .min(1, 'Directory path cannot be empty')
      .describe('Full path to the directory to search'),
    include_subdirs: z
      .boolean()
      .optional()
      .default(false)
      .describe('Include subdirectories in search'),
    top_n: z
      .number()
      .int()
      .positive()
      .max(100)
      .optional()
      .default(10)
      .describe('Number of largest files to return'),
  })
  .merge(CommonParamsSchema);

export type FindLargestFilesInput = z.infer<typeof FindLargestFilesInputSchema>;

export const findLargestFilesToolDefinition: ToolDefinition = {
  name: 'file_organizer_find_largest_files',
  title: 'Find Largest Files',
  description:
    'Find the largest files in a directory. Useful for identifying space-consuming files and cleanup opportunities.',
  inputSchema: {
    type: 'object',
    properties: {
      directory: { type: 'string', description: 'Full path to the directory' },
      include_subdirs: { type: 'boolean', description: 'Include subdirectories', default: false },
      top_n: { type: 'number', description: 'Number of files to return', default: 10 },
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

export async function handleFindLargestFiles(args: Record<string, unknown>): Promise<ToolResponse> {
  try {
    const parsed = FindLargestFilesInputSchema.safeParse(args);
    if (!parsed.success) {
      return {
        content: [
          { type: 'text', text: `Error: ${parsed.error.issues.map((i) => i.message).join(', ')}` },
        ],
      };
    }

    const { directory, include_subdirs, top_n, response_format } = parsed.data;
    const validatedPath = await validateStrictPath(directory);
    const scanner = new FileScannerService();
    const files = await scanner.getAllFiles(validatedPath, include_subdirs);

    const sorted: LargestFileInfo[] = files
      .sort((a, b) => b.size - a.size)
      .slice(0, top_n)
      .map((f) => ({
        name: f.name,
        path: f.path,
        size: f.size,
        size_readable: formatBytes(f.size),
      }));

    const result: LargestFilesResult = {
      directory: validatedPath,
      largest_files: sorted,
    };

    if (response_format === 'json') {
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    }

    const markdown = `### Largest ${sorted.length} Files in \`${result.directory}\`

${sorted.map((f, i) => `${i + 1}. **${f.name}** - ${f.size_readable}`).join('\n')}`;

    return {
      content: [{ type: 'text', text: markdown }],
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}
