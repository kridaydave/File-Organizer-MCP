import fs from "fs/promises";
import path from "path";
import { jest } from "@jest/globals";
import { handlePreviewOrganization } from "../../../src/tools/organization-preview.js";
import { handleOrganizeFiles } from "../../../src/tools/file-organization.js";
import {
  setupLoggerMocks,
  teardownLoggerMocks,
  mockLogger,
} from "../../utils/logger-mock.js";

describe("Organization Preview Tool - BUG-37", () => {
  let testDir: string;

  beforeEach(async () => {
    setupLoggerMocks();
    const desktopBase = path.join(process.env.USERPROFILE || "", "Desktop");
    testDir = path.join(desktopBase, "test-preview-" + Date.now() + "-" + Math.random().toString(36).slice(2));
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      mockLogger.error("Cleanup error:", error);
    } finally {
      teardownLoggerMocks();
    }
  });

  const createFile = async (relativePath: string, content: string = "test") => {
    const filePath = path.join(testDir, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
    return filePath;
  };

  it("preview total_files equals organize total_files for the same input", async () => {
    await createFile("document.pdf");
    await createFile("image.jpg");
    await createFile("note.txt");

    const previewResult = await handlePreviewOrganization({
      directory: testDir,
      response_format: "json",
    });
    const previewData = JSON.parse(previewResult.content[0].text);

    const organizeResult = await handleOrganizeFiles({
      directory: testDir,
      dry_run: true,
      response_format: "json",
    });
    const organizeData = JSON.parse(organizeResult.content[0].text);

    expect(previewData.summary.total_files).toBe(organizeData.total_files);
  });

  it("preview total_files equals organize total_files including show_conflicts_only case", async () => {
    await createFile("document.pdf");
    await createFile("duplicate.pdf");
    // Create a conflict scenario - put files in same target location
    const docsDir = path.join(testDir, "Documents");
    await fs.mkdir(docsDir, { recursive: true });
    await fs.writeFile(path.join(docsDir, "duplicate.pdf"), "existing");

    const previewResult = await handlePreviewOrganization({
      directory: testDir,
      response_format: "json",
      show_conflicts_only: true,
      conflict_strategy: "rename",
    });
    const previewData = JSON.parse(previewResult.content[0].text);

    const organizeResult = await handleOrganizeFiles({
      directory: testDir,
      dry_run: true,
      response_format: "json",
      conflict_strategy: "rename",
    });
    const organizeData = JSON.parse(organizeResult.content[0].text);

    expect(previewData.summary.total_files).toBe(organizeData.total_files);
  });
});
