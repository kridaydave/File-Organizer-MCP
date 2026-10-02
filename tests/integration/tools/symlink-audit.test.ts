/**
 * find_broken_symlinks — behavioral tests.
 *
 * Covers what the issue names: a dangling link, a link resolving outside the
 * allowed roots, and a clean directory with nothing to report. A link loop
 * case pins the third kind so the walk cannot spin on it.
 *
 * The sandbox lives under os.tmpdir() and is granted through
 * CONFIG.paths.customAllowed, which is also what keeps the escape targets out
 * of the allowed roots. The escape target for the link test is the filesystem
 * root, which exists on every platform and is never inside the allowed roots.
 *
 * Symlink creation on Windows needs Administrator or Developer Mode, so the
 * whole suite is skipped there with that reason rather than failing on EPERM.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import fs from "fs/promises";
import os from "os";
import path from "path";

const { CONFIG } = await import("../../../src/config.js");
const { handleFindBrokenSymlinks } =
  await import("../../../src/tools/symlink-audit.js");

const describeSymlinks =
  process.platform === "win32" ? describe.skip : describe;

describeSymlinks("find_broken_symlinks", () => {
  let testDir: string;
  let restoreCustomAllowed: string[] | undefined;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "symlink-audit-"));
    restoreCustomAllowed = CONFIG.paths._overrideCustomAllowed;
    CONFIG.paths.customAllowed = [os.tmpdir()];
  });

  afterEach(async () => {
    CONFIG.paths.customAllowed = restoreCustomAllowed;
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  type Finding = {
    path: string;
    link_target: string;
    kind: string;
    detail: string;
    resolved_target?: string;
  };

  async function audit(directory: string) {
    const res = await handleFindBrokenSymlinks({
      directory,
      response_format: "json",
    });
    expect(res.isError).toBeUndefined();
    return res.structuredContent as {
      scanned_count: number;
      truncated: boolean;
      total_count: number;
      dangling_count: number;
      escaping_count: number;
      circular_count: number;
      findings: Finding[];
    };
  }

  it("reports a dangling link with its raw link target", async () => {
    const missing = path.join(testDir, "no-such-file.txt");
    await fs.symlink(missing, path.join(testDir, "dangling.txt"));

    const out = await audit(testDir);
    // The tool reports canonical paths because validation and
    // resolveExistingAncestor both realpath. macOS answers /private/var for
    // a /var path, so compare canonical forms on both sides rather than
    // pinning one platform's spelling.
    const realTestDir = await fs.realpath(testDir);

    expect(out.scanned_count).toBe(1);
    expect(out.total_count).toBe(1);
    expect(out.dangling_count).toBe(1);
    expect(out.escaping_count).toBe(0);
    expect(out.findings).toEqual([
      {
        path: path.join(realTestDir, "dangling.txt"),
        link_target: missing,
        kind: "dangling",
        detail: "Target does not exist",
        resolved_target: path.join(realTestDir, "no-such-file.txt"),
      },
    ]);
  });

  it("reports a link resolving outside the allowed roots", async () => {
    await fs.symlink(
      path.parse(os.tmpdir()).root,
      path.join(testDir, "escape"),
    );

    const out = await audit(testDir);

    expect(out.scanned_count).toBe(1);
    expect(out.total_count).toBe(1);
    expect(out.escaping_count).toBe(1);
    expect(out.dangling_count).toBe(0);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]?.kind).toBe("escapes_allowed_roots");
    expect(out.findings[0]?.link_target).toBe(path.parse(os.tmpdir()).root);
    expect(out.findings[0]?.resolved_target).toBe(path.parse(os.tmpdir()).root);
  });

  it("finds nothing in a clean directory with one healthy link", async () => {
    const real = path.join(testDir, "real.txt");
    await fs.writeFile(real, "content");
    await fs.symlink(real, path.join(testDir, "good-link.txt"));

    const out = await audit(testDir);

    expect(out.scanned_count).toBe(1);
    expect(out.total_count).toBe(0);
    expect(out.findings).toEqual([]);
    expect(out.dangling_count).toBe(0);
    expect(out.escaping_count).toBe(0);
    expect(out.circular_count).toBe(0);
  });

  it("classifies a link loop as circular without hanging", async () => {
    const a = path.join(testDir, "loop-a");
    const b = path.join(testDir, "loop-b");
    await fs.symlink(b, a);
    await fs.symlink(a, b);

    const out = await audit(testDir);

    expect(out.total_count).toBe(2);
    expect(out.circular_count).toBe(2);
    expect(out.findings.map((f) => f.kind)).toEqual(["circular", "circular"]);
  });

  it("does not descend into a symlinked directory", async () => {
    // The linked directory is itself inside the allowed roots, so it is a
    // healthy link. Walking into it would have counted its file as a scan.
    const linked = await fs.mkdtemp(path.join(os.tmpdir(), "linked-"));
    try {
      await fs.writeFile(path.join(linked, "inside.txt"), "content");
      await fs.symlink(linked, path.join(testDir, "linked-dir"));

      const out = await audit(testDir);

      expect(out.total_count).toBe(0);
      expect(out.scanned_count).toBe(1);
    } finally {
      await fs.rm(linked, { recursive: true, force: true });
    }
  });

  it("does not descend into a subdirectory replaced by a symlink after listing", async () => {
    // The window the walk has to survive: realpath + readdir at the root, then
    // descent into each subdirectory. `sub` is a real directory when the root
    // listing is taken and a symlink to an outside directory by the time the
    // walk descends. The swap happens inside the readdir wrapper, so it lands
    // in exactly that window.
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "audit-outside-"));
    const stashed = await fs.mkdtemp(path.join(os.tmpdir(), "audit-stashed-"));
    const realRoot = await fs.realpath(testDir);
    const realOutside = await fs.realpath(outside);
    // Only the root is allowed, so a link into `outside` counts as escaping.
    CONFIG.paths.customAllowed = [realRoot];

    // Real symlinks, planted by hand. `planted-link` is only reachable by
    // escaping into `outside`; `inner-link` only by descending into `sub`.
    await fs.symlink(
      path.join(realOutside, "missing"),
      path.join(realOutside, "planted-link"),
    );
    await fs.mkdir(path.join(testDir, "sub", "inner"), { recursive: true });
    await fs.symlink(
      path.join(testDir, "sub", "inner", "missing"),
      path.join(testDir, "sub", "inner", "inner-link"),
    );

    const realReaddir = fs.readdir;
    let swapped = false;
    const spy = jest
      .spyOn(fs, "readdir")
      .mockImplementation(async (target, options) => {
        const entries = await realReaddir(target, options);
        if (!swapped && (target as string) === realRoot) {
          swapped = true;
          await fs.rename(path.join(testDir, "sub"), path.join(stashed, "sub"));
          await fs.symlink(outside, path.join(testDir, "sub"));
        }
        return entries;
      });

    try {
      const out = await audit(testDir);

      // `sub` is audited as a link, never entered.
      expect(out.findings).toEqual([
        {
          path: path.join(realRoot, "sub"),
          link_target: outside,
          kind: "escapes_allowed_roots",
          detail: "Target resolves outside the allowed directories",
          resolved_target: realOutside,
        },
      ]);
      expect(out.scanned_count).toBe(1);
      expect(out.escaping_count).toBe(1);
      expect(out.dangling_count).toBe(0);
    } finally {
      spy.mockRestore();
      await fs.rm(outside, { recursive: true, force: true });
      await fs.rm(stashed, { recursive: true, force: true });
    }
  });

  it("reports truncated when a subdirectory sits past the max scan depth", async () => {
    const deep = path.join(
      testDir,
      ...Array.from({ length: 12 }, (_, i) => `d${i}`),
    );
    await fs.mkdir(deep, { recursive: true });
    await fs.symlink(path.join(deep, "missing"), path.join(deep, "deep-link"));
    const shallow = path.join(testDir, "d0");
    await fs.symlink(
      path.join(shallow, "missing"),
      path.join(shallow, "shallow-link"),
    );

    const out = await audit(testDir);

    expect(out.truncated).toBe(true);
    // The link above the depth limit is found, the one below it is not.
    // resolved_target is the canonical form; link_target is the raw readlink
    // value, which on macOS keeps the /var -> /private/var spelling because
    // that is how the link was created.
    expect(out.findings.map((f) => f.resolved_target)).toEqual([
      path.join(await fs.realpath(shallow), "missing"),
    ]);
  });

  it("refuses a directory outside the allowed roots", async () => {
    const res = await handleFindBrokenSymlinks({
      directory: path.parse(os.tmpdir()).root,
      response_format: "json",
    });

    expect(res.isError).toBe(true);
  });

  // macOS hands out a tmpdir under /var, which is itself a symlink to
  // /private/var. That makes the audited root and its canonical form two
  // different strings on a supported platform, so the canonical one is what a
  // caller has to be able to compare against.
  it("reports the canonical target when the audited root is itself a symlink", async () => {
    const alias = `${testDir}-alias`;
    await fs.symlink(testDir, alias);
    const nested = path.join(testDir, "nested");
    await fs.mkdir(nested, { recursive: true });
    // Written through the alias, so the raw target keeps the alias spelling
    // while the canonical one does not. That difference is the whole point.
    await fs.symlink(
      path.join(alias, "nested", "missing"),
      path.join(alias, "nested", "link"),
    );

    try {
      const out = await audit(alias);

      expect(out.findings).toHaveLength(1);
      expect(out.findings[0].resolved_target).toBe(
        path.join(await fs.realpath(nested), "missing"),
      );
    } finally {
      await fs.rm(alias, { force: true });
    }
  });
});
