/**
 * Edge Case Tests for Smart Organization Tool
 * Tests boundary conditions, unusual inputs, and error scenarios
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
      extractTopics: jest.fn((text: string) => {
        if (!text || text.trim().length < 10) {
          return { topics: [], keywords: [], language: "en", documentType: "unknown" };
        }
        return {
          topics: [{ topic: "TestTopic", confidence: 0.9, matchedKeywords: ["test"] }],
          keywords: ["test"],
          language: "en",
          documentType: "general",
        };
      }),
    },
    TopicMatch: {} as any,
  }),
);

const { handleOrganizeSmart } = await import(
  "../../../src/tools/smart-organization.js"
);

describe("Smart Organization Tool - Edge Cases", () => {
  let sourceDir: string;
  let targetDir: string;
  let baseTempDir: string;

  beforeEach(async () => {
    setupLoggerMocks();

    baseTempDir = path.join(process.cwd(), "tests", "temp");
    await fs.mkdir(baseTempDir, { recursive: true });
    sourceDir = await fs.mkdtemp(path.join(baseTempDir, "test-edge-src-"));
    targetDir = await fs.mkdtemp(path.join(baseTempDir, "test-edge-tgt-"));

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

  describe("Empty and Null Scenarios", () => {
    it("should handle empty source directory", async () => {
      mockScanDirectory.mockResolvedValue([]);

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
      });

      const text = result.content[0].text;
      expect(text).toContain("**Total Files:** 0");
      expect(text).toContain("🎵 **Music:** 0");
      expect(text).toContain("📸 **Photos:** 0");
      expect(text).toContain("📄 **Documents:** 0");

      // No directories should be created
      const targetContents = await fs.readdir(targetDir);
      expect(targetContents).toHaveLength(0);
    });

    it("should handle directory with only empty files", async () => {
      await fs.writeFile(path.join(sourceDir, "empty.mp3"), "");
      await fs.writeFile(path.join(sourceDir, "empty.jpg"), "");
      await fs.writeFile(path.join(sourceDir, "empty.txt"), "");

      mockScanDirectory.mockResolvedValue([
        { path: path.join(sourceDir, "empty.mp3") },
        { path: path.join(sourceDir, "empty.jpg") },
        { path: path.join(sourceDir, "empty.txt") },
      ]);

      mockMusicOrganize.mockResolvedValue({
        organizedFiles: 0,
        skippedFiles: 1,
        errors: [],
      });

      mockPhotoOrganize.mockResolvedValue({
        organizedFiles: 0,
        skippedFiles: 1,
        strippedGPSFiles: 0,
        errors: [],
      });

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
      });

      const text = result.content[0].text;
      expect(text).toContain("**Total Files:** 3");
    });

    it("should handle files with no extension", async () => {
      await fs.writeFile(path.join(sourceDir, "README"), "This is a readme file");
      await fs.writeFile(path.join(sourceDir, "LICENSE"), "MIT License");
      await fs.writeFile(path.join(sourceDir, "Makefile"), "all: build");

      mockScanDirectory.mockResolvedValue([
        { path: path.join(sourceDir, "README") },
        { path: path.join(sourceDir, "LICENSE") },
        { path: path.join(sourceDir, "Makefile") },
      ]);

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: true,
      });

      const text = result.content[0].text;
      expect(text).toContain("📦 **Other:** 3");
    });

    it("should handle files with dots in names but no real extension", async () => {
      await fs.writeFile(path.join(sourceDir, "file.name.with.dots"), "content");
      await fs.writeFile(path.join(sourceDir, "archive.tar.gz"), "content");

      mockScanDirectory.mockResolvedValue([
        { path: path.join(sourceDir, "file.name.with.dots") },
        { path: path.join(sourceDir, "archive.tar.gz") },
      ]);

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: true,
      });

      const text = result.content[0].text;
      // .gz is not in any category, .dots is not a recognized extension
      expect(text).toContain("📦 **Other:** 2");
    });
  });

  describe("File Extension Edge Cases", () => {
    it("should handle all supported music extensions", async () => {
      const musicExts = [".mp3", ".flac", ".ogg", ".wav", ".m4a", ".aac", ".wma", ".opus"];
      const files = musicExts.map((ext, i) => `track${i}${ext}`);

      for (const file of files) {
        await fs.writeFile(path.join(sourceDir, file), "audio");
      }

      mockScanDirectory.mockResolvedValue(
        files.map((f) => ({ path: path.join(sourceDir, f) })),
      );

      mockMusicOrganize.mockResolvedValue({
        organizedFiles: files.length,
        skippedFiles: 0,
        errors: [],
      });

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: true,
      });

      const text = result.content[0].text;
      expect(text).toContain(`🎵 **Music:** ${files.length}`);
    });

    it("should handle all supported photo extensions", async () => {
      const photoExts = [
        ".jpg", ".jpeg", ".png", ".tiff", ".tif", ".heic", ".heif",
        ".raw", ".cr2", ".cr3", ".nef", ".arw", ".dng", ".orf",
        ".rw2", ".pef", ".sr2", ".raf", ".gif", ".bmp", ".webp",
      ];
      const files = photoExts.map((ext, i) => `image${i}${ext}`);

      for (const file of files) {
        await fs.writeFile(path.join(sourceDir, file), "image");
      }

      mockScanDirectory.mockResolvedValue(
        files.map((f) => ({ path: path.join(sourceDir, f) })),
      );

      mockPhotoOrganize.mockResolvedValue({
        organizedFiles: files.length,
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
      expect(text).toContain(`📸 **Photos:** ${files.length}`);
    });

    it("should handle all supported document extensions", async () => {
      const docExts = [".pdf", ".docx", ".doc", ".txt", ".md", ".rtf", ".odt"];
      const files = docExts.map((ext, i) => `doc${i}${ext}`);

      for (const file of files) {
        await fs.writeFile(path.join(sourceDir, file), "document content with topics");
      }

      mockScanDirectory.mockResolvedValue(
        files.map((f) => ({ path: path.join(sourceDir, f) })),
      );

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: true,
      });

      const text = result.content[0].text;
      expect(text).toContain(`📄 **Documents:** ${files.length}`);
    });

    it("should handle mixed case extensions", async () => {
      await fs.writeFile(path.join(sourceDir, "song.Mp3"), "audio");
      await fs.writeFile(path.join(sourceDir, "img.JpG"), "image");
      await fs.writeFile(path.join(sourceDir, "doc.Txt"), "document content");

      mockScanDirectory.mockResolvedValue([
        { path: path.join(sourceDir, "song.Mp3") },
        { path: path.join(sourceDir, "img.JpG") },
        { path: path.join(sourceDir, "doc.Txt") },
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
      expect(text).toContain("🎵 **Music:** 1");
      expect(text).toContain("📸 **Photos:** 1");
      expect(text).toContain("📄 **Documents:** 1");
    });

    it("should handle unicode filenames", async () => {
      await fs.writeFile(path.join(sourceDir, "歌曲.mp3"), "audio");
      await fs.writeFile(path.join(sourceDir, "写真.jpg"), "image");
      await fs.writeFile(path.join(sourceDir, "文档.txt"), "document content");

      mockScanDirectory.mockResolvedValue([
        { path: path.join(sourceDir, "歌曲.mp3") },
        { path: path.join(sourceDir, "写真.jpg") },
        { path: path.join(sourceDir, "文档.txt") },
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
      expect(text).toContain("🎵 **Music:** 1");
      expect(text).toContain("📸 **Photos:** 1");
      expect(text).toContain("📄 **Documents:** 1");
    });

    it("should handle very long filenames", async () => {
      const longName = "a".repeat(200) + ".mp3";
      await fs.writeFile(path.join(sourceDir, longName), "audio");

      mockScanDirectory.mockResolvedValue([{ path: path.join(sourceDir, longName) }]);

      mockMusicOrganize.mockResolvedValue({
        organizedFiles: 1,
        skippedFiles: 0,
        errors: [],
      });

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: true,
      });

      const text = result.content[0].text;
      expect(text).toContain("🎵 **Music:** 1");
    });

    it("should handle filenames with special characters", async () => {
      const specialNames = [
        "file with spaces.mp3",
        "file-with-dashes.flac",
        "file_with_underscores.ogg",
        "file(multiple)items[special].wav",
      ];

      for (const name of specialNames) {
        await fs.writeFile(path.join(sourceDir, name), "audio");
      }

      mockScanDirectory.mockResolvedValue(
        specialNames.map((n) => ({ path: path.join(sourceDir, n) })),
      );

      mockMusicOrganize.mockResolvedValue({
        organizedFiles: specialNames.length,
        skippedFiles: 0,
        errors: [],
      });

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: true,
      });

      const text = result.content[0].text;
      expect(text).toContain(`🎵 **Music:** ${specialNames.length}`);
    });
  });

  describe("Document Content Edge Cases", () => {
    it("should handle documents with very short content", async () => {
      await fs.writeFile(path.join(sourceDir, "short.txt"), "tiny");

      mockScanDirectory.mockResolvedValue([{ path: path.join(sourceDir, "short.txt") }]);

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
      });

      const text = result.content[0].text;
      expect(text).toContain("📄 **Documents:** 1");
      // Should show 0 organized since content is too short for topic extraction
    });

    it("should handle documents with whitespace-only content", async () => {
      await fs.writeFile(path.join(sourceDir, "whitespace.txt"), "   \n\t  \n  ");

      mockScanDirectory.mockResolvedValue([{ path: path.join(sourceDir, "whitespace.txt") }]);

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
      });

      const text = result.content[0].text;
      expect(text).toContain("📄 **Documents:** 1");
    });

    it("should handle documents with very long content", async () => {
      const longContent = "word ".repeat(10000);
      await fs.writeFile(path.join(sourceDir, "long.txt"), longContent);

      mockScanDirectory.mockResolvedValue([{ path: path.join(sourceDir, "long.txt") }]);

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
      });

      const text = result.content[0].text;
      expect(text).toContain("📄 **Documents:** 1");
    });
  });

  describe("Recursive Scanning", () => {
    it("should handle nested directory structures", async () => {
      const nestedDir = path.join(sourceDir, "level1", "level2", "level3");
      await fs.mkdir(nestedDir, { recursive: true });

      await fs.writeFile(path.join(sourceDir, "root.mp3"), "audio");
      await fs.writeFile(path.join(sourceDir, "level1", "level1.jpg"), "image");
      await fs.writeFile(path.join(nestedDir, "deep.txt"), "document content");

      mockScanDirectory.mockResolvedValue([
        { path: path.join(sourceDir, "root.mp3") },
        { path: path.join(sourceDir, "level1", "level1.jpg") },
        { path: path.join(nestedDir, "deep.txt") },
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
        recursive: true,
        dry_run: true,
      });

      const text = result.content[0].text;
      expect(text).toContain("**Total Files:** 3");
    });

    it("should respect recursive=false option", async () => {
      const subDir = path.join(sourceDir, "subdir");
      await fs.mkdir(subDir, { recursive: true });

      await fs.writeFile(path.join(sourceDir, "root.mp3"), "audio");
      await fs.writeFile(path.join(subDir, "nested.jpg"), "image");

      mockScanDirectory.mockResolvedValue([
        { path: path.join(sourceDir, "root.mp3") },
        // When recursive=false, nested files shouldn't be returned
      ]);

      mockMusicOrganize.mockResolvedValue({
        organizedFiles: 1,
        skippedFiles: 0,
        errors: [],
      });

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        recursive: false,
        dry_run: true,
      });

      const text = result.content[0].text;
      expect(text).toContain("🎵 **Music:** 1");
    });
  });

  describe("Error Recovery", () => {
    it("should handle partial failures across multiple file types", async () => {
      await fs.writeFile(path.join(sourceDir, "song1.mp3"), "audio");
      await fs.writeFile(path.join(sourceDir, "song2.mp3"), "audio");
      await fs.writeFile(path.join(sourceDir, "img1.jpg"), "image");
      await fs.writeFile(path.join(sourceDir, "img2.jpg"), "image");

      mockScanDirectory.mockResolvedValue([
        { path: path.join(sourceDir, "song1.mp3") },
        { path: path.join(sourceDir, "song2.mp3") },
        { path: path.join(sourceDir, "img1.jpg") },
        { path: path.join(sourceDir, "img2.jpg") },
      ]);

      // Music: 1 success, 1 error
      mockMusicOrganize.mockResolvedValue({
        organizedFiles: 1,
        skippedFiles: 0,
        errors: [{ file: "song2.mp3", error: "Corrupt file" }],
      });

      // Photos: 1 success, 1 skipped
      mockPhotoOrganize.mockResolvedValue({
        organizedFiles: 1,
        skippedFiles: 1,
        strippedGPSFiles: 0,
        errors: [],
      });

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
      });

      const text = result.content[0].text;
      expect(text).toContain("🎵 **Music:** 2");
      expect(text).toContain("📸 **Photos:** 2");
      // Should show error section
      expect(text).toContain("Errors");
    });

    it("should handle complete service failure for one file type", async () => {
      await fs.writeFile(path.join(sourceDir, "song.mp3"), "audio");
      await fs.writeFile(path.join(sourceDir, "img.jpg"), "image");
      await fs.writeFile(path.join(sourceDir, "doc.txt"), "document content");

      mockScanDirectory.mockResolvedValue([
        { path: path.join(sourceDir, "song.mp3") },
        { path: path.join(sourceDir, "img.jpg") },
        { path: path.join(sourceDir, "doc.txt") },
      ]);

      // Music service throws
      mockMusicOrganize.mockRejectedValue(new Error("Music service unavailable"));

      // Photo service works
      mockPhotoOrganize.mockResolvedValue({
        organizedFiles: 1,
        skippedFiles: 0,
        strippedGPSFiles: 0,
        errors: [],
      });

      // Should not throw, should continue with other types
      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
      });

      expect(result.content[0].text).toBeDefined();
    });
  });

  describe("Path Validation Edge Cases", () => {
    it("should handle paths with trailing slashes", async () => {
      await fs.writeFile(path.join(sourceDir, "file.txt"), "content");

      mockScanDirectory.mockResolvedValue([{ path: path.join(sourceDir, "file.txt") }]);

      const result = await handleOrganizeSmart({
        source_dir: sourceDir + path.sep,
        target_dir: targetDir + path.sep,
        dry_run: true,
      });

      expect(result.content[0].text).toContain("📄 **Documents:** 1");
    });

    it("should handle relative paths if allowed", async () => {
      await fs.writeFile(path.join(sourceDir, "file.txt"), "content");

      mockScanDirectory.mockResolvedValue([{ path: path.join(sourceDir, "file.txt") }]);

      // This depends on path validator behavior
      const { validateStrictPath } = await import(
        "../../../src/services/path-validator.service.js"
      );
      (validateStrictPath as jest.Mock).mockResolvedValue(sourceDir);

      const result = await handleOrganizeSmart({
        source_dir: "./relative/path",
        target_dir: targetDir,
        dry_run: true,
      });

      expect(result.content[0].text).toBeDefined();
    });
  });

  describe("Concurrent and Large Scale Scenarios", () => {
    it("should handle large number of files", async () => {
      const files = [];
      for (let i = 0; i < 100; i++) {
        const ext = [".mp3", ".jpg", ".txt"][i % 3];
        const name = `file${i}${ext}`;
        files.push({ path: path.join(sourceDir, name), ext });
      }

      mockScanDirectory.mockResolvedValue(files.map((f) => ({ path: f.path })));

      mockMusicOrganize.mockResolvedValue({
        organizedFiles: 34,
        skippedFiles: 0,
        errors: [],
      });

      mockPhotoOrganize.mockResolvedValue({
        organizedFiles: 33,
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
      expect(text).toContain("**Total Files:** 100");
    });

    it("should handle single file of each type efficiently", async () => {
      await fs.writeFile(path.join(sourceDir, "song.mp3"), "audio");
      await fs.writeFile(path.join(sourceDir, "photo.jpg"), "image");
      await fs.writeFile(path.join(sourceDir, "document.txt"), "document content");

      mockScanDirectory.mockResolvedValue([
        { path: path.join(sourceDir, "song.mp3") },
        { path: path.join(sourceDir, "photo.jpg") },
        { path: path.join(sourceDir, "document.txt") },
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

      const startTime = Date.now();
      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: true,
      });
      const duration = Date.now() - startTime;

      expect(result.content[0].text).toContain("**Total Files:** 3");
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe("Option Combination Edge Cases", () => {
    it("should handle copy_instead_of_move with all file types", async () => {
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

      await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
        copy_instead_of_move: true,
      });

      expect(mockMusicOrganize).toHaveBeenCalledWith(
        expect.objectContaining({ copyInsteadOfMove: true }),
      );
      expect(mockPhotoOrganize).toHaveBeenCalledWith(
        expect.objectContaining({ copyInsteadOfMove: true }),
      );
    });

    it("should handle all photo options enabled simultaneously", async () => {
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
        photo_date_format: "YYYY/MM/DD",
        photo_group_by_camera: true,
        strip_gps: true,
      });

      expect(mockPhotoOrganize).toHaveBeenCalledWith(
        expect.objectContaining({
          dateFormat: "YYYY/MM/DD",
          groupByCamera: true,
          stripGPS: true,
        }),
      );
    });

    it("should handle create_shortcuts option for documents", async () => {
      await fs.writeFile(path.join(sourceDir, "doc.txt"), "document content with topics");

      mockScanDirectory.mockResolvedValue([{ path: path.join(sourceDir, "doc.txt") }]);

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
        create_shortcuts: true,
      });

      const text = result.content[0].text;
      expect(text).toContain("📄 **Documents:** 1");
    });
  });
});
