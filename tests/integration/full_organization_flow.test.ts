/**
 * End-to-end organization flow.
 *
 * Rollback and config storage are redirected to a private directory for this
 * file only. An `undo_last_operation` with no `manifest_id` reads the globally
 * newest manifest, and under jest every worker writes manifests into the same
 * shared directory, so this test used to undo whichever manifest some other
 * test file had written last. The undo then restored a stranger's files and
 * the assertions against this directory saw an empty tree.
 *
 * The undo below names its own manifest as well, so the test stops depending
 * on global order even if the directory isolation is ever removed.
 */

import fs from "fs/promises";
import path from "path";
import { jest } from "@jest/globals";
import type { ToolResponse } from "../../src/mcp/types.js";

// Private config, history, rollback and backup roots. Without these the test
// reads and writes the developer's real `~/.config/file-organizer-mcp`.
const tempRoot = path.join(
  process.cwd(),
  "tests",
  "temp",
  `full-flow-${process.pid}`,
);
const tempConfigDir = path.join(tempRoot, "config");

const actualPaths = await import("../../src/core/config/paths.js");

jest.unstable_mockModule("../../src/core/config/paths.js", () => ({
  ...actualPaths,
  getUserConfigPath: () => path.join(tempConfigDir, "config.json"),
  getHistoryFilePath: () => path.join(tempConfigDir, "history.jsonl"),
  getRollbackDirectory: () => path.join(tempConfigDir, "rollback"),
  getBackupDirectory: () => path.join(tempConfigDir, "backups"),
}));

const { handleOrganizeFiles } =
  await import("../../src/tools/file-organization.js");
const { handleListFiles } = await import("../../src/tools/file-listing.js");
const { handleUndoLastOperation } = await import("../../src/tools/rollback.js");
const { RollbackService } = await import("../../src/core/organize/rollback.js");

/** The rollback directory this file's tools read and write. */
const rollbackDir = path.join(tempConfigDir, "rollback");

/** A throwaway directory the foreign manifest below claims to have moved. */
const foreignSrc = path.join(tempRoot, "foreign-src");

/** File names from a listing result, without an `any` for the payload. */
function listedFileNames(result: ToolResponse): string[] {
  const payload =
    typeof result.structuredContent === "string"
      ? (JSON.parse(result.structuredContent) as unknown)
      : result.structuredContent;

  if (typeof payload !== "object" || payload === null) return [];

  const { items } = payload as { items?: unknown };
  if (!Array.isArray(items)) return [];

  return items.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const { name } = item as { name?: unknown };
    return typeof name === "string" ? [name] : [];
  });
}

/**
 * The manifest an apply-path organize just wrote. Throws rather than returning
 * undefined, so a schema that stops carrying `manifest_id` fails this test
 * loudly instead of silently falling back to a blind undo.
 */
function manifestIdOf(result: ToolResponse): string {
  const payload = result.structuredContent;
  if (typeof payload !== "object" || payload === null) {
    throw new Error("organize_files returned no structuredContent");
  }
  const { manifest_id } = payload as { manifest_id?: unknown };
  if (typeof manifest_id !== "string" || manifest_id.length === 0) {
    throw new Error(
      `organize_files returned no manifest_id: ${JSON.stringify(payload)}`,
    );
  }
  return manifest_id;
}

describe("Integration: Full Organization Flow", () => {
  let testDir: string;
  let baseTempDir: string;

  beforeEach(async () => {
    await fs.mkdir(path.join(tempConfigDir, "rollback"), { recursive: true });
    baseTempDir = path.join(process.cwd(), "tests", "temp");
    await fs.mkdir(baseTempDir, { recursive: true });
    testDir = await fs.mkdtemp(path.join(baseTempDir, "int-org-"));
  });

  afterEach(async () => {
    // Give time for any pending IO to settle
    await new Promise((resolve) => setTimeout(resolve, 500));
    // Drain any pending microtasks
    await new Promise((resolve) => setImmediate(resolve));

    let retries = 5;
    while (retries > 0) {
      try {
        await fs.rm(testDir, { recursive: true, force: true });
        break;
      } catch (error) {
        retries--;
        if (retries === 0) {
          console.error("Cleanup failed after retries:", error);
        } else {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }
  });

  afterAll(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("should organize a messy directory and support undo", async () => {
    // 1. Setup Messy State
    const files = [
      { name: "document.pdf", content: "pdf" },
      { name: "image.jpg", content: "img" },
      { name: "setup.exe", content: "bin" },
      { name: "notes.txt", content: "text" },
    ];

    for (const f of files) {
      await fs.writeFile(path.join(testDir, f.name), f.content);
    }

    // 2. Run Organization
    const orgResult = await handleOrganizeFiles({
      directory: testDir,
      dry_run: false,
    });
    expect(orgResult.content[0].text).toContain("Organization Result");
    expect(orgResult.content[0].text).toContain("Total Files Processed:** 4");

    // 3. Verify Organized State
    const listResult = await handleListFiles({
      directory: testDir,
      response_format: "json",
    });
    const fileNames = listedFileNames(listResult);

    // Files should be moved, so root should mainly have directories
    // But listFiles does not recurse by default. So we see directories.
    // Expect 'Documents', 'Images', 'Executables'
    // 'text' maps to Documents usually.

    // listFiles only returns FILES, so it should be empty now if everything moved
    expect(fileNames).not.toContain("image.jpg");
    expect(fileNames).not.toContain("document.pdf");
    expect(fileNames).not.toContain("setup.exe");
    expect(fileNames).not.toContain("notes.txt");

    // Verify subdirectories exist and contain files
    await expect(
      fs.access(path.join(testDir, "Images", "image.jpg")),
    ).resolves.not.toThrow();
    await expect(
      fs.access(path.join(testDir, "Documents", "document.pdf")),
    ).resolves.not.toThrow();
    await expect(
      fs.access(path.join(testDir, "Executables", "setup.exe")),
    ).resolves.not.toThrow();

    // 4. Undo
    // Undo the manifest this organize just wrote. A no-id undo picks the
    // globally newest manifest, which in a shared suite belongs to another
    // test file, and the restore then puts this directory back empty.
    const undoResult = await handleUndoLastOperation({
      manifest_id: manifestIdOf(orgResult),
    });
    expect(undoResult.content[0].text).toContain("Restored:");

    // 5. Verify Reverted State
    const listResultUndo = await handleListFiles({
      directory: testDir,
      response_format: "json",
    });
    const fileNamesUndo = listedFileNames(listResultUndo);

    expect(fileNamesUndo).toContain("image.jpg");
    expect(fileNamesUndo).toContain("document.pdf");
  });

  it("undo restores this batch even when a newer manifest exists", async () => {
    // #108, made deterministic. A no-id `undo_last_operation` takes whichever
    // manifest is globally newest, so a batch finished later wins the restore
    // and this directory comes back empty. That race was intermittent and is
    // not now: the foreign manifest is written after this organize, so it is
    // always the newer one.
    const files = [
      { name: "document.pdf", content: "pdf" },
      { name: "image.jpg", content: "img" },
      { name: "setup.exe", content: "bin" },
      { name: "notes.txt", content: "text" },
    ];
    for (const f of files) {
      await fs.writeFile(path.join(testDir, f.name), f.content);
    }

    const orgResult = await handleOrganizeFiles({
      directory: testDir,
      dry_run: false,
    });
    const manifestId = manifestIdOf(orgResult);

    // A batch from "another worker", newer than this one by construction: it
    // is written after the organize above, so its timestamp always sorts first.
    await fs.mkdir(foreignSrc, { recursive: true });
    const stray = path.join(foreignSrc, "stray.txt");
    await fs.writeFile(stray, "not this test's file");
    const foreignId = await new RollbackService(rollbackDir).createManifest(
      "a batch from another worker",
      [
        {
          type: "move",
          originalPath: stray,
          currentPath: stray,
          timestamp: Date.now(),
        },
      ],
    );

    // Assert the setup fired. Without a newer foreign manifest this guard
    // would pass for the wrong reason, exactly like the test it pins, because
    // the newest manifest would be this test's own either way.
    const manifests = await new RollbackService(rollbackDir).listManifests();
    expect(manifests[0]?.id).toBe(foreignId);
    expect(manifests[0]?.id).not.toBe(manifestId);

    try {
      const undo = await handleUndoLastOperation({ manifest_id: manifestId });
      expect(undo.content[0].text).toContain("Restored:");

      const list = await handleListFiles({
        directory: testDir,
        response_format: "json",
      });
      const names = listedFileNames(list);

      // What the bug produced: `Expected value: "image.jpg" / Received array: []`
      expect(names).toContain("image.jpg");
      expect(names).toContain("document.pdf");
    } finally {
      await fs
        .rm(path.join(rollbackDir, `${foreignId}.json`), { force: true })
        .catch(() => {});
    }
  });
});
