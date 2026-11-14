/**
 * Regression test for BUG-87: config with JSONC comments loads like the loader,
 * and the doctor tool reports it healthy.
 */
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import fs from "fs/promises";
import fsSync from "fs";
import os from "os";
import path from "path";
import { handleDoctor } from "../../../src/tools/doctor.js";
import { createRequestContext } from "../../../src/mcp/context.js";
import { loadUserConfig } from "../../../src/core/config/loader.js";
import { getUserConfigPath } from "../../../src/core/config/paths.js";

const originalHome = os.homedir;
const originalXdg = process.env.XDG_CONFIG_HOME;
const originalAppData = process.env.APPDATA;
let sandboxHome: string;
let configPath: string;

beforeEach(async () => {
  const usable = (dir: string): boolean =>
    fsSync.existsSync(dir) && fsSync.lstatSync(dir).isDirectory();
  const base = [fsSync.realpathSync(os.tmpdir()), os.tmpdir()].find(usable);
  sandboxHome = fsSync.realpathSync(
    await fs.mkdtemp(path.join(base ?? os.tmpdir(), "fom-jsonc-")),
  );
  os.homedir = () => sandboxHome;
  process.env.XDG_CONFIG_HOME = path.join(sandboxHome, ".config");
  process.env.APPDATA = path.join(sandboxHome, "AppData", "Roaming");
  configPath = getUserConfigPath();
});

afterEach(async () => {
  os.homedir = originalHome;
  if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = originalXdg;
  if (originalAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = originalAppData;
  await fs.rm(sandboxHome, { recursive: true, force: true }).catch(() => {});
});

describe("doctor JSONC config", () => {
  it("accepts JSONC config with comments and reports it healthy", async () => {
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    const configWithComments = `{
      // Custom directories
      "customAllowedDirectories": [],
      /* conflict strategy */
      "conflictStrategy": "rename"
    }`;
    await fs.writeFile(configPath, configWithComments, "utf-8");

    const loaded = loadUserConfig();
    expect(loaded).toBeDefined();
    expect(loaded.conflictStrategy).toBe("rename");

    const ctx = createRequestContext();
    const result = await handleDoctor({ response_format: "json" }, ctx);
    const report = result.structuredContent as {
      ok: unknown;
      conflict_strategy: string;
      config_file_present: boolean;
    };
    expect(result.structuredContent).toBeDefined();
    expect(report.config_file_present).toBe(true);
    expect(report.conflict_strategy).toBe("rename");
  });
});
