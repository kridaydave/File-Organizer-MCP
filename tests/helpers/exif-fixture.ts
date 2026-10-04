/**
 * JPEG fixtures carrying real EXIF, for the sensitive scan tests.
 *
 * The EXIF block is written with piexifjs over a structurally valid baseline
 * JPEG (SOI, JFIF APP0, SOF0, SOS, EOI), which is the only way to get a full
 * IFD0 + ExifIFD + GPS IFD without hand-assembling TIFF offsets in every test.
 * The parse side is deliberately the real exif-parser, so these fixtures fail
 * loudly if the libraries change shape rather than agreeing with a mock.
 */

import piexifNamespace from "piexifjs";

// piexifjs is CommonJS; under ESM the tag tables land on the default export.
const piexif = piexifNamespace;

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
    if (value !== undefined) zeroth[piexif.ImageIFD[tag]] = value;
  }

  const exifTags: Array<[keyof typeof piexif.ExifIFD, unknown]> = [
    ["BodySerialNumber", fixture.bodySerialNumber],
    ["CameraOwnerName", fixture.cameraOwnerName],
    ["LensSerialNumber", fixture.lensSerialNumber],
    ["UserComment", fixture.userComment],
  ];
  for (const [tag, value] of exifTags) {
    if (value !== undefined) exifIfd[piexif.ExifIFD[tag]] = value;
  }

  if (fixture.latitude) {
    const [d, m, s, ref] = fixture.latitude;
    gps[piexif.GPSIFD.GPSLatitudeRef] = ref;
    gps[piexif.GPSIFD.GPSLatitude] = degreesToRational(d, m, s);
  }
  if (fixture.longitude) {
    const [d, m, s, ref] = fixture.longitude;
    gps[piexif.GPSIFD.GPSLongitudeRef] = ref;
    gps[piexif.GPSIFD.GPSLongitude] = degreesToRational(d, m, s);
  }
  if (fixture.altitude !== undefined) {
    gps[piexif.GPSIFD.GPSAltitudeRef] = 0;
    gps[piexif.GPSIFD.GPSAltitude] = [Math.round(fixture.altitude), 1];
  }
  if (fixture.gpsDateStamp !== undefined) {
    gps[piexif.GPSIFD.GPSDateStamp] = fixture.gpsDateStamp;
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