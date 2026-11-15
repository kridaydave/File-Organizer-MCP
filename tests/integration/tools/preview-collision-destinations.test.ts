/**
 * preview_organization destinations against files already on disk.
 *
 * A preview is the answer a user reads before agreeing to a move, so a
 * destination it prints has to be the destination the run writes. The plan
 * settles collisions inside its own batch and the run settles the rest as it
 * moves; a preview that stopped at the plan printed a name the run would not
 * use, and this suite pins that it no longer does.
 *
 * The sandbox lives under os.tmpdir() and is granted through
 * CONFIG.paths.customAllowed. Assertions compare relative paths and basenames,
 * never a raw absolute path, because macOS rewrites /var to /private/var and
 * Windows expands 8.3 short names.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  afterAll,
} from "@jest/globals";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

const storage = await isolateRollbackStorage("fom-preview-collision-");

const { CONFIG } = await import("../../../src/config.js");
const { handlePreviewOrganization } =
  await import("../../../src/tools/organization-preview.js");
const { handleOrganizeFiles } =
  await import("../../../src/tools/file-organization.js");

import { isolateRollbackStorage } from "../../helpers/rollback-storage.js";

type Move = { source: string; destination: string };

interface PreviewShape {
  moves: Move[];
}

/** The move a preview reported for `name`, as a path relative to the sandbox. */
function destinationOf(
  preview: PreviewShape,
  root: string,
  name: string,
): string {
  const move = preview.moves.find((m) => path.basename(m.source) === name);
  if (!move) throw new Error(`preview reported no move for ${name}`);
  return path.relative(root, move.destination).split(path.sep).join("/");
}

describe("preview_organization collision destinations", () => {
  let testDir: string;
  let restoreCustomAllowed: string[] | undefined;

  beforeEach(async () => {
    // Canonicalised once, here, the way the product does it. The tools report
    // the directory after validateStrictPath, which resolves symlinks with
    // realpathSync.native where it exists, and the portability profile puts the
    // whole temp root behind one. On Windows that difference is not cosmetic:
    // the plain form leaves the 8.3 short name (RUNNER~1) in place while the
    // native form expands it, so a relative path computed against the short form
    // walks out of the sandbox.
    const sandbox = await fs.mkdtemp(
      path.join(storage.root, "preview-collision-"),
    );
    testDir =
      typeof fsSync.realpathSync.native === "function"
        ? fsSync.realpathSync.native(sandbox)
        : fsSync.realpathSync(sandbox);
    restoreCustomAllowed = CONFIG.paths.customAllowed;
    CONFIG.paths.customAllowed = [testDir];
  });

  afterEach(async () => {
    CONFIG.paths.customAllowed = restoreCustomAllowed;
    // Windows releases handles a moment after the last write.
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  afterAll(async () => {
    await storage.remove();
  });

  /** A file at the sandbox root, plus one already sitting at its destination. */
  async function seedOccupiedDestination(): Promise<void> {
    await fs.writeFile(path.join(testDir, "note.txt"), "incoming");
    await fs.mkdir(path.join(testDir, "Documents"), { recursive: true });
    await fs.writeFile(path.join(testDir, "Documents", "note.txt"), "resident");
  }

  async function preview(conflictStrategy: "rename" | "skip" | "overwrite") {
    const result = await handlePreviewOrganization({
      directory: testDir,
      conflict_strategy: conflictStrategy,
      include_subdirs: true,
      response_format: "json",
    });
    return JSON.parse(result.content[0].text) as PreviewShape;
  }

  it("shows the name the run will use when the destination is taken", async () => {
    await seedOccupiedDestination();

    const viewed = await preview("rename");

    // The resident Documents/note.txt is not a move target for anything, so the
    // plan's `Documents/note.txt` has to give way to `Documents/note_1.txt`.
    expect(destinationOf(viewed, testDir, "note.txt")).toBe(
      "Documents/note_1.txt",
    );
  });

  it("shows the same destination an applied run reaches", async () => {
    await seedOccupiedDestination();

    const viewed = await preview("rename");
    const applied = await handleOrganizeFiles({
      directory: testDir,
      conflict_strategy: "rename",
      include_subdirs: true,
      dry_run: false,
      response_format: "json",
    });
    const appliedData = JSON.parse(applied.content[0].text) as {
      actions?: Array<{ from: string; to: string }>;
    };
    const actions = appliedData.actions ?? [];
    expect(actions).toHaveLength(1);

    const written = path
      .relative(testDir, actions[0]!.to)
      .split(path.sep)
      .join("/");
    expect(written).toBe("Documents/note_1.txt");
    expect(destinationOf(viewed, testDir, "note.txt")).toBe(written);

    // The file that was already there is untouched.
    expect(
      await fs.readFile(path.join(testDir, "Documents", "note.txt"), "utf-8"),
    ).toBe("resident");
  });

  it("walks past numbered names that are also taken", async () => {
    await seedOccupiedDestination();
    await fs.writeFile(
      path.join(testDir, "Documents", "note_1.txt"),
      "also here",
    );

    const viewed = await preview("rename");

    // _1 is taken as well, so the first free name is _2. Stopping at the first
    // candidate would show a name the run has to give up on.
    expect(destinationOf(viewed, testDir, "note.txt")).toBe(
      "Documents/note_2.txt",
    );
  });

  it("leaves the planned name alone under skip, which keeps it by design", async () => {
    await seedOccupiedDestination();

    const viewed = await preview("skip");

    expect(destinationOf(viewed, testDir, "note.txt")).toBe(
      "Documents/note.txt",
    );
  });
});
