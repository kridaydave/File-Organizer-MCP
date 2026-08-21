/**
 * Tool Registry — single source of truth for TOOLS + handler map
 *
 * Imports every tool module, wraps via defineTool(), builds:
 *  - TOOLS: ToolDefinition[] for ListTools
 *  - handlerMap: Map<string, ToolHandler> for CallTool (replaces switch)
 *
 * Phase-1: explicit imports (no magic). Phase-2 can switch to
 * import.meta.glob auto-discovery — DX stays identical.
 */

import { defineTool, type ToolHandler } from "./defineTool.js";
import type { ToolDefinition } from "./types.js";

// ── tool modules ──
import {
  listFilesToolDefinition,
  handleListFiles,
} from "../tools/file-listing.js";
import {
  scanDirectoryToolDefinition,
  handleScanDirectory,
} from "../tools/file-scanning.js";
import {
  categorizeByTypeToolDefinition,
  handleCategorizeByType,
} from "../tools/file-categorization.js";
import {
  findLargestFilesToolDefinition,
  handleFindLargestFiles,
} from "../tools/file-analysis.js";
import {
  findDuplicateFilesToolDefinition,
  handleFindDuplicateFiles,
} from "../tools/file-duplicates.js";
import {
  organizeFilesToolDefinition,
  handleOrganizeFiles,
} from "../tools/file-organization.js";
import {
  previewOrganizationToolDefinition,
  handlePreviewOrganization,
} from "../tools/organization-preview.js";
import {
  getCategoriesToolDefinition,
  handleGetCategories,
  setCustomRulesToolDefinition,
  handleSetCustomRules,
} from "../tools/file-management.js";
import {
  analyzeDuplicatesToolDefinition,
  handleAnalyzeDuplicates,
  deleteDuplicatesToolDefinition,
  handleDeleteDuplicates,
} from "../tools/duplicate-management.js";
import {
  undoLastOperationToolDefinition,
  handleUndoLastOperation,
} from "../tools/rollback.js";
import {
  batchRenameToolDefinition,
  handleBatchRename,
} from "../tools/file-renaming.js";
import {
  inspectMetadataToolDefinition,
  handleInspectMetadata,
} from "../tools/metadata-inspection.js";
import {
  organizeMusicToolDefinition,
  handleOrganizeMusic,
} from "../tools/music-organization.js";
import {
  organizePhotosToolDefinition,
  handleOrganizePhotos,
} from "../tools/photo-organization.js";
import {
  organizeByContentToolDefinition,
  handleOrganizeByContent,
} from "../tools/content-organization.js";
import {
  organizeSmartToolDefinition,
  handleOrganizeSmart,
} from "../tools/smart-organization.js";
import {
  smartSuggestToolDefinition,
  handleSmartSuggest,
} from "../tools/smart-suggest.js";
import {
  systemOrganizationToolDefinition,
  handleSystemOrganization,
} from "../tools/system-organization.js";
import {
  batchReadFilesToolDefinition,
  handleBatchReadFiles,
} from "../tools/batch-file-reader.js";
import {
  watchDirectoryToolDefinition,
  handleWatchDirectory,
  unwatchDirectoryToolDefinition,
  handleUnwatchDirectory,
  listWatchesToolDefinition,
  handleListWatches,
} from "../tools/watch.tool.js";
import {
  fileReaderToolDefinition,
  handleReadFile,
} from "../tools/file-reader.tool.js";
import {
  viewHistoryToolDefinition,
  handleViewHistory,
} from "../tools/view-history.js";

function reg(def: ToolDefinition, handler: ToolHandler) {
  return defineTool({
    name: def.name,
    description: def.description,
    title: def.title,
    inputSchema: def.inputSchema,
    annotations: def.annotations,
    handler,
  });
}

const entries = [
  reg(listFilesToolDefinition, handleListFiles),
  reg(scanDirectoryToolDefinition, handleScanDirectory),
  reg(categorizeByTypeToolDefinition, handleCategorizeByType),
  reg(findLargestFilesToolDefinition, handleFindLargestFiles),
  reg(findDuplicateFilesToolDefinition, handleFindDuplicateFiles),
  reg(organizeFilesToolDefinition, handleOrganizeFiles),
  reg(previewOrganizationToolDefinition, handlePreviewOrganization),
  reg(organizeMusicToolDefinition, handleOrganizeMusic),
  reg(organizePhotosToolDefinition, handleOrganizePhotos),
  reg(organizeByContentToolDefinition, handleOrganizeByContent),
  reg(organizeSmartToolDefinition, handleOrganizeSmart),
  reg(smartSuggestToolDefinition, handleSmartSuggest),
  reg(systemOrganizationToolDefinition, handleSystemOrganization),
  reg(batchReadFilesToolDefinition, handleBatchReadFiles),
  reg(getCategoriesToolDefinition, handleGetCategories),
  reg(setCustomRulesToolDefinition, handleSetCustomRules),
  reg(analyzeDuplicatesToolDefinition, handleAnalyzeDuplicates),
  reg(deleteDuplicatesToolDefinition, handleDeleteDuplicates),
  reg(undoLastOperationToolDefinition, handleUndoLastOperation),
  reg(batchRenameToolDefinition, handleBatchRename),
  reg(inspectMetadataToolDefinition, handleInspectMetadata),
  reg(watchDirectoryToolDefinition, handleWatchDirectory),
  reg(unwatchDirectoryToolDefinition, handleUnwatchDirectory),
  reg(listWatchesToolDefinition, handleListWatches),
  reg(fileReaderToolDefinition, handleReadFile),
  reg(viewHistoryToolDefinition, handleViewHistory),
];

export const TOOLS: ToolDefinition[] = entries.map((e) => e.definition);

export const toolHandlers: Map<string, ToolHandler> = new Map(
  entries.map((e) => [e.definition.name, e.handler]),
);

export function getToolHandler(name: string): ToolHandler | undefined {
  return toolHandlers.get(name);
}

export function hasTool(name: string): boolean {
  return toolHandlers.has(name);
}
