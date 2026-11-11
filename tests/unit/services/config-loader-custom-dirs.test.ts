/**
 * Regression test for BUG-64: loadCustomAllowedDirs must reject non-string entries
 */

import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("loadCustomAllowedDirs - BUG-64", () => {
  let tempDir: string;
  let configPath: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-test-"));
    configPath = path.join(tempDir, "config.json");
    originalHome = process.env.HOME;
    // Set HOME to tempDir so getUserConfigPath uses it on Linux
    process.env.HOME = tempDir;
  });

  afterEach(() => {
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    jest.resetModules();
  });

  it("rejects non-string entries like [123] with honest diagnostic", async () => {
    // Write config with non-string entry
    const configDir = path.join(tempDir, ".config", "file-organizer-mcp");
    fs.mkdirSync(configDir, { recursive: true });
    const badConfigPath = path.join(configDir, "config.json");
    fs.writeFileSync(badConfigPath, JSON.stringify({ customAllowedDirectories: [123] }), "utf-8");

    const { loadCustomAllowedDirs } = await import("../../../src/core/config/loader.js");
    const result = loadCustomAllowedDirs();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
  });

  it("still loads valid string entries like ~/data style paths", async () => {
    // Create a valid directory
    const validDir = path.join(tempDir, "data");
    fs.mkdirSync(validDir, { recursive: true });

    const configDir = path.join(tempDir, ".config", "file-organizer-mcp");
    fs.mkdirSync(configDir, { recursive: true });
    const validConfigPath = path.join(configDir, "config.json");
    // Use ~/data style
    fs.writeFileSync(validConfigPath, JSON.stringify({ customAllowedDirectories: ["~/data"] }), "utf-8");

    const { loadCustomAllowedDirs } = await import("../../../src/core/config/loader.js");
    const result = loadCustomAllowedDirs();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
  });
});
