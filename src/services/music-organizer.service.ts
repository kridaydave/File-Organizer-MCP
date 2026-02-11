/**
 * File Organizer MCP Server v3.2.0
 * Music Organizer Service
 *
 * Organizes audio files into structured folders based on metadata.
 * Supports Artist/Album organization with graceful handling of missing metadata.
 */

import fs from "fs/promises";
import path from "path";
import { AudioMetadataService } from "./audio-metadata.service.js";
import { PathValidatorService } from "./path-validator.service.js";
import { logger } from "../utils/logger.js";

/**
 * Audio metadata structure for music organization
 * (Mirrors the structure from audio-metadata.service.ts)
 */
export interface AudioMetadata {
  filePath: string;
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  composer?: string;
  genre?: string;
  year?: number;
  trackNumber?: number;
  totalTracks?: number;
  discNumber?: number;
  totalDiscs?: number;
  duration?: number;
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
  format: string;
  hasEmbeddedArtwork: boolean;
  extractedAt: Date;
}

/**
 * Configuration for music organization
 */
export interface MusicOrganizationConfig {
  sourceDir: string;
  targetDir: string;
  structure: "artist/album" | "album" | "genre/artist" | "flat";
  filenamePattern: "{track} - {title}" | "{artist} - {title}" | "{title}";
  copyInsteadOfMove?: boolean;
  skipIfMissingMetadata?: boolean;
  variousArtistsAlbumName?: string;
}

/**
 * Result of music organization operation
 */
export interface MusicOrganizationResult {
  success: boolean;
  organizedFiles: number;
  skippedFiles: number;
  errors: Array<{ file: string; error: string }>;
  structure: Record<string, string[]>;
}

/**
 * Internal tracking of planned operations
 */
interface PlannedOperation {
  sourcePath: string;
  destinationPath: string;
  metadata: AudioMetadata;
  skipped?: boolean;
}

/**
 * Music Organizer Service
 * Handles organization of audio files into structured directories
 */
export class MusicOrganizerService {
  private audioMetadataService: AudioMetadataService;
  private pathValidator: PathValidatorService;
  private readonly defaultVariousArtistsName = "Various Artists";
  private readonly defaultUnknownArtist = "Unknown Artist";
  private readonly defaultUnknownAlbum = "Unknown Album";

  constructor(
    audioMetadataService?: AudioMetadataService,
    pathValidator?: PathValidatorService,
  ) {
    this.audioMetadataService =
      audioMetadataService ?? new AudioMetadataService();
    this.pathValidator = pathValidator ?? new PathValidatorService();
  }

  /**
   * Organize music files according to configuration
   */
  async organize(
    config: MusicOrganizationConfig,
  ): Promise<MusicOrganizationResult> {
    logger.info("Starting music organization", {
      sourceDir: config.sourceDir,
      targetDir: config.targetDir,
      structure: config.structure,
    });

    try {
      // Validate paths
      await this.validateConfig(config);

      // Scan for audio files
      const audioFiles = await this.scanForAudioFiles(config.sourceDir);
      logger.info(`Found ${audioFiles.length} audio files to organize`);

      // Plan organization
      const operations = await this.planOrganization(audioFiles, config);

      // Execute operations
      const result = await this.executeOperations(operations, config, false);

      logger.info("Music organization completed", {
        organized: result.organizedFiles,
        skipped: result.skippedFiles,
        errors: result.errors.length,
      });

      return result;
    } catch (error) {
      logger.error("Music organization failed", error);
      return {
        success: false,
        organizedFiles: 0,
        skippedFiles: 0,
        errors: [
          {
            file: config.sourceDir,
            error: error instanceof Error ? error.message : "Unknown error",
          },
        ],
        structure: {},
      };
    }
  }

  /**
   * Preview organization without actually moving files (dry run)
   */
  async previewOrganization(
    config: MusicOrganizationConfig,
  ): Promise<MusicOrganizationResult> {
    logger.info("Starting music organization preview (dry run)", {
      sourceDir: config.sourceDir,
      targetDir: config.targetDir,
    });

    try {
      await this.validateConfig(config);
      const audioFiles = await this.scanForAudioFiles(config.sourceDir);
      const operations = await this.planOrganization(audioFiles, config);
      const result = await this.executeOperations(operations, config, true);

      logger.info("Music organization preview completed", {
        organized: result.organizedFiles,
        skipped: result.skippedFiles,
      });

      return result;
    } catch (error) {
      logger.error("Music organization preview failed", error);
      return {
        success: false,
        organizedFiles: 0,
        skippedFiles: 0,
        errors: [
          {
            file: config.sourceDir,
            error: error instanceof Error ? error.message : "Unknown error",
          },
        ],
        structure: {},
      };
    }
  }

  /**
   * Sanitize filename by removing invalid characters
   */
  sanitizeFilename(filename: string): string {
    // Remove or replace invalid filename characters
    // Order matters: first replace > and < with nothing, then other chars with _
    let sanitized = filename
      .replace(/[>]/g, "") // Remove > first
      .replace(/[<]/g, "_") // Replace < with _
      .replace(/[\/\\:*?"<>|]/g, "_") // Replace rest with _
      .replace(/[\x00-\x1F]/g, "") // Remove control characters
      .trim();

    // Prevent Windows reserved names
    const nameWithoutExt = sanitized.split(".")[0] ?? "";
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(nameWithoutExt)) {
      // Add underscore BEFORE the extension if there is one
      const extIndex = sanitized.lastIndexOf(".");
      if (extIndex > 0) {
        return (
          sanitized.substring(0, extIndex) + "_" + sanitized.substring(extIndex)
        );
      }
      return sanitized + "_";
    }

    // Limit length to avoid path issues
    return sanitized.substring(0, 200);
  }

  /**
   * Calculate destination path based on metadata and config
   */
  getDestinationPath(
    metadata: AudioMetadata,
    config: MusicOrganizationConfig,
  ): string {
    const artist = this.getArtistName(metadata, config);
    const album = this.getAlbumName(metadata, config);
    const filename = this.generateFilename(metadata, config);

    let destDir: string;

    switch (config.structure) {
      case "artist/album":
        destDir = path.join(config.targetDir, artist, album);
        break;
      case "album":
        destDir = path.join(config.targetDir, album);
        break;
      case "genre/artist":
        const genre = metadata.genre?.trim() || "Unknown Genre";
        const sanitizedGenre = this.sanitizeFilename(genre);
        destDir = path.join(config.targetDir, sanitizedGenre, artist);
        break;
      case "flat":
        destDir = config.targetDir;
        break;
      default:
        destDir = path.join(config.targetDir, artist, album);
    }

    return path.join(destDir, filename);
  }

  /**
   * Validate configuration
   */
  private async validateConfig(config: MusicOrganizationConfig): Promise<void> {
    // Validate source directory exists
    const validatedSource = await this.pathValidator.validatePath(
      config.sourceDir,
      {
        requireExists: true,
      },
    );

    // Validate target directory (create if needed)
    const validatedTarget = await this.pathValidator.validatePath(
      config.targetDir,
      {
        requireExists: false,
        checkWrite: true,
      },
    );

    // Ensure source and target are different
    if (path.resolve(validatedSource) === path.resolve(validatedTarget)) {
      throw new Error("Source and target directories must be different");
    }

    // Ensure source is not a parent of target or vice versa
    if (this.isPathInside(validatedSource, validatedTarget)) {
      throw new Error("Target directory cannot be inside source directory");
    }
    if (this.isPathInside(validatedTarget, validatedSource)) {
      throw new Error("Source directory cannot be inside target directory");
    }

    // Validate structure option
    const validStructures: MusicOrganizationConfig["structure"][] = [
      "artist/album",
      "album",
      "genre/artist",
      "flat",
    ];
    if (!validStructures.includes(config.structure)) {
      throw new Error(`Invalid structure: ${config.structure}`);
    }

    // Validate filename pattern
    const validPatterns: MusicOrganizationConfig["filenamePattern"][] = [
      "{track} - {title}",
      "{artist} - {title}",
      "{title}",
    ];
    if (!validPatterns.includes(config.filenamePattern)) {
      throw new Error(`Invalid filename pattern: ${config.filenamePattern}`);
    }
  }

  /**
   * Check if a path is inside another path
   */
  private isPathInside(parent: string, child: string): boolean {
    const relative = path.relative(parent, child);
    return (
      Boolean(relative) &&
      !relative.startsWith("..") &&
      !path.isAbsolute(relative)
    );
  }

  /**
   * Scan directory for audio files
   */
  private async scanForAudioFiles(dir: string): Promise<string[]> {
    const audioExtensions = new Set([
      ".mp3",
      ".flac",
      ".ogg",
      ".wav",
      ".m4a",
      ".aac",
      ".wma",
      ".opus",
    ]);
    const files: string[] = [];

    async function scan(currentDir: string): Promise<void> {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (audioExtensions.has(ext)) {
            files.push(fullPath);
          }
        }
      }
    }

    await scan(dir);
    return files;
  }

  /**
   * Plan organization operations for all files
   */
  private async planOrganization(
    files: string[],
    config: MusicOrganizationConfig,
  ): Promise<PlannedOperation[]> {
    const operations: PlannedOperation[] = [];

    for (const filePath of files) {
      try {
        const metadata = await this.audioMetadataService.extract(filePath);

        // Check if we should skip files with missing metadata
        if (config.skipIfMissingMetadata && this.isMetadataMissing(metadata)) {
          logger.debug(`Skipping file due to missing metadata: ${filePath}`);
          operations.push({
            sourcePath: filePath,
            destinationPath: "",
            metadata,
            skipped: true,
          });
          continue;
        }

        const destinationPath = this.getDestinationPath(metadata, config);
        operations.push({
          sourcePath: filePath,
          destinationPath,
          metadata,
        });
      } catch (error) {
        logger.warn(`Failed to extract metadata for ${filePath}`, {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return operations;
  }

  /**
   * Check if metadata is essentially missing
   */
  private isMetadataMissing(metadata: AudioMetadata): boolean {
    return !metadata.artist && !metadata.album && !metadata.title;
  }

  /**
   * Execute planned operations
   */
  private async executeOperations(
    operations: PlannedOperation[],
    config: MusicOrganizationConfig,
    dryRun: boolean,
  ): Promise<MusicOrganizationResult> {
    const result: MusicOrganizationResult = {
      success: true,
      organizedFiles: 0,
      skippedFiles: 0,
      errors: [],
      structure: {},
    };

    // Track used paths for collision detection
    const usedPaths = new Set<string>();

    for (const operation of operations) {
      try {
        // Check if this operation was skipped due to missing metadata
        if (operation.skipped) {
          result.skippedFiles++;
          logger.debug(`Skipped: ${operation.sourcePath}`);
          continue;
        }

        // Resolve any file collisions
        const finalDestination = this.resolveCollision(
          operation.destinationPath,
          usedPaths,
        );

        // Track the path
        usedPaths.add(finalDestination);

        // Build structure mapping
        this.updateStructureMapping(
          result.structure,
          operation.metadata,
          config,
        );

        if (!dryRun) {
          // Create destination directory
          const destDir = path.dirname(finalDestination);
          await fs.mkdir(destDir, { recursive: true });

          // Perform the operation
          if (config.copyInsteadOfMove) {
            await fs.copyFile(operation.sourcePath, finalDestination);
            logger.debug(
              `Copied: ${operation.sourcePath} -> ${finalDestination}`,
            );
          } else {
            await fs.rename(operation.sourcePath, finalDestination);
            logger.debug(
              `Moved: ${operation.sourcePath} -> ${finalDestination}`,
            );
          }
        }

        result.organizedFiles++;
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        result.errors.push({
          file: operation.sourcePath,
          error: errorMsg,
        });
        logger.error(`Failed to organize file: ${operation.sourcePath}`, error);
      }
    }

    result.success = result.errors.length === 0;
    return result;
  }

  /**
   * Resolve file path collisions by appending (1), (2), etc.
   */
  private resolveCollision(
    destinationPath: string,
    usedPaths: Set<string>,
  ): string {
    if (!usedPaths.has(destinationPath)) {
      return destinationPath;
    }

    const ext = path.extname(destinationPath);
    const baseName = destinationPath.slice(0, -ext.length);
    let counter = 1;

    while (true) {
      const newPath = `${baseName} (${counter})${ext}`;
      if (!usedPaths.has(newPath)) {
        return newPath;
      }
      counter++;

      // Safety limit
      if (counter > 999) {
        throw new Error(`Too many file collisions for: ${destinationPath}`);
      }
    }
  }

  /**
   * Update the structure mapping for result
   */
  private updateStructureMapping(
    structure: Record<string, string[]>,
    metadata: AudioMetadata,
    config: MusicOrganizationConfig,
  ): void {
    const artist = metadata.artist?.trim() || this.defaultUnknownArtist;
    const sanitizedArtist = this.sanitizeFilename(artist);

    const album = metadata.album?.trim() || this.defaultUnknownAlbum;
    const sanitizedAlbum = this.sanitizeFilename(album);

    if (!structure[sanitizedArtist]) {
      structure[sanitizedArtist] = [];
    }

    // Store album name for artist/album structure
    if (!structure[sanitizedArtist].includes(sanitizedAlbum)) {
      structure[sanitizedArtist].push(sanitizedAlbum);
    }
  }

  /**
   * Get artist name with fallbacks
   */
  private getArtistName(
    metadata: AudioMetadata,
    config: MusicOrganizationConfig,
  ): string {
    // Prefer albumArtist over artist for organization
    const albumArtist = metadata.albumArtist?.trim();
    const artist = metadata.artist?.trim();

    if (albumArtist) {
      return this.sanitizeFilename(albumArtist);
    }
    if (artist) {
      return this.sanitizeFilename(artist);
    }
    return this.defaultUnknownArtist;
  }

  /**
   * Get album name with fallbacks
   */
  private getAlbumName(
    metadata: AudioMetadata,
    config: MusicOrganizationConfig,
  ): string {
    const album = metadata.album?.trim();
    if (album) {
      // Check for various artists indicator
      const variousArtistsName =
        config.variousArtistsAlbumName || this.defaultVariousArtistsName;
      // If album artist indicates compilation or no artist but album exists
      if (this.isVariousArtists(metadata)) {
        return this.sanitizeFilename(variousArtistsName);
      }
      return this.sanitizeFilename(album);
    }
    return this.defaultUnknownAlbum;
  }

  /**
   * Check if this is a various artists compilation
   */
  private isVariousArtists(metadata: AudioMetadata): boolean {
    if (!metadata.artist) {
      // If no artist specified but album exists, might be compilation
      return false;
    }

    const artistLower = metadata.artist.toLowerCase();
    const variousIndicators = [
      "various",
      "various artists",
      "compilation",
      "va",
      "v.a.",
      "mixed",
      "soundtrack",
    ];

    return variousIndicators.some((indicator) =>
      artistLower.includes(indicator),
    );
  }

  /**
   * Generate filename based on pattern
   */
  private generateFilename(
    metadata: AudioMetadata,
    config: MusicOrganizationConfig,
  ): string {
    const title = metadata.title?.trim() || "Unknown Title";
    const artist = metadata.artist?.trim() || this.defaultUnknownArtist;
    const track = metadata.trackNumber;

    let filename: string;

    switch (config.filenamePattern) {
      case "{track} - {title}":
        if (track && track > 0) {
          const trackStr = track.toString().padStart(2, "0");
          filename = `${trackStr} - ${title}`;
        } else {
          filename = title;
        }
        break;

      case "{artist} - {title}":
        filename = `${artist} - ${title}`;
        break;

      case "{title}":
      default:
        filename = title;
        break;
    }

    // Get file extension from original file path
    const ext =
      path.extname(metadata.filePath) || `.${metadata.format.toLowerCase()}`;

    return this.sanitizeFilename(filename) + ext;
  }
}
