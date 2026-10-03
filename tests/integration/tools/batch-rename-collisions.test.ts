/**
 * batch_rename collision preview — behavioral tests.
 *
 * The claim under test: a real run that would put two files on one name is
 * refused before the first rename, so nothing on disk moves. Both halves are
 * asserted: the structured collisions the agent gets back, and a directory
 * listing that is byte-for-byte what it was before the call.
 *
 * The sandbox lives under os.tmpdir() and is granted through
 * CONFIG.paths.customAllowed, the same way the other tool tests do it.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "@jest/globals";
import fs from "fs/promises";
import os from "os";
import path from "path";

const { CONFIG } = await import("../../../src/config.js");
const { handleBatchRename } = await import(
  "../../../src/tools/file-renaming.js"
);
const { batchRenameOutputSchema } = await import(
  "../../../src/schemas/output.js"
);

type Collision = {
  kind: string;
  destination: string;
  sources: string[];
};

type BatchRenamePayload = {
  dry_run: boolean;
  rejected: boolean;
  renamed: number;
  processed: number;
  conflicts: Collision[];
};

describe("batch_rename collision preview", () => {
  let testDir: string;
  let restoreCustomAllowed: string[] | undefined;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "batch-rename-collide-"));
    restoreCustomAllowed = CONFIG.paths._overrideCustomAllowed;
    CONFIG.paths.customAllowed = [testDir];
  });

  afterEach(async () => {
    CONFIG.paths.customAllowed = restoreCustomAllowed;
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  async function write(...names: string[]): Promise<string[]> {
    const paths: string[] = [];
    for (const name of names) {
      const file = path.join(testDir, name);
      await fs.writeFile(file, name);
      paths.push(file);
    }
    return paths;
  }

  function payload(res: {
    structuredContent?: unknown;
  }): BatchRenamePayload {
    expect(res.structuredContent).toBeDefined();
    return res.structuredContent as BatchRenamePayload;
  }

  describe("a real run that would collide", () => {
    it("returns both sources for the contested name as structured data", async () => {
      const files = await write("Invoice A.txt", "Invoice-A.txt", "keep.txt");

      const res = await handleBatchRename({
        files,
        rules: [{ type: "case", conversion: "snake_case" }],
        dry_run: false,
        response_format: "json",
      });

      expect(res.isError).toBe(true);

      const out = payload(res);
      expect(out.dry_run).toBe(false);
      expect(out.rejected).toBe(true);
      expect(out.renamed).toBe(0);
      expect(out.processed).toBe(3);
      expect(out.conflicts).toEqual([
        {
          kind: "duplicate_target",
          destination: "invoice_a.txt",
          sources: ["Invoice A.txt", "Invoice-A.txt"],
        },
      ]);

      // The payload is declared by the tool's outputSchema, so it has to
      // actually satisfy it.
      expect(batchRenameOutputSchema.safeParse(res.structuredContent).success).toBe(
        true,
      );
    });

    it("leaves the directory untouched, including files that had no clash", async () => {
      const files = await write(
        "Invoice A.txt",
        "Invoice-A.txt",
        "clear file.txt",
      );
      const before = (await fs.readdir(testDir)).sort();

      const res = await handleBatchRename({
        files,
        rules: [{ type: "case", conversion: "snake_case" }],
        dry_run: false,
      });

      expect(res.isError).toBe(true);
      // "clear file.txt" would have renamed cleanly on its own. The batch is
      // rejected as a unit, so it stays put too.
      expect(await fs.readdir(testDir)).toEqual(before);
      expect(before).toEqual(
        ["Invoice A.txt", "Invoice-A.txt", "clear file.txt"].sort(),
      );
    });

    it("refuses a run whose destination is already taken", async () => {
      const files = await write("a.txt", "b.txt");
      const before = (await fs.readdir(testDir)).sort();

      const res = await handleBatchRename({
        files: [files[0]],
        rules: [{ type: "find_replace", find: "a", replace: "b" }],
        dry_run: false,
        response_format: "json",
      });

      const out = payload(res);
      expect(res.isError).toBe(true);
      expect(out.conflicts).toEqual([
        {
          kind: "destination_exists",
          destination: "b.txt",
          sources: ["a.txt"],
        },
      ]);
      expect(await fs.readdir(testDir)).toEqual(before);
      // b.txt still holds its own content, not a.txt's.
      expect(await fs.readFile(path.join(testDir, "b.txt"), "utf8")).toBe("b.txt");
    });

    it("says what happened in markdown as well as structured data", async () => {
      const files = await write("Invoice A.txt", "Invoice-A.txt");

      const res = await handleBatchRename({
        files,
        rules: [{ type: "case", conversion: "snake_case" }],
        dry_run: false,
      });

      const text = res.content[0]?.text ?? "";
      expect(res.isError).toBe(true);
      expect(text).toContain("Batch Rename Rejected");
      expect(text).toContain("invoice_a.txt");
      expect(text).toContain("Invoice A.txt");
      expect(text).toContain("Invoice-A.txt");
      expect(text).toContain("duplicate_target");
      expect(text).toContain("No files were renamed");
      // Markdown callers get the machine-readable payload too.
      expect(payload(res).conflicts).toHaveLength(1);
    });

    it("does not echo the sandbox path through a collision", async () => {
      const files = await write("Invoice A.txt", "Invoice-A.txt");

      const res = await handleBatchRename({
        files,
        rules: [{ type: "case", conversion: "snake_case" }],
        dry_run: false,
      });

      expect(res.content[0]?.text ?? "").not.toContain(testDir);
      expect(JSON.stringify(res.structuredContent)).not.toContain(testDir);
    });
  });

  describe("a dry run", () => {
    it("reports collisions without rejecting", async () => {
      const files = await write("Invoice A.txt", "Invoice-A.txt");
      const before = (await fs.readdir(testDir)).sort();

      const res = await handleBatchRename({
        files,
        rules: [{ type: "case", conversion: "snake_case" }],
        response_format: "json",
      });

      expect(res.isError).toBeUndefined();
      const out = payload(res);
      expect(out.dry_run).toBe(true);
      expect(out.rejected).toBe(false);
      expect(out.conflicts).toHaveLength(1);
      expect(out.conflicts[0]?.kind).toBe("duplicate_target");
      expect(await fs.readdir(testDir)).toEqual(before);
    });

    it("shows the collisions in the markdown preview", async () => {
      const files = await write("Invoice A.txt", "Invoice-A.txt");

      const res = await handleBatchRename({
        files,
        rules: [{ type: "case", conversion: "snake_case" }],
      });

      const text = res.content[0]?.text ?? "";
      expect(text).toContain("Collisions");
      expect(text).toContain("invoice_a.txt");
      expect(text).toContain("duplicate_target");
      expect(text).toContain("would be rejected");

      // The markdown response also satisfies the declared outputSchema.
      expect(batchRenameOutputSchema.safeParse(res.structuredContent).success).toBe(
        true,
      );
    });
  });

  describe("a plan with no collisions", () => {
    it("renames as before and reports zero conflicts", async () => {
      const files = await write("A.txt", "B.txt");

      const res = await handleBatchRename({
        files,
        rules: [{ type: "case", conversion: "lowercase" }],
        dry_run: false,
        response_format: "json",
      });

      const out = payload(res);
      expect(res.isError).toBeUndefined();
      expect(out.rejected).toBe(false);
      expect(out.renamed).toBe(2);
      expect(out.conflicts).toEqual([]);
      expect((await fs.readdir(testDir)).sort()).toEqual(["a.txt", "b.txt"]);
    });

    it("treats a directory scan that is already consistent as clear", async () => {
      await write("x.txt", "y.txt");

      const res = await handleBatchRename({
        directory: testDir,
        rules: [{ type: "case", conversion: "lowercase" }],
        dry_run: false,
        response_format: "json",
      });

      const out = payload(res);
      expect(out.processed).toBe(2);
      expect(out.conflicts).toEqual([]);
      expect(out.renamed).toBe(0);
    });
  });
});
