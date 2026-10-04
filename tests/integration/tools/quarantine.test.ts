/**
 * quarantine_files / restore_quarantine — tool wiring.
 *
 * These tests go through the registered handlers, so they cover what the unit
 * suite cannot: the Zod schema, the dry-run default the schema carries, the
 * registry entry, and both output formats (json and markdown are both part of
 * the tool contract, and the SDK rejects an outputSchema-declaring result with
 * no structuredContent).
 *
 * The sandbox lives under os.tmpdir() and is granted through
 * CONFIG.paths.customAllowed, the same setter the other security suites use.
 * Path assertions compare paths RELATIVE to the sandbox root: the handlers
 * return canonical paths, and macOS answers /private/var for a /var temp dir
 * while Windows expands 8.3 short names.
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
import os from "os";
import path from "path";
import type { ToolContext } from "../../../src/mcp/context.js";

const { CONFIG } = await import("../../../src/core/config/defaults.js");
const { quarantineFilesToolDefinition, restoreQuarantineToolDefinition } =
  await import("../../../src/tools/file-quarantine.js");
const { handleQuarantineFiles, handleRestoreQuarantine } =
  await import("../../../src/tools/file-quarantine.js");
const { getToolHandler } = await import("../../../src/mcp/registry.js");
const { quarantineFilesOutputSchema, restoreQuarantineOutputSchema } =
  await import("../../../src/schemas/output.js");

type QuarantineShape = {
  directory: string;
  quarantine_dir: string;
  dry_run: boolean;
  requested: number;
  planned: number;
  quarantined: number;
  items: { file: string; from: string; to: string }[];
  skipped: { path: string; reason: string }[];
  errors: string[];
  manifest_id?: string;
};

type RestoreShape = {
  dry_run: boolean;
  quarantine_id: string;
  requested: number;
  planned: number;
  restored: number;
  items: { file: string; from: string; to: string }[];
  errors: string[];
  manifest_id?: string;
};

describe("quarantine tools", () => {
  let testDir: string;
  let restoreCustomAllowed: string[] | undefined;
  let history: { log: (entry: Record<string, unknown>) => Promise<void> };
  let logged: Record<string, unknown>[];
  let ctx: ToolContext;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "fom-quarantine-tool-"));
    restoreCustomAllowed = CONFIG.paths._overrideCustomAllowed;
    CONFIG.paths.customAllowed = [os.tmpdir()];
    logged = [];
    history = {
      log: async (entry: Record<string, unknown>) => {
        logged.push(entry);
      },
    };
    // The handlers only ever call history.log, so the stub carries just that
// method. The cast is here rather than at ten call sites, and it fails loudly
// if a handler starts reaching for another method on the service.
    ctx = { config: {}, history: history as unknown as ToolContext["history"] };
  });

  afterEach(async () => {
    CONFIG.paths.customAllowed = restoreCustomAllowed;
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  /**
   * `target` relative to the sandbox root, with BOTH sides canonicalized
   * through the same async fs.realpath the handlers use.
   *
   * Canonicalizing the base differently from the target is what breaks this on
   * Windows. The handlers resolve through fs.realpath (fs/promises), which
   * expands an 8.3 short name (RUNNER~1 -> runneradmin); fs.realpathSync (the
   * "fs" export, the JS implementation) does not. Mix the two and path.relative
   * no longer sees a shared prefix, so it climbs to the drive root and walks
   * back down: "invoice.exe" comes back as
   * "../../../runneradmin/AppData/Local/Temp/.../invoice.exe". macOS has the
   * mirror-image trap (/var -> /private/var). One function on both sides makes
   * the comparison spelling-independent.
   */
  async function rel(target: string): Promise<string> {
    const [base, resolvedTarget] = await Promise.all([
      fs.realpath(testDir),
      canonicalize(target),
    ]);
    return path.relative(base, resolvedTarget).split(path.sep).join("/");
  }

  /**
   * Canonical form of `target`, which may not exist yet: on a dry run neither
   * the destination file nor the quarantine directory has been created. Resolve
   * the nearest existing ancestor and re-append the rest, which is how the
   * service's own resolver treats a not-yet-created path.
   */
  async function canonicalize(target: string): Promise<string> {
    const missing: string[] = [];
    let current = target;

    for (;;) {
      try {
        const real = await fs.realpath(current);
        return missing.length > 0
          ? path.join(real, ...missing.reverse())
          : real;
      } catch {
        const parent = path.dirname(current);
        if (parent === current) return target;
        missing.push(path.basename(current));
        current = parent;
      }
    }
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

  async function quarantine(
    files: string[],
    overrides: Record<string, unknown> = {},
  ): Promise<QuarantineShape> {
    const res = await handleQuarantineFiles(
      { directory: testDir, files, response_format: "json", ...overrides },
      ctx,
    );
    expect(res.isError).toBeUndefined();
    return res.structuredContent as QuarantineShape;
  }

  async function restore(
    overrides: Record<string, unknown> = {},
  ): Promise<RestoreShape> {
    const res = await handleRestoreQuarantine(
      { response_format: "json", ...overrides },
      ctx,
    );
    expect(res.isError).toBeUndefined();
    return res.structuredContent as RestoreShape;
  }

  describe("registration and schema", () => {
    it("registers both tools with a handler", () => {
      expect(getToolHandler(quarantineFilesToolDefinition.name)).toBeDefined();
      expect(
        getToolHandler(restoreQuarantineToolDefinition.name),
      ).toBeDefined();
    });

    it("is not read-only and is not idempotent for either tool", () => {
      // Both move files. A client that trusted a read-only hint here would
      // auto-approve a mutation, and a client that trusted idempotency would
      // assume a second call is a no-op.
      for (const def of [
        quarantineFilesToolDefinition,
        restoreQuarantineToolDefinition,
      ]) {
        expect(def.annotations?.readOnlyHint).toBe(false);
        expect(def.annotations?.destructiveHint).toBe(true);
        expect(def.annotations?.idempotentHint).toBe(false);
      }
    });

    it("requires a directory and at least one file for quarantine", async () => {
      const res = await handleQuarantineFiles({ directory: testDir }, ctx);
      expect(res.isError).toBe(true);
    });

    it("rejects an empty file list for quarantine", async () => {
      const res = await handleQuarantineFiles(
        { directory: testDir, files: [] },
        ctx,
      );
      expect(res.isError).toBe(true);
    });
  });

  describe("quarantine_files", () => {
    it("defaults to a dry run, writes no history, and moves nothing", async () => {
      const flagged = await write("invoice.exe", "suspicious");

      const out = await quarantine([flagged]);

      expect(out.dry_run).toBe(true);
      expect(out.planned).toBe(1);
      expect(out.quarantined).toBe(0);
      expect(out.manifest_id).toBeUndefined();
      expect(out.items[0]?.file).toBe("invoice.exe");
      expect(await rel(out.items[0]?.from ?? "")).toBe("invoice.exe");
      expect(await exists(flagged)).toBe(true);
      // A dry run is a preview, so it leaves no audit trail either.
      expect(logged).toEqual([]);
    });

    it("applies the move and logs history with the manifest id", async () => {
      const flagged = await write("invoice.exe", "suspicious");

      const out = await quarantine([flagged], { dry_run: false });

      expect(out.quarantined).toBe(1);
      expect(out.errors).toEqual([]);
      expect(out.manifest_id).toBeTruthy();
      expect(await exists(flagged)).toBe(false);
      expect(
        await exists(
          path.join(testDir, ".file-organizer-quarantine", "invoice.exe"),
        ),
      ).toBe(true);

      expect(logged).toHaveLength(1);
      expect(logged[0]?.operation).toBe("file_organizer_quarantine_files");
      expect(logged[0]?.filesProcessed).toBe(1);
      // The manifest id is in the trail, so a later restore can name it.
      expect(String(logged[0]?.details)).toContain(out.manifest_id);
    });

    it("keeps a same-basename pair apart", async () => {
      const first = await write("one/notes.txt", "first");
      const second = await write("two/notes.txt", "second");

      const out = await quarantine([first, second], { dry_run: false });

      expect(out.quarantined).toBe(2);
      expect(new Set(out.items.map((i) => i.to)).size).toBe(2);
      const quarantined = path.join(testDir, ".file-organizer-quarantine");
      expect((await fs.readdir(quarantined)).sort()).toEqual([
        "notes.txt",
        "notes_1.txt",
      ]);
    });

    it("stays spelling-independent when the raw path differs from the canonical one", async () => {
      // The Windows failure this suite shipped with: os.tmpdir() hands back a
      // path spelled with an 8.3 short name (C:\Users\RUNNER~1\...) while the
      // handlers return the expanded long name (C:\Users\runneradmin\...). If
      // only one side is canonicalized, path.relative stops seeing a shared
      // prefix and returns a "../../..\runneradmin\...\file" chain instead of
      // the bare filename. On Windows `raw` below really is the short-name
      // spelling, so this is the regression test for that bug.
      const raw = path.join(testDir, "invoice.exe");
      await write("invoice.exe", "suspicious");

      const out = await quarantine([raw]);

      expect(await rel(raw)).toBe("invoice.exe");
      expect(await rel(out.items[0]?.from ?? "")).toBe("invoice.exe");
    });

    it("refuses a quarantine directory outside the allowed roots", async () => {
      const flagged = await write("a.txt", "a");
      const outside = path.join(
        path.parse(os.tmpdir()).root,
        "not-allowed-quarantine",
      );

      const res = await handleQuarantineFiles(
        {
          directory: testDir,
          files: [flagged],
          quarantine_dir: outside,
          response_format: "json",
        },
        ctx,
      );

      expect(res.isError).toBe(true);
      expect(await exists(flagged)).toBe(true);
    });

    it("refuses a source directory outside the allowed roots", async () => {
      const res = await handleQuarantineFiles(
        {
          directory: path.parse(os.tmpdir()).root,
          files: ["whatever.txt"],
          response_format: "json",
        },
        ctx,
      );

      expect(res.isError).toBe(true);
    });

    it("returns markdown that names the plan and the manifest", async () => {
      const flagged = await write("invoice.exe", "suspicious");

      const res = await handleQuarantineFiles(
        { directory: testDir, files: [flagged], dry_run: false },
        ctx,
      );

      const text = String(res.content[0]?.text ?? "");
      expect(text).toContain("### Quarantine quarantined");
      expect(text).toContain("invoice.exe");
      expect(text).toContain("undo_last_operation");
      expect(text).toContain("restore_quarantine");
      // The markdown path still carries structuredContent: the SDK rejects
      // results from outputSchema-declaring tools without it.
      expect(
        quarantineFilesOutputSchema.safeParse(res.structuredContent).success,
      ).toBe(true);
    });
  });

  describe("restore_quarantine", () => {
    it("round-trips a quarantine back to the exact original paths", async () => {
      const first = await write("one/notes.txt", "first");
      const second = await write("two/notes.txt", "second");
      const quarantined = await quarantine([first, second], {
        dry_run: false,
      });

      const restored = await restore({
        quarantine_id: quarantined.manifest_id,
        dry_run: false,
      });

      expect(restored.restored).toBe(2);
      expect(restored.errors).toEqual([]);
      expect(restored.quarantine_id).toBe(quarantined.manifest_id);
      // The actual claim: exact original paths, exact content.
      await expect(fs.readFile(first, "utf-8")).resolves.toBe("first");
      await expect(fs.readFile(second, "utf-8")).resolves.toBe("second");
      expect(
        (
          await fs.readdir(path.join(testDir, ".file-organizer-quarantine"))
        ).sort(),
      ).toEqual([]);
    });

    it("defaults to a dry run that moves nothing", async () => {
      const flagged = await write("invoice.exe", "suspicious");
      const quarantined = await quarantine([flagged], { dry_run: false });

      const restored = await restore({
        quarantine_id: quarantined.manifest_id,
      });

      expect(restored.dry_run).toBe(true);
      expect(restored.planned).toBe(1);
      expect(restored.restored).toBe(0);
      // Still quarantined: a restore preview is not a restore.
      expect(
        await exists(
          path.join(testDir, ".file-organizer-quarantine", "invoice.exe"),
        ),
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
        const older = await quarantine([first], { dry_run: false });
        const second = await write("second.txt", "second");
        const newer = await quarantine([second], { dry_run: false });
        expect(older.manifest_id).not.toBe(newer.manifest_id);

        const restored = await restore({ dry_run: false });

        expect(restored.quarantine_id).toBe(newer.manifest_id);
        expect(restored.restored).toBe(1);
        await expect(fs.readFile(second, "utf-8")).resolves.toBe("second");
      } finally {
        clock.mockRestore();
      }
    });

    it("logs history with its own manifest id", async () => {
      const flagged = await write("invoice.exe", "suspicious");
      const quarantined = await quarantine([flagged], { dry_run: false });

      const restored = await restore({
        quarantine_id: quarantined.manifest_id,
        dry_run: false,
      });

      expect(restored.manifest_id).toBeTruthy();
      expect(restored.manifest_id).not.toBe(quarantined.manifest_id);
      expect(logged.at(-1)?.operation).toBe(
        "file_organizer_restore_quarantine",
      );
    });

    it("reports an error for a quarantine id that does not exist", async () => {
      const res = await handleRestoreQuarantine(
        {
          quarantine_id: "00000000-0000-4000-8000-000000000000",
          dry_run: false,
          response_format: "json",
        },
        ctx,
      );

      expect(res.isError).toBe(true);
      // The message must not carry an internal filesystem path.
      const text = String(res.content[0]?.text ?? "");
      expect(text).not.toContain(testDir);
    });

    it("reports an error when the quarantine id is not a UUID", async () => {
      const res = await handleRestoreQuarantine(
        { quarantine_id: "../../etc/passwd", response_format: "json" },
        ctx,
      );

      expect(res.isError).toBe(true);
    });

    it("returns markdown that names the restore and its manifest", async () => {
      const flagged = await write("invoice.exe", "suspicious");
      const quarantined = await quarantine([flagged], { dry_run: false });

      const res = await handleRestoreQuarantine(
        { quarantine_id: quarantined.manifest_id, dry_run: false },
        ctx,
      );

      const text = String(res.content[0]?.text ?? "");
      expect(text).toContain("### Quarantine restored");
      expect(text).toContain("undo_last_operation");
      expect(
        restoreQuarantineOutputSchema.safeParse(res.structuredContent).success,
      ).toBe(true);
    });
  });
});
