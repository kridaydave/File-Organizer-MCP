/**
 * DateOrganizerService — date folder planning, moving, and undo.
 *
 * Real files in an OS temp dir; assertions compare trees RELATIVE to the temp
 * root and date folders derived from the same instants the files carry, so they
 * hold on macOS and Windows as well as Linux.
 */

import fs from "fs/promises";
import path from "path";
import piexif from "piexifjs";
import { DateOrganizerService } from "../../../src/core/organize/date-organizer.js";
import { RollbackService } from "../../../src/core/organize/rollback.js";
import { relativeFiles } from "../../utils/tree.js";

/** EXIF tag numbers, spelled out because piexifjs ships no usable types. */
const MAKE_TAG = 0x010f;
const MODEL_TAG = 0x0110;
const DATE_TIME_ORIGINAL_TAG = 0x9003;

let root: string;
let sourceDir: string;
let targetDir: string;
let rollbackService: RollbackService;
let service: DateOrganizerService;

beforeEach(async () => {
  // Under the allowed-dir whitelist the sandbox must live inside the repo,
  // which is the only root tests are allowed to touch (RollbackService
  // re-validates every manifest path on undo).
  const sandbox = path.join(process.cwd(), "tests", "temp");
  await fs.mkdir(sandbox, { recursive: true });
  root = await fs.mkdtemp(path.join(sandbox, "date-unit-"));
  sourceDir = path.join(root, "source");
  targetDir = path.join(root, "target");
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.mkdir(targetDir, { recursive: true });
  rollbackService = new RollbackService(path.join(root, "rollbacks"));
  service = new DateOrganizerService(undefined, rollbackService);
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  await fs.rm(root, { recursive: true, force: true });
});

/** Write a file whose mtime is exactly `when`. */
async function writeWithMtime(
  dir: string,
  name: string,
  when: Date,
  content = "data",
): Promise<string> {
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, content);
  await fs.utimes(filePath, when, when);
  return filePath;
}

/** The folder the service is expected to derive from `when`, in local time. */
function expectedFolder(
  when: Date,
  format: "YYYY/MM" | "YYYY/MM/DD" | "YYYY" = "YYYY/MM",
): string {
  const year = String(when.getFullYear());
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  if (format === "YYYY") return year;
  if (format === "YYYY/MM/DD") return `${year}/${month}/${day}`;
  return `${year}/${month}`;
}

/** Minimal JPEG (SOI + APP1 + SOF0 + EOI) carrying an EXIF DateTimeOriginal. */
async function writeExifJpeg(
  dir: string,
  name: string,
  dateTaken: string,
): Promise<string> {
  const exifBytes = Buffer.from(
    piexif.dump({
      "0th": { [MAKE_TAG]: "Test", [MODEL_TAG]: "Cam" },
      Exif: { [DATE_TIME_ORIGINAL_TAG]: dateTaken },
      GPS: {},
      "1st": {},
      thumbnail: null,
    }),
    "latin1",
  );
  const app1Length = Buffer.alloc(2);
  app1Length.writeUInt16BE(exifBytes.length + 2, 0);

  const filePath = path.join(dir, name);
  await fs.writeFile(
    filePath,
    Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      Buffer.from([0xff, 0xe1]),
      app1Length,
      exifBytes,
      Buffer.from([
        0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x64, 0x00, 0x64, 0x01, 0x01, 0x11,
        0x00,
      ]),
      Buffer.from([0xff, 0xd9]),
    ]),
  );
  return filePath;
}

/** A JPEG whose EXIF payload is bytes the parser cannot read. */
async function writeJpegWithBrokenExif(dir: string, name: string): Promise<string> {
  const nullByte = String.fromCharCode(0);
  const filePath = path.join(dir, name);
  await fs.writeFile(
    filePath,
    Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      Buffer.from([0xff, 0xe1, 0x00, 0x10]),
      Buffer.from(`Exif${nullByte}${nullByte}`, "ascii"),
      Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]),
      Buffer.from([0xff, 0xd9]),
    ]),
  );
  return filePath;
}

describe("DateOrganizerService.organize", () => {
  it("moves files into YYYY/MM folders derived from mtime", async () => {
    const march = new Date(2024, 2, 5, 9, 30);
    const april = new Date(2024, 3, 17, 21, 0);
    await writeWithMtime(sourceDir, "march-notes.txt", march);
    await writeWithMtime(sourceDir, "april-notes.txt", april);

    const result = await service.organize({
      sourceDir,
      targetDir,
      dateFormat: "YYYY/MM",
      dateSource: "mtime",
      dryRun: false,
    });

    expect(result.success).toBe(true);
    expect(result.organizedFiles).toBe(2);
    expect(result.errors).toEqual([]);
    expect(await relativeFiles(targetDir)).toEqual(
      [
        `${expectedFolder(april)}/april-notes.txt`,
        `${expectedFolder(march)}/march-notes.txt`,
      ].sort(),
    );
    expect(await relativeFiles(sourceDir)).toEqual([]);
    expect(result.structure).toEqual({
      [expectedFolder(march)]: ["march-notes.txt"],
      [expectedFolder(april)]: ["april-notes.txt"],
    });
  });

  it("reports folder labels as forward-slashed YYYY/MM on every platform", async () => {
    const when = new Date(2024, 4, 20, 11, 0);
    await writeWithMtime(sourceDir, "report.txt", when);

    const result = await service.organize({
      sourceDir,
      targetDir,
      dateFormat: "YYYY/MM/DD",
      dateSource: "mtime",
      dryRun: true,
    });

    // The label is a logical identifier, not a filesystem path: a Windows
    // separator here would tell a caller the folder is one segment deep.
    const label = result.moves[0]!.folder;
    expect(label).toBe(`${expectedFolder(when)}/20`);
    expect(label.includes("\\")).toBe(false);
    expect(Object.keys(result.structure)).toEqual([label]);
    expect(Object.keys(result.structure)[0]?.includes("\\")).toBe(false);
  });

  it("uses the EXIF date taken for photos and reports the source per file", async () => {
    const photo = await writeExifJpeg(sourceDir, "beach.jpg", "2021:07:04 10:20:30");
    const staleMtime = new Date(2019, 0, 2, 8, 0);
    await fs.utimes(photo, staleMtime, staleMtime);
    const receiptDate = new Date(2022, 10, 9, 12, 0);
    await writeWithMtime(sourceDir, "receipt.txt", receiptDate);

    const result = await service.organize({
      sourceDir,
      targetDir,
      dateFormat: "YYYY/MM",
      dateSource: "auto",
      dryRun: false,
    });

    expect(result.organizedFiles).toBe(2);
    const photoMove = result.moves.find((move) => move.file === "beach.jpg");
    const textMove = result.moves.find((move) => move.file === "receipt.txt");

    // EXIF wins for the photo even though its mtime says 2019-01.
    const exifInstant = new Date("2021-07-04T10:20:30Z");
    expect(photoMove?.dateSource).toBe("exif");
    expect(photoMove?.date).toBe(exifInstant.toISOString());
    expect(photoMove?.folder).toBe(expectedFolder(exifInstant));
    expect(textMove?.dateSource).toBe("mtime");

    // Each file landed in the folder matching the date it reported.
    expect(await relativeFiles(targetDir)).toEqual(
      [
        `${expectedFolder(exifInstant)}/beach.jpg`,
        `${expectedFolder(receiptDate)}/receipt.txt`,
      ].sort(),
    );
  });

  it("falls back to mtime, and says so, when EXIF is malformed", async () => {
    const broken = await writeJpegWithBrokenExif(sourceDir, "broken.jpg");
    const fallbackDate = new Date(2020, 5, 9, 16, 45);
    await fs.utimes(broken, fallbackDate, fallbackDate);

    const result = await service.organize({
      sourceDir,
      targetDir,
      dateSource: "auto",
      dryRun: true,
    });

    expect(result.organizedFiles).toBe(1);
    expect(result.moves[0]?.dateSource).toBe("mtime");
    expect(result.moves[0]?.folder).toBe(expectedFolder(fallbackDate));
  });

  it("leaves files without a usable date in place under date_source=exif", async () => {
    const when = new Date(2023, 2, 3, 10, 0);
    await writeWithMtime(sourceDir, "plain.txt", when);
    await writeWithMtime(sourceDir, "no-exif.jpg", when);

    const result = await service.organize({
      sourceDir,
      targetDir,
      dateSource: "exif",
      dryRun: false,
    });

    expect(result.organizedFiles).toBe(0);
    expect(result.skippedFiles).toBe(2);
    expect(result.noDateFiles.sort()).toEqual(["no-exif.jpg", "plain.txt"]);
    expect(result.manifestId).toBeUndefined();
    expect(await relativeFiles(sourceDir)).toEqual(["no-exif.jpg", "plain.txt"]);
    expect(await relativeFiles(targetDir)).toEqual([]);
  });

  it("plans the same tree in a dry run and moves nothing", async () => {
    const when = new Date(2023, 6, 14, 11, 0);
    await writeWithMtime(sourceDir, "draft.md", when);
    await writeWithMtime(sourceDir, "notes.txt", when);

    const dry = await service.organize({
      sourceDir,
      targetDir,
      dateSource: "mtime",
      dryRun: true,
    });

    expect(dry.organizedFiles).toBe(2);
    expect(dry.manifestId).toBeUndefined();
    expect(await relativeFiles(targetDir)).toEqual([]);
    expect(await relativeFiles(sourceDir)).toEqual(["draft.md", "notes.txt"]);

    const wet = await service.organize({
      sourceDir,
      targetDir,
      dateSource: "mtime",
      dryRun: false,
    });

    expect(wet.structure).toEqual(dry.structure);
  });

  it("de-duplicates an occupied destination name instead of overwriting it", async () => {
    const when = new Date(2024, 1, 8, 13, 0);
    const folder = expectedFolder(when);
    // The label is logical ("2024/02"); join its parts explicitly so the test
    // does not lean on Windows tolerating a forward slash inside a path.
    const folderPath = path.join(targetDir, ...folder.split("/"));
    await fs.mkdir(folderPath, { recursive: true });
    await writeWithMtime(sourceDir, "note.txt", when, "from source");
    await writeWithMtime(folderPath, "note.txt", when, "already here");

    const result = await service.organize({
      sourceDir,
      targetDir,
      dateSource: "mtime",
      dryRun: false,
    });

    expect(result.organizedFiles).toBe(1);
    expect(await relativeFiles(targetDir)).toEqual(
      [`${folder}/note (1).txt`, `${folder}/note.txt`].sort(),
    );
    const kept = await fs.readFile(path.join(folderPath, "note.txt"), "utf-8");
    expect(kept).toBe("already here");
    expect(path.basename(result.moves[0]!.to)).toBe("note (1).txt");
  });

  it("records every move in a rollback manifest that undoes the whole tree", async () => {
    const when = new Date(2024, 7, 19, 7, 15);
    await writeWithMtime(sourceDir, "alpha.txt", when, "alpha");
    await writeWithMtime(sourceDir, "beta.txt", when, "beta");

    const result = await service.organize({
      sourceDir,
      targetDir,
      dateSource: "mtime",
      dryRun: false,
    });

    expect(result.undoAvailable).toBe(true);
    expect(typeof result.manifestId).toBe("string");

    const manifests = await rollbackService.listManifests();
    const manifest = manifests.find((entry) => entry.id === result.manifestId);
    expect(manifest?.actions).toHaveLength(2);
    expect(manifest?.actions.map((action) => action.type)).toEqual([
      "move",
      "move",
    ]);
    expect(
      manifest?.actions
        .map((action) => path.basename(action.currentPath ?? ""))
        .sort(),
    ).toEqual(["alpha.txt", "beta.txt"]);

    const undone = await rollbackService.rollback(result.manifestId!);

    expect(undone.failed).toBe(0);
    expect(undone.success).toBe(2);
    expect(await relativeFiles(sourceDir)).toEqual(["alpha.txt", "beta.txt"]);
    expect(await relativeFiles(targetDir)).toEqual([]);
  });

  it("reports a failed manifest write instead of claiming undoable moves", async () => {
    const when = new Date(2024, 8, 1, 6, 0);
    await writeWithMtime(sourceDir, "solo.txt", when);
    const failingRollback = {
      createManifest: async () => {
        throw new Error("disk full at /secret/place/manifests");
      },
    } as unknown as RollbackService;

    const result = await new DateOrganizerService(
      undefined,
      failingRollback,
    ).organize({
      sourceDir,
      targetDir,
      dateSource: "mtime",
      dryRun: false,
    });

    expect(result.success).toBe(false);
    expect(result.undoAvailable).toBe(false);
    expect(result.organizedFiles).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.error).toContain("NOT undoable");
    // sanitizeErrorMessage keeps internal paths out of the result.
    expect(result.errors[0]?.error).not.toContain("/secret/place");
    expect(await relativeFiles(targetDir)).toEqual([
      `${expectedFolder(when)}/solo.txt`,
    ]);
  });

  it("keeps subdirectories in place unless recursive is set", async () => {
    const when = new Date(2024, 9, 3, 6, 0);
    await fs.mkdir(path.join(sourceDir, "nested"));
    await writeWithMtime(sourceDir, "top.txt", when);
    await writeWithMtime(path.join(sourceDir, "nested"), "deep.txt", when);

    const shallow = await service.organize({
      sourceDir,
      targetDir,
      dateSource: "mtime",
      dryRun: false,
    });

    expect(shallow.organizedFiles).toBe(1);
    expect(await relativeFiles(sourceDir)).toEqual(["nested/deep.txt"]);

    const deep = await service.organize({
      sourceDir,
      targetDir,
      dateSource: "mtime",
      recursive: true,
      dryRun: false,
    });

    expect(deep.organizedFiles).toBe(1);
    expect(await relativeFiles(sourceDir)).toEqual([]);
    expect(await relativeFiles(targetDir)).toEqual(
      [`${expectedFolder(when)}/deep.txt`, `${expectedFolder(when)}/top.txt`].sort(),
    );
  });
});

describe("DateOrganizerService.dateFolder", () => {
  const date = new Date(2023, 0, 2, 12, 0);

  it("formats each supported structure with zero-padded parts", () => {
    expect(service.dateFolder(date, "YYYY/MM")).toBe(
      expectedFolder(date, "YYYY/MM"),
    );
    expect(service.dateFolder(date, "YYYY/MM/DD")).toBe(
      expectedFolder(date, "YYYY/MM/DD"),
    );
    expect(service.dateFolder(date, "YYYY")).toBe(String(date.getFullYear()));
  });
});
