/**
 * Image privacy operations + JPEG byte-level helpers.
 * GPS/metadata stripping rewrites JPEG segments directly; extraction
 * lives in image.ts via exif-parser.
 */

import fs from "fs/promises";
import path from "path";
import ExifParser from "exif-parser";

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
 * Zero out the GPS IFD pointer in IFD0.
 * Reads the real IFD0 offset from the TIFF header (endian + magic occupy
 * 8 bytes before the pointer field).
 */
function removeGPSFromJPEG(buffer: Buffer): Buffer {
  const exifData = findEXIFSegment(buffer);
  if (!exifData) return buffer;

  const tiffHeaderOffset = exifData.tiffHeaderOffset;
  const isLittleEndian =
    buffer.toString("ascii", tiffHeaderOffset, tiffHeaderOffset + 2) === "II";

  const readU16 = (o: number) =>
    isLittleEndian ? buffer.readUInt16LE(o) : buffer.readUInt16BE(o);
  const readU32 = (o: number) =>
    isLittleEndian ? buffer.readUInt32LE(o) : buffer.readUInt32BE(o);

  let ifd0Offset: number;
  try {
    ifd0Offset = tiffHeaderOffset + readU32(tiffHeaderOffset + 4);
  } catch {
    return buffer;
  }
  if (ifd0Offset + 2 > buffer.length) return buffer;

  const numEntries = readU16(ifd0Offset);

  const newBuffer = Buffer.from(buffer);
  let entryOffset = ifd0Offset + 2;
  for (let i = 0; i < numEntries; i++) {
    if (entryOffset + 12 > newBuffer.length) break;
    const tag = readU16(entryOffset);
    if (tag === GPS_IFD_POINTER_TAG) {
      // Zeroed value bytes are endian-independent
      newBuffer.writeUInt32BE(0, entryOffset + 8);
      break;
    }
    entryOffset += 12;
  }

  return newBuffer;
}

/**
 * Remove all APP segments and comments from a JPEG buffer,
 * keeping SOI/DQT/SOF/SOS/EOI structure intact.
 */
function removeAllMetadataFromJPEG(buffer: Buffer): Buffer {
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
      const len = ((buffer[i + 2] ?? 0) << 8) | (buffer[i + 3] ?? 0);
      i += 2 + len;
      continue;
    }

    if (marker === 0xda) {
      // SOS: keep everything from here to EOF (scan data + EOI)
      chunks.push(buffer.subarray(i));
      break;
    }

    const len = ((buffer[i + 2] ?? 0) << 8) | (buffer[i + 3] ?? 0);
    const end = Math.min(i + 2 + len, buffer.length);
    chunks.push(buffer.subarray(i, end));
    i = end;

    if (marker === 0xd9) break; // EOI
  }

  return Buffer.concat(chunks);
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
      // No GPS to remove: just copy the file
      if (outputPath) {
        await fs.copyFile(filePath, outputPath);
      }
      return { success: true, gpsRemoved: false };
    }

    await fs.writeFile(outputPath || filePath, removeGPSFromJPEG(buffer));
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
