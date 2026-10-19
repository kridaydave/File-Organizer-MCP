/**
 * Cascade undo — issue #98's decision.
 *
 * `undo_last_operation(manifest_id, cascade: true)` undoes that operation and
 * everything newer, walking the stack newest-first. Each step is the ordinary
 * single-manifest undo, verified before it runs, and its manifest is deleted
 * on success, so the out-of-order conflict refusal stays on and simply never
 * fires: by the time a step runs, nothing newer exists to collide with.
 *
 * The other half of the decision is skips: a file a manifest names that is
 * already gone counts as skipped, never as failed, and never blocks the rest
 * of the batch or the cascade below it.
 *
 * Every test drives the public surface (RollbackService or the tool handler)
 * against a real filesystem inside a temp sandbox, so a pass means the files
 * actually moved.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from "@jest/globals";
import fs from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";

import { isolateRollbackStorage } from "../../../helpers/rollback-storage.js";

/**
 * Private rollback storage, same reason as selective-undo.test.ts: the tool
 * handlers and organizers build their RollbackService off
 * `getRollbackDirectory()`, which under jest is one directory shared by every
 * worker. Registering the redirect before the modules below are imported is
 * what makes the handlers read it.
 */
const storage = await isolateRollbackStorage("fom-cascade-undo-");

const { CONFIG } = await import("../../../../src/config.js");
const { RollbackService } =
  await import("../../../../src/core/organize/rollback.js");
const { handleUndoLastOperation } =
  await import("../../../../src/tools/rollback.js");
const { HistoryLoggerService } =
  await import("../../../../src/services/history-logger.service.js");
const { manifestIntegrityService } =
  await import("../../../../src/core/organize/manifest-integrity.js");

type RollbackAction = import("../../../../src/types.js").RollbackAction;

/** First text block of a tool response. */
function textOf(response: { content: Array<{ text: string }> }): string {
  const first = response.content[0];
  if (first === undefined) {
    throw new Error("tool response carried no content block");
  }
  return first.text;
}

describe("cascade undo", () => {
  let testDir: string;
  let storageDir: string;
  let rollbackService: InstanceType<typeof RollbackService>;
  let restoreCustomAllowed: string[] | undefined;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "cascade-undo-"));
    // Manifests live outside testDir so a tree() listing of the data the undo
    // acts on never shows this test's own bookkeeping. It is also the
    // directory the tool handlers write to, because it is where the redirected
    // getRollbackDirectory() points.
    storageDir = storage.rollbackDir;
    await fs.rm(storageDir, { recursive: true, force: true });
    await fs.mkdir(storageDir, { recursive: true });
    rollbackService = new RollbackService(storageDir);
    restoreCustomAllowed = CONFIG.paths._overrideCustomAllowed;
    CONFIG.paths.customAllowed = [testDir];
  });

  afterEach(async () => {
    CONFIG.paths.customAllowed = restoreCustomAllowed;
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  afterAll(async () => {
    await storage.remove();
  });

  async function exists(candidate: string): Promise<boolean> {
    return fs
      .access(candidate)
      .then(() => true)
      .catch(() => false);
  }

  /** Relative listing, so assertions never bake an absolute path. */
  async function tree(): Promise<string[]> {
    const entries: string[] = [];
    const walk = async (dir: string, prefix: string): Promise<void> => {
      const dirents = await fs.readdir(dir, { withFileTypes: true });
      for (const dirent of dirents) {
        const child = path.join(dir, dirent.name);
        if (dirent.isDirectory()) {
          await walk(child, `${prefix}${dirent.name}/`);
        } else {
          entries.push(`${prefix}${dirent.name}`);
        }
      }
    };
    await walk(testDir, "");
    return entries.sort();
  }

  /** Write a manifest by hand so timestamps and ids are controllable. */
  async function writeManifest(
    actions: RollbackAction[],
    timestamp: number,
  ): Promise<string> {
    const id = crypto.randomUUID();
    // The real signer, so the manifest on disk is one this machine would have
    // written; it computes the content hash itself.
    const manifest = manifestIntegrityService.signManifest({
      id,
      timestamp,
      description: `operation ${timestamp}`,
      actions,
      version: "1.0",
    });
    await fs.mkdir(storageDir, { recursive: true });
    await fs.writeFile(
      path.join(storageDir, `${id}.json`),
      JSON.stringify(manifest, null, 2),
    );
    return id;
  }

  /**
   * Three passes over one file, each starting where the last one left it:
   *
   *   A: orig.txt              -> Documents/step-a.txt
   *   B: Documents/step-a.txt  -> Documents/step-b.txt
   *   C: Documents/step-b.txt  -> Documents/step-c.txt
   *
   * The only order that puts orig.txt back is C, B, A. Undo A first and it
   * finds Documents/step-a.txt long gone, skips it, and the file ends up
   * stranded one rung up the chain — so an assertion on orig.txt landing back
   * at the root proves the walk was newest-first.
   *
   * Manifest stamps are recent on purpose: `listManifests` prunes anything
   * older than the 30-day retention window, and a 1970 timestamp is always
   * expired.
   */
  async function seedChain(): Promise<{ ids: { a: string; b: string; c: string } }> {
    const base = Date.now() - 60_000;
    const orig = path.join(testDir, "orig.txt");
    const stepA = path.join(testDir, "Documents", "step-a.txt");
    const stepB = path.join(testDir, "Documents", "step-b.txt");
    const stepC = path.join(testDir, "Documents", "step-c.txt");
    await fs.mkdir(path.dirname(stepA), { recursive: true });
    await fs.writeFile(orig, "chain");
    await fs.rename(orig, stepA);
    await fs.rename(stepA, stepB);
    await fs.rename(stepB, stepC);

    const a = await writeManifest(
      [{ type: "move", originalPath: orig, currentPath: stepA, timestamp: base }],
      base,
    );
    const b = await writeManifest(
      [{ type: "move", originalPath: stepA, currentPath: stepB, timestamp: base + 1_000 }],
      base + 1_000,
    );
    const c = await writeManifest(
      [{ type: "move", originalPath: stepB, currentPath: stepC, timestamp: base + 2_000 }],
      base + 2_000,
    );
    return { ids: { a, b, c } };
  }

  it("cascade: true on a manifest with two newer ones undoes all three, newest first", async () => {
    const { ids } = await seedChain();

    const result = await rollbackService.rollback(ids.a, { cascade: true });

    expect(result).toMatchObject({
      success: 3,
      failed: 0,
      skipped: 0,
      passes: 3,
      refused: false,
    });
    // The state only reachable by walking C, B, A: orig.txt back at the root
    // and every rung of the chain cleared.
    expect(await tree()).toEqual(["orig.txt"]);
    // Each pass's manifest was spent as its step landed.
    for (const id of Object.values(ids)) {
      expect(await exists(path.join(storageDir, `${id}.json`))).toBe(false);
    }
  });

  it("stops at the first step that fails; the steps below are untouched", async () => {
    const { ids } = await seedChain();

    // C's undo lands safely, then B's undo must move Documents/step-b.txt
    // back onto Documents/step-a.txt. Occupying that destination makes B fail
    // with EEXIST: a real mid-cascade failure, not a missing file.
    const occupied = path.join(testDir, "Documents", "step-a.txt");
    await fs.writeFile(occupied, "someone else lives here now");

    // Assert the setup fired: the chain's head and the occupied destination
    // are both in place before the walk starts.
    expect(await exists(path.join(testDir, "Documents", "step-c.txt"))).toBe(true);
    expect(await fs.readFile(occupied, "utf-8")).toBe("someone else lives here now");

    const result = await rollbackService.rollback(ids.a, { cascade: true });

    // C succeeded, B failed, A was never attempted.
    expect(result).toMatchObject({ success: 1, failed: 1, skipped: 0, passes: 1 });
    expect(result.steps.map((s) => s.manifestId)).toEqual([ids.c, ids.b]);
    expect(result.errors.join(" ")).toContain("Cascade stopped");
    expect(result.errors.join(" ")).toContain(ids.b);

    // C was undone and spent.
    expect(await exists(path.join(storageDir, `${ids.c}.json`))).toBe(false);
    // B failed, so its manifest survives for a retry.
    expect(await exists(path.join(storageDir, `${ids.b}.json`))).toBe(true);
    // A never ran: its file is still one rung up the chain and its manifest
    // is untouched.
    expect(await exists(path.join(testDir, "orig.txt"))).toBe(false);
    expect(await exists(path.join(testDir, "Documents", "step-c.txt"))).toBe(false);
    expect(await exists(path.join(testDir, "Documents", "step-b.txt"))).toBe(true);
    expect(await exists(path.join(storageDir, `${ids.a}.json`))).toBe(true);
    // The intruder that caused the failure was never clobbered.
    expect(await fs.readFile(occupied, "utf-8")).toBe("someone else lives here now");
  });

  it("counts a file that is already gone as skipped, not failed", async () => {
    const original = path.join(testDir, "ghost.txt");
    const destination = path.join(testDir, "Documents", "ghost.txt");
    await fs.mkdir(path.dirname(destination), { recursive: true });
    // The manifest records a move whose file was deleted by hand afterwards.
    const id = await writeManifest(
      [
        {
          type: "move",
          originalPath: original,
          currentPath: destination,
          timestamp: Date.now() - 60_000,
        },
      ],
      Date.now() - 60_000,
    );

    const result = await rollbackService.rollback(id);

    expect(result).toMatchObject({
      success: 0,
      skipped: 1,
      failed: 0,
      passes: 1,
      refused: false,
    });
    // The skip note names the path at the service layer; the tool layer
    // sanitizes it before it reaches a client.
    expect(result.errors.join(" ")).toContain(destination);
    // A manifest with nothing left to undo is still spent.
    expect(await exists(path.join(storageDir, `${id}.json`))).toBe(false);
  });

  it("spends a manifest whose files are partly gone once the rest are restored", async () => {
    const keptOriginal = path.join(testDir, "kept.txt");
    const keptDestination = path.join(testDir, "Documents", "kept.txt");
    const goneOriginal = path.join(testDir, "gone.txt");
    const goneDestination = path.join(testDir, "Documents", "gone.txt");
    await fs.mkdir(path.dirname(keptDestination), { recursive: true });
    await fs.writeFile(keptOriginal, "kept");
    await fs.rename(keptOriginal, keptDestination);

    const id = await writeManifest(
      [
        {
          type: "move",
          originalPath: keptOriginal,
          currentPath: keptDestination,
          timestamp: Date.now() - 60_000,
        },
        {
          type: "move",
          originalPath: goneOriginal,
          currentPath: goneDestination,
          timestamp: Date.now() - 60_000 + 1,
        },
      ],
      Date.now() - 60_000,
    );

    const result = await rollbackService.rollback(id);

    expect(result).toMatchObject({ success: 1, skipped: 1, failed: 0, passes: 1 });
    // The remaining file was restored even though its neighbour is gone.
    expect(await exists(keptOriginal)).toBe(true);
    expect(await exists(keptDestination)).toBe(false);
    expect(await exists(goneDestination)).toBe(false);
    // The manifest is consumed anyway: skips do not set failed.
    expect(await exists(path.join(storageDir, `${id}.json`))).toBe(false);
  });

  it("cascade: false (the default) on an old id still refuses, unchanged", async () => {
    const original = path.join(testDir, "shared.txt");
    const destination = path.join(testDir, "Documents", "shared.txt");
    const intruder = path.join(testDir, "Documents", "shared_1.txt");

    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(original, "original");
    await fs.rename(original, destination);

    const olderId = await writeManifest(
      [
        {
          type: "move",
          originalPath: original,
          currentPath: destination,
          timestamp: Date.now() - 60_000,
        },
      ],
      Date.now() - 60_000,
    );

    // A newer operation then took over the same destination.
    await fs.rename(destination, intruder);
    await fs.writeFile(destination, "newer file");
    await writeManifest(
      [
        {
          type: "move",
          originalPath: destination,
          currentPath: intruder,
          timestamp: Date.now() - 59_000,
        },
      ],
      Date.now() - 59_000,
    );

    const before = await tree();
    const result = await rollbackService.rollback(olderId);

    expect(result.refused).toBe(true);
    expect(result.failed).toBe(1);
    expect(result.errors.join(" ")).toContain("Refused to undo manifest");
    // Nothing moved and nothing was spent.
    expect(await tree()).toEqual(before);
    expect(await exists(path.join(storageDir, `${olderId}.json`))).toBe(true);
  });

  it("a refusal reaches the tool as isError false with refused true", async () => {
    const original = path.join(testDir, "refuse.txt");
    const destination = path.join(testDir, "Documents", "refuse.txt");
    const intruder = path.join(testDir, "Documents", "refuse_1.txt");

    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(original, "original");
    await fs.rename(original, destination);

    const olderId = await writeManifest(
      [
        {
          type: "move",
          originalPath: original,
          currentPath: destination,
          timestamp: Date.now() - 60_000,
        },
      ],
      Date.now() - 60_000,
    );
    await fs.rename(destination, intruder);
    await fs.writeFile(destination, "newer file");
    await writeManifest(
      [
        {
          type: "move",
          originalPath: destination,
          currentPath: intruder,
          timestamp: Date.now() - 59_000,
        },
      ],
      Date.now() - 59_000,
    );

    const before = await tree();

    const json = await handleUndoLastOperation({
      manifest_id: olderId,
      response_format: "json",
    });
    // A refusal is an answer, not a tool failure: an MCP client that sees
    // isError true logs it and may retry something that will never succeed.
    expect(json.isError).toBe(false);
    const payload = JSON.parse(textOf(json)) as {
      refused?: boolean;
      failed?: number;
      passes?: number;
    };
    expect(payload.refused).toBe(true);
    expect(payload.failed).toBe(1);
    expect(payload.passes).toBe(0);

    const markdown = await handleUndoLastOperation({
      manifest_id: olderId,
      response_format: "markdown",
    });
    expect(markdown.isError).toBe(false);
    expect(textOf(markdown)).toContain("Refused:");
    expect(textOf(markdown)).toContain("Refused to undo manifest");

    // Neither format moved a file or spent a manifest.
    expect(await tree()).toEqual(before);
    expect(await exists(path.join(storageDir, `${olderId}.json`))).toBe(true);
  });

  it("cascade: true with no id undoes only the newest manifest", async () => {
    // Two disjoint passes: without the pass-over, both would be undone.
    const oldOriginal = path.join(testDir, "old.txt");
    const oldDest = path.join(testDir, "Documents", "old.txt");
    const newOriginal = path.join(testDir, "new.txt");
    const newDest = path.join(testDir, "Pictures", "new.png");
    await fs.mkdir(path.dirname(oldDest), { recursive: true });
    await fs.mkdir(path.dirname(newDest), { recursive: true });
    await fs.writeFile(oldOriginal, "old");
    await fs.writeFile(newOriginal, "new");
    await fs.rename(oldOriginal, oldDest);
    await fs.rename(newOriginal, newDest);

    const olderId = await writeManifest(
      [
        {
          type: "move",
          originalPath: oldOriginal,
          currentPath: oldDest,
          timestamp: Date.now() - 60_000,
        },
      ],
      Date.now() - 60_000,
    );
    const newestId = await writeManifest(
      [
        {
          type: "move",
          originalPath: newOriginal,
          currentPath: newDest,
          timestamp: Date.now() - 59_000,
        },
      ],
      Date.now() - 59_000,
    );

    const response = await handleUndoLastOperation({
      cascade: true,
      response_format: "json",
    });
    const payload = JSON.parse(textOf(response)) as {
      success: number;
      passes: number;
      refused: boolean;
    };
    expect(payload).toMatchObject({ success: 1, passes: 1, refused: false });

    // Only the newest was spent; the older pass is untouched below it.
    expect(await exists(newOriginal)).toBe(true);
    expect(await exists(path.join(storageDir, `${newestId}.json`))).toBe(false);
    expect(await exists(oldDest)).toBe(true);
    expect(await exists(path.join(storageDir, `${olderId}.json`))).toBe(true);
  });

  it("writes one history row per undone manifest, not one row for the cascade", async () => {
    const history = new HistoryLoggerService({
      dataDir: path.join(testDir, "history"),
      maxBackupFiles: 0,
    });
    await history.init();
    const ctx = { config: CONFIG, history };

    const { ids } = await seedChain();
    const response = await handleUndoLastOperation(
      { manifest_id: ids.a, cascade: true, response_format: "json" },
      ctx as never,
    );
    expect(response.isError).toBeUndefined();
    const payload = JSON.parse(textOf(response)) as { passes?: number };
    expect(payload.passes).toBe(3);

    const rows = await history.searchHistory({
      operation: "file_organizer_undo_last_operation",
    });
    // Exactly one row per manifest the cascade spent. One row for the whole
    // cascade would leave the per-pass detail (which manifest, how many files
    // restored, how many already gone) with nowhere to live — the response
    // carries only the summary.
    expect(rows.total).toBe(3);
    expect(rows.entries.map((e) => e.manifestId).sort()).toEqual(
      [ids.a, ids.b, ids.c].sort(),
    );
    // Each row carries its own pass's counts, not the cascade's totals.
    for (const row of rows.entries) {
      expect(row.filesProcessed).toBe(1);
      expect(row.filesSkipped).toBe(0);
      expect(row.status).toBe("success");
    }
  });
});
