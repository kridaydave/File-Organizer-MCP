import fs from 'fs/promises';
import { createReadStream } from 'fs'; // For exif-parser which might need buffer or music-metadata stream
import path from 'path';
import { parseFile } from 'music-metadata';
import * as ExifParser from 'exif-parser'; // Handle older CJS import style if needed, or stick to import if it supports it. exif-parser is usually CJS.
import { CategoryName } from '../types.js';
import { PathValidatorService } from './path-validator.service.js';
import { logger } from '../utils/logger.js';

export interface FileMetadata {
  date?: Date;
  artist?: string;
  album?: string;
  title?: string;
  year?: number;
  // Explicitly excluding GPS data from this interface to ensure we don't accidentally use it
}

export class MetadataService {
  private pathValidator: PathValidatorService;

  constructor() {
    this.pathValidator = new PathValidatorService();
  }

  /**
   * Extract metadata from a file for organization purposes.
   * Guaranteed to NOT return sensitive location data.
   */
  async getMetadata(filePath: string, category: CategoryName): Promise<FileMetadata> {
    try {
      if (category === 'Images' || category === 'Videos') {
        return await this.getImageMetadata(filePath);
      } else if (category === 'Audio') {
        return await this.getAudioMetadata(filePath);
      }
    } catch (error) {
      logger.debug(`Failed to extract metadata for ${filePath}: ${(error as Error).message}`);
    }
    return {};
  }

  /**
   * Get a relative subpath based on file metadata.
   * e.g. "2024/01" for images, "Artist/Album" for audio.
   * Returns empty string if no relevant metadata found.
   */
  async getMetadataSubpath(filePath: string, category: CategoryName): Promise<string> {
    const metadata = await this.getMetadata(filePath, category);
    let subpath = '';

    if (category === 'Images' || category === 'Videos') {
      if (metadata.date) {
        const year = metadata.date.getFullYear().toString();
        const month = (metadata.date.getMonth() + 1).toString().padStart(2, '0');
        subpath = path.join(year, month);
      }
    } else if (category === 'Audio') {
      const artist = this.sanitizeMetadataValue(metadata.artist);
      const album = this.sanitizeMetadataValue(metadata.album);

      if (artist) {
        if (album) {
          subpath = path.join(artist, album);
        } else {
          subpath = artist;
        }
      }
    }

    // Final security check: ensure subpath doesn't contain forbidden characters or traversal
    if (subpath) {
      // We use a simplified check here because PathValidator might be too strict for partial paths (checking existence)
      // But we must ensure it doesn't have '..' or null bytes.
      if (subpath.includes('..') || subpath.includes('\0')) {
        logger.warn(`Security: Generated subpath contains unsafe sequences: ${subpath}`);
        return '';
      }
    }

    return subpath;
  }

  private async getImageMetadata(filePath: string): Promise<FileMetadata> {
    // exif-parser works on buffers.
    // For large files, we should only read the beginning.
    // 64kb is usually enough for EXIF.
    const buffer = Buffer.alloc(65536);
    let handle: fs.FileHandle | undefined;

    try {
      handle = await fs.open(filePath, 'r');
      const { bytesRead } = await handle.read(buffer, 0, 65536, 0);

      if (bytesRead < 4) return {}; // Too small

      // Handle CJS/ESM interop if necessary for exif-parser
      // In ESM, 'exif-parser' export might be default or named.
      // Using require-like logic or just trying.
      // Note: exif-parser is old (2012) and purely JS.

      const parser = (ExifParser as any).create(buffer.subarray(0, bytesRead));
      const result = parser.parse();

      const meta: FileMetadata = {};

      if (result.tags && result.tags.DateTimeOriginal) {
        meta.date = new Date(result.tags.DateTimeOriginal * 1000);
      } else if (result.tags && result.tags.CreateDate) {
        meta.date = new Date(result.tags.CreateDate * 1000);
      }

      return meta;
    } catch (e) {
      // Not a JPEG or similar, or no EXIF
      return {};
    } finally {
      await handle?.close();
    }
  }

  private async getAudioMetadata(filePath: string): Promise<FileMetadata> {
    try {
      const metadata = await parseFile(filePath);
      return {
        artist: metadata.common.artist,
        album: metadata.common.album,
        title: metadata.common.title,
        year: metadata.common.year,
      };
    } catch (error) {
      return {};
    }
  }

  /**
   * Sanitize metadata values to be safe for file paths.
   * Replaces / \ : * ? " < > | with _
   */
  private sanitizeMetadataValue(value?: string): string | undefined {
    if (!value) return undefined;

    // Trim whitespace
    const trimmed = value.trim();
    if (!trimmed) return undefined;

    // Replace illegal chars
    const sanitized = trimmed.replace(/[\\/:*?"<>|\x00-\x1F]/g, '_');

    // Prevent strictly reserved names if it's the whole segment (though unlikely for Artist names)
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(sanitized)) {
      return sanitized + '_';
    }

    // Limit length to avoid path limit issues
    return sanitized.substring(0, 100);
  }

  /**
   * Extract detailed metadata for the inspection tool
   * Returns structured metadata with more detailed fields than getMetadata
   */
  async extractMetadata(filePath: string, ext: string): Promise<Record<string, any> | null> {
    try {
      const isImage = ['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.heic', '.heif'].includes(ext);
      const isAudio = ['.mp3', '.flac', '.ogg', '.wav', '.m4a', '.aac'].includes(ext);

      // Handle image files
      if (isImage) {
        const buffer = Buffer.alloc(65536);
        let handle: fs.FileHandle | undefined;

        try {
          handle = await fs.open(filePath, 'r');
          const { bytesRead } = await handle.read(buffer, 0, 65536, 0);

          if (bytesRead < 4) return null;

          const parser = (ExifParser as any).create(buffer.subarray(0, bytesRead));
          const result = parser.parse();

          const metadata: Record<string, any> = {};

          // Extract date taken
          if (result.tags?.DateTimeOriginal) {
            metadata.dateTaken = new Date(result.tags.DateTimeOriginal * 1000).toISOString();
          } else if (result.tags?.CreateDate) {
            metadata.dateTaken = new Date(result.tags.CreateDate * 1000).toISOString();
          }

          // Extract camera info
          if (result.tags?.Make || result.tags?.Model) {
            metadata.camera = [result.tags?.Make, result.tags?.Model]
              .filter(Boolean)
              .join(' ')
              .trim();
          }

          // Extract dimensions
          if (result.imageSize) {
            metadata.width = result.imageSize.width;
            metadata.height = result.imageSize.height;
          }

          return Object.keys(metadata).length > 0 ? metadata : null;
        } finally {
          await handle?.close();
        }
      }

      // Handle audio files
      if (isAudio) {
        const result = await parseFile(filePath);

        const metadata: Record<string, any> = {};

        if (result.common?.artist) {
          metadata.artist = result.common.artist;
        }

        if (result.common?.album) {
          metadata.album = result.common.album;
        }

        if (result.common?.title) {
          metadata.title = result.common.title;
        }

        if (result.common?.year) {
          metadata.year = result.common.year;
        }

        if (result.format?.duration) {
          metadata.duration = result.format.duration;
        }

        return Object.keys(metadata).length > 0 ? metadata : null;
      }

      return null;
    } catch (error) {
      logger.debug(`Metadata extraction failed for ${filePath}: ${(error as Error).message}`);
      return null;
    }
  }
}
