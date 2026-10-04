/**
 * JPEG and TIFF fixtures carrying real EXIF, for the sensitive scan tests.
 *
 * The JPEG EXIF block is written with piexifjs over a structurally valid
 * baseline JPEG (SOI, JFIF APP0, SOF0, SOS, EOI), which is the only way to get
 * a full IFD0 + ExifIFD + GPS IFD without hand-assembling offsets. piexifjs
 * inserts into JPEG only, so the TIFF fixtures write their IFD offsets here.
 * The parse side is deliberately the real exif-parser, so these fixtures fail
 * loudly if the libraries change shape rather than agreeing with a mock.
 */

import piexifNamespace from "piexifjs";

// piexifjs is CommonJS; under ESM the tag tables land on the default export.
const piexif = piexifNamespace;

/**
 * The tag tables are declared as `Record<string, number>`, so under
 * noUncheckedIndexedAccess every lookup is `number | undefined`. Writing that
 * in as an object key would store the string "undefined" and drop the tag, so
 * a wrong tag name has to fail loudly instead.
 */
function tagId(table: Record<string, number>, name: string): number {
  const id = table[name];
  if (id === undefined) {
    throw new Error(`Unknown EXIF tag name: ${name}`);
  }
  return id;
}

/** Minutes/seconds as EXIF rationals, which piexif wants as nested pairs. */
function degreesToRational(
  degrees: number,
  minutes: number,
  seconds: number,
): Array<[number, number]> {
  return [
    [degrees, 1],
    [minutes, 1],
    [Math.round(seconds * 100), 100],
  ];
}

/**
 * A minimal but structurally valid JPEG. piexifjs splits this into segments
 * before inserting EXIF, so the frame headers have to be well-formed even
 * though there are no real pixels behind them.
 */
function baselineJpeg(): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), // SOI
    Buffer.from([0xff, 0xe0, 0x00, 0x10]), // APP0, 16 bytes
    Buffer.from("JFIF\0", "ascii"),
    Buffer.from([0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]),
    Buffer.from([
      0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x64, 0x00, 0x64, 0x01, 0x01, 0x11,
      0x00,
    ]), // SOF0, 100x100
    Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]), // SOS
    Buffer.from([0xff, 0xd9]), // EOI
  ]);
}

export interface ExifFixture {
  make?: string;
  model?: string;
  software?: string;
  artist?: string;
  copyright?: string;
  hostComputer?: string;
  imageDescription?: string;
  userComment?: string;
  bodySerialNumber?: string;
  cameraOwnerName?: string;
  lensSerialNumber?: string;
  /** [degrees, minutes, seconds, ref] where ref is "N"/"S"/"E"/"W". */
  latitude?: [number, number, number, string];
  longitude?: [number, number, number, string];
  altitude?: number;
  gpsDateStamp?: string;
}

/**
 * Build a JPEG whose EXIF carries `fixture`. Omitted fields are left out of the
 * EXIF block entirely, so a test can assert on absence rather than on a zero.
 */
export function jpegWithExif(fixture: ExifFixture = {}): Buffer {
  const zeroth: Record<number, unknown> = {};
  const exifIfd: Record<number, unknown> = {};
  const gps: Record<number, unknown> = {};

  const zerothTags: Array<[keyof typeof piexif.ImageIFD, unknown]> = [
    ["Make", fixture.make],
    ["Model", fixture.model],
    ["Software", fixture.software],
    ["Artist", fixture.artist],
    ["Copyright", fixture.copyright],
    ["HostComputer", fixture.hostComputer],
    ["ImageDescription", fixture.imageDescription],
  ];
  for (const [tag, value] of zerothTags) {
    if (value !== undefined) zeroth[tagId(piexif.ImageIFD, tag)] = value;
  }

  const exifTags: Array<[keyof typeof piexif.ExifIFD, unknown]> = [
    ["BodySerialNumber", fixture.bodySerialNumber],
    ["CameraOwnerName", fixture.cameraOwnerName],
    ["LensSerialNumber", fixture.lensSerialNumber],
    ["UserComment", fixture.userComment],
  ];
  for (const [tag, value] of exifTags) {
    if (value !== undefined) exifIfd[tagId(piexif.ExifIFD, tag)] = value;
  }

  if (fixture.latitude) {
    const [d, m, s, ref] = fixture.latitude;
    gps[tagId(piexif.GPSIFD, "GPSLatitudeRef")] = ref;
    gps[tagId(piexif.GPSIFD, "GPSLatitude")] = degreesToRational(d, m, s);
  }
  if (fixture.longitude) {
    const [d, m, s, ref] = fixture.longitude;
    gps[tagId(piexif.GPSIFD, "GPSLongitudeRef")] = ref;
    gps[tagId(piexif.GPSIFD, "GPSLongitude")] = degreesToRational(d, m, s);
  }
  if (fixture.altitude !== undefined) {
    gps[tagId(piexif.GPSIFD, "GPSAltitudeRef")] = 0;
    gps[tagId(piexif.GPSIFD, "GPSAltitude")] = [Math.round(fixture.altitude), 1];
  }
  if (fixture.gpsDateStamp !== undefined) {
    gps[tagId(piexif.GPSIFD, "GPSDateStamp")] = fixture.gpsDateStamp;
  }

  const exifBytes = piexif.dump({
    "0th": zeroth,
    Exif: exifIfd,
    GPS: gps,
    thumbnail: null,
  });
  const withExif = piexif.insert(exifBytes, baselineJpeg().toString("binary"));
  return Buffer.from(withExif, "binary");
}

/** A JPEG with no EXIF APP1 segment at all. */
export function jpegWithoutExif(): Buffer {
  return baselineJpeg();
}

/**
 * A TIFF carrying the same EXIF IFDs `jpegWithExif` builds.
 *
 * piexifjs only inserts into JPEG, so the IFD offsets are written by hand here.
 * The result is a real TIFF: II or MM byte-order mark, magic 42, one IFD0 with
 * ASCII values, which is enough for a tag walker to resolve real values.
 *
 * This exists because the scan's TIFF claim cannot be tested with a JPEG. A
 * JPEG-shaped buffer would pass the format sniff and never exercise the TIFF
 * path at all, which is how a guaranteed-zero TIFF read stayed green.
 */
export function tiffWithExif(fixture: ExifFixture = {}): Buffer {
  const u16 = (n: number): Buffer => {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(n);
    return b;
  };
  const u32 = (n: number): Buffer => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(n);
    return b;
  };
  // EXIF ASCII is NUL-terminated and its count includes the terminator.
  const ascii = (s: string): Buffer =>
    Buffer.concat([Buffer.from(s, "ascii"), Buffer.from([0])]);

  // Tag 0x010F Make, 0x0110 Model, 0x013B Artist, 0x0131 Software.
  const wanted: Array<[number, string | undefined]> = [
    [0x010f, fixture.make],
    [0x0110, fixture.model],
    [0x013b, fixture.artist],
    [0x0131, fixture.software],
  ];
  const entries = wanted
    .filter((e): e is [number, string] => e[1] !== undefined)
    .map(([tag, value]) => ({ tag, value, bytes: ascii(value) }));

  const ifdStart = 8;
  const ifdSize = 2 + entries.length * 12 + 4;
  let nextOffset = ifdStart + ifdSize;
  const placed = entries.map((e) => {
    const offset = nextOffset;
    nextOffset += e.bytes.length;
    return { ...e, offset };
  });

  const header = Buffer.concat([
    Buffer.from([0x49, 0x49]), // "II", little-endian
    u16(0x002a), // 42
    u32(ifdStart),
  ]);
  const ifd = Buffer.concat([
    u16(placed.length),
    ...placed.map((e) =>
      Buffer.concat([u16(e.tag), u16(2), u32(e.bytes.length), u32(e.offset)]),
    ),
    u32(0), // no IFD1
  ]);

  return Buffer.concat([header, ifd, ...placed.map((e) => e.bytes)]);
}

/** A TIFF with a valid header and an IFD0 holding no tags. */
export function tiffWithoutTags(): Buffer {
  return Buffer.concat([
    Buffer.from([0x49, 0x49]),
    (() => {
      const b = Buffer.alloc(2);
      b.writeUInt16LE(0x002a);
      return b;
    })(),
    (() => {
      const b = Buffer.alloc(4);
      b.writeUInt32LE(8);
      return b;
    })(),
    (() => {
      const b = Buffer.alloc(2);
      b.writeUInt16LE(0); // zero entries
      return b;
    })(),
    (() => {
      const b = Buffer.alloc(4);
      b.writeUInt32LE(0); // no IFD1
      return b;
    })(),
  ]);
}