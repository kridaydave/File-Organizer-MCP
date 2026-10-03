/**
 * Tool Registry — single source of truth for TOOLS + handler map
 *
 * Adding a tool = create src/tools/my-tool.ts exporting its
 * ToolDefinition + handler (typed args, optional ToolContext), then add one
 * import + one reg() entry here. No other file needs touching: schemas live
 * in src/schemas/, and server.ts routes purely through this registry.
 *
 * Deliberately explicit (no fs auto-discovery): import.meta.glob is Vite-only,
 * fs-scanning dist/ at runtime trades a one-line edit for invisible wiring.
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
diskUsageByCategoryToolDefinition,
  handleDiskUsageByCategory,
  findOldFilesToolDefinition,
  handleFindOldFiles,
  findEmptyDirectoriesToolDefinition,
  handleFindEmptyDirectories,
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
  previewDeleteDuplicatesToolDefinition,
  handlePreviewDeleteDuplicates,
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
  fileReaderToolDefinition,
  handleReadFile,
} from "../tools/file-reader.tool.js";
import {
  searchHistoryToolDefinition,
  handleSearchHistory,
  viewHistoryToolDefinition,
  handleViewHistory,
} from "../tools/view-history.js";
import {
  organizeByProjectToolDefinition,
  handleOrganizeByProject,
} from "../tools/project-organization.js";
import { doctorToolDefinition, handleDoctor } from "../tools/doctor.js";
import {
  findBrokenSymlinksToolDefinition,
  handleFindBrokenSymlinks,
} from "../tools/symlink-audit.js";
import {
  quarantineFilesToolDefinition,
  handleQuarantineFiles,
  restoreQuarantineToolDefinition,
  handleRestoreQuarantine,
} from "../tools/file-quarantine.js";

function reg(def: ToolDefinition, handler: ToolHandler) {
  return defineTool({
    name: def.name,
    description: def.description,
    title: def.title,
    inputSchema: def.inputSchema,
    annotations: def.annotations,
    outputSchema: def.outputSchema,
    handler,
  });
}

// Sorted by tool name, not by when the tool was added. Two people adding
// different tools at the same time then insert at different coordinates
// instead of the same one, so their branches merge instead of colliding.
// Sorted by tool name, not by when the tool was added. Two people adding
// different tools at the same time then insert at different coordinates
// instead of the same one, so their branches merge instead of colliding.
const entries = [
  reg(analyzeDuplicatesToolDefinition, handleAnalyzeDuplicates),
  reg(batchReadFilesToolDefinition, handleBatchReadFiles),
  reg(batchRenameToolDefinition, handleBatchRename),
  reg(categorizeByTypeToolDefinition, handleCategorizeByType),
  reg(deleteDuplicatesToolDefinition, handleDeleteDuplicates),
  reg(diskUsageByCategoryToolDefinition, handleDiskUsageByCategory),
  reg(doctorToolDefinition, handleDoctor),
  reg(fileReaderToolDefinition, handleReadFile),
  reg(findBrokenSymlinksToolDefinition, handleFindBrokenSymlinks),
  reg(findDuplicateFilesToolDefinition, handleFindDuplicateFiles),
  reg(findEmptyDirectoriesToolDefinition, handleFindEmptyDirectories),
  reg(findLargestFilesToolDefinition, handleFindLargestFiles),
  reg(findOldFilesToolDefinition, handleFindOldFiles),
  reg(getCategoriesToolDefinition, handleGetCategories),
  reg(inspectMetadataToolDefinition, handleInspectMetadata),
  reg(listFilesToolDefinition, handleListFiles),
  reg(organizeByProjectToolDefinition, handleOrganizeByProject),
  reg(organizeFilesToolDefinition, handleOrganizeFiles),
  reg(organizeMusicToolDefinition, handleOrganizeMusic),
  reg(organizePhotosToolDefinition, handleOrganizePhotos),
  reg(previewDeleteDuplicatesToolDefinition, handlePreviewDeleteDuplicates),
  reg(previewOrganizationToolDefinition, handlePreviewOrganization),
  reg(quarantineFilesToolDefinition, handleQuarantineFiles),
  reg(restoreQuarantineToolDefinition, handleRestoreQuarantine),
  reg(scanDirectoryToolDefinition, handleScanDirectory),
  reg(searchHistoryToolDefinition, handleSearchHistory),
  reg(setCustomRulesToolDefinition, handleSetCustomRules),
  reg(smartSuggestToolDefinition, handleSmartSuggest),
  reg(systemOrganizationToolDefinition, handleSystemOrganization),
  reg(undoLastOperationToolDefinition, handleUndoLastOperation),
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
