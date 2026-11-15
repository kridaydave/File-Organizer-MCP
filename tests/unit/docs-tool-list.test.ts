/**
 * Registry and doc-adjacent invariants that `npm run docs:check` cannot express.
 *
 * The README/ARCHITECTURE tool count and list drift guard used to live here and
 * ran on all six CI matrix lanes, so one stale count reported as a dozen red
 * checks. That guard is `npm run docs:check` now, reported once by the `docs`
 * CI job. What remains here either needs the jest runtime (registry wiring,
 * feature-map coverage) or reads files docs:check does not look at, like the
 * documented Node version.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { TOOLS } from "../../src/mcp/registry.js";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const README = path.join(REPO_ROOT, "README.md");
const PACKAGE_JSON = path.join(REPO_ROOT, "package.json");

describe("the tool registry is internally consistent", () => {
  it("registers no duplicate tool names", () => {
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every registered tool a handler", async () => {
    const { toolHandlers } = await import("../../src/mcp/registry.js");
    for (const tool of TOOLS) {
      expect(toolHandlers.has(tool.name)).toBe(true);
    }
  });
});

/**
 * The verify skill's feature map rots the same way the README did, and for the
 * same reason: a tool is added to the registry, the map is not touched, and a
 * tool exists that no agent knows how to prove. That gap once covered twelve
 * tools. Nothing caught it.
 *
 * This reads the map's own files rather than a count written in prose, so a tool
 * dropped from the map fails as loudly as one never added.
 */
describe("the verification skill's feature map covers the registry", () => {
  const FEATURE_DIR = path.join(
    REPO_ROOT,
    ".opencode/skills/verify-file-organizer/references/features",
  );

  function featureFiles(): string[] {
    return fs
      .readdirSync(FEATURE_DIR)
      .filter((f) => f.endsWith(".md") && f !== "README.md");
  }

  it("still has the feature files the index links to", () => {
    const index = fs.readFileSync(path.join(FEATURE_DIR, "README.md"), "utf-8");
    const linked = [...index.matchAll(/\]\(([a-z-]+\.md)\)/g)].map((m) => m[1]!);

    expect(linked.length).toBeGreaterThan(0);
    const onDisk = new Set(fs.readdirSync(FEATURE_DIR));
    const broken = linked.filter((f) => !onDisk.has(f));
    expect(broken).toEqual([]);
  });

  it("gives every registered tool a feature entry", () => {
    const documented = new Set<string>();
    for (const file of featureFiles()) {
      const body = fs.readFileSync(path.join(FEATURE_DIR, file), "utf-8");
      for (const [, name] of body.matchAll(/`([a-z0-9_]+)`/g)) {
        documented.add(name!);
      }
    }

    const missing = TOOLS.map((t) => t.name.replace("file_organizer_", ""))
      .filter((name) => !documented.has(name));

    expect(missing).toEqual([]);
  });
});

describe("documented Node version matches package.json engines", () => {
  const MIN_NODE_MAJOR = 20;

  it("package.json requires the expected major version", () => {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf-8"));
    const range = pkg.engines?.node as string | undefined;

    expect(range).toBeDefined();
    const major = Number(range!.match(/>=\s*(\d+)/)?.[1]);
    expect(Number.isNaN(major)).toBe(false);
    expect(major).toBe(MIN_NODE_MAJOR);
  });

  it("README never claims support for a Node older than engines allows", () => {
    const readme = fs.readFileSync(README, "utf-8");
    const claimed = [...readme.matchAll(/Node\.js (\d+)\+?/g)].map((m) =>
      Number(m[1]),
    );

    expect(claimed.length).toBeGreaterThan(0);
    for (const major of claimed) {
      expect(major).toBeGreaterThanOrEqual(MIN_NODE_MAJOR);
    }
  });
});
