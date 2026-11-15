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

// Entries are spelled the way the handler will spell them. The handler resolves
// the directory before planning, and on Windows that can differ from a path this
// test built by hand, which would make a file sitting in its destination look
// like it needs moving.
const entry = (root: string, relative: string): Scanned => {
  let canonicalRoot = root;
  try {
    canonicalRoot = fsSync.realpathSync(root);
  } catch {
    // The root already exists in every test here, so this is belt and braces.
  }
  return {
    name: path.basename(relative),
    path: path.join(canonicalRoot, relative),
    size: 1,
    modified: new Date(),
  };
};

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

    // What this pins is the totals agreeing, not how many moves the plan makes.
    // Whether the already-organized file is skipped depends on the platform
    // agreeing that two spellings of the same path are the same path, and that is
    // not what BUG-37 was about: the preview used to report the move count as
    // total_files while organize reported the files it looked at.

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
