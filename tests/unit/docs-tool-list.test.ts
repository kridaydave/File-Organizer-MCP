/**
 * Documentation / reality drift guard (issue #22 item 3).
 *
 * README.md and ARCHITECTURE.md hand-list the tool names and the Node version.
 * Those went stale silently: a tool was added to the registry and documented in
 * API.md, but the README list and the headline counts still described the
 * previous state. Nothing failed, so nobody noticed.
 *
 * These tests read the real registry and fail when the prose disagrees, so the
 * drift is caught by the test run instead of by a user.
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
const ARCHITECTURE = path.join(REPO_ROOT, "ARCHITECTURE.md");
const PACKAGE_JSON = path.join(REPO_ROOT, "package.json");

/** Tool names the README lists in its "Full tool list" section. */
function readmeToolList(): string[] {
  const readme = fs.readFileSync(README, "utf-8");
  const section = readme.split("### Full tool list")[1];
  if (!section) {
    throw new Error("README.md no longer has a '### Full tool list' section");
  }
  // The list ends at the next heading.
  const body = section.split(/\n#{2,3} /)[0] ?? section;
  return [...body.matchAll(/`(file_organizer_[a-z_]+)`/g)].map((m) => m[1]!);
}

describe("documentation matches the tool registry", () => {
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

  it("lists every registered tool in the README", () => {
    const documented = readmeToolList();
    const registered = TOOLS.map((t) => t.name);

    const missing = registered.filter((name) => !documented.includes(name));
    expect(missing).toEqual([]);
  });

  it("documents no tool that the registry does not serve", () => {
    const documented = readmeToolList();
    const registered = new Set(TOOLS.map((t) => t.name));

    const stale = documented.filter((name) => !registered.has(name));
    expect(stale).toEqual([]);
  });

  it("states the real tool count in the README heading", () => {
    const readme = fs.readFileSync(README, "utf-8");
    const heading = readme.split("### Full tool list")[1]?.split("\n")[0] ?? "";

    const claimed = heading.match(/(\d+)\s+tools/)?.[1];
    expect(claimed).toBeDefined();
    expect(Number(claimed)).toBe(TOOLS.length);
  });

  it("states the real tool count in ARCHITECTURE.md", () => {
    const arch = fs.readFileSync(ARCHITECTURE, "utf-8");
    const claimed = arch.match(/exposes (\d+) typed tools/)?.[1];

    expect(claimed).toBeDefined();
    expect(Number(claimed)).toBe(TOOLS.length);
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
