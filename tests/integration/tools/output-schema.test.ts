/**
 * Output-schema contract tests.
 *
 * For every tool that declares an `outputSchema`, a real call against a
 * sandbox directory must produce `structuredContent` that validates against
 * that schema. The markdown path must also carry structuredContent: the SDK
 * rejects results from outputSchema-declaring tools that lack it.
 */

import { describe, it, expect, beforeAll, afterAll, jest } from "@jest/globals";
import fs from "fs";
import os from "os";
import path from "path";
import { z } from "zod";
import type { ToolResponse } from "../../../src/mcp/types.js";

// os.tmpdir() rather than a directory under the worktree, which this suite used
// to use: it writes and deletes, and it must not leave anything in the checkout.
// realpathSync because macOS resolves /var to /private/var, and the handlers
// canonicalise before comparing, so a non-canonical fixture path would not match.
const tempRoot = fs.mkdtempSync(
  path.join(fs.realpathSync(os.tmpdir()), "output-schema-"),
);
const tempConfigDir = path.join(tempRoot, "config");

const actualPaths = await import("../../../src/core/config/paths.js");
const { CONFIG } = await import("../../../src/core/config/defaults.js");

jest.unstable_mockModule("../../../src/core/config/paths.js", () => ({
  ...actualPaths,
  getUserConfigPath: () => path.join(tempConfigDir, "config.json"),
  getHistoryFilePath: () => path.join(tempConfigDir, "history.jsonl"),
  getRollbackDirectory: () => path.join(tempConfigDir, "rollback"),
  getBackupDirectory: () => path.join(tempConfigDir, "backups"),
}));

const { handleFindDuplicateFiles } = await import(
  "../../../src/tools/file-duplicates.js"
);
const {
  handleAnalyzeDuplicates,
  handleDeleteDuplicates,
  handlePreviewDeleteDuplicates,
} = await import("../../../src/tools/duplicate-management.js");
const { handleOrganizeFiles } = await import(
  "../../../src/tools/file-organization.js"
);
const { handlePreviewOrganization, handleValidateOrganizationPlan } =
  await import("../../../src/tools/organization-preview.js");
const { handleUndoLastOperation, handleVerifyIntegrity } = await import(
  "../../../src/tools/rollback.js"
);
const { handleDoctor } = await import("../../../src/tools/doctor.js");
const { handleExportReport } = await import("../../../src/tools/export-report.js");
const { handleExportConfig } = await import(
  "../../../src/tools/file-management.js"
);
const {
  handleFindEmptyDirectories,
  handleDiskUsageByCategory,
} = await import("../../../src/tools/file-analysis.js");
const { handleBatchRename } = await import(
  "../../../src/tools/file-renaming.js"
);
const { handleQuarantineFiles, handleRestoreQuarantine } = await import(
  "../../../src/tools/file-quarantine.js"
);
const { handleSensitiveScan } = await import(
  "../../../src/tools/sensitive-scan.js"
);
const { handleFindBrokenSymlinks } = await import(
  "../../../src/tools/symlink-audit.js"
);
const { TOOLS } = await import("../../../src/mcp/registry.js");
const {
  findDuplicatesOutputSchema,
  analyzeDuplicatesOutputSchema,
  deleteDuplicatesOutputSchema,
  previewDeleteDuplicatesOutputSchema,
  organizeFilesOutputSchema,
  previewOrganizationOutputSchema,
  validateOrganizationPlanOutputSchema,
  undoOutputSchema,
  verifyIntegrityOutputSchema,
  doctorOutputSchema,
  exportReportOutputSchema,
  exportConfigOutputSchema,
  findEmptyDirectoriesOutputSchema,
  diskUsageByCategoryOutputSchema,
  batchRenameOutputSchema,
  quarantineFilesOutputSchema,
  restoreQuarantineOutputSchema,
  sensitiveScanOutputSchema,
  findBrokenSymlinksOutputSchema,
} = await import("../../../src/schemas/output.js");
const {
  findDuplicatesOutputJsonSchema,
  analyzeDuplicatesOutputJsonSchema,
  deleteDuplicatesOutputJsonSchema,
  previewDeleteDuplicatesOutputJsonSchema,
  organizeFilesOutputJsonSchema,
  previewOrganizationOutputJsonSchema,
  validateOrganizationPlanOutputJsonSchema,
  undoOutputJsonSchema,
  verifyIntegrityOutputJsonSchema,
  doctorOutputJsonSchema,
  findEmptyDirectoriesOutputJsonSchema,
  findBrokenSymlinksOutputJsonSchema,
  batchRenameOutputJsonSchema,
  diskUsageByCategoryOutputJsonSchema,
  quarantineFilesOutputJsonSchema,
  restoreQuarantineOutputJsonSchema,
  exportConfigOutputJsonSchema,
  exportReportOutputJsonSchema,
  sensitiveScanOutputJsonSchema,
} = await import("../../../src/schemas/output.js");

/**
 * Every tool this file drives, as its registered name.
 *
 * A tool declaring an `outputSchema` is a wire contract: the client reads the
 * advertised JSON Schema and parses `structuredContent` against it. Nothing in
 * the type system ties the two together, because both sides are typed against
 * each other already and the SDK only validates on the paths it happens to walk.
 * So the coverage is asserted rather than trusted. `the registry and this file
 * agree` below fails the moment a tool gains an outputSchema without a test
 * here, which is the whole point: a missing case is a silent hole otherwise.
 */
const COVERED_TOOLS = new Set<string>([
  "file_organizer_analyze_duplicates",
  "file_organizer_batch_rename",
  "file_organizer_delete_duplicates",
  "file_organizer_disk_usage_by_category",
  "file_organizer_doctor",
  "file_organizer_export_config",
  "file_organizer_export_report",
  "file_organizer_find_broken_symlinks",
  "file_organizer_find_duplicate_files",
  "file_organizer_find_empty_directories",
  "file_organizer_organize_files",
  "file_organizer_preview_delete_duplicates",
  "file_organizer_preview_organization",
  "file_organizer_quarantine_files",
  "file_organizer_restore_quarantine",
  "file_organizer_sensitive_scan",
  "file_organizer_undo_last_operation",
  "file_organizer_validate_organization_plan",
  "file_organizer_verify_integrity",
]);

/**
 * Each tool's Zod schema and the JSON schema object its definition registers.
 *
 * The safeParse assertions in this file run against the Zod schemas; the wire
 * contract is the `outputSchema` on the ToolDefinition. Those only stay the
 * same because schemas/output.ts derives each `*OutputJsonSchema` from the
 * Zod schema and each tool attaches that object by import. The identity test
 * below pins the whole chain including the derivation, so neither a
 * hand-written blob on a definition nor a hand-written const in output.ts can
 * drift from the Zod schema silently.
 */
const SCHEMAS_BY_TOOL: Record<string, [z.ZodType, unknown]> = {
  file_organizer_analyze_duplicates: [
    analyzeDuplicatesOutputSchema,
    analyzeDuplicatesOutputJsonSchema,
  ],
  file_organizer_batch_rename: [
    batchRenameOutputSchema,
    batchRenameOutputJsonSchema,
  ],
  file_organizer_delete_duplicates: [
    deleteDuplicatesOutputSchema,
    deleteDuplicatesOutputJsonSchema,
  ],
  file_organizer_disk_usage_by_category: [
    diskUsageByCategoryOutputSchema,
    diskUsageByCategoryOutputJsonSchema,
  ],
  file_organizer_doctor: [doctorOutputSchema, doctorOutputJsonSchema],
  file_organizer_export_config: [
    exportConfigOutputSchema,
    exportConfigOutputJsonSchema,
  ],
  file_organizer_export_report: [
    exportReportOutputSchema,
    exportReportOutputJsonSchema,
  ],
  file_organizer_find_broken_symlinks: [
    findBrokenSymlinksOutputSchema,
    findBrokenSymlinksOutputJsonSchema,
  ],
  file_organizer_find_duplicate_files: [
    findDuplicatesOutputSchema,
    findDuplicatesOutputJsonSchema,
  ],
  file_organizer_find_empty_directories: [
    findEmptyDirectoriesOutputSchema,
    findEmptyDirectoriesOutputJsonSchema,
  ],
  file_organizer_organize_files: [
    organizeFilesOutputSchema,
    organizeFilesOutputJsonSchema,
  ],
  file_organizer_preview_delete_duplicates: [
    previewDeleteDuplicatesOutputSchema,
    previewDeleteDuplicatesOutputJsonSchema,
  ],
  file_organizer_preview_organization: [
    previewOrganizationOutputSchema,
    previewOrganizationOutputJsonSchema,
  ],
  file_organizer_quarantine_files: [
    quarantineFilesOutputSchema,
    quarantineFilesOutputJsonSchema,
  ],
  file_organizer_restore_quarantine: [
    restoreQuarantineOutputSchema,
    restoreQuarantineOutputJsonSchema,
  ],
  file_organizer_sensitive_scan: [
    sensitiveScanOutputSchema,
    sensitiveScanOutputJsonSchema,
  ],
  file_organizer_undo_last_operation: [
    undoOutputSchema,
    undoOutputJsonSchema,
  ],
  file_organizer_validate_organization_plan: [
    validateOrganizationPlanOutputSchema,
    validateOrganizationPlanOutputJsonSchema,
  ],
  file_organizer_verify_integrity: [
    verifyIntegrityOutputSchema,
    verifyIntegrityOutputJsonSchema,
  ],
};

describe("Tool outputSchema contracts", () => {
  let testDir: string;
  let originalCustomAllowed: string[];

  beforeAll(async () => {
    testDir = path.join(tempRoot, "sandbox");
    fs.mkdirSync(tempConfigDir, { recursive: true });
    fs.mkdirSync(path.join(tempConfigDir, "rollback"), { recursive: true });
    fs.mkdirSync(path.join(tempConfigDir, "backups"), { recursive: true });
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, "original.txt"), "duplicate content");
    fs.writeFileSync(path.join(testDir, "copy.txt"), "duplicate content");
    fs.writeFileSync(path.join(testDir, "notes.md"), "# notes\n");

    // Grant the sandbox explicitly. Path validation runs in whitelist mode and
    // checks CONFIG.paths, which lists the user's home directories and nothing
    // else. A fixture under os.tmpdir() is outside all of them, so every call
    // here would be refused with "Path is outside allowed directories". While
    // this fixture lived under tests/temp it passed only because the checkout
    // happened to sit inside one of those home directories, which is a property
    // of the machine rather than of the test. Set it explicitly and restored in
    // afterAll, the way the other suites that use os.tmpdir() do.
    originalCustomAllowed = CONFIG.paths.customAllowed;
    CONFIG.paths.customAllowed = [...originalCustomAllowed, tempRoot];
  });

  afterAll(async () => {
    CONFIG.paths.customAllowed = originalCustomAllowed;
    await new Promise((r) => setTimeout(r, 100));
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("find_duplicate_files returns matching structuredContent", async () => {
    const res = await handleFindDuplicateFiles({
      directory: testDir,
      response_format: "json",
    });
    const parsed = findDuplicatesOutputSchema.safeParse(res.structuredContent);
    expect(parsed.success).toBe(true);
  });

  it("analyze_duplicates returns matching structuredContent", async () => {
    const res = await handleAnalyzeDuplicates({
      directory: testDir,
      response_format: "json",
    });
    const parsed = analyzeDuplicatesOutputSchema.safeParse(
      res.structuredContent,
    );
    expect(parsed.success).toBe(true);
  });

  it("preview_organization returns matching structuredContent", async () => {
    const res = await handlePreviewOrganization({
      directory: testDir,
      response_format: "json",
    });
    const parsed = previewOrganizationOutputSchema.safeParse(
      res.structuredContent,
    );
    expect(parsed.success).toBe(true);
  });

  it("organize_files dry run returns matching structuredContent", async () => {
    const res = await handleOrganizeFiles({
      directory: testDir,
      dry_run: true,
      response_format: "json",
    });
    const parsed = organizeFilesOutputSchema.safeParse(res.structuredContent);
    expect(parsed.success).toBe(true);
  });

  it("delete_duplicates and undo return matching structuredContent", async () => {
    const res = await handleDeleteDuplicates({
      files_to_delete: [path.join(testDir, "copy.txt")],
      response_format: "json",
    });
    const parsed = deleteDuplicatesOutputSchema.safeParse(
      res.structuredContent,
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const manifestId = parsed.data.manifest_id;
    expect(manifestId).not.toBeNull();

    const undo = await handleUndoLastOperation({
      manifest_id: manifestId,
      response_format: "json",
    });
    const undoParsed = undoOutputSchema.safeParse(undo.structuredContent);
    expect(undoParsed.success).toBe(true);
  });

  it("markdown responses still include structuredContent", async () => {
    const res = await handlePreviewOrganization({ directory: testDir });
    expect(res.structuredContent).toBeDefined();
    const parsed = previewOrganizationOutputSchema.safeParse(
      res.structuredContent,
    );
    expect(parsed.success).toBe(true);
  });

  it("doctor returns matching structuredContent", async () => {
    const res = await handleDoctor({ response_format: "json" });
    expect(doctorOutputSchema.safeParse(res.structuredContent).success).toBe(
      true,
    );
  });

  it("find_empty_directories returns matching structuredContent", async () => {
    const res = await handleFindEmptyDirectories({
      directory: testDir,
      response_format: "json",
    });
    expect(
      findEmptyDirectoriesOutputSchema.safeParse(res.structuredContent)
        .success,
    ).toBe(true);
  });

  it("disk_usage_by_category returns matching structuredContent", async () => {
    const res = await handleDiskUsageByCategory({
      directory: testDir,
      response_format: "json",
    });
    expect(
      diskUsageByCategoryOutputSchema.safeParse(res.structuredContent).success,
    ).toBe(true);
  });

  it("find_broken_symlinks returns matching structuredContent", async () => {
    const res = await handleFindBrokenSymlinks({
      directory: testDir,
      response_format: "json",
    });
    expect(
      findBrokenSymlinksOutputSchema.safeParse(res.structuredContent).success,
    ).toBe(true);
  });

  it("sensitive_scan returns matching structuredContent", async () => {
    const res = await handleSensitiveScan({
      directory: testDir,
      response_format: "json",
    });
    expect(
      sensitiveScanOutputSchema.safeParse(res.structuredContent).success,
    ).toBe(true);
  });

  it("export_report without output_path writes nothing and still matches", async () => {
    const res = await handleExportReport({
      directory: testDir,
      response_format: "json",
    });
    expect(
      exportReportOutputSchema.safeParse(res.structuredContent).success,
    ).toBe(true);
  });

  it("export_config returns matching structuredContent", async () => {
    const res = await handleExportConfig({ response_format: "json" });
    expect(
      exportConfigOutputSchema.safeParse(res.structuredContent).success,
    ).toBe(true);
  });

  it("preview_delete_duplicates returns matching structuredContent", async () => {
    const res = await handlePreviewDeleteDuplicates({
      directory: testDir,
      response_format: "json",
    });
    expect(
      previewDeleteDuplicatesOutputSchema.safeParse(res.structuredContent)
        .success,
    ).toBe(true);
  });

  it("batch_rename dry run returns matching structuredContent", async () => {
    const res = await handleBatchRename({
      directory: testDir,
      rules: [{ type: "find_replace", find: "notes", replace: "notes-copy" }],
      dry_run: true,
      response_format: "json",
    });
    expect(
      batchRenameOutputSchema.safeParse(res.structuredContent).success,
    ).toBe(true);
  });

  it("validate_organization_plan returns matching structuredContent", async () => {
    const res = await handleValidateOrganizationPlan({
      directory: testDir,
      response_format: "json",
    });
    expect(
      validateOrganizationPlanOutputSchema.safeParse(res.structuredContent)
        .success,
    ).toBe(true);
  });

  it("verify_integrity returns matching structuredContent", async () => {
    // Needs a manifest on disk, or it answers "nothing to verify" as an error,
    // and an error response carries no structuredContent by contract.
    const res = await handleDeleteDuplicates({
      files_to_delete: [path.join(testDir, "copy.txt")],
      response_format: "json",
    });
    expect(
      deleteDuplicatesOutputSchema.safeParse(res.structuredContent).success,
    ).toBe(true);

    const integrity = await handleVerifyIntegrity({ response_format: "json" });
    expect(
      verifyIntegrityOutputSchema.safeParse(integrity.structuredContent)
        .success,
    ).toBe(true);
  });

  it("quarantine_files and restore_quarantine return matching structuredContent", async () => {
    const victim = path.join(testDir, "quarantine-me.txt");
    fs.writeFileSync(victim, "quarantine me");

    // dry_run defaults to true for both, and a dry run writes no manifest for
    // restore_quarantine to find.
    const quarantined = await handleQuarantineFiles({
      directory: testDir,
      files: [victim],
      dry_run: false,
      response_format: "json",
    });
    const parsed = quarantineFilesOutputSchema.safeParse(
      quarantined.structuredContent,
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const restored = await handleRestoreQuarantine({
      manifest_id: parsed.data.manifest_id,
      dry_run: false,
      response_format: "json",
    });
    expect(
      restoreQuarantineOutputSchema.safeParse(restored.structuredContent)
        .success,
    ).toBe(true);
  });

  it("every tool declaring an outputSchema is driven by this file", () => {
    const declaring = TOOLS.filter((t) => t.outputSchema !== undefined).map(
      (t) => t.name,
    );

    // Assert the registry side is non-empty first: a filter that matched
    // nothing would make the comparison below pass for the wrong reason.
    expect(declaring.length).toBeGreaterThan(0);

    const uncovered = declaring.filter((name) => !COVERED_TOOLS.has(name));
    expect(uncovered).toEqual([]);

    // The other direction too, so a stale entry cannot mask a removed tool.
    const stale = [...COVERED_TOOLS].filter((name) => !declaring.includes(name));
    expect(stale).toEqual([]);
  });

  it("every outputSchema tool registers the JSON conversion of its own Zod schema", () => {
    // The map must track COVERED_TOOLS exactly, or the loop below silently
    // skips a tool the safeParse tests cover.
    expect(Object.keys(SCHEMAS_BY_TOOL).sort()).toEqual(
      [...COVERED_TOOLS].sort(),
    );

    const violations: string[] = [];
    for (const [name, [zodSchema, jsonSchema]] of Object.entries(
      SCHEMAS_BY_TOOL,
    )) {
      const tool = TOOLS.find((t) => t.name === name);
      if (tool === undefined) {
        violations.push(`${name}: registered in this file, not in the registry`);
      } else if (tool.outputSchema !== jsonSchema) {
        violations.push(
          `${name}: def.outputSchema is not the exported JSON schema object`,
        );
      } else {
        // Same serialization both sides: the const must literally be the
        // z.toJSONSchema conversion of its Zod schema, not a lookalike.
        const derived = z.toJSONSchema(zodSchema);
        if (JSON.stringify(jsonSchema) !== JSON.stringify(derived)) {
          violations.push(
            `${name}: exported JSON schema is not z.toJSONSchema of its Zod schema`,
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });

  // The SDK rejects a result from an outputSchema-declaring tool that carries
  // no structuredContent, so the markdown path must produce it too, and it
  // must parse. That constraint is per tool; driving one tool (as the single
  // markdown test above does) proves the plumbing, not the other eighteen.
  describe("markdown responses still carry structuredContent", () => {
    const stateless: Array<[string, () => Promise<ToolResponse>, z.ZodType]> = [
      [
        "find_duplicate_files",
        () =>
          handleFindDuplicateFiles({
            directory: testDir,
            response_format: "markdown",
          }),
        findDuplicatesOutputSchema,
      ],
      [
        "analyze_duplicates",
        () =>
          handleAnalyzeDuplicates({
            directory: testDir,
            response_format: "markdown",
          }),
        analyzeDuplicatesOutputSchema,
      ],
      [
        "preview_organization",
        () =>
          handlePreviewOrganization({
            directory: testDir,
            response_format: "markdown",
          }),
        previewOrganizationOutputSchema,
      ],
      [
        "organize_files",
        () =>
          handleOrganizeFiles({
            directory: testDir,
            dry_run: true,
            response_format: "markdown",
          }),
        organizeFilesOutputSchema,
      ],
      [
        "doctor",
        () => handleDoctor({ response_format: "markdown" }),
        doctorOutputSchema,
      ],
      [
        "find_empty_directories",
        () =>
          handleFindEmptyDirectories({
            directory: testDir,
            response_format: "markdown",
          }),
        findEmptyDirectoriesOutputSchema,
      ],
      [
        "disk_usage_by_category",
        () =>
          handleDiskUsageByCategory({
            directory: testDir,
            response_format: "markdown",
          }),
        diskUsageByCategoryOutputSchema,
      ],
      [
        "find_broken_symlinks",
        () =>
          handleFindBrokenSymlinks({
            directory: testDir,
            response_format: "markdown",
          }),
        findBrokenSymlinksOutputSchema,
      ],
      [
        "sensitive_scan",
        () =>
          handleSensitiveScan({
            directory: testDir,
            response_format: "markdown",
          }),
        sensitiveScanOutputSchema,
      ],
      [
        "export_report",
        () =>
          handleExportReport({
            directory: testDir,
            response_format: "markdown",
          }),
        exportReportOutputSchema,
      ],
      [
        "export_config",
        () => handleExportConfig({ response_format: "markdown" }),
        exportConfigOutputSchema,
      ],
      [
        "preview_delete_duplicates",
        () =>
          handlePreviewDeleteDuplicates({
            directory: testDir,
            response_format: "markdown",
          }),
        previewDeleteDuplicatesOutputSchema,
      ],
      [
        "batch_rename",
        () =>
          handleBatchRename({
            directory: testDir,
            rules: [{ type: "find_replace", find: "notes", replace: "copy" }],
            dry_run: true,
            response_format: "markdown",
          }),
        batchRenameOutputSchema,
      ],
      [
        "validate_organization_plan",
        () =>
          handleValidateOrganizationPlan({
            directory: testDir,
            response_format: "markdown",
          }),
        validateOrganizationPlanOutputSchema,
      ],
    ];

    it.each(stateless)(
      "%s answers markdown with parseable structuredContent",
      async (_name, drive, schema) => {
        const res = await drive();
        expect(res.structuredContent).toBeDefined();
        expect(schema.safeParse(res.structuredContent).success).toBe(true);
      },
    );

    it("delete_duplicates, verify_integrity, and undo answer markdown with parseable structuredContent", async () => {
      // The json pass above deleted copy.txt; recreate it so this chain has a
      // duplicate to remove.
      fs.writeFileSync(path.join(testDir, "copy.txt"), "duplicate content");

      const deleted = await handleDeleteDuplicates({
        files_to_delete: [path.join(testDir, "copy.txt")],
        response_format: "markdown",
      });
      const parsed = deleteDuplicatesOutputSchema.safeParse(
        deleted.structuredContent,
      );
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      // While the delete's manifest is the newest one on disk, and before the
      // undo consumes the state, mirror the json suite's proven ordering.
      const integrity = await handleVerifyIntegrity({
        response_format: "markdown",
      });
      expect(
        verifyIntegrityOutputSchema.safeParse(integrity.structuredContent)
          .success,
      ).toBe(true);

      const undo = await handleUndoLastOperation({
        manifest_id: parsed.data.manifest_id,
        response_format: "markdown",
      });
      expect(undoOutputSchema.safeParse(undo.structuredContent).success).toBe(
        true,
      );
    });

    it("quarantine_files and restore_quarantine answer markdown with parseable structuredContent", async () => {
      const victim = path.join(testDir, "markdown-quarantine.txt");
      fs.writeFileSync(victim, "quarantine me too");

      const quarantined = await handleQuarantineFiles({
        directory: testDir,
        files: [victim],
        dry_run: false,
        response_format: "markdown",
      });
      const parsed = quarantineFilesOutputSchema.safeParse(
        quarantined.structuredContent,
      );
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const restored = await handleRestoreQuarantine({
        manifest_id: parsed.data.manifest_id,
        dry_run: false,
        response_format: "markdown",
      });
      expect(
        restoreQuarantineOutputSchema.safeParse(restored.structuredContent)
          .success,
      ).toBe(true);
    });
  });
});
