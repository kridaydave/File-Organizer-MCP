/**
 * Image Metadata Service
 * Extracts EXIF metadata from images with GPS and privacy support
 */

import * as fs from "fs/promises";
import * as path from "path";

// EXIF Tag Constants
const EXIF_TAGS = {
  // IFD0 Tags
  MAKE: 0x010f,
  MODEL: 0x0110,
  ORIENTATION: 0x0112,
  X_RESOLUTION: 0x011a,
  Y_RESOLUTION: 0x011b,
  RESOLUTION_UNIT: 0x0128,
  SOFTWARE: 0x0131,
  DATE_TIME: 0x0132,
  EXIF_IFD_POINTER: 0x8769,
  GPS_IFD_POINTER: 0x8825,

  // Exif IFD Tags
  EXPOSURE_TIME: 0x829a,
  F_NUMBER: 0x829d,
  EXPOSURE_PROGRAM: 0x8822,
  ISO_SPEED_RATINGS: 0x8827,
  DATE_TIME_ORIGINAL: 0x9003,
  DATE_TIME_DIGITIZED: 0x9004,
  COMPRESSED_BITS_PER_PIXEL: 0x9102,
  SHUTTER_SPEED_VALUE: 0x9201,
  APERTURE_VALUE: 0x9202,
  BRIGHTNESS_VALUE: 0x9203,
  EXPOSURE_BIAS_VALUE: 0x9204,
  MAX_APERTURE_VALUE: 0x9205,
  METERING_MODE: 0x9207,
  FLASH: 0x9209,
  FOCAL_LENGTH: 0x920a,
  LENS_MODEL: 0xa434,

  // GPS IFD Tags
  GPS_LATITUDE_REF: 0x0001,
  GPS_LATITUDE: 0x0002,
  GPS_LONGITUDE_REF: 0x0003,
  GPS_LONGITUDE: 0x0004,
  GPS_ALTITUDE_REF: 0x0005,
  GPS_ALTITUDE: 0x0006,
  GPS_TIMESTAMP: 0x0007,
  GPS_DATE_STAMP: 0x001d,
} as const;

// Image formats and their magic bytes
const IMAGE_FORMATS: Record<string, { magic: number[]; extensions: string[] }> =
  {
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

export interface ImageMetadata {
  filePath: string;
  format: string;

  // Camera info
  cameraMake?: string;
  cameraModel?: string;
  lensModel?: string;

  // Photo settings
  dateTaken?: Date;
  iso?: number;
  focalLength?: number;
  aperture?: number;
  shutterSpeed?: string;
  exposureCompensation?: number;
  flash?: boolean;
  orientation?: number;

  // Image properties
  width?: number;
  height?: number;
  resolution?: number;
  colorSpace?: string;

  // GPS
  hasGPS: boolean;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  gpsTimestamp?: Date;

  // Software
  software?: string;
  dateModified?: Date;
  dateCreated?: Date;

  extractedAt: Date;
}

export interface ImageMetadataOptions {
  extractGPS?: boolean;
  stripGPS?: boolean;
  extractThumbnail?: boolean;
}

interface EXIFValue {
  type: number;
  count: number;
  valueOffset: number;
  value?: unknown;
}

interface IFDEntry {
  tag: number;
  type: number;
  count: number;
  valueOffset: number;
}

export class ImageMetadataService {
  private readonly supportedFormats = [
    "jpg",
    "jpeg",
    "tiff",
    "png",
    "webp",
    "heic",
  ];

  /**
   * Get list of supported image formats
   */
  getSupportedFormats(): string[] {
    return [...this.supportedFormats];
  }

  /**
   * Extract metadata from a single image file
   */
  async extract(
    filePath: string,
    options: ImageMetadataOptions = {},
  ): Promise<ImageMetadata> {
    const startTime = Date.now();
    const extractedAt = new Date();

    try {
      const buffer = await this.readImageFile(filePath);
      const format = this.detectImageFormat(buffer);

      const baseMetadata: ImageMetadata = {
        filePath,
        format,
        hasGPS: false,
        extractedAt,
      };

      if (!this.isFormatSupported(format)) {
        return baseMetadata;
      }

      if (format === "jpeg" || format === "jpg") {
        return await this.parseJPEGMetadata(
          buffer,
          filePath,
          baseMetadata,
          options,
        );
      }

      // For other formats, return basic metadata
      return baseMetadata;
    } catch (error) {
      // Return minimal metadata on error, never throw
      return {
        filePath,
        format: this.getFormatFromExtension(filePath),
        hasGPS: false,
        extractedAt,
      };
    }
  }

  /**
   * Extract metadata from multiple image files
   */
  async extractBatch(
    filePaths: string[],
    options: ImageMetadataOptions = {},
  ): Promise<ImageMetadata[]> {
    const results: ImageMetadata[] = [];

    for (const filePath of filePaths) {
      const metadata = await this.extract(filePath, options);
      results.push(metadata);
    }

    return results;
  }

  /**
   * Check if an image file contains GPS data
   */
  async hasGPS(filePath: string): Promise<boolean> {
    try {
      const buffer = await this.readImageFile(filePath);
      const format = this.detectImageFormat(buffer);

      if (format !== "jpeg" && format !== "jpg") {
        return false;
      }

      const exifData = this.findEXIFSegment(buffer);
      if (!exifData) return false;

      const isLittleEndian = this.isLittleEndian(
        buffer,
        exifData.tiffHeaderOffset,
      );
      const ifd0 = this.parseIFD(
        buffer,
        exifData.tiffHeaderOffset,
        isLittleEndian,
        exifData.tiffHeaderOffset,
      );
      const gpsIFDOffset = ifd0.entries.get(EXIF_TAGS.GPS_IFD_POINTER);

      return gpsIFDOffset !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * Create a copy of the image with GPS data stripped
   */
  async stripGPSData(filePath: string, outputPath?: string): Promise<void> {
    const buffer = await this.readImageFile(filePath);
    const format = this.detectImageFormat(buffer);

    if (format !== "jpeg" && format !== "jpg") {
      throw new Error(`GPS stripping not supported for format: ${format}`);
    }

    const strippedBuffer = this.removeGPSFromJPEG(buffer);

    const destPath = outputPath || filePath;
    await fs.writeFile(destPath, strippedBuffer);
  }

  /**
   * Read image file into buffer
   */
  private async readImageFile(filePath: string): Promise<Buffer> {
    try {
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
        throw new Error(`Not a file: ${filePath}`);
      }

      // Read up to 256KB for metadata (usually sufficient)
      const maxSize = Math.min(stats.size, 262144);
      const fd = await fs.open(filePath, "r");

      try {
        const buffer = Buffer.alloc(maxSize);
        await fd.read(buffer, 0, maxSize, 0);
        return buffer;
      } finally {
        await fd.close();
      }
    } catch (error) {
      throw new Error(
        `Failed to read image file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Detect image format from magic bytes
   */
  private detectImageFormat(buffer: Buffer): string {
    for (const [format, info] of Object.entries(IMAGE_FORMATS)) {
      if (this.matchesMagic(buffer, info.magic)) {
        return format === "tiff_be" || format === "tiff_le" ? "tiff" : format;
      }
    }

    // Fallback to extension
    return "unknown";
  }

  /**
   * Check if magic bytes match
   */
  private matchesMagic(buffer: Buffer, magic: number[]): boolean {
    if (buffer.length < magic.length) return false;
    return magic.every((byte, index) => buffer[index] === byte);
  }

  /**
   * Get format from file extension
   */
  private getFormatFromExtension(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    for (const [format, info] of Object.entries(IMAGE_FORMATS)) {
      if (info.extensions.includes(ext)) {
        return format === "tiff_be" || format === "tiff_le" ? "tiff" : format;
      }
    }
    return "unknown";
  }

  /**
   * Check if format is supported for detailed parsing
   */
  private isFormatSupported(format: string): boolean {
    return ["jpg", "jpeg", "tiff"].includes(format);
  }

  /**
   * Parse JPEG metadata including EXIF
   */
  private async parseJPEGMetadata(
    buffer: Buffer,
    filePath: string,
    baseMetadata: ImageMetadata,
    options: ImageMetadataOptions,
  ): Promise<ImageMetadata> {
    try {
      const exifData = this.findEXIFSegment(buffer);

      if (!exifData) {
        // No EXIF data, try to get file stats
        const stats = await fs.stat(filePath).catch(() => null);
        if (stats) {
          baseMetadata.dateModified = stats.mtime;
          baseMetadata.dateCreated = stats.birthtime;
        }
        return baseMetadata;
      }

      // Parse TIFF header
      const isLittleEndian = this.isLittleEndian(
        buffer,
        exifData.tiffHeaderOffset,
      );

      // Parse IFD0
      const ifd0 = this.parseIFD(
        buffer,
        exifData.tiffHeaderOffset,
        isLittleEndian,
        exifData.tiffHeaderOffset,
      );

      // Build metadata
      const metadata: ImageMetadata = { ...baseMetadata };

      // Extract basic tags from IFD0
      metadata.cameraMake = this.getStringValue(
        ifd0.entries.get(EXIF_TAGS.MAKE),
        buffer,
        isLittleEndian,
      );
      metadata.cameraModel = this.getStringValue(
        ifd0.entries.get(EXIF_TAGS.MODEL),
        buffer,
        isLittleEndian,
      );
      metadata.orientation = this.getNumericValue(
        ifd0.entries.get(EXIF_TAGS.ORIENTATION),
      );
      metadata.software = this.getStringValue(
        ifd0.entries.get(EXIF_TAGS.SOFTWARE),
        buffer,
        isLittleEndian,
      );

      // Parse DateTime
      const dateTimeStr = this.getStringValue(
        ifd0.entries.get(EXIF_TAGS.DATE_TIME),
        buffer,
        isLittleEndian,
      );
      if (dateTimeStr) {
        metadata.dateModified = this.parseEXIFDate(dateTimeStr);
      }

      // Parse Exif IFD
      const exifIFDPointer = ifd0.entries.get(EXIF_TAGS.EXIF_IFD_POINTER);
      if (exifIFDPointer) {
        const exifIFDOffset = this.getNumericValue(exifIFDPointer);
        if (exifIFDOffset) {
          const exifIFD = this.parseIFD(
            buffer,
            exifIFDOffset,
            isLittleEndian,
            exifData.tiffHeaderOffset,
          );

          metadata.iso = this.getNumericValue(
            exifIFD.entries.get(EXIF_TAGS.ISO_SPEED_RATINGS),
          );
          metadata.focalLength = this.getNumericValue(
            exifIFD.entries.get(EXIF_TAGS.FOCAL_LENGTH),
          );
          metadata.aperture = this.getRationalValue(
            exifIFD.entries.get(EXIF_TAGS.F_NUMBER),
            buffer,
            isLittleEndian,
          );
          metadata.lensModel = this.getStringValue(
            exifIFD.entries.get(EXIF_TAGS.LENS_MODEL),
            buffer,
            isLittleEndian,
          );
          metadata.exposureCompensation = this.getRationalValue(
            exifIFD.entries.get(EXIF_TAGS.EXPOSURE_BIAS_VALUE),
            buffer,
            isLittleEndian,
          );

          // Shutter speed
          const shutterSpeed = this.getRationalValue(
            exifIFD.entries.get(EXIF_TAGS.SHUTTER_SPEED_VALUE),
            buffer,
            isLittleEndian,
          );
          if (shutterSpeed) {
            metadata.shutterSpeed = this.convertShutterSpeed(shutterSpeed);
          }

          // Flash
          const flashValue = this.getNumericValue(
            exifIFD.entries.get(EXIF_TAGS.FLASH),
          );
          if (flashValue !== undefined) {
            metadata.flash = (flashValue & 0x01) !== 0;
          }

          // Date taken
          const dateOriginal = this.getStringValue(
            exifIFD.entries.get(EXIF_TAGS.DATE_TIME_ORIGINAL),
            buffer,
            isLittleEndian,
          );
          if (dateOriginal) {
            metadata.dateTaken = this.parseEXIFDate(dateOriginal);
          }
        }
      }

      // Parse GPS IFD (unless stripGPS is true)
      const gpsIFDPointer = ifd0.entries.get(EXIF_TAGS.GPS_IFD_POINTER);
      if (gpsIFDPointer && options.stripGPS !== true) {
        const gpsIFDOffset = this.getNumericValue(gpsIFDPointer);
        if (gpsIFDOffset) {
          const gpsIFD = this.parseIFD(
            buffer,
            gpsIFDOffset,
            isLittleEndian,
            exifData.tiffHeaderOffset,
          );
          const gpsData = this.parseGPSData(gpsIFD, buffer, isLittleEndian);

          if (
            gpsData.latitude !== undefined &&
            gpsData.longitude !== undefined
          ) {
            metadata.hasGPS = true;
            metadata.latitude = gpsData.latitude;
            metadata.longitude = gpsData.longitude;
            if (gpsData.altitude !== undefined)
              metadata.altitude = gpsData.altitude;
            if (gpsData.timestamp) metadata.gpsTimestamp = gpsData.timestamp;
          }
        }
      }

      // Get file stats for dates
      const stats = await fs.stat(filePath).catch(() => null);
      if (stats) {
        if (!metadata.dateModified) metadata.dateModified = stats.mtime;
        if (!metadata.dateCreated) metadata.dateCreated = stats.birthtime;
      }

      return metadata;
    } catch (error) {
      // Return base metadata on parsing error
      return baseMetadata;
    }
  }

  /**
   * Find EXIF segment in JPEG
   */
  private findEXIFSegment(buffer: Buffer): { tiffHeaderOffset: number } | null {
    let offset = 2; // Skip SOI marker (FF D8)

    while (offset < buffer.length - 4) {
      // Check for marker
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }

      const marker = buffer[offset + 1];

      // Skip padding
      if (marker === 0xff) {
        offset++;
        continue;
      }

      // APP1 marker
      if (marker === 0xe1) {
        const length = buffer.readUInt16BE(offset + 2);
        const identifierEnd = offset + 4;

        // Check for EXIF identifier
        if (
          identifierEnd + 6 <= buffer.length &&
          buffer.toString("ascii", identifierEnd, identifierEnd + 4) === "Exif"
        ) {
          return { tiffHeaderOffset: identifierEnd + 6 };
        }

        offset += 2 + length;
      } else if (marker !== undefined && (marker === 0xd9 || marker === 0xda)) {
        // EOI or SOS - stop looking
        break;
      } else if (marker !== undefined && marker >= 0xd0 && marker <= 0xfe) {
        // Other markers with length
        const length = buffer.readUInt16BE(offset + 2);
        offset += 2 + length;
      } else {
        offset += 2;
      }
    }

    return null;
  }

  /**
   * Check TIFF byte order
   */
  private isLittleEndian(buffer: Buffer, tiffHeaderOffset: number): boolean {
    const byteOrder = buffer.toString(
      "ascii",
      tiffHeaderOffset,
      tiffHeaderOffset + 2,
    );
    return byteOrder === "II"; // Little-endian
  }

  /**
   * Parse an Image File Directory (IFD)
   */
  private parseIFD(
    buffer: Buffer,
    ifdOffset: number,
    isLittleEndian: boolean,
    tiffHeaderOffset: number,
  ): { entries: Map<number, EXIFValue>; nextIFDOffset: number } {
    const entries = new Map<number, EXIFValue>();

    // Read number of directory entries
    const numEntries = isLittleEndian
      ? buffer.readUInt16LE(tiffHeaderOffset + ifdOffset)
      : buffer.readUInt16BE(tiffHeaderOffset + ifdOffset);

    let entryOffset = tiffHeaderOffset + ifdOffset + 2;

    for (let i = 0; i < numEntries; i++) {
      const tag = isLittleEndian
        ? buffer.readUInt16LE(entryOffset)
        : buffer.readUInt16BE(entryOffset);

      const type = isLittleEndian
        ? buffer.readUInt16LE(entryOffset + 2)
        : buffer.readUInt16BE(entryOffset + 2);

      const count = isLittleEndian
        ? buffer.readUInt32LE(entryOffset + 4)
        : buffer.readUInt32BE(entryOffset + 4);

      const valueOffset = isLittleEndian
        ? buffer.readUInt32LE(entryOffset + 8)
        : buffer.readUInt32BE(entryOffset + 8);

      entries.set(tag, { type, count, valueOffset });
      entryOffset += 12;
    }

    // Next IFD offset
    const nextIFDOffset = isLittleEndian
      ? buffer.readUInt32LE(entryOffset)
      : buffer.readUInt32BE(entryOffset);

    return { entries, nextIFDOffset };
  }

  /**
   * Get string value from EXIF entry
   */
  private getStringValue(
    entry: EXIFValue | undefined,
    buffer: Buffer,
    isLittleEndian: boolean,
  ): string | undefined {
    if (!entry) return undefined;

    // Type 2 is ASCII
    if (entry.type !== 2) return undefined;

    const length = entry.count;
    let str: string;

    if (length <= 4) {
      // Value fits in the valueOffset field
      const bytes = Buffer.alloc(4);
      bytes.writeUInt32BE(entry.valueOffset, 0);
      str = bytes.toString("ascii", 0, length - 1); // -1 to remove null terminator
    } else {
      // Value is at offset
      str = buffer.toString(
        "ascii",
        entry.valueOffset,
        entry.valueOffset + length - 1,
      );
    }

    return str || undefined;
  }

  /**
   * Get numeric value from EXIF entry
   */
  private getNumericValue(entry: EXIFValue | undefined): number | undefined {
    if (!entry) return undefined;

    switch (entry.type) {
      case 1: // BYTE
      case 7: // UNDEFINED
        return entry.valueOffset & 0xff;
      case 3: // SHORT
        return entry.valueOffset & 0xffff;
      case 4: // LONG
        return entry.valueOffset;
      case 9: // SLONG
        return entry.valueOffset | 0;
      default:
        return undefined;
    }
  }

  /**
   * Get rational value from EXIF entry
   */
  private getRationalValue(
    entry: EXIFValue | undefined,
    buffer: Buffer,
    isLittleEndian: boolean,
  ): number | undefined {
    if (!entry || (entry.type !== 5 && entry.type !== 10)) return undefined;

    const offset = entry.valueOffset;
    if (offset + 8 > buffer.length) return undefined;

    let numerator: number;
    let denominator: number;

    if (isLittleEndian) {
      numerator = buffer.readUInt32LE(offset);
      denominator = buffer.readUInt32LE(offset + 4);
    } else {
      numerator = buffer.readUInt32BE(offset);
      denominator = buffer.readUInt32BE(offset + 4);
    }

    if (denominator === 0) return undefined;
    return numerator / denominator;
  }

  /**
   * Parse EXIF date string to Date object
   */
  private parseEXIFDate(dateStr: string): Date | undefined {
    // EXIF format: "2023:10:15 14:30:00"
    const match = dateStr.match(
      /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/,
    );
    if (!match) return undefined;

    const year = match[1]!;
    const month = match[2]!;
    const day = match[3]!;
    const hour = match[4]!;
    const minute = match[5]!;
    const second = match[6]!;

    const date = new Date(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      parseInt(hour, 10),
      parseInt(minute, 10),
      parseInt(second, 10),
    );

    return isNaN(date.getTime()) ? undefined : date;
  }

  /**
   * Convert shutter speed value to readable string
   */
  private convertShutterSpeed(shutterSpeedValue: number): string {
    // Shutter speed is stored as log2 of exposure time
    const exposureTime = Math.pow(2, -shutterSpeedValue);

    if (exposureTime >= 1) {
      return `${Math.round(exposureTime)}"`;
    }

    const denominator = Math.round(1 / exposureTime);
    return `1/${denominator}`;
  }

  /**
   * Parse GPS data from GPS IFD
   */
  private parseGPSData(
    gpsIFD: { entries: Map<number, EXIFValue> },
    buffer: Buffer,
    isLittleEndian: boolean,
  ): {
    latitude?: number;
    longitude?: number;
    altitude?: number;
    timestamp?: Date;
  } {
    const result: {
      latitude?: number;
      longitude?: number;
      altitude?: number;
      timestamp?: Date;
    } = {};

    // Latitude
    const latRef = this.getStringValue(
      gpsIFD.entries.get(EXIF_TAGS.GPS_LATITUDE_REF),
      buffer,
      isLittleEndian,
    );
    const latEntry = gpsIFD.entries.get(EXIF_TAGS.GPS_LATITUDE);
    if (latRef && latEntry) {
      const latDMS = this.getRationalArray(latEntry, buffer, isLittleEndian, 3);
      if (latDMS) {
        result.latitude = this.convertDMSToDecimal(
          latDMS,
          latRef === "S" ? -1 : 1,
        );
      }
    }

    // Longitude
    const lonRef = this.getStringValue(
      gpsIFD.entries.get(EXIF_TAGS.GPS_LONGITUDE_REF),
      buffer,
      isLittleEndian,
    );
    const lonEntry = gpsIFD.entries.get(EXIF_TAGS.GPS_LONGITUDE);
    if (lonRef && lonEntry) {
      const lonDMS = this.getRationalArray(lonEntry, buffer, isLittleEndian, 3);
      if (lonDMS) {
        result.longitude = this.convertDMSToDecimal(
          lonDMS,
          lonRef === "W" ? -1 : 1,
        );
      }
    }

    // Altitude
    const altRef = this.getNumericValue(
      gpsIFD.entries.get(EXIF_TAGS.GPS_ALTITUDE_REF),
    );
    const altEntry = gpsIFD.entries.get(EXIF_TAGS.GPS_ALTITUDE);
    if (altEntry) {
      const altitude = this.getRationalValue(altEntry, buffer, isLittleEndian);
      if (altitude !== undefined) {
        result.altitude = altitude * (altRef === 1 ? -1 : 1);
      }
    }

    // Timestamp
    const timestampEntry = gpsIFD.entries.get(EXIF_TAGS.GPS_TIMESTAMP);
    const dateStampEntry = gpsIFD.entries.get(EXIF_TAGS.GPS_DATE_STAMP);
    if (timestampEntry) {
      const timeParts = this.getRationalArray(
        timestampEntry,
        buffer,
        isLittleEndian,
        3,
      );
      if (timeParts) {
        let date = new Date();
        if (dateStampEntry) {
          const dateStr = this.getStringValue(
            dateStampEntry,
            buffer,
            isLittleEndian,
          );
          if (dateStr) {
            const dateParts = dateStr.split(":").map(Number);
            if (dateParts.length >= 3) {
              const year = dateParts[0]!;
              const month = dateParts[1]!;
              const day = dateParts[2]!;
              date = new Date(year, month - 1, day);
            }
          }
        }
        if (
          timeParts[0] !== undefined &&
          timeParts[1] !== undefined &&
          timeParts[2] !== undefined
        ) {
          date.setHours(
            Math.floor(timeParts[0]),
            Math.floor(timeParts[1]),
            Math.floor(timeParts[2]),
          );
        }
        result.timestamp = date;
      }
    }

    return result;
  }

  /**
   * Get array of rational values
   */
  private getRationalArray(
    entry: EXIFValue,
    buffer: Buffer,
    isLittleEndian: boolean,
    expectedCount: number,
  ): number[] | undefined {
    if (entry.type !== 5 || entry.count !== expectedCount) return undefined;

    const values: number[] = [];
    let offset = entry.valueOffset;

    for (let i = 0; i < expectedCount; i++) {
      let numerator: number;
      let denominator: number;

      if (isLittleEndian) {
        numerator = buffer.readUInt32LE(offset);
        denominator = buffer.readUInt32LE(offset + 4);
      } else {
        numerator = buffer.readUInt32BE(offset);
        denominator = buffer.readUInt32BE(offset + 4);
      }

      if (denominator === 0) return undefined;
      values.push(numerator / denominator);
      offset += 8;
    }

    return values;
  }

  /**
   * Convert DMS (Degrees, Minutes, Seconds) to decimal degrees
   */
  private convertDMSToDecimal(dms: number[], sign: number): number {
    const degrees = dms[0] || 0;
    const minutes = dms[1] || 0;
    const seconds = dms[2] || 0;

    return sign * (degrees + minutes / 60 + seconds / 3600);
  }

  /**
   * Remove GPS data from JPEG buffer
   */
  private removeGPSFromJPEG(buffer: Buffer): Buffer {
    // Find EXIF segment
    const exifData = this.findEXIFSegment(buffer);
    if (!exifData) return buffer;

    const isLittleEndian = this.isLittleEndian(
      buffer,
      exifData.tiffHeaderOffset,
    );
    const tiffHeaderOffset = exifData.tiffHeaderOffset;

    // Parse IFD0 to find GPS IFD pointer
    const ifd0 = this.parseIFD(
      buffer,
      tiffHeaderOffset,
      isLittleEndian,
      tiffHeaderOffset,
    );
    const gpsIFDPointer = ifd0.entries.get(EXIF_TAGS.GPS_IFD_POINTER);

    if (!gpsIFDPointer) return buffer; // No GPS data to remove

    // Create a copy of the buffer
    const newBuffer = Buffer.from(buffer);

    // Zero out the GPS IFD pointer in IFD0
    const numEntriesOffset = tiffHeaderOffset;
    const numEntries = isLittleEndian
      ? buffer.readUInt16LE(numEntriesOffset)
      : buffer.readUInt16BE(numEntriesOffset);

    // Find the GPS IFD pointer entry and zero it out
    let entryOffset = numEntriesOffset + 2;
    for (let i = 0; i < numEntries; i++) {
      const tag = isLittleEndian
        ? buffer.readUInt16LE(entryOffset)
        : buffer.readUInt16BE(entryOffset);

      if (tag === EXIF_TAGS.GPS_IFD_POINTER) {
        // Zero out the value (4 bytes at offset + 8)
        newBuffer.writeUInt32BE(0, entryOffset + 8);
        break;
      }
      entryOffset += 12;
    }

    return newBuffer;
  }
}

export default ImageMetadataService;
