/**
 * DuplicateFinderService.previewDeletion — the dry-run behind
 * preview_delete_duplicates.
 *
 * The contract under test is "which single copy survives, under the strategy
 * the caller named". These assertions read real values out of the returned
 * groups, so a previewDeletion that returned undefined or picked at random
 * fails rather than passing on shape.
 *
 * The sandbox lives under os.tmpdir(). previewDeletion only hashes, it never
 * opens through PathValidatorService, so no allowed-root grant is needed here.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { DuplicateFinderService } from "../../../src/core/hash/duplicate-finder.js";
import type { FileWithSize } from "../../../src/types.js";

describe("DuplicateFinderService.previewDeletion", () => {
  let duplicateFinder: DuplicateFinderService;
  let testDir: string;

  beforeEach(async () => {
    duplicateFinder = new DuplicateFinderService();
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "deletion-preview-"));
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  /** Real file on disk, with an explicit mtime so date strategies are testable. */
  const createFile = async (
    name: string,
    content: string,
    modified: Date,
  ): Promise<FileWithSize> => {
    const filePath = path.join(testDir, name);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
    await fs.utimes(filePath, modified, modified);
    const stats = await fs.stat(filePath);
    return { name, path: filePath, size: stats.size, modified };
  };

  const OLD = new Date("2020-01-01T00:00:00Z");
  const MID = new Date("2021-06-01T00:00:00Z");
  const NEW = new Date("2022-12-01T00:00:00Z");

  it("keeps the most recently modified copy under newest", async () => {
    const a = await createFile("a.txt", "shared", OLD);
    const b = await createFile("b.txt", "shared", MID);
    const c = await createFile("c.txt", "shared", NEW);

    const preview = await duplicateFinder.previewDeletion([a, b, c], "newest");

    expect(preview.keep_strategy).toBe("newest");
    expect(preview.groups).toHaveLength(1);
    expect(preview.groups[0]!.keep).toBe(c.path);
    expect(preview.groups[0]!.would_delete).toEqual([a.path, b.path]);
    expect(preview.files_to_delete).toEqual([a.path, b.path]);
    expect(preview.total_would_delete).toBe(2);
  });

  it("keeps the least recently modified copy under oldest", async () => {
    const a = await createFile("a.txt", "shared", OLD);
    const b = await createFile("b.txt", "shared", MID);
    const c = await createFile("c.txt", "shared", NEW);

    const preview = await duplicateFinder.previewDeletion([a, b, c], "oldest");

    expect(preview.groups[0]!.keep).toBe(a.path);
    expect(preview.groups[0]!.would_delete).toEqual([b.path, c.path]);
  });

  it("keeps the first scanned copy under keep_first, not the newest", async () => {
    const a = await createFile("a.txt", "shared", OLD);
    const b = await createFile("b.txt", "shared", NEW);

    const preview = await duplicateFinder.previewDeletion([a, b], "keep_first");

    // Newest would be b; keep_first ignores timestamps entirely.
    expect(preview.groups[0]!.keep).toBe(a.path);
    expect(preview.groups[0]!.would_delete).toEqual([b.path]);
  });

  it("defaults to newest when no strategy is given", async () => {
    const a = await createFile("a.txt", "shared", OLD);
    const b = await createFile("a-copy.txt", "shared", NEW);

    const preview = await duplicateFinder.previewDeletion([a, b]);

    expect(preview.keep_strategy).toBe("newest");
    expect(preview.groups[0]!.keep).toBe(b.path);
  });

  it("never picks a file with no timestamp over one that has a date", async () => {
    const dated = await createFile("dated.txt", "shared", OLD);
    const undated = await createFile("undated.txt", "shared", NEW);
    // Strip the timestamp the way a filesystem that does not report mtime would.
    const withoutModified: FileWithSize = {
      name: undated.name,
      path: undated.path,
      size: undated.size,
    };

    const preview = await duplicateFinder.previewDeletion(
      [withoutModified, dated],
      "newest",
    );

    expect(preview.groups[0]!.keep).toBe(dated.path);
    expect(preview.groups[0]!.would_delete).toEqual([undated.path]);
  });

  it("names one survivor per group and totals every group", async () => {
    // Two distinct contents, so two groups with different sizes.
    const a1 = await createFile("g1/a.txt", "aaa", OLD);
    const a2 = await createFile("g2/a-copy.txt", "aaa", NEW);
    const b1 = await createFile("g1/b.txt", "bbbb", OLD);
    const b2 = await createFile("g2/b-copy.txt", "bbbb", MID);
    const b3 = await createFile("g3/b-copy2.txt", "bbbb", MID);
    const unique = await createFile("g3/unique.txt", "not a duplicate", NEW);

    const preview = await duplicateFinder.previewDeletion(
      [a1, a2, b1, b2, b3, unique],
      "newest",
    );

    expect(preview.groups).toHaveLength(2);

    const groupA = preview.groups.find((g) => g.size_bytes === 3)!;
    const groupB = preview.groups.find((g) => g.size_bytes === 4)!;
    expect(groupA.file_count).toBe(2);
    expect(groupA.keep).toBe(a2.path);
    expect(groupA.would_delete).toEqual([a1.path]);

    expect(groupB.file_count).toBe(3);
    // b2 and b3 tie on mtime, so the earlier scanned copy keeps the slot.
    expect(groupB.keep).toBe(b2.path);
    expect(groupB.would_delete).toEqual([b1.path, b3.path]);

    // Wasted space is one full copy per removed file, summed across groups.
    expect(groupA.wasted_space_bytes).toBe(3);
    expect(groupB.wasted_space_bytes).toBe(8);
    expect(preview.total_wasted_space_bytes).toBe(11);
    expect(preview.total_would_delete).toBe(3);
    expect(preview.files_to_delete.sort()).toEqual(
      [a1.path, b1.path, b3.path].sort(),
    );
    // The unique file is in no group and must not be listed for deletion.
    expect(preview.files_to_delete).not.toContain(unique.path);
  });

  it("reports files it could not compare instead of claiming nothing to do", async () => {
    const a = await createFile("a.txt", "shared", OLD);
    const b = await createFile("b.txt", "shared", NEW);
    const empty = path.join(testDir, "empty.txt");
    await fs.writeFile(empty, "");

    const emptyStat = await fs.stat(empty);
    const preview = await duplicateFinder.previewDeletion([
      a,
      b,
      { name: "empty.txt", path: empty, size: emptyStat.size },
    ]);

    expect(preview.groups).toHaveLength(1);
    expect(preview.skipped.map((s) => s.path)).toEqual([empty]);
    expect(preview.skipped[0]!.reason).toBe("empty_file");
    expect(preview.files_to_delete).toEqual([a.path]);
  });

  it("leaves every file on disk untouched", async () => {
    const a = await createFile("a.txt", "shared", OLD);
    const b = await createFile("b.txt", "shared", NEW);

    await duplicateFinder.previewDeletion([a, b], "newest");

    await expect(fs.readFile(a.path, "utf-8")).resolves.toBe("shared");
    await expect(fs.readFile(b.path, "utf-8")).resolves.toBe("shared");
    // Sorted: fs.readdir returns entries in filesystem order, which POSIX and
    // Windows both decline to guarantee.
    expect((await fs.readdir(testDir)).sort()).toEqual(["a.txt", "b.txt"]);
  });
});
