/**
 * Regression test for BUG-16: loadCustomAllowedDirs returns tilde paths unexpanded
 */

import os from "os";
import path from "path";
import fs from "fs";
import { jest } from "@jest/globals";

const testHome = fs.mkdtempSync(path.join(os.tmpdir(), "fo-tilde-test-"));
const dataDir = path.join(testHome, "data");
fs.mkdirSync(dataDir, { recursive: true });

const configDir = path.join(testHome, ".config", "file-organizer-mcp");
fs.mkdirSync(configDir, { recursive: true });
const configPath = path.join(configDir, "config.json");

const actualPaths = await import("../../../src/core/config/paths.js");

jest.unstable_mockModule("../../../src/core/config/paths.js", () => ({
  ...actualPaths,
  getUserConfigPath: () => configPath,
}));

const { loadCustomAllowedDirs } = await import("../../../src/core/config/loader.js");

describe("BUG-16: loadCustomAllowedDirs tilde expansion", () => {
  const originalHomedir = os.homedir;

  beforeEach(() => {
    (os as any).homedir = () => testHome;
    try {
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    (os as any).homedir = originalHomedir;
    try {
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }
    } catch {
      // ignore
    }
  });

  it("expands tilde paths in customAllowedDirectories", () => {
    fs.writeFileSync(configPath, JSON.stringify({ customAllowedDirectories: ["~/data"] }));
    const allowed = loadCustomAllowedDirs();
    expect(allowed.length).toBe(1);
    expect(allowed[0]).toBe(dataDir);
    expect(allowed[0]).not.toBe("~/data");
  });
});
