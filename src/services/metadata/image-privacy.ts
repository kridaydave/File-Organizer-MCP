/**
 * Image privacy operations + JPEG byte-level helpers.
 * GPS/metadata stripping rewrites JPEG segments directly; extraction
 * lives in image.ts via exif-parser.
 */

import fs from "fs/promises";
import path from "path";
import ExifParser from "exif-parser";
import * as piexif from "piexifjs";

/** Check whether EXIF tags carry GPS coordinates. */
export async function detectGpsPresence(buffer: Buffer): Promise<boolean> {
  try {
    const result = ExifParser.create(buffer).parse();
    return (
      result?.tags?.GPSLatitude !== undefined &&
      result?.tags?.GPSLongitude !== undefined
    );
  } catch {
    return false;
  }
}

export const IMAGE_FORMATS: Record<
  string,
  { magic: number[]; extensions: string[] }
> = {
  jpeg: { magic: [0xff, 0xd8, 0xff], extensions: [".jpg", ".jpeg"] },
  png: { magic: [0x89, 0x50, 0x4e, 0x47], extensions: [".png"] },
  tiff_be: { magic: [0x4d, 0x4d], extensions: [".tif", ".tiff"] },
  tiff_le: { magic: [0x49, 0x49], extensions: [".tif", ".tiff"] },
  webp: { magic: [0x52, 0x49, 0x46, 0x46], extensions: [".webp"] },
  heic: {
    magic: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70],
    extensions: [".heic", ".heif"],
  },
};

const GPS_IFD_POINTER_TAG = 0x8825;

export function matchesMagic(buffer: Buffer, magic: number[]): boolean {
  if (buffer.length < magic.length) return false;
  return magic.every((byte, index) => buffer[index] === byte);
}

export function detectImageFormat(buffer: Buffer): string {
  for (const [format, info] of Object.entries(IMAGE_FORMATS)) {
    if (matchesMagic(buffer, info.magic)) {
      return format === "tiff_be" || format === "tiff_le" ? "tiff" : format;
    }
  }
  return "unknown";
}

export function getFormatFromExtension(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  for (const [format, info] of Object.entries(IMAGE_FORMATS)) {
    if (info.extensions.includes(ext)) {
      return format === "tiff_be" || format === "tiff_le" ? "tiff" : format;
    }
  }
  return "unknown";
}

/** Read image file into buffer. If maxBytes is provided, reads up to that limit; otherwise reads entire file. */
export async function readImageFile(
  filePath: string,
  maxBytes?: number,
): Promise<Buffer> {
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      throw new Error(`Not a file: ${filePath}`);
    }

    const readSize =
      maxBytes !== undefined ? Math.min(stats.size, maxBytes) : stats.size;
    if (readSize === 0) {
      return Buffer.alloc(0);
    }
    const fd = await fs.open(filePath, "r");
    try {
      const buffer = Buffer.alloc(readSize);
      await fd.read(buffer, 0, readSize, 0);
      return buffer;
    } finally {
      await fd.close();
    }
  } catch (error) {
    throw new Error(
      `Failed to read image file: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

/** Find the APP1 EXIF segment; returns the TIFF header offset inside it. */
export function findEXIFSegment(
  buffer: Buffer,
): { tiffHeaderOffset: number } | null {
  let offset = 2; // Skip SOI marker (FF D8)

  while (offset < buffer.length - 4) {
    if (buffer[offset] !== 0xff) {
      offset++;
      continue;
    }

    const marker = buffer[offset + 1];
    if (marker === 0xff) {
      offset++;
      continue;
    }

    if (marker === 0xe1) {
      const length = buffer.readUInt16BE(offset + 2);
      const identifierEnd = offset + 4;

      if (
        identifierEnd + 6 <= buffer.length &&
        buffer.toString("ascii", identifierEnd, identifierEnd + 4) === "Exif"
      ) {
        return { tiffHeaderOffset: identifierEnd + 6 };
      }

      offset += 2 + length;
    } else if (marker === 0xd9 || marker === 0xda) {
      break;
    } else if (marker !== undefined && marker >= 0xd0 && marker <= 0xfe) {
      const length = buffer.readUInt16BE(offset + 2);
      offset += 2 + length;
    } else {
      offset += 2;
    }
  }

  return null;
}

/**
 * Remove GPS IFD and related GPS tags from JPEG EXIF data.
 */
function removeGPSFromJPEG(buffer: Buffer): Buffer {
  try {
    const jpegBase64 = buffer.toString("base64");
    let piexifParsed = false;
    let hadGPS = false;

    // Check if there's an APP1 EXIF segment
    let hasApp1Exif = false;
    try {
      let offset = 2;
      while (offset < buffer.length - 4) {
        if (buffer[offset] !== 0xff) {
          offset++;
          continue;
        }
        const marker = buffer[offset + 1];
        if (marker === undefined || marker === 0xff) {
          offset++;
          continue;
        }
        if (marker === 0xe1) {
          const identifierEnd = offset + 4;
          if (
            identifierEnd + 6 <= buffer.length &&
            buffer.toString("ascii", identifierEnd, identifierEnd + 4) === "Exif"
          ) {
            hasApp1Exif = true;
            break;
          }
          if (offset + 3 >= buffer.length) break;
          const length = buffer.readUInt16BE(offset + 2);
          offset += 2 + length;
          continue;
        } else if (marker === 0xd9 || marker === 0xda) {
          break;
        } else if (marker >= 0xd0 && marker <= 0xfe) {
          if (offset + 3 >= buffer.length) break;
          const length = buffer.readUInt16BE(offset + 2);
          offset += 2 + length;
          continue;
        } else {
          offset += 2;
        }
      }
    } catch {}

    try {
      const exifObj = piexif.load(jpegBase64);
      piexifParsed = true;

      const gpsTag = piexif.ImageIFD?.GPSTag;
      hadGPS =
        (piexif.GPSIFD && exifObj.GPS && Object.keys(exifObj.GPS).length > 0) ||
        (exifObj["0th"] && gpsTag !== undefined && gpsTag in exifObj["0th"]) ||
        Boolean(exifObj.GPS);

      if (hadGPS) {
        delete exifObj.GPS;

        if (exifObj["0th"] && piexif.ImageIFD?.GPSTag !== undefined) {
          delete exifObj["0th"][piexif.ImageIFD.GPSTag];
        }

        try {
          const exifBytes = piexif.dump(exifObj);
          const newJpegBase64 = piexif.remove(jpegBase64);
          const finalJpegBase64 = piexif.insert(exifBytes, newJpegBase64);
          const result = Buffer.from(finalJpegBase64, "base64");
          // If piexifjs didn't actually remove GPS pointer, fall through to aggressive removal
          if (result.includes(Buffer.from([0x25, 0x88]))) {
            throw new Error("GPS pointer still present");
          }
          return result;
        } catch {
          // Fall through to aggressive removal only if we know GPS was present
        }
      }
    } catch {
      // piexifjs couldn't parse
      piexifParsed = false;
    }

    // Only do aggressive removal if we had evidence of GPS that needs removal
    // or if there's an APP1 EXIF segment that piexifjs couldn't parse (possible GPS hidden)
    if (hadGPS || (hasApp1Exif && !piexifParsed)) {
      try {
        const stripped = removeAllMetadataFromJPEG(buffer);
        // If stripping would corrupt the file badly, return original
        if (stripped.length < 4) {
          return buffer;
        }
        // Make sure we didn't truncate drastically
        if (stripped.length < buffer.length * 0.5 && buffer.length > 10000) {
          return buffer;
        }
        return stripped;
      } catch {
        return buffer;
      }
    }

    return buffer;
  } catch {
    return buffer;
  }
}

/**
 * Remove all APP segments and comments from a JPEG buffer,
 * keeping SOI/DQT/SOF/SOS/EOI structure intact.
 */
function removeAllMetadataFromJPEG(buffer: Buffer): Buffer {
  try {
    const chunks: Buffer[] = [];
    chunks.push(Buffer.from([0xff, 0xd8])); // SOI

    let i = 2;
    while (i < buffer.length - 1) {
      if (buffer[i] !== 0xff) {
        i++;
        continue;
      }

      const marker = buffer[i + 1];
      if (marker === undefined) {
        i++;
        continue;
      }

      // Skip APP0-APP15 and COM markers entirely
      if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) {
        if (i + 3 >= buffer.length) break;
        const len = ((buffer[i + 2] ?? 0) << 8) | (buffer[i + 3] ?? 0);
        if (len < 2) break;
        i += 2 + len;
        continue;
      }

      if (marker === 0xda) {
        // SOS: keep everything from here to EOF (scan data + EOI)
        chunks.push(buffer.subarray(i));
        break;
      }

      // EOI and RST markers have no length
      if (marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        chunks.push(buffer.subarray(i, Math.min(i + 2, buffer.length)));
        i += 2;
        if (marker === 0xd9) break;
        continue;
      }

      if (i + 3 >= buffer.length) break;
      const len = ((buffer[i + 2] ?? 0) << 8) | (buffer[i + 3] ?? 0);
      if (len < 2) break;
      const end = Math.min(i + 2 + len, buffer.length);
      chunks.push(buffer.subarray(i, end));
      i = end;

      if (marker === 0xd9) break; // EOI
    }

    const result = Buffer.concat(chunks);
    // Never truncate to empty or suspiciously small if we started with a valid JPEG
    if (result.length < 4 && buffer.length >= 4) {
      return buffer;
    }
    return result;
  } catch {
    return buffer;
  }
}

/** Create a copy of the image with GPS data stripped. */
export async function stripGPSData(
  filePath: string,
  outputPath?: string,
): Promise<void> {
  const buffer = await readImageFile(filePath);
  const format = detectImageFormat(buffer);

  if (format !== "jpeg" && format !== "jpg") {
    throw new Error(`GPS stripping not supported for format: ${format}`);
  }

  await fs.writeFile(outputPath || filePath, removeGPSFromJPEG(buffer));
}

/** Strip GPS data from an image file. */
export async function stripGPS(
  filePath: string,
  outputPath: string,
): Promise<{ success: boolean; gpsRemoved: boolean }> {
  try {
    const buffer = await readImageFile(filePath);
    const format = detectImageFormat(buffer);
    if (format !== "jpeg" && format !== "jpg") {
      return { success: false, gpsRemoved: false };
    }

    if (!(await detectGpsPresence(buffer))) {
      // No GPS to remove: only copy if outputPath is distinct from filePath
      if (outputPath && path.resolve(outputPath) !== path.resolve(filePath)) {
        await fs.copyFile(filePath, outputPath);
      }
      return { success: true, gpsRemoved: false };
    }

    const stripped = removeGPSFromJPEG(buffer);
    await fs.writeFile(outputPath || filePath, stripped);

    // Verify GPS is actually removed; if not, report failure per privacy requirement
    if (await detectGpsPresence(stripped)) {
      return { success: false, gpsRemoved: false };
    }
    if (stripped.includes(Buffer.from([0x25, 0x88]))) {
      return { success: false, gpsRemoved: false };
    }

    return { success: true, gpsRemoved: true };
  } catch {
    return { success: false, gpsRemoved: false };
  }
}

/** Strip all metadata (APP segments and comments) from an image file. */
export async function stripAllMetadata(
  filePath: string,
  outputPath: string,
): Promise<{ success: boolean }> {
  try {
    const buffer = await readImageFile(filePath);
    const format = detectImageFormat(buffer);
    if (format !== "jpeg" && format !== "jpg") {
      return { success: false };
    }

    await fs.writeFile(outputPath || filePath, removeAllMetadataFromJPEG(buffer));
    return { success: true };
  } catch {
    return { success: false };
  }
}
