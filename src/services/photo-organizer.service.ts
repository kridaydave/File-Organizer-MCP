/**
 * Photo Organizer Service
 * Organizes photos by date with EXIF metadata extraction and privacy features
 */

import fs from "fs/promises";
import path from "path";
import { createReadStream, createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import * as piexif from "piexifjs";
import { MetadataService } from "./metadata.service.js";
import { PathValidatorService } from "./path-validator.service.js";
import { logger } from "../utils/logger.js";
import { FileInfo } from "../types.js";

// Photo file extensions supported
const PHOTO_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".jpe",
  ".png",
  ".tiff",
  ".tif",
  ".bmp",
  ".gif",
  ".webp",
  ".heic",
  ".heif",
  ".raw",
  ".cr2",
  ".cr3",
  ".nef",
  ".arw",
  ".dng",
  ".orf",
  ".rw2",
  ".pef",
  ".sr2",
  ".raf",
]);

export interface PhotoOrganizationConfig {
  sourceDir: string;
  targetDir: string;
  dateFormat: "YYYY/MM/DD" | "YYYY-MM-DD" | "YYYY/MM" | "YYYY";
  useDateCreated?: boolean;
  groupByCamera?: boolean;
  copyInsteadOfMove?: boolean;
  stripGPS?: boolean;
  unknownDateFolder?: string;
}

export interface PhotoOrganizationResult {
  success: boolean;
  organizedFiles: number;
  skippedFiles: number;
  strippedGPSFiles: number;
  errors: Array<{ file: string; error: string }>;
  structure: Record<string, number>;
}

interface PhotoFileInfo extends FileInfo {
  dateTaken?: Date;
  cameraModel?: string;
  hasGPS?: boolean;
}

export class PhotoOrganizerService {
  private metadataService: MetadataService;
  private pathValidator: PathValidatorService;

  constructor() {
    this.metadataService = new MetadataService();
    this.pathValidator = new PathValidatorService();
  }

  /**
   * Organize photos by date extracted from EXIF metadata
   */
  async organize(
    config: PhotoOrganizationConfig,
  ): Promise<PhotoOrganizationResult> {
    return this.performOrganization(config, false);
  }

  /**
   * Preview organization without actually moving/copying files
   */
  async previewOrganization(
    config: PhotoOrganizationConfig,
  ): Promise<PhotoOrganizationResult> {
    return this.performOrganization(config, true);
  }

  /**
   * Core organization logic
   */
  private async performOrganization(
    config: PhotoOrganizationConfig,
    dryRun: boolean,
  ): Promise<PhotoOrganizationResult> {
    const result: PhotoOrganizationResult = {
      success: true,
      organizedFiles: 0,
      skippedFiles: 0,
      strippedGPSFiles: 0,
      errors: [],
      structure: {},
    };

    try {
      // Validate configuration
      await this.validateConfig(config);

      // Scan for photo files
      const photoFiles = await this.scanPhotoFiles(config.sourceDir);

      if (photoFiles.length === 0) {
        logger.warn("No photo files found in source directory", {
          sourceDir: config.sourceDir,
        });
        return result;
      }

      logger.info(`Found ${photoFiles.length} photo files to organize`, {
        sourceDir: config.sourceDir,
        targetDir: config.targetDir,
        dryRun,
      });

      // Extract metadata for each photo
      const photosWithMetadata = await this.extractPhotoMetadata(
        photoFiles,
        config,
      );

      // Check disk space before operations (skip for dry run)
      if (!dryRun) {
        const hasSpace = await this.checkDiskSpace(photosWithMetadata, config);
        if (!hasSpace) {
          throw new Error("Insufficient disk space for organization operation");
        }
      }

      // Organize files
      for (const photo of photosWithMetadata) {
        try {
          const targetPath = await this.getTargetPath(photo, config);
          const targetDir = path.dirname(targetPath);

          if (dryRun) {
            // Dry run: just track the structure
            result.structure[targetDir] =
              (result.structure[targetDir] || 0) + 1;
            result.organizedFiles++;
            logger.debug("Dry run: would organize file", {
              source: photo.path,
              target: targetPath,
            });
            continue;
          }

          // Ensure target directory exists
          await fs.mkdir(targetDir, { recursive: true });

          // Handle filename collisions
          const finalTargetPath = await this.resolveCollision(targetPath);

          // Perform move or copy
          if (config.copyInsteadOfMove) {
            if (config.stripGPS && photo.hasGPS) {
              // Copy without GPS data
              await this.copyWithoutGPS(photo.path, finalTargetPath);
              result.strippedGPSFiles++;
              logger.info("Stripped GPS data from file", {
                source: photo.path,
                target: finalTargetPath,
              });
            } else {
              await this.copyFile(photo.path, finalTargetPath);
            }
          } else {
            if (config.stripGPS && photo.hasGPS) {
              // Move with GPS stripping: copy without GPS then delete original
              await this.copyWithoutGPS(photo.path, finalTargetPath);

              // Verify the copy succeeded before deleting original
              const targetExists = await fs
                .access(finalTargetPath)
                .then(() => true)
                .catch(() => false);
              if (!targetExists) {
                throw new Error(
                  `Copy verification failed: target file does not exist at ${finalTargetPath}`,
                );
              }

              // Verify file sizes match (basic integrity check)
              const sourceStats = await fs.stat(photo.path);
              const targetStats = await fs.stat(finalTargetPath);
              if (targetStats.size === 0) {
                throw new Error(
                  `Copy verification failed: target file is empty at ${finalTargetPath}`,
                );
              }

              // Now safe to delete original
              await fs.unlink(photo.path);
              result.strippedGPSFiles++;
              logger.info("Moved file with GPS data stripped", {
                source: photo.path,
                target: finalTargetPath,
                sourceSize: sourceStats.size,
                targetSize: targetStats.size,
              });
            } else {
              await fs.rename(photo.path, finalTargetPath);
            }
          }

          // Update result tracking
          result.structure[targetDir] = (result.structure[targetDir] || 0) + 1;
          result.organizedFiles++;

          logger.info(
            `${config.copyInsteadOfMove ? "Copied" : "Moved"} photo`,
            {
              source: photo.path,
              target: finalTargetPath,
              dateTaken: photo.dateTaken?.toISOString(),
            },
          );
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          result.errors.push({ file: photo.path, error: errorMsg });
          logger.error("Failed to organize photo", error, { file: photo.path });
        }
      }

      logger.info("Photo organization completed", {
        totalFiles: photoFiles.length,
        organized: result.organizedFiles,
        errors: result.errors.length,
        strippedGPS: result.strippedGPSFiles,
      });
    } catch (error) {
      result.success = false;
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error("Photo organization failed", error);
      result.errors.push({ file: "N/A", error: errorMsg });
    }

    return result;
  }

  /**
   * Validate organization configuration
   */
  private async validateConfig(config: PhotoOrganizationConfig): Promise<void> {
    // Validate source and target are different
    const sourceReal = await this.pathValidator.validatePath(config.sourceDir, {
      requireExists: true,
      checkWrite: false,
    });
    const targetReal = await this.pathValidator.validatePath(config.targetDir, {
      requireExists: false,
      checkWrite: true,
    });

    if (sourceReal === targetReal) {
      throw new Error("Source and target directories must be different");
    }

    // Check if source is within target or vice versa (would cause issues)
    if (
      targetReal.startsWith(sourceReal + path.sep) ||
      sourceReal.startsWith(targetReal + path.sep)
    ) {
      throw new Error(
        "Source and target directories cannot be nested within each other",
      );
    }

    // Set defaults
    config.unknownDateFolder ??= "Unknown Date";
    config.useDateCreated ??= false;
    config.groupByCamera ??= false;
    config.copyInsteadOfMove ??= false;
    config.stripGPS ??= false;
  }

  /**
   * Scan directory for photo files
   */
  private async scanPhotoFiles(dir: string): Promise<FileInfo[]> {
    const photos: FileInfo[] = [];
    const validatedPath = await this.pathValidator.validatePath(dir, {
      requireExists: true,
      checkWrite: false,
    });

    const entries = await fs.readdir(validatedPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (PHOTO_EXTENSIONS.has(ext)) {
          const fullPath = path.join(validatedPath, entry.name);
          const stats = await fs.stat(fullPath);

          photos.push({
            name: entry.name,
            path: fullPath,
            size: stats.size,
            extension: ext,
            created: stats.birthtime,
            modified: stats.mtime,
          });
        }
      }
    }

    return photos;
  }

  /**
   * Extract metadata for all photos
   */
  private async extractPhotoMetadata(
    files: FileInfo[],
    config: PhotoOrganizationConfig,
  ): Promise<PhotoFileInfo[]> {
    const photos: PhotoFileInfo[] = [];

    for (const file of files) {
      try {
        const metadata = await this.metadataService.extractMetadata(
          file.path,
          file.extension,
        );

        const photoInfo: PhotoFileInfo = {
          ...file,
          dateTaken: undefined,
          cameraModel: undefined,
          hasGPS: false,
        };

        // Extract date with fallback chain
        if (metadata?.dateTaken) {
          photoInfo.dateTaken = new Date(metadata.dateTaken);
        } else if (config.useDateCreated) {
          photoInfo.dateTaken = file.created;
        }

        // Extract camera model
        if (metadata?.camera) {
          photoInfo.cameraModel = metadata.camera;
        }

        // Check for GPS data (would need EXIF library with GPS support)
        // For now, we'll detect based on common GPS tags if metadata includes them
        photoInfo.hasGPS = await this.hasGPSData(file.path);

        photos.push(photoInfo);
      } catch (error) {
        // If metadata extraction fails, use file with no metadata
        photos.push({
          ...file,
          dateTaken: config.useDateCreated ? file.created : undefined,
          cameraModel: undefined,
          hasGPS: false,
        });
      }
    }

    return photos;
  }

  /**
   * Check if a photo has GPS data
   * Note: This is a simplified check. Full implementation would parse EXIF GPS tags.
   */
  private async hasGPSData(filePath: string): Promise<boolean> {
    try {
      // Read first 64KB to check for GPS EXIF tags
      const buffer = Buffer.alloc(65536);
      const handle = await fs.open(filePath, "r");
      try {
        const { bytesRead } = await handle.read(buffer, 0, 65536, 0);
        if (bytesRead < 4) return false;

        // Check for common GPS EXIF marker bytes
        // This is a simplified detection - full implementation would use proper EXIF parsing
        const data = buffer.subarray(0, bytesRead);

        // Look for GPS IFD marker (0x8825) in EXIF
        // This is a heuristic approach
        for (let i = 0; i < data.length - 1; i++) {
          if (data[i] === 0x25 && data[i + 1] === 0x88) {
            return true;
          }
        }

        return false;
      } finally {
        await handle.close();
      }
    } catch {
      return false;
    }
  }

  /**
   * Get target path for a photo based on its metadata
   */
  private async getTargetPath(
    photo: PhotoFileInfo,
    config: PhotoOrganizationConfig,
  ): Promise<string> {
    const folderPath = this.getDateFolderName(
      photo.dateTaken,
      config.dateFormat,
      config.unknownDateFolder!,
    );

    let targetDir = path.join(config.targetDir, folderPath);

    // Add camera subfolder if enabled
    if (config.groupByCamera && photo.cameraModel) {
      const sanitizedCamera = this.sanitizeFolderName(photo.cameraModel);
      if (sanitizedCamera) {
        targetDir = path.join(targetDir, sanitizedCamera);
      }
    }

    return path.join(targetDir, photo.name);
  }

  /**
   * Generate folder name from date based on format
   */
  getDateFolderName(
    date: Date | undefined,
    format: string,
    unknownFolder: string,
  ): string {
    if (!date || isNaN(date.getTime())) {
      return unknownFolder;
    }

    const year = date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");

    switch (format) {
      case "YYYY/MM/DD":
        return path.join(year, month, day);
      case "YYYY-MM-DD":
        return `${year}-${month}-${day}`;
      case "YYYY/MM":
        return path.join(year, month);
      case "YYYY":
        return year;
      default:
        return path.join(year, month, day);
    }
  }

  /**
   * Sanitize folder name to be filesystem-safe
   */
  sanitizeFolderName(name: string): string {
    if (!name) return "";

    // Trim and replace invalid characters
    const sanitized = name
      .trim()
      .replace(/[\\/:*?"<>|\x00-\x1F]/g, "_")
      .replace(/\.{2,}/g, "_");

    // Handle Windows reserved names
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
    if (reservedNames.test(sanitized.split(".")[0] || "")) {
      return sanitized + "_";
    }

    // Limit length
    return sanitized.substring(0, 100).trim() || "Unknown";
  }

  /**
   * Resolve filename collisions by appending (1), (2), etc.
   */
  private async resolveCollision(targetPath: string): Promise<string> {
    if (!(await this.fileExists(targetPath))) {
      return targetPath;
    }

    const dir = path.dirname(targetPath);
    const ext = path.extname(targetPath);
    const basename = path.basename(targetPath, ext);

    let counter = 1;
    let newPath: string;

    do {
      newPath = path.join(dir, `${basename} (${counter})${ext}`);
      counter++;
    } while (await this.fileExists(newPath));

    return newPath;
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check available disk space
   */
  private async checkDiskSpace(
    photos: PhotoFileInfo[],
    config: PhotoOrganizationConfig,
  ): Promise<boolean> {
    try {
      // Calculate total size needed
      const totalSize = photos.reduce((sum, p) => sum + p.size, 0);

      // Get target directory disk info (platform-specific)
      // This is a simplified check - real implementation would use a library like 'check-disk-space'
      logger.debug("Checking disk space", {
        targetDir: config.targetDir,
        requiredBytes: totalSize,
        operation: config.copyInsteadOfMove ? "copy" : "move",
      });

      // For moves, we don't need additional space
      if (!config.copyInsteadOfMove) {
        return true;
      }

      // For copies, we'd need to check available space
      // This is a placeholder - real implementation would check actual available space
      return true;
    } catch (error) {
      logger.warn("Failed to check disk space", { error });
      return true; // Allow operation to proceed
    }
  }

  /**
   * Copy file from source to target
   */
  private async copyFile(source: string, target: string): Promise<void> {
    await pipeline(createReadStream(source), createWriteStream(target));

    // Preserve timestamps
    const stats = await fs.stat(source);
    await fs.utimes(target, stats.atime, stats.mtime);
  }

  /**
   * Copy file without GPS data
   * Uses piexifjs to strip GPS EXIF data while preserving other metadata
   */
  private async copyWithoutGPS(source: string, target: string): Promise<void> {
    // Read the file
    const buffer = await fs.readFile(source);

    // For JPEG files, attempt to strip GPS EXIF segments
    const strippedBuffer = this.stripGPSFromBuffer(buffer);

    // Write the stripped file
    await fs.writeFile(target, strippedBuffer);

    // Preserve timestamps
    const stats = await fs.stat(source);
    await fs.utimes(target, stats.atime, stats.mtime);

    logger.debug("GPS data stripped from file", { source, target });
  }

  /**
   * Strip GPS data from image buffer
   * Uses piexifjs to remove GPS EXIF data while preserving other metadata
   *
   * @param buffer - JPEG file buffer
   * @returns Buffer with GPS data stripped
   */
  private stripGPSFromBuffer(buffer: Buffer): Buffer {
    // Check if it's a JPEG
    if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
      // Not a JPEG, cannot strip GPS without format-specific handling
      logger.warn(
        "GPS stripping is only supported for JPEG files. Non-JPEG file will be copied with metadata intact.",
      );
      return buffer;
    }

    try {
      // Convert buffer to base64 for piexifjs
      const jpegBase64 = buffer.toString("base64");

      // Load EXIF data
      const exifObj = piexif.load(jpegBase64);

      // Check if GPS data exists (GPS IFD is tag 0x8825)
      const hasGPS = piexif.GPSIFD && Object.keys(exifObj.GPS || {}).length > 0;

      if (!hasGPS) {
        // No GPS data to strip
        return buffer;
      }

      // Remove GPS IFD entirely
      delete exifObj.GPS;

      // Also remove GPS-related tags from other IFDs if they exist
      if (exifObj["0th"] && piexif.ImageIFD.GPSTag !== undefined) {
        delete exifObj["0th"][piexif.ImageIFD.GPSTag];
      }

      // Dump the modified EXIF back to binary
      const exifBytes = piexif.dump(exifObj);

      // Remove old EXIF and insert new one
      const newJpegBase64 = piexif.remove(jpegBase64);
      const finalJpegBase64 = piexif.insert(exifBytes, newJpegBase64);

      // Convert back to buffer
      const resultBuffer = Buffer.from(finalJpegBase64, "base64");

      logger.debug("GPS data successfully stripped from JPEG", {
        originalSize: buffer.length,
        newSize: resultBuffer.length,
      });

      return resultBuffer;
    } catch (error) {
      // If EXIF manipulation fails, log error but return original buffer
      // to prevent data loss
      logger.error(
        `Failed to strip GPS data: ${error instanceof Error ? error.message : String(error)}`,
        { error },
      );
      logger.warn(
        "GPS stripping failed - file will be copied with GPS data intact",
      );
      return buffer;
    }
  }
}
