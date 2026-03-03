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
      getAllFiles: jest.fn().mockResolvedValue([]),
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
    PathValidatorService: jest.fn().mockImplementation(() => ({
      validateStrictPath: jest.fn((p: string) => Promise.resolve(p)),
    })),
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
    TopicExtractorService: jest.fn().mockImplementation(() => ({
      extractTopics: jest.fn(() => ({
        topics: [{ topic: "TestTopic", confidence: 0.9, matchedKeywords: ["test"] }],
        keywords: ["test"],
        language: "en",
        documentType: "general",
      })),
    })),
    TopicMatch: {} as any,
  }),
);

const { handleOrganizeSmart, OrganizeSmartInputSchema } = await import("../../../src/tools/smart-organization.js");

describe("Smart Organization Tool - Unit Tests", () => {
  let sourceDir: string;
  let targetDir: string;
  let baseTempDir: string;
  let services: any;

  beforeEach(async () => {
    setupLoggerMocks();

    baseTempDir = path.join(process.cwd(), "tests", "temp");
    await fs.mkdir(baseTempDir, { recursive: true });
    sourceDir = await fs.mkdtemp(path.join(baseTempDir, "test-smart-src-"));
    targetDir = await fs.mkdtemp(path.join(baseTempDir, "test-smart-tgt-"));

    services = {
      scanner: {
        scanDirectory: mockScanDirectory,
      },
      musicService: {
        organize: mockMusicOrganize,
      },
      photoService: {
        organize: mockPhotoOrganize,
      },
    };

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
  });

  describe("File Classification", () => {
    it("should classify music files correctly", async () => {
      const musicFiles = ["song.mp3"];
      mockScanDirectory.mockResolvedValue(
        musicFiles.map((f) => ({ path: path.join(sourceDir, f) })),
      );

      mockMusicOrganize.mockResolvedValue({
        organizedFiles: 1,
        skippedFiles: 0,
        errors: [],
        movedFiles: [],
      });

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: true,
      }, services);

      const text = result.content[0].text;
      expect(text).toContain("🎵 **Music:** 1");
    });

    it("should classify photo files correctly", async () => {
      const photoFiles = ["img.jpg"];
      mockScanDirectory.mockResolvedValue(
        photoFiles.map((f) => ({ path: path.join(sourceDir, f) })),
      );

      mockPhotoOrganize.mockResolvedValue({
        organizedFiles: 1,
        skippedFiles: 0,
        strippedGPSFiles: 0,
        errors: [],
        movedFiles: [],
      });

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: true,
      }, services);

      const text = result.content[0].text;
      expect(text).toContain("📸 **Photos:** 1");
    });
  });

  describe("Service Integration", () => {
    it("should pass correct options to MusicOrganizerService", async () => {
      mockScanDirectory.mockResolvedValue([{ path: path.join(sourceDir, "song.mp3") }]);
      mockMusicOrganize.mockResolvedValue({
        organizedFiles: 1,
        skippedFiles: 0,
        errors: [],
        movedFiles: [],
      });

      await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
        music_structure: "genre/artist",
        copy_instead_of_move: true,
      }, services);

      expect(mockMusicOrganize).toHaveBeenCalledWith(
        expect.objectContaining({
          structure: "genre/artist",
          copyInsteadOfMove: true,
        }),
      );
    });

    it("should pass correct options to PhotoOrganizerService", async () => {
      mockScanDirectory.mockResolvedValue([{ path: path.join(sourceDir, "img.jpg") }]);
      mockPhotoOrganize.mockResolvedValue({
        organizedFiles: 1,
        skippedFiles: 0,
        strippedGPSFiles: 1,
        errors: [],
        movedFiles: [],
      });

      await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
        photo_date_format: "YYYY-MM-DD",
        strip_gps: true,
      }, services);

      expect(mockPhotoOrganize).toHaveBeenCalledWith(
        expect.objectContaining({
          dateFormat: "YYYY-MM-DD",
          stripGPS: true,
        }),
      );
    });
  });

  describe("Error Handling", () => {
    it("should handle scanner errors gracefully", async () => {
      mockScanDirectory.mockRejectedValue(new Error("Scanner error"));

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
      }, services);

      expect(result.isError).toBe(true);
    });

    it("should handle music organization errors", async () => {
      mockScanDirectory.mockResolvedValue([{ path: path.join(sourceDir, "song.mp3") }]);
      mockMusicOrganize.mockResolvedValue({
        organizedFiles: 0,
        skippedFiles: 0,
        errors: [{ file: "song.mp3", error: "Metadata read failed" }],
        movedFiles: [],
      });

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
      }, services);

      const text = result.content[0].text;
      expect(text).toContain("Errors");
    });
  });
});
