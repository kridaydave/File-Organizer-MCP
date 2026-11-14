/**
 * Regression test for BUG-64: loadCustomAllowedDirs must reject non-string entries
 *
 * The config path is redirected to a sandboxed temp dir via a paths-module
 * mock. Setting process.env.HOME does not work cross-platform: os.homedir()
 * reads USERPROFILE on Windows, and on macOS the user config lives under
 * ~/Library/Application Support, not ~/.config.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import fs from "fs";
import os from "os";
import path from "path";

// The valid directory must sit under the real home dir: loadCustomAllowedDirs
// drops anything outside os.homedir() unless external volumes are allowed,
// so a dir under os.tmpdir() would be filtered out on every platform.
const tempRoot = fs.mkdtempSync(
  path.join(fs.realpathSync(os.tmpdir()), "config-loader-"),
);
const tempConfigPath = path.join(tempRoot, "config.json");

// Import the real module BEFORE registering the mock — importing the same
// specifier inside the factory would resolve to the mock and loop forever.
const actualPaths = await import("../../../src/core/config/paths.js");

jest.unstable_mockModule("../../../src/core/config/paths.js", () => ({
  ...actualPaths,
  getUserConfigPath: () => tempConfigPath,
}));

const { loadCustomAllowedDirs } = await import(
  "../../../src/core/config/loader.js"
);

describe("loadCustomAllowedDirs - BUG-64", () => {
  let validDir: string;

  beforeEach(() => {
    // Under the real home so the loader's isSubPath(home, dir) check passes.
    validDir = fs.mkdtempSync(path.join(os.homedir(), "config-test-"));
    fs.mkdirSync(path.dirname(tempConfigPath), { recursive: true });
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 100));
    try {
      fs.rmSync(validDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("rejects non-string entries like [123] with honest diagnostic", () => {
    // Write config with non-string entry
    fs.writeFileSync(
      tempConfigPath,
      JSON.stringify({ customAllowedDirectories: [123] }),
      "utf-8",
    );

    const result = loadCustomAllowedDirs();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
  });

  it("still loads valid string entries", () => {
    fs.writeFileSync(
      tempConfigPath,
      JSON.stringify({ customAllowedDirectories: [validDir] }),
      "utf-8",
    );

    const result = loadCustomAllowedDirs();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([validDir]);
  });
});
