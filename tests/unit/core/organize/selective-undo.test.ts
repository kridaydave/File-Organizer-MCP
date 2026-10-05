/**
 * Selective undo — the two halves of GitHub issue #42.
 *
 * Undoing one named operation was already possible by id. What was missing is
 * that no caller could learn the id, and that undoing anything other than the
 * newest operation was the unsafe path. These tests pin both halves as
 * behavior a caller observes:
 *
 *   1. `organize_files` returns the manifest id it wrote, and that same id
 *      reaches the history entry `view_history` renders.
 *   2. A non-newest undo whose paths a newer manifest also touched is refused
 *      before any file moves.
 *   3. A non-newest undo with no overlap still succeeds.
 *
 * Each test drives the public surface (the tool handler or RollbackService), so
 * a passing test means the tool works, not that a helper was called.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import fs from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";

const { CONFIG } = await import("../../../../src/config.js");
const { RollbackService, overlappingPathCount } =
  await import("../../../../src/core/organize/rollback.js");
const { handleOrganizeFiles } =
  await import("../../../../src/tools/file-organization.js");
const { handleViewHistory } =
  await import("../../../../src/tools/view-history.js");
const { handleUndoLastOperation } =
  await import("../../../../src/tools/rollback.js");
const { historyManifestId } = await import("../../../../src/server.js");
const { HistoryLoggerService } =
  await import("../../../../src/services/history-logger.service.js");

type RollbackAction = import("../../../../src/types.js").RollbackAction;

/** First text block of a tool response. */
function textOf(response: { content: Array<{ text: string }> }): string {
  const first = response.content[0];
  if (first === undefined) {
    throw new Error("tool response carried no content block");
  }
  return first.text;
}

describe("selective undo by manifest id", () => {
  let testDir: string;
  let storageDir: string;
  let rollbackService: InstanceType<typeof RollbackService>;
  let restoreCustomAllowed: string[] | undefined;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "selective-undo-"));
    // Manifests live outside testDir so a tree() listing of the data the undo
    // acts on never shows this test's own bookkeeping.
    storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "selective-undo-man-"));
    rollbackService = new RollbackService(storageDir);
    restoreCustomAllowed = CONFIG.paths._overrideCustomAllowed;
    CONFIG.paths.customAllowed = [testDir];
  });

  afterEach(async () => {
    CONFIG.paths.customAllowed = restoreCustomAllowed;
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.rm(storageDir, { recursive: true, force: true });
  });

  /** Create a source file the categorizer will pick up as a document. */
  async function seedFile(name: string, content = "hello"): Promise<string> {
    const filePath = path.join(testDir, name);
    await fs.writeFile(filePath, content);
    return filePath;
  }

  async function exists(candidate: string): Promise<boolean> {
    return fs
      .access(candidate)
      .then(() => true)
      .catch(() => false);
  }

  /** Relative listing, so assertions never bake an absolute path. */
  async function tree(): Promise<string[]> {
    const entries: string[] = [];
    const walk = async (dir: string, prefix: string): Promise<void> => {
      const dirents = await fs.readdir(dir, { withFileTypes: true });
      for (const dirent of dirents) {
        const child = path.join(dir, dirent.name);
        if (dirent.isDirectory()) {
          await walk(child, `${prefix}${dirent.name}/`);
        } else {
          entries.push(`${prefix}${dirent.name}`);
        }
      }
    };
    await walk(testDir, "");
    return entries.sort();
  }

  describe("the manifest id is discoverable", () => {
    it("organize_files returns the manifest id it wrote", async () => {
      const history = new HistoryLoggerService({
        dataDir: path.join(testDir, "history"),
      });
      await history.init();
      const ctx = { config: CONFIG, history };

      await seedFile("alpha.txt");
      await seedFile("beta.txt");

      const organized = await handleOrganizeFiles(
        {
          directory: testDir,
          dry_run: false,
          conflict_strategy: "rename",
          response_format: "json",
        },
        ctx as never,
      );
      const payload = JSON.parse(textOf(organized)) as {
        manifest_id?: string;
      };

      // The response is what a caller reads right after organizing, so it has
      // to carry the id. Without it, selective undo has no way in.
      expect(typeof payload.manifest_id).toBe("string");
      // A manifest id is a contract string: the bare UUID, no decoration.
      expect(payload.manifest_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );

      // And it is a real id, not a made-up one: the id the tool hands back is
      // the one undo accepts. The organizer writes manifests to the default
      // storage dir, so undo reads from there. Under jest that is inside the
      // worktree (see getRollbackDirectory), and this undo consumes the
      // manifest rather than leaving it behind.
      const undone = await new RollbackService().rollback(
        payload.manifest_id as string,
      );
      expect(undone.failed).toBe(0);
      expect(await exists(path.join(testDir, "alpha.txt"))).toBe(true);
      expect(await exists(path.join(testDir, "beta.txt"))).toBe(true);
      // Undo puts the files back; the category folder it created is left
      // empty, which is the organizer's directory, not a file it moved.
      expect(
        (await fs.readdir(path.join(testDir, "Documents"))).sort(),
      ).toEqual([]);
    });

    it("the audit logger picks the manifest id off the organize response", async () => {
      const history = new HistoryLoggerService({
        dataDir: path.join(testDir, "history"),
      });
      await history.init();
      const ctx = { config: CONFIG, history };

      await seedFile("gamma.txt");

      const organized = await handleOrganizeFiles(
        {
          directory: testDir,
          dry_run: false,
          conflict_strategy: "rename",
          response_format: "json",
        },
        ctx as never,
      );
      const manifestId = (JSON.parse(textOf(organized)) as {
        manifest_id?: string;
      }).manifest_id;

      // The history entry for a tool call is written by the server's audit
      // wrapper, not by the handler, so this is the join between the two: the
      // id the handler returned is the id the wrapper records.
      expect(historyManifestId(organized)).toBe(manifestId);
      // A response with no manifest reports none rather than an empty string,
      // which `undo_last_operation` would reject as a malformed UUID.
      expect(historyManifestId({ structuredContent: { directory: "x" } })).toBeUndefined();
      expect(historyManifestId({ structuredContent: { manifest_id: "" } })).toBeUndefined();
      expect(historyManifestId(undefined)).toBeUndefined();
    });

    it("view_history returns and renders the manifest id an entry carries", async () => {
      const history = new HistoryLoggerService({
        dataDir: path.join(testDir, "history"),
      });
      await history.init();
      const ctx = { config: CONFIG, history };

      // The server's audit logger is what puts the id on the entry; this is the
      // entry it produces, read back the way a later session reads it.
      const manifestId = crypto.randomUUID();
      await history.log({
        operation: "file_organizer_organize_files",
        source: "manual",
        status: "success",
        durationMs: 12,
        filesProcessed: 3,
        manifestId,
      });

      const json = await handleViewHistory(
        { limit: 20, response_format: "json" },
        ctx as never,
      );
      const jsonPayload = JSON.parse(textOf(json)) as {
        entries: Array<{ manifestId?: string }>;
      };
      expect(jsonPayload.entries.map((e) => e.manifestId)).toEqual([manifestId]);

      const markdown = await handleViewHistory(
        { limit: 20, response_format: "markdown" },
        ctx as never,
      );
      const body = textOf(markdown);
      expect(body).toContain("| Undo Manifest |");
      expect(body).toContain(manifestId);
      // The column says what to do with it, not just that it is there.
      expect(body).toContain("undo_last_operation");
    });

    it("organize_files returns no manifest_id on a dry run, and moves nothing", async () => {
      const history = new HistoryLoggerService({
        dataDir: path.join(testDir, "history"),
      });
      await history.init();
      const ctx = { config: CONFIG, history };

      await seedFile("gamma.txt");

      const dry = await handleOrganizeFiles(
        {
          directory: testDir,
          dry_run: true,
          conflict_strategy: "rename",
          response_format: "json",
        },
        ctx as never,
      );
      expect(
        (JSON.parse(textOf(dry)) as { manifest_id?: string }).manifest_id,
      ).toBeUndefined();

      // A dry run moves nothing, so there is nothing to undo and no id to
      // invent. The filesystem is the check, not the field.
      expect(await tree()).toEqual(["gamma.txt"]);
    });

    it("the organize_files markdown names the manifest id so it can be copied", async () => {
      const history = new HistoryLoggerService({
        dataDir: path.join(testDir, "history"),
      });
      await history.init();
      const ctx = { config: CONFIG, history };

      await seedFile("delta.txt");

      const organized = await handleOrganizeFiles(
        {
          directory: testDir,
          dry_run: false,
          conflict_strategy: "rename",
          response_format: "markdown",
        },
        ctx as never,
      );
      const body = textOf(organized);

      expect(body).toContain("Rollback Manifest ID");
      const idMatch = body.match(
        /Rollback Manifest ID:\*\* `([0-9a-f-]{36})`/i,
      );
      expect(idMatch).not.toBeNull();

      // The id printed to the user is the id undo accepts, not a lookalike.
      const undo = await handleUndoLastOperation({
        manifest_id: idMatch?.[1],
        response_format: "json",
      });
      expect((JSON.parse(textOf(undo)) as { failed: number }).failed).toBe(0);
    });
  });

  describe("undoing a non-newest operation", () => {
    /** Write a manifest by hand so timestamps and ids are controllable. */
    async function writeManifest(
      actions: RollbackAction[],
      timestamp: number,
      overrides?: { id?: string; hash?: string; signature?: string },
    ): Promise<string> {
      const id = overrides?.id ?? crypto.randomUUID();
      const manifest = await (async () => {
        const { manifestIntegrityService } =
          await import("../../../../src/core/organize/manifest-integrity.js");
        const base = {
          id,
          timestamp,
          description: `operation ${timestamp}`,
          actions,
          version: "1.0" as const,
          hash: overrides?.hash ?? manifestIntegrityService.computeHash(actions, timestamp),
        };
        return manifestIntegrityService.signManifest(base);
      })();

      if (overrides?.signature !== undefined) {
        manifest.signature = overrides.signature;
      }

      await fs.mkdir(storageDir, { recursive: true });
      await fs.writeFile(
        path.join(storageDir, `${id}.json`),
        JSON.stringify(manifest, null, 2),
      );
      return id;
    }

    it("refuses when a newer manifest moved the same path, before any file moves", async () => {
      const original = path.join(testDir, "shared.txt");
      const destination = path.join(testDir, "Documents", "shared.txt");
      const intruder = path.join(testDir, "Documents", "shared_1.txt");

      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(original, "original");
      await fs.rename(original, destination);

      // The operation under test: it moved original -> destination.
      const olderId = await writeManifest(
        [
          {
            type: "move",
            originalPath: original,
            currentPath: destination,
            timestamp: 1_000,
          },
        ],
        1_000,
      );

      // A later operation then put a different file at the same destination.
      // This is the collision: undoing the older operation would have to
      // overwrite it.
      await fs.rename(destination, intruder);
      await fs.writeFile(destination, "newer file");
      await writeManifest(
        [
          {
            type: "move",
            originalPath: destination,
            currentPath: intruder,
            timestamp: 2_000,
          },
        ],
        2_000,
      );

      const before = await tree();
      const result = await rollbackService.rollback(olderId);

      expect(result.success).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors.join(" ")).toContain("Refused to undo manifest");
      // The refusal names the conflicting manifest so the user knows what to
      // undo first. It is an id, not a path, so it survives sanitization.
      expect(result.errors.join(" ")).toMatch(
        /Conflicting manifests: [0-9a-f]{8}-[0-9a-f]{4}-/i,
      );

      // Nothing moved. This is the whole point of checking before mutating.
      expect(await tree()).toEqual(before);
      expect(await exists(intruder)).toBe(true);

      // The manifest survives a refusal, so the undo is still retryable.
      expect(await exists(path.join(storageDir, `${olderId}.json`))).toBe(true);
    });

    it("refuses a delete-restore that a newer manifest's delete already claims", async () => {
      const original = path.join(testDir, "notes.md");
      const backup = path.join(testDir, "backup", "notes.md");

      await fs.writeFile(original, "notes");
      const olderId = await writeManifest(
        [
          {
            type: "delete",
            originalPath: original,
            backupPath: backup,
            timestamp: 1_000,
          },
        ],
        1_000,
      );

      // The file was deleted and later restored by a newer operation, which
      // claimed the same original path. Restoring from the old backup would
      // hit COPYFILE_EXCL partway through the batch.
      await fs.mkdir(path.dirname(backup), { recursive: true });
      await fs.writeFile(backup, "deleted body");
      await fs.writeFile(original, "restored by newer op");
      await writeManifest(
        [
          {
            type: "delete",
            originalPath: original,
            backupPath: path.join(testDir, "backup", "notes_1.md"),
            timestamp: 2_000,
          },
        ],
        2_000,
      );

      const before = await tree();
      const result = await rollbackService.rollback(olderId);

      expect(result.success).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors.join(" ")).toContain("Refused to undo manifest");
      expect(await tree()).toEqual(before);
    });

    it("still undoes a non-newest operation when no newer manifest touches its paths", async () => {
      const firstOriginal = path.join(testDir, "one.txt");
      const firstDestination = path.join(testDir, "Documents", "one.txt");
      const secondOriginal = path.join(testDir, "two.txt");
      const secondDestination = path.join(testDir, "Documents", "two.txt");
      const intruderOriginal = path.join(testDir, "three.txt");
      const intruderDestination = path.join(testDir, "Pictures", "three.png");

      await fs.mkdir(path.dirname(firstDestination), { recursive: true });
      await fs.mkdir(path.dirname(secondDestination), { recursive: true });
      await fs.mkdir(path.dirname(intruderDestination), { recursive: true });
      await fs.writeFile(firstOriginal, "one");
      await fs.writeFile(secondOriginal, "two");
      await fs.writeFile(intruderOriginal, "three");
      await fs.rename(firstOriginal, firstDestination);
      await fs.rename(secondOriginal, secondDestination);
      await fs.rename(intruderOriginal, intruderDestination);

      const olderId = await writeManifest(
        [
          {
            type: "move",
            originalPath: firstOriginal,
            currentPath: firstDestination,
            timestamp: 1_000,
          },
        ],
        1_000,
      );
      const newerId = await writeManifest(
        [
          {
            type: "move",
            originalPath: secondOriginal,
            currentPath: secondDestination,
            timestamp: 2_000,
          },
        ],
        2_000,
      );
      // Disjoint paths, and newer than both. This is what must not block.
      await writeManifest(
        [
          {
            type: "move",
            originalPath: intruderOriginal,
            currentPath: intruderDestination,
            timestamp: 3_000,
          },
        ],
        3_000,
      );

      const result = await rollbackService.rollback(olderId);

      expect(result.failed).toBe(0);
      expect(result.success).toBe(1);
      // The older operation is undone; both newer ones stay applied. Names are
      // relative and `/`-separated so the expectation cannot drift by platform.
      expect(await tree()).toEqual([
        "Documents/two.txt",
        "Pictures/three.png",
        "one.txt",
      ]);
      expect(await exists(firstOriginal)).toBe(true);
      expect(await exists(firstDestination)).toBe(false);
      expect(await exists(secondDestination)).toBe(true);
      expect(await exists(intruderDestination)).toBe(true);

      // The spent manifest is retired, and the untouched newer one is not.
      expect(await exists(path.join(storageDir, `${olderId}.json`))).toBe(false);
      expect(await exists(path.join(storageDir, `${newerId}.json`))).toBe(true);
    });

    it("undoes the newest manifest with no conflict check result to get in the way", async () => {
      const original = path.join(testDir, "solo.txt");
      const destination = path.join(testDir, "Documents", "solo.txt");
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(original, "solo");
      await fs.rename(original, destination);

      const newestId = await writeManifest(
        [
          {
            type: "move",
            originalPath: original,
            currentPath: destination,
            timestamp: 5_000,
          },
        ],
        5_000,
      );

      const result = await rollbackService.rollback(newestId);
      expect(result.failed).toBe(0);
      expect(result.success).toBe(1);
      expect(await exists(original)).toBe(true);
    });

    it("treats a newer manifest whose signature does not verify as a conflict", async () => {
      const original = path.join(testDir, "forged.txt");
      const destination = path.join(testDir, "Documents", "forged.txt");
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(original, "forged");
      await fs.rename(original, destination);

      const olderId = await writeManifest(
        [
          {
            type: "move",
            originalPath: original,
            currentPath: destination,
            timestamp: 1_000,
          },
        ],
        1_000,
      );

      // Disjoint paths, but the manifest was tampered with. Ignoring it would
      // let a forged file claim or deny history; refusing is the safe side.
      await writeManifest(
        [
          {
            type: "move",
            originalPath: path.join(testDir, "elsewhere", "x.txt"),
            currentPath: path.join(testDir, "elsewhere", "Documents", "x.txt"),
            timestamp: 2_000,
          },
        ],
        2_000,
        { signature: crypto.randomBytes(32).toString("hex") },
      );

      const before = await tree();
      const result = await rollbackService.rollback(olderId);

      expect(result.failed).toBe(1);
      expect(result.errors.join(" ")).toContain("integrity check failed");
      expect(await tree()).toEqual(before);
    });
  });

  describe("overlappingPathCount", () => {
    const action = (
      originalPath: string,
      currentPath?: string,
    ): RollbackAction => ({
      type: currentPath ? "move" : "delete",
      originalPath,
      ...(currentPath ? { currentPath } : {}),
      timestamp: 0,
    });

    it("counts a path both manifests touch, whatever role it plays", () => {
      const target = {
        id: "a",
        timestamp: 1,
        description: "",
        version: "1.0" as const,
        actions: [action("/data/from.txt", "/data/Documents/from.txt")],
      };
      // The newer manifest only names the target's destination.
      const newer = {
        id: "b",
        timestamp: 2,
        description: "",
        version: "1.0" as const,
        actions: [action("/data/other.txt", "/data/Documents/from.txt")],
      };
      expect(overlappingPathCount(target, newer)).toBe(1);
    });

    it("counts zero for disjoint manifests", () => {
      const target = {
        id: "a",
        timestamp: 1,
        description: "",
        version: "1.0" as const,
        actions: [action("/data/a.txt", "/data/Documents/a.txt")],
      };
      const newer = {
        id: "b",
        timestamp: 2,
        description: "",
        version: "1.0" as const,
        actions: [action("/data/b.txt", "/data/Pictures/b.png")],
      };
      expect(overlappingPathCount(target, newer)).toBe(0);
    });
  });

  describe("the undo tool surfaces the refusal to the caller", () => {
    it("reports the refusal in both json and markdown, with no internal path", async () => {
      // The tool builds its own RollbackService, so this test writes into the
      // storage dir the tool reads and removes only what it wrote.
      const { getRollbackDirectory } =
        await import("../../../../src/core/config/paths.js");
      const { manifestIntegrityService } =
        await import("../../../../src/core/organize/manifest-integrity.js");

      const toolStorage = getRollbackDirectory();
      const original = path.join(testDir, "collide.txt");
      const destination = path.join(testDir, "Documents", "collide.txt");
      const intruder = path.join(testDir, "Documents", "collide_1.txt");

      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(original, "original");
      await fs.rename(original, destination);

      const olderActions: RollbackAction[] = [
        {
          type: "move",
          originalPath: original,
          currentPath: destination,
          timestamp: 1_000,
        },
      ];
      const olderId = crypto.randomUUID();
      const newerActions: RollbackAction[] = [
        {
          type: "move",
          originalPath: destination,
          currentPath: intruder,
          timestamp: 2_000,
        },
      ];
      const newerId = crypto.randomUUID();

      await fs.mkdir(toolStorage, { recursive: true });
      const writeSigned = async (
        id: string,
        timestamp: number,
        actions: RollbackAction[],
      ) => {
        // The real signer, so the manifest on disk is one this machine would have
        // written. A hand-built JSON blob would pass nothing here.
        const manifest = manifestIntegrityService.signManifest({
          id,
          timestamp,
          description: `operation ${timestamp}`,
          actions,
          version: "1.0",
        });
        await fs.writeFile(
          path.join(toolStorage, `${id}.json`),
          JSON.stringify(manifest, null, 2),
        );
      };
      await writeSigned(olderId, 1_000, olderActions);

      // A newer operation takes over the same destination.
      await fs.rename(destination, intruder);
      await fs.writeFile(destination, "newer");
      await writeSigned(newerId, 2_000, newerActions);

      const before = await tree();
      try {
        const json = await handleUndoLastOperation({
          manifest_id: olderId,
          response_format: "json",
        });
        const jsonText = textOf(json);
        expect(json.isError).toBe(true);
        expect(jsonText).toContain("Refused to undo manifest");
        expect(jsonText).not.toContain(toolStorage);

        const markdown = await handleUndoLastOperation({
          manifest_id: olderId,
          response_format: "markdown",
        });
        expect(markdown.isError).toBe(true);
        expect(textOf(markdown)).toContain("Refused to undo manifest");
        expect(textOf(markdown)).not.toContain(toolStorage);

        // Neither format moved a file.
        expect(await tree()).toEqual(before);
      } finally {
        await fs.rm(path.join(toolStorage, `${olderId}.json`), { force: true });
        await fs.rm(path.join(toolStorage, `${newerId}.json`), { force: true });
      }
    });
  });
});