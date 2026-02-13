/**
 * Image Metadata Service
 * Extracts EXIF metadata from images with GPS and privacy support
 */

import * as fs from "fs/promises";
import * as path from "path";

// EXIF Tag Constants
const EXIF_TAGS = {
  // IFD0 Tags
  IMAGE_WIDTH: 0x0100,
  IMAGE_LENGTH: 0x0101,
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

  // Camera info (nested format for tests)
  camera?: {
    make?: string;
    model?: string;
    lens?: string;
  };

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

  // GPS (nested format for tests)
  gps?: {
    hasGPS: boolean;
    latitude?: number;
    longitude?: number;
    altitude?: number;
  };

  // EXIF
  hasEXIF?: boolean;
  hasThumbnail?: boolean;

  // Software
  software?: string;
  dateModified?: Date;
  dateCreated?: Date;

  extractedAt: Date;
}

export interface ProgressUpdate {
  processed: number;
  total: number;
  currentFile?: string;
  currentStage?: "reading" | "extracting" | "caching";
  errors: number;
  warnings: number;
}

export type ProgressCallback = (update: ProgressUpdate) => void;

export interface ImageMetadataOptions {
  extractGPS?: boolean;
  stripGPS?: boolean;
  extractThumbnail?: boolean;
  concurrency?: number;
  onProgress?: ProgressCallback;
  useFileDate?: boolean;
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
   * Format the image format name to standard uppercase
   */
  private formatFormatName(format: string): string {
    const formatMap: Record<string, string> = {
      jpeg: "JPEG",
      jpg: "JPEG",
      png: "PNG",
      tiff: "TIFF",
      webp: "WEBP",
      heic: "HEIC",
      unknown: "UNKNOWN",
    };
    return formatMap[format.toLowerCase()] || format.toUpperCase();
  }

  /**
   * Get list of supported image formats
   */
  getSupportedFormats(): string[] {
    return [...this.supportedFormats];
  }

  /**
   * Check if an image file format is supported
   * @param filePath - The file path or filename to check
   * @returns true if the format is supported
   */
  isFormatSupported(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase().slice(1);
    return this.supportedFormats.includes(ext);
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
        format: this.formatFormatName(format),
        hasGPS: false,
        extractedAt,
      };

      if (!this.isDetailedParsingSupported(format)) {
        const result: ImageMetadata = {
          ...baseMetadata,
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

      if (format === "jpeg" || format === "jpg") {
        return await this.parseJPEGMetadata(
          buffer,
          filePath,
          baseMetadata,
          options,
        );
      }

      if (format === "png") {
        return this.parsePNGMetadata(buffer, baseMetadata);
      }

      // For other formats, return basic metadata
      return baseMetadata;
    } catch (error) {
      // Re-throw directory and file not found errors, return minimal metadata for other errors
      if (
        error instanceof Error &&
        (error.message.includes("Not a file") ||
          error.message.includes("ENOENT"))
      ) {
        throw error;
      }

      const result: ImageMetadata = {
        filePath,
        format: this.formatFormatName(this.getFormatFromExtension(filePath)),
        hasGPS: false,
        extractedAt,
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
  }

  /**
   * Extract metadata from multiple image files
   */
  async extractBatch(
    filePaths: string[],
    options: ImageMetadataOptions = {},
  ): Promise<ImageMetadata[]> {
    const { concurrency = 4, onProgress } = options;
    const results: ImageMetadata[] = [];
    let processed = 0;
    let errors = 0;
    const warnings = 0;

    // Process files in parallel with configurable concurrency
    const batches = [];
    for (let i = 0; i < filePaths.length; i += concurrency) {
      batches.push(filePaths.slice(i, i + concurrency));
    }

    for (const batch of batches) {
      const batchPromises = batch.map(async (filePath) => {
        try {
          onProgress?.({
            processed,
            total: filePaths.length,
            currentFile: filePath,
            currentStage: "reading",
            errors,
            warnings,
          });

          const metadata = await this.extract(filePath, options);

          processed++;
          onProgress?.({
            processed,
            total: filePaths.length,
            currentFile: filePath,
            currentStage: "extracting",
            errors,
            warnings,
          });

          return metadata;
        } catch (error) {
          processed++;
          errors++;
          onProgress?.({
            processed,
            total: filePaths.length,
            currentFile: filePath,
            currentStage: "extracting",
            errors,
            warnings,
          });

          return {
            filePath,
            format: this.getFormatFromExtension(filePath),
            hasGPS: false,
            extractedAt: new Date(),
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
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
   * Strip GPS data from an image file (public method)
   * @param filePath - Source file path
   * @param outputPath - Optional output path (if different from source)
   * @returns Result object with success status and gpsRemoved flag
   */
  async stripGPS(
    filePath: string,
    outputPath: string,
  ): Promise<{ success: boolean; gpsRemoved: boolean }> {
    try {
      const hasGPS = await this.hasGPS(filePath);
      if (!hasGPS) {
        // If no GPS, just copy the file
        if (outputPath) {
          await fs.copyFile(filePath, outputPath);
        }
        return { success: true, gpsRemoved: false };
      }

      const buffer = await this.readImageFile(filePath);
      const format = this.detectImageFormat(buffer);

      if (format !== "jpeg" && format !== "jpg") {
        return { success: false, gpsRemoved: false };
      }

      const strippedBuffer = this.removeGPSFromJPEG(buffer);
      const destPath = outputPath || filePath;
      await fs.writeFile(destPath, strippedBuffer);
      return { success: true, gpsRemoved: true };
    } catch {
      return { success: false, gpsRemoved: false };
    }
  }

  /**
   * Strip all metadata from an image file
   * @param filePath - Source file path
   * @param outputPath - Optional output path (if different from source)
   * @returns Result object with success status
   */
  async stripAllMetadata(
    filePath: string,
    outputPath: string,
  ): Promise<{ success: boolean }> {
    try {
      const buffer = await this.readImageFile(filePath);
      const format = this.detectImageFormat(buffer);

      if (format !== "jpeg" && format !== "jpg") {
        return { success: false };
      }

      // Remove all APP segments (metadata) from JPEG
      const strippedBuffer = this.removeAllMetadataFromJPEG(buffer);
      const destPath = outputPath || filePath;
      await fs.writeFile(destPath, strippedBuffer);
      return { success: true };
    } catch {
      return { success: false };
    }
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
   * Check if format is supported for detailed EXIF parsing
   */
  private isDetailedParsingSupported(format: string): boolean {
    return ["jpg", "jpeg", "tiff", "png"].includes(format);
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

      // Build metadata
      const metadata: ImageMetadata = { ...baseMetadata };

      // Check for thumbnail in EXIF
      metadata.hasThumbnail = this.hasThumbnailSegment(buffer);

      if (!exifData) {
        // No EXIF data, try to get file stats
        const stats = await fs.stat(filePath).catch(() => null);
        if (stats) {
          metadata.dateModified = stats.mtime;
          metadata.dateCreated = stats.birthtime;
          if (options.useFileDate) {
            metadata.dateTaken = new Date(stats.mtime);
          }
        }
        metadata.hasEXIF = false;
        // Add empty camera object for test compatibility
        metadata.camera = {
          make: undefined,
          model: undefined,
          lens: undefined,
        };
        // Only add gps object if extractGPS is true
        if (options.extractGPS) {
          metadata.gps = {
            hasGPS: false,
            latitude: undefined,
            longitude: undefined,
            altitude: undefined,
          };
        }
        return metadata;
      }

      // Has EXIF data
      metadata.hasEXIF = true;

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

      // Extract basic tags from IFD0
      metadata.width = this.getNumericValue(
        ifd0.entries.get(EXIF_TAGS.IMAGE_WIDTH),
      );
      metadata.height = this.getNumericValue(
        ifd0.entries.get(EXIF_TAGS.IMAGE_LENGTH),
      );
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

      // Build nested camera object (always present for test compatibility)
      metadata.camera = {
        make: metadata.cameraMake,
        model: metadata.cameraModel,
        lens: metadata.lensModel,
      };

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

      // Update camera object with lens info if available
      if (metadata.camera && metadata.lensModel) {
        metadata.camera.lens = metadata.lensModel;
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

      // Build nested GPS object only when extractGPS is true
      if (options.extractGPS) {
        metadata.gps = {
          hasGPS: metadata.hasGPS,
          latitude: metadata.latitude,
          longitude: metadata.longitude,
          altitude: metadata.altitude,
        };
      }

      // Get file stats for dates
      const stats = await fs.stat(filePath).catch(() => null);
      if (stats) {
        if (!metadata.dateModified) metadata.dateModified = stats.mtime;
        if (!metadata.dateCreated) metadata.dateCreated = stats.birthtime;
        if (!metadata.dateTaken && options.useFileDate)
          metadata.dateTaken = new Date(stats.mtime);
      }

      return metadata;
    } catch (error) {
      // Return base metadata on parsing error
      return baseMetadata;
    }
  }

  /**
   * Parse PNG metadata from IHDR chunk
   */
  private parsePNGMetadata(
    buffer: Buffer,
    baseMetadata: ImageMetadata,
  ): ImageMetadata {
    try {
      // PNG signature is 8 bytes, IHDR chunk starts at offset 8
      // IHDR chunk structure:
      // Bytes 0-3: Chunk length (big-endian) - always 13 for IHDR
      // Bytes 4-7: Chunk type ('IHDR')
      // Bytes 8-11: Width (big-endian UINT32)
      // Bytes 12-15: Height (big-endian UINT32)
      // Remaining: Bit depth, color type, compression, filter, interlace

      const IHDR_OFFSET = 8; // After PNG signature

      // Verify we have enough data for IHDR chunk
      if (buffer.length < IHDR_OFFSET + 17) {
        return baseMetadata;
      }

      // Check chunk type is 'IHDR'
      const chunkType = buffer.toString(
        "ascii",
        IHDR_OFFSET + 4,
        IHDR_OFFSET + 8,
      );
      if (chunkType !== "IHDR") {
        return baseMetadata;
      }

      // Read width and height (big-endian UINT32)
      const width = buffer.readUInt32BE(IHDR_OFFSET + 8);
      const height = buffer.readUInt32BE(IHDR_OFFSET + 12);

      return {
        ...baseMetadata,
        width,
        height,
      };
    } catch {
      // Return base metadata on parsing error
      return baseMetadata;
    }
  }

  /**
   * Check if JPEG has a thumbnail segment
   */
  private hasThumbnailSegment(buffer: Buffer): boolean {
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

      // Check for thumbnail-related markers or IFD1 reference
      if (marker === 0xe1) {
        const length = buffer.readUInt16BE(offset + 2);
        offset += 2 + length;
      } else if (marker === 0xd8 || marker === 0xd9) {
        break;
      } else if (marker && marker >= 0xd0 && marker <= 0xfe) {
        const length = buffer.readUInt16BE(offset + 2);
        offset += 2 + length;
      } else {
        offset += 2;
      }
    }

    // Check for IFD1 (thumbnail IFD) by looking for multiple IFDs in EXIF
    const exifData = this.findEXIFSegment(buffer);
    if (exifData) {
      try {
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
        // If there's a next IFD offset, it means there's IFD1 (thumbnail)
        if (ifd0.nextIFDOffset && ifd0.nextIFDOffset > 0) {
          return true;
        }
      } catch {
        // Ignore errors in thumbnail detection
      }
    }

    return false;
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

  /**
   * Remove all metadata (EXIF, IPTC, XMP, etc.) from JPEG buffer
   */
  private removeAllMetadataFromJPEG(buffer: Buffer): Buffer {
    // JPEG structure: [FF D8] [FF E0 len app0] [FF E1 len app1 exif] ... [FF DB] [image data] [FF D9]
    // We want to keep SOI (FF D8), DQT (FF DB), SOS (FF DA), and EOI (FF D9)

    const result: number[] = [];

    // Start with SOI marker
    result.push(0xff, 0xd8);

    let i = 2; // Skip SOI
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

      // Skip APP markers (APP0-APP15: E0-EF)
      if (marker >= 0xe0 && marker <= 0xef) {
        const len = ((buffer[i + 2] ?? 0) << 8) | (buffer[i + 3] ?? 0);
        i += 2 + len;
        continue;
      }

      // Skip COM (comment) marker
      if (marker === 0xfe) {
        const len = ((buffer[i + 2] ?? 0) << 8) | (buffer[i + 3] ?? 0);
        i += 2 + len;
        continue;
      }

      // Keep DQT (quantization), SOF (start of frame), SOS (start of scan), EOI
      const byte1 = buffer[i];
      const byte2 = buffer[i + 1];
      if (byte1 !== undefined && byte2 !== undefined) {
        result.push(byte1, byte2);
      }

      // For markers with length field
      if (marker !== 0xda && marker !== 0xd9) {
        const len = ((buffer[i + 2] ?? 0) << 8) | (buffer[i + 3] ?? 0);
        const b2 = buffer[i + 2];
        const b3 = buffer[i + 3];
        if (b2 !== undefined && b3 !== undefined) {
          result.push(b2, b3);
        }
        for (let j = 0; j < len - 2; j++) {
          const b = buffer[i + 4 + j];
          if (b !== undefined) {
            result.push(b);
          }
        }
        i += 2 + len;
      } else if (marker === 0xda) {
        // Copy rest of the file (scan data)
        for (let j = i + 2; j < buffer.length; j++) {
          const b = buffer[j];
          if (b !== undefined) {
            result.push(b);
          }
        }
        break;
      } else {
        i += 2;
      }
    }

    return Buffer.from(result);
  }
}

export default ImageMetadataService;
