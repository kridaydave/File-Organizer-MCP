/**
 * Custom categorization rules — persistence integration tests
 *
 * Phase-3 contract: set_custom_rules persists valid rules to the user config,
 * and per-request CategorizerServices load them from ctx.config. No in-memory
 * singleton involved.
 *
 * The config path is redirected to a per-worker temp dir — other suites hit
 * the real user config in parallel, so sharing it here would be racy.
 */

import { describe, it, expect, beforeAll, afterAll, jest } from "@jest/globals";
import fs from "fs";
import path from "path";

// Inside the worktree so validateStrictPath allows scanning it.
const tempRoot = path.join(
  process.cwd(),
  "tests",
  "temp",
  `custom-rules-${process.pid}`,
);
const tempConfigPath = path.join(tempRoot, "config.json");

// Import the real module BEFORE registering the mock — importing the same
// specifier inside the factory would resolve to the mock and loop forever.
const actualPaths = await import("../../../src/core/config/paths.js");

jest.unstable_mockModule("../../../src/core/config/paths.js", () => ({
  ...actualPaths,
  getUserConfigPath: () => tempConfigPath,
}));

const { handleSetCustomRules } = await import(
  "../../../src/tools/file-management.js"
);
const { handleCategorizeByType } = await import(
  "../../../src/tools/file-categorization.js"
);

describe("Custom rules persistence", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = path.join(tempRoot, "scan-target");
    fs.mkdirSync(path.join(testDir, "project-src"), { recursive: true });

    // A file that only matches via the custom rule we set later.
    fs.writeFileSync(
      path.join(testDir, "project-src", "component.widget"),
      "placeholder",
    );
    fs.writeFileSync(path.join(testDir, "readme.md"), "# plain doc\n");
  });

  afterAll(() => {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should persist valid custom rules to user config", async () => {
    const response = await handleSetCustomRules({
      rules: [
        {
          category: "Widgets",
          filename_pattern: "\\.widget$",
          priority: 100,
        },
        {
          category: "",
          filename_pattern: "invalid",
          priority: 10,
        },
      ],
    });

    const text = response.content[0].text;
    expect(text).toContain("1 custom organization rules");

    const config = JSON.parse(fs.readFileSync(tempConfigPath, "utf-8"));
    expect(config.customRules).toHaveLength(1);
    expect(config.customRules[0].category).toBe("Widgets");
    // Persisted in the internal camelCase shape the categorizer consumes.
    expect(config.customRules[0].filenamePattern).toBe("\\.widget$");
  });

  it("should apply persisted rules on a fresh request", async () => {
    // New handler invocation — the rule must come from disk via ctx.config,
    // exactly as a separate tool call would see it.
    const response = await handleCategorizeByType({
      directory: testDir,
      include_subdirs: true,
      response_format: "json",
    });

    expect(response.content[0].text).toContain("Widgets");

    const structured = response.structuredContent as {
      categories?: Record<string, { files: string[] }>;
    };
    const widgetFiles = structured.categories?.["Widgets"]?.files ?? [];
    expect(widgetFiles.some((f) => f.endsWith("component.widget"))).toBe(true);
  });
});
