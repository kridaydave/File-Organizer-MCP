/**
 * The two gaps that stop being theoretical once manifest ids reach a user,
 * which is what ticket #97 is about.
 *
 *   1. `listManifests` parsed every file with no signature check, so an
 *      unsigned manifest on disk became an id a user could paste into
 *      `undo_last_operation`. The list now reports a verdict per entry and
 *      keeps the unverified ones visible rather than hiding them.
 *   2. `RollbackService` read a manifest, acted on its paths and unlinked the
 *      file with nothing holding another process off, so two undoes racing
 *      the same manifest both passed the read and both unlinked.
 *
 * Every test drives `RollbackService` or the tool handler and asserts on what a
 * caller observes: the listed flag, the files that did or did not move, and
 * the shape of the error. A mocked verification would pass while the real
 * check stayed unreachable, so nothing here is mocked.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import fs from "fs/promises";
import os from "os";
import path from "path";

const { CONFIG } = await import("../../../../src/config.js");
const { RollbackService } = await import(
  "../../../../src/core/organize/rollback.js"
);
const { handleUndoLastOperation } = await import(
  "../../../../src/tools/rollback.js"
);
const { ValidationError } = await import("../../../../src/types.js");

type RollbackServiceInstance = InstanceType<typeof RollbackService>;

/** First text block of a tool response. */
function textOf(response: { content: Array<{ text: string }> }): string {
  const first = response.content[0];
  if (first === undefined) {
    throw new Error("tool response carried no content block");
  }
  return first.text;
}

/** Whether a file is present, for assertions about what actually moved. */
async function exists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(
    () => true,
    () => false,
  );
}

describe("manifest listing reports integrity", () => {
  let dataDir: string;
  let storageDir: string;
  let rollbackService: RollbackServiceInstance;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "manifest-verified-"));
    storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "manifest-verified-store-"));
    rollbackService = new RollbackService(storageDir);
    CONFIG.paths.customAllowed = [dataDir];
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(dataDir, { recursive: true, force: true });
    await fs.rm(storageDir, { recursive: true, force: true });
  });

  /** Organize one file so there is a real manifest to corrupt. */
  async function organizeOneFile(): Promise<{ manifestId: string; from: string; to: string }> {
    const from = path.join(dataDir, "note.txt");
    const to = path.join(dataDir, "Documents", "note.txt");
    await fs.writeFile(from, "hello");

    const manifestId = await rollbackService.createManifest("One file moved", [
      { type: "move", originalPath: from, currentPath: to, timestamp: Date.now() },
    ]);

    // Put the file where the manifest says it ended up, so an undo has real
    // work to do.
    await fs.mkdir(path.join(dataDir, "Documents"), { recursive: true });
    await fs.rename(from, to);

    return { manifestId, from, to };
  }

  /** Rewrite a manifest file with a corrupted signature. */
  async function corruptSignature(manifestId: string): Promise<void> {
    const filePath = path.join(storageDir, `${manifestId}.json`);
    const manifest = JSON.parse(await fs.readFile(filePath, "utf-8")) as {
      signature: string;
    };
    manifest.signature = manifest.signature.replace(/^./, (c: string) =>
      c === "0" ? "1" : "0",
    );
    await fs.writeFile(filePath, JSON.stringify(manifest, null, 2));
  }

  it("marks a manifest this machine wrote as verified", async () => {
    const { manifestId } = await organizeOneFile();

    const listed = await rollbackService.listManifests();

    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(manifestId);
    expect(listed[0]?.verified).toBe(true);
  });

  it("lists a corrupted manifest and reports it as unverified", async () => {
    // The choice kriday made on this ticket: keep the file in the list and say
    // it is unverified. Hiding it would destroy the only trace that something
    // appeared in the rollback directory, and an agent cannot warn a user
    // about a manifest it cannot see.
    const { manifestId } = await organizeOneFile();
    await corruptSignature(manifestId);

    const listed = await rollbackService.listManifests();

    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(manifestId);
    expect(listed[0]?.verified).toBe(false);
  });

  it("refuses to undo a manifest that does not verify, and moves nothing", async () => {
    // The flag on the list is for callers to read. getManifest is what
    // actually stops the paths being used, so that is what has to hold even if
    // a caller ignores the flag.
    const { manifestId, from, to } = await organizeOneFile();
    await corruptSignature(manifestId);

    await expect(rollbackService.rollback(manifestId)).rejects.toThrow(
      /integrity check failed/i,
    );

    // The file is exactly where the tamper left it: not undone.
    expect(await exists(from)).toBe(false);
    expect(await exists(to)).toBe(true);
  });

  it("treats an unverified newer manifest as a conflict rather than ignoring it", async () => {
    // findNewerConflicts reads the listed flag now instead of re-verifying.
    // An unverified candidate still has to block the undo: ignoring it would
    // let a forged manifest hide a real overlap.
    const older = path.join(dataDir, "older.txt");
    const olderTo = path.join(dataDir, "Documents", "older.txt");
    await fs.mkdir(path.join(dataDir, "Documents"), { recursive: true });
    await fs.writeFile(older, "one");
    await fs.rename(older, olderTo);

    const olderId = await rollbackService.createManifest("Older move", [
      {
        type: "move",
        originalPath: older,
        currentPath: olderTo,
        timestamp: Date.now() - 60_000,
      },
    ]);

    const newer = path.join(dataDir, "newer.txt");
    const newerTo = path.join(dataDir, "Documents", "newer.txt");
    await fs.writeFile(newer, "two");
    await fs.rename(newer, newerTo);

    const newerId = await rollbackService.createManifest("Newer move", [
      {
        type: "move",
        originalPath: newer,
        currentPath: newerTo,
        timestamp: Date.now(),
      },
    ]);
    await corruptSignature(newerId);

    const result = await rollbackService.rollback(olderId);

    expect(result.success).toBe(0);
    expect(result.errors.join("\n")).toContain(newerId);
    expect(result.errors.join("\n")).toMatch(/integrity check failed/i);
    expect(await exists(olderTo)).toBe(true);
  });

  it("lets exactly one of two concurrent undoes win, and the loser refuses cleanly", async () => {
    // Two service instances on one storage directory is two processes as far as
    // the lock is concerned: the file is what separates them, not a field on
    // either object. Before the lock, both passed getManifest and both
    // unlinked, so one batch of moves was spent twice.
    const from = path.join(dataDir, "one.txt");
    const two = path.join(dataDir, "two.txt");
    const three = path.join(dataDir, "three.txt");
    const docs = path.join(dataDir, "Documents");
    await fs.mkdir(docs, { recursive: true });

    for (const [name, source] of [
      ["one.txt", from],
      ["two.txt", two],
      ["three.txt", three],
    ] as const) {
      await fs.writeFile(source, name);
      await fs.rename(source, path.join(docs, name));
    }

    const manifestId = await rollbackService.createManifest("Three files", [
      ...[from, two, three].map((source) => ({
        type: "move" as const,
        originalPath: source,
        currentPath: path.join(docs, path.basename(source)),
        timestamp: Date.now(),
      })),
    ]);

    // Two independent services over the same directory, as two processes are.
    const first = new RollbackService(storageDir);
    const second = new RollbackService(storageDir);

    const outcomes = await Promise.allSettled([
      first.rollback(manifestId),
      second.rollback(manifestId),
    ]);

    const winners = outcomes.filter((o) => o.status === "fulfilled");
    const losers = outcomes.filter((o) => o.status === "rejected");

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);

    const won = winners[0];
    if (won?.status === "fulfilled") {
      expect(won.value.success).toBe(3);
      expect(won.value.failed).toBe(0);
    }

    // The loser must say the manifest is gone, not act on it anyway.
    const lost = losers[0];
    if (lost?.status === "rejected") {
      expect(lost.reason).toBeInstanceOf(ValidationError);
      expect(String((lost.reason as Error).message)).toMatch(/not found/i);
    }

    // All three files are back exactly once, and the manifest is spent.
    expect(await exists(from)).toBe(true);
    expect(await exists(two)).toBe(true);
    expect(await exists(three)).toBe(true);
    expect(await exists(path.join(docs, "one.txt"))).toBe(false);
    expect(await exists(path.join(storageDir, `${manifestId}.json`))).toBe(false);
  });

  it("releases the lock after a failed undo so the next one is not blocked", async () => {
    // A lock held forever by a thrown undo would turn one bad manifest into a
    // directory nobody can undo anything in.
    const { manifestId } = await organizeOneFile();
    await corruptSignature(manifestId);

    await expect(rollbackService.rollback(manifestId)).rejects.toThrow();

    // Repair the signature and undo for real: reaching the file at all proves
    // the lock was handed back.
    const filePath = path.join(storageDir, `${manifestId}.json`);
    const manifest = JSON.parse(await fs.readFile(filePath, "utf-8")) as {
      signature: string;
    };
    const { manifestIntegrityService } = await import(
      "../../../../src/core/organize/manifest-integrity.js"
    );
    manifest.signature = manifestIntegrityService.computeSignature(
      manifest as never,
    );
    await fs.writeFile(filePath, JSON.stringify(manifest, null, 2));

    const result = await rollbackService.rollback(manifestId);
    expect(result.success).toBe(1);
  });
});

describe("manifest_id is validated at the schema layer", () => {
  it("rejects a malformed id as a validation error, not a lookup failure", async () => {
    // A bare z.string() meant a typo travelled all the way to the filesystem
    // and came back as "not found", which reads like a real undo history
    // problem. Both tools take the same field, so both are asserted.
    const result = await handleUndoLastOperation({
      manifest_id: "not-a-uuid",
      response_format: "json",
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("manifest_id must be a UUID");
  });
});