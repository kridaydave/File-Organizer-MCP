/**
 * EXIF mapping: buffer -> ImageMetadata via exif-parser.
 */

import fs from "fs/promises";
import ExifParser from "exif-parser";
import { findEXIFSegment } from "./image-privacy.js";
import type { ImageMetadata, ImageMetadataOptions } from "./types.js";

/** Format a duration of seconds as `N"` or `1/N`. */
function formatShutterSpeed(exposureTimeSeconds: number): string {
  if (exposureTimeSeconds >= 1) {
    return `${Math.round(exposureTimeSeconds)}"`;
  }
  return `1/${Math.round(1 / exposureTimeSeconds)}`;
}

/** Scan JPEG SOF0/SOF2 markers for image dimensions. */
export function scanSOFDimensions(buffer: Buffer): {
  width?: number;
  height?: number;
} {
  let offset = 2;
  while (offset < buffer.length - 9) {
    if (buffer[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === undefined || marker === 0xff || marker === 0x01) {
      offset++;
      continue;
    }
    // Standalone markers have no length field
    if ((marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) {
      offset += 2;
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);

    // SOF0 (C0), SOF1 (C1), SOF2 progressive (C2)
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }

    if (marker === 0xda || marker === 0xd9) break; // SOS or EOI
    offset += 2 + length;
  }
  return {};
}

export function basicResult(
  base: ImageMetadata,
  options: ImageMetadataOptions,
): ImageMetadata {
  const result: ImageMetadata = {
    ...base,
    hasEXIF: false,
    camera: { make: undefined, model: undefined, lens: undefined },
  };
  if (options.extractGPS) {
    result.gps = {
      hasGPS: false,
      latitude: undefined,
      longitude: undefined,
      altitude: undefined,
    };
  }
  return result;
}

export async function parseJPEGMetadata(
  buffer: Buffer,
  filePath: string,
  baseMetadata: ImageMetadata,
  options: ImageMetadataOptions,
): Promise<ImageMetadata> {
  const metadata: ImageMetadata = { ...baseMetadata };

  const dims = scanSOFDimensions(buffer);
  metadata.width = dims.width;
  metadata.height = dims.height;

  const exifSegment = findEXIFSegment(buffer);
  metadata.hasEXIF = exifSegment !== null;

  let tags: Record<string, unknown> = {};
  if (exifSegment) {
    try {
      const parser = ExifParser.create(buffer);
      const result = parser.parse();
      tags = result?.tags ?? {};
      metadata.hasThumbnail =
        typeof result?.hasThumbnail === "function"
          ? result.hasThumbnail()
          : false;
    } catch {
      // Corrupted EXIF: keep segment-level facts only
      tags = {};
    }
  } else {
    metadata.hasThumbnail = false;
  }

  if (metadata.hasEXIF) {
    metadata.cameraMake = tags.Make as string | undefined;
    metadata.cameraModel = tags.Model as string | undefined;
    metadata.lensModel = tags.LensModel as string | undefined;
    metadata.camera = {
      make: metadata.cameraMake,
      model: metadata.cameraModel,
      lens: metadata.lensModel,
    };
    metadata.orientation = tags.Orientation as number | undefined;
    metadata.iso = tags.ISO as number | undefined;
    metadata.focalLength = tags.FocalLength as number | undefined;
    metadata.aperture = tags.FNumber as number | undefined;
    metadata.exposureCompensation = tags.ExposureCompensation as
      | number
      | undefined;
    metadata.software = tags.Software as string | undefined;

    if (typeof tags.ExposureTime === "number") {
      metadata.shutterSpeed = formatShutterSpeed(tags.ExposureTime);
    }
    if (typeof tags.Flash === "number") {
      metadata.flash = (tags.Flash & 0x01) !== 0;
    }
    for (const key of ["DateTimeOriginal", "CreateDate"] as const) {
      const value = tags[key];
      if (typeof value === "number") {
        metadata.dateTaken = new Date(value * 1000);
        break;
      }
    }
    if (typeof tags.ModifyDate === "number") {
      metadata.dateModified = new Date(tags.ModifyDate * 1000);
    }

    const lat = tags.GPSLatitude as number | undefined;
    const lng = tags.GPSLongitude as number | undefined;
    if (
      options.stripGPS !== true &&
      typeof lat === "number" &&
      typeof lng === "number"
    ) {
      metadata.hasGPS = true;
      metadata.latitude = lat;
      metadata.longitude = lng;
      if (typeof tags.GPSAltitude === "number") {
        metadata.altitude = tags.GPSAltitude;
      }
      if (typeof tags.GPSTimeStamp === "number") {
        metadata.gpsTimestamp = new Date(tags.GPSTimeStamp * 1000);
      }
    }
  }

  // Nested objects follow the option flags
  if (options.extractGPS) {
    metadata.gps = {
      hasGPS: metadata.hasGPS,
      latitude: metadata.latitude,
      longitude: metadata.longitude,
      altitude: metadata.altitude,
    };
  }
  if (!metadata.camera) {
    metadata.camera = { make: undefined, model: undefined, lens: undefined };
  }

  // Fill missing dates from file stats
  try {
    const stats = await fs.stat(filePath);
    if (!metadata.dateModified) metadata.dateModified = stats.mtime;
    if (!metadata.dateCreated) metadata.dateCreated = stats.birthtime;
    if (!metadata.dateTaken && options.useFileDate) {
      metadata.dateTaken = new Date(stats.mtime);
    }
  } catch {
    // Stat failures leave dates unset
  }

  return metadata;
}

/** Parse PNG dimensions from the IHDR chunk. */
export function parsePNGMetadata(
  buffer: Buffer,
  base: ImageMetadata,
): ImageMetadata {
  try {
    const IHDR_OFFSET = 8;
    if (buffer.length < IHDR_OFFSET + 17) return base;

    const chunkType = buffer.toString("ascii", IHDR_OFFSET + 4, IHDR_OFFSET + 8);
    if (chunkType !== "IHDR") return base;

    return {
      ...base,
      width: buffer.readUInt32BE(IHDR_OFFSET + 8),
      height: buffer.readUInt32BE(IHDR_OFFSET + 12),
    };
  } catch {
    return base;
  }
}
