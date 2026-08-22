/**
 * Shared metadata types for the metadata module.
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

export interface AudioMetadataOptions {
  extractArtwork?: boolean;
  extractLyrics?: boolean;
  cacheResults?: boolean;
  concurrency?: number;
  onProgress?: (update: {
    processed: number;
    total: number;
    currentFile?: string;
    currentStage?: "reading" | "extracting" | "caching";
    errors: number;
    warnings: number;
  }) => void;
}

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

export interface ImageMetadataOptions {
  extractGPS?: boolean;
  stripGPS?: boolean;
  extractThumbnail?: boolean;
  concurrency?: number;
  useFileDate?: boolean;
  onProgress?: (update: {
    processed: number;
    total: number;
    currentFile?: string;
    currentStage?: "reading" | "parsing" | "stripping";
    errors: number;
    warnings: number;
  }) => void;
}
