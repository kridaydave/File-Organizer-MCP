/**
 * Sensitive-metadata scan — scoring logic and directory walk.
 *
 * The scoring assertions are about behaviour an agent acts on: which tags are
 * flagged, how many points each contributes, and whether the reasons add up to
 * the score. They run against the real exif-parser via the piexifjs fixture,
 * so a library change that renames a tag fails here rather than silently
 * scoring every file zero.
 *
 * Sandboxes live under os.tmpdir(). Paths are never asserted as raw strings:
 * macOS answers /private/var for a /var temp dir, so every assertion goes
 * through path.basename or through the canonical form from fs.realpath.
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

import {
  assessExifBuffer,
  riskLevelFor,
  riskScoreFor,
  scanForSensitiveData,
  scoreExifTags,
  SENSITIVE_SCAN_LIMITS,
} from "../../../../src/core/scan/sensitive-scan.js";
import type {
  SensitiveFileFinding,
  SensitiveReason,
  SensitiveSkippedFile,
} from "../../../../src/types.js";
import {
  jpegWithExif,
  jpegWithoutExif,
} from "../../../helpers/exif-fixture.js";

// Symlink creation on Windows needs Administrator or Developer Mode, so the one
// link test skips there with that reason rather than failing on EPERM.
const itWithSymlinks = process.platform === "win32" ? it.skip : it;

function kinds(reasons: SensitiveReason[]): string[] {
  return reasons.map((r) => r.kind);
}

function byKind(
  reasons: SensitiveReason[],
  kind: string,
): SensitiveReason | undefined {
  return reasons.find((r) => r.kind === kind);
}

/** Score a fixture through the real parser, the path production takes. */
function score(buffer: Buffer): SensitiveReason[] {
  return assessExifBuffer(buffer)?.reasons ?? [];
}

describe("risk bands", () => {
  it("puts a zero score in the none band", () => {
    expect(riskLevelFor(0)).toBe("none");
  });

  it("bands a score by what it found, not by a constant threshold", () => {
    expect(riskLevelFor(1)).toBe("low");
    expect(riskLevelFor(24)).toBe("low");
    expect(riskLevelFor(25)).toBe("medium");
    expect(riskLevelFor(59)).toBe("medium");
    expect(riskLevelFor(60)).toBe("high");
    expect(riskLevelFor(100)).toBe("high");
  });

  it("caps the total at 100 so a file carrying every rule stays bounded", () => {
    const everyRule: SensitiveReason[] = Array.from({ length: 9 }, () => ({
      kind: "owner_name" as const,
      weight: 30,
      detail: "x",
      exif_tags: ["OwnerName"],
    }));
    expect(riskScoreFor(everyRule)).toBe(100);
  });

  it("sums the reason weights, which is what makes the score explainable", () => {
    const reasons: SensitiveReason[] = [
      { kind: "gps_coordinates", weight: 40, detail: "a", exif_tags: [] },
      { kind: "camera_device", weight: 15, detail: "b", exif_tags: [] },
    ];
    expect(riskScoreFor(reasons)).toBe(55);
  });
});

describe("scoreExifTags", () => {
  it("returns nothing for tags that carry no personal data", () => {
    expect(scoreExifTags({})).toEqual([]);
    expect(scoreExifTags({ ISO: 400, FNumber: 1.8, Orientation: 6 })).toEqual(
      [],
    );
  });

  it("adds up the weights of the reasons it produced", () => {
    const reasons = scoreExifTags({
      GPSLatitude: 51.5,
      GPSLongitude: -0.12,
      Make: "ACME",
      SerialNumber: "BODY-1",
    });
    const total = reasons.reduce((sum, r) => sum + r.weight, 0);

    expect(kinds(reasons)).toEqual([
      "gps_coordinates",
      "serial_number",
      "camera_device",
    ]);
    expect(riskScoreFor(reasons)).toBe(total);
  });

  it("ignores a tag present but empty", () => {
    // An EXIF slot can exist with no value; the file is not exposed by it.
    expect(scoreExifTags({ Artist: "   ", OwnerName: "" })).toEqual([]);
  });

  it("truncates a runaway value so one tag cannot flood the response", () => {
    const [reason] = scoreExifTags({ OwnerName: "x".repeat(500) });
    expect(reason?.value?.length).toBeLessThan(140);
    expect(reason?.value?.endsWith("...")).toBe(true);
  });

  it("caps a value rather than reporting a structured tag as raw data", () => {
    // exif-parser hands back rational arrays for unsimplified tags. The finding
    // must name the tag without pretending the array is a readable value, and
    // the tag must still count: unreadable is not the same as absent.
    const structuredTags: Record<string, unknown> = {
      Make: ["not", "a", "string"],
    };
    const reasons = scoreExifTags(structuredTags);
    expect(byKind(reasons, "camera_device")?.value).toBeUndefined();
    expect(byKind(reasons, "camera_device")?.exif_tags).toEqual(["Make"]);
    expect(byKind(reasons, "camera_device")?.weight).toBe(15);
  });
});

describe("assessExifBuffer", () => {
  it("flags GPS coordinates and reports them in decimal degrees", () => {
    const gps = byKind(
      score(
        jpegWithExif({
          latitude: [51, 30, 26.4, "N"],
          longitude: [0, 7, 39.6, "W"],
        }),
      ),
      "gps_coordinates",
    );

    expect(gps).toBeDefined();
    expect(gps?.weight).toBe(40);
    expect(gps?.exif_tags).toEqual(["GPSLatitude", "GPSLongitude"]);
    // 51deg30'26.4"N is 51.5073..., 0deg07'39.6"W is -0.1277... Compared with a
    // tolerance so a float-formatting difference cannot fail the build.
    const [lat, lng] = (gps?.value ?? "").split(", ");
    expect(Number(lat)).toBeCloseTo(51.5073, 3);
    expect(Number(lng)).toBeCloseTo(-0.1277, 3);
  });

  it("treats a lone hemisphere as malformed rather than a location", () => {
    const reasons = score(jpegWithExif({ latitude: [51, 30, 26.4, "N"] }));
    expect(byKind(reasons, "gps_coordinates")).toBeUndefined();
  });

  it("flags GPS altitude and the fix timestamp as separate reasons", () => {
    const reasons = score(
      jpegWithExif({
        latitude: [51, 30, 26.4, "N"],
        longitude: [0, 7, 39.6, "W"],
        altitude: 12,
        gpsDateStamp: "2024:08:15",
      }),
    );

    expect(kinds(reasons)).toEqual([
      "gps_coordinates",
      "gps_altitude",
      "gps_timestamp",
    ]);
    expect(byKind(reasons, "gps_altitude")?.value).toBe("12");
    expect(byKind(reasons, "gps_timestamp")?.value).toBe("2024:08:15");
  });

  it("flags the camera owner name an EXIF block can carry", () => {
    const owner = byKind(
      score(jpegWithExif({ cameraOwnerName: "Jane Q Public" })),
      "owner_name",
    );

    expect(owner?.weight).toBe(30);
    expect(owner?.exif_tags).toEqual(["OwnerName"]);
    expect(owner?.value).toBe("Jane Q Public");
    // The detail must name the tag so the finding is traceable to the file.
    expect(owner?.detail).toContain("OwnerName");
  });

  it("treats Artist as an owner name too", () => {
    const reasons = score(jpegWithExif({ artist: "Jane Q Public" }));
    expect(byKind(reasons, "owner_name")?.exif_tags).toEqual(["Artist"]);
  });

  it("flags body and lens serial numbers as one device identifier", () => {
    const serial = byKind(
      score(
        jpegWithExif({
          bodySerialNumber: "BODY-12345",
          lensSerialNumber: "LENS-999",
        }),
      ),
      "serial_number",
    );

    expect(serial?.weight).toBe(25);
    // One rule, one weight: two serials must not out-score an owner name.
    expect(serial?.exif_tags).toEqual(["SerialNumber", "LensSerialNumber"]);
  });

  it("counts a camera make and model once, listing both tags", () => {
    const device = byKind(
      score(jpegWithExif({ make: "ACME", model: "Snapper 9000" })),
      "camera_device",
    );

    expect(device?.weight).toBe(15);
    expect(device?.exif_tags).toEqual(["Make", "Model"]);
  });

  it("flags free-text notes", () => {
    const reasons = score(jpegWithExif({ userComment: "shot on holiday" }));
    expect(byKind(reasons, "notes_or_comment")?.value).toBe("shot on holiday");
  });

  it("flags a copyright line and the software that wrote the file", () => {
    const reasons = score(
      jpegWithExif({
        copyright: "(c) 2024 Jane Q Public",
        software: "Snapper Studio 4",
      }),
    );
    expect(kinds(reasons)).toEqual(["copyright", "software"]);
  });

  it("returns no reasons for a file with nothing recognizable", () => {
    expect(score(jpegWithExif())).toEqual([]);
    expect(score(jpegWithoutExif())).toEqual([]);
  });

  it("caps a fully loaded file while still listing every cause", () => {
    const reasons = score(
      jpegWithExif({
        make: "ACME",
        model: "Snapper 9000",
        artist: "Jane Q Public",
        copyright: "(c) 2024 Jane Q Public",
        software: "Snapper Studio 4",
        userComment: "shot on holiday",
        bodySerialNumber: "BODY-12345",
        latitude: [51, 30, 26.4, "N"],
        longitude: [0, 7, 39.6, "W"],
        altitude: 12,
        gpsDateStamp: "2024:08:15",
      }),
    );

    expect(kinds(reasons)).toEqual([
      "gps_coordinates",
      "gps_altitude",
      "gps_timestamp",
      "owner_name",
      "serial_number",
      "camera_device",
      "notes_or_comment",
      "copyright",
      "software",
    ]);
    // The raw weights sum past the ceiling; the reported score is the cap.
    expect(reasons.reduce((sum, r) => sum + r.weight, 0)).toBe(140);
    expect(riskScoreFor(reasons)).toBe(100);
    expect(riskLevelFor(riskScoreFor(reasons))).toBe("high");
  });

  it("refuses to score a buffer that is not an analyzable image", () => {
    expect(
      assessExifBuffer(Buffer.from("not an image at all")),
    ).toBeUndefined();
    expect(assessExifBuffer(Buffer.alloc(0))).toBeUndefined();
    // PNG magic: a real image, but not one whose EXIF this scan reads.
    expect(
      assessExifBuffer(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])),
    ).toBeUndefined();
  });

  it("reports the detected format rather than trusting an extension", () => {
    expect(assessExifBuffer(jpegWithExif())?.format).toBe("jpeg");
    expect(assessExifBuffer(jpegWithoutExif())?.format).toBe("jpeg");
    expect(
      assessExifBuffer(Buffer.from([0x49, 0x49, 0x2a, 0x00]))?.format,
    ).toBe("tiff");
  });

  it("treats a JPEG with no EXIF segment as clean rather than an error", () => {
    expect(assessExifBuffer(jpegWithoutExif())?.reasons).toEqual([]);
  });
});

describe("scanForSensitiveData", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "sensitive-scan-"));
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  async function writeJpeg(
    name: string,
    fixture: Parameters<typeof jpegWithExif>[0] = {},
  ): Promise<void> {
    await fs.writeFile(path.join(testDir, name), jpegWithExif(fixture));
  }

  function fileNamed(
    files: SensitiveFileFinding[],
    name: string,
  ): SensitiveFileFinding {
    const found = files.find((f) => f.name === name);
    expect(found).toBeDefined();
    return found as SensitiveFileFinding;
  }

  function skipNamed(
    skipped: SensitiveSkippedFile[],
    name: string,
  ): SensitiveSkippedFile {
    const found = skipped.find((s) => s.name === name);
    expect(found).toBeDefined();
    return found as SensitiveSkippedFile;
  }

  it("scores a GPS-tagged photo above a clean one and lists the causes", async () => {
    await writeJpeg("located.jpg", {
      latitude: [51, 30, 26.4, "N"],
      longitude: [0, 7, 39.6, "W"],
    });
    await writeJpeg("plain.jpg");

    const result = await scanForSensitiveData(testDir);

    expect(result.scanned_count).toBe(2);
    expect(result.flagged_count).toBe(1);
    expect(result.highest_risk_score).toBe(40);

    const located = fileNamed(result.files, "located.jpg");
    expect(located.risk_score).toBe(40);
    expect(located.risk_level).toBe("medium");
    expect(located.format).toBe("jpeg");
    expect(kinds(located.reasons)).toEqual(["gps_coordinates"]);

    const plain = fileNamed(result.files, "plain.jpg");
    expect(plain.risk_score).toBe(0);
    expect(plain.risk_level).toBe("none");
    expect(plain.reasons).toEqual([]);
  });

  it("orders the worst risk first so the answer is the top of the list", async () => {
    await writeJpeg("aaa-clean.jpg");
    await writeJpeg("bbb-partial.jpg", { make: "ACME" });
    await writeJpeg("ccc-worst.jpg", {
      latitude: [51, 30, 26.4, "N"],
      longitude: [0, 7, 39.6, "W"],
      cameraOwnerName: "Jane Q Public",
    });

    const result = await scanForSensitiveData(testDir);

    expect(result.files.map((f) => f.name)).toEqual([
      "ccc-worst.jpg",
      "bbb-partial.jpg",
      "aaa-clean.jpg",
    ]);
    expect(result.files.map((f) => f.risk_score)).toEqual([70, 15, 0]);
  });

  it("reports a file outside the analyzed formats as skipped, not as clean", async () => {
    await writeJpeg("photo.jpg");
    await fs.writeFile(path.join(testDir, "notes.txt"), "no metadata here");

    const result = await scanForSensitiveData(testDir);

    expect(result.scanned_count).toBe(1);
    expect(result.skipped_count).toBe(1);
    expect(skipNamed(result.skipped, "notes.txt").reason).toBe(
      "format_not_analyzed",
    );
  });

  it("refuses to score a .jpg whose bytes are not an image", async () => {
    await fs.writeFile(
      path.join(testDir, "disguised.jpg"),
      "plain text, wrong name",
    );

    const result = await scanForSensitiveData(testDir);

    expect(result.scanned_count).toBe(0);
    expect(result.files).toEqual([]);
    expect(skipNamed(result.skipped, "disguised.jpg").reason).toBe(
      "format_not_analyzed",
    );
  });

  it("stays in the given directory unless include_subdirs is set", async () => {
    const sub = path.join(testDir, "nested");
    await fs.mkdir(sub);
    await fs.writeFile(
      path.join(sub, "buried.jpg"),
      jpegWithExif({
        latitude: [51, 30, 26.4, "N"],
        longitude: [0, 7, 39.6, "W"],
      }),
    );

    const shallow = await scanForSensitiveData(testDir);
    expect(shallow.scanned_count).toBe(0);

    const deep = await scanForSensitiveData(testDir, { includeSubdirs: true });
    expect(deep.scanned_count).toBe(1);
    expect(fileNamed(deep.files, "buried.jpg").risk_score).toBe(40);
  });

  itWithSymlinks("never follows a symbolic link to a photo", async () => {
    const outside = await fs.mkdtemp(
      path.join(os.tmpdir(), "sensitive-outside-"),
    );
    try {
      await fs.writeFile(
        path.join(outside, "target.jpg"),
        jpegWithExif({
          latitude: [51, 30, 26.4, "N"],
          longitude: [0, 7, 39.6, "W"],
        }),
      );
      await fs.symlink(
        path.join(outside, "target.jpg"),
        path.join(testDir, "link.jpg"),
      );

      const result = await scanForSensitiveData(testDir);

      expect(result.scanned_count).toBe(0);
      expect(result.flagged_count).toBe(0);
      // The link is named rather than silently dropped, so its absence from the
      // findings is not mistaken for coverage.
      expect(skipNamed(result.skipped, "link.jpg").detail).toContain(
        "does not follow links",
      );
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  // The window this pins: readdir reports `photo.jpg` as a regular file, and
  // between that decision and the read it is replaced with a symlink pointing
  // out of the scanned tree. Without a containment re-check and a
  // no-follow open, the scan reads the outside file and reports its metadata
  // as if it had come from inside the root.
  itWithSymlinks(
    "does not read a file swapped for a symlink after listing",
    async () => {
      const outside = await fs.mkdtemp(
        path.join(os.tmpdir(), "sensitive-outside-"),
      );
      try {
        // Distinctive payload: a GPS fix the clean photo does not carry.
        await fs.writeFile(
          path.join(outside, "secret.jpg"),
          jpegWithExif({
            latitude: [51, 30, 26.4, "N"],
            longitude: [0, 7, 39.6, "W"],
            cameraOwnerName: "Outside Owner",
          }),
        );
        await writeJpeg("photo.jpg");

        const realRoot = await fs.realpath(testDir);
        const realReaddir = fs.readdir;
        let swapped = false;
        const spy = jest
          .spyOn(fs, "readdir")
          .mockImplementation(async (target, options) => {
            const entries = await realReaddir(target, options);
            // Swap inside the readdir wrapper, so the swap lands exactly in the
            // window between the listing and the read.
            if (!swapped && (target as string) === realRoot) {
              swapped = true;
              await fs.rm(path.join(testDir, "photo.jpg"));
              await fs.symlink(
                path.join(outside, "secret.jpg"),
                path.join(testDir, "photo.jpg"),
              );
            }
            return entries;
          });

        try {
          const result = await scanForSensitiveData(testDir);

          // Nothing from outside the root may come back. The outside file scores
          // 70 (GPS + owner name); if the scan followed the link, that is what it
          // would report for a photo that was clean when it was listed.
          expect(result.highest_risk_score).toBe(0);
          expect(result.flagged_count).toBe(0);
          expect(result.files).toEqual([]);

          const leaked = JSON.stringify(result);
          expect(leaked).not.toContain("Outside Owner");
          expect(leaked).not.toContain("gps_coordinates");
        } finally {
          spy.mockRestore();
          await fs.rm(outside, { recursive: true, force: true });
        }
      } finally {
        // The swap leaves a link behind; recursive rm handles it on POSIX.
        await fs.rm(testDir, { recursive: true, force: true });
      }
    },
  );

  it("carries the coverage caveat on every response, including a clean one", async () => {
    await writeJpeg("plain.jpg");

    const result = await scanForSensitiveData(testDir);

    expect(result.limits).toEqual([...SENSITIVE_SCAN_LIMITS]);
    expect(result.limits.join(" ")).toContain(
      "does NOT mean the file is safe to share",
    );
    expect(result.limits.join(" ")).toContain("Heuristic detection");
  });

  it("returns an empty scan for a directory with nothing in it", async () => {
    const result = await scanForSensitiveData(testDir);

    expect(result.scanned_count).toBe(0);
    expect(result.skipped_count).toBe(0);
    expect(result.flagged_count).toBe(0);
    expect(result.highest_risk_score).toBe(0);
    expect(result.files).toEqual([]);
    expect(result.limits.length).toBeGreaterThan(0);
  });
});
