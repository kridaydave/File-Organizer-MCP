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
import type {
  RollbackManifest,
  RollbackAction,
} from "../../../../src/core/types/system.js";
import type {
  ManifestLockService,
  ManifestLockLease,
} from "../../../../src/core/organize/manifest-lock.js";

const { CONFIG } = await import("../../../../src/config.js");
const { RollbackService } = await import(
  "../../../../src/core/organize/rollback.js"
);
const { ManifestLockService: LockService } = await import(
  "../../../../src/core/organize/manifest-lock.js"
);
const { manifestIntegrityService } = await import(
  "../../../../src/core/organize/manifest-integrity.js"
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

  /**
   * Rewrite a manifest so it was recorded `backMs` ago.
   *
   * Manifest ordering comes from the manifest's own timestamp, and two
   * manifests written in the same millisecond are ordered by nothing. The hash
   * and the signature both cover that timestamp, so they are recomputed here
   * rather than left to the hope that the clock moved on between two writes.
   */
  async function ageManifest(manifestId: string, backMs: number): Promise<void> {
    const filePath = path.join(storageDir, `${manifestId}.json`);
    const manifest = JSON.parse(await fs.readFile(filePath, "utf-8")) as RollbackManifest;
    manifest.timestamp = Date.now() - backMs;
    manifest.hash = manifestIntegrityService.computeHash(
      manifest.actions,
      manifest.timestamp,
    );
    manifest.signature = manifestIntegrityService.computeSignature(manifest);
    await fs.writeFile(filePath, JSON.stringify(manifest, null, 2));
  }

  it("marks a manifest this machine wrote as verified", async () => {
    const { manifestId } = await organizeOneFile();

    const listed = await rollbackService.listManifests();

    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(manifestId);
    expect(listed[0]?.signatureValid).toBe(true);
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
    expect(listed[0]?.signatureValid).toBe(false);
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
    // A createManifest writes the clock's current millisecond, so the older
    // manifest has to be dated back by hand or the two can share a timestamp
    // and neither is newer than the other.
    await ageManifest(olderId, 60_000);

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

/**
 * The lock protocol on its own: what makes the directory exclusive for the
 * whole of a critical section rather than for the first few milliseconds of it.
 *
 * Two services over one directory is two processes as far as the lock is
 * concerned, so the contention cases here use two instances the same way the
 * rollback tests do. Nothing is mocked: a lock that only held against a fake
 * filesystem would be a lock that held against nothing.
 */
describe("manifest lock holds for the whole critical section", () => {
  let lockDir: string;

  beforeEach(async () => {
    lockDir = await fs.mkdtemp(path.join(os.tmpdir(), "manifest-lock-"));
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(lockDir, { recursive: true, force: true });
  });

  /** Where a service over `lockDir` keeps its lock file. */
  function lockFilePath(): string {
    return path.join(lockDir, "manifests.lock");
  }

  /** A service whose wait window is `timeoutMs` wide. */
  function lockService(timeoutMs: number): ManifestLockService {
    return new LockService(lockDir, timeoutMs);
  }

  /** Stand in for work a critical section does between files. */
  async function tick(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  it("renews the lock so an operation that outlives the window keeps it", async () => {
    // An undo is unbounded in time, so a holder that stops refreshing looks dead
    // and a second caller joins it on the same manifest. Renewal is what keeps
    // the directory exclusive for the whole batch.
    //
    // The timings are the whole test, so they are spelled out rather than tuned
    // until it passed. A contender judges staleness against its OWN window, so
    // its stale line sits at 2x400=800 ms and it gives up at 700+400=1100 ms.
    // That ordering is what makes this case reachable: the contender starts
    // after its stale line has passed but before it runs out of patience, so
    // without renewal it takes the lock at ~900 ms while the holder is still
    // working, and with renewal it waits out the full window and gives up.
    // Start the contender earlier or give it a wider window than the holder and
    // it times out for an unrelated reason, which is a test that cannot fail.
    const holder = lockService(200);
    const contender = lockService(400);

    const holding = holder.runExclusive(async () => {
      // Past the contender's stale line, so a holder that stopped refreshing
      // would be reclaimed from under it.
      await tick(1400);
    });
    await tick(700);

    await expect(contender.runExclusive(async () => "got in")).rejects.toThrow(
      /lock timeout/i,
    );

    // Nothing took the directory, so the holder was free to finish in it.
    await holding;
  });

  it("stops a critical section that lost the lock to another process", async () => {
    // A holder that stops refreshing is indistinguishable from a dead one, so
    // the next caller rightly reclaims. What must not happen is the first one
    // carrying on to the next file: it checks and stops where it stands.
    const holder = lockService(60_000);
    const reclaiming = lockService(100);

    let steps = 0;
    const work = holder.runExclusive(async (lease: ManifestLockLease) => {
      steps++;
      await lease.assertStillOwns();

      // Age the lock past any window, the way a process that stopped renewing
      // would leave it, and let the other caller take over.
      const old = new Date(Date.now() - 60_000);
      await fs.utimes(lockFilePath(), old, old);
      await reclaiming.runExclusive(async () => {});

      steps++;
      await lease.assertStillOwns();

      steps++;
    });

    await expect(work).rejects.toThrow(/lost the manifest lock/i);
    expect(steps).toBe(2);
  });

  it("does not call the lock lost while a reclaimer is putting it back", async () => {
    // A reclaimer that stole the wrong lock moves it aside, reads the
    // tombstone, and puts it back. The path is empty for that whole window, so
    // a holder checking ownership in it must wait the window out instead of
    // aborting a healthy undo as lost.
    const service = lockService(60_000);

    await service.runExclusive(async (lease: ManifestLockLease) => {
      const aside = `${lockFilePath()}.stale.probe`;
      await fs.rename(lockFilePath(), aside);
      // Restore after the holder's first absent read has landed, but inside
      // the window its second read waits out.
      const putBack = tick(5).then(() => fs.rename(aside, lockFilePath()));

      await expect(lease.assertStillOwns()).resolves.toBeUndefined();
      await putBack;
    });
  });

  it("lets exactly one of several waiters take over a dead lock", async () => {
    // Two callers that both judge the same dead lock must not both be able to
    // remove it: the second one's unlink would delete the replacement the first
    // one created, and both would hold the directory at once.
    await fs.writeFile(lockFilePath(), "a-token-from-a-dead-holder");
    const old = new Date(Date.now() - 60_000);
    await fs.utimes(lockFilePath(), old, old);

    const entered: string[] = [];
    let running = 0;
    let mostConcurrent = 0;

    const attempts = ["one", "two", "three", "four"].map((name) =>
      lockService(120).runExclusive(async () => {
        entered.push(name);
        running++;
        mostConcurrent = Math.max(mostConcurrent, running);
        await tick(10);
        running--;
      }),
    );

    const outcomes = await Promise.allSettled(attempts);

    // Every caller goes through the directory, but never two at once: the batch
    // of waiters serializes instead of several of them holding at the same time.
    expect(entered).toHaveLength(4);
    expect(mostConcurrent).toBe(1);
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(4);

    // Reclamation moves the lock aside under a name only it uses, so nothing is
    // left behind for the next caller to trip over.
    const left = await fs.readdir(lockDir);
    expect(left.filter((f) => f.includes(".stale."))).toEqual([]);
  });

  it("does not report the lock lost while a reclaimer has it moved aside", async () => {
    // Reclamation moves the lock aside, reads what it stole, and puts a live
    // lock straight back. A holder that checks inside that window sees the
    // path empty twice in a row, and used to conclude the lock was gone and
    // abort an undo that had lost nothing.
    const service = lockService(60_000);

    await service.runExclusive(async (lease: ManifestLockLease) => {
      const tombstone = `${lockFilePath()}.stale.test`;
      await fs.rename(lockFilePath(), tombstone);

      // The check reads the path, finds nothing, and waits before concluding.
      // The lock comes back inside that wait, the way a put-back would.
      const checking = lease.assertStillOwns();
      await tick(5);
      await fs.rename(tombstone, lockFilePath());

      await expect(checking).resolves.toBeUndefined();
    });
  });

  it("reports a directory it cannot write to instead of timing out", async () => {
    // EACCES, ENOENT and ENOSPC used to surface after the whole wait window as
    // "another undo is stuck", which sends the caller looking for a process
    // that does not exist.
    const absent = path.join(lockDir, "no-such-directory");

    await expect(
      new LockService(absent, 40).runExclusive(async () => "never runs"),
    ).rejects.toThrow(/ENOENT/);
  });

  it("times a waiter out against a lock that is still being used", async () => {
    // The other half of the contract: a live lock is waited for, not stolen
    // from, and a caller gives up with a timeout rather than assuming.
    const holder = lockService(100);
    const waiter = lockService(60);

    const holding = holder.runExclusive(async () => {
      await tick(120);
    });

    await expect(waiter.runExclusive(async () => "got in")).rejects.toThrow(
      /lock timeout/i,
    );

    await holding;
  });

  it("hands the directory to a waiter parked through a holder's throw", async () => {
    // The release path has to run when the critical section fails, not only
    // when it returns. One bad manifest that leaves the lock behind locks the
    // directory out until the staleness window passes, and every waiter parks
    // on it in the meantime.
    const holder = lockService(60_000);
    const waiter = lockService(1000);

    const events: string[] = [];
    let markStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });

    const failing = holder.runExclusive(async () => {
      events.push("holder");
      markStarted();
      await tick(50);
      throw new Error("boom");
    });

    // The holder's callback is running, so the lock exists and the waiter's
    // first poll fails. It parks in the retry loop until the throw releases.
    await started;
    const waiting = waiter.runExclusive(async () => {
      events.push("waiter");
      return "got in";
    });

    await expect(failing).rejects.toThrow("boom");
    await expect(waiting).resolves.toBe("got in");

    // The waiter entered after the throw, so the throw is what released.
    expect(events).toEqual(["holder", "waiter"]);
  });
});

/**
 * The same guarantee as observed from the undo itself.
 *
 * The lock-level cases above pin the protocol. This one pins what a caller
 * sees: an undo that is still running keeps the directory, so a second undo of
 * the same id cannot start applying its own moves while the first is mid-batch.
 */
describe("an undo holds the directory for as long as it runs", () => {
  let dataDir: string;
  let storageDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "manifest-hold-"));
    storageDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "manifest-hold-store-"),
    );
    CONFIG.paths.customAllowed = [dataDir];
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(dataDir, { recursive: true, force: true });
    await fs.rm(storageDir, { recursive: true, force: true });
  });

  /**
   * A manifest that moves `count` files, with the files already moved, so an
   * undo has one real move to reverse per action.
   */
  async function moveManifest(
    service: RollbackServiceInstance,
    count: number,
  ): Promise<{ manifestId: string; inPlace: string; moved: string }> {
    const docs = path.join(dataDir, "Documents");
    await fs.mkdir(docs, { recursive: true });

    const actions: RollbackAction[] = [];
    for (let i = 0; i < count; i++) {
      const source = path.join(dataDir, `file-${i}.txt`);
      const target = path.join(docs, `file-${i}.txt`);
      await fs.writeFile(source, `contents ${i}`);
      await fs.rename(source, target);
      actions.push({
        type: "move" as const,
        originalPath: source,
        currentPath: target,
        timestamp: Date.now(),
      });
    }

    const manifestId = await service.createManifest("A batch of moves", actions);
    return { manifestId, inPlace: dataDir, moved: docs };
  }

  it("keeps a second undo out while the first is still applying", async () => {
    // Enough actions that the undo outlives the lock's window, which is the
    // case where an un-renewed lock would be reclaimed mid-batch.
    const first = new RollbackService(storageDir, 10);
    const { manifestId, inPlace, moved } = await moveManifest(first, 60);
    const second = new RollbackService(storageDir, 10);

    const running = first.rollback(manifestId);
    // Let the first caller take the lock before the second one asks for it, so
    // the two are a holder and a waiter rather than a coin toss.
    await new Promise((resolve) => setTimeout(resolve, 5));

    const outcomes = await Promise.allSettled([
      running,
      second.rollback(manifestId),
    ]);

    const winners = outcomes.filter((o) => o.status === "fulfilled");
    const losers = outcomes.filter((o) => o.status === "rejected");

    // One undo runs the batch; the other is refused, by lock timeout or by the
    // manifest already being spent. What must not happen is both of them
    // applying the batch, which is what an unrenewed lock allowed.
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);

    const won = winners[0];
    if (won?.status === "fulfilled") {
      expect(won.value.success).toBe(60);
      expect(won.value.failed).toBe(0);
    }
    const lost = losers[0];
    if (lost?.status === "rejected") {
      expect(String((lost.reason as Error).message)).toMatch(
        /timeout|not found/i,
      );
    }

    // The batch was undone once, and the manifest is gone.
    const restored = (
      await fs.readdir(inPlace, { withFileTypes: true })
    ).filter((entry) => entry.isFile());
    expect(restored).toHaveLength(60);
    expect(await fs.readdir(moved)).toHaveLength(0);
    await expect(
      fs.access(path.join(storageDir, `${manifestId}.json`)),
    ).rejects.toThrow();
  });
});