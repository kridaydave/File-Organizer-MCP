/**
 * Unit Tests for Smart Organization Tool
 * Tests file type detection, classification, and organization logic
 */

import fs from "fs/promises";
import path from "path";
import { jest } from "@jest/globals";
import {
  setupLoggerMocks,
  teardownLoggerMocks,
} from "../../utils/logger-mock.js";

// Mock dependencies
const mockScanDirectory = jest.fn();
const mockMusicOrganize = jest.fn();
const mockPhotoOrganize = jest.fn();

jest.unstable_mockModule(
  "../../../src/services/file-scanner.service.js",
  () => ({
    FileScannerService: jest.fn().mockImplementation(() => ({
      scanDirectory: mockScanDirectory,
    })),
  }),
);

jest.unstable_mockModule(
  "../../../src/services/music-organizer.service.js",
  () => ({
    MusicOrganizerService: jest.fn().mockImplementation(() => ({
      organize: mockMusicOrganize,
    })),
  }),
);

jest.unstable_mockModule(
  "../../../src/services/photo-organizer.service.js",
  () => ({
    PhotoOrganizerService: jest.fn().mockImplementation(() => ({
      organize: mockPhotoOrganize,
    })),
  }),
);

jest.unstable_mockModule(
  "../../../src/services/path-validator.service.js",
  () => ({
    validateStrictPath: jest.fn((p: string) => Promise.resolve(p)),
  }),
);

jest.unstable_mockModule(
  "../../../src/services/text-extraction.service.js",
  () => ({
    textExtractionService: {
      extract: jest.fn(async (filePath: string) => {
        const content = await fs.readFile(filePath, "utf-8").catch(() => "");
        return {
          text: content,
          truncated: false,
          originalLength: content.length,
          extractionMethod: "plain-text",
        };
      }),
    },
  }),
);

jest.unstable_mockModule(
  "../../../src/services/topic-extractor.service.js",
  () => ({
    topicExtractorService: {
      extractTopics: jest.fn(() => ({
        topics: [{ topic: "TestTopic", confidence: 0.9, matchedKeywords: ["test"] }],
        keywords: ["test"],
        language: "en",
        documentType: "general",
      })),
    },
    TopicMatch: {} as any,
  }),
);

const { handleOrganizeSmart, OrganizeSmartInputSchema } = await import(
  "../../../src/tools/smart-organization.js"
);

describe("Smart Organization Tool - Unit Tests", () => {
  let sourceDir: string;
  let targetDir: string;
  let baseTempDir: string;

  beforeEach(async () => {
    setupLoggerMocks();

    baseTempDir = path.join(process.cwd(), "tests", "temp");
    await fs.mkdir(baseTempDir, { recursive: true });
    sourceDir = await fs.mkdtemp(path.join(baseTempDir, "test-smart-src-"));
    targetDir = await fs.mkdtemp(path.join(baseTempDir, "test-smart-tgt-"));

    jest.clearAllMocks();
  });

  afterEach(async () => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      await fs.rm(sourceDir, { recursive: true, force: true });
      await fs.rm(targetDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    teardownLoggerMocks();
    jest.clearAllMocks();
  });

  describe("Input Validation", () => {
    it("should reject empty source_dir", () => {
      const result = OrganizeSmartInputSchema.safeParse({
        source_dir: "",
        target_dir: targetDir,
      });
      expect(result.success).toBe(false);
    });

    it("should reject empty target_dir", () => {
      const result = OrganizeSmartInputSchema.safeParse({
        source_dir: sourceDir,
        target_dir: "",
      });
      expect(result.success).toBe(false);
    });

    it("should apply default values for optional fields", () => {
      const result = OrganizeSmartInputSchema.safeParse({
        source_dir: sourceDir,
        target_dir: targetDir,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dry_run).toBe(true);
        expect(result.data.music_structure).toBe("artist/album");
        expect(result.data.photo_date_format).toBe("YYYY/MM");
        expect(result.data.recursive).toBe(true);
        expect(result.data.copy_instead_of_move).toBe(false);
        expect(result.data.create_shortcuts).toBe(false);
        expect(result.data.strip_gps).toBe(false);
        expect(result.data.photo_group_by_camera).toBe(false);
      }
    });

    it("should accept valid enum values for music_structure", () => {
      const structures = ["artist/album", "album", "genre/artist", "flat"] as const;
      for (const structure of structures) {
        const result = OrganizeSmartInputSchema.safeParse({
          source_dir: sourceDir,
          target_dir: targetDir,
          music_structure: structure,
        });
        expect(result.success).toBe(true);
      }
    });

    it("should reject invalid music_structure", () => {
      const result = OrganizeSmartInputSchema.safeParse({
        source_dir: sourceDir,
        target_dir: targetDir,
        music_structure: "invalid-structure",
      });
      expect(result.success).toBe(false);
    });

    it("should accept valid enum values for photo_date_format", () => {
      const formats = ["YYYY/MM/DD", "YYYY-MM-DD", "YYYY/MM", "YYYY"] as const;
      for (const format of formats) {
        const result = OrganizeSmartInputSchema.safeParse({
          source_dir: sourceDir,
          target_dir: targetDir,
          photo_date_format: format,
        });
        expect(result.success).toBe(true);
      }
    });

    it("should reject invalid photo_date_format", () => {
      const result = OrganizeSmartInputSchema.safeParse({
        source_dir: sourceDir,
        target_dir: targetDir,
        photo_date_format: "DD-MM-YYYY",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("File Classification", () => {
    it("should classify music files correctly", async () => {
      const musicFiles = ["song.mp3", "track.flac", "audio.ogg", "sound.wav", "music.m4a"];
      for (const file of musicFiles) {
        await fs.writeFile(path.join(sourceDir, file), "audio content");
      }

      mockScanDirectory.mockResolvedValue(
        musicFiles.map((f) => ({ path: path.join(sourceDir, f) })),
      );

      mockMusicOrganize.mockResolvedValue({
        organizedFiles: 5,
        skippedFiles: 0,
        errors: [],
      });

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: true,
      });

      const text = result.content[0].text;
      expect(text).toContain("🎵 **Music:** 5");
      expect(text).toContain("📸 **Photos:** 0");
      expect(text).toContain("📄 **Documents:** 0");
    });

    it("should classify photo files correctly", async () => {
      const photoFiles = ["img.jpg", "pic.jpeg", "shot.png", "photo.tiff", "raw.cr2", "image.heic"];
      for (const file of photoFiles) {
        await fs.writeFile(path.join(sourceDir, file), "image content");
      }

      mockScanDirectory.mockResolvedValue(
        photoFiles.map((f) => ({ path: path.join(sourceDir, f) })),
      );

      mockPhotoOrganize.mockResolvedValue({
        organizedFiles: 6,
        skippedFiles: 0,
        strippedGPSFiles: 0,
        errors: [],
      });

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: true,
      });

      const text = result.content[0].text;
      expect(text).toContain("🎵 **Music:** 0");
      expect(text).toContain("📸 **Photos:** 6");
      expect(text).toContain("📄 **Documents:** 0");
    });

    it("should classify document files correctly", async () => {
      const docFiles = ["doc.pdf", "notes.txt", "readme.md", "report.docx", "letter.rtf"];
      for (const file of docFiles) {
        await fs.writeFile(path.join(sourceDir, file), "document content about testing topics");
      }

      mockScanDirectory.mockResolvedValue(
        docFiles.map((f) => ({ path: path.join(sourceDir, f) })),
      );

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: true,
      });

      const text = result.content[0].text;
      expect(text).toContain("🎵 **Music:** 0");
      expect(text).toContain("📸 **Photos:** 0");
      expect(text).toContain("📄 **Documents:** 5");
    });

    it("should classify mixed file types correctly", async () => {
      const files = [
        { name: "song.mp3", type: "music" },
        { name: "img.jpg", type: "photo" },
        { name: "doc.pdf", type: "document" },
        { name: "track.flac", type: "music" },
        { name: "notes.txt", type: "document" },
        { name: "photo.png", type: "photo" },
        { name: "unknown.xyz", type: "other" },
      ];

      for (const file of files) {
        await fs.writeFile(
          path.join(sourceDir, file.name),
          file.type === "document" ? "document content about topics" : "content",
        );
      }

      mockScanDirectory.mockResolvedValue(files.map((f) => ({ path: path.join(sourceDir, f.name) })));

      mockMusicOrganize.mockResolvedValue({
        organizedFiles: 2,
        skippedFiles: 0,
        errors: [],
      });

      mockPhotoOrganize.mockResolvedValue({
        organizedFiles: 2,
        skippedFiles: 0,
        strippedGPSFiles: 0,
        errors: [],
      });

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: true,
      });

      const text = result.content[0].text;
      expect(text).toContain("🎵 **Music:** 2");
      expect(text).toContain("📸 **Photos:** 2");
      expect(text).toContain("📄 **Documents:** 2");
      expect(text).toContain("📦 **Other:** 1");
    });

    it("should handle case-insensitive extensions", async () => {
      const files = ["song.MP3", "img.JPG", "doc.PDF", "track.FLAC", "notes.TXT"];
      for (const file of files) {
        await fs.writeFile(
          path.join(sourceDir, file),
          file.endsWith(".PDF") || file.endsWith(".TXT") ? "document content" : "content",
        );
      }

      mockScanDirectory.mockResolvedValue(files.map((f) => ({ path: path.join(sourceDir, f) })));

      mockMusicOrganize.mockResolvedValue({
        organizedFiles: 2,
        skippedFiles: 0,
        errors: [],
      });

      mockPhotoOrganize.mockResolvedValue({
        organizedFiles: 1,
        skippedFiles: 0,
        strippedGPSFiles: 0,
        errors: [],
      });

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: true,
      });

      const text = result.content[0].text;
      expect(text).toContain("🎵 **Music:** 2");
      expect(text).toContain("📸 **Photos:** 1");
      expect(text).toContain("📄 **Documents:** 2");
    });
  });

  describe("Dry Run Mode", () => {
    it("should not create directories in dry run mode", async () => {
      await fs.writeFile(path.join(sourceDir, "doc.txt"), "document content");

      mockScanDirectory.mockResolvedValue([{ path: path.join(sourceDir, "doc.txt") }]);

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: true,
      });

      const text = result.content[0].text;
      expect(text).toContain("DRY RUN MODE");

      // Verify no directories were created
      const targetContents = await fs.readdir(targetDir).catch(() => []);
      expect(targetContents).toHaveLength(0);
    });

    it("should still show classification in dry run mode", async () => {
      await fs.writeFile(path.join(sourceDir, "song.mp3"), "audio");
      await fs.writeFile(path.join(sourceDir, "img.jpg"), "image");

      mockScanDirectory.mockResolvedValue([
        { path: path.join(sourceDir, "song.mp3") },
        { path: path.join(sourceDir, "img.jpg") },
      ]);

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: true,
      });

      const text = result.content[0].text;
      expect(text).toContain("🎵 **Music:** 1");
      expect(text).toContain("📸 **Photos:** 1");
    });
  });

  describe("Directory Creation Logic", () => {
    it("should only create Music directory when there are music files", async () => {
      await fs.writeFile(path.join(sourceDir, "song.mp3"), "audio");

      mockScanDirectory.mockResolvedValue([{ path: path.join(sourceDir, "song.mp3") }]);
      mockMusicOrganize.mockResolvedValue({
        organizedFiles: 1,
        skippedFiles: 0,
        errors: [],
      });

      await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
      });

      const targetContents = await fs.readdir(targetDir);
      expect(targetContents).toContain("Music");
      expect(targetContents).not.toContain("Photos");
      expect(targetContents).not.toContain("Documents");
    });

    it("should only create Photos directory when there are photo files", async () => {
      await fs.writeFile(path.join(sourceDir, "img.jpg"), "image");

      mockScanDirectory.mockResolvedValue([{ path: path.join(sourceDir, "img.jpg") }]);
      mockPhotoOrganize.mockResolvedValue({
        organizedFiles: 1,
        skippedFiles: 0,
        strippedGPSFiles: 0,
        errors: [],
      });

      await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
      });

      const targetContents = await fs.readdir(targetDir);
      expect(targetContents).not.toContain("Music");
      expect(targetContents).toContain("Photos");
      expect(targetContents).not.toContain("Documents");
    });

    it("should only create Documents directory when there are document files", async () => {
      await fs.writeFile(path.join(sourceDir, "doc.txt"), "document content");

      mockScanDirectory.mockResolvedValue([{ path: path.join(sourceDir, "doc.txt") }]);

      await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
      });

      const targetContents = await fs.readdir(targetDir);
      expect(targetContents).not.toContain("Music");
      expect(targetContents).not.toContain("Photos");
      expect(targetContents).toContain("Documents");
    });

    it("should create multiple directories for mixed file types", async () => {
      await fs.writeFile(path.join(sourceDir, "song.mp3"), "audio");
      await fs.writeFile(path.join(sourceDir, "img.jpg"), "image");
      await fs.writeFile(path.join(sourceDir, "doc.txt"), "document content");

      mockScanDirectory.mockResolvedValue([
        { path: path.join(sourceDir, "song.mp3") },
        { path: path.join(sourceDir, "img.jpg") },
        { path: path.join(sourceDir, "doc.txt") },
      ]);

      mockMusicOrganize.mockResolvedValue({
        organizedFiles: 1,
        skippedFiles: 0,
        errors: [],
      });

      mockPhotoOrganize.mockResolvedValue({
        organizedFiles: 1,
        skippedFiles: 0,
        strippedGPSFiles: 0,
        errors: [],
      });

      await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
      });

      const targetContents = await fs.readdir(targetDir);
      expect(targetContents).toContain("Music");
      expect(targetContents).toContain("Photos");
      expect(targetContents).toContain("Documents");
    });

    it("should not create any directories when only 'other' files exist", async () => {
      await fs.writeFile(path.join(sourceDir, "unknown.xyz"), "unknown");
      await fs.writeFile(path.join(sourceDir, "data.bin"), "binary");

      mockScanDirectory.mockResolvedValue([
        { path: path.join(sourceDir, "unknown.xyz") },
        { path: path.join(sourceDir, "data.bin") },
      ]);

      await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
      });

      const targetContents = await fs.readdir(targetDir);
      expect(targetContents).not.toContain("Music");
      expect(targetContents).not.toContain("Photos");
      expect(targetContents).not.toContain("Documents");
    });
  });

  describe("Service Integration", () => {
    it("should pass correct options to MusicOrganizerService", async () => {
      await fs.writeFile(path.join(sourceDir, "song.mp3"), "audio");

      mockScanDirectory.mockResolvedValue([{ path: path.join(sourceDir, "song.mp3") }]);
      mockMusicOrganize.mockResolvedValue({
        organizedFiles: 1,
        skippedFiles: 0,
        errors: [],
      });

      await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
        music_structure: "genre/artist",
        copy_instead_of_move: true,
      });

      expect(mockMusicOrganize).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceDir: sourceDir,
          targetDir: path.join(targetDir, "Music"),
          structure: "genre/artist",
          copyInsteadOfMove: true,
          filenamePattern: "{track} - {title}",
        }),
      );
    });

    it("should pass correct options to PhotoOrganizerService", async () => {
      await fs.writeFile(path.join(sourceDir, "img.jpg"), "image");

      mockScanDirectory.mockResolvedValue([{ path: path.join(sourceDir, "img.jpg") }]);
      mockPhotoOrganize.mockResolvedValue({
        organizedFiles: 1,
        skippedFiles: 0,
        strippedGPSFiles: 1,
        errors: [],
      });

      await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
        photo_date_format: "YYYY-MM-DD",
        photo_group_by_camera: true,
        strip_gps: true,
        copy_instead_of_move: true,
      });

      expect(mockPhotoOrganize).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceDir: sourceDir,
          targetDir: path.join(targetDir, "Photos"),
          dateFormat: "YYYY-MM-DD",
          groupByCamera: true,
          stripGPS: true,
          copyInsteadOfMove: true,
          unknownDateFolder: "Unknown Date",
        }),
      );
    });

    it("should not call music service when no music files", async () => {
      await fs.writeFile(path.join(sourceDir, "img.jpg"), "image");

      mockScanDirectory.mockResolvedValue([{ path: path.join(sourceDir, "img.jpg") }]);
      mockPhotoOrganize.mockResolvedValue({
        organizedFiles: 1,
        skippedFiles: 0,
        strippedGPSFiles: 0,
        errors: [],
      });

      await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
      });

      expect(mockMusicOrganize).not.toHaveBeenCalled();
      expect(mockPhotoOrganize).toHaveBeenCalled();
    });

    it("should not call photo service when no photo files", async () => {
      await fs.writeFile(path.join(sourceDir, "song.mp3"), "audio");

      mockScanDirectory.mockResolvedValue([{ path: path.join(sourceDir, "song.mp3") }]);
      mockMusicOrganize.mockResolvedValue({
        organizedFiles: 1,
        skippedFiles: 0,
        errors: [],
      });

      await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
      });

      expect(mockPhotoOrganize).not.toHaveBeenCalled();
      expect(mockMusicOrganize).toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should handle scanner errors gracefully", async () => {
      mockScanDirectory.mockRejectedValue(new Error("Scanner error"));

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
      });

      // Error is returned in content, not as isError flag
      expect(result.content[0].text).toContain("Error");
    });

    it("should handle music organization errors", async () => {
      await fs.writeFile(path.join(sourceDir, "song.mp3"), "audio");

      mockScanDirectory.mockResolvedValue([{ path: path.join(sourceDir, "song.mp3") }]);
      mockMusicOrganize.mockResolvedValue({
        organizedFiles: 0,
        skippedFiles: 0,
        errors: [{ file: "song.mp3", error: "Metadata read failed" }],
      });

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
      });

      const text = result.content[0].text;
      expect(text).toContain("Errors:");
      expect(text).toContain("1");
    });

    it("should handle photo organization errors", async () => {
      await fs.writeFile(path.join(sourceDir, "img.jpg"), "image");

      mockScanDirectory.mockResolvedValue([{ path: path.join(sourceDir, "img.jpg") }]);
      mockPhotoOrganize.mockResolvedValue({
        organizedFiles: 0,
        skippedFiles: 1,
        strippedGPSFiles: 0,
        errors: [{ file: "img.jpg", error: "EXIF read failed" }],
      });

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
      });

      const text = result.content[0].text;
      expect(text).toContain("Errors:");
    });

    it("should continue processing when one service fails", async () => {
      await fs.writeFile(path.join(sourceDir, "song.mp3"), "audio");
      await fs.writeFile(path.join(sourceDir, "img.jpg"), "image");

      mockScanDirectory.mockResolvedValue([
        { path: path.join(sourceDir, "song.mp3") },
        { path: path.join(sourceDir, "img.jpg") },
      ]);

      mockMusicOrganize.mockRejectedValue(new Error("Music service crashed"));
      mockPhotoOrganize.mockResolvedValue({
        organizedFiles: 1,
        skippedFiles: 0,
        strippedGPSFiles: 0,
        errors: [],
      });

      // Should not throw, but result may indicate partial failure
      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
      });

      expect(result.content[0].text).toBeDefined();
    });
  });

  describe("Output Structure Display", () => {
    it("should show correct output structure in results", async () => {
      await fs.writeFile(path.join(sourceDir, "song.mp3"), "audio");
      await fs.writeFile(path.join(sourceDir, "img.jpg"), "image");

      mockScanDirectory.mockResolvedValue([
        { path: path.join(sourceDir, "song.mp3") },
        { path: path.join(sourceDir, "img.jpg") },
      ]);

      mockMusicOrganize.mockResolvedValue({
        organizedFiles: 1,
        skippedFiles: 0,
        errors: [],
      });

      mockPhotoOrganize.mockResolvedValue({
        organizedFiles: 1,
        skippedFiles: 0,
        strippedGPSFiles: 0,
        errors: [],
      });

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: true,
      });

      const text = result.content[0].text;
      expect(text).toContain("Output Structure");
      expect(text).toContain("Music/");
      expect(text).toContain("Photos/");
      expect(text).not.toContain("Documents/");
    });

    it("should show all folder types for mixed content", async () => {
      await fs.writeFile(path.join(sourceDir, "song.mp3"), "audio");
      await fs.writeFile(path.join(sourceDir, "img.jpg"), "image");
      await fs.writeFile(path.join(sourceDir, "doc.txt"), "document content");

      mockScanDirectory.mockResolvedValue([
        { path: path.join(sourceDir, "song.mp3") },
        { path: path.join(sourceDir, "img.jpg") },
        { path: path.join(sourceDir, "doc.txt") },
      ]);

      mockMusicOrganize.mockResolvedValue({
        organizedFiles: 1,
        skippedFiles: 0,
        errors: [],
      });

      mockPhotoOrganize.mockResolvedValue({
        organizedFiles: 1,
        skippedFiles: 0,
        strippedGPSFiles: 0,
        errors: [],
      });

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: true,
      });

      const text = result.content[0].text;
      expect(text).toContain("Music/");
      expect(text).toContain("Photos/");
      expect(text).toContain("Documents/");
    });
  });
});
