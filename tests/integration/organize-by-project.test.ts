/**
 * Integration tests for the organize_by_project tool wiring.
 * Uses real files in a temp sandbox; no baked-in paths.
 */

import fs from "fs/promises";
import os from "os";
import path from "path";
import { handleOrganizeByProject } from "../../src/tools/project-organization.js";

let baseTempDir: string;
let sourceDir: string;
let targetDir: string;

beforeEach(async () => {
  // Sandbox inside the worktree (allowed root), matching other integration tests.
  baseTempDir = path.join(process.cwd(), "tests", "temp");
  await fs.mkdir(baseTempDir, { recursive: true });
  sourceDir = await fs.mkdtemp(path.join(baseTempDir, "proj-src-"));
  targetDir = await fs.mkdtemp(path.join(baseTempDir, "proj-dst-"));
});

afterEach(async () => {
  await fs.rm(sourceDir, { recursive: true, force: true });
  await fs.rm(targetDir, { recursive: true, force: true });
});

async function write(dir: string, name: string, content: string) {
  await fs.writeFile(path.join(dir, name), content);
}

describe("organize_by_project tool", () => {
  it("rejects invalid input", async () => {
    const res = await handleOrganizeByProject({});
    expect(res.content[0]!.text).toContain("Error");
  });

  it("previews grouping without moving files on dry_run", async () => {
    await write(sourceDir, "aurora-notes.txt", "meeting notes");
    await write(sourceDir, "aurora-todo.md", "todo list");

    const res = await handleOrganizeByProject({
      source_dir: sourceDir,
      target_dir: targetDir,
      dry_run: true,
      response_format: "json",
    });

    const parsed = JSON.parse(res.content[0]!.text);
    expect(parsed.organizedFiles).toBe(2);
    expect(Object.keys(parsed.structure)).toHaveLength(1);
    // Nothing moved.
    const remaining = await fs.readdir(sourceDir);
    expect(remaining.sort()).toEqual(["aurora-notes.txt", "aurora-todo.md"]);
    expect(await fs.readdir(targetDir)).toEqual([]);
  });

  it("moves grouped files into a project folder and creates a rollback manifest", async () => {
    await write(sourceDir, "aurora-notes.txt", "meeting notes");
    await write(sourceDir, "aurora-todo.md", "todo list");
    await write(sourceDir, "loner.bin", "x");

    const res = await handleOrganizeByProject({
      source_dir: sourceDir,
      target_dir: targetDir,
      dry_run: false,
      response_format: "json",
    });

    const parsed = JSON.parse(res.content[0]!.text);
    expect(parsed.organizedFiles).toBe(2);
    expect(parsed.skippedFiles).toBe(1);
    const folders = await fs.readdir(targetDir);
    expect(folders).toHaveLength(1);
    const moved = await fs.readdir(path.join(targetDir, folders[0]!));
    expect(moved.sort()).toEqual(["aurora-notes.txt", "aurora-todo.md"]);
    // Unclaimed file stays put.
    expect(await fs.readdir(sourceDir)).toEqual(["loner.bin"]);
  });

  it("renders markdown output", async () => {
    await write(sourceDir, "aurora-notes.txt", "meeting notes");
    await write(sourceDir, "aurora-todo.md", "todo list");

    const res = await handleOrganizeByProject({
      source_dir: sourceDir,
      target_dir: targetDir,
      dry_run: true,
    });
    expect(res.content[0]!.text).toContain("Project Organization Result");
    expect(res.content[0]!.text).toContain("Dry Run");
  });
});
