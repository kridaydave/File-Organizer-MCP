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
    PathValidatorService: jest.fn().mockImplementation(() => ({
      validateStrictPath: jest.fn((p: string) => Promise.resolve(p)),
    })),
  }),
);

const { handleOrganizeSmart } = await import("../../../src/tools/smart-organization.js");

describe("Smart Organization Edge Cases", () => {
  let sourceDir: string;
  let targetDir: string;
  let baseTempDir: string;
  let services: any;

  beforeEach(async () => {
    setupLoggerMocks();

    baseTempDir = path.join(process.cwd(), "tests", "temp");
    await fs.mkdir(baseTempDir, { recursive: true });
    sourceDir = await fs.mkdtemp(path.join(baseTempDir, "test-edge-src-"));
    targetDir = await fs.mkdtemp(path.join(baseTempDir, "test-edge-tgt-"));

    services = {
      scanner: { scanDirectory: mockScanDirectory },
      musicService: { organize: mockMusicOrganize },
      photoService: { organize: mockPhotoOrganize },
    };

    jest.clearAllMocks();
  });

  afterEach(async () => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      await fs.rm(sourceDir, { recursive: true, force: true });
      await fs.rm(targetDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup
    }
    teardownLoggerMocks();
  });

  describe("Directory Edge Cases", () => {
    it("should handle empty source directory", async () => {
      mockScanDirectory.mockResolvedValue([]);

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
      }, services);

      expect(result.content[0].text).toContain("**Total Files:** 0");
    });

    it("should handle error when source and target are the same", async () => {
      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: sourceDir,
      }, services);

      expect(result.content[0].text).toContain("Error: source_dir and target_dir must be different");
    });
  });

  describe("Service Error Edge Cases", () => {
    it("should handle scanner failure", async () => {
      mockScanDirectory.mockRejectedValue(new Error("Scanner crash"));

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
      }, services);

      expect(result.isError).toBe(true);
    });

    it("should continue if music service fails but photo succeeds", async () => {
      await fs.writeFile(path.join(sourceDir, "song.mp3"), "audio");
      await fs.writeFile(path.join(sourceDir, "img.jpg"), "image");

      mockScanDirectory.mockResolvedValue([
        { path: path.join(sourceDir, "song.mp3") },
        { path: path.join(sourceDir, "img.jpg") },
      ]);

      mockMusicOrganize.mockRejectedValue(new Error("Music error"));
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
        dry_run: false,
      }, services);

      expect(result.content[0].text).toContain("📸 Photo Organization");
      expect(result.content[0].text).toContain("Organized: 1");
    });
  });

  describe("Option Combinations", () => {
    it("should respect copy_instead_of_move", async () => {
      await fs.writeFile(path.join(sourceDir, "song.mp3"), "audio");
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
        copy_instead_of_move: true,
        dry_run: false,
      }, services);

      expect(mockMusicOrganize).toHaveBeenCalledWith(
        expect.objectContaining({ copyInsteadOfMove: true })
      );
    });
  });
});
