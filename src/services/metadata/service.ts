/**
 * Metadata facade for organization flows.
 * Delegates to the lib-backed audio/image services; adds subpath
 * generation and sanitization on top.
 */

import fs from "fs/promises";
import path from "path";
import { CategoryName } from "../../types.js";
import { logger } from "../../utils/logger.js";
import { AudioMetadataService } from "./audio.js";
import { ImageMetadataService } from "./image.js";

export interface FileMetadata {
  date?: Date;
  artist?: string;
  album?: string;
  title?: string;
  year?: number;
  // Explicitly excluding GPS data from this interface to ensure we don't accidentally use it
}

export class MetadataService {
  private audioMetadataService: AudioMetadataService;
  private imageMetadataService: ImageMetadataService;

  constructor() {
    this.audioMetadataService = new AudioMetadataService();
    this.imageMetadataService = new ImageMetadataService();
  }

  /**
   * Extract metadata from a file for organization purposes.
   * Guaranteed to NOT return sensitive location data.
   */
  async getMetadata(
    filePath: string,
    category: CategoryName,
  ): Promise<FileMetadata> {
    try {
      if (category === "Images" || category === "Videos") {
        const image = await this.imageMetadataService.extract(filePath);
        if (image.dateTaken && !isNaN(image.dateTaken.getTime())) {
          return { date: image.dateTaken };
        }
        return {};
      }
      if (category === "Audio") {
        const audio = await this.audioMetadataService.extract(filePath);
        return {
          artist: audio.artist,
          album: audio.album,
          title: audio.title,
          year: audio.year,
        };
      }
    } catch (error) {
      logger.debug(
        `Failed to extract metadata for ${filePath}: ${(error as Error).message}`,
      );
    }
    return {};
  }

  /**
   * Get a relative subpath based on file metadata.
   * e.g. "2024/01" for images, "Artist/Album" for audio.
   * Returns empty string if no relevant metadata found.
   */
  async getMetadataSubpath(
    filePath: string,
    category: CategoryName,
  ): Promise<string> {
    const metadata = await this.getMetadata(filePath, category);
    let subpath = "";

    if (category === "Images" || category === "Videos") {
      if (metadata.date && !isNaN(metadata.date.getTime())) {
        const year = metadata.date.getFullYear().toString();
        const month = (metadata.date.getMonth() + 1)
          .toString()
          .padStart(2, "0");
        subpath = path.join(year, month);
      }
    } else if (category === "Audio") {
      const artist = sanitizeMetadataValue(metadata.artist);
      const album = sanitizeMetadataValue(metadata.album);

      if (artist) {
        subpath = album ? path.join(artist, album) : artist;
      }
    }

    // Security check: no traversal or null bytes in generated paths
    if (subpath && (subpath.includes("..") || subpath.includes("\0"))) {
      logger.warn(
        `Security: Generated subpath contains unsafe sequences: ${subpath}`,
      );
      return "";
    }

    return subpath;
  }

  /**
   * Extract detailed metadata for the inspection tool.
   */
  async extractMetadata(
    filePath: string,
    ext: string,
  ): Promise<Record<string, unknown> | null> {
    const isImage = [
      ".jpg",
      ".jpeg",
      ".png",
      ".tiff",
      ".tif",
      ".heic",
      ".heif",
    ].includes(ext);
    const isAudio = [".mp3", ".flac", ".ogg", ".wav", ".m4a", ".aac"].includes(
      ext,
    );

    if (isImage) {
      try {
        const image = await this.imageMetadataService.extract(filePath);
        const validDate =
          image.dateTaken && !isNaN(image.dateTaken.getTime())
            ? image.dateTaken
            : undefined;
        return {
          dateTaken: validDate?.toISOString(),
          camera:
            image.cameraMake && image.cameraModel
              ? `${image.cameraMake} ${image.cameraModel}`.trim()
              : undefined,
          width: image.width,
          height: image.height,
        };
      } catch (error) {
        logger.debug(
          `Image metadata extraction failed for ${filePath}: ${(error as Error).message}`,
        );
        return null;
      }
    }

    if (isAudio) {
      try {
        const audio = await this.audioMetadataService.extract(filePath);
        return {
          artist: audio.artist,
          album: audio.album,
          title: audio.title,
          year: audio.year,
          duration: audio.duration,
        };
      } catch (error) {
        logger.debug(
          `Audio metadata extraction failed for ${filePath}: ${(error as Error).message}`,
        );
        return null;
      }
    }

    return null;
  }
}

/**
 * Sanitize metadata values to be safe for file paths.
 * Replaces / \ : * ? " < > | with _
 */
function sanitizeMetadataValue(value?: string): string | undefined {
  if (!value) return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const sanitized = trimmed.replace(/[\\/:*?"<>|\x00-\x1F]/g, "_");

  // Reserved Windows device names
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(sanitized)) {
    return sanitized + "_";
  }

  return sanitized.substring(0, 100);
}
