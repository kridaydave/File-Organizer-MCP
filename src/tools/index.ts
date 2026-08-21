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
export { ListFilesInputSchema } from "../schemas/scan.schemas.js";
export type { ListFilesInput } from "../schemas/scan.schemas.js";

export {
  scanDirectoryToolDefinition,
  handleScanDirectory,
} from "./file-scanning.js";
export { ScanDirectoryInputSchema } from "../schemas/scan.schemas.js";
export type { ScanDirectoryInput } from "../schemas/scan.schemas.js";

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
export { FindLargestFilesInputSchema } from "../schemas/scan.schemas.js";
export type { FindLargestFilesInput } from "../schemas/scan.schemas.js";

export {
  findDuplicateFilesToolDefinition,
  handleFindDuplicateFiles,
} from "./file-duplicates.js";
export { FindDuplicateFilesInputSchema } from "../schemas/scan.schemas.js";
export type { FindDuplicateFilesInput } from "../schemas/scan.schemas.js";

export {
  organizeFilesToolDefinition,
  handleOrganizeFiles,
} from "./file-organization.js";
export { OrganizeFilesInputSchema } from "../schemas/organize.schemas.js";
export type { OrganizeFilesInput } from "../schemas/organize.schemas.js";

export {
  organizeMusicToolDefinition,
  handleOrganizeMusic,
} from "./music-organization.js";
export { OrganizeMusicInputSchema } from "../schemas/media.schemas.js";
export type { OrganizeMusicInput } from "../schemas/media.schemas.js";

export {
  organizePhotosToolDefinition,
  handleOrganizePhotos,
} from "./photo-organization.js";
export { OrganizePhotosInputSchema } from "../schemas/media.schemas.js";
export type { OrganizePhotosInput } from "../schemas/media.schemas.js";

export {
  organizeByContentToolDefinition,
  handleOrganizeByContent,
  OrganizeByContentInputSchema,
} from "./content-organization.js";
export type { OrganizeByContentInput } from "./content-organization.js";

export {
  organizeSmartToolDefinition,
  handleOrganizeSmart,
} from "./smart-organization.js";
export { OrganizeSmartInputSchema } from "../schemas/smart.schemas.js";
export type { OrganizeSmartInput } from "../schemas/smart.schemas.js";

export {
  smartSuggestToolDefinition,
  handleSmartSuggest,
} from "./smart-suggest.js";
export { SmartSuggestInputSchema } from "../schemas/smart.schemas.js";
export type { SmartSuggestInput } from "../schemas/smart.schemas.js";

export {
  systemOrganizationToolDefinition,
  handleSystemOrganization,
} from "./system-organization.js";

export {
  batchReadFilesToolDefinition,
  handleBatchReadFiles,
} from "./batch-file-reader.js";
export { BatchReadFilesInputSchema } from "../schemas/batch.schemas.js";
export type { BatchReadFilesInput } from "../schemas/batch.schemas.js";
export type { FileReadResult } from "./batch-file-reader.js";

export {
  undoLastOperationToolDefinition,
  handleUndoLastOperation,
} from "./rollback.js";
export { UndoLastOperationInputSchema } from "../schemas/rollback.schemas.js";
export type { UndoLastOperationInput } from "../schemas/rollback.schemas.js";

export {
  previewOrganizationToolDefinition,
  handlePreviewOrganization,
} from "./organization-preview.js";
export { PreviewOrganizationInputSchema } from "../schemas/preview.schemas.js";
export type { PreviewOrganizationInput } from "../schemas/preview.schemas.js";

export {
  getCategoriesToolDefinition,
  handleGetCategories,
  setCustomRulesToolDefinition,
  handleSetCustomRules,
} from "./file-management.js";
export {
  GetCategoriesInputSchema,
  SetCustomRulesInputSchema,
} from "../schemas/file-management.schemas.js";

export {
  analyzeDuplicatesToolDefinition,
  handleAnalyzeDuplicates,
  deleteDuplicatesToolDefinition,
  handleDeleteDuplicates,
} from "./duplicate-management.js";
export {
  AnalyzeDuplicatesInputSchema,
  DeleteDuplicatesInputSchema,
} from "../schemas/duplicate.schemas.js";
export type {
  AnalyzeDuplicatesInput,
  DeleteDuplicatesInput,
} from "../schemas/duplicate.schemas.js";

export {
  batchRenameToolDefinition,
  handleBatchRename,
} from "./file-renaming.js";
export { BatchRenameInputSchema } from "../schemas/batch-rename.schemas.js";
export type { BatchRenameInput } from "../schemas/batch-rename.schemas.js";

export {
  inspectMetadataToolDefinition,
  handleInspectMetadata,
} from "./metadata-inspection.js";
export { InspectMetadataInputSchema } from "../schemas/metadata.schemas.js";
export type { InspectMetadataInput } from "../schemas/metadata.schemas.js";

export {
  watchDirectoryToolDefinition,
  handleWatchDirectory,
  unwatchDirectoryToolDefinition,
  handleUnwatchDirectory,
  listWatchesToolDefinition,
  handleListWatches,
} from "./watch.tool.js";
export {
  WatchDirectoryInputSchema,
  UnwatchDirectoryInputSchema,
  ListWatchesInputSchema,
} from "../schemas/watch.schemas.js";
export type {
  WatchDirectoryInput,
  UnwatchDirectoryInput,
  ListWatchesInput,
} from "../schemas/watch.schemas.js";

export {
  fileReaderToolDefinition,
  handleReadFile,
} from "./file-reader.tool.js";
export { ReadFileInputSchema } from "../schemas/reader.schemas.js";
export type { ReadFileInput } from "../schemas/reader.schemas.js";

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
