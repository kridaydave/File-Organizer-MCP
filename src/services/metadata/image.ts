/**
 * Image metadata service facade.
 * EXIF mapping lives in image-exif.ts, byte ops + privacy in image-privacy.ts.
 */

import path from "path";
import { logger } from "../../utils/logger.js";
import {
  detectGpsPresence,
  detectImageFormat,
  getFormatFromExtension,
  readImageFile,
  stripAllMetadata,
  stripGPS,
  stripGPSData,
} from "./image-privacy.js";
import {
  basicResult,
  parseJPEGMetadata,
  parsePNGMetadata,
} from "./image-exif.js";
import type { ImageMetadata, ImageMetadataOptions } from "./types.js";

export class ImageMetadataService {
  private readonly supportedFormats = [
    "jpg",
    "jpeg",
    "tiff",
    "png",
    "webp",
    "heic",
  ];

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

  getSupportedFormats(): string[] {
    return [...this.supportedFormats];
  }

  isFormatSupported(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase().slice(1);
    return this.supportedFormats.includes(ext);
  }

  async extract(
    filePath: string,
    options: ImageMetadataOptions = {},
  ): Promise<ImageMetadata> {
    const extractedAt = new Date();

    try {
      const buffer = await readImageFile(filePath, 256 * 1024);
      const format = detectImageFormat(buffer);
      const baseMetadata: ImageMetadata = {
        filePath,
        format: this.formatFormatName(format),
        hasGPS: false,
        extractedAt,
      };

      if (format === "png") {
        return parsePNGMetadata(buffer, baseMetadata);
      }

      if (format !== "jpeg" && format !== "jpg") {
        return basicResult(baseMetadata, options);
      }

      return await parseJPEGMetadata(buffer, filePath, baseMetadata, options);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("Not a file") ||
          error.message.includes("ENOENT"))
      ) {
        throw error;
      }

      const baseMetadata: ImageMetadata = {
        filePath,
        format: this.formatFormatName(getFormatFromExtension(filePath)),
        hasGPS: false,
        extractedAt,
      };
      return basicResult(baseMetadata, options);
    }
  }

  async extractBatch(
    filePaths: string[],
    options: ImageMetadataOptions = {},
  ): Promise<ImageMetadata[]> {
    const { concurrency = 4, onProgress } = options;
    logger.info(
      `Batch extracting metadata for ${filePaths.length} files with concurrency ${concurrency}`,
    );

    const results: ImageMetadata[] = [];
    let processed = 0;
    let errors = 0;
    const warnings = 0;

    for (let i = 0; i < filePaths.length; i += concurrency) {
      const batch = filePaths.slice(i, i + concurrency);
      const batchPromises = batch.map(async (filePath) => {
        try {
          onProgress?.({
            processed,
            total: filePaths.length,
            currentFile: filePath,
            currentStage: "parsing",
            errors,
            warnings,
          });
          const metadata = await this.extract(filePath, options);
          processed++;
          return metadata;
        } catch (error) {
          logger.error(`Failed to extract metadata from ${filePath}:`, error);
          processed++;
          errors++;
          return {
            filePath,
            format: "UNKNOWN",
            hasGPS: false,
            hasEXIF: false,
            extractedAt: new Date(),
          };
        }
      });
      results.push(...(await Promise.all(batchPromises)));
    }

    logger.info(`Batch extraction complete: ${results.length} files processed`);
    return results;
  }

  /** Check whether the file carries GPS data. */
  async hasGPS(filePath: string): Promise<boolean> {
    try {
      const buffer = await readImageFile(filePath, 256 * 1024);
      const format = detectImageFormat(buffer);
      if (format !== "jpeg" && format !== "jpg") return false;
      return await detectGpsPresence(buffer);
    } catch {
      return false;
    }
  }

  /** Create a copy of the image with GPS data stripped. */
  async stripGPSData(filePath: string, outputPath?: string): Promise<void> {
    return stripGPSData(filePath, outputPath);
  }

  /** Strip GPS data from an image file. */
  async stripGPS(
    filePath: string,
    outputPath: string,
  ): Promise<{ success: boolean; gpsRemoved: boolean }> {
    return stripGPS(filePath, outputPath);
  }

  /** Strip all metadata (APP segments and comments) from an image file. */
  async stripAllMetadata(
    filePath: string,
    outputPath: string,
  ): Promise<{ success: boolean }> {
    return stripAllMetadata(filePath, outputPath);
  }
}

export default ImageMetadataService;
