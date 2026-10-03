/**
 * findEmptyDirectories — the emptiness rule itself.
 *
 * The issue names the cases that matter: nested empty directories, a directory
 * holding only dotfiles, and a directory holding a file. The dotfile case is
 * the load-bearing one, because a cleanup step that deleted a directory
 * because it "looked empty" would take .git with it.
 *
 * The sandbox lives under os.tmpdir() and is granted through
 * CONFIG.paths.customAllowed. Paths are compared against fs.realpath of the
 * temp dir because validation and resolveExistingAncestor both realpath, and
 * macOS answers /private/var for a /var path.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import fs from "fs/promises";
import os from "os";
import path from "path";

const { CONFIG } = await import("../../../../src/config.js");
const { findEmptyDirectories } =
  await import("../../../../src/core/scan/empty-dirs.js");

describe("findEmptyDirectories", () => {
  let testDir: string;
  let realTestDir: string;
  let restoreCustomAllowed: string[] | undefined;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "empty-dirs-"));
    realTestDir = await fs.realpath(testDir);
    restoreCustomAllowed = CONFIG.paths._overrideCustomAllowed;
    CONFIG.paths.customAllowed = [os.tmpdir()];
  });

  afterEach(async () => {
    CONFIG.paths.customAllowed = restoreCustomAllowed;
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  /** Resolve an absolute path under the sandbox to its canonical form. */
  async function real(...segments: string[]): Promise<string> {
    return fs.realpath(path.join(testDir, ...segments));
  }

  it("reports nested empty directories but not the root that holds them", async () => {
    await fs.mkdir(path.join(testDir, "a"));
    await fs.mkdir(path.join(testDir, "a", "b"));
    await fs.mkdir(path.join(testDir, "a", "b", "c"));

    const out = await findEmptyDirectories(testDir);

    // c is the only leaf with no entries. b holds c and a holds b, so neither
    // is empty, and the root holds a.
    expect(out.total_count).toBe(1);
    expect(out.empty_dirs).toEqual([await real("a", "b", "c")]);
    expect(out.empty_dirs).not.toContain(realTestDir);
    expect(out.depth_limited).toBe(false);
    expect(out.result_limited).toBe(false);
  });

  it("treats a directory holding only dotfiles as non-empty", async () => {
    await fs.mkdir(path.join(testDir, "dotonly"));
    await fs.writeFile(path.join(testDir, "dotonly", ".hidden"), "x");
    await fs.writeFile(path.join(testDir, "dotonly", ".DS_Store"), "y");

    const out = await findEmptyDirectories(testDir);

    expect(out.total_count).toBe(0);
    expect(out.empty_dirs).toEqual([]);
  });

  it("reports an empty dot-directory, which really is empty", async () => {
    await fs.mkdir(path.join(testDir, "dotonly"));
    await fs.writeFile(path.join(testDir, "dotonly", ".hidden"), "x");
    await fs.mkdir(path.join(testDir, "dotonly", ".hiddendir"));

    const out = await findEmptyDirectories(testDir);

    // dotonly holds entries so it is not reported; .hiddendir holds none.
    expect(out.empty_dirs).toEqual([await real("dotonly", ".hiddendir")]);
  });

  it("treats a directory holding a file as non-empty", async () => {
    await fs.mkdir(path.join(testDir, "withfile"));
    await fs.writeFile(path.join(testDir, "withfile", "notes.txt"), "hi");

    const out = await findEmptyDirectories(testDir);

    expect(out.total_count).toBe(0);
  });

  it("treats a directory holding only a subdirectory as non-empty", async () => {
    // b is empty, but a holds b so a is not empty and is not proposed for
    // removal ahead of b.
    await fs.mkdir(path.join(testDir, "a"));
    await fs.mkdir(path.join(testDir, "a", "b"));

    const out = await findEmptyDirectories(testDir);

    expect(out.empty_dirs).toEqual([await real("a", "b")]);
  });

  it("reports the root itself when it holds nothing", async () => {
    const out = await findEmptyDirectories(testDir);

    expect(out.total_count).toBe(1);
    expect(out.empty_dirs).toEqual([realTestDir]);
  });

  it("scans only the root when recursion is off", async () => {
    await fs.mkdir(path.join(testDir, "empty-child"));

    const out = await findEmptyDirectories(testDir, { recurse: false });

    // The root holds empty-child, so it is not empty, and the child was never
    // descended into.
    expect(out.total_count).toBe(0);
    expect(out.scanned_count).toBe(1);
  });

  it("does not descend past max_depth and reports depth_limited", async () => {
    await fs.mkdir(path.join(testDir, "level1", "level2"), { recursive: true });

    const out = await findEmptyDirectories(testDir, { maxDepth: 1 });

    expect(out.empty_dirs).toEqual([]);
    expect(out.depth_limited).toBe(true);
  });

  it("stops at the result cap and reports result_limited", async () => {
    await fs.mkdir(path.join(testDir, "one"));
    await fs.mkdir(path.join(testDir, "two"));
    await fs.mkdir(path.join(testDir, "three"));

    const out = await findEmptyDirectories(testDir, { limit: 2 });

    expect(out.empty_dirs).toHaveLength(2);
    expect(out.limit).toBe(2);
    expect(out.result_limited).toBe(true);
  });

  it("does not report result_limited when the cap is exactly reached", async () => {
    await fs.mkdir(path.join(testDir, "one"));

    const out = await findEmptyDirectories(testDir, { limit: 1 });

    expect(out.total_count).toBe(1);
    expect(out.result_limited).toBe(false);
  });

  it("throws when the root does not exist rather than reporting zero", async () => {
    await expect(
      findEmptyDirectories(path.join(testDir, "no-such-dir")),
    ).rejects.toThrow(/does not exist/i);
  });

  it("throws when the root is a file", async () => {
    const file = path.join(testDir, "afile.txt");
    await fs.writeFile(file, "hi");

    await expect(findEmptyDirectories(file)).rejects.toThrow(
      /not a directory/i,
    );
  });

  it("returns results sorted so the order is stable", async () => {
    for (const name of ["c", "a", "b"]) {
      await fs.mkdir(path.join(testDir, name));
    }

    const out = await findEmptyDirectories(testDir);

    expect(out.empty_dirs).toEqual([
      await real("a"),
      await real("b"),
      await real("c"),
    ]);
  });
});