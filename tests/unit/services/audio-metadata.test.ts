/**
 * Audio Metadata Service Tests - Phase 2.5
 * Comprehensive tests for ID3, FLAC, M4A, OGG metadata extraction
 */

import fs from "fs/promises";
import path from "path";
import { AudioMetadataService } from "../../../src/services/audio-metadata.service.js";

describe("AudioMetadataService", () => {
  let service: AudioMetadataService;
  let testDir: string;

  beforeEach(async () => {
    service = new AudioMetadataService();
    testDir = await fs.mkdtemp(
      path.join(process.cwd(), "tests", "temp", "audio-test-"),
    );
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ==================== UNIT TESTS ====================

  describe("getSupportedFormats", () => {
    it("should return supported audio formats", () => {
      const formats = service.getSupportedFormats();
      expect(formats).toContain("mp3");
      expect(formats).toContain("flac");
      expect(formats).toContain("m4a");
      expect(formats).toContain("ogg");
      expect(formats).toContain("wav");
      expect(formats.length).toBeGreaterThanOrEqual(7);
    });

    it("should return a copy of formats array", () => {
      const formats = service.getSupportedFormats();
      formats.push("test");
      const formats2 = service.getSupportedFormats();
      expect(formats2).not.toContain("test");
    });
  });

  // ==================== MP3/ID3 TESTS ====================

  describe("MP3 Metadata Extraction", () => {
    it("should extract ID3v2.3 metadata from MP3", async () => {
      // Create a mock MP3 file with ID3v2.3 header
      const id3Header = Buffer.from([
        0x49,
        0x44,
        0x33, // "ID3"
        0x03, // Version 2.3
        0x00, // Revision
        0x00, // Flags
        0x00,
        0x00,
        0x00,
        0x7f, // Size (synchsafe: 127 bytes)
      ]);

      // TIT2 frame (Title)
      const tit2Frame = Buffer.concat([
        Buffer.from("TIT2"),
        Buffer.from([0x00, 0x00, 0x00, 0x10]), // Size: 16 bytes
        Buffer.from([0x00, 0x00]), // Flags
        Buffer.from([0x03]), // UTF-8 encoding
        Buffer.from("Test Song Title"),
      ]);

      // TPE1 frame (Artist)
      const tpe1Frame = Buffer.concat([
        Buffer.from("TPE1"),
        Buffer.from([0x00, 0x00, 0x00, 0x0e]), // Size: 14 bytes
        Buffer.from([0x00, 0x00]), // Flags
        Buffer.from([0x03]), // UTF-8 encoding
        Buffer.from("Test Artist"),
      ]);

      const mp3Content = Buffer.concat([
        id3Header,
        tit2Frame,
        tpe1Frame,
        Buffer.alloc(100),
      ]);
      const filePath = path.join(testDir, "test.mp3");
      await fs.writeFile(filePath, mp3Content);

      const metadata = await service.extract(filePath);

      expect(metadata.format).toBe("MP3");
      expect(metadata.title).toBe("Test Song Title");
      expect(metadata.artist).toBe("Test Artist");
      expect(metadata.filePath).toBe(filePath);
      expect(metadata.extractedAt).toBeInstanceOf(Date);
    });

    it("should extract ID3v2.4 metadata with different encoding", async () => {
      const id3Header = Buffer.from([
        0x49,
        0x44,
        0x33, // "ID3"
        0x04, // Version 2.4
        0x00, // Revision
        0x00, // Flags
        0x00,
        0x00,
        0x00,
        0x4f, // Size
      ]);

      // TALB frame (Album) with UTF-16 encoding
      const talbFrame = Buffer.concat([
        Buffer.from("TALB"),
        Buffer.from([0x00, 0x00, 0x00, 0x14]), // Size
        Buffer.from([0x00, 0x00]), // Flags
        Buffer.from([0x01]), // UTF-16 with BOM
        Buffer.from([0xfe, 0xff]), // BOM
        Buffer.from("Test Album", "utf16le"),
      ]);

      const mp3Content = Buffer.concat([
        id3Header,
        talbFrame,
        Buffer.alloc(100),
      ]);
      const filePath = path.join(testDir, "test-utf16.mp3");
      await fs.writeFile(filePath, mp3Content);

      const metadata = await service.extract(filePath);

      expect(metadata.format).toBe("MP3");
      expect(metadata.album).toBeDefined();
    });

    it("should extract ID3v1 metadata from end of file", async () => {
      const mp3Data = Buffer.alloc(200);
      const id3v1Offset = 200 - 128;

      // ID3v1 header
      mp3Data.write("TAG", id3v1Offset);
      // Title (30 bytes)
      mp3Data.write("ID3v1 Title Song", id3v1Offset + 3);
      // Artist (30 bytes)
      mp3Data.write("ID3v1 Artist Name", id3v1Offset + 33);
      // Album (30 bytes)
      mp3Data.write("ID3v1 Album Name", id3v1Offset + 63);
      // Year (4 bytes)
      mp3Data.write("2023", id3v1Offset + 93);

      const filePath = path.join(testDir, "test-id3v1.mp3");
      await fs.writeFile(filePath, mp3Data);

      const metadata = await service.extract(filePath);

      expect(metadata.title).toContain("ID3v1");
      expect(metadata.artist).toContain("ID3v1");
      expect(metadata.album).toContain("ID3v1");
      expect(metadata.year).toBe(2023);
    });

    it("should parse track and disc numbers", async () => {
      const id3Header = Buffer.from([
        0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x7f,
      ]);

      // TRCK frame (Track number: 5/12)
      const trckFrame = Buffer.concat([
        Buffer.from("TRCK"),
        Buffer.from([0x00, 0x00, 0x00, 0x05]), // Size: 5 bytes (1 encoding + 4 text "5/12")
        Buffer.from([0x00, 0x00]),
        Buffer.from([0x03]), // UTF-8
        Buffer.from("5/12"),
      ]);

      // TPOS frame (Disc number: 2/3)
      const tposFrame = Buffer.concat([
        Buffer.from("TPOS"),
        Buffer.from([0x00, 0x00, 0x00, 0x04]), // Size: 4 bytes (1 encoding + 3 text "2/3")
        Buffer.from([0x00, 0x00]),
        Buffer.from([0x03]),
        Buffer.from("2/3"),
      ]);

      const mp3Content = Buffer.concat([
        id3Header,
        trckFrame,
        tposFrame,
        Buffer.alloc(100),
      ]);
      const filePath = path.join(testDir, "test-tracks.mp3");
      await fs.writeFile(filePath, mp3Content);

      const metadata = await service.extract(filePath);

      expect(metadata.trackNumber).toBe(5);
      expect(metadata.totalTracks).toBe(12);
      expect(metadata.discNumber).toBe(2);
      expect(metadata.totalDiscs).toBe(3);
    });

    it("should detect embedded artwork in MP3", async () => {
      const id3Header = Buffer.from([
        0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x7f,
      ]);

      // APIC frame (Attached Picture)
      const apicFrame = Buffer.concat([
        Buffer.from("APIC"),
        Buffer.from([0x00, 0x00, 0x00, 0x20]),
        Buffer.from([0x00, 0x00]),
        Buffer.from([0x00]), // ISO-8859-1 encoding for mime type
        Buffer.from("image/jpeg"),
        Buffer.from([0x00]), // Null terminator
        Buffer.from([0x03]), // Picture type (cover front)
        Buffer.from("Description"),
        Buffer.from([0x00]),
        Buffer.alloc(10), // Fake image data
      ]);

      const mp3Content = Buffer.concat([
        id3Header,
        apicFrame,
        Buffer.alloc(100),
      ]);
      const filePath = path.join(testDir, "test-artwork.mp3");
      await fs.writeFile(filePath, mp3Content);

      const metadata = await service.extract(filePath);

      expect(metadata.hasEmbeddedArtwork).toBe(true);
    });
  });

  // ==================== FLAC TESTS ====================

  describe("FLAC Metadata Extraction", () => {
    it("should extract Vorbis comments from FLAC", async () => {
      // FLAC header
      const flacHeader = Buffer.from([0x66, 0x4c, 0x61, 0x43]); // "fLaC"

      // STREAMINFO block (METADATA_BLOCK_HEADER: 4 bytes)
      const streaminfoBlock = Buffer.concat([
        Buffer.from([0x00]), // Last-metadata-block flag: 0
        Buffer.from([0x00]), // Block type: STREAMINFO (0)
        Buffer.from([0x00, 0x22]), // Block size: 34 bytes
        Buffer.alloc(34), // STREAMINFO content
      ]);

      // VORBIS_COMMENT block
      const vendorString = Buffer.from("TestVendor", "utf8");
      const vendorLength = Buffer.alloc(4);
      vendorLength.writeUInt32LE(vendorString.length, 0);

      const comment1 = Buffer.from("TITLE=FLAC Test Song");
      const comment2 = Buffer.from("ARTIST=FLAC Test Artist");
      const comment3 = Buffer.from("ALBUM=FLAC Test Album");

      const comments = Buffer.concat([
        vendorLength,
        vendorString,
        Buffer.from([0x02, 0x00, 0x00, 0x00]), // User comment list length: 2
        Buffer.from([comment1.length, 0, 0, 0]),
        comment1,
        Buffer.from([comment2.length, 0, 0, 0]),
        comment2,
        Buffer.from([comment3.length, 0, 0, 0]),
        comment3,
      ]);

      const vorbisBlock = Buffer.concat([
        Buffer.from([0x80 | 0x04]), // Last-metadata-block flag: 1, Block type: VORBIS_COMMENT (4)
        Buffer.from([
          (comments.length >> 16) & 0xff,
          (comments.length >> 8) & 0xff,
          comments.length & 0xff,
        ]),
        comments,
      ]);

      const flacContent = Buffer.concat([
        flacHeader,
        streaminfoBlock,
        vorbisBlock,
      ]);
      const filePath = path.join(testDir, "test.flac");
      await fs.writeFile(filePath, flacContent);

      const metadata = await service.extract(filePath);

      expect(metadata.format).toBe("FLAC");
      expect(metadata.title).toBe("FLAC Test Song");
      expect(metadata.artist).toBe("FLAC Test Artist");
      expect(metadata.album).toBe("FLAC Test Album");
    });

    it("should return empty metadata for invalid FLAC", async () => {
      const invalidFlac = Buffer.from("NotAFlacFile");
      const filePath = path.join(testDir, "invalid.flac");
      await fs.writeFile(filePath, invalidFlac);

      const metadata = await service.extract(filePath);

      expect(metadata.format).toBe("FLAC");
      expect(metadata.title).toBeUndefined();
    });
  });

  // ==================== M4A/MP4 TESTS ====================

  describe("M4A Metadata Extraction", () => {
    it("should extract metadata from M4A", async () => {
      // ftyp box
      const ftypBox = Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x14]), // Size: 20
        Buffer.from("ftyp"),
        Buffer.from("M4A "),
        Buffer.from([0x00, 0x00, 0x00, 0x00]),
        Buffer.from("M4A "),
      ]);

      // moov box with udta/meta
      const moovContent = Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x40]), // Size
        Buffer.from("udta"),
        Buffer.from([0x00, 0x00, 0x00, 0x38]), // meta size
        Buffer.from("meta"),
        Buffer.from([0x00, 0x00, 0x00, 0x00]), // version/flags
        // ilst container
        Buffer.from([0x00, 0x00, 0x00, 0x2c]), // ilst size
        Buffer.from("ilst"),
        // ©nam (title)
        Buffer.from([0x00, 0x00, 0x00, 0x14]),
        Buffer.from([0xa9, 0x6e, 0x61, 0x6d]), // ©nam
        Buffer.from([0x00, 0x00, 0x00, 0x0c]), // data size
        Buffer.from("data"),
        Buffer.from([0x00, 0x00, 0x00, 0x01]), // type indicator
        Buffer.from([0x00, 0x00, 0x00, 0x00]), // reserved
        Buffer.from("M4A Title"),
      ]);

      const moovBox = Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, moovContent.length + 8]),
        Buffer.from("moov"),
        moovContent,
      ]);

      const m4aContent = Buffer.concat([ftypBox, moovBox]);
      const filePath = path.join(testDir, "test.m4a");
      await fs.writeFile(filePath, m4aContent);

      const metadata = await service.extract(filePath);

      expect(metadata.format).toBe("M4A");
    });

    it("should handle AAC files same as M4A", async () => {
      const ftypBox = Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x10]),
        Buffer.from("ftyp"),
        Buffer.from("mp42"),
        Buffer.from([0x00, 0x00, 0x00, 0x00]),
      ]);

      const filePath = path.join(testDir, "test.aac");
      await fs.writeFile(filePath, ftypBox);

      const metadata = await service.extract(filePath);

      expect(metadata.format).toBe("AAC");
    });
  });

  // ==================== OGG TESTS ====================

  describe("OGG Metadata Extraction", () => {
    it("should extract Vorbis comments from OGG", async () => {
      // OGG page header
      const oggHeader = Buffer.concat([
        Buffer.from("OggS"),
        Buffer.from([0x00]), // Version
        Buffer.from([0x02]), // Header type (BOS)
        Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), // Granule position
        Buffer.from([0x01, 0x00, 0x00, 0x00]), // Serial number
        Buffer.from([0x01, 0x00, 0x00, 0x00]), // Page sequence
        Buffer.from([0x00, 0x00, 0x00, 0x00]), // CRC (invalid)
        Buffer.from([0x01]), // Number of segments
        Buffer.from([0x1e]), // Segment lengths
      ]);

      // Vorbis identification header
      const vorbisHeader = Buffer.concat([
        Buffer.from([0x01]), // Packet type (identification)
        Buffer.from("vorbis"),
        Buffer.alloc(23), // Version, channels, rate, etc.
      ]);

      const oggContent = Buffer.concat([oggHeader, vorbisHeader]);
      const filePath = path.join(testDir, "test.ogg");
      await fs.writeFile(filePath, oggContent);

      const metadata = await service.extract(filePath);

      expect(metadata.format).toBe("OGG");
    });
  });

  // ==================== BATCH EXTRACTION TESTS ====================

  describe("Batch Extraction", () => {
    it("should extract metadata from multiple files", async () => {
      // Create test files
      const files: string[] = [];

      for (let i = 0; i < 3; i++) {
        const mp3Data = Buffer.concat([
          Buffer.from([
            0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1f,
          ]),
          Buffer.alloc(31),
        ]);
        const filePath = path.join(testDir, `batch-${i}.mp3`);
        await fs.writeFile(filePath, mp3Data);
        files.push(filePath);
      }

      const results = await service.extractBatch(files);

      expect(results).toHaveLength(3);
      results.forEach((metadata, i) => {
        expect(metadata.filePath).toBe(files[i]);
        expect(metadata.format).toBe("MP3");
      });
    });

    it("should handle errors in batch without stopping", async () => {
      const validFile = path.join(testDir, "valid.mp3");
      const invalidFile = path.join(testDir, "nonexistent.mp3");

      await fs.writeFile(
        validFile,
        Buffer.concat([
          Buffer.from([
            0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0f,
          ]),
          Buffer.alloc(15),
        ]),
      );

      const results = await service.extractBatch([validFile, invalidFile]);

      expect(results).toHaveLength(2);
      expect(results[0]?.filePath).toBe(validFile);
      expect(results[1]?.filePath).toBe(invalidFile);
    });
  });

  // ==================== hasMetadata TESTS ====================

  describe("hasMetadata", () => {
    it("should return true for files with metadata", async () => {
      const mp3Data = Buffer.concat([
        Buffer.from([
          0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0f,
        ]),
        Buffer.alloc(15),
      ]);
      const filePath = path.join(testDir, "has-meta.mp3");
      await fs.writeFile(filePath, mp3Data);

      const hasMeta = await service.hasMetadata(filePath);

      expect(hasMeta).toBe(true);
    });

    it("should return false for unsupported formats", async () => {
      const filePath = path.join(testDir, "test.xyz");
      await fs.writeFile(filePath, Buffer.alloc(100));

      const hasMeta = await service.hasMetadata(filePath);

      expect(hasMeta).toBe(false);
    });

    it("should return false for non-existent files", async () => {
      const hasMeta = await service.hasMetadata(
        path.join(testDir, "nonexistent.mp3"),
      );

      expect(hasMeta).toBe(false);
    });

    it("should detect FLAC files by magic number", async () => {
      const filePath = path.join(testDir, "test.flac");
      await fs.writeFile(filePath, Buffer.from([0x66, 0x4c, 0x61, 0x43]));

      const hasMeta = await service.hasMetadata(filePath);

      expect(hasMeta).toBe(true);
    });

    it("should detect OGG files by magic number", async () => {
      const filePath = path.join(testDir, "test.ogg");
      await fs.writeFile(filePath, Buffer.from("OggS"));

      const hasMeta = await service.hasMetadata(filePath);

      expect(hasMeta).toBe(true);
    });
  });

  // ==================== EDGE CASE TESTS ====================

  describe("Edge Cases and Error Handling", () => {
    it("should handle empty files gracefully", async () => {
      const filePath = path.join(testDir, "empty.mp3");
      await fs.writeFile(filePath, Buffer.alloc(0));

      const metadata = await service.extract(filePath);

      expect(metadata.format).toBe("MP3");
      expect(metadata.title).toBeUndefined();
      expect(metadata.hasEmbeddedArtwork).toBe(false);
    });

    it("should handle very large files", async () => {
      const filePath = path.join(testDir, "large.mp3");
      // Create a file with ID3 header but large padding
      const id3Header = Buffer.from([
        0x49,
        0x44,
        0x33,
        0x03,
        0x00,
        0x00,
        0x00,
        0x00,
        0x10,
        0x00, // Size: 1024 bytes
      ]);
      await fs.writeFile(
        filePath,
        Buffer.concat([id3Header, Buffer.alloc(1100)]),
      );

      const metadata = await service.extract(filePath);

      expect(metadata.format).toBe("MP3");
    });

    it("should handle Unicode in metadata", async () => {
      const id3Header = Buffer.from([
        0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x7f,
      ]);

      // UTF-8 encoded title with emoji
      const tit2Frame = Buffer.concat([
        Buffer.from("TIT2"),
        Buffer.from([0x00, 0x00, 0x00, 0x18]),
        Buffer.from([0x00, 0x00]),
        Buffer.from([0x03]), // UTF-8
        Buffer.from("Song with 🎵 emoji"),
      ]);

      const mp3Content = Buffer.concat([
        id3Header,
        tit2Frame,
        Buffer.alloc(100),
      ]);
      const filePath = path.join(testDir, "unicode.mp3");
      await fs.writeFile(filePath, mp3Content);

      const metadata = await service.extract(filePath);

      expect(metadata.title).toContain("🎵");
    });

    it("should handle corrupted ID3 frames", async () => {
      const id3Header = Buffer.from([
        0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x7f,
      ]);

      // Corrupted frame with invalid size
      const badFrame = Buffer.concat([
        Buffer.from("TIT2"),
        Buffer.from([0xff, 0xff, 0xff, 0xff]), // Invalid huge size
        Buffer.from([0x00, 0x00]),
        Buffer.from([0x03]),
        Buffer.from("Test"),
      ]);

      const mp3Content = Buffer.concat([
        id3Header,
        badFrame,
        Buffer.alloc(100),
      ]);
      const filePath = path.join(testDir, "corrupted.mp3");
      await fs.writeFile(filePath, mp3Content);

      const metadata = await service.extract(filePath);

      expect(metadata.format).toBe("MP3");
      // Should not throw
    });

    it("should handle directories instead of files", async () => {
      const dirPath = path.join(testDir, "adir");
      await fs.mkdir(dirPath);

      const metadata = await service.extract(dirPath);

      expect(metadata.format).toBe("");
      expect(metadata.title).toBeUndefined();
    });

    it("should handle genre lookup", async () => {
      const id3v1Data = Buffer.alloc(128);
      const offset = 0;
      id3v1Data.write("TAG", offset);
      id3v1Data.write("Test Title", offset + 3);
      id3v1Data.write("Test Artist", offset + 33);
      id3v1Data.write("Test Album", offset + 63);
      id3v1Data.write("2023", offset + 93);
      id3v1Data[offset + 127] = 17; // Genre: Rock (17)

      const filePath = path.join(testDir, "genre.mp3");
      await fs.writeFile(filePath, id3v1Data);

      const metadata = await service.extract(filePath);

      expect(metadata.genre).toBeDefined();
    });
  });

  // ==================== INTEGRATION TESTS ====================

  describe("Integration Tests", () => {
    it("should extract complete metadata from complex MP3", async () => {
      const id3Header = Buffer.from([
        0x49,
        0x44,
        0x33,
        0x03,
        0x00,
        0x00,
        0x00,
        0x00,
        0x02,
        0x00, // Size: 256 bytes
      ]);

      const frames = [
        // TIT2 - Title
        ["TIT2", "Complete Test Song"],
        // TPE1 - Artist
        ["TPE1", "Test Artist Name"],
        // TALB - Album
        ["TALB", "Test Album Name"],
        // TPE2 - Album Artist
        ["TPE2", "Album Artist Name"],
        // TCOM - Composer
        ["TCOM", "Composer Name"],
        // TCON - Genre
        ["TCON", "Test Genre"],
        // TYER - Year
        ["TYER", "2023"],
        // TRCK - Track
        ["TRCK", "3/10"],
        // TPOS - Disc
        ["TPOS", "1/2"],
      ];

      let allFrames = Buffer.alloc(0);
      for (const [frameId, text] of frames) {
        const frame = Buffer.concat([
          Buffer.from(frameId),
          Buffer.from([0x00, 0x00, 0x00, text.length + 1]),
          Buffer.from([0x00, 0x00]),
          Buffer.from([0x03]), // UTF-8
          Buffer.from(text),
        ]);
        allFrames = Buffer.concat([allFrames, frame]);
      }

      const mp3Content = Buffer.concat([
        id3Header,
        allFrames,
        Buffer.alloc(100),
      ]);
      const filePath = path.join(testDir, "complete.mp3");
      await fs.writeFile(filePath, mp3Content);

      const metadata = await service.extract(filePath);

      expect(metadata.title).toBe("Complete Test Song");
      expect(metadata.artist).toBe("Test Artist Name");
      expect(metadata.album).toBe("Test Album Name");
      expect(metadata.albumArtist).toBe("Album Artist Name");
      expect(metadata.composer).toBe("Composer Name");
      expect(metadata.genre).toBe("Test Genre");
      expect(metadata.year).toBe(2023);
      expect(metadata.trackNumber).toBe(3);
      expect(metadata.totalTracks).toBe(10);
      expect(metadata.discNumber).toBe(1);
      expect(metadata.totalDiscs).toBe(2);
    });

    it("should handle mixed ID3v2 and ID3v1 with priority to v2", async () => {
      const id3v2Header = Buffer.from([
        0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x3f,
      ]);

      const tit2Frame = Buffer.concat([
        Buffer.from("TIT2"),
        Buffer.from([0x00, 0x00, 0x00, 0x12]),
        Buffer.from([0x00, 0x00]),
        Buffer.from([0x03]),
        Buffer.from("ID3v2 Title"),
      ]);

      const id3v1Data = Buffer.alloc(128);
      id3v1Data.write("TAG", 0);
      id3v1Data.write("ID3v1 Title", 3);
      id3v1Data.write("ID3v1 Artist", 33);

      const mp3Content = Buffer.concat([
        id3v2Header,
        tit2Frame,
        Buffer.alloc(50),
        id3v1Data,
      ]);
      const filePath = path.join(testDir, "mixed.mp3");
      await fs.writeFile(filePath, mp3Content);

      const metadata = await service.extract(filePath);

      // ID3v2 should take priority
      expect(metadata.title).toBe("ID3v2 Title");
      // ID3v1 fills in missing fields
      expect(metadata.artist).toBe("ID3v1 Artist");
    });
  });
});
