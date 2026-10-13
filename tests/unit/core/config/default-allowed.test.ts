/**
 * The test-mode allow-list in `getDefaultAllowedDirs`.
 *
 * The function carries a bypass for directories that may not exist on a CI
 * runner. A bypass only spares a directory the existence filter would drop:
 * it cannot add one that was never a candidate. `os.tmpdir()` sat in that
 * bypass while never being a candidate, so it read as always-allowed and was
 * never allowed, and every test needing a `mkdtemp` fixture widened
 * `CONFIG.paths.customAllowed` by hand to compensate.
 *
 * These asserts pin what the list actually is, so the next reader does not
 * re-derive the wrong conclusion from the bypass.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect } from "@jest/globals";
import { getDefaultAllowedDirs } from "../../../../src/core/config/paths.js";

describe("getDefaultAllowedDirs under jest", () => {
  const allowed = getDefaultAllowedDirs();

  it("includes the project directory, which is the cwd under jest", () => {
    expect(allowed).toContain(process.cwd());
  });

  it("keeps the bypassed home source dirs allowed even when they do not exist", () => {
    // The bypass's actual job. On a CI runner these are usually absent, and
    // without the bypass the existence filter would drop them.
    expect(allowed).toContain(path.join(os.homedir(), "Downloads"));
    expect(allowed).toContain(path.join(os.homedir(), "Desktop"));
  });

  it("does not allow the temp directory, and a bypass entry cannot change that", () => {
    // Pinned because the comment above the bypass reads as though it did. It
    // is not a candidate, so it is filtered out whatever the bypass claims.
    // A test fixture needs it allowed must widen CONFIG.paths.customAllowed,
    // which is the shape once-single-pass and export-report already use.
    expect(allowed).not.toContain(os.tmpdir());
    expect(
      allowed.some(
        (dir) => dir === os.tmpdir() || dir.startsWith(os.tmpdir() + path.sep),
      ),
    ).toBe(false);
  });

  it("still drops a candidate that does not exist and is not bypassed", () => {
    // Guards against the fix becoming a blanket allow.
    const missing = path.join(os.homedir(), `fom-absent-${process.pid}`);
    expect(fs.existsSync(missing)).toBe(false);
    expect(allowed).not.toContain(missing);
  });

  it("lists no directory twice", () => {
    expect(new Set(allowed).size).toBe(allowed.length);
  });
});
