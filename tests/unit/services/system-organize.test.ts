/**
 * File Organizer MCP Server v3.3.3
 * System Organize Service Tests
 */

import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import path from "path";
import os from "os";

jest.unstable_mockModule("fs/promises", () => ({
  default: {
    access: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    stat: jest.fn<() => Promise<any>>().mockResolvedValue({
      isDirectory: () => true,
      isFile: () => true,
      isSymbolicLink: () => false,
    }),
    statfs: jest
      .fn<() => Promise<any>>()
      .mockResolvedValue({ bsize: 4096, bfree: 100000000 }),
    readdir: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
    mkdir: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    rename: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    copyFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    unlink: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    readFile: jest
      .fn<() => Promise<Buffer>>()
      .mockResolvedValue(Buffer.from("test")),
    writeFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    lstat: jest
      .fn<() => Promise<any>>()
      .mockResolvedValue({ isSymbolicLink: () => false }),
  },
}));

const fs = (await import("fs/promises")).default;
const { SystemOrganizeService } =
  await import("../../../src/services/system-organize.service.js");

const mockSystemDirs = {
  music: path.join(os.homedir(), "Music"),
  documents: path.join(os.homedir(), "Documents"),
  pictures: path.join(os.homedir(), "Pictures"),
  videos: path.join(os.homedir(), "Videos"),
  downloads: path.join(os.homedir(), "Downloads"),
  desktop: path.join(os.homedir(), "Desktop"),
  temp: os.tmpdir(),
};

describe("SystemOrganizeService", () => {
  let service: InstanceType<typeof SystemOrganizeService>;
  let mockAccess: jest.Mock<() => Promise<void>>;
  let mockStat: jest.Mock<() => Promise<any>>;
  let mockStatfs: jest.Mock<() => Promise<any>>;
  let mockReaddir: jest.Mock<() => Promise<any[]>>;
  let mockMkdir: jest.Mock<() => Promise<void>>;
  let mockRename: jest.Mock<() => Promise<void>>;
  let mockCopyFile: jest.Mock<() => Promise<void>>;
  let mockUnlink: jest.Mock<() => Promise<void>>;
  let mockReadFile: jest.Mock<() => Promise<Buffer>>;
  let mockWriteFile: jest.Mock<() => Promise<void>>;
  let mockLstat: jest.Mock<() => Promise<any>>;

  beforeEach(() => {
    service = new SystemOrganizeService();

    mockAccess = fs.access as unknown as jest.Mock<() => Promise<void>>;
    mockStat = fs.stat as unknown as jest.Mock<() => Promise<any>>;
    mockStatfs = fs.statfs as unknown as jest.Mock<() => Promise<any>>;
    mockReaddir = fs.readdir as unknown as jest.Mock<() => Promise<any[]>>;
    mockMkdir = fs.mkdir as unknown as jest.Mock<() => Promise<void>>;
    mockRename = fs.rename as unknown as jest.Mock<() => Promise<void>>;
    mockCopyFile = fs.copyFile as unknown as jest.Mock<() => Promise<void>>;
    mockUnlink = fs.unlink as unknown as jest.Mock<() => Promise<void>>;
    mockReadFile = fs.readFile as unknown as jest.Mock<() => Promise<Buffer>>;
    mockWriteFile = fs.writeFile as unknown as jest.Mock<() => Promise<void>>;
    mockLstat = fs.lstat as unknown as jest.Mock<() => Promise<any>>;

    jest.clearAllMocks();

    jest
      .spyOn(service as any, "getSystemDirectories")
      .mockResolvedValue(mockSystemDirs);
  });

  describe("getSystemDirectories", () => {
    it("should return Windows paths on win32 platform", async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "win32" });

      const dirs = await service.getSystemDirectories();

      expect(dirs.downloads).toContain("Downloads");
      expect(dirs.desktop).toContain("Desktop");
      expect(dirs.music).toContain("Music");
      expect(dirs.videos).toBe(path.join(os.homedir(), "Videos"));

      Object.defineProperty(process, "platform", { value: originalPlatform });
    });

    it("should return macOS paths on darwin platform", async () => {
      service = new SystemOrganizeService();
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "darwin" });

      const dirs = await service.getSystemDirectories();

      expect(dirs.videos).toBe(path.join(os.homedir(), "Movies"));
      expect(dirs.downloads).toContain("Downloads");

      Object.defineProperty(process, "platform", { value: originalPlatform });
    });

    it("should return Linux paths on linux platform", async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "linux" });

      const dirs = await service.getSystemDirectories();

      expect(dirs.videos).toBe(path.join(os.homedir(), "Videos"));
      expect(dirs.downloads).toContain("Downloads");

      Object.defineProperty(process, "platform", { value: originalPlatform });
    });

    it("should cache system directories after first call", async () => {
      const dirs1 = await service.getSystemDirectories();
      const dirs2 = await service.getSystemDirectories();

      expect(dirs1).toBe(dirs2);
    });
  });

  describe("canWriteToDirectory", () => {
    it("should return writable true when directory is writable", async () => {
      mockAccess.mockResolvedValue(undefined);
      mockStatfs.mockResolvedValue({ bsize: 4096, bfree: 100000000 });

      const result = await service.canWriteToDirectory("/test/dir");

      expect(result.writable).toBe(true);
      expect(result.hasSpace).toBe(true);
      expect(result.availableBytes).toBeDefined();
    });

    it("should return writable false with EACCES error", async () => {
      const error = new Error("EACCES") as NodeJS.ErrnoException;
      error.code = "EACCES";
      mockAccess.mockRejectedValue(error);

      const result = await service.canWriteToDirectory("/readonly/dir");

      expect(result.writable).toBe(false);
      expect(result.reason).toBe("Permission denied");
    });

    it("should return writable false with ENOENT error", async () => {
      const error = new Error("ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      mockAccess.mockRejectedValue(error);

      const result = await service.canWriteToDirectory("/nonexistent/dir");

      expect(result.writable).toBe(false);
      expect(result.reason).toBe("Directory does not exist");
    });

    it("should warn about low disk space", async () => {
      mockAccess.mockResolvedValue(undefined);
      mockStatfs.mockResolvedValue({ bsize: 4096, bfree: 1000 });

      const result = await service.canWriteToDirectory("/low-space/dir");

      expect(result.writable).toBe(true);
      expect(result.hasSpace).toBe(false);
      expect(result.reason).toBe("Insufficient disk space");
    });

    it("should handle statfs failure gracefully", async () => {
      mockAccess.mockResolvedValue(undefined);
      mockStatfs.mockRejectedValue(new Error("statfs failed"));

      const result = await service.canWriteToDirectory("/test/dir");

      expect(result.writable).toBe(true);
      expect(result.hasSpace).toBe(true);
      expect(result.availableBytes).toBeUndefined();
    });
  });

  describe("validateSourceDir", () => {
    beforeEach(() => {
      mockStat.mockResolvedValue({
        isDirectory: () => true,
        isFile: () => false,
        isSymbolicLink: () => false,
      });
    });

    it("should reject directories outside Downloads/Desktop/Temp due to security", async () => {
      mockAccess.mockResolvedValue(undefined);
      mockLstat.mockResolvedValue({ isSymbolicLink: () => false });

      const result = await service.validateSourceDir(mockSystemDirs.documents);

      expect(result.valid).toBe(false);
    });

    it("should reject symlinks due to security", async () => {
      mockAccess.mockResolvedValue(undefined);
      mockLstat.mockResolvedValue({ isSymbolicLink: () => true });

      const result = await service.validateSourceDir(mockSystemDirs.downloads);

      expect(result.valid).toBe(false);
    });

    it("should reject non-directory paths due to security checks", async () => {
      mockStat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
      });

      const result = await service.validateSourceDir(
        path.join(mockSystemDirs.downloads, "file.txt"),
      );

      expect(result.valid).toBe(false);
    });
  });

  describe("determineSystemDestination", () => {
    it("should map Music category to music directory", async () => {
      mockAccess.mockResolvedValue(undefined);
      mockStatfs.mockResolvedValue({ bsize: 4096, bfree: 100000000 });

      const result = await service.determineSystemDestination(
        "Music",
        true,
        mockSystemDirs.downloads,
      );

      expect(result.destination).toBe(mockSystemDirs.music);
      expect(result.useLocalFallback).toBe(false);
    });

    it("should map Audio category to music directory", async () => {
      mockAccess.mockResolvedValue(undefined);
      mockStatfs.mockResolvedValue({ bsize: 4096, bfree: 100000000 });

      const result = await service.determineSystemDestination(
        "Audio",
        true,
        mockSystemDirs.downloads,
      );

      expect(result.destination).toBe(mockSystemDirs.music);
    });

    it("should map Images category to pictures directory", async () => {
      mockAccess.mockResolvedValue(undefined);
      mockStatfs.mockResolvedValue({ bsize: 4096, bfree: 100000000 });

      const result = await service.determineSystemDestination(
        "Images",
        true,
        mockSystemDirs.downloads,
      );

      expect(result.destination).toBe(mockSystemDirs.pictures);
    });

    it("should map Photos category to pictures directory", async () => {
      mockAccess.mockResolvedValue(undefined);
      mockStatfs.mockResolvedValue({ bsize: 4096, bfree: 100000000 });

      const result = await service.determineSystemDestination(
        "Photos",
        true,
        mockSystemDirs.downloads,
      );

      expect(result.destination).toBe(mockSystemDirs.pictures);
    });

    it("should map Videos category to videos directory", async () => {
      mockAccess.mockResolvedValue(undefined);
      mockStatfs.mockResolvedValue({ bsize: 4096, bfree: 100000000 });

      const result = await service.determineSystemDestination(
        "Videos",
        true,
        mockSystemDirs.downloads,
      );

      expect(result.destination).toBe(mockSystemDirs.videos);
    });

    it("should map Documents category to documents directory", async () => {
      mockAccess.mockResolvedValue(undefined);
      mockStatfs.mockResolvedValue({ bsize: 4096, bfree: 100000000 });

      const result = await service.determineSystemDestination(
        "Documents",
        true,
        mockSystemDirs.downloads,
      );

      expect(result.destination).toBe(mockSystemDirs.documents);
    });

    it("should fallback to local when useSystemDirs is false", async () => {
      const result = await service.determineSystemDestination(
        "Music",
        false,
        mockSystemDirs.downloads,
      );

      expect(result.destination).toContain("Organized");
      expect(result.useLocalFallback).toBe(true);
    });

    it("should fallback to local when system dir is not writable", async () => {
      const error = new Error("EACCES") as NodeJS.ErrnoException;
      error.code = "EACCES";
      mockAccess.mockRejectedValue(error);

      const result = await service.determineSystemDestination(
        "Music",
        true,
        mockSystemDirs.downloads,
      );

      expect(result.useLocalFallback).toBe(true);
    });

    it("should fallback to local when system dir has insufficient space", async () => {
      mockAccess.mockResolvedValue(undefined);
      mockStatfs.mockResolvedValue({ bsize: 4096, bfree: 1000 });

      const result = await service.determineSystemDestination(
        "Music",
        true,
        mockSystemDirs.downloads,
      );

      expect(result.useLocalFallback).toBe(true);
    });

    it("should fallback to local for unknown categories", async () => {
      mockAccess.mockResolvedValue(undefined);
      mockStatfs.mockResolvedValue({ bsize: 4096, bfree: 100000000 });

      const result = await service.determineSystemDestination(
        "Unknown",
        true,
        mockSystemDirs.downloads,
      );

      expect(result.useLocalFallback).toBe(true);
    });

    it("should create organized folder with category name", async () => {
      const result = await service.determineSystemDestination(
        "Music",
        false,
        mockSystemDirs.downloads,
      );

      expect(result.destination).toBe(
        path.join(mockSystemDirs.downloads, "Organized", "Music"),
      );
    });
  });

  describe("Conflict strategies", () => {
    beforeEach(() => {
      jest.spyOn(service as any, "validateSourceDir").mockResolvedValue({
        valid: true,
        normalizedPath: mockSystemDirs.downloads,
      });
      jest
        .spyOn(service as any, "determineSystemDestination")
        .mockResolvedValue({
          destination: mockSystemDirs.music,
          useLocalFallback: false,
        });
      jest
        .spyOn(service as any, "ensureDirectoryExists")
        .mockResolvedValue(undefined);
      mockAccess.mockResolvedValue(undefined);
    });

    it("should skip file when strategy is skip and file exists", async () => {
      mockReaddir.mockResolvedValue([
        { name: "song.mp3", isFile: () => true, isDirectory: () => false },
      ]);
      mockStat.mockResolvedValue({
        isFile: () => true,
        size: 1000,
        mtime: new Date(),
      });

      const result = await service.systemOrganize({
        sourceDir: mockSystemDirs.downloads,
        conflictStrategy: "skip",
      });

      expect(mockRename).not.toHaveBeenCalled();
    });

    it("should attempt to rename file when strategy is rename and file exists", async () => {
      const notExistError = new Error("ENOENT") as NodeJS.ErrnoException;
      notExistError.code = "ENOENT";

      mockReaddir.mockResolvedValue([
        { name: "song.mp3", isFile: () => true, isDirectory: () => false },
      ]);
      mockStat.mockResolvedValue({
        isFile: () => true,
        size: 1000,
        mtime: new Date(),
      });

      mockAccess
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(notExistError);

      const result = await service.systemOrganize({
        sourceDir: mockSystemDirs.downloads,
        conflictStrategy: "rename",
      });

      expect(result.details.length).toBe(1);
    });

    it("should overwrite file when strategy is overwrite", async () => {
      mockReaddir.mockResolvedValue([
        { name: "song.mp3", isFile: () => true, isDirectory: () => false },
      ]);
      mockStat.mockResolvedValue({
        isFile: () => true,
        size: 1000,
        mtime: new Date(),
      });
      mockAccess.mockResolvedValue(undefined);

      const result = await service.systemOrganize({
        sourceDir: mockSystemDirs.downloads,
        conflictStrategy: "overwrite",
      });

      expect(mockRename).toHaveBeenCalled();
    });
  });

  describe("File lock handling", () => {
    beforeEach(() => {
      jest.spyOn(service as any, "validateSourceDir").mockResolvedValue({
        valid: true,
        normalizedPath: mockSystemDirs.downloads,
      });
      jest
        .spyOn(service as any, "determineSystemDestination")
        .mockResolvedValue({
          destination: mockSystemDirs.music,
          useLocalFallback: false,
        });
      jest
        .spyOn(service as any, "ensureDirectoryExists")
        .mockResolvedValue(undefined);
    });

    it("should retry on EPERM error", async () => {
      const permError = new Error("EPERM") as NodeJS.ErrnoException;
      permError.code = "EPERM";

      mockReaddir.mockResolvedValue([
        { name: "song.mp3", isFile: () => true, isDirectory: () => false },
      ]);
      mockStat.mockResolvedValue({
        isFile: () => true,
        size: 1000,
        mtime: new Date(),
      });
      mockAccess.mockResolvedValue(undefined);

      mockRename
        .mockRejectedValueOnce(permError)
        .mockRejectedValueOnce(permError)
        .mockResolvedValueOnce(undefined);

      const result = await service.systemOrganize({
        sourceDir: mockSystemDirs.downloads,
      });

      expect(mockRename).toHaveBeenCalledTimes(3);
      expect(result.failed).toBe(0);
    });

    it("should retry on EBUSY error", async () => {
      const busyError = new Error("EBUSY") as NodeJS.ErrnoException;
      busyError.code = "EBUSY";

      mockReaddir.mockResolvedValue([
        { name: "song.mp3", isFile: () => true, isDirectory: () => false },
      ]);
      mockStat.mockResolvedValue({
        isFile: () => true,
        size: 1000,
        mtime: new Date(),
      });
      mockAccess.mockResolvedValue(undefined);

      mockRename
        .mockRejectedValueOnce(busyError)
        .mockResolvedValueOnce(undefined);

      const result = await service.systemOrganize({
        sourceDir: mockSystemDirs.downloads,
      });

      expect(mockRename).toHaveBeenCalledTimes(2);
      expect(result.failed).toBe(0);
    });

    it("should fail after max retry attempts", async () => {
      const permError = new Error("EPERM") as NodeJS.ErrnoException;
      permError.code = "EPERM";

      mockReaddir.mockResolvedValue([
        { name: "song.mp3", isFile: () => true, isDirectory: () => false },
      ]);
      mockStat.mockResolvedValue({
        isFile: () => true,
        size: 1000,
        mtime: new Date(),
      });
      mockAccess.mockResolvedValue(undefined);

      mockRename.mockRejectedValue(permError);

      const result = await service.systemOrganize({
        sourceDir: mockSystemDirs.downloads,
      });

      expect(mockRename).toHaveBeenCalledTimes(4);
      expect(result.failed).toBe(1);
    });

    it("should handle EXDEV by copying and deleting", async () => {
      const exdevError = new Error("EXDEV") as NodeJS.ErrnoException;
      exdevError.code = "EXDEV";

      mockReaddir.mockResolvedValue([
        { name: "song.mp3", isFile: () => true, isDirectory: () => false },
      ]);
      mockStat.mockResolvedValue({
        isFile: () => true,
        size: 1000,
        mtime: new Date(),
      });
      mockAccess.mockResolvedValue(undefined);

      mockRename
        .mockRejectedValueOnce(exdevError)
        .mockResolvedValueOnce(undefined);

      const result = await service.systemOrganize({
        sourceDir: mockSystemDirs.downloads,
        copyInsteadOfMove: false,
      });

      expect(mockReadFile).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalled();
      expect(mockUnlink).toHaveBeenCalled();
      expect(result.failed).toBe(0);
    });
  });

  describe("Dry run", () => {
    beforeEach(() => {
      jest.spyOn(service as any, "validateSourceDir").mockResolvedValue({
        valid: true,
        normalizedPath: mockSystemDirs.downloads,
      });
      jest
        .spyOn(service as any, "determineSystemDestination")
        .mockResolvedValue({
          destination: mockSystemDirs.music,
          useLocalFallback: false,
        });
      jest
        .spyOn(service as any, "ensureDirectoryExists")
        .mockResolvedValue(undefined);
    });

    it("should return plan without executing when dryRun is true", async () => {
      mockReaddir.mockResolvedValue([
        { name: "song.mp3", isFile: () => true, isDirectory: () => false },
      ]);
      mockStat.mockResolvedValue({
        isFile: () => true,
        size: 1000,
        mtime: new Date(),
      });
      mockAccess.mockResolvedValue(undefined);

      const result = await service.systemOrganize({
        sourceDir: mockSystemDirs.downloads,
        dryRun: true,
      });

      expect(mockRename).not.toHaveBeenCalled();
      expect(mockCopyFile).not.toHaveBeenCalled();
      expect(result.details.length).toBe(1);
      expect(result.details[0]?.file).toBe("song.mp3");
    });

    it("should create undo manifest in dry run for planning purposes", async () => {
      mockReaddir.mockResolvedValue([
        { name: "song.mp3", isFile: () => true, isDirectory: () => false },
      ]);
      mockStat.mockResolvedValue({
        isFile: () => true,
        size: 1000,
        mtime: new Date(),
      });
      mockAccess.mockResolvedValue(undefined);

      const result = await service.systemOrganize({
        sourceDir: mockSystemDirs.downloads,
        dryRun: true,
      });

      expect(result.undoManifest).toBeDefined();
      expect(result.undoManifest?.operations.length).toBe(1);
    });
  });

  describe("Empty directory handling", () => {
    beforeEach(() => {
      jest.spyOn(service as any, "validateSourceDir").mockResolvedValue({
        valid: true,
        normalizedPath: mockSystemDirs.downloads,
      });
    });

    it("should return empty result for empty directory", async () => {
      mockReaddir.mockResolvedValue([]);

      const result = await service.systemOrganize({
        sourceDir: mockSystemDirs.downloads,
      });

      expect(result.movedToSystem).toBe(0);
      expect(result.organizedLocally).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.details.length).toBe(0);
      expect(result.undoManifest).toBeUndefined();
    });

    it("should skip subdirectories when processing", async () => {
      mockReaddir.mockResolvedValue([
        { name: "subdir", isFile: () => false, isDirectory: () => true },
        { name: "file.mp3", isFile: () => true, isDirectory: () => false },
      ]);
      mockStat.mockResolvedValue({
        isFile: () => true,
        size: 1000,
        mtime: new Date(),
      });
      mockAccess.mockResolvedValue(undefined);
      mockStatfs.mockResolvedValue({ bsize: 4096, bfree: 100000000 });

      jest
        .spyOn(service as any, "determineSystemDestination")
        .mockResolvedValue({
          destination: mockSystemDirs.music,
          useLocalFallback: false,
        });
      jest
        .spyOn(service as any, "ensureDirectoryExists")
        .mockResolvedValue(undefined);

      const result = await service.systemOrganize({
        sourceDir: mockSystemDirs.downloads,
      });

      expect(result.details.length).toBe(1);
      expect(result.details[0]?.file).toBe("file.mp3");
    });
  });

  describe("Read-only directory handling", () => {
    it("should use local fallback when system dirs are read-only", async () => {
      const eaccesError = new Error("EACCES") as NodeJS.ErrnoException;
      eaccesError.code = "EACCES";
      mockAccess.mockRejectedValue(eaccesError);

      const result = await service.determineSystemDestination(
        "Music",
        true,
        mockSystemDirs.downloads,
      );

      expect(result.useLocalFallback).toBe(true);
    });
  });

  describe("copyInsteadOfMove option", () => {
    beforeEach(() => {
      jest.spyOn(service as any, "validateSourceDir").mockResolvedValue({
        valid: true,
        normalizedPath: mockSystemDirs.downloads,
      });
      jest
        .spyOn(service as any, "determineSystemDestination")
        .mockResolvedValue({
          destination: mockSystemDirs.music,
          useLocalFallback: false,
        });
      jest
        .spyOn(service as any, "ensureDirectoryExists")
        .mockResolvedValue(undefined);
      mockAccess.mockResolvedValue(undefined);
    });

    it("should copy files when copyInsteadOfMove is true", async () => {
      mockReaddir.mockResolvedValue([
        { name: "song.mp3", isFile: () => true, isDirectory: () => false },
      ]);
      mockStat.mockResolvedValue({
        isFile: () => true,
        size: 1000,
        mtime: new Date(),
      });
      mockStatfs.mockResolvedValue({ bsize: 4096, bfree: 100000000 });

      const result = await service.systemOrganize({
        sourceDir: mockSystemDirs.downloads,
        copyInsteadOfMove: true,
      });

      expect(mockCopyFile).toHaveBeenCalled();
      expect(mockUnlink).not.toHaveBeenCalled();
    });
  });

  describe("categorizeFile", () => {
    it("should return correct category for music files", () => {
      expect(service.categorizeFile("song.mp3")).toBe("Audio");
      expect(service.categorizeFile("track.flac")).toBe("Audio");
      expect(service.categorizeFile("audio.wav")).toBe("Audio");
    });

    it("should return correct category for image files", () => {
      expect(service.categorizeFile("photo.jpg")).toBe("Images");
      expect(service.categorizeFile("image.png")).toBe("Images");
    });

    it("should return correct category for document files", () => {
      expect(service.categorizeFile("document.pdf")).toBe("Documents");
      expect(service.categorizeFile("notes.txt")).toBe("Documents");
    });

    it("should return correct category for video files", () => {
      expect(service.categorizeFile("video.mp4")).toBe("Videos");
      expect(service.categorizeFile("movie.mkv")).toBe("Videos");
    });
  });
});
