/**
 * File Organizer MCP Server v3.0.0
 * Tools Registry
 *
 * @module tools
 * @description Central registry and exports for all MCP tools.
 * Each tool has its own file with Zod schema validation and JSDoc documentation.
 */

import type { ToolDefinition } from '../types.js';

// ==================== Tool Definitions ====================

export { listFilesToolDefinition, handleListFiles, ListFilesInputSchema } from './file-listing.js';
export type { ListFilesInput } from './file-listing.js';

export {
    scanDirectoryToolDefinition,
    handleScanDirectory,
    ScanDirectoryInputSchema,
} from './file-scanning.js';
export type { ScanDirectoryInput } from './file-scanning.js';

export {
    categorizeByTypeToolDefinition,
    handleCategorizeByType,
    CategorizeByTypeInputSchema,
} from './file-categorization.js';
export type { CategorizeByTypeInput } from './file-categorization.js';

export {
    findLargestFilesToolDefinition,
    handleFindLargestFiles,
    FindLargestFilesInputSchema,
} from './file-analysis.js';
export type { FindLargestFilesInput } from './file-analysis.js';

export {
    findDuplicateFilesToolDefinition,
    handleFindDuplicateFiles,
    FindDuplicateFilesInputSchema,
} from './file-duplicates.js';
export type { FindDuplicateFilesInput } from './file-duplicates.js';

export {
    organizeFilesToolDefinition,
    handleOrganizeFiles,
    OrganizeFilesInputSchema,
} from './file-organization.js';
export type { OrganizeFilesInput } from './file-organization.js';

// ==================== Tool Registry ====================

import { listFilesToolDefinition } from './file-listing.js';
import { scanDirectoryToolDefinition } from './file-scanning.js';
import { categorizeByTypeToolDefinition } from './file-categorization.js';
import { findLargestFilesToolDefinition } from './file-analysis.js';
import { findDuplicateFilesToolDefinition } from './file-duplicates.js';
import { organizeFilesToolDefinition } from './file-organization.js';
import { previewOrganizationToolDefinition } from './organization-preview.js';
import { getCategoriesToolDefinition, setCustomRulesToolDefinition } from './file-management.js';
import { analyzeDuplicatesToolDefinition, deleteDuplicatesToolDefinition } from './duplicate-management.js';
import { undoLastOperationToolDefinition } from './rollback.js';
import { batchRenameToolDefinition } from './file-renaming.js';
import { inspectMetadataToolDefinition } from './metadata-inspection.js';

export {
    undoLastOperationToolDefinition,
    handleUndoLastOperation,
    UndoLastOperationInputSchema
} from './rollback.js';

export {
    previewOrganizationToolDefinition,
    handlePreviewOrganization,
    PreviewOrganizationInputSchema
} from './organization-preview.js';

export {
    getCategoriesToolDefinition,
    handleGetCategories,
    GetCategoriesInputSchema,
    setCustomRulesToolDefinition,
    handleSetCustomRules,
    SetCustomRulesInputSchema
} from './file-management.js';

export {
    analyzeDuplicatesToolDefinition,
    handleAnalyzeDuplicates,
    AnalyzeDuplicatesInputSchema,
    deleteDuplicatesToolDefinition,
    handleDeleteDuplicates,
    DeleteDuplicatesInputSchema
} from './duplicate-management.js';

export {
    batchRenameToolDefinition,
    handleBatchRename,
    BatchRenameInputSchema
} from './file-renaming.js';

export {
    inspectMetadataToolDefinition,
    handleInspectMetadata,
    InspectMetadataInputSchema
} from './metadata-inspection.js';

/**
 * All available tools for MCP registration
 * @description Array of all tool definitions that can be registered with the MCP server.
 * Each tool includes name, description, and JSON Schema for input validation.
 */
export const TOOLS: ToolDefinition[] = [
    listFilesToolDefinition,
    scanDirectoryToolDefinition,
    categorizeByTypeToolDefinition,
    findLargestFilesToolDefinition,
    findDuplicateFilesToolDefinition,
    organizeFilesToolDefinition,
    previewOrganizationToolDefinition,
    getCategoriesToolDefinition,
    setCustomRulesToolDefinition,
    analyzeDuplicatesToolDefinition,
    deleteDuplicatesToolDefinition,
    undoLastOperationToolDefinition,
    batchRenameToolDefinition,
    inspectMetadataToolDefinition,
];
