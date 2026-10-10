/**
 * Cross-process lock for the rollback manifest directory.
 *
 * `RollbackService` reads a manifest, acts on every path it names, and then
 * deletes the file, with nothing holding other processes off. Two undoes
 * racing on the same manifest both pass `getManifest`, both apply their
 * actions, and both unlink. One manifest is spent twice, and the loser can
 * find its files already moved by a batch it never saw. Listing manifest ids
 * to users is what makes this reachable from outside, so the directory now
 * has a lock of its own.
 *
 * This is deliberately not the history lock. That one serializes writers to
 * `operations.jsonl`, a different resource, and sharing it would make the two
 * files contend with each other for a reason no reader could name.
 *
 * The protocol starts from the one in `HistoryLoggerService` — create the lock
 * file with `wx` so only one process can win, record a token inside it, break
 * a lock older than twice the wait window — and adds the two things a critical
 * section of unbounded length needs, which is the difference between this
 * service and that one:
 *
 *   - **Renewal.** History's critical section is one `appendFile`, so its lock
 *     never has to outlive it. An undo moves every file a manifest names and
 *     takes as long as that takes, so a holder renews while it works. The
 *     renewal touches the mtime through the handle the lock was created with,
 *     which addresses an inode rather than a path and so cannot refresh a lock
 *     that replaced it at that path.
 *   - **Ownership.** Renewal reads the path back, and a holder whose token is
 *     no longer there stops where it stands. A critical section that takes
 *     more than one step checks between them, so a reclaimed holder does not
 *     find out at the end.
 *
 * Reclamation is a rename rather than an unlink, for the same reason. Two
 * waiters that both judge the same dead lock can then not both remove it, and
 * the file the rename moves aside is read back before it is dropped, so a live
 * lock that appeared in the meantime is put straight back. `wx` stays the only
 * thing that can hand the lock out.
 *
 * The lock file is a sibling of the manifests and is named `manifests.lock`,
 * so it is not picked up by `listManifests`, which reads `.json` only.
 */

import crypto from "crypto";
import fs from "fs/promises";
import type { Stats } from "fs";
import path from "path";

/**
 * Same wait window `HistoryLoggerService` uses, so a caller that holds both
 * services in one pass never waits in two different time signatures.
 */
const DEFAULT_LOCK_TIMEOUT_MS = 5000;

const LOCK_RETRY_MS = 100;

/** What a holder proves with: the token it wrote, and the file it wrote it through. */
interface HeldLock {
  /** The token this caller wrote, which no other holder can be carrying. */
  token: string;
  /**
   * The handle the lock was created with. Renewing through it is what makes
   * the renewal ownership-safe: the mtime is touched on the inode this caller
   * wrote, never on whatever now sits at the path.
   */
  handle: fs.FileHandle;
}

/** What a critical section holds for as long as it runs. */
export interface ManifestLockLease {
  /**
   * Renew the lock and throw when this caller no longer owns the directory.
   *
   * A critical section that outlives the wait window has to keep proving it is
   * still the holder, and one that takes more than one step has to check
   * between them so a reclaimed holder stops before it touches another file
   * instead of discovering the loss when it tries to finish.
   */
  assertStillOwns(): Promise<void>;
}

export class ManifestLockService {
  private readonly lockFilePath: string;
  private readonly lockTimeoutMs: number;
  /** Renewal cadence: a quarter of the wait window, against a 2x stale line. */
  private readonly renewalMs: number;

  constructor(
    storageDir: string,
    lockTimeoutMs: number = DEFAULT_LOCK_TIMEOUT_MS,
  ) {
    this.lockFilePath = path.join(storageDir, "manifests.lock");
    this.lockTimeoutMs = lockTimeoutMs;
    this.renewalMs = Math.max(1, Math.floor(lockTimeoutMs / 4));
  }

  /**
   * Run `fn` while the manifest directory is held.
   *
   * Rejects when the lock cannot be taken inside the timeout, and always
   * releases, including when `fn` throws, so a failed undo cannot leave the
   * directory locked for the whole staleness window.
   *
   * The lock is renewed on a timer for as long as `fn` runs, and `fn` is handed
   * the lease so it can check ownership of its own. That pair is what lets the
   * lock cover a critical section of unbounded length: without it, an undo that
   * outlives twice the wait window looks abandoned, and a second undo of the
   * same id joins it on the same manifest.
   *
   * The lease is passed rather than kept on the instance, because a lock
   * service that remembers "the current holder" can only describe one of them
   * and has nothing to say about a second.
   */
  async runExclusive<T>(fn: (lease: ManifestLockLease) => Promise<T>): Promise<T> {
    const held = await this.acquireLock();

    // Renewal runs on a timer because the critical section has steps that are
    // not checks: one slow file move is long enough for the lock to look
    // abandoned. The timer only keeps the lock alive, it does not decide
    // anything, because it has no way to stop `fn` — that is the lease's job,
    // and it is called between steps so the stop happens before the next file
    // is touched rather than at the end.
    const renewal = setInterval(() => {
      void this.checkOwnership(held).catch(() => {
        // A renewal that cannot be proven is not worth failing the operation
        // over on its own: the next check, or the release, reads the token back
        // and settles it.
      });
    }, this.renewalMs);
    // A renewal is due work on the event loop, and an undo that is moving files
    // should not have to compete with its own heartbeat for it.
    renewal.unref?.();

    try {
      return await fn({
        assertStillOwns: async () => {
          if (!(await this.checkOwnership(held))) {
            throw new Error(
              "Lost the manifest lock — another process reclaimed the rollback directory while this operation was still running, so it stopped before touching another file",
            );
          }
        },
      });
    } finally {
      clearInterval(renewal);
      await this.releaseLock(held);
    }
  }

  /** Take the lock and return what this caller holds it with. */
  private async acquireLock(): Promise<HeldLock> {
    const deadline = Date.now() + this.lockTimeoutMs;

    while (true) {
      const held = await this.tryAcquireLock();
      if (held) return held;

      if (Date.now() >= deadline) {
        throw new Error(
          "Manifest lock timeout — another undo or restore is stuck on the same directory",
        );
      }
      // Poll no faster than a quarter of the wait window, so a waiter can
      // never wake up past the staleness threshold while the holder lives.
      const sleep = Math.min(LOCK_RETRY_MS, this.lockTimeoutMs / 4);
      await new Promise((resolve) => setTimeout(resolve, sleep));
    }
  }

  /** The held lock when this call won it, or null when someone else has it. */
  private async tryAcquireLock(): Promise<HeldLock | null> {
    const present = await this.readLock();

    // A lock that is still live is someone else's, and a stale one that another
    // waiter has already taken is out of reach too.
    if (present && !present.stale) return null;
    if (present && !(await this.stealStaleLock(present.token))) return null;

    const token = this.newToken();
    try {
      // `wx` fails when the file exists, which is what makes this the winner
      // rather than the last writer. Every path that reaches this point has
      // left the lock file absent, so this create is the only place the lock
      // changes hands.
      const handle = await fs.open(this.lockFilePath, "wx");
      await handle.writeFile(token);
      return { token, handle };
    } catch (error) {
      // Losing the create race is contention and is retried. Anything else —
      // EACCES on a read-only config directory, ENOENT on a missing one,
      // ENOSPC — is a broken environment: reporting it as a timeout sends the
      // caller looking for a stuck process that does not exist.
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return null;
      throw new Error(
        `Manifest lock could not be created (${
          (error as NodeJS.ErrnoException).code ?? "unknown error"
        })`,
        { cause: error },
      );
    }
  }

  /**
   * Take the stale lock out of the way, proving the file that moved is the one
   * that was judged stale.
   *
   * The check and the removal cannot be one syscall, and an unlink in that gap
   * is the race: a waiter that read the same dead lock as another one deletes
   * the replacement the first one created. So the removal is a rename, which is
   * atomic, to a name only this attempt uses, and the file it moved is read
   * back. A lock that is not the one we judged is put back rather than dropped,
   * and a waiter that loses the rename gets ENOENT and retries. Either way only
   * one waiter can reach the create.
   */
  private async stealStaleLock(staleToken: string): Promise<boolean> {
    const tombstone = `${this.lockFilePath}.stale.${this.newToken()}`;

    try {
      await fs.rename(this.lockFilePath, tombstone);
    } catch {
      // Released, or already stolen by a waiter that got there first.
      return false;
    }

    if ((await this.readToken(tombstone)) !== staleToken) {
      // A live lock sits at the path now. Putting it back is the only way to
      // leave its owner holding it; if another replacement is already in place,
      // the copy we hold is a duplicate of nothing and has to go instead.
      const vacant = await fs
        .stat(this.lockFilePath)
        .then(() => false)
        .catch(() => true);
      if (vacant) {
        await fs.rename(tombstone, this.lockFilePath).catch(() => null);
      } else {
        await fs.unlink(tombstone).catch(() => null);
      }
      return false;
    }

    // Named `manifests.lock.stale.*`, so it is not a manifest and nothing reads
    // it back. Dropping it is also what keeps a crashed reclaimer from leaving
    // a second generation of tombstones behind.
    await fs.unlink(tombstone).catch(() => null);
    return true;
  }

  /**
   * Confirm the lock is still this caller's, and renew its age while it is.
   *
   * The mtime is touched through the handle the lock was created with. A
   * read-then-touch on the path would refresh whatever lock is at that path by
   * the time it ran, which is how one holder extends another's lease.
   */
  private async checkOwnership(held: HeldLock): Promise<boolean> {
    let present = await this.readToken(this.lockFilePath);

    // Reclamation moves the lock aside for as long as it takes to prove what it
    // stole, so a single absent read is not proof the lock is gone.
    if (present === null) {
      present = await this.readToken(this.lockFilePath);
    }

    if (present !== held.token) return false;

    await held.handle.utimes(new Date(), new Date()).catch(() => null);
    return true;
  }

  /**
   * Drop the lock, but only while it still carries the caller's own token.
   *
   * Unlinking someone else's lock would end a critical section that is still
   * running, which is worse than leaving this one in place to age out.
   */
  private async releaseLock(held: HeldLock): Promise<void> {
    // Windows refuses to unlink a file a handle still has open, so the handle
    // goes first and the token check happens after it.
    await held.handle.close().catch(() => null);

    try {
      if ((await this.readToken(this.lockFilePath)) === held.token) {
        await fs.unlink(this.lockFilePath).catch(() => null);
      }
    } catch {
      // Releasing is best effort. A lock we fail to drop is reclaimed by the
      // staleness threshold, and unlocking someone else's lock would be worse
      // than leaving this one in place.
    }
  }

  /** The token in a lock file, or null when it is absent or unreadable. */
  private async readToken(filePath: string): Promise<string | null> {
    try {
      return await fs.readFile(filePath, "utf-8");
    } catch {
      return null;
    }
  }

  /**
   * The lock as it stands: the token on disk, and whether it is past the
   * staleness threshold.
   *
   * Reads the token before the age, so both describe one file. A lock replaced
   * between the two reads is judged by its replacement, whose token then fails
   * the steal check and is put back untouched.
   */
  private async readLock(): Promise<{ token: string; stale: boolean } | null> {
    const token = await this.readToken(this.lockFilePath);
    if (token === null) return null;

    const stat = await fs.stat(this.lockFilePath).catch(() => null);
    // Absent again between the two reads, so there is nothing to wait for.
    if (stat === null) return null;

    return { token, stale: this.isStale(stat) };
  }

  private isStale(stat: Stats): boolean {
    // Stale threshold is 2x the wait window: a waiter that polled for the full
    // timeout must never see the holder's live lock cross the staleness line at
    // the exact same moment and steal it. A holder that is still working has
    // renewed well inside this, which is what keeps a long undo from looking
    // abandoned.
    return Date.now() - stat.mtimeMs > this.lockTimeoutMs * 2;
  }

  private newToken(): string {
    return `${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
  }
}
