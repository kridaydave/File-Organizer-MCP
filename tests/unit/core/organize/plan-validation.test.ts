/**
 * Plan validation — the four checks the tool promises.
 *
 * Plans are built by hand here so each check is exercised in isolation, except
 * the disk-touching ones, which run against a real temp sandbox. Cross-device
 * is the only check that cannot be produced by a sandbox on every platform, so
 * the device id of the destination folder is forced with a stat spy: the
 * comparison under test is the real one, only the number differs.
 *
 * Nothing here writes outside os.tmpdir() and no assertion compares a raw
 * absolute path across platforms — basenames and relative paths are compared
 * instead, since macOS canonicalizes /var to /private/var.
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
import type { OrganizationPlan } from "../../../../src/types.js";

const { validateOrganizationPlan } =
  await import("../../../../src/core/organize/plan-validation.js");

type Move = OrganizationPlan["moves"][number];

function emptyPlan(
  overrides: Partial<OrganizationPlan> = {},
): OrganizationPlan {
  return {
    moves: [],
    categoryCounts: {},
    conflicts: [],
    skippedFiles: [],
    estimatedDuration: 0,
    warnings: [],
    ...overrides,
  };
}

function move(
  overrides: Partial<Move> & Pick<Move, "source" | "destination">,
): Move {
  return {
    category: "Documents",
    hasConflict: false,
    conflictResolution: "rename",
    ...overrides,
  };
}

function planOf(moves: Move[], overrides: Partial<OrganizationPlan> = {}) {
  return emptyPlan({ moves, ...overrides });
}

describe("validateOrganizationPlan", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "plan-validation-"));
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    // Windows holds file handles briefly after a stat.
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(root, { recursive: true, force: true });
  });

  async function write(relative: string, content = "x"): Promise<string> {
    const full = path.join(root, relative);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
    return full;
  }

  // The tool reports native filesystem paths, so a relative path derived from
  // them carries the platform separator. Normalize to "/" so the literals below
  // read the same on Linux, macOS, and Windows. Replacing the backslash
  // explicitly, instead of splitting on path.sep, keeps the transformation
  // verifiable from a POSIX host.
  const toPosix = (p: string) => p.replace(/\\/g, "/");
  const rel = (full: string) => toPosix(path.relative(root, full));

  it("normalizes a native path to a POSIX-style relative identifier", () => {
    // The mechanism the Windows run depended on, pinned on every platform.
    expect(toPosix("a\\report.txt")).toBe("a/report.txt");
    expect(toPosix("a/report.txt")).toBe("a/report.txt");
  });

  describe("destination name collisions", () => {
    it("reports two sources the plan renamed apart", async () => {
      const first = await write("a/report.txt");
      const second = await write("b/report.txt");

      const result = await validateOrganizationPlan(
        root,
        planOf([
          move({
            source: first,
            destination: path.join(root, "Documents", "report.txt"),
          }),
          move({
            source: second,
            destination: path.join(root, "Documents", "report_1.txt"),
            hasConflict: true,
          }),
        ]),
      );

      const collisions = result.findings.filter(
        (f) => f.kind === "destination_name_collision",
      );
      expect(collisions).toHaveLength(1);
      expect(collisions[0]!.severity).toBe("warning");
      expect(collisions[0]!.sources.map(rel).sort()).toEqual([
        "a/report.txt",
        "b/report.txt",
      ]);
      expect(
        collisions[0]!.destinations.map((d) => path.basename(d)).sort(),
      ).toEqual(["report.txt", "report_1.txt"]);
      expect(result.counts.warning).toBe(1);
      expect(result.counts.error).toBe(0);
      expect(result.ok).toBe(true);
    });

    it("treats the same name in different categories as no collision", async () => {
      const doc = await write("report.txt");
      const image = await write("shot.png");

      const result = await validateOrganizationPlan(
        root,
        planOf([
          move({
            source: doc,
            destination: path.join(root, "Documents", "report.txt"),
          }),
          move({
            source: image,
            destination: path.join(root, "Images", "shot.png"),
            category: "Images",
          }),
        ]),
      );

      expect(
        result.findings.filter((f) => f.kind === "destination_name_collision"),
      ).toEqual([]);
    });

    it("is an error when the plan leaves sources on one destination", async () => {
      const first = await write("a/report.txt");
      const second = await write("b/report.txt");
      const shared = path.join(root, "Documents", "report.txt");

      // overwrite/skip keep the colliding destination instead of renaming, so
      // the plan itself lands two sources on one path.
      const result = await validateOrganizationPlan(
        root,
        planOf([
          move({ source: first, destination: shared }),
          move({
            source: second,
            destination: shared,
            hasConflict: true,
            conflictResolution: "overwrite",
          }),
        ]),
      );

      const collisions = result.findings.filter(
        (f) => f.kind === "destination_name_collision",
      );
      expect(collisions).toHaveLength(1);
      expect(collisions[0]!.severity).toBe("error");
      expect(collisions[0]!.destinations).toEqual([shared, shared]);
      expect(result.ok).toBe(false);
      expect(result.counts.error).toBe(1);
    });
  });

  describe("occupied destinations", () => {
    it("flags a destination that is already on disk", async () => {
      const source = await write("notes.md");
      const destination = await write("Documents/notes.md", "older");

      const result = await validateOrganizationPlan(
        root,
        planOf([move({ source, destination, category: "Documents" })]),
      );

      const occupied = result.findings.filter(
        (f) => f.kind === "destination_exists",
      );
      expect(occupied).toHaveLength(1);
      expect(occupied[0]!.severity).toBe("warning");
      expect(occupied[0]!.sources).toEqual([source]);
      expect(occupied[0]!.destinations).toEqual([destination]);
    });

    it("reports a free destination as clean", async () => {
      const source = await write("notes.md");

      const result = await validateOrganizationPlan(
        root,
        planOf([
          move({
            source,
            destination: path.join(root, "Documents", "notes.md"),
            category: "Documents",
          }),
        ]),
      );

      expect(result.findings).toEqual([]);
      expect(result.ok).toBe(true);
      expect(result.moves_checked).toBe(1);
    });
  });

  describe("device boundaries", () => {
    it("reports nothing when source and destination share a device", async () => {
      const source = await write("notes.md");

      const result = await validateOrganizationPlan(
        root,
        planOf([
          move({
            source,
            destination: path.join(root, "Documents", "notes.md"),
            category: "Documents",
          }),
        ]),
      );

      expect(
        result.findings.filter((f) => f.kind === "cross_device_move"),
      ).toEqual([]);
    });

    it("reports a move whose destination folder is on another device", async () => {
      const source = await write("notes.md");
      // The destination folder does not exist yet, so the nearest existing
      // ancestor is the sandbox root. Forcing a different device id there is
      // enough to cross the boundary the real check measures.
      const realStat = fs.stat;
      // A proxy keeps the Stats prototype methods (isDirectory) intact while
      // only the device id differs.
      const bumpDevice = (stats: Awaited<ReturnType<typeof realStat>>) =>
        new Proxy(stats, {
          get: (target, prop) =>
            prop === "dev"
              ? (target.dev as number) + 1
              : Reflect.get(target, prop),
        });
      const spy = jest.spyOn(fs, "stat").mockImplementation((async (
        target: Parameters<typeof fs.stat>[0],
        options?: Parameters<typeof fs.stat>[1],
      ) => {
        const stats = await realStat(target, options);
        if (path.resolve(String(target)) === path.resolve(root)) {
          return bumpDevice(stats);
        }
        return stats;
      }) as typeof fs.stat);

      try {
        const result = await validateOrganizationPlan(
          root,
          planOf([
            move({
              source,
              destination: path.join(root, "Documents", "notes.md"),
              category: "Documents",
            }),
          ]),
        );

        const crossing = result.findings.filter(
          (f) => f.kind === "cross_device_move",
        );
        expect(crossing).toHaveLength(1);
        expect(crossing[0]!.severity).toBe("warning");
        expect(crossing[0]!.sources).toEqual([source]);
        expect(crossing[0]!.destinations).toEqual([
          path.join(root, "Documents", "notes.md"),
        ]);
        expect(spy).toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe("sensitive sources", () => {
    it("flags a source the sensitive-file gate refuses", async () => {
      const source = await write("passwords.txt");
      const destination = path.join(root, "Documents", "passwords.txt");

      const result = await validateOrganizationPlan(
        root,
        planOf([move({ source, destination, category: "Documents" })]),
      );

      const blocked = result.findings.filter(
        (f) => f.kind === "sensitive_source",
      );
      expect(blocked).toHaveLength(1);
      expect(blocked[0]!.severity).toBe("warning");
      expect(blocked[0]!.sources).toEqual([source]);
      expect(blocked[0]!.destinations).toEqual([destination]);
    });

    it("leaves an ordinary file alone", async () => {
      const source = await write("shopping-list.txt");

      const result = await validateOrganizationPlan(
        root,
        planOf([
          move({
            source,
            destination: path.join(root, "Documents", "shopping-list.txt"),
            category: "Documents",
          }),
        ]),
      );

      expect(
        result.findings.filter((f) => f.kind === "sensitive_source"),
      ).toEqual([]);
    });
  });

  describe("plan coverage", () => {
    it("turns a planner warning into an error", async () => {
      const result = await validateOrganizationPlan(
        root,
        emptyPlan({ warnings: ["Aborted after 10 consecutive errors."] }),
      );

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]!.kind).toBe("incomplete_plan");
      expect(result.findings[0]!.severity).toBe("error");
      expect(result.ok).toBe(false);
    });

    it("names skipped files as not checked", async () => {
      const result = await validateOrganizationPlan(
        root,
        emptyPlan({
          skippedFiles: [{ path: path.join(root, "odd.bin"), reason: "boom" }],
        }),
      );

      expect(result.ok).toBe(true);
      expect(result.not_checked.join(" ")).toContain(
        "1 file(s) the planner skipped",
      );
    });
  });

  describe("scope reporting", () => {
    it("always reports what it checked and what it did not", async () => {
      const result = await validateOrganizationPlan(root, emptyPlan());

      expect(result.checked.length).toBeGreaterThan(0);
      expect(result.not_checked.length).toBeGreaterThan(0);
      expect(result.directory).toBe(root);
      expect(result.moves_checked).toBe(0);
      expect(result.ok).toBe(true);
    });
  });
});
