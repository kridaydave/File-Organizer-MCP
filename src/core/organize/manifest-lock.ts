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
 * files contend with each other for a reason no reader could name. The
 * token-and-staleness protocol is copied from
 * `src/services/history-logger.service.ts` because that is the tested one:
 * create the lock file with `wx` so only one process can win, record a token
 * inside it, break a lock older than twice the wait window, and on release
 * only unlink a lock that still carries your own token.
 *
 * The lock file is a sibling of the manifests and is named `manifests.lock`,
 * so it is not picked up by `listManifests`, which reads `.json` only.
 */

import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

/**
 * Same wait window `HistoryLoggerService` uses, so a caller that holds both
 * services in one pass never waits in two different time signatures.
 */
const DEFAULT_LOCK_TIMEOUT_MS = 5000;

const LOCK_RETRY_MS = 100;

export class ManifestLockService {
  private readonly lockFilePath: string;
  private readonly lockTimeoutMs: number;

  constructor(
    storageDir: string,
    lockTimeoutMs: number = DEFAULT_LOCK_TIMEOUT_MS,
  ) {
    this.lockFilePath = path.join(storageDir, "manifests.lock");
    this.lockTimeoutMs = lockTimeoutMs;
  }

  /**
   * Run `fn` while the manifest directory is held.
   *
   * Rejects when the lock cannot be taken inside the timeout, and always
   * releases, including when `fn` throws, so a failed undo cannot leave the
   * directory locked for the whole staleness window.
   *
   * The token is passed between acquire and release rather than kept on the
   * instance, because a lock service that remembers "the current token" can
   * only describe one holder and has nothing to say about a second.
   */
  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const token = await this.acquireLock();
    try {
      return await fn();
    } finally {
      await this.releaseLock(token);
    }
  }

  /** Take the lock and return the token proving this caller holds it. */
  private async acquireLock(): Promise<string> {
    const deadline = Date.now() + this.lockTimeoutMs;

    while (true) {
      const token = await this.tryAcquireLock();
      if (token) return token;

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

  /** The token written when this call won the lock, or null when it lost. */
  private async tryAcquireLock(): Promise<string | null> {
    try {
      const stat = await fs.stat(this.lockFilePath).catch(() => null);

      if (stat) {
        // Stale threshold is 2x the wait window: a waiter that polled for the
        // full timeout must never see the holder's live lock cross the
        // staleness line at the same moment and steal it.
        const staleAfterMs = this.lockTimeoutMs * 2;
        const lockAge = Date.now() - stat.mtimeMs;
        if (lockAge > staleAfterMs) {
          await fs.unlink(this.lockFilePath).catch(() => null);
        } else {
          return null;
        }
      }

      const token = `${process.pid}-${Date.now()}-${crypto
        .randomBytes(8)
        .toString("hex")}`;
      // `wx` fails when the file exists, which is what makes this the winner
      // rather than the last writer.
      await fs.writeFile(this.lockFilePath, token, { flag: "wx" });
      return token;
    } catch {
      return null;
    }
  }

  /** Unlink the lock only while it still carries the caller's own token. */
  private async releaseLock(token: string): Promise<void> {
    try {
      const content = await fs
        .readFile(this.lockFilePath, "utf-8")
        .catch(() => null);
      if (content === token) {
        await fs.unlink(this.lockFilePath).catch(() => null);
      }
    } catch {
      // Releasing is best effort. A lock we fail to drop is reclaimed by the
      // staleness threshold, and unlocking someone else's lock would be worse
      // than leaving this one in place.
    }
  }
}
