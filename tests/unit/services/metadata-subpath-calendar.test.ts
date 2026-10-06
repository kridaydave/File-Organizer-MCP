/**
 * The calendar an EXIF folder label is read in.
 *
 * exif-parser anchors EXIF dates to UTC, because a camera records wall-clock
 * time with no offset. `dateFolder()` in the date organizer reads that value in
 * UTC for exactly that reason, and the comment above it says so. This suite pins
 * the same calendar on the other reader, `MetadataService.getMetadataSubpath`, so
 * a photo taken at 00:30 on 1 May cannot land in April.
 *
 * The assertion runs in a child process because the timezone is the thing under
 * test and jest's vm sandbox does not let a runtime `process.env.TZ` reach V8's
 * cached zone: setting it in-process leaves `getTimezoneOffset()` at 0 and the
 * suite would pass for the wrong reason on every runner. A child inherits TZ at
 * spawn, which is the only way to actually pin the calendar. The parent asserts
 * the pin took, so a zone the platform cannot load fails loudly instead of
 * quietly skipping the check.
 */

import { execFileSync } from "node:child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import piexifNamespace from "piexifjs";
import { MetadataService } from "../../../src/services/metadata/service.js";
import { required } from "../../helpers/safe-index.js";

const piexif = piexifNamespace;

/**
 * `America/New_York` is behind UTC, so a UTC-anchored 00:30 timestamp reads as
 * the previous day locally. Pinning a zone west of Greenwich makes the wrong
 * calendar fail on every runner, including the UTC ones, rather than only on the
 * machines that happen to sit behind the photographer.
 */
const PINNED_TZ = "America/New_York";

function baselineJpeg(): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    Buffer.from([0xff, 0xe0, 0x00, 0x10]),
    Buffer.from("JFIF\0", "ascii"),
    Buffer.from([0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]),
    Buffer.from([
      0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x64, 0x00, 0x64, 0x01, 0x01, 0x11,
      0x00,
    ]),
    Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]),
    Buffer.from([0xff, 0xd9]),
  ]);
}

/** A JPEG whose EXIF records `exifTimestamp` as the wall clock the camera saw. */
function jpegTakenAt(exifTimestamp: string): Buffer {
  const exifIfd: Record<number, unknown> = {};
  exifIfd[required(piexif.ExifIFD["DateTimeOriginal"], "DateTimeOriginal tag")] =
    exifTimestamp;

  const bytes = piexif.dump({
    "0th": {},
    Exif: exifIfd,
    GPS: {},
    thumbnail: null,
  });
  const inserted = piexif.insert(bytes, baselineJpeg().toString("binary"));
  return Buffer.from(inserted, "binary");
}

/**
 * Read the subpath a photo gets under `TZ`, in a child that inherited the zone.
 * Returns the offset too, so the caller can tell a real answer from a runner
 * that ignored the pin.
 */
function subpathUnderTz(photoPath: string, tz: string): {
  subpath: string;
  offsetMinutes: number;
} {
  const script = `
    const { MetadataService } = await import(${JSON.stringify(
      path.resolve("dist/src/services/metadata/service.js"),
    )});
    const service = new MetadataService();
    const subpath = await service.getMetadataSubpath(process.argv[1], "Images");
    process.stdout.write(JSON.stringify({
      subpath,
      offsetMinutes: new Date().getTimezoneOffset(),
    }));
  `;

  const out = execFileSync(process.execPath, ["--input-type=module", "-e", script, photoPath], {
    env: { ...process.env, TZ: tz },
    encoding: "utf8",
  });
  return JSON.parse(out) as { subpath: string; offsetMinutes: number };
}

describe("MetadataService.getMetadataSubpath EXIF calendar", () => {
  let testDir: string;
  let service: MetadataService;

  beforeEach(async () => {
    service = new MetadataService();
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "fom-subpath-cal-"));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("pins the timezone it asserts under", async () => {
    const photo = path.join(testDir, "photo.jpg");
    await fs.writeFile(photo, jpegTakenAt("2024:05:01 00:30:00"));

    const { offsetMinutes } = subpathUnderTz(photo, PINNED_TZ);

    expect(offsetMinutes).toBeGreaterThan(0);
  });

  it("reads the EXIF calendar in UTC, so a photo just after midnight keeps its month", async () => {
    const photo = path.join(testDir, "photo.jpg");
    await fs.writeFile(photo, jpegTakenAt("2024:05:01 00:30:00"));

    expect(subpathUnderTz(photo, PINNED_TZ).subpath).toBe("2024/05");
  });

  it("reads the EXIF calendar in UTC across a year boundary", async () => {
    const photo = path.join(testDir, "photo.jpg");
    await fs.writeFile(photo, jpegTakenAt("2024:01:01 00:30:00"));

    expect(subpathUnderTz(photo, PINNED_TZ).subpath).toBe("2024/01");
  });

  it("agrees with the date organizer on an afternoon timestamp", async () => {
    const photo = path.join(testDir, "photo.jpg");
    await fs.writeFile(photo, jpegTakenAt("2024:05:15 12:00:00"));

    expect(subpathUnderTz(photo, PINNED_TZ).subpath).toBe("2024/05");
  });

  it("agrees with the date organizer under a zone east of Greenwich", async () => {
    const photo = path.join(testDir, "photo.jpg");
    await fs.writeFile(photo, jpegTakenAt("2024:05:01 23:30:00"));

    expect(subpathUnderTz(photo, "Pacific/Kiritimati").subpath).toBe("2024/05");
  });

  it("still reads an EXIF-less photo as undated rather than inventing a folder", async () => {
    const photo = path.join(testDir, "plain.jpg");
    await fs.writeFile(photo, baselineJpeg());

    expect(await service.getMetadataSubpath(photo, "Images")).toBe("");
  });
});
