import { describe, it, expect, beforeEach, afterEach, afterAll } from "@jest/globals";
import fs from "fs/promises";
import path from "path";

import { isolateRollbackStorage } from "../../helpers/rollback-storage.js";

/**
 * Private rollback storage.
 *
 * Every conflict strategy here runs an apply-path organize, which writes a
 * manifest through the default `getRollbackDirectory()`. Under jest that is one
 * directory shared by every worker, so these manifests decide which manifest is
 * globally newest and a no-id undo elsewhere can restore this file's batch.
 * The redirect is registered before the modules under test are imported, which
 * is why they are dynamic below.
 */
const storage = await isolateRollbackStorage("fom-conflict-");

const { OrganizerService } = await import(
  "../../../src/core/organize/organizer.js"
);
const { FileScannerService } = await import(
  "../../../src/core/scan/scanner.js"
);

describe("Conflict Resolution Strategies", () => {
  let testDir: string;
  // The classes arrive through a dynamic import, so the binding is a value and
  // not a type name. `InstanceType` reads the instance back off the constructor
  // instead of naming a type that no longer exists in this scope.
  let organizer: InstanceType<typeof OrganizerService>;
  let scanner: InstanceType<typeof FileScannerService>;

  beforeEach(async () => {
    testDir = path.join(process.cwd(), `test-conflict-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    organizer = new OrganizerService();
    scanner = new FileScannerService();
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  afterAll(async () => {
    await storage.remove();
  });

  it("should rename acting file on conflict (default)", async () => {
    // Setup: document.txt -> Documents/document.txt
    const src = path.join(testDir, "document.txt");
    await fs.writeFile(src, "content");

    // Pre-create conflict
    const destDir = path.join(testDir, "Documents");
    await fs.mkdir(destDir, { recursive: true });
    await fs.writeFile(path.join(destDir, "document.txt"), "existing content");

    const files = await scanner.getAllFiles(testDir);
    // exclude existing dest file from input files?
    // scanner.getAllFiles scans recursively.
    // If we organize everything, it tries to organize Documents/test.txt too?
    // Categorizer ignores if inside category folder? No.
    // It might try to move Documents/test.txt to Documents/test.txt.

    // To isolate, we pass only 'src' file to organize.
    const srcFile = files.find((f) => f.path === src);
    if (!srcFile) throw new Error("Source file not found");

    const result = await organizer.organize(testDir, [srcFile], {
      conflictStrategy: "rename",
    });

    expect(result.actions).toHaveLength(1);
    const [renamedAction] = result.actions;
    if (!renamedAction) throw new Error("Expected exactly one rename action");
    expect(renamedAction.to).toMatch(/document_1\.txt$/);

    // Verify file exists
    const movedCtx = await fs.readFile(renamedAction.to, "utf8");
    expect(movedCtx).toBe("content");
  });

  it("should skip on conflict", async () => {
    const src = path.join(testDir, "document.txt");
    await fs.writeFile(src, "content");

    const destDir = path.join(testDir, "Documents");
    await fs.mkdir(destDir, { recursive: true });
    await fs.writeFile(path.join(destDir, "document.txt"), "existing");

    const files = await scanner.getAllFiles(testDir);
    const srcFile = files.find((f) => f.path === src);
    if (!srcFile) throw new Error("Source file not found");

    const result = await organizer.organize(testDir, [srcFile], {
      conflictStrategy: "skip",
    });

    expect(result.actions).toHaveLength(0); // Skipped
    expect(result.statistics["Documents"]).toBe(1); // Counted?
    // Verify source still exists
    expect(
      await fs
        .access(src)
        .then(() => true)
        .catch(() => false),
    ).toBe(true);
  });

  it("should overwrite on conflict", async () => {
    const src = path.join(testDir, "test.txt");
    await fs.writeFile(src, "new content");

    const destDir = path.join(testDir, "Documents");
    await fs.mkdir(destDir, { recursive: true });
    await fs.writeFile(path.join(destDir, "test.txt"), "old content");

    const files = await scanner.getAllFiles(testDir);
    const srcFile = files.find((f) => f.path === src);
    if (!srcFile) throw new Error("Source file not found");

    const result = await organizer.organize(testDir, [srcFile], {
      conflictStrategy: "overwrite",
    });

    expect(result.actions).toHaveLength(1);
    const [overwrittenAction] = result.actions;
    if (!overwrittenAction) throw new Error("Expected exactly one move action");
    expect(overwrittenAction.to).toMatch(/test\.txt$/); // No rename

    // Verify content overwritten
    const destContent = await fs.readFile(overwrittenAction.to, "utf8");
    expect(destContent).toBe("new content");

    // Verify backup logic? Backup dir should contain old content.
    // That is an implementation detail of 'overwrite', verified if backup exists.
    // We can check .file-organizer-backups if we know where it is.
    // Usually CWD/.file-organizer-backups.
  });
});
