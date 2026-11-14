/**
 * Portability perturbation profile (activated by FO_PORTABILITY=1).
 *
 * AGENTS.md rule 3 lists five ways a platform value leaks into a contract or
 * an assertion, and CI cannot see any of them because every Linux runner
 * behaves alike: /tmp is never a symlink, readdir is deterministic-enough,
 * and the five leak classes stay invisible until a macOS or Windows leg runs
 * the specific test that trips one.
 *
 * This setup makes Linux lie about those things for one run of the suite:
 *
 * 1. readdir order is shuffled on every call, so any test comparing an
 *    unsorted readdir against a fixed array fails the way it would on a
 *    different filesystem.
 * 2. os.tmpdir() returns a symlink whose target is the real directory, so
 *    tmpdir's realpath differs from tmpdir itself, the way /var differs from
 *    /private/var on macOS. Tests that canonicalise once with
 *    fs.realpathSync(os.tmpdir()) behave identically; tests that spell the
 *    path one way and resolve it another meet the failure their author was
 *    told to expect.
 *
 * Install with `npm run test:portability` (or FO_PORTABILITY=1 npm test).
 * A red run here is a portability finding, not flakiness: rerun once, and if
 * the same test fails again, fix the test the way AGENTS.md rule 3 prescribes.
 */

import fs from "fs";
import os from "os";
import path from "path";

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = items[i] as T;
    items[i] = items[j] as T;
    items[j] = swap;
  }
  return items;
}

// ── 1. readdir order ────────────────────────────────────────────────────────

const readdirPromises = fs.promises.readdir.bind(fs.promises) as typeof fs.promises.readdir;
fs.promises.readdir = (async (...args: Parameters<typeof fs.promises.readdir>) =>
  shuffle(await readdirPromises(...args))) as typeof fs.promises.readdir;

const readdirSync = fs.readdirSync.bind(fs) as typeof fs.readdirSync;
fs.readdirSync = ((...args: Parameters<typeof fs.readdirSync>) =>
  shuffle(readdirSync(...args))) as typeof fs.readdirSync;

// ── 2. tmpdir behind a symlink ──────────────────────────────────────────────

// Created once per worker process; jest setupFiles run before the test module
// graph imports CONFIG, so every path CONFIG derives from tmpdir goes through
// the link, which is the point.
const realRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "fo-portable-"));
const linkRoot = path.join(path.dirname(realRoot), `fo-portable-link-${path.basename(realRoot)}`);
fs.symlinkSync(realRoot, linkRoot, "dir");

const realTmpdir = os.tmpdir.bind(os);
os.tmpdir = () => linkRoot;

process.on("exit", () => {
  try {
    fs.rmSync(linkRoot, { force: true });
    fs.rmSync(realRoot, { recursive: true, force: true });
  } catch {
    // Best-effort: a leftover temp dir is noise, not a failure.
  }
});
