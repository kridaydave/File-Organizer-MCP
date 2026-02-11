/**
 * Music Organizer Service Tests - Phase 2.5
 * Tests for Artist/Album organization, filename patterns, collision handling
 */

import fs from "fs/promises";
import path from "path";
import { MusicOrganizerService } from "../../../src/services/music-organizer.service.js";

describe("MusicOrganizerService", () => {
  let service: MusicOrganizerService;
  let testDir: string;
  let sourceDir: string;
  let targetDir: string;

  beforeEach(async () => {
    service = new MusicOrganizerService();
    testDir = await fs.mkdtemp(path.join(process.cwd(), "tests", "temp", "music-org-"));
    sourceDir = path.join(testDir, "source");
    targetDir = path.join(testDir, "target");
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.mkdir(targetDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // Helper to create mock MP3 file
  async function createMockMP3(
    fileName: string,
    metadata: {
      title?: string;
      artist?: string;
      album?: string;
      trackNumber?: number;
    } = {},
  ): Promise<string> {
    const filePath = path.join(sourceDir, fileName);
    
    // Create minimal ID3v2 header
    let id3Data = Buffer.from([
      0x49, 0x44, 0x33, // ID3
      0x03, 0x00, // Version 2.3
      0x00, // Flags
      0x00, 0x00, 0x00, 0x00, // Size (will be calculated)
    ]);

    const frames: Buffer[] = [];

    if (metadata.title) {
      const text = Buffer.from(metadata.title);
      frames.push(Buffer.concat([
        Buffer.from("TIT2"),
        Buffer.from([0x00, 0x00, 0x00, text.length + 1]),
        Buffer.from([0x00, 0x00]),
        Buffer.from([0x03]), // UTF-8
        text,
      ]));
    }

    if (metadata.artist) {
      const text = Buffer.from(metadata.artist);
      frames.push(Buffer.concat([
        Buffer.from("TPE1"),
        Buffer.from([0x00, 0x00, 0x00, text.length + 1]),
        Buffer.from([0x00, 0x00]),
        Buffer.from([0x03]),
        text,
      ]));
    }

    if (metadata.album) {
      const text = Buffer.from(metadata.album);
      frames.push(Buffer.concat([
        Buffer.from("TALB"),
        Buffer.from([0x00, 0x00, 0x00, text.length + 1]),
        Buffer.from([0x00, 0x00]),
        Buffer.from([0x03]),
        text,
      ]));
    }

    if (metadata.trackNumber !== undefined) {
      const text = Buffer.from(metadata.trackNumber.toString());
      frames.push(Buffer.concat([
        Buffer.from("TRCK"),
        Buffer.from([0x00, 0x00, 0x00, text.length + 1]),
        Buffer.from([0x00, 0x00]),
        Buffer.from([0x03]),
        text,
      ]));
    }

    const allFrames = Buffer.concat(frames);
    const size = allFrames.length;
    
    // Write synchsafe size
    id3Data[6] = (size >> 21) & 0x7f;
    id3Data[7] = (size >> 14) & 0x7f;
    id3Data[8] = (size >> 7) & 0x7f;
    id3Data[9] = size & 0x7f;

    const mp3Content = Buffer.concat([id3Data, allFrames, Buffer.alloc(100)]);
    await fs.writeFile(filePath, mp3Content);
    
    return filePath;
  }

  // ==================== UNIT TESTS ====================

  describe("sanitizeFilename", () => {
    it("should remove invalid characters from filename", () => {
      expect(service.sanitizeFilename("song:with*invalid?chars")).toBe(
        "song_with_invalid_chars",
      );
    });

    it("should handle forward slashes", () => {
      expect(service.sanitizeFilename("artist/song")).toBe("artist_song");
    });

    it("should handle backslashes", () => {
      expect(service.sanitizeFilename("artist\\song")).toBe("artist_song");
    });

    it("should handle quotes and angle brackets", () => {
      expect(service.sanitizeFilename('song<with>"quotes"')).toBe(
        "song_with_quotes_",
      );
    });

    it("should handle pipe character", () => {
      expect(service.sanitizeFilename("song|with|pipes")).toBe(
        "song_with_pipes",
      );
    });

    it("should handle control characters", () => {
      expect(service.sanitizeFilename("song\x01with\x02controls")).toBe(
        "songwithcontrols",
      );
    });

    it("should handle Windows reserved names", () => {
      expect(service.sanitizeFilename("CON.mp3")).toBe("CON_.mp3");
      expect(service.sanitizeFilename("PRN.mp3")).toBe("PRN_.mp3");
      expect(service.sanitizeFilename("AUX.mp3")).toBe("AUX_.mp3");
      expect(service.sanitizeFilename("NUL.mp3")).toBe("NUL_.mp3");
      expect(service.sanitizeFilename("COM1.mp3")).toBe("COM1_.mp3");
      expect(service.sanitizeFilename("LPT1.mp3")).toBe("LPT1_.mp3");
    });

    it("should limit filename length", () => {
      const longName = "a".repeat(300) + ".mp3";
      const sanitized = service.sanitizeFilename(longName);
      expect(sanitized.length).toBeLessThanOrEqual(200);
    });

    it("should trim whitespace", () => {
      expect(service.sanitizeFilename("  song name  ")).toBe("song name");
    });

    it("should preserve valid characters", () => {
      expect(service.sanitizeFilename("Song - Name (2023) [Live].mp3")).toBe(
        "Song - Name (2023) [Live].mp3",
      );
    });
  });

  describe("getDestinationPath", () => {
    it("should create artist/album path structure", () => {
      const metadata = {
        filePath: "/source/song.mp3",
        format: "MP3",
        hasEmbeddedArtwork: false,
        extractedAt: new Date(),
        title: "Test Song",
        artist: "Test Artist",
        album: "Test Album",
      };

      const config = {
        sourceDir: "/source",
        targetDir: "/target",
        structure: "artist/album" as const,
        filenamePattern: "{title}" as const,
      };

      const destPath = service.getDestinationPath(metadata, config);
      expect(destPath).toBe(path.join("/target", "Test Artist", "Test Album", "Test Song.mp3"));
    });

    it("should create flat structure", () => {
      const metadata = {
        filePath: "/source/song.mp3",
        format: "MP3",
        hasEmbeddedArtwork: false,
        extractedAt: new Date(),
        title: "Test Song",
        artist: "Test Artist",
      };

      const config = {
        sourceDir: "/source",
        targetDir: "/target",
        structure: "flat" as const,
        filenamePattern: "{title}" as const,
      };

      const destPath = service.getDestinationPath(metadata, config);
      expect(destPath).toBe(path.join("/target", "Test Song.mp3"));
    });

    it("should create album-only structure", () => {
      const metadata = {
        filePath: "/source/song.mp3",
        format: "MP3",
        hasEmbeddedArtwork: false,
        extractedAt: new Date(),
        title: "Test Song",
        album: "Test Album",
      };

      const config = {
        sourceDir: "/source",
        targetDir: "/target",
        structure: "album" as const,
        filenamePattern: "{title}" as const,
      };

      const destPath = service.getDestinationPath(metadata, config);
      expect(destPath).toBe(path.join("/target", "Test Album", "Test Song.mp3"));
    });

    it("should create genre/artist structure", () => {
      const metadata = {
        filePath: "/source/song.mp3",
        format: "MP3",
        hasEmbeddedArtwork: false,
        extractedAt: new Date(),
        title: "Test Song",
        artist: "Test Artist",
        genre: "Rock",
      };

      const config = {
        sourceDir: "/source",
        targetDir: "/target",
        structure: "genre/artist" as const,
        filenamePattern: "{title}" as const,
      };

      const destPath = service.getDestinationPath(metadata, config);
      expect(destPath).toBe(path.join("/target", "Rock", "Test Artist", "Test Song.mp3"));
    });

    it("should handle missing metadata with defaults", () => {
      const metadata = {
        filePath: "/source/song.mp3",
        format: "MP3",
        hasEmbeddedArtwork: false,
        extractedAt: new Date(),
      };

      const config = {
        sourceDir: "/source",
        targetDir: "/target",
        structure: "artist/album" as const,
        filenamePattern: "{title}" as const,
      };

      const destPath = service.getDestinationPath(metadata, config);
      expect(destPath).toContain("Unknown Artist");
      expect(destPath).toContain("Unknown Album");
    });

    it("should use albumArtist when available", () => {
      const metadata = {
        filePath: "/source/song.mp3",
        format: "MP3",
        hasEmbeddedArtwork: false,
        extractedAt: new Date(),
        title: "Test Song",
        artist: "Featured Artist",
        albumArtist: "Main Artist",
        album: "Test Album",
      };

      const config = {
        sourceDir: "/source",
        targetDir: "/target",
        structure: "artist/album" as const,
        filenamePattern: "{title}" as const,
      };

      const destPath = service.getDestinationPath(metadata, config);
      expect(destPath).toContain("Main Artist");
    });

    it("should generate track - title filename pattern", () => {
      const metadata = {
        filePath: "/source/song.mp3",
        format: "MP3",
        hasEmbeddedArtwork: false,
        extractedAt: new Date(),
        title: "Test Song",
        trackNumber: 5,
      };

      const config = {
        sourceDir: "/source",
        targetDir: "/target",
        structure: "flat" as const,
        filenamePattern: "{track} - {title}" as const,
      };

      const destPath = service.getDestinationPath(metadata, config);
      expect(destPath).toContain("05 - Test Song");
    });

    it("should generate artist - title filename pattern", () => {
      const metadata = {
        filePath: "/source/song.mp3",
        format: "MP3",
        hasEmbeddedArtwork: false,
        extractedAt: new Date(),
        title: "Test Song",
        artist: "Test Artist",
      };

      const config = {
        sourceDir: "/source",
        targetDir: "/target",
        structure: "flat" as const,
        filenamePattern: "{artist} - {title}" as const,
      };

      const destPath = service.getDestinationPath(metadata, config);
      expect(destPath).toContain("Test Artist - Test Song");
    });
  });

  // ==================== INTEGRATION TESTS ====================

  describe("organize", () => {
    it("should organize files with artist/album structure", async () => {
      await createMockMP3("song1.mp3", {
        title: "Song One",
        artist: "Artist A",
        album: "Album X",
      });
      await createMockMP3("song2.mp3", {
        title: "Song Two",
        artist: "Artist A",
        album: "Album X",
      });
      await createMockMP3("song3.mp3", {
        title: "Song Three",
        artist: "Artist B",
        album: "Album Y",
      });

      const result = await service.organize({
        sourceDir,
        targetDir,
        structure: "artist/album",
        filenamePattern: "{track} - {title}",
      });

      expect(result.success).toBe(true);
      expect(result.organizedFiles).toBe(3);
      expect(result.errors).toHaveLength(0);

      // Verify structure
      expect(result.structure["Artist A"]).toContain("Album X");
      expect(result.structure["Artist B"]).toContain("Album Y");

      // Verify files were moved
      const files = await fs.readdir(path.join(targetDir, "Artist A", "Album X"));
      expect(files.length).toBe(2);
    });

    it("should organize files with flat structure", async () => {
      await createMockMP3("song1.mp3", { title: "Song One", artist: "Artist A" });
      await createMockMP3("song2.mp3", { title: "Song Two", artist: "Artist B" });

      const result = await service.organize({
        sourceDir,
        targetDir,
        structure: "flat",
        filenamePattern: "{title}",
      });

      expect(result.success).toBe(true);
      expect(result.organizedFiles).toBe(2);

      const files = await fs.readdir(targetDir);
      expect(files).toContain("Song One.mp3");
      expect(files).toContain("Song Two.mp3");
    });

    it("should copy instead of move when configured", async () => {
      await createMockMP3("song1.mp3", { title: "Song One" });

      const result = await service.organize({
        sourceDir,
        targetDir,
        structure: "flat",
        filenamePattern: "{title}",
        copyInsteadOfMove: true,
      });

      expect(result.organizedFiles).toBe(1);

      // Source file should still exist
      const sourceExists = await fs
        .access(path.join(sourceDir, "song1.mp3"))
        .then(() => true)
        .catch(() => false);
      expect(sourceExists).toBe(true);

      // Target file should exist
      const targetExists = await fs
        .access(path.join(targetDir, "Song One.mp3"))
        .then(() => true)
        .catch(() => false);
      expect(targetExists).toBe(true);
    });

    it("should skip files with missing metadata when configured", async () => {
      await createMockMP3("song1.mp3", { title: "Song One", artist: "Artist A" });
      await createMockMP3("song2.mp3", {}); // No metadata

      const result = await service.organize({
        sourceDir,
        targetDir,
        structure: "artist/album",
        filenamePattern: "{title}",
        skipIfMissingMetadata: true,
      });

      expect(result.organizedFiles).toBe(1);
      expect(result.skippedFiles).toBe(1);
    });

    it("should handle Various Artists albums", async () => {
      await createMockMP3("song1.mp3", {
        title: "Track 1",
        artist: "Artist 1",
        album: "Compilation Album",
      });
      await createMockMP3("song2.mp3", {
        title: "Track 2",
        artist: "Artist 2",
        album: "Compilation Album",
      });

      const result = await service.organize({
        sourceDir,
        targetDir,
        structure: "artist/album",
        filenamePattern: "{artist} - {title}",
        variousArtistsAlbumName: "Compilations",
      });

      expect(result.organizedFiles).toBe(2);
      
      // Files should be in Compilations folder
      const files = await fs.readdir(path.join(targetDir, "Compilations", "Compilation Album"));
      expect(files.length).toBe(2);
    });

    it("should handle file collisions", async () => {
      // Two songs with same title
      await createMockMP3("song1.mp3", { title: "Same Title", artist: "Artist A" });
      await createMockMP3("song2.mp3", { title: "Same Title", artist: "Artist B" });

      const result = await service.organize({
        sourceDir,
        targetDir,
        structure: "flat",
        filenamePattern: "{title}",
      });

      expect(result.organizedFiles).toBe(2);

      // Both files should exist with different names
      const files = await fs.readdir(targetDir);
      expect(files.length).toBe(2);
      expect(files[0]).not.toBe(files[1]);
    });

    it("should organize nested directory structures", async () => {
      // Create nested directories
      const nestedDir = path.join(sourceDir, "nested", "deep");
      await fs.mkdir(nestedDir, { recursive: true });

      // Create MP3 in nested dir
      const mp3Data = Buffer.from([
        0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0f,
        Buffer.from("TIT2"),
        Buffer.from([0x00, 0x00, 0x00, 0x05]),
        Buffer.from([0x00, 0x00]),
        Buffer.from([0x03]),
        Buffer.from("Deep"),
      ].flat());
      await fs.writeFile(path.join(nestedDir, "deep_song.mp3"), mp3Data);

      const result = await service.organize({
        sourceDir,
        targetDir,
        structure: "flat",
        filenamePattern: "{title}",
      });

      expect(result.organizedFiles).toBe(1);
    });
  });

  describe("previewOrganization", () => {
    it("should not move files in dry run mode", async () => {
      await createMockMP3("song1.mp3", { title: "Song One", artist: "Artist A" });

      const result = await service.previewOrganization({
        sourceDir,
        targetDir,
        structure: "artist/album",
        filenamePattern: "{title}",
      });

      expect(result.success).toBe(true);
      expect(result.organizedFiles).toBe(1);

      // Target directory should be empty (or not exist)
      const targetExists = await fs
        .access(targetDir)
        .then(() => true)
        .catch(() => false);
      
      if (targetExists) {
        const files = await fs.readdir(targetDir);
        expect(files.length).toBe(0);
      }

      // Source file should still exist
      const sourceExists = await fs
        .access(path.join(sourceDir, "song1.mp3"))
        .then(() => true)
        .catch(() => false);
      expect(sourceExists).toBe(true);
    });

    it("should show planned structure in preview", async () => {
      await createMockMP3("song1.mp3", { title: "Song One", artist: "Artist A", album: "Album X" });
      await createMockMP3("song2.mp3", { title: "Song Two", artist: "Artist B", album: "Album Y" });

      const result = await service.previewOrganization({
        sourceDir,
        targetDir,
        structure: "artist/album",
        filenamePattern: "{title}",
      });

      expect(result.structure["Artist A"]).toContain("Album X");
      expect(result.structure["Artist B"]).toContain("Album Y");
    });
  });

  // ==================== ERROR HANDLING TESTS ====================

  describe("Error Handling", () => {
    it("should fail if source directory does not exist", async () => {
      const result = await service.organize({
        sourceDir: "/nonexistent/source",
        targetDir,
        structure: "artist/album",
        filenamePattern: "{title}",
      });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should fail if source and target are the same", async () => {
      const result = await service.organize({
        sourceDir,
        targetDir: sourceDir,
        structure: "artist/album",
        filenamePattern: "{title}",
      });

      expect(result.success).toBe(false);
    });

    it("should fail if target is inside source", async () => {
      const nestedTarget = path.join(sourceDir, "organized");
      
      const result = await service.organize({
        sourceDir,
        targetDir: nestedTarget,
        structure: "artist/album",
        filenamePattern: "{title}",
      });

      expect(result.success).toBe(false);
    });

    it("should fail with invalid structure option", async () => {
      const result = await service.organize({
        sourceDir,
        targetDir,
        structure: "invalid" as any,
        filenamePattern: "{title}",
      });

      expect(result.success).toBe(false);
    });

    it("should fail with invalid filename pattern", async () => {
      const result = await service.organize({
        sourceDir,
        targetDir,
        structure: "artist/album",
        filenamePattern: "{invalid}" as any,
      });

      expect(result.success).toBe(false);
    });

    it("should handle corrupted audio files gracefully", async () => {
      // Create a file that looks like MP3 but has bad metadata
      await fs.writeFile(path.join(sourceDir, "corrupted.mp3"), Buffer.from("Not a real MP3"));

      const result = await service.organize({
        sourceDir,
        targetDir,
        structure: "flat",
        filenamePattern: "{title}",
      });

      // Should complete without throwing
      expect(result.success).toBe(true);
    });
  });

  // ==================== EDGE CASE TESTS ====================

  describe("Edge Cases", () => {
    it("should handle empty source directory", async () => {
      const result = await service.organize({
        sourceDir,
        targetDir,
        structure: "artist/album",
        filenamePattern: "{title}",
      });

      expect(result.success).toBe(true);
      expect(result.organizedFiles).toBe(0);
    });

    it("should handle non-audio files in source", async () => {
      await fs.writeFile(path.join(sourceDir, "readme.txt"), "Not an audio file");
      await createMockMP3("song1.mp3", { title: "Song One" });

      const result = await service.organize({
        sourceDir,
        targetDir,
        structure: "flat",
        filenamePattern: "{title}",
      });

      expect(result.organizedFiles).toBe(1);
    });

    it("should handle Unicode in metadata", async () => {
      await createMockMP3("unicode.mp3", {
        title: "🎵 Music",
        artist: "演奏者", // Japanese
        album: "Müsic",
      });

      const result = await service.organize({
        sourceDir,
        targetDir,
        structure: "artist/album",
        filenamePattern: "{title}",
      });

      expect(result.success).toBe(true);
      expect(result.organizedFiles).toBe(1);
    });

    it("should handle very long metadata values", async () => {
      await createMockMP3("long.mp3", {
        title: "A".repeat(300),
        artist: "B".repeat(300),
        album: "C".repeat(300),
      });

      const result = await service.organize({
        sourceDir,
        targetDir,
        structure: "artist/album",
        filenamePattern: "{title}",
      });

      expect(result.success).toBe(true);
      expect(result.organizedFiles).toBe(1);
    });

    it("should handle special characters in metadata", async () => {
      await createMockMP3("special.mp3", {
        title: "Song: With | Special * Chars?",
        artist: "Artist <Test>",
        album: "Album: \"Test\"",
      });

      const result = await service.organize({
        sourceDir,
        targetDir,
        structure: "artist/album",
        filenamePattern: "{title}",
      });

      expect(result.success).toBe(true);

      // Verify sanitized paths exist
      const artistDirs = await fs.readdir(targetDir);
      expect(artistDirs.length).toBeGreaterThan(0);
      expect(artistDirs[0]).not.toContain("<");
      expect(artistDirs[0]).not.toContain(">");
    });

    it("should handle track numbers with leading zeros in filename", async () => {
      await createMockMP3("track.mp3", {
        title: "Track Name",
        trackNumber: 3,
      });

      const result = await service.organize({
        sourceDir,
        targetDir,
        structure: "flat",
        filenamePattern: "{track} - {title}",
      });

      expect(result.success).toBe(true);

      const files = await fs.readdir(targetDir);
      expect(files[0]).toMatch(/^\d{2}/); // Should be zero-padded
    });

    it("should handle multiple disc albums", async () => {
      await createMockMP3("disc1.mp3", {
        title: "Disc 1 Song",
        artist: "Artist",
        album: "Album",
        discNumber: 1,
        trackNumber: 1,
      });

      const result = await service.organize({
        sourceDir,
        targetDir,
        structure: "artist/album",
        filenamePattern: "{track} - {title}",
      });

      expect(result.success).toBe(true);
      expect(result.organizedFiles).toBe(1);
    });

    it("should preserve file extensions", async () => {
      // Create FLAC file
      const flacHeader = Buffer.from([0x66, 0x4c, 0x61, 0x43]);
      await fs.writeFile(path.join(sourceDir, "test.flac"), flacHeader);

      const result = await service.organize({
        sourceDir,
        targetDir,
        structure: "flat",
        filenamePattern: "{title}",
      });

      const files = await fs.readdir(targetDir);
      expect(files[0]).toEndWith(".flac");
    });
  });
});
