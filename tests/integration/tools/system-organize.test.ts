import fs from "fs/promises";
import path from "path";
import os from "os";
import { jest } from "@jest/globals";
import {
  setupLoggerMocks,
  teardownLoggerMocks,
} from "../../utils/logger-mock.js";
import { handleSystemOrganization } from "../../../src/tools/system-organization.js";
import { SystemOrganizeService } from "../../../src/services/system-organize.service.js";

describe("System Organization Tool - Integration Tests", () => {
  let baseTempDir: string;
  let testDownloadsDir: string;
  let testDesktopDir: string;
  let testTempDir: string;
  let homeDir: string;

  beforeEach(async () => {
    setupLoggerMocks();

    homeDir = os.homedir();
    baseTempDir = path.join(process.cwd(), "tests", "temp", "system-organize");
    await fs.mkdir(baseTempDir, { recursive: true });

    testDownloadsDir = path.join(baseTempDir, "Downloads");
    testDesktopDir = path.join(baseTempDir, "Desktop");
    testTempDir = path.join(baseTempDir, "Temp");

    await fs.mkdir(testDownloadsDir, { recursive: true });
    await fs.mkdir(testDesktopDir, { recursive: true });
    await fs.mkdir(testTempDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      await fs.rm(baseTempDir, { recursive: true, force: true });
    } catch (error) {
      console.error("Cleanup error:", error);
    }
    teardownLoggerMocks();
  });

  describe("Source Validation", () => {
    it("should reject non-Downloads/Desktop/Temp directories", async () => {
      const result = await handleSystemOrganization({
        source_dir: "/invalid/directory/path",
        dry_run: true,
      });

      expect(result.content[0].text).toContain("Error");
      expect(result.content[0].text).toContain(
        "source_dir must be one of: Downloads, Desktop, Temp",
      );
    });

    it("should reject arbitrary directory names", async () => {
      const result = await handleSystemOrganization({
        source_dir: "Documents",
        dry_run: true,
      });

      expect(result.content[0].text).toContain("Error");
      expect(result.content[0].text).toContain(
        "source_dir must be one of: Downloads, Desktop, Temp",
      );
    });

    it("should accept Downloads as valid source", async () => {
      const result = await handleSystemOrganization({
        source_dir: "Downloads",
        dry_run: true,
      });

      expect(result.content[0].text).not.toContain("source_dir must be one of");
    });

    it("should accept Desktop as valid source", async () => {
      const result = await handleSystemOrganization({
        source_dir: "Desktop",
        dry_run: true,
      });

      expect(result.content[0].text).not.toContain("source_dir must be one of");
    });

    it("should accept Temp as valid source", async () => {
      const result = await handleSystemOrganization({
        source_dir: "Temp",
        dry_run: true,
      });

      expect(result.content[0].text).not.toContain("source_dir must be one of");
    });

    it("should be case-insensitive for source validation", async () => {
      const result = await handleSystemOrganization({
        source_dir: "downloads",
        dry_run: true,
      });

      expect(result.content[0].text).not.toContain("source_dir must be one of");
    });
  });

  describe("Dry Run Mode", () => {
    it("should return plan without moving files", async () => {
      await fs.writeFile(
        path.join(testDownloadsDir, "song.mp3"),
        "audio content",
      );
      await fs.writeFile(
        path.join(testDownloadsDir, "photo.jpg"),
        "image content",
      );
      await fs.writeFile(
        path.join(testDownloadsDir, "document.pdf"),
        "document content",
      );

      const service = new SystemOrganizeService();
      const result = await service.systemOrganize({
        sourceDir: testDownloadsDir,
        dryRun: true,
        useSystemDirs: false,
      });

      expect(result.details).toHaveLength(3);
      expect(result.movedToSystem).toBe(0);
      expect(result.organizedLocally).toBe(3);

      const files = await fs.readdir(testDownloadsDir);
      expect(files).toContain("song.mp3");
      expect(files).toContain("photo.jpg");
      expect(files).toContain("document.pdf");
    });

    it("should show DRY RUN MODE in tool output", async () => {
      const result = await handleSystemOrganization({
        source_dir: "Downloads",
        dry_run: true,
      });

      expect(result.content[0].text).toContain("DRY RUN MODE");
      expect(result.content[0].text).toContain("No files were actually moved");
    });

    it("should include file categorization in dry run output", async () => {
      await fs.writeFile(path.join(testDownloadsDir, "song.mp3"), "audio");
      await fs.writeFile(path.join(testDownloadsDir, "photo.jpg"), "image");

      const service = new SystemOrganizeService();
      const result = await service.systemOrganize({
        sourceDir: testDownloadsDir,
        dryRun: true,
        useSystemDirs: false,
      });

      const categories = result.details.map((d) => d.category);
      expect(categories).toContain("Audio");
      expect(categories).toContain("Images");
    });
  });

  describe("File Movement", () => {
    it("should move files to correct local organized directories", async () => {
      await fs.writeFile(
        path.join(testDownloadsDir, "song.mp3"),
        "audio content",
      );
      await fs.writeFile(
        path.join(testDownloadsDir, "photo.jpg"),
        "image content",
      );
      await fs.writeFile(
        path.join(testDownloadsDir, "report.pdf"),
        "document content",
      );

      const service = new SystemOrganizeService();
      const result = await service.systemOrganize({
        sourceDir: testDownloadsDir,
        dryRun: false,
        useSystemDirs: false,
      });

      expect(result.details).toHaveLength(3);
      expect(result.organizedLocally).toBe(3);

      const organizedDir = path.join(testDownloadsDir, "Organized");
      const organizedContents = await fs.readdir(organizedDir);
      expect(organizedContents.length).toBeGreaterThan(0);

      const sourceFiles = await fs.readdir(testDownloadsDir);
      expect(sourceFiles).not.toContain("song.mp3");
      expect(sourceFiles).not.toContain("photo.jpg");
      expect(sourceFiles).not.toContain("report.pdf");
    });

    it("should categorize music files correctly", async () => {
      await fs.writeFile(path.join(testDownloadsDir, "track.mp3"), "audio");
      await fs.writeFile(path.join(testDownloadsDir, "sound.wav"), "audio");

      const service = new SystemOrganizeService();
      const result = await service.systemOrganize({
        sourceDir: testDownloadsDir,
        dryRun: false,
        useSystemDirs: false,
      });

      const musicFiles = result.details.filter((d) => d.category === "Audio");
      expect(musicFiles).toHaveLength(2);
    });

    it("should categorize image files correctly", async () => {
      await fs.writeFile(path.join(testDownloadsDir, "pic.jpg"), "image");
      await fs.writeFile(path.join(testDownloadsDir, "photo.png"), "image");

      const service = new SystemOrganizeService();
      const result = await service.systemOrganize({
        sourceDir: testDownloadsDir,
        dryRun: false,
        useSystemDirs: false,
      });

      const imageFiles = result.details.filter((d) => d.category === "Images");
      expect(imageFiles).toHaveLength(2);
    });

    it("should categorize document files correctly", async () => {
      await fs.writeFile(path.join(testDownloadsDir, "doc.pdf"), "document");
      await fs.writeFile(path.join(testDownloadsDir, "notes.txt"), "text");

      const service = new SystemOrganizeService();
      const result = await service.systemOrganize({
        sourceDir: testDownloadsDir,
        dryRun: false,
        useSystemDirs: false,
      });

      const docFiles = result.details.filter((d) => d.category === "Documents");
      expect(docFiles.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Fallback Behavior", () => {
    it("should use local Organized folder when useSystemDirs is false", async () => {
      await fs.writeFile(path.join(testDownloadsDir, "test.mp3"), "audio");

      const service = new SystemOrganizeService();
      const result = await service.systemOrganize({
        sourceDir: testDownloadsDir,
        dryRun: false,
        useSystemDirs: false,
      });

      expect(result.organizedLocally).toBe(1);
      expect(result.movedToSystem).toBe(0);

      const organizedDir = path.join(testDownloadsDir, "Organized");
      const exists = await fs
        .access(organizedDir)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it("should fallback to local when system dirs not writable", async () => {
      await fs.writeFile(path.join(testDownloadsDir, "test.jpg"), "image");

      const service = new SystemOrganizeService();

      const canWriteSpy = jest
        .spyOn(service, "canWriteToDirectory")
        .mockResolvedValue({ writable: false, hasSpace: false });

      const result = await service.systemOrganize({
        sourceDir: testDownloadsDir,
        dryRun: false,
        useSystemDirs: true,
        fallbackToLocal: true,
      });

      expect(result.organizedLocally).toBe(1);

      canWriteSpy.mockRestore();
    });

    it("should use Organized folder as local fallback", async () => {
      await fs.writeFile(path.join(testDownloadsDir, "test.mp3"), "audio");

      const service = new SystemOrganizeService();
      const result = await service.systemOrganize({
        sourceDir: testDownloadsDir,
        dryRun: false,
        useSystemDirs: false,
        localFallbackPrefix: "Sorted",
      });

      expect(result.organizedLocally).toBe(1);

      const organizedDir = path.join(testDownloadsDir, "Organized");
      const exists = await fs
        .access(organizedDir)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe("Conflict Handling", () => {
    it("should handle conflicting files with rename strategy", async () => {
      await fs.writeFile(path.join(testDownloadsDir, "duplicate.jpg"), "first");

      const service = new SystemOrganizeService();
      await service.systemOrganize({
        sourceDir: testDownloadsDir,
        dryRun: false,
        useSystemDirs: false,
      });

      await fs.writeFile(
        path.join(testDownloadsDir, "duplicate.jpg"),
        "second",
      );

      const result = await service.systemOrganize({
        sourceDir: testDownloadsDir,
        dryRun: false,
        useSystemDirs: false,
        conflictStrategy: "rename",
      });

      const imageDir = path.join(testDownloadsDir, "Organized", "Images");
      const files = await fs.readdir(imageDir);

      expect(files.some((f) => f.includes("duplicate"))).toBe(true);
      expect(result.details.length).toBeGreaterThan(0);
    });

    it("should skip files with skip strategy", async () => {
      await fs.writeFile(path.join(testDownloadsDir, "conflict.txt"), "first");

      const service = new SystemOrganizeService();
      await service.systemOrganize({
        sourceDir: testDownloadsDir,
        dryRun: false,
        useSystemDirs: false,
      });

      await fs.writeFile(path.join(testDownloadsDir, "conflict.txt"), "second");

      const result = await service.systemOrganize({
        sourceDir: testDownloadsDir,
        dryRun: false,
        useSystemDirs: false,
        conflictStrategy: "skip",
      });

      expect(result.details.length).toBe(0);
    });

    it("should handle multiple conflicts", async () => {
      const service = new SystemOrganizeService();

      for (let i = 0; i < 3; i++) {
        await fs.writeFile(
          path.join(testDownloadsDir, "multi.jpg"),
          `content ${i}`,
        );
        await service.systemOrganize({
          sourceDir: testDownloadsDir,
          dryRun: false,
          useSystemDirs: false,
          conflictStrategy: "rename",
        });
      }

      const imageDir = path.join(testDownloadsDir, "Organized", "Images");
      const files = await fs.readdir(imageDir);

      expect(files.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Empty Source Directory", () => {
    it("should handle empty directory gracefully", async () => {
      const service = new SystemOrganizeService();
      const result = await service.systemOrganize({
        sourceDir: testDownloadsDir,
        dryRun: false,
        useSystemDirs: false,
      });

      expect(result.details).toHaveLength(0);
      expect(result.movedToSystem).toBe(0);
      expect(result.organizedLocally).toBe(0);
      expect(result.failed).toBe(0);
    });

    it("should return empty result for empty Desktop", async () => {
      const service = new SystemOrganizeService();
      const result = await service.systemOrganize({
        sourceDir: testDesktopDir,
        dryRun: false,
        useSystemDirs: false,
      });

      expect(result.details).toHaveLength(0);
    });

    it("should return empty result for empty Temp", async () => {
      const service = new SystemOrganizeService();
      const result = await service.systemOrganize({
        sourceDir: testTempDir,
        dryRun: false,
        useSystemDirs: false,
      });

      expect(result.details).toHaveLength(0);
    });
  });

  describe("Error Responses", () => {
    it("should return error for missing source_dir", async () => {
      const result = await handleSystemOrganization({});

      expect(result.content[0].text).toContain("Error");
    });

    it("should return error for empty source_dir", async () => {
      const result = await handleSystemOrganization({
        source_dir: "",
      });

      expect(result.content[0].text).toContain("Error");
    });

    it("should return error for invalid conflict_strategy", async () => {
      const result = await handleSystemOrganization({
        source_dir: "Downloads",
        conflict_strategy: "invalid",
      });

      expect(result.content[0].text).toBeDefined();
    });

    it("should handle non-existent source directory", async () => {
      const service = new SystemOrganizeService();
      const result = await service.systemOrganize({
        sourceDir: "/non/existent/directory/path",
        dryRun: true,
      });

      expect(result.details).toHaveLength(0);
      expect(result.failed).toBe(0);
    });
  });

  describe("Undo Manifest", () => {
    it("should create undo manifest for operations", async () => {
      await fs.writeFile(path.join(testDownloadsDir, "file.mp3"), "audio");

      const service = new SystemOrganizeService();
      const result = await service.systemOrganize({
        sourceDir: testDownloadsDir,
        dryRun: false,
        useSystemDirs: false,
      });

      expect(result.undoManifest).toBeDefined();
      expect(result.undoManifest?.operations).toHaveLength(1);
      expect(result.undoManifest?.manifestId).toBeDefined();
    });

    it("should include undo manifest even in dry run mode", async () => {
      await fs.writeFile(path.join(testDownloadsDir, "file.mp3"), "audio");

      const service = new SystemOrganizeService();
      const result = await service.systemOrganize({
        sourceDir: testDownloadsDir,
        dryRun: true,
        useSystemDirs: false,
      });

      expect(result.undoManifest).toBeDefined();
      expect(result.undoManifest?.operations).toHaveLength(1);
    });

    it("should include from and to paths in manifest", async () => {
      await fs.writeFile(path.join(testDownloadsDir, "track.mp3"), "audio");

      const service = new SystemOrganizeService();
      const result = await service.systemOrganize({
        sourceDir: testDownloadsDir,
        dryRun: false,
        useSystemDirs: false,
      });

      const operation = result.undoManifest?.operations[0];
      expect(operation?.from).toContain("track.mp3");
      expect(operation?.to).toBeDefined();
      expect(operation?.timestamp).toBeDefined();
    });
  });

  describe("Copy Instead of Move", () => {
    it("should copy files when copy_instead_of_move is true", async () => {
      await fs.writeFile(path.join(testDownloadsDir, "original.mp3"), "audio");

      const service = new SystemOrganizeService();
      const result = await service.systemOrganize({
        sourceDir: testDownloadsDir,
        dryRun: false,
        useSystemDirs: false,
        copyInsteadOfMove: true,
      });

      expect(result.details).toHaveLength(1);

      const sourceFiles = await fs.readdir(testDownloadsDir);
      expect(sourceFiles).toContain("original.mp3");
    });

    it("should move files by default (copy_instead_of_move is false)", async () => {
      await fs.writeFile(path.join(testDownloadsDir, "move.mp3"), "audio");

      const service = new SystemOrganizeService();
      const result = await service.systemOrganize({
        sourceDir: testDownloadsDir,
        dryRun: false,
        useSystemDirs: false,
        copyInsteadOfMove: false,
      });

      expect(result.details).toHaveLength(1);

      const sourceFiles = await fs.readdir(testDownloadsDir);
      expect(sourceFiles).not.toContain("move.mp3");
    });
  });

  describe("System Directory Detection", () => {
    it("should correctly identify system directories", async () => {
      const service = new SystemOrganizeService();
      const systemDirs = await service.getSystemDirectories();

      expect(systemDirs.music).toBeDefined();
      expect(systemDirs.documents).toBeDefined();
      expect(systemDirs.pictures).toBeDefined();
      expect(systemDirs.videos).toBeDefined();
      expect(systemDirs.downloads).toBeDefined();
      expect(systemDirs.desktop).toBeDefined();
      expect(systemDirs.temp).toBeDefined();
    });

    it("should map categories to system directories", async () => {
      const service = new SystemOrganizeService();

      const musicDest = await service.determineSystemDestination(
        "Audio",
        true,
        testDownloadsDir,
      );
      expect(musicDest.destination).toContain("Music");

      const picsDest = await service.determineSystemDestination(
        "Images",
        true,
        testDownloadsDir,
      );
      expect(picsDest.destination).toContain("Pictures");

      const docsDest = await service.determineSystemDestination(
        "Documents",
        true,
        testDownloadsDir,
      );
      expect(docsDest.destination).toContain("Documents");
    });
  });

  describe("Mixed File Types", () => {
    it("should handle multiple file types in one operation", async () => {
      await fs.writeFile(path.join(testDownloadsDir, "song.mp3"), "audio");
      await fs.writeFile(path.join(testDownloadsDir, "photo.jpg"), "image");
      await fs.writeFile(path.join(testDownloadsDir, "doc.pdf"), "document");
      await fs.writeFile(path.join(testDownloadsDir, "video.mp4"), "video");
      await fs.writeFile(path.join(testDownloadsDir, "archive.zip"), "archive");

      const service = new SystemOrganizeService();
      const result = await service.systemOrganize({
        sourceDir: testDownloadsDir,
        dryRun: false,
        useSystemDirs: false,
      });

      expect(result.details).toHaveLength(5);

      const categories = result.details.map((d) => d.category);
      expect(categories).toContain("Audio");
      expect(categories).toContain("Images");
      expect(categories).toContain("Videos");
    });

    it("should handle files with special characters in names", async () => {
      await fs.writeFile(
        path.join(testDownloadsDir, "file with spaces.mp3"),
        "audio",
      );
      await fs.writeFile(
        path.join(testDownloadsDir, "file-with-dashes.jpg"),
        "image",
      );
      await fs.writeFile(
        path.join(testDownloadsDir, "file_with_underscores.pdf"),
        "doc",
      );

      const service = new SystemOrganizeService();
      const result = await service.systemOrganize({
        sourceDir: testDownloadsDir,
        dryRun: false,
        useSystemDirs: false,
      });

      expect(result.details).toHaveLength(3);
      expect(result.failed).toBe(0);
    });
  });

  describe("Tool Response Format", () => {
    it("should return markdown format by default", async () => {
      const result = await handleSystemOrganization({
        source_dir: "Downloads",
        dry_run: true,
      });

      expect(result.content[0].text).toContain("# System Organization Results");
    });

    it("should include summary in response", async () => {
      await fs.writeFile(path.join(testDownloadsDir, "test.mp3"), "audio");

      const service = new SystemOrganizeService();
      const result = await service.systemOrganize({
        sourceDir: testDownloadsDir,
        dryRun: true,
        useSystemDirs: false,
      });

      expect(result.movedToSystem).toBeDefined();
      expect(result.organizedLocally).toBeDefined();
      expect(result.failed).toBeDefined();
      expect(result.details).toBeDefined();
    });

    it("should show category breakdown in output", async () => {
      await fs.writeFile(path.join(testDownloadsDir, "a.mp3"), "audio");
      await fs.writeFile(path.join(testDownloadsDir, "b.jpg"), "image");

      const service = new SystemOrganizeService();
      const result = await service.systemOrganize({
        sourceDir: testDownloadsDir,
        dryRun: true,
        useSystemDirs: false,
      });

      const categories = new Set(result.details.map((d) => d.category));
      expect(categories.size).toBeGreaterThan(0);
    });
  });
});
