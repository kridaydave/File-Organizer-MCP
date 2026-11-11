/**
 * The calendar an EXIF folder label is read in.
 *
 * `extractPhotoMetadata` builds `dateTaken` from two sources with opposite
 * calendars, and the reader cannot tell them apart without the source. EXIF is
 * a wall clock a camera recorded with no offset, so exif-parser anchors it to
 * UTC (`Date.UTC` in `node_modules/exif-parser/lib/date.js`,
 * `parseDateWithSpecFormat`) and the folder has to be read back in UTC to get
 * the day the camera saw. `stats.birthtime` is a true instant, so its calendar
 * is the user's local day. `dateFolder()` in the date organizer reads the same
 * two sources correctly because `ResolvedDate` carries `source`
 * (`src/core/organize/date-organizer.ts:98`).
 *
 * The assertions run in a child process because the timezone is the thing under
 * test and jest's vm sandbox does not let a runtime `process.env.TZ` reach V8's
 * cached zone: measured on this repo, an in-process assignment left
 * `getTimezoneOffset()` at -330 before and after, so the suite would pass for
 * the wrong reason on every runner. A child inherits TZ at spawn.
 *
 * The pin assertion comes first so a zone the platform cannot load fails loudly
 * instead of making every case below pass vacuously.
 */

import { execFileSync } from "node:child_process";
import path from "path";
import { pathToFileURL } from "node:url";

/**
 * `America/New_York` is behind UTC, so a UTC-anchored instant reads as the
 * previous day locally. Pinning a zone west of Greenwich makes the wrong
 * calendar fail on every runner, including the UTC ones, rather than only on the
 * machines that happen to sit behind the photographer.
 */
const PINNED_TZ = "America/New_York";

const SERVICE_URL = pathToFileURL(
  path.resolve("dist/src/services/photo-organizer.service.js"),
).href;

interface FolderAnswer {
  folder: string;
  offsetMinutes: number;
}

/**
 * Ask the built service what folder it would use for an instant, under `tz`, in
 * a child that inherited the zone. Returns the offset too, so the caller can
 * tell a real answer from a runner that ignored the pin.
 */
function folderUnderTz(
  instantMs: number,
  source: "exif" | "mtime",
  tz: string,
): FolderAnswer {
  const script = `
    const { PhotoOrganizerService } = await import(${JSON.stringify(
      SERVICE_URL,
    )});
    const service = new PhotoOrganizerService();
    const folder = service.getDateFolderName(
      { instant: new Date(Number(process.argv[1])), source: process.argv[2] },
      "YYYY/MM",
      "Unknown Date",
    );
    process.stdout.write(JSON.stringify({
      folder,
      offsetMinutes: new Date().getTimezoneOffset(),
    }));
  `;

  const out = execFileSync(
    process.execPath,
    ["--input-type=module", "-e", script, String(instantMs), source],
    { env: { ...process.env, TZ: tz }, encoding: "utf8" },
  );
  return JSON.parse(out) as FolderAnswer;
}

/**
 * The folder's components, whatever separator the platform joined them with.
 * `getDateFolderName` builds its answer with `path.join`, so the string is
 * `2024/05` on Linux and `2024\05` on Windows, and the calendar is the thing
 * under test rather than the separator.
 */
function asParts(folder: string): string[] {
  return folder.split(/[\\/]/);
}

describe("PhotoOrganizerService.getDateFolderName calendar", () => {
  it("pins the timezone the other cases assert under", () => {
    expect(
      folderUnderTz(Date.UTC(2024, 4, 1), "exif", PINNED_TZ).offsetMinutes,
    ).toBeGreaterThan(0);
  });

  it("reads an EXIF date in UTC, so a photo taken just after midnight keeps its month", () => {
    expect(
      asParts(folderUnderTz(Date.UTC(2024, 4, 1, 0, 30), "exif", PINNED_TZ)
        .folder),
    ).toEqual(["2024", "05"]);
  });

  it("reads an EXIF date in UTC across a year boundary", () => {
    expect(
      asParts(
        folderUnderTz(Date.UTC(2024, 0, 1, 0, 30), "exif", PINNED_TZ).folder,
      ),
    ).toEqual(["2024", "01"]);
  });

  it("reads an EXIF date in UTC under a zone east of Greenwich too", () => {
    expect(
      asParts(
        folderUnderTz(
          Date.UTC(2024, 4, 1, 23, 30),
          "exif",
          "Pacific/Kiritimati",
        ).folder,
      ),
    ).toEqual(["2024", "05"]);
  });

  it("reads a birthtime in local time, because it is a true instant", () => {
    expect(
      asParts(
        folderUnderTz(Date.UTC(2024, 0, 1, 3), "mtime", PINNED_TZ).folder,
      ),
    ).toEqual(["2023", "12"]);
  });

  it("names the same month on both calendars when the instant is well inside it", () => {
    const midday = Date.UTC(2024, 4, 1, 16);

    expect(asParts(folderUnderTz(midday, "exif", PINNED_TZ).folder)).toEqual([
      "2024",
      "05",
    ]);
    expect(asParts(folderUnderTz(midday, "mtime", PINNED_TZ).folder)).toEqual([
      "2024",
      "05",
    ]);
  });
});
