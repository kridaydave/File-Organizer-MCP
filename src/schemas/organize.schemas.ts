/**
 * File Organizer MCP Server v3.0.0
 * Organize Operation Schemas
 */

import { z } from 'zod';
import { DirectoryInputSchema } from './common.schemas.js';

/**
 * Schema for organize_files tool
 */
export const OrganizeFilesInputSchema = DirectoryInputSchema.extend({
    dry_run: z.boolean().default(false),
});

export type OrganizeFilesInput = z.infer<typeof OrganizeFilesInputSchema>;
