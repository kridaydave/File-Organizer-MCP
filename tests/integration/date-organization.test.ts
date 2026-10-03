/**
 * Integration tests for the organize_by_date tool wiring.
 *
 * Real files in a sandbox inside the repo (the only allowed root under test);
 * assertions compare trees relative to the sandbox roots, never absolute paths.
 */

import fs from "fs/promises";
import path from "path";
import { handleOrganizeByDate } from "../../src/tools/date-organization.js";
import { getToolHandler, hasTool } from "../../src/mcp/registry.js";
import { relativeFiles } from "../utils/tree.js";

let root: string;
let sourceDir: string;
let targetDir: string;

beforeEach(async () => {
  const sandbox = path.join(process.cwd(), "tests", "temp");
  await fs.mkdir(sandbox, { recursive: true });
  root = await fs.mkdtemp(path.join(sandbox, "date-tool-"));
  sourceDir = path.join(root, "source");
  targetDir = path.join(root, "target");
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.mkdir(targetDir, { recursive: true });
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  await fs.rm(root, { recursive: true, force: true });
});

async function writeWithMtime(name: string, when: Date): Promise<void> {
  const filePath = path.join(sourceDir, name);
  await fs.writeFile(filePath, `content of ${name}`);
  await fs.utimes(filePath, when, when);
}

function expectedFolder(when: Date): string {
  return `${when.getFullYear()}/${String(when.getMonth() + 1).padStart(2, "0")}`;
}

describe("organize_by_date tool", () => {
  it("is registered with a handler", () => {
    expect(hasTool("file_organizer_organize_by_date")).toBe(true);
    expect(typeof getToolHandler("file_organizer_organize_by_date")).toBe(
      "function",
    );
  });

  it("rejects invalid input", async () => {
    const res = await handleOrganizeByDate({ source_dir: sourceDir });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain("Error:");
  });

  it("rejects an unknown date_format", async () => {
    const res = await handleOrganizeByDate({
      source_dir: sourceDir,
      target_dir: targetDir,
      date_format: "YYYY/MM/DD/HH",
    });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain("Error:");
    expect(await relativeFiles(sourceDir)).toEqual([]);
  });

  it("previews the date folders without moving anything by default", async () => {
    const when = new Date(2024, 4, 20, 11, 0);
    await writeWithMtime("report.txt", when);
    await writeWithMtime("memo.txt", when);

    const res = await handleOrganizeByDate({
      source_dir: sourceDir,
      target_dir: targetDir,
      response_format: "json",
    });

    const parsed = JSON.parse(res.content[0]!.text);
    expect(parsed.organizedFiles).toBe(2);
    expect(parsed.manifestId).toBeUndefined();
    expect(parsed.moves.map((move: { dateSource: string }) => move.dateSource))
      .toEqual(["mtime", "mtime"]);
    expect(await relativeFiles(sourceDir)).toEqual(["memo.txt", "report.txt"]);
    expect(await relativeFiles(targetDir)).toEqual([]);
  });

  it("moves files into date folders and reports a rollback manifest", async () => {
    const january = new Date(2024, 0, 3, 9, 0);
    const february = new Date(2024, 1, 14, 9, 0);
    await writeWithMtime("jan.txt", january);
    await writeWithMtime("feb.txt", february);

    const res = await handleOrganizeByDate({
      source_dir: sourceDir,
      target_dir: targetDir,
      dry_run: false,
      date_source: "mtime",
      response_format: "json",
    });

    const parsed = JSON.parse(res.content[0]!.text);
    expect(parsed.success).toBe(true);
    expect(parsed.organizedFiles).toBe(2);
    expect(parsed.undoAvailable).toBe(true);
    expect(parsed.manifestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(await relativeFiles(targetDir)).toEqual(
      [`${expectedFolder(january)}/jan.txt`, `${expectedFolder(february)}/feb.txt`].sort(),
    );
    expect(await relativeFiles(sourceDir)).toEqual([]);
  });

  it("refuses a target nested inside the source", async () => {
    await writeWithMtime("note.txt", new Date(2024, 8, 8, 8, 0));

    const res = await handleOrganizeByDate({
      source_dir: sourceDir,
      target_dir: path.join(sourceDir, "organized"),
      dry_run: false,
    });

    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain("cannot be inside the source");
    expect(await relativeFiles(sourceDir)).toEqual(["note.txt"]);
  });

  it("reports files left in place when no date is available", async () => {
    const when = new Date(2024, 10, 2, 9, 0);
    await writeWithMtime("no-exif.jpg", when);

    const res = await handleOrganizeByDate({
      source_dir: sourceDir,
      target_dir: targetDir,
      dry_run: false,
      date_source: "exif",
      response_format: "json",
    });

    const parsed = JSON.parse(res.content[0]!.text);
    expect(parsed.organizedFiles).toBe(0);
    expect(parsed.noDateFiles).toEqual(["no-exif.jpg"]);
    expect(await relativeFiles(sourceDir)).toEqual(["no-exif.jpg"]);
  });

  it("renders markdown naming the folders, the date source, and the manifest", async () => {
    const when = new Date(2024, 4, 20, 11, 0);
    await writeWithMtime("report.txt", when);

    const preview = await handleOrganizeByDate({
      source_dir: sourceDir,
      target_dir: targetDir,
    });

    expect(preview.content[0]!.text).toContain("Date Organization Result");
    expect(preview.content[0]!.text).toContain("Dry Run");
    expect(preview.content[0]!.text).toContain(`\`${expectedFolder(when)}\``);
    expect(preview.content[0]!.text).toContain("`report.txt` — mtime");

    const moved = await handleOrganizeByDate({
      source_dir: sourceDir,
      target_dir: targetDir,
      dry_run: false,
    });

    expect(moved.content[0]!.text).toContain("Rollback Manifest ID");
    expect(moved.content[0]!.text).toContain("mtime: 1");
  });
});
