/**
 * find_empty_directories — tool wiring.
 *
 * The handler is the whole contract here: Zod parse, validateStrictPath, the
 * walk, then both response formats. So these tests go through the handler
 * rather than the service, and they check that the path really was validated —
 * a directory outside the allowed roots is refused, not walked.
 *
 * The sandbox lives under os.tmpdir() and is granted through
 * CONFIG.paths.customAllowed, the same allowlist validateStrictPath reads.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import fs from "fs/promises";
import os from "os";
import path from "path";

const { CONFIG } = await import("../../../src/config.js");
const { handleFindEmptyDirectories } =
  await import("../../../src/tools/file-analysis.js");
const { TOOLS } = await import("../../../src/mcp/registry.js");

type EmptyResult = {
  directory: string;
  scanned_count: number;
  depth_limited: boolean;
  result_limited: boolean;
  limit: number;
  total_count: number;
  empty_dirs: string[];
};

describe("find_empty_directories", () => {
  let testDir: string;
  let realTestDir: string;
  let restoreCustomAllowed: string[] | undefined;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "tool-empty-dirs-"));
    realTestDir = await fs.realpath(testDir);
    restoreCustomAllowed = CONFIG.paths._overrideCustomAllowed;
    CONFIG.paths.customAllowed = [os.tmpdir()];
  });

  afterEach(async () => {
    CONFIG.paths.customAllowed = restoreCustomAllowed;
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  async function real(...segments: string[]): Promise<string> {
    return fs.realpath(path.join(testDir, ...segments));
  }

  it("is registered with an honest read-only annotation", () => {
    const tool = TOOLS.find(
      (t) => t.name === "file_organizer_find_empty_directories",
    );
    expect(tool).toBeDefined();
    expect(tool!.annotations?.readOnlyHint).toBe(true);
    expect(tool!.annotations?.destructiveHint).toBe(false);
    expect(tool!.annotations?.idempotentHint).toBe(true);
  });

  it("returns real counts and paths as json", async () => {
    await fs.mkdir(path.join(testDir, "empty-one"));
    await fs.mkdir(path.join(testDir, "dotonly"));
    await fs.writeFile(path.join(testDir, "dotonly", ".hidden"), "x");
    await fs.mkdir(path.join(testDir, "withfile"));
    await fs.writeFile(path.join(testDir, "withfile", "a.txt"), "hi");

    const res = await handleFindEmptyDirectories({
      directory: testDir,
      response_format: "json",
    });

    expect(res.isError).toBeUndefined();
    const out = res.structuredContent as EmptyResult;
    expect(out.total_count).toBe(1);
    expect(out.empty_dirs).toEqual([await real("empty-one")]);
    expect(out.scanned_count).toBe(4);
    expect(out.limit).toBe(100);
    // The json text block carries the same data the structured content does.
    const text = (res.content[0] as { text: string }).text;
    expect(JSON.parse(text)).toEqual(out);
  });

  it("names the empty directories in markdown", async () => {
    await fs.mkdir(path.join(testDir, "empty-one"));

    const res = await handleFindEmptyDirectories({
      directory: testDir,
      response_format: "markdown",
    });

    expect(res.isError).toBeUndefined();
    const markdown = (res.content[0] as { text: string }).text;
    expect(markdown).toContain("Found 1 empty directory(ies)");
    expect(markdown).toContain(await real("empty-one"));
    // Markdown still carries structuredContent because the tool declares an
    // outputSchema and the SDK rejects a result without it.
    expect((res.structuredContent as EmptyResult).total_count).toBe(1);
  });

  it("recurses by default", async () => {
    await fs.mkdir(path.join(testDir, "a", "b"), { recursive: true });

    const res = await handleFindEmptyDirectories({
      directory: testDir,
      response_format: "json",
    });

    const out = res.structuredContent as EmptyResult;
    expect(out.empty_dirs).toEqual([await real("a", "b")]);
  });

  it("stays at the root when include_subdirs is false", async () => {
    await fs.mkdir(path.join(testDir, "a", "b"), { recursive: true });

    const res = await handleFindEmptyDirectories({
      directory: testDir,
      include_subdirs: false,
      response_format: "json",
    });

    expect((res.structuredContent as EmptyResult).total_count).toBe(0);
  });

  it("honors the limit cap", async () => {
    await fs.mkdir(path.join(testDir, "one"));
    await fs.mkdir(path.join(testDir, "two"));
    await fs.mkdir(path.join(testDir, "three"));

    const res = await handleFindEmptyDirectories({
      directory: testDir,
      limit: 2,
      response_format: "json",
    });

    const out = res.structuredContent as EmptyResult;
    expect(out.empty_dirs).toHaveLength(2);
    expect(out.result_limited).toBe(true);
  });

  it("rejects a directory outside the allowed roots", async () => {
    const res = await handleFindEmptyDirectories({
      directory: path.join(os.homedir(), "definitely-not-allowed"),
      response_format: "json",
    });

    expect(res.isError).toBe(true);
    // The refusal must not echo the path back to the caller.
    const text = (res.content[0] as { text: string }).text;
    expect(text).not.toContain("definitely-not-allowed");
    expect(text).not.toContain(os.homedir());
  });

  it("rejects a missing directory without leaking the path", async () => {
    const missing = path.join(testDir, "no-such-dir");

    const res = await handleFindEmptyDirectories({
      directory: missing,
      response_format: "json",
    });

    expect(res.isError).toBe(true);
    expect((res.content[0] as { text: string }).text).not.toContain("no-such-dir");
  });

  it("rejects an empty directory argument", async () => {
    const res = await handleFindEmptyDirectories({ directory: "" });

    expect(res.isError).toBe(true);
    expect((res.content[0] as { text: string }).text).toContain(
      "Directory path cannot be empty",
    );
  });

  it("reports an empty sandbox root as empty", async () => {
    const res = await handleFindEmptyDirectories({
      directory: testDir,
      response_format: "json",
    });

    expect((res.structuredContent as EmptyResult).empty_dirs).toEqual([
      realTestDir,
    ]);
  });
});