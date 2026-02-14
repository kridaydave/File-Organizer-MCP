import * as fs from "fs/promises";
import * as path from "path";
import { logger } from "../utils/logger.js";

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

export interface ProgressUpdate {
  processed: number;
  total: number;
  currentFile?: string;
  currentStage?: "reading" | "extracting" | "caching";
  errors: number;
  warnings: number;
}

export type ProgressCallback = (update: ProgressUpdate) => void;

export interface AudioMetadataOptions {
  extractArtwork?: boolean;
  extractLyrics?: boolean;
  cacheResults?: boolean;
  concurrency?: number;
  onProgress?: ProgressCallback;
}

interface ID3Frame {
  id: string;
  data: Buffer;
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

    try {
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
        throw new Error(`Path is not a file: ${filePath}`);
      }
    } catch (error) {
      logger.error(`Cannot access file: ${filePath}`, error);
      return this.createEmptyMetadata(filePath, ext);
    }

    try {
      let metadata: Partial<AudioMetadata>;

      switch (ext) {
        case "mp3":
          metadata = await this.parseMP3(filePath);
          break;
        case "flac":
          metadata = await this.parseFLAC(filePath);
          break;
        case "m4a":
        case "aac":
          metadata = await this.parseM4A(filePath);
          break;
        case "ogg":
          metadata = await this.parseOGG(filePath);
          break;
        case "wma":
        case "wav":
          metadata = await this.parseGeneric(filePath, ext);
          break;
        default:
          logger.warn(`Unsupported format: ${ext}`);
          metadata = {};
      }

      const result: AudioMetadata = {
        filePath,
        format: ext.toUpperCase(),
        hasEmbeddedArtwork: metadata.hasEmbeddedArtwork ?? false,
        extractedAt: new Date(),
        ...metadata,
      };

      const duration = Date.now() - startTime;
      logger.info(`Metadata extracted in ${duration}ms: ${filePath}`);

      return result;
    } catch (error) {
      logger.error(`Error extracting metadata from ${filePath}:`, error);
      return this.createEmptyMetadata(filePath, ext);
    }
  }

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
          logger.error(`Failed to extract metadata from ${filePath}:`, error);
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

          return this.createEmptyMetadata(
            filePath,
            path.extname(filePath).toLowerCase().replace(".", ""),
          );
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
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
      const ext = path.extname(filePath).toLowerCase().replace(".", "");

      if (!this.supportedFormats.includes(ext)) {
        return false;
      }

      const buffer = await fs.readFile(filePath);

      switch (ext) {
        case "mp3":
          return (
            buffer.toString("ascii", 0, 3) === "ID3" || this.hasID3v1(buffer)
          );
        case "flac":
          return buffer.toString("ascii", 0, 4) === "fLaC";
        case "m4a":
        case "aac":
          return buffer.toString("ascii", 4, 8) === "ftyp";
        case "ogg":
          return buffer.toString("ascii", 0, 4) === "OggS";
        default:
          return false;
      }
    } catch (error) {
      logger.warn(
        `Error checking metadata for ${filePath}:`,
        error instanceof Error ? error : undefined,
      );
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

  /**
   * Parse MP3 file metadata.
   * Path is validated upstream by PathValidatorService before being passed to this service.
   */
  private async parseMP3(filePath: string): Promise<Partial<AudioMetadata>> {
    const buffer = await fs.readFile(filePath);
    const metadata: Partial<AudioMetadata> = {};

    // Check for ID3v2 header
    if (buffer.toString("ascii", 0, 3) === "ID3") {
      const version: number = buffer[3]!;
      const revision: number = buffer[4]!;
      const flags: number = buffer[5]!;

      // Calculate tag size (synchsafe integer for ID3v2.4, regular for ID3v2.2/2.3)
      const size: number =
        version >= 4
          ? ((buffer[6]! & 0x7f) << 21) |
            ((buffer[7]! & 0x7f) << 14) |
            ((buffer[8]! & 0x7f) << 7) |
            (buffer[9]! & 0x7f)
          : buffer.readUInt32BE(6);

      let offset = 10;
      const extendedHeader = (flags & 0x40) !== 0;

      if (extendedHeader) {
        const extSize = buffer.readUInt32BE(offset);
        offset += extSize + 4;
      }

      const endOfTags = 10 + size;

      while (offset < endOfTags - 10) {
        const frameId = buffer.toString("ascii", offset, offset + 4);
        const frameSize: number =
          version >= 4
            ? ((buffer[offset + 4]! & 0x7f) << 21) |
              ((buffer[offset + 5]! & 0x7f) << 14) |
              ((buffer[offset + 6]! & 0x7f) << 7) |
              (buffer[offset + 7]! & 0x7f)
            : buffer.readUInt32BE(offset + 4);

        if (frameId === "\x00\x00\x00\x00") break;

        // Check for APIC frame (embedded artwork)
        if (frameId === "APIC") {
          metadata.hasEmbeddedArtwork = true;
        }

        const frameData = buffer.subarray(offset + 10, offset + 10 + frameSize);
        this.parseID3Frame(frameId, frameData, metadata);

        offset += 10 + frameSize;
      }
    }

    // Check for ID3v1 at end of file
    if (buffer.length >= 128) {
      const id3v1Offset = buffer.length - 128;
      if (buffer.toString("ascii", id3v1Offset, id3v1Offset + 3) === "TAG") {
        if (!metadata.title)
          metadata.title = this.cleanString(
            buffer.toString("latin1", id3v1Offset + 3, id3v1Offset + 33),
          );
        if (!metadata.artist)
          metadata.artist = this.cleanString(
            buffer.toString("latin1", id3v1Offset + 33, id3v1Offset + 63),
          );
        if (!metadata.album)
          metadata.album = this.cleanString(
            buffer.toString("latin1", id3v1Offset + 63, id3v1Offset + 93),
          );
        if (!metadata.year) {
          const yearStr = buffer
            .toString("latin1", id3v1Offset + 93, id3v1Offset + 97)
            .trim();
          if (yearStr) metadata.year = parseInt(yearStr, 10);
        }
        if (!metadata.genre) {
          const genreByte: number = buffer[id3v1Offset + 127]!;
          metadata.genre = this.getGenreName(genreByte);
        }
      }
    }

    return metadata;
  }

  private parseID3Frame(
    frameId: string,
    data: Buffer,
    metadata: Partial<AudioMetadata>,
  ): void {
    if (data.length < 1) return;

    const encoding = data[0];
    let text: string;

    try {
      switch (encoding) {
        case 0: // ISO-8859-1
          text = data.toString("latin1", 1).replace(/\x00/g, "");
          break;
        case 1: // UTF-16 with BOM
          text = this.decodeUTF16(data.subarray(1));
          break;
        case 2: // UTF-16BE without BOM
          text = data.toString("utf16le", 1).replace(/\x00/g, "");
          break;
        case 3: // UTF-8
          text = data.toString("utf8", 1).replace(/\x00/g, "");
          break;
        default:
          text = data.toString("utf8", 1).replace(/\x00/g, "");
      }
    } catch {
      text = data.toString("utf8", 1).replace(/\x00/g, "");
    }

    const cleanText = this.cleanString(text);
    if (!cleanText) return;

    switch (frameId) {
      case "TIT2":
        metadata.title = cleanText;
        break;
      case "TPE1":
        metadata.artist = cleanText;
        break;
      case "TALB":
        metadata.album = cleanText;
        break;
      case "TPE2":
        metadata.albumArtist = cleanText;
        break;
      case "TCOM":
        metadata.composer = cleanText;
        break;
      case "TCON":
        metadata.genre = cleanText.replace(/^\(\d+\)$/, "");
        break;
      case "TYER":
      case "TDRC":
        const year = parseInt(cleanText.substring(0, 4), 10);
        if (!isNaN(year)) metadata.year = year;
        break;
      case "TRCK":
        const trackMatch = cleanText.match(/(\d+)(?:\/(\d+))?/);
        if (trackMatch) {
          metadata.trackNumber = parseInt(trackMatch[1]!, 10);
          if (trackMatch[2]) metadata.totalTracks = parseInt(trackMatch[2], 10);
        }
        break;
      case "TPOS":
        const discMatch = cleanText.match(/(\d+)(?:\/(\d+))?/);
        if (discMatch) {
          metadata.discNumber = parseInt(discMatch[1]!, 10);
          if (discMatch[2]) metadata.totalDiscs = parseInt(discMatch[2], 10);
        }
        break;
      case "APIC":
        metadata.hasEmbeddedArtwork = true;
        break;
    }
  }

  private decodeUTF16(buffer: Buffer): string {
    if (buffer.length < 2) return "";

    // Check BOM
    const bom = buffer.readUInt16BE(0);
    const isBigEndian = bom === 0xfeff;

    if (bom === 0xfeff || bom === 0xfffe) {
      buffer = buffer.subarray(2);
    }

    if (isBigEndian) {
      // Swap bytes for big-endian
      const swapped = Buffer.alloc(buffer.length);
      for (let i = 0; i < buffer.length; i += 2) {
        swapped[i] = buffer[i + 1]!;
        swapped[i + 1] = buffer[i]!;
      }
      return swapped.toString("utf16le").replace(/\x00/g, "");
    }

    return buffer.toString("utf16le").replace(/\x00/g, "");
  }

  private hasEmbeddedArtworkInID3(
    buffer: Buffer,
    startOffset: number,
    endOffset: number,
  ): boolean {
    let offset = startOffset;
    while (offset < endOffset - 10) {
      const frameId = buffer.toString("ascii", offset, offset + 4);
      if (frameId === "APIC") return true;
      if (frameId === "\x00\x00\x00\x00") break;

      const frameSize: number =
        ((buffer[offset + 4]! & 0x7f) << 21) |
        ((buffer[offset + 5]! & 0x7f) << 14) |
        ((buffer[offset + 6]! & 0x7f) << 7) |
        (buffer[offset + 7]! & 0x7f);
      offset += 10 + frameSize;
    }
    return false;
  }

  private hasID3v1(buffer: Buffer): boolean {
    return (
      buffer.length >= 128 &&
      buffer.toString("ascii", buffer.length - 128, buffer.length - 125) ===
        "TAG"
    );
  }

  /**
   * Parse FLAC file metadata.
   * Path is validated upstream by PathValidatorService before being passed to this service.
   */
  private async parseFLAC(filePath: string): Promise<Partial<AudioMetadata>> {
    const buffer = await fs.readFile(filePath);
    const metadata: Partial<AudioMetadata> = {};

    if (buffer.toString("ascii", 0, 4) !== "fLaC") {
      logger.warn(`Invalid FLAC file: ${filePath}`);
      return metadata;
    }

    let offset = 4;
    let isLastBlock = false;

    while (!isLastBlock && offset < buffer.length) {
      const blockHeader: number = buffer[offset]!;
      isLastBlock = (blockHeader & 0x80) !== 0;
      const blockType = blockHeader & 0x7f;
      const blockSize = buffer.readUIntBE(offset + 1, 3);
      const blockData = buffer.subarray(offset + 4, offset + 4 + blockSize);

      switch (blockType) {
        case 4: // VORBIS_COMMENT
          this.parseVorbisComments(blockData, metadata);
          break;
        case 6: // PICTURE (embedded artwork)
          metadata.hasEmbeddedArtwork = true;
          break;
        case 0: // STREAMINFO
          if (blockData.length >= 34) {
            // Sample rate is 20 bits starting at bit 80 (byte 10, bit 0)
            const sampleRateChannelBits = blockData.readUInt32BE(10);
            metadata.sampleRate = (sampleRateChannelBits >> 12) & 0xfffff;
            metadata.channels = ((sampleRateChannelBits >> 4) & 0x07) + 1;

            // Total samples is 36 bits spanning bytes 13-17
            // Upper 4 bits are in byte 13 (lower nibble), lower 32 bits in bytes 14-17
            const totalSamplesHigh = blockData[13]! & 0x0f;
            const totalSamplesLow = blockData.readUInt32BE(14);
            const totalSamples =
              totalSamplesHigh * Math.pow(2, 32) + totalSamplesLow;

            // Calculate duration only if we have valid values
            if (metadata.sampleRate > 0 && totalSamples > 0) {
              metadata.duration = totalSamples / metadata.sampleRate;
            }
          }
          break;
      }

      offset += 4 + blockSize;
    }

    return metadata;
  }

  private parseVorbisComments(
    data: Buffer,
    metadata: Partial<AudioMetadata>,
  ): void {
    let offset = 0;

    // Vendor string length (little-endian uint32)
    if (offset + 4 > data.length) return;
    const vendorLength = data.readUInt32LE(offset);
    offset += 4;

    // Validate vendor string fits within buffer
    if (offset + vendorLength > data.length) return;
    offset += vendorLength;

    // User comment list length (little-endian uint32)
    if (offset + 4 > data.length) return;
    const commentCount = data.readUInt32LE(offset);
    offset += 4;

    // Parse comments - also continue parsing if there's more data
    // (some files have incorrect comment counts)
    let i = 0;
    while (
      (i < commentCount || offset < data.length) &&
      offset + 4 <= data.length
    ) {
      const commentLength = data.readUInt32LE(offset);
      offset += 4;

      if (offset + commentLength > data.length) break;

      const comment = data.toString("utf8", offset, offset + commentLength);
      offset += commentLength;

      const separatorIndex = comment.indexOf("=");
      if (separatorIndex === -1) {
        i++;
        continue;
      }

      const field = comment.substring(0, separatorIndex).toUpperCase();
      const value = comment.substring(separatorIndex + 1);

      switch (field) {
        case "TITLE":
          metadata.title = value;
          break;
        case "ARTIST":
          metadata.artist = value;
          break;
        case "ALBUM":
          metadata.album = value;
          break;
        case "ALBUMARTIST":
          metadata.albumArtist = value;
          break;
        case "COMPOSER":
          metadata.composer = value;
          break;
        case "GENRE":
          metadata.genre = value;
          break;
        case "DATE":
        case "YEAR":
          const year = parseInt(value.substring(0, 4), 10);
          if (!isNaN(year)) metadata.year = year;
          break;
        case "TRACKNUMBER":
          const trackMatch = value.match(/(\d+)(?:\/(\d+))?/);
          if (trackMatch) {
            metadata.trackNumber = parseInt(trackMatch[1]!, 10);
            if (trackMatch[2])
              metadata.totalTracks = parseInt(trackMatch[2], 10);
          }
          break;
        case "DISCNUMBER":
          const discMatch = value.match(/(\d+)(?:\/(\d+))?/);
          if (discMatch) {
            metadata.discNumber = parseInt(discMatch[1]!, 10);
            if (discMatch[2]) metadata.totalDiscs = parseInt(discMatch[2], 10);
          }
          break;
      }
      i++;
    }
  }

  /**
   * Parse M4A/AAC file metadata.
   * Path is validated upstream by PathValidatorService before being passed to this service.
   */
  private async parseM4A(filePath: string): Promise<Partial<AudioMetadata>> {
    const buffer = await fs.readFile(filePath);
    const metadata: Partial<AudioMetadata> = {};

    // MP4 container structure
    let offset = 0;
    while (offset < buffer.length - 8) {
      const size = buffer.readUInt32BE(offset);
      const type = buffer.toString("ascii", offset + 4, offset + 8);

      if (size === 0 || size > buffer.length - offset) break;

      if (
        type === "moov" ||
        type === "udta" ||
        type === "meta" ||
        type === "ilst"
      ) {
        // Parse container contents
        const containerData = buffer.subarray(
          offset + (type === "meta" ? 12 : 8),
          offset + size,
        );
        this.parseMP4Container(containerData, metadata);
      }

      offset += size;
    }

    return metadata;
  }

  private parseMP4Container(
    data: Buffer,
    metadata: Partial<AudioMetadata>,
  ): void {
    let offset = 0;

    while (offset < data.length - 8) {
      const size = data.readUInt32BE(offset);
      const type = data.toString("ascii", offset + 4, offset + 8);

      if (size === 0 || size > data.length - offset) break;

      const atomData = data.subarray(offset + 8, offset + size);

      // Map MP4 atom types to metadata fields
      switch (type) {
        case "\xa9nam": // Title
          metadata.title = this.parseMP4String(atomData);
          break;
        case "\xa9ART": // Artist
          metadata.artist = this.parseMP4String(atomData);
          break;
        case "\xa9alb": // Album
          metadata.album = this.parseMP4String(atomData);
          break;
        case "aART": // Album Artist
          metadata.albumArtist = this.parseMP4String(atomData);
          break;
        case "\xa9wrt": // Composer
          metadata.composer = this.parseMP4String(atomData);
          break;
        case "\xa9gen": // Genre
          metadata.genre = this.parseMP4String(atomData);
          break;
        case "\xa9day": // Year
          const yearStr = this.parseMP4String(atomData);
          const year = parseInt(yearStr?.substring(0, 4) || "", 10);
          if (!isNaN(year)) metadata.year = year;
          break;
        case "trkn": // Track number
          const trackData = this.parseMP4Binary(atomData);
          if (trackData && trackData.length >= 8) {
            metadata.trackNumber = trackData.readUInt16BE(2);
            metadata.totalTracks = trackData.readUInt16BE(4);
          }
          break;
        case "disk": // Disc number
          const discData = this.parseMP4Binary(atomData);
          if (discData && discData.length >= 8) {
            metadata.discNumber = discData.readUInt16BE(2);
            metadata.totalDiscs = discData.readUInt16BE(4);
          }
          break;
        case "covr": // Artwork
          metadata.hasEmbeddedArtwork = true;
          break;
      }

      offset += size;
    }
  }

  private parseMP4String(data: Buffer): string | undefined {
    let offset = 0;
    while (offset < data.length - 8) {
      const size = data.readUInt32BE(offset);
      const type = data.toString("ascii", offset + 4, offset + 8);

      if (type === "data" && size > 16) {
        const value = data.toString("utf8", offset + 16, offset + size);
        return this.cleanString(value);
      }
      offset += size;
    }
    return undefined;
  }

  private parseMP4Binary(data: Buffer): Buffer | undefined {
    let offset = 0;
    while (offset < data.length - 8) {
      const size = data.readUInt32BE(offset);
      const type = data.toString("ascii", offset + 4, offset + 8);

      if (type === "data" && size > 16) {
        return data.subarray(offset + 16, offset + size);
      }
      offset += size;
    }
    return undefined;
  }

  private async parseOGG(filePath: string): Promise<Partial<AudioMetadata>> {
    // OGG uses Vorbis comments similar to FLAC
    // Simplified implementation - in production, would parse OGG page structure
    logger.warn(`OGG parsing not fully implemented: ${filePath}`);
    return {};
  }

  private async parseGeneric(
    filePath: string,
    ext: string,
  ): Promise<Partial<AudioMetadata>> {
    logger.warn(`Generic parsing for ${ext} not implemented: ${filePath}`);
    return {};
  }

  private cleanString(str: string): string {
    return str.replace(/\x00/g, "").trim();
  }

  private getGenreName(byte: number): string | undefined {
    const genres: Record<number, string> = {
      0: "Blues",
      1: "Classic Rock",
      2: "Country",
      3: "Dance",
      4: "Disco",
      5: "Funk",
      6: "Grunge",
      7: "Hip-Hop",
      8: "Jazz",
      9: "Metal",
      10: "New Age",
      11: "Oldies",
      12: "Other",
      13: "Pop",
      14: "R&B",
      15: "Rap",
      16: "Reggae",
      17: "Rock",
      18: "Techno",
      19: "Industrial",
      20: "Alternative",
      21: "Ska",
      22: "Death Metal",
      23: "Pranks",
      24: "Soundtrack",
      25: "Euro-Techno",
      26: "Ambient",
      27: "Trip-Hop",
      28: "Vocal",
      29: "Jazz+Funk",
      30: "Fusion",
      31: "Trance",
      32: "Classical",
      33: "Instrumental",
      34: "Acid",
      35: "House",
      36: "Game",
      37: "Sound Clip",
      38: "Gospel",
      39: "Noise",
      40: "Alt. Rock",
      41: "Bass",
      42: "Soul",
      43: "Punk",
      44: "Space",
      45: "Meditative",
      46: "Instrumental Pop",
      47: "Instrumental Rock",
      48: "Ethnic",
      49: "Gothic",
      50: "Darkwave",
      51: "Techno-Industrial",
      52: "Electronic",
      53: "Pop-Folk",
      54: "Eurodance",
      55: "Dream",
      56: "Southern Rock",
      57: "Comedy",
      58: "Cult",
      59: "Gangsta Rap",
      60: "Top 40",
      61: "Christian Rap",
      62: "Pop/Funk",
      63: "Jungle",
      64: "Native American",
      65: "Cabaret",
      66: "New Wave",
      67: "Psychedelic",
      68: "Rave",
      69: "Showtunes",
      70: "Trailer",
      71: "Lo-Fi",
      72: "Tribal",
      73: "Acid Punk",
      74: "Acid Jazz",
      75: "Polka",
      76: "Retro",
      77: "Musical",
      78: "Rock & Roll",
      79: "Hard Rock",
    };
    return genres[byte];
  }
}
