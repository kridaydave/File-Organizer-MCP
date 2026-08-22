/**
 * File Organizer MCP Server v3.5.0
 * Tools Registry — barrel re-exports + registry source of truth
 *
 * Individual tool modules remain the owners of definition + handler.
 * TOOLS[] and handler Map live in src/mcp/registry.ts (single source).
 * This file is a thin barrel for backwards-compat imports.
 */

// ── barrel: keep existing public imports working ──
export { listFilesToolDefinition, handleListFiles } from "./file-listing.js";
export { ListFilesInputSchema } from "../schemas/scan.js";
export type { ListFilesInput } from "../schemas/scan.js";

export {
  scanDirectoryToolDefinition,
  handleScanDirectory,
} from "./file-scanning.js";
export { ScanDirectoryInputSchema } from "../schemas/scan.js";
export type { ScanDirectoryInput } from "../schemas/scan.js";

export {
  categorizeByTypeToolDefinition,
  handleCategorizeByType,
  CategorizeByTypeInputSchema,
} from "./file-categorization.js";
export type { CategorizeByTypeInput } from "./file-categorization.js";

export {
  findLargestFilesToolDefinition,
  handleFindLargestFiles,
} from "./file-analysis.js";
export { FindLargestFilesInputSchema } from "../schemas/scan.js";
export type { FindLargestFilesInput } from "../schemas/scan.js";

export {
  findDuplicateFilesToolDefinition,
  handleFindDuplicateFiles,
} from "./file-duplicates.js";
export { FindDuplicateFilesInputSchema } from "../schemas/scan.js";
export type { FindDuplicateFilesInput } from "../schemas/scan.js";

export {
  organizeFilesToolDefinition,
  handleOrganizeFiles,
} from "./file-organization.js";
export { OrganizeFilesInputSchema } from "../schemas/organize.js";
export type { OrganizeFilesInput } from "../schemas/organize.js";

export {
  organizeMusicToolDefinition,
  handleOrganizeMusic,
} from "./music-organization.js";
export { OrganizeMusicInputSchema } from "../schemas/organize.js";
export type { OrganizeMusicInput } from "../schemas/organize.js";

export {
  organizePhotosToolDefinition,
  handleOrganizePhotos,
} from "./photo-organization.js";
export { OrganizePhotosInputSchema } from "../schemas/organize.js";
export type { OrganizePhotosInput } from "../schemas/organize.js";

export {
  smartSuggestToolDefinition,
  handleSmartSuggest,
} from "./smart-suggest.js";
export { SmartSuggestInputSchema } from "../schemas/organize.js";
export type { SmartSuggestInput } from "../schemas/organize.js";

export {
  systemOrganizationToolDefinition,
  handleSystemOrganization,
} from "./system-organization.js";

export {
  batchReadFilesToolDefinition,
  handleBatchReadFiles,
} from "./batch-file-reader.js";
export { BatchReadFilesInputSchema } from "../schemas/scan.js";
export type { BatchReadFilesInput } from "../schemas/scan.js";
export type { FileReadResult } from "./batch-file-reader.js";

export {
  undoLastOperationToolDefinition,
  handleUndoLastOperation,
} from "./rollback.js";
export { UndoLastOperationInputSchema } from "../schemas/organize.js";
export type { UndoLastOperationInput } from "../schemas/organize.js";

export {
  previewOrganizationToolDefinition,
  handlePreviewOrganization,
} from "./organization-preview.js";
export { PreviewOrganizationInputSchema } from "../schemas/organize.js";
export type { PreviewOrganizationInput } from "../schemas/organize.js";

export {
  getCategoriesToolDefinition,
  handleGetCategories,
  setCustomRulesToolDefinition,
  handleSetCustomRules,
} from "./file-management.js";
export {
  GetCategoriesInputSchema,
  SetCustomRulesInputSchema,
} from "../schemas/system.js";

export {
  analyzeDuplicatesToolDefinition,
  handleAnalyzeDuplicates,
  deleteDuplicatesToolDefinition,
  handleDeleteDuplicates,
} from "./duplicate-management.js";
export {
  AnalyzeDuplicatesInputSchema,
  DeleteDuplicatesInputSchema,
} from "../schemas/scan.js";
export type {
  AnalyzeDuplicatesInput,
  DeleteDuplicatesInput,
} from "../schemas/scan.js";

export {
  batchRenameToolDefinition,
  handleBatchRename,
} from "./file-renaming.js";
export { BatchRenameInputSchema } from "../schemas/organize.js";
export type { BatchRenameInput } from "../schemas/organize.js";

export {
  inspectMetadataToolDefinition,
  handleInspectMetadata,
} from "./metadata-inspection.js";
export { InspectMetadataInputSchema } from "../schemas/scan.js";
export type { InspectMetadataInput } from "../schemas/scan.js";

export {
  watchDirectoryToolDefinition,
  handleWatchDirectory,
  unwatchDirectoryToolDefinition,
  handleUnwatchDirectory,
  listWatchesToolDefinition,
  handleListWatches,
} from "../extensions/scheduler/watch.tool.js";
export {
  WatchDirectoryInputSchema,
  UnwatchDirectoryInputSchema,
  ListWatchesInputSchema,
} from "../extensions/scheduler/watch.schemas.js";
export type {
  WatchDirectoryInput,
  UnwatchDirectoryInput,
  ListWatchesInput,
} from "../extensions/scheduler/watch.schemas.js";

export {
  fileReaderToolDefinition,
  handleReadFile,
} from "./file-reader.tool.js";
export { ReadFileInputSchema } from "../schemas/scan.js";
export type { ReadFileInput } from "../schemas/scan.js";

export {
  viewHistoryToolDefinition,
  handleViewHistory,
} from "./view-history.js";

// ── registry: single source of truth (TOOLS + handler map) ──
export {
  TOOLS,
  toolHandlers,
  getToolHandler,
  hasTool,
} from "../mcp/registry.js";
