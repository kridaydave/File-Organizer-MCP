/**
 * QuarantineService — reversible set-aside.
 *
 * The claim these tests pin is reversibility, so the assertions are about what
 * lands on disk rather than about the shape of the returned object. The
 * round-trip test quarantines, restores, and checks that every file is back at
 * the path it started from with the same content.
 *
 * Every assertion compares paths RELATIVE to the sandbox root. The service
 * returns canonical paths (validateStrictPath realpaths them), and macOS
 * answers /private/var for a /var temp dir while Windows expands 8.3 short
 * names, so raw absolute path strings would pin one platform's spelling.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import fs from "fs/promises";
import { realpathSync } from "fs";
import os from "os";
import path from "path";

const { CONFIG } = await import("../../../src/core/config/defaults.js");
const { QuarantineService } =
  await import("../../../src/core/organize/quarantine.js");
const { RollbackService } = await import("../../../src/core/organize/rollback.js");
const { getQuarantineDirectory } = await import(
  "../../../src/core/config/paths.js"
);

describe("QuarantineService", () => {
  let testDir: string;
  let manifestDir: string;
  let restoreCustomAllowed: string[] | undefined;
  let service: InstanceType<typeof QuarantineService>;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "fom-quarantine-"));
    manifestDir = await fs.mkdtemp(path.join(os.tmpdir(), "fom-quarantine-man-"));
    restoreCustomAllowed = CONFIG.paths._overrideCustomAllowed;
    CONFIG.paths.customAllowed = [os.tmpdir()];
    service = new QuarantineService(new RollbackService(manifestDir));
  });

  afterEach(async () => {
    CONFIG.paths.customAllowed = restoreCustomAllowed;
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.rm(manifestDir, { recursive: true, force: true });
  });

  /**
   * `target` relative to the sandbox root, so assertions never pin one
   * platform's absolute spelling.
   *
   * The base is the CANONICAL root, not testDir: the service returns
   * realpath'd paths, and on macOS a /var temp dir canonicalizes to
   * /private/var, so relative() against the raw root would produce a
   * ../..-prefixed string rather than the path being asserted.
   */
  function rel(target: string): string {
    return path
      .relative(realpathSync(testDir), target)
      .split(path.sep)
      .join("/");
  }

  async function write(name: string, content: string): Promise<string> {
    const full = path.join(testDir, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
    return full;
  }

  async function exists(target: string): Promise<boolean> {
    try {
      await fs.access(target);
      return true;
    } catch {
      return false;
    }
  }

    describe("quarantine", () => {
    it("defaults to a dry run that moves nothing", async () => {
      const flagged = await write("invoice.exe", "suspicious");

      const result = await service.quarantine({
        directory: testDir,
        files: [flagged],
      });

      expect(result.dry_run).toBe(true);
      expect(result.planned).toBe(1);
      // Planned is not moved: a dry run must not read as a completed action.
      expect(result.quarantined).toBe(0);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.file).toBe("invoice.exe");
      expect(rel(result.items[0]?.from ?? "")).toBe("invoice.exe");
      expect(rel(result.items[0]?.to ?? "")).toBe(
        ".file-organizer-quarantine/invoice.exe",
      );
      // No manifest either — nothing to undo means nothing to claim.
      expect(result.manifest_id).toBeUndefined();
      expect(await exists(flagged)).toBe(true);
      expect(await exists(getQuarantineDirectory(testDir))).toBe(false);
    });

    it("derives the quarantine directory from the source, not a fixed path", async () => {
      const flagged = await write("notes.txt", "hello");

      const result = await service.quarantine({
        directory: testDir,
        files: [flagged],
      });

      // Not a fixed path: derived from the source directory. The service returns the
      // canonical form, so compare against the canonical source too.
      const realTestDir = await fs.realpath(testDir);
      expect(result.quarantine_dir).toBe(
        getQuarantineDirectory(realTestDir),
      );
      expect(rel(result.quarantine_dir)).toBe(".file-organizer-quarantine");
    });

    it("honours an explicit quarantine directory inside the allowed roots", async () => {
      const flagged = await write("a.txt", "a");
      const custom = path.join(testDir, "set-aside");

      const result = await service.quarantine({
        directory: testDir,
        files: [flagged],
        quarantineDir: custom,
      });

      expect(rel(result.quarantine_dir)).toBe("set-aside");
      expect(rel(result.items[0]?.to ?? "")).toBe("set-aside/a.txt");
    });

    it("refuses a quarantine directory outside the allowed roots", async () => {
      const flagged = await write("a.txt", "a");
      const outside = path.join(
        path.parse(os.tmpdir()).root,
        "not-allowed-quarantine",
      );

      await expect(
        service.quarantine({
          directory: testDir,
          files: [flagged],
          quarantineDir: outside,
        }),
      ).rejects.toThrow();

      expect(await exists(flagged)).toBe(true);
    });

    it("moves the file, leaves it readable, and writes a rollback manifest", async () => {
      const flagged = await write("invoice.exe", "suspicious bytes");

      const result = await service.quarantine({
        directory: testDir,
        files: [flagged],
        dryRun: false,
      });

      expect(result.quarantined).toBe(1);
      expect(result.errors).toEqual([]);
      expect(result.manifest_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(await exists(flagged)).toBe(false);

      // Quarantine is a move, not a delete: the content is still there.
      const quarantined = path.join(testDir, ".file-organizer-quarantine");
      const contents = await fs.readdir(quarantined);
      expect(contents.sort()).toEqual(["invoice.exe"]);
      await expect(
        fs.readFile(path.join(quarantined, "invoice.exe"), "utf-8"),
      ).resolves.toBe("suspicious bytes");

      // The manifest points back at the original path, which is what makes
      // the move undoable.
      const raw = await fs.readFile(
        path.join(manifestDir, `${result.manifest_id}.json`),
        "utf-8",
      );
      const manifest = JSON.parse(raw) as {
        actions: { type: string; originalPath: string; currentPath: string }[];
      };
      expect(manifest.actions).toHaveLength(1);
      expect(manifest.actions[0]?.type).toBe("move");
      expect(rel(manifest.actions[0]?.originalPath ?? "")).toBe("invoice.exe");
      expect(rel(manifest.actions[0]?.currentPath ?? "")).toBe(
        ".file-organizer-quarantine/invoice.exe",
      );
    });

    it("keeps two same-basename files from different directories apart", async () => {
      const first = await write("one/notes.txt", "first");
      const second = await write("two/notes.txt", "second");

      const result = await service.quarantine({
        directory: testDir,
        files: [first, second],
        dryRun: false,
      });

      expect(result.quarantined).toBe(2);
      expect(result.errors).toEqual([]);
      // Neither file overwrote the other: the plan resolved the clash into
      // two distinct destinations.
      expect(new Set(result.items.map((i) => i.to)).size).toBe(2);
      expect(result.items.map((i) => rel(i.to)).sort()).toEqual([
        ".file-organizer-quarantine/notes.txt",
        ".file-organizer-quarantine/notes_1.txt",
      ]);

      const quarantined = path.join(testDir, ".file-organizer-quarantine");
      const contents = (await fs.readdir(quarantined)).sort();
      expect(contents).toEqual(["notes.txt", "notes_1.txt"]);
      // And each one kept its own content, so the rename did not swap them.
      await expect(
        fs.readFile(path.join(quarantined, "notes.txt"), "utf-8"),
      ).resolves.toBe("first");
      await expect(
        fs.readFile(path.join(quarantined, "notes_1.txt"), "utf-8"),
      ).resolves.toBe("second");
    });

    it("does not clobber a file already sitting in the quarantine directory", async () => {
      const earlier = await write("earlier/notes.txt", "earlier");
      await service.quarantine({
        directory: testDir,
        files: [earlier],
        dryRun: false,
      });

      const later = await write("later/notes.txt", "later");
      const result = await service.quarantine({
        directory: testDir,
        files: [later],
        dryRun: false,
      });

      expect(result.quarantined).toBe(1);
      const quarantined = path.join(testDir, ".file-organizer-quarantine");
      expect((await fs.readdir(quarantined)).sort()).toEqual([
        "notes.txt",
        "notes_1.txt",
      ]);
      await expect(
        fs.readFile(path.join(quarantined, "notes.txt"), "utf-8"),
      ).resolves.toBe("earlier");
    });

    it("skips a file that is already in quarantine instead of nesting it", async () => {
      const flagged = await write("invoice.exe", "suspicious");
      await service.quarantine({
        directory: testDir,
        files: [flagged],
        dryRun: false,
      });

      const second = await service.quarantine({
        directory: testDir,
        files: [path.join(testDir, ".file-organizer-quarantine", "invoice.exe")],
      });

      expect(second.planned).toBe(0);
      expect(second.skipped).toHaveLength(1);
      expect(second.skipped[0]?.reason).toBe(
        "Already in the quarantine directory",
      );
    });

    it("refuses a file outside the directory being quarantined", async () => {
      const inside = await write("inside.txt", "a");
      const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "fom-outside-"));
      const outside = path.join(outsideDir, "outside.txt");
      await fs.writeFile(outside, "b");

      try {
        await expect(
          service.quarantine({
            directory: testDir,
            files: [inside, outside],
          }),
        ).rejects.toThrow();

        // Fail closed: the batch validated before the first move, so the
        // file that WAS allowed stayed where it was.
        expect(await exists(inside)).toBe(true);
        expect(await exists(outside)).toBe(true);
      } finally {
        await fs.rm(outsideDir, { recursive: true, force: true });
      }
    });

    it("reports an empty file list as nothing to do", async () => {
      const result = await service.quarantine({
        directory: testDir,
        files: [],
      });

      expect(result.requested).toBe(0);
      expect(result.planned).toBe(0);
      expect(result.quarantined).toBe(0);
    });
  });

  describe("restore", () => {
    /** Quarantine a batch and return the manifest id. */
    async function quarantineNow(
      files: string[],
    ): Promise<string> {
      const result = await service.quarantine({
        directory: testDir,
        files,
        dryRun: false,
      });
      if (!result.manifest_id) {
        throw new Error("quarantine did not produce a manifest id");
      }
      return result.manifest_id;
    }

    it("returns every file to the exact path it came from", async () => {
      const first = await write("one/notes.txt", "first");
      const second = await write("two/deep/notes.txt", "second");
      const manifestId = await quarantineNow([first, second]);

      const result = await service.restore({
        quarantineId: manifestId,
        dryRun: false,
      });

      expect(result.errors).toEqual([]);
      expect(result.restored).toBe(2);
      // Round-trip: same relative paths, same content.
      await expect(fs.readFile(first, "utf-8")).resolves.toBe("first");
      await expect(fs.readFile(second, "utf-8")).resolves.toBe("second");
      // And nothing left behind in quarantine. The directory itself stays
      // (empty) — it is reused by the next quarantine.
      const quarantined = path.join(testDir, ".file-organizer-quarantine");
      expect((await fs.readdir(quarantined)).sort()).toEqual([]);
    });

    it("round-trips a same-basename collision back to both originals", async () => {
      const first = await write("one/notes.txt", "first");
      const second = await write("two/notes.txt", "second");
      const manifestId = await quarantineNow([first, second]);

      const result = await service.restore({
        quarantineId: manifestId,
        dryRun: false,
      });

      expect(result.restored).toBe(2);
      expect(result.errors).toEqual([]);
      // Each original path got its own content back, not a swapped pair.
      await expect(fs.readFile(first, "utf-8")).resolves.toBe("first");
      await expect(fs.readFile(second, "utf-8")).resolves.toBe("second");
    });

    it("writes its own manifest, so the restore can itself be undone", async () => {
      const flagged = await write("invoice.exe", "suspicious");
      const manifestId = await quarantineNow([flagged]);

      const result = await service.restore({
        quarantineId: manifestId,
        dryRun: false,
      });

      expect(result.manifest_id).toBeTruthy();
      expect(result.manifest_id).not.toBe(manifestId);

      const raw = await fs.readFile(
        path.join(manifestDir, `${result.manifest_id}.json`),
        "utf-8",
      );
      const manifest = JSON.parse(raw) as {
        actions: { originalPath: string; currentPath: string }[];
      };
      // The restore manifest points forward, not back at quarantine.
      expect(rel(manifest.actions[0]?.originalPath ?? "")).toBe(
        ".file-organizer-quarantine/invoice.exe",
      );
      expect(rel(manifest.actions[0]?.currentPath ?? "")).toBe("invoice.exe");
    });

    it("defaults to a dry run that moves nothing", async () => {
      const flagged = await write("invoice.exe", "suspicious");
      const manifestId = await quarantineNow([flagged]);

      const result = await service.restore({ quarantineId: manifestId });

      expect(result.dry_run).toBe(true);
      expect(result.planned).toBe(1);
      expect(result.restored).toBe(0);
      // The file is still in quarantine: a restore preview is not a restore.
      expect(
        await exists(path.join(testDir, ".file-organizer-quarantine", "invoice.exe")),
      ).toBe(true);
      expect(await exists(flagged)).toBe(false);
    });

    it("restores the most recent quarantine when no id is given", async () => {
      // "Most recent" is decided by manifest timestamp, so two batches
      // written inside the same millisecond would make this a coin flip.
      // Advance the clock a step per call to pin the ordering.
      let tick = 0;
      const base = Date.now();
      const clock = jest
        .spyOn(Date, "now")
        .mockImplementation(() => base + tick++ * 1000);

      try {
        const first = await write("first.txt", "first");
        const older = await quarantineNow([first]);
        const second = await write("second.txt", "second");
        const newer = await quarantineNow([second]);
        expect(older).not.toBe(newer);

        const result = await service.restore({ dryRun: false });

        expect(result.quarantine_id).toBe(newer);
        expect(result.restored).toBe(1);
        await expect(fs.readFile(second, "utf-8")).resolves.toBe("second");
      } finally {
        clock.mockRestore();
      }
    });

    it("retires the quarantine manifest once the restore lands", async () => {
      const flagged = await write("invoice.exe", "suspicious");
      const manifestId = await quarantineNow([flagged]);

      await service.restore({ quarantineId: manifestId, dryRun: false });

      expect(await exists(path.join(manifestDir, `${manifestId}.json`))).toBe(
        false,
      );
    });

    it("rejects a manifest id that is not a UUID", async () => {
      await expect(
        service.restore({ quarantineId: "../../etc/passwd" }),
      ).rejects.toThrow(/format/i);
    });

    it("refuses to guess when no quarantine manifest exists", async () => {
      // A store with nothing in it: "no id given" must fail loudly rather
      // than silently restore some unrelated batch.
      const emptyDir = await fs.mkdtemp(
        path.join(os.tmpdir(), "fom-quarantine-empty-"),
      );
      const empty = new QuarantineService(new RollbackService(emptyDir));

      try {
        await expect(empty.restore({ dryRun: false })).rejects.toThrow(
          /no quarantine manifest/i,
        );
      } finally {
        await fs.rm(emptyDir, { recursive: true, force: true });
      }
    });

    it("reports a manifest id that does not exist", async () => {
      await expect(
        service.restore({
          quarantineId: "00000000-0000-4000-8000-000000000000",
        }),
      ).rejects.toThrow(/not found/i);
    });

    it("refuses a manifest whose integrity check fails", async () => {
      const flagged = await write("invoice.exe", "suspicious");
      const manifestId = await quarantineNow([flagged]);

      // Rewrite the recorded destination, leaving the signature stale.
      const file = path.join(manifestDir, `${manifestId}.json`);
      const manifest = JSON.parse(await fs.readFile(file, "utf-8")) as {
        actions: { currentPath: string }[];
      };
      manifest.actions[0]!.currentPath = path.join(testDir, "elsewhere.exe");
      await fs.writeFile(file, JSON.stringify(manifest, null, 2));

      await expect(
        service.restore({ quarantineId: manifestId, dryRun: false }),
      ).rejects.toThrow(/integrity/i);
      // The file was not moved on the strength of a tampered manifest.
      expect(await exists(flagged)).toBe(false);
      expect(
        await exists(path.join(testDir, ".file-organizer-quarantine", "invoice.exe")),
      ).toBe(true);
    });

    it("undo of the restore puts the files back into quarantine", async () => {
      const flagged = await write("invoice.exe", "suspicious");
      const manifestId = await quarantineNow([flagged]);
      const restore = await service.restore({
        quarantineId: manifestId,
        dryRun: false,
      });

      // The existing rollback path is the one that reverses a restore.
      const undo = new RollbackService(manifestDir);
      const result = await undo.rollback(restore.manifest_id as string);

      expect(result.success).toBe(1);
      expect(result.failed).toBe(0);
      expect(await exists(flagged)).toBe(false);
      expect(
        await exists(path.join(testDir, ".file-organizer-quarantine", "invoice.exe")),
      ).toBe(true);
    });
  });
});
