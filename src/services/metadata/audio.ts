/**
 * Audio metadata extraction via music-metadata.
 * Replaces ~800 lines of hand-rolled ID3/FLAC/MP4 parsing.
 */

import fs from "fs/promises";
import path from "path";
import { parseFile } from "music-metadata";
import { logger } from "../../utils/logger.js";
import type {
  AudioMetadata,
  AudioMetadataOptions,
} from "./types.js";

export interface ProgressUpdate {
  processed: number;
  total: number;
  currentFile?: string;
  currentStage?: "reading" | "extracting" | "caching";
  errors: number;
  warnings: number;
}

export type ProgressCallback = (update: ProgressUpdate) => void;

function first(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export class AudioMetadataService {
  private readonly supportedFormats = [
    "mp3",
    "flac",
    "m4a",
    "aac",
    "ogg",
    "wma",
    "wav",
  ];

  getSupportedFormats(): string[] {
    return [...this.supportedFormats];
  }

  async extract(
    filePath: string,
    options: AudioMetadataOptions = {},
  ): Promise<AudioMetadata> {
    const startTime = Date.now();
    const ext = path.extname(filePath).toLowerCase().replace(".", "");

    logger.info(`Extracting metadata from: ${filePath}`);

    const empty = this.createEmptyMetadata(filePath, ext);

    try {
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
        return empty;
      }
    } catch (error) {
      logger.error(`Cannot access file: ${filePath}`, error);
      return empty;
    }

    try {
      const parsed = await parseFile(filePath, { duration: true });
      const common = parsed.common;
      const format = parsed.format;

      const result: AudioMetadata = {
        filePath,
        title: common.title,
        artist: first(common.artists) ?? common.artist,
        album: common.album,
        albumArtist: first(common.albumartist),
        composer: first(common.composer),
        genre: first(common.genre),
        year: common.year,
        trackNumber: common.track.no ?? undefined,
        totalTracks: common.track.of ?? undefined,
        discNumber: common.disk.no ?? undefined,
        totalDiscs: common.disk.of ?? undefined,
        duration: format.duration,
        bitrate: format.bitrate,
        sampleRate: format.sampleRate,
        channels: format.numberOfChannels,
        format: ext.toUpperCase(),
        hasEmbeddedArtwork: (common.picture?.length ?? 0) > 0,
        extractedAt: new Date(),
      };

      const duration = Date.now() - startTime;
      logger.info(`Metadata extracted in ${duration}ms: ${filePath}`);

      return result;
    } catch (error) {
      logger.error(`Error extracting metadata from ${filePath}:`, error);
      return empty;
    }
  }

  /**
   * Extract metadata from multiple files with bounded concurrency.
   */
  async extractBatch(
    filePaths: string[],
    options: AudioMetadataOptions = {},
  ): Promise<AudioMetadata[]> {
    const { concurrency = 4, onProgress } = options;
    logger.info(
      `Batch extracting metadata for ${filePaths.length} files with concurrency ${concurrency}`,
    );

    const results: AudioMetadata[] = [];
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
            currentStage: "extracting",
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
          return this.createEmptyMetadata(
            filePath,
            path.extname(filePath).toLowerCase().replace(".", ""),
          );
        }
      });

      results.push(...(await Promise.all(batchPromises)));
    }

    logger.info(`Batch extraction complete: ${results.length} files processed`);
    return results;
  }

  /**
   * Check if an audio file has embedded metadata.
   * Path is validated upstream by PathValidatorService before being passed to this service.
   */
  async hasMetadata(filePath: string): Promise<boolean> {
    try {
      const parsed = await parseFile(filePath);
      return Object.keys(parsed.common).length > 0 || !!parsed.format.container;
    } catch {
      return false;
    }
  }

  private createEmptyMetadata(filePath: string, ext: string): AudioMetadata {
    return {
      filePath,
      format: ext.toUpperCase(),
      hasEmbeddedArtwork: false,
      extractedAt: new Date(),
    };
  }
}

export default AudioMetadataService;
