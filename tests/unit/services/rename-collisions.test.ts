/**
 * detectRenameCollisions — unit tests.
 *
 * The service is exercised against a real directory under os.tmpdir() rather
 * than a mocked fs, because the whole point of the function is what the disk
 * says about a destination. A mocked stat would only prove the mock answers.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import fs from "fs/promises";
import os from "os";
import path from "path";
import type { RenameRule } from "../../../src/schemas/organize.js";
import {
  RenamingService,
  detectRenameCollisions,
  groupRenamePreviewsByTarget,
} from "../../../src/core/organize/rename.js";

function lowercasing(): RenameRule[] {
  return [{ type: "case", conversion: "lowercase" }];
}

/**
 * Both names collapse onto `invoice_a.txt` under snake_case, one via a space
 * and one via a hyphen, and neither already carries the target name. Two
 * spellings of one word in different cases would have read better but a
 * case-insensitive filesystem cannot hold both files in the first place.
 */
function collapsingToInvoiceA(): RenameRule[] {
  return [{ type: "case", conversion: "snake_case" }];
}

describe("detectRenameCollisions", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "rename-collisions-"));
  });

  afterEach(async () => {
    // Windows keeps a short handle on files just written, and rm can lose the
    // race. The pause is the documented remedy in AGENTS.md.
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  async function previewOf(
    names: string[],
    rules: RenameRule[],
  ): Promise<ReturnType<RenamingService["applyRenameRules"]>> {
    const files = [];
    for (const name of names) {
      const file = path.join(testDir, name);
      await fs.writeFile(file, name);
      files.push(file);
    }
    return new RenamingService().applyRenameRules(files, rules);
  }

  it("reports two sources landing on one destination name", async () => {
    const previews = await previewOf(
      ["Invoice A.txt", "Invoice-A.txt", "notes.txt"],
      collapsingToInvoiceA(),
    );

    const collisions = detectRenameCollisions(previews);

    expect(collisions).toEqual([
      {
        kind: "duplicate_target",
        destination: "invoice_a.txt",
        sources: ["Invoice A.txt", "Invoice-A.txt"],
      },
    ]);
  });

  it("marks every member of a duplicate group, not just the later one", async () => {
    const previews = await previewOf(
      ["Invoice A.txt", "Invoice-A.txt"],
      collapsingToInvoiceA(),
    );

    // Both rows lose the name, so a caller reading either preview sees the
    // clash rather than a clean row for the first file.
    expect(previews.map((p) => p.conflict)).toEqual([true, true]);

    const colliding = previews.filter((p) => p.conflict);
    expect(colliding).toHaveLength(2);
  });

  it("reports a destination name a different file already holds", async () => {
    const previews = await previewOf(["b.txt", "a.txt"], [
      { type: "find_replace", find: "a", replace: "b", global: false },
    ]);

    const collisions = detectRenameCollisions(previews);

    expect(collisions).toEqual([
      {
        kind: "destination_exists",
        destination: "b.txt",
        sources: ["a.txt"],
      },
    ]);
  });

  it("keeps distinct destinations out of the report", async () => {
    const previews = await previewOf(["A.txt", "B.txt"], lowercasing());

    expect(detectRenameCollisions(previews)).toEqual([]);
  });

  it("ignores files the rules leave where they are", async () => {
    // Both already lowercase, so neither moves and neither can collide.
    const previews = await previewOf(["a.txt", "b.txt"], lowercasing());

    expect(previews.every((p) => p.willChange === false)).toBe(true);
    expect(detectRenameCollisions(previews)).toEqual([]);
  });

  it("reports file names, never directory paths", async () => {
    const previews = await previewOf(
      ["Invoice A.txt", "Invoice-A.txt"],
      collapsingToInvoiceA(),
    );

    const [collision] = detectRenameCollisions(previews);
    expect(collision?.destination).toBe("invoice_a.txt");
    expect(collision?.sources).toEqual(["Invoice A.txt", "Invoice-A.txt"]);
    // The sandbox path must not reach the caller through a collision.
    expect(JSON.stringify(collision)).not.toContain(testDir);
  });
});

describe("groupRenamePreviewsByTarget", () => {
  it("groups only the previews that would move", () => {
    const groups = groupRenamePreviewsByTarget([
      { original: "/d/a.txt", new: "/d/same.txt", willChange: true, conflict: false },
      { original: "/d/B.txt", new: "/d/same.txt", willChange: true, conflict: false },
      { original: "/d/c.txt", new: "/d/c.txt", willChange: false, conflict: false },
      {
        original: "/d/d.txt",
        new: "/d/d.txt",
        willChange: false,
        conflict: false,
        error: "rule failed",
      },
    ]);

    expect([...groups.keys()]).toEqual(["/d/same.txt"]);
    expect(groups.get("/d/same.txt")).toHaveLength(2);
  });
});

describe("a rule cannot steer a rename out of its directory", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "rename-escape-"));
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("refuses a destination containing a path separator", async () => {
    const file = path.join(testDir, "safe.txt");
    await fs.writeFile(file, "content");

    const previews = await new RenamingService().applyRenameRules([file], [
      { type: "find_replace", find: "safe", replace: "../escaped" },
    ]);

    expect(previews[0].error).toContain("outside the source directory");
    expect(previews[0].willChange).toBe(false);
    // No preview entry can name a file outside the sandbox.
    expect(detectRenameCollisions(previews)).toEqual([]);
  });

  it("refuses a destination a rule empties out", async () => {
    // A dotfile has no extension, so deleting the whole base name leaves
    // nothing to rename to. The directory itself is not a valid target.
    const file = path.join(testDir, ".env");
    await fs.writeFile(file, "SECRET=1");

    const previews = await new RenamingService().applyRenameRules([file], [
      { type: "find_replace", find: ".env", replace: "" },
    ]);

    expect(previews[0].error).toContain("outside the source directory");
    expect(previews[0].willChange).toBe(false);
    // The file is still there under its own name.
    expect((await fs.readdir(testDir)).sort()).toEqual([".env"]);
  });
});
