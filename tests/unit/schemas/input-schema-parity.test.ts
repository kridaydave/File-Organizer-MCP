/**
 * Two schemas per tool, only one checked - until now.
 *
 * Every tool definition carries a hand-written JSON `inputSchema` next to its
 * Zod input schema. The Zod schema is what the handler parses with; the JSON
 * one is the contract the MCP client reads off the wire. Nothing kept them in
 * step: add a field to Zod only and the server rejects a call the client was
 * told it could make; add it to JSON only and the client cannot see a field
 * the server honours. `bun check` sees only the Zod side, the build never
 * looks at the JSON side.
 *
 * This test asserts the two declare the same top-level field set for every
 * registered tool. The SCHEMAS map is a ledger: the assertion below it fails
 * when a registered tool is missing from the map, so a new tool cannot land
 * without declaring both sides here.
 */

import { describe, expect, it } from "@jest/globals";
import { z } from "zod";
import { TOOLS } from "../../../src/mcp/registry.js";
import * as scan from "../../../src/schemas/scan.js";
import * as organize from "../../../src/schemas/organize.js";
import * as system from "../../../src/schemas/system.js";
import * as watch from "../../../src/extensions/scheduler/watch.schemas.js";

const SCHEMAS: Record<string, z.ZodType> = {
  file_organizer_analyze_duplicates: scan.AnalyzeDuplicatesInputSchema,
  file_organizer_batch_read_files: scan.BatchReadFilesInputSchema,
  file_organizer_batch_rename: organize.BatchRenameInputSchema,
  file_organizer_categorize_by_type: scan.CategorizeByTypeInputSchema,
  file_organizer_delete_duplicates: scan.DeleteDuplicatesInputSchema,
  file_organizer_disk_usage_by_category: scan.DiskUsageByCategoryInputSchema,
  file_organizer_doctor: system.DoctorInputSchema,
  file_organizer_export_config: system.ExportConfigInputSchema,
  file_organizer_export_report: system.ExportReportInputSchema,
  file_organizer_find_broken_symlinks: scan.FindBrokenSymlinksInputSchema,
  file_organizer_find_duplicate_files: scan.FindDuplicateFilesInputSchema,
  file_organizer_find_empty_directories: scan.FindEmptyDirectoriesInputSchema,
  file_organizer_find_largest_files: scan.FindLargestFilesInputSchema,
  file_organizer_find_old_files: scan.FindOldFilesInputSchema,
  file_organizer_get_categories: system.GetCategoriesInputSchema,
  file_organizer_inspect_metadata: scan.InspectMetadataInputSchema,
  file_organizer_list_files: scan.ListFilesInputSchema,
  file_organizer_list_watches: watch.ListWatchesInputSchema,
  file_organizer_organize_by_date: organize.OrganizeByDateInputSchema,
  file_organizer_organize_by_project: organize.OrganizeByProjectInputSchema,
  file_organizer_organize_files: organize.OrganizeFilesInputSchema,
  file_organizer_organizer_digest: system.OrganizerDigestInputSchema,
  file_organizer_organize_music: organize.OrganizeMusicInputSchema,
  file_organizer_organize_photos: organize.OrganizePhotosInputSchema,
  file_organizer_preview_delete_duplicates: scan.PreviewDeleteDuplicatesInputSchema,
  file_organizer_preview_organization: organize.PreviewOrganizationInputSchema,
  file_organizer_quarantine_files: organize.QuarantineFilesInputSchema,
  file_organizer_read_file: scan.ReadFileInputSchema,
  file_organizer_restore_quarantine: organize.RestoreQuarantineInputSchema,
  file_organizer_scan_directory: scan.ScanDirectoryInputSchema,
  file_organizer_search_history: system.SearchHistoryInputSchema,
  file_organizer_sensitive_scan: scan.SensitiveScanInputSchema,
  file_organizer_set_custom_rules: system.SetCustomRulesInputSchema,
  file_organizer_smart_suggest: organize.SmartSuggestInputSchema,
  file_organizer_system_organize: organize.SystemOrganizationInputSchema,
  file_organizer_undo_last_operation: organize.UndoLastOperationInputSchema,
  file_organizer_unwatch_directory: watch.UnwatchDirectoryInputSchema,
  file_organizer_validate_organization_plan: organize.ValidateOrganizationPlanInputSchema,
  file_organizer_verify_integrity: organize.VerifyIntegrityInputSchema,
  file_organizer_view_history: system.ViewHistoryInputSchema,
  file_organizer_watch_directory: watch.WatchDirectoryInputSchema,
  file_organizer_watch_status: system.WatchStatusInputSchema,
};

/** Top-level fields the Zod schema would accept, via Zod 4's JSON Schema conversion. */
function zodFields(schema: z.ZodType): string[] {
  // io:"input" reads the pipe's input side: a few schemas validate an object
  // and then transform it, and the fields the client must send live before the
  // transform, not after. unrepresentable:"any" lets those transforms through
  // the conversion instead of throwing, since only the field names matter here.
  return Object.keys(z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }).properties ?? {}).sort();
}

function wireFields(def: (typeof TOOLS)[number]): string[] {
  return Object.keys(def.inputSchema.properties).sort();
}

describe("input schema parity: hand-written JSON vs Zod", () => {
  it("every registered tool has a Zod schema in the ledger", () => {
    const ledgered = new Set(Object.keys(SCHEMAS));
    const missing = TOOLS.filter((t) => !ledgered.has(t.name)).map((t) => t.name);
    expect(missing).toEqual([]);
  });

  it("every ledger entry is a registered tool", () => {
    const registered = new Set(TOOLS.map((t) => t.name));
    const stale = Object.keys(SCHEMAS).filter((name) => !registered.has(name));
    expect(stale).toEqual([]);
  });

  it("JSON inputSchema and Zod schema declare the same fields", () => {
    const drift: Array<{ tool: string; jsonOnly: string[]; zodOnly: string[] }> = [];
    for (const definition of TOOLS) {
      const schema = SCHEMAS[definition.name];
      if (!schema) continue;
      const json = wireFields(definition);
      const zod = zodFields(schema);
      const jsonOnly = json.filter((f) => !zod.includes(f));
      const zodOnly = zod.filter((f) => !json.includes(f));
      if (jsonOnly.length > 0 || zodOnly.length > 0) {
        drift.push({ tool: definition.name, jsonOnly, zodOnly });
      }
    }
    expect(drift).toEqual([]);
  });
});
