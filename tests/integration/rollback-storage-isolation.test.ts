/**
 * Rollback storage is private to the file that writes it.
 *
 * Issue #108: `getRollbackDirectory()` returns one directory shared by every
 * jest worker, so a test that undoes without naming a `manifest_id` restores
 * whichever manifest was globally newest, which under a parallel suite belongs
 * to another file. The pass tests read their own history rows and unlink what
 * they wrote, which stops this file perturbing that file but leaves the
 * directory shared, so two files rolling back still serialize on
 * `manifests.lock` for no reason.
 *
 * This guard is the isolation half: the suite redirects the paths module to a
 * temp root, and every assertion here reads the directory `getRollbackDirectory()`
 * reports at runtime. Revert `tests/helpers/rollback-storage.ts` to a pass-through
 * and all three tests fail, because manifests then land in the shared
 * `<cwd>/.file-organizer-rollbacks` every other worker also writes.
 *
 * The third test is the one that proves the undo is scoped: a newer foreign
 * manifest is written into the shared directory, and the suite's undo must
 * still restore its own batch. Without isolation that is the #108 failure —
 * `Expected value: "image.jpg" / Received array: []`.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, jest } from "@jest/globals";
import fs from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";

import { isolateRollbackStorage } from "../helpers/rollback-storage.js";
import type { ToolResponse } from "../../src/mcp/types.js";
import type { RollbackAction } from "../../src/core/types/system.js";
import { CONFIG } from "../../src/core/config/defaults.js";

const storage = await isolateRollbackStorage("fom-undo-isolation-");

const { handleOrganizeFiles } = await import("../../src/tools/file-organization.js");
const { handleUndoLastOperation } = await import("../../src/tools/rollback.js");
const { RollbackService } = await import("../../src/core/organize/rollback.js");
const { manifestIntegrityService } = await import(
  "../../src/core/organize/manifest-integrity.js"
);

/** The paths module this suite redirected, read back to assert the redirect holds. */
const redirectedPaths = await import("../../src/core/config/paths.js");

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

/** The manifest an apply-path organize just wrote. Throws rather than returning undefined. */
function manifestIdOf(result: ToolResponse): string {
  const payload = result.structuredContent;
  if (typeof payload !== "object" || payload === null) {
    throw new Error("organize_files returned no structuredContent");
  }
  const { manifest_id } = payload as { manifest_id?: unknown };
  if (typeof manifest_id !== "string" || manifest_id.length === 0) {
    throw new Error(`organize_files returned no manifest_id: ${JSON.stringify(payload)}`);
  }
  return manifest_id;
}

describe("rollback storage is private to this suite", () => {
  let testDir: string;
  let originalCustomAllowed: string[];
  /** The shared directory this run must not write into. */
  const sharedDir = path.join(process.cwd(), ".file-organizer-rollbacks");

  beforeEach(async () => {
    await fs.mkdir(storage.rollbackDir, { recursive: true });
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "fom-undo-iso-"));
    // os.tmpdir() is outside the default allowed roots, so the organize would
    // be refused. Whitelist this run's own dirs, the way the security suites do.
    if (!originalCustomAllowed) {
      originalCustomAllowed = CONFIG.paths.customAllowed;
    }
    CONFIG.paths.customAllowed = [...originalCustomAllowed, storage.root, testDir];
  });

  afterEach(async () => {
    CONFIG.paths.customAllowed = originalCustomAllowed;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  afterAll(async () => {
    await storage.remove();
  });

  it("writes manifests into the private root, not the shared worktree dir", async () => {
    await fs.writeFile(path.join(testDir, "notes.txt"), "text");

    const organized = await handleOrganizeFiles({
      directory: testDir,
      dry_run: false,
      response_format: "json",
    });

    const manifestId = manifestIdOf(organized);
    // The mock is what makes this true; with the real paths module the manifest
    // lands in <cwd>/.file-organizer-rollbacks and this stat throws ENOENT.
    await expect(
      fs.access(path.join(storage.rollbackDir, `${manifestId}.json`)),
    ).resolves.toBeUndefined();

    // The getter agrees with where the file went, so a mock that redirects one
    // but not the other cannot pass.
    expect(redirectedPaths.getRollbackDirectory()).toBe(storage.rollbackDir);
    expect(
      await new RollbackService().listManifests(),
    ).toEqual([expect.objectContaining({ id: manifestId })]);
  });

  it("leaves the shared directory untouched", async () => {
    // Whatever other suites left there is not this test's to assert on. What
    // matters is that this run added nothing: a shared-write regression shows
    // up as a new file with this suite's manifest id. Nothing is undone here,
    // so a manifest that lands in the shared dir stays visible as a new name.
    const before = new Set(await fs.readdir(sharedDir).catch(() => [] as string[]));

    await fs.writeFile(path.join(testDir, "notes.txt"), "text");
    const organized = await handleOrganizeFiles({
      directory: testDir,
      dry_run: false,
      response_format: "json",
    });
    const manifestId = manifestIdOf(organized);

    const after = await fs.readdir(sharedDir).catch(() => [] as string[]);
    expect(after.filter((name) => !before.has(name))).toEqual([]);

    // The private root holds it instead, which is the other half of the claim.
    await expect(
      fs.access(path.join(storage.rollbackDir, `${manifestId}.json`)),
    ).resolves.toBeUndefined();
  });

  it("undoes its own batch when a foreign manifest is newer in the shared dir", async () => {
    // The #108 race, made deterministic. A foreign manifest is written into the
    // SHARED directory with a later timestamp, so an unisolated suite picks it
    // up as globally newest and restores a stranger's files, leaving this
    // directory empty.
    const foreignStamp = Date.now() + 60_000;
    let foreignId = "";
    try {
      await fs.mkdir(sharedDir, { recursive: true });
      const foreignManifest = manifestIntegrityService.signManifest({
        id: crypto.randomUUID(),
        timestamp: foreignStamp,
        description: "a batch from another worker",
        actions: [
          {
            type: "move",
            originalPath: path.join(testDir, "stray.txt"),
            currentPath: path.join(testDir, "stray.txt"),
            timestamp: foreignStamp,
          },
        ],
        version: "1.0",
      });
      foreignId = foreignManifest.id;
      await fs.writeFile(
        path.join(sharedDir, `${foreignId}.json`),
        JSON.stringify(foreignManifest, null, 2),
      );

      const files = [
        { name: "image.jpg", content: "img" },
        { name: "notes.txt", content: "text" },
      ];
      for (const f of files) {
        await fs.writeFile(path.join(testDir, f.name), f.content);
      }

      const organized = await handleOrganizeFiles({
        directory: testDir,
        dry_run: false,
        response_format: "json",
      });

      // Assert the setup fired: a manifest with a far-future stamp exists in
      // the shared directory, so a manifest from "another worker" is the
      // globally newest thing on disk right now. An unisolated suite lets its
      // no-id undo find that one; this one only ever reads its own directory.
      const shared = await new RollbackService(sharedDir).listManifests();
      expect(shared[0]?.id).toBe(foreignId);

      // The #108 call: no manifest_id, so the target is whatever the suite's
      // own storage says is newest. With the redirect that is this organize's
      // manifest and the batch is spent cleanly.
      const undo = await handleUndoLastOperation({ response_format: "json" });
      expect(JSON.parse(undo.content[0].text)).toMatchObject({
        success: 2,
        failed: 0,
      });

      const { handleListFiles } = await import("../../src/tools/file-listing.js");
      const names = listedFileNames(
        await handleListFiles({ directory: testDir, response_format: "json" }),
      );
      expect(names).toContain("image.jpg");
      expect(names).toContain("notes.txt");
    } finally {
      // Clean only what this test wrote into the shared directory. The rest of
      // it is other suites' history and not ours to prune.
      await fs
        .rm(path.join(sharedDir, `${foreignId}.json`), { force: true })
        .catch(() => {});
    }
  });
});
