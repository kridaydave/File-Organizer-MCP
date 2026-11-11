/**
 * The bun build: which sources become dist/.
 *
 * `bun check` replaced `tsc` for type checking, so scripts/build.mjs now owns
 * the decision about what gets emitted, and `bun build --no-bundle` is
 * unforgiving about the answer: hand it an ambient `foo.d.ts` and it transpiles
 * that as if it were source, writing a junk `foo.d.js` into dist/ and crashing
 * on the next one. A file silently dropped from the list is just as bad, because
 * the server starts fine and fails later when something imports the missing
 * module.
 *
 * So this asserts on the list itself rather than on dist/, which a developer may
 * or may not have built yet.
 */

import { describe, it, expect } from "@jest/globals";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const BUILD_SCRIPT = path.join(REPO_ROOT, "scripts", "build.mjs");

const entrypoints = (): string[] =>
  execFileSync(process.execPath, [BUILD_SCRIPT, "--list"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter((line) => line !== "");

describe("build entrypoints", () => {
  it("emits every entrypoint as TypeScript source", () => {
    // The regression: `scripts/` also holds plain .js and .cjs files, and a
    // non-TypeScript entrypoint makes bun resolve it as a module and crash.
    const notTypeScript = entrypoints().filter((file) => !file.endsWith(".ts"));
    expect(notTypeScript).toEqual([]);
  });

  it("keeps ambient declarations and specs out of dist/", () => {
    const skipped = entrypoints().filter((file) =>
      /\.(d|test|spec)\.ts$/.test(file),
    );
    expect(skipped).toEqual([]);
  });

  it("skips the benchmark, which tsconfig.json excluded", () => {
    expect(entrypoints()).not.toContain(path.join("scripts", "benchmark.ts"));
  });

  it("covers the entrypoint and the security gates", () => {
    const files = entrypoints();
    // bin/file-organizer-mcp.mjs imports dist/src/index.js, and
    // test:security:static runs dist/scripts/security-gates/static-analysis.js,
    // so a build that missed either would fail far from here.
    expect(files).toContain(path.join("src", "index.ts"));
    expect(files).toContain(
      path.join("scripts", "security-gates", "static-analysis.ts"),
    );
  });

  it("walks nested directories", () => {
    expect(entrypoints()).toContain(
      path.join("src", "core", "organize", "rollback.ts"),
    );
  });
});
