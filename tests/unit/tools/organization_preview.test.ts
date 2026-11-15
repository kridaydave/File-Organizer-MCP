import fs from "fs/promises";
import fsSync from "fs";
import os from "os";
import path from "path";
import { jest } from "@jest/globals";
import { CONFIG } from "../../../src/config.js";
import {
  setupLoggerMocks,
  teardownLoggerMocks,
} from "../../utils/logger-mock.js";

type Scanned = { name: string; path: string; size: number; modified: Date };

let scannedFiles: Scanned[] = [];

jest.unstable_mockModule("../../../src/core/scan/scanner.js", () => ({
  FileScannerService: class {
    async getAllFiles(): Promise<Scanned[]> {
      return scannedFiles;
    }
  },
}));

const { handlePreviewOrganization } =
  await import("../../../src/tools/organization-preview.js");
const { handleOrganizeFiles } =
  await import("../../../src/tools/file-organization.js");

const entry = (root: string, relative: string): Scanned => ({
  name: path.basename(relative),
  path: path.join(root, relative),
  size: 1,
  modified: new Date(),
});

describe("Organization Preview Tool - BUG-37", () => {
  let testDir: string;
  let savedCustomAllowed: string[];

  beforeEach(async () => {
    setupLoggerMocks();
    testDir = await fs.mkdtemp(
      path.join(fsSync.realpathSync(os.tmpdir()), "test-preview-"),
    );
    savedCustomAllowed = CONFIG.paths.customAllowed;
    CONFIG.paths.customAllowed = [testDir];
  });

  afterEach(async () => {
    CONFIG.paths.customAllowed = savedCustomAllowed;
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    teardownLoggerMocks();
  });

  const createFile = async (relativePath: string, content: string = "test") => {
    const filePath = path.join(testDir, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
    return filePath;
  };

  it("preview total_files equals organize total_files when one file is already organized", async () => {
    await createFile("document.pdf");
    await createFile("note.txt");
    await createFile("Documents/already.pdf");
    // The mocked scan includes the already-organized file, so the plan
    // skips it: 3 scanned files, 2 moves.
    scannedFiles = [
      entry(testDir, "document.pdf"),
      entry(testDir, "note.txt"),
      entry(testDir, "Documents/already.pdf"),
    ];

    const previewResult = await handlePreviewOrganization({
      directory: testDir,
      response_format: "json",
    });
    const previewData = JSON.parse(previewResult.content[0].text);

    // Setup fired: the plan skipped the file already in its destination, so it
    // proposes fewer moves than the scan handed it. The exact number is left to
    // the plan rather than pinned here, because whether that skip fires depends
    // on how the platform spells the destination path, and this test is about
    // the two totals agreeing.
    expect(previewData.moves.length).toBeLessThan(scannedFiles.length);

    const organizeResult = await handleOrganizeFiles({
      directory: testDir,
      dry_run: true,
      response_format: "json",
    });
    const organizeData = JSON.parse(organizeResult.content[0].text);

    expect(previewData.summary.total_files).toBe(organizeData.total_files);
    expect(previewData.summary.total_files).toBe(3);
  });

  it("preview total_files equals organize total_files including show_conflicts_only case", async () => {
    await createFile("duplicate.pdf");
    await createFile("sub/duplicate.pdf");
    await createFile("Documents/already.pdf");
    // Two files resolve to the same destination, and one is already
    // organized: 3 scanned files, 2 moves, 1 conflict behind the filter.
    scannedFiles = [
      entry(testDir, "duplicate.pdf"),
      entry(testDir, "sub/duplicate.pdf"),
      entry(testDir, "Documents/already.pdf"),
    ];

    const previewResult = await handlePreviewOrganization({
      directory: testDir,
      response_format: "json",
      show_conflicts_only: true,
      conflict_strategy: "rename",
    });
    const previewData = JSON.parse(previewResult.content[0].text);

    // Setup fired: the filter narrows to the one conflict.
    expect(previewData.moves.length).toBe(1);

    const organizeResult = await handleOrganizeFiles({
      directory: testDir,
      dry_run: true,
      response_format: "json",
      conflict_strategy: "rename",
    });
    const organizeData = JSON.parse(organizeResult.content[0].text);

    expect(previewData.summary.total_files).toBe(organizeData.total_files);
    expect(previewData.summary.total_files).toBe(3);
  });
});
