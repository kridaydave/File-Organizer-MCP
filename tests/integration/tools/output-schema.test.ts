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
import path from "path";

const tempRoot = path.join(
  process.cwd(),
  "tests",
  "temp",
  `output-schema-${process.pid}`,
);
const tempConfigDir = path.join(tempRoot, "config");

const actualPaths = await import("../../../src/core/config/paths.js");

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
const { handleAnalyzeDuplicates, handleDeleteDuplicates } = await import(
  "../../../src/tools/duplicate-management.js"
);
const { handleOrganizeFiles } = await import(
  "../../../src/tools/file-organization.js"
);
const { handlePreviewOrganization } = await import(
  "../../../src/tools/organization-preview.js"
);
const { handleUndoLastOperation } = await import(
  "../../../src/tools/rollback.js"
);
const {
  findDuplicatesOutputSchema,
  analyzeDuplicatesOutputSchema,
  deleteDuplicatesOutputSchema,
  organizeFilesOutputSchema,
  previewOrganizationOutputSchema,
  undoOutputSchema,
} = await import("../../../src/schemas/output.js");

describe("Tool outputSchema contracts", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = path.join(tempRoot, "sandbox");
    fs.mkdirSync(tempConfigDir, { recursive: true });
    fs.mkdirSync(path.join(tempConfigDir, "rollback"), { recursive: true });
    fs.mkdirSync(path.join(tempConfigDir, "backups"), { recursive: true });
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, "original.txt"), "duplicate content");
    fs.writeFileSync(path.join(testDir, "copy.txt"), "duplicate content");
    fs.writeFileSync(path.join(testDir, "notes.md"), "# notes\n");
  });

  afterAll(async () => {
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
});
