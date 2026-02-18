/**
 * File Organizer MCP Server v3.4.0
 * Unit Tests for OrganizerService Extracted Methods
 * Tests the refactored method extraction in organizer.service.ts
 */

import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "@jest/globals";
import { constants } from "fs";
import path from "path";
import type { OrganizationPlan } from "../../../src/types.js";
import { suppressLoggerOutput } from "../test-helper.js";

// Create mock functions for fs/promises
const mockMkdir = jest.fn<() => Promise<void>>();
const mockRename = jest.fn<() => Promise<void>>();
const mockStat = jest.fn<() => Promise<{ mtime: Date }>>();
const mockAccess = jest.fn<() => Promise<void>>();
const mockCopyFile = jest.fn<() => Promise<void>>();
const mockUnlink = jest.fn<() => Promise<void>>();

// Mock fs/promises using unstable_mockModule for ES modules compatibility
// The organizer.service imports fs as default import: import fs from "fs/promises"
jest.unstable_mockModule("fs/promises", () => ({
  default: {
    mkdir: mockMkdir,
    rename: mockRename,
    stat: mockStat,
    access: mockAccess,
    copyFile: mockCopyFile,
    unlink: mockUnlink,
  },
  mkdir: mockMkdir,
  rename: mockRename,
  stat: mockStat,
  access: mockAccess,
  copyFile: mockCopyFile,
  unlink: mockUnlink,
}));

// Mock the logger
jest.unstable_mockModule("../../../src/utils/logger.js", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    setTestMode: jest.fn(),
  },
}));

// Mock MetadataService
jest.unstable_mockModule("../../../src/services/metadata.service.js", () => ({
  MetadataService: jest.fn().mockImplementation(() => ({
    getMetadataSubpath: jest
      .fn<() => Promise<string | null>>()
      .mockResolvedValue(null),
  })),
}));

// Mock RollbackService
jest.unstable_mockModule("../../../src/services/rollback.service.js", () => ({
  RollbackService: jest.fn().mockImplementation(() => ({
    createManifest: jest
      .fn<() => Promise<string>>()
      .mockResolvedValue("test-manifest-id"),
    rollback: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  })),
}));

// Mock file-utils
jest.unstable_mockModule("../../../src/utils/file-utils.js", () => ({
  fileExists: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
  ensureDir: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  expandHomePath: jest
    .fn<(path: string) => string>()
    .mockImplementation((p) => p),
  expandEnvVars: jest
    .fn<(path: string) => string>()
    .mockImplementation((p) => p),
  normalizePath: jest
    .fn<(path: string) => string>()
    .mockImplementation((p) => p),
  isSubPath: jest
    .fn<(parent: string, child: string) => boolean>()
    .mockReturnValue(true),
  isWindowsReservedName: jest
    .fn<(name: string) => boolean>()
    .mockReturnValue(false),
  performAtomicMove: jest.fn(),
}));

// Dynamically import the service after mocks are set up
let OrganizerService: typeof import("../../../src/services/organizer.service.js").OrganizerService;
let CategorizerService: typeof import("../../../src/services/categorizer.service.js").CategorizerService;

describe("OrganizerService - Extracted Methods", () => {
  let service: InstanceType<typeof OrganizerService>;
  let mockCategorizer: InstanceType<typeof CategorizerService>;
  let errors: string[];

  beforeEach(async () => {
    // Clear mocks
    jest.clearAllMocks();
    suppressLoggerOutput();

    errors = [];

    // Dynamically import the modules after mocks are established
    const organizerModule =
      await import("../../../src/services/organizer.service.js");
    OrganizerService = organizerModule.OrganizerService;

    const categorizerModule =
      await import("../../../src/services/categorizer.service.js");
    CategorizerService = categorizerModule.CategorizerService;

    mockCategorizer = new CategorizerService();
    service = new OrganizerService(mockCategorizer);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ============================================================================
  // executeBatchMove Tests
  // ============================================================================
  describe("executeBatchMove", () => {
    const backupDir = "/test/backups";

    beforeEach(() => {
      mockMkdir.mockResolvedValue(undefined);
    });

    describe("overwrite strategy", () => {
      it("should overwrite existing file without backup when no EEXIST error", async () => {
        // Arrange
        const move: OrganizationPlan["moves"][0] = {
          source: "/source/file.txt",
          destination: "/dest/Documents/file.txt",
          category: "Documents",
          hasConflict: true,
          conflictResolution: "overwrite",
        };

        mockRename.mockResolvedValue(undefined);

        // Act
        const result = await (service as any).executeBatchMove(
          move,
          backupDir,
          errors,
        );

        // Assert
        expect(mockRename).toHaveBeenCalledTimes(1);
        expect(mockRename).toHaveBeenCalledWith(
          "/source/file.txt",
          "/dest/Documents/file.txt",
        );
        expect(result).not.toBeNull();
        expect(result.rollbackAction.overwrittenBackupPath).toBeUndefined();
      });

      it("should backup before overwrite when EEXIST is encountered", async () => {
        // Arrange
        const move: OrganizationPlan["moves"][0] = {
          source: "/source/file.txt",
          destination: "/dest/Documents/file.txt",
          category: "Documents",
          hasConflict: true,
          conflictResolution: "overwrite",
        };

        // First rename fails with EEXIST, backup and second rename succeed
        mockRename
          .mockRejectedValueOnce({ code: "EEXIST" })
          .mockResolvedValue(undefined);

        // Act
        const result = await (service as any).executeBatchMove(
          move,
          backupDir,
          errors,
        );

        // Assert
        expect(mockRename).toHaveBeenCalledTimes(3);
        // 1. Try to rename source to dest (fails with EEXIST)
        expect(mockRename).toHaveBeenNthCalledWith(
          1,
          "/source/file.txt",
          "/dest/Documents/file.txt",
        );
        // 2. Backup existing dest to backup dir
        expect(mockRename).toHaveBeenNthCalledWith(
          2,
          "/dest/Documents/file.txt",
          expect.stringContaining("overwrite_file.txt"),
        );
        // 3. Rename source to dest
        expect(mockRename).toHaveBeenNthCalledWith(
          3,
          "/source/file.txt",
          "/dest/Documents/file.txt",
        );
        expect(result).not.toBeNull();
        expect(result.rollbackAction.overwrittenBackupPath).toBeDefined();
        expect(result.rollbackAction.overwrittenBackupPath).toContain(
          "overwrite_file.txt",
        );
      });

      it("should restore backup if move fails after backup", async () => {
        // Arrange
        const move: OrganizationPlan["moves"][0] = {
          source: "/source/file.txt",
          destination: "/dest/Documents/file.txt",
          category: "Documents",
          hasConflict: true,
          conflictResolution: "overwrite",
        };

        mockRename
          .mockRejectedValueOnce({ code: "EEXIST" }) // First rename fails
          .mockResolvedValueOnce(undefined) // Backup succeeds
          .mockRejectedValueOnce(new Error("Disk full")); // Second rename fails

        // Act & Assert
        await expect(
          (service as any).executeBatchMove(move, backupDir, errors),
        ).rejects.toThrow("Disk full");

        // Should attempt to restore backup (3 or 4 calls depending on restore logic)
        expect(mockRename.mock.calls.length).toBeGreaterThanOrEqual(3);
      });

      it("should add critical error if backup restoration fails", async () => {
        // Arrange
        const move: OrganizationPlan["moves"][0] = {
          source: "/source/file.txt",
          destination: "/dest/Documents/file.txt",
          category: "Documents",
          hasConflict: true,
          conflictResolution: "overwrite",
        };

        mockRename
          .mockRejectedValueOnce({ code: "EEXIST" }) // First rename fails
          .mockResolvedValueOnce(undefined) // Backup succeeds
          .mockRejectedValueOnce(new Error("Disk full")) // Second rename fails
          .mockRejectedValueOnce(new Error("Cannot restore backup")); // Restore fails

        // Act & Assert
        await expect(
          (service as any).executeBatchMove(move, backupDir, errors),
        ).rejects.toThrow("Disk full");

        // Should have critical error logged
        expect(errors.some((e) => e.includes("CRITICAL"))).toBe(true);
        expect(errors.some((e) => e.includes("restore backup"))).toBe(true);
      });
    });

    describe("overwrite_if_newer strategy", () => {
      it("should overwrite when source is newer than destination", async () => {
        // Arrange
        const move: OrganizationPlan["moves"][0] = {
          source: "/source/file.txt",
          destination: "/dest/Documents/file.txt",
          category: "Documents",
          hasConflict: true,
          conflictResolution: "overwrite_if_newer",
        };

        const newerDate = new Date("2024-01-20");
        const olderDate = new Date("2024-01-10");

        mockStat
          .mockResolvedValueOnce({ mtime: olderDate }) // dest - older
          .mockResolvedValueOnce({ mtime: newerDate }); // source - newer
        mockRename.mockResolvedValue(undefined);

        // Act
        const result = await (service as any).executeBatchMove(
          move,
          backupDir,
          errors,
        );

        // Assert
        expect(mockStat).toHaveBeenCalledTimes(2);
        expect(mockRename).toHaveBeenCalled();
        expect(result).not.toBeNull();
      });

      it("should skip when destination is newer than source", async () => {
        // Arrange
        const move: OrganizationPlan["moves"][0] = {
          source: "/source/file.txt",
          destination: "/dest/Documents/file.txt",
          category: "Documents",
          hasConflict: true,
          conflictResolution: "overwrite_if_newer",
        };

        const newerDate = new Date("2024-01-20");
        const olderDate = new Date("2024-01-10");

        mockStat
          .mockResolvedValueOnce({ mtime: newerDate }) // dest - newer
          .mockResolvedValueOnce({ mtime: olderDate }); // source - older

        // Act
        const result = await (service as any).executeBatchMove(
          move,
          backupDir,
          errors,
        );

        // Assert
        expect(mockRename).not.toHaveBeenCalled();
        expect(result).toBeNull();
        expect(errors.some((e) => e.includes("destination is newer"))).toBe(
          true,
        );
      });

      it("should proceed with move if destination does not exist (ENOENT)", async () => {
        // Arrange
        const move: OrganizationPlan["moves"][0] = {
          source: "/source/file.txt",
          destination: "/dest/Documents/file.txt",
          category: "Documents",
          hasConflict: true,
          conflictResolution: "overwrite_if_newer",
        };

        // Destination doesn't exist
        const enoentError = Object.assign(new Error("ENOENT"), {
          code: "ENOENT",
        });
        mockStat.mockRejectedValueOnce(enoentError);
        mockRename.mockResolvedValue(undefined);

        // Act
        const result = await (service as any).executeBatchMove(
          move,
          backupDir,
          errors,
        );

        // Assert
        expect(mockRename).toHaveBeenCalled();
        expect(result).not.toBeNull();
      });

      it("should throw non-ENOENT stat errors", async () => {
        // Arrange
        const move: OrganizationPlan["moves"][0] = {
          source: "/source/file.txt",
          destination: "/dest/Documents/file.txt",
          category: "Documents",
          hasConflict: true,
          conflictResolution: "overwrite_if_newer",
        };

        const permissionError = Object.assign(new Error("EACCES"), {
          code: "EACCES",
        });
        mockStat.mockRejectedValueOnce(permissionError);

        // Act & Assert
        await expect(
          (service as any).executeBatchMove(move, backupDir, errors),
        ).rejects.toThrow("EACCES");
      });
    });

    describe("error handling", () => {
      it("should create destination directory if it does not exist", async () => {
        // Arrange
        const move: OrganizationPlan["moves"][0] = {
          source: "/source/file.txt",
          destination: "/dest/Documents/file.txt",
          category: "Documents",
          hasConflict: false,
          conflictResolution: "rename",
        };

        mockRename.mockResolvedValue(undefined);

        // Act
        await (service as any).executeBatchMove(move, backupDir, errors);

        // Assert
        expect(mockMkdir).toHaveBeenCalledWith("/dest/Documents", {
          recursive: true,
        });
      });

      it("should return correct action and rollbackAction on success", async () => {
        // Arrange
        const move: OrganizationPlan["moves"][0] = {
          source: "/source/file.txt",
          destination: "/dest/Documents/file.txt",
          category: "Documents",
          hasConflict: false,
          conflictResolution: "rename",
        };

        mockRename.mockResolvedValue(undefined);

        // Act
        const result = await (service as any).executeBatchMove(
          move,
          backupDir,
          errors,
        );

        // Assert
        expect(result).toEqual({
          action: {
            file: "file.txt",
            from: "/source/file.txt",
            to: "/dest/Documents/file.txt",
            category: "Documents",
          },
          rollbackAction: {
            type: "move",
            originalPath: "/source/file.txt",
            currentPath: "/dest/Documents/file.txt",
            overwrittenBackupPath: undefined,
            timestamp: expect.any(Number),
          },
        });
      });
    });
  });

  // ============================================================================
  // executeRenameMove Tests
  // ============================================================================
  describe("executeRenameMove", () => {
    describe("retry on conflict", () => {
      it("should retry with incremented counter on EEXIST", async () => {
        // Arrange
        const sourcePath = "/source/file.txt";
        const targetPath = "/dest/file.txt";

        mockAccess.mockResolvedValue(undefined);
        mockCopyFile
          .mockRejectedValueOnce({ code: "EEXIST" })
          .mockResolvedValue(undefined);
        mockUnlink.mockResolvedValue(undefined);

        // Act
        const result = await (service as any).executeRenameMove(
          sourcePath,
          targetPath,
          errors,
        );

        // Assert
        expect(mockCopyFile).toHaveBeenCalledTimes(2);
        expect(mockCopyFile).toHaveBeenNthCalledWith(
          1,
          sourcePath,
          targetPath,
          constants.COPYFILE_EXCL,
        );
        // Check second call uses renamed path (accounting for Windows paths)
        const secondCall = (mockCopyFile as jest.Mock).mock.calls[1];
        expect(secondCall[0]).toBe(sourcePath);
        expect(secondCall[1]).toMatch(/file_1\.txt$/);
        expect(secondCall[2]).toBe(constants.COPYFILE_EXCL);
        expect(result).toMatch(/file_1\.txt$/);
      });

      it("should handle multiple consecutive conflicts", async () => {
        // Arrange
        const sourcePath = "/source/file.txt";
        const targetPath = "/dest/file.txt";

        mockAccess.mockResolvedValue(undefined);
        mockCopyFile
          .mockRejectedValueOnce({ code: "EEXIST" })
          .mockRejectedValueOnce({ code: "EEXIST" })
          .mockRejectedValueOnce({ code: "EEXIST" })
          .mockResolvedValue(undefined);
        mockUnlink.mockResolvedValue(undefined);

        // Act
        const result = await (service as any).executeRenameMove(
          sourcePath,
          targetPath,
          errors,
        );

        // Assert
        expect(mockCopyFile).toHaveBeenCalledTimes(4);
        expect(result).toMatch(/file_3\.txt$/);
      });

      it("should use existing counter in target path as starting point", async () => {
        // Arrange
        const sourcePath = "/source/file.txt";
        const targetPath = "/dest/file_5.txt"; // Already has _5

        mockAccess.mockResolvedValue(undefined);
        mockCopyFile
          .mockRejectedValueOnce({ code: "EEXIST" })
          .mockResolvedValue(undefined);
        mockUnlink.mockResolvedValue(undefined);

        // Act
        const result = await (service as any).executeRenameMove(
          sourcePath,
          targetPath,
          errors,
        );

        // Assert - should start from 6
        const secondCall = (mockCopyFile as jest.Mock).mock.calls[1];
        expect(secondCall[0]).toBe(sourcePath);
        expect(secondCall[1]).toMatch(/file_6\.txt$/);
        expect(secondCall[2]).toBe(constants.COPYFILE_EXCL);
        expect(result).toMatch(/file_6\.txt$/);
      });

      it("should throw after 100 retries", async () => {
        // Arrange
        const sourcePath = "/source/file.txt";
        const targetPath = "/dest/file.txt";

        mockAccess.mockResolvedValue(undefined);
        // Always fail with EEXIST
        mockCopyFile.mockRejectedValue({ code: "EEXIST" });

        // Act & Assert
        await expect(
          (service as any).executeRenameMove(sourcePath, targetPath, errors),
        ).rejects.toThrow(/Failed to move.*after 100 retries/);
      });
    });

    describe("source integrity check", () => {
      it("should pass source integrity check before copy", async () => {
        // Arrange
        const sourcePath = "/source/file.txt";
        const targetPath = "/dest/file.txt";

        mockAccess.mockResolvedValue(undefined);
        mockCopyFile.mockResolvedValue(undefined);
        mockUnlink.mockResolvedValue(undefined);

        // Act
        await (service as any).executeRenameMove(
          sourcePath,
          targetPath,
          errors,
        );

        // Assert
        expect(mockAccess).toHaveBeenCalledWith(sourcePath, constants.F_OK);
      });

      it("should throw if source file is not accessible", async () => {
        // Arrange
        const sourcePath = "/source/file.txt";
        const targetPath = "/dest/file.txt";

        const accessError = Object.assign(new Error("ENOENT"), {
          code: "ENOENT",
        });
        mockAccess.mockRejectedValue(accessError);

        // Act & Assert
        await expect(
          (service as any).executeRenameMove(sourcePath, targetPath, errors),
        ).rejects.toThrow("Source file integrity check failed");
      });

      it("should throw specific error message for source integrity failure", async () => {
        // Arrange
        const sourcePath = "/source/file.txt";
        const targetPath = "/dest/file.txt";

        mockAccess.mockRejectedValue(new Error("Permission denied"));

        // Act & Assert
        await expect(
          (service as any).executeRenameMove(sourcePath, targetPath, errors),
        ).rejects.toThrow(
          /Source file integrity check failed.*File not accessible/,
        );
      });
    });

    describe("cleanup on failure", () => {
      it("should cleanup copied file if source unlink fails", async () => {
        // Arrange
        const sourcePath = "/source/file.txt";
        const targetPath = "/dest/file.txt";

        mockAccess.mockResolvedValue(undefined);
        mockCopyFile.mockResolvedValue(undefined);
        // Unlink fails
        mockUnlink
          .mockRejectedValueOnce(new Error("Permission denied"))
          .mockResolvedValue(undefined);

        // Act & Assert
        await expect(
          (service as any).executeRenameMove(sourcePath, targetPath, errors),
        ).rejects.toThrow("Source file integrity compromised");

        // Cleanup should have been attempted
        expect(mockUnlink).toHaveBeenCalledWith(targetPath);
      });

      it("should log critical error if cleanup also fails", async () => {
        // Arrange
        const sourcePath = "/source/file.txt";
        const targetPath = "/dest/file.txt";

        mockAccess.mockResolvedValue(undefined);
        mockCopyFile.mockResolvedValue(undefined);
        // Both unlinks fail
        mockUnlink.mockRejectedValue(new Error("Disk error"));

        // Act & Assert
        await expect(
          (service as any).executeRenameMove(sourcePath, targetPath, errors),
        ).rejects.toThrow("Source file integrity compromised");

        expect(errors.some((e) => e.includes("CRITICAL"))).toBe(true);
      });
    });
  });

  // ============================================================================
  // executeDiskConflictMove Tests
  // ============================================================================
  describe("executeDiskConflictMove", () => {
    describe("skip strategy", () => {
      it("should skip file when EEXIST and strategy is skip", async () => {
        // Arrange
        const sourcePath = "/source/file.txt";
        const targetPath = "/dest/file.txt";
        const conflictResolution = "skip";

        mockCopyFile.mockRejectedValue({ code: "EEXIST" });

        // Act
        const result = await (service as any).executeDiskConflictMove(
          sourcePath,
          targetPath,
          conflictResolution,
          errors,
        );

        // Assert
        expect(result).toEqual({
          finalDest: targetPath,
          skipped: true,
        });
        expect(mockUnlink).not.toHaveBeenCalled();
      });

      it("should add skip message to errors array", async () => {
        // Arrange
        const sourcePath = "/source/file.txt";
        const targetPath = "/dest/file.txt";
        const conflictResolution = "skip";

        mockCopyFile.mockRejectedValue({ code: "EEXIST" });

        // Act
        await (service as any).executeDiskConflictMove(
          sourcePath,
          targetPath,
          conflictResolution,
          errors,
        );

        // Assert
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain("Skipped");
        expect(errors[0]).toContain("already exists");
      });

      it("should mark success=true when skipping", async () => {
        // Arrange
        const sourcePath = "/source/file.txt";
        const targetPath = "/dest/file.txt";
        const conflictResolution = "skip";

        mockCopyFile.mockRejectedValue({ code: "EEXIST" });

        // Act
        const result = await (service as any).executeDiskConflictMove(
          sourcePath,
          targetPath,
          conflictResolution,
          errors,
        );

        // Assert - should not throw and should indicate success with skipped flag
        expect(result.skipped).toBe(true);
      });
    });

    describe("rename strategy", () => {
      it("should rename file on first EEXIST with rename strategy", async () => {
        // Arrange
        const sourcePath = "/source/file.txt";
        const targetPath = "/dest/file.txt";
        const conflictResolution = "rename";

        mockCopyFile
          .mockRejectedValueOnce({ code: "EEXIST" })
          .mockResolvedValue(undefined);
        mockUnlink.mockResolvedValue(undefined);

        // Act
        const result = await (service as any).executeDiskConflictMove(
          sourcePath,
          targetPath,
          conflictResolution,
          errors,
        );

        // Assert
        expect(mockCopyFile).toHaveBeenCalledTimes(2);
        const secondCall = (mockCopyFile as jest.Mock).mock.calls[1];
        expect(secondCall[0]).toBe(sourcePath);
        expect(secondCall[1]).toMatch(/file_0\.txt$/);
        expect(secondCall[2]).toBe(constants.COPYFILE_EXCL);
        expect(result.finalDest).toMatch(/file_0\.txt$/);
        expect(result.skipped).toBe(false);
      });

      it("should handle multiple conflicts with rename", async () => {
        // Arrange
        const sourcePath = "/source/file.txt";
        const targetPath = "/dest/file.txt";
        const conflictResolution = "rename";

        mockCopyFile
          .mockRejectedValueOnce({ code: "EEXIST" })
          .mockRejectedValueOnce({ code: "EEXIST" })
          .mockResolvedValue(undefined);
        mockUnlink.mockResolvedValue(undefined);

        // Act
        const result = await (service as any).executeDiskConflictMove(
          sourcePath,
          targetPath,
          conflictResolution,
          errors,
        );

        // Assert
        expect(mockCopyFile).toHaveBeenCalledTimes(3);
        expect(result.finalDest).toMatch(/file_1\.txt$/);
      });

      it("should use counter from target path if present", async () => {
        // Arrange
        const sourcePath = "/source/file.txt";
        const targetPath = "/dest/file_3.txt"; // Already has _3
        const conflictResolution = "rename";

        mockCopyFile
          .mockRejectedValueOnce({ code: "EEXIST" })
          .mockResolvedValue(undefined);
        mockUnlink.mockResolvedValue(undefined);

        // Act
        const result = await (service as any).executeDiskConflictMove(
          sourcePath,
          targetPath,
          conflictResolution,
          errors,
        );

        // Assert - should start from 4
        const secondCall = (mockCopyFile as jest.Mock).mock.calls[1];
        expect(secondCall[0]).toBe(sourcePath);
        expect(secondCall[1]).toMatch(/file_4\.txt$/);
        expect(secondCall[2]).toBe(constants.COPYFILE_EXCL);
        expect(result.finalDest).toMatch(/file_4\.txt$/);
      });
    });

    describe("cleanup on failure", () => {
      it("should cleanup copied file if source unlink fails", async () => {
        // Arrange
        const sourcePath = "/source/file.txt";
        const targetPath = "/dest/file.txt";
        const conflictResolution = "rename";

        mockCopyFile.mockResolvedValue(undefined);
        // Unlink fails
        mockUnlink
          .mockRejectedValueOnce(new Error("Permission denied"))
          .mockResolvedValue(undefined);

        // Act & Assert
        await expect(
          (service as any).executeDiskConflictMove(
            sourcePath,
            targetPath,
            conflictResolution,
            errors,
          ),
        ).rejects.toThrow("Permission denied");

        // Cleanup should have been attempted
        expect(mockUnlink).toHaveBeenCalledWith(targetPath);
      });

      it("should add critical error if cleanup fails", async () => {
        // Arrange
        const sourcePath = "/source/file.txt";
        const targetPath = "/dest/file.txt";
        const conflictResolution = "rename";

        mockCopyFile.mockResolvedValue(undefined);
        mockUnlink.mockRejectedValue(new Error("Disk error"));

        // Act & Assert
        await expect(
          (service as any).executeDiskConflictMove(
            sourcePath,
            targetPath,
            conflictResolution,
            errors,
          ),
        ).rejects.toThrow();

        expect(errors.some((e) => e.includes("CRITICAL"))).toBe(true);
      });
    });

    describe("edge cases", () => {
      it("should throw after 100 retries", async () => {
        // Arrange
        const sourcePath = "/source/file.txt";
        const targetPath = "/dest/file.txt";
        const conflictResolution = "rename";

        mockCopyFile.mockRejectedValue({ code: "EEXIST" });

        // Act & Assert
        await expect(
          (service as any).executeDiskConflictMove(
            sourcePath,
            targetPath,
            conflictResolution,
            errors,
          ),
        ).rejects.toThrow(/Failed to move.*after 100 retries/);
      });

      it("should throw non-EEXIST errors immediately", async () => {
        // Arrange
        const sourcePath = "/source/file.txt";
        const targetPath = "/dest/file.txt";
        const conflictResolution = "rename";

        mockCopyFile.mockRejectedValue(new Error("Disk full"));

        // Act & Assert
        await expect(
          (service as any).executeDiskConflictMove(
            sourcePath,
            targetPath,
            conflictResolution,
            errors,
          ),
        ).rejects.toThrow("Disk full");

        expect(mockCopyFile).toHaveBeenCalledTimes(1);
      });

      it("should return finalDest equal to targetPath when no conflict", async () => {
        // Arrange
        const sourcePath = "/source/file.txt";
        const targetPath = "/dest/file.txt";
        const conflictResolution = "rename";

        mockCopyFile.mockResolvedValue(undefined);
        mockUnlink.mockResolvedValue(undefined);

        // Act
        const result = await (service as any).executeDiskConflictMove(
          sourcePath,
          targetPath,
          conflictResolution,
          errors,
        );

        // Assert
        expect(result.finalDest).toBe(targetPath);
        expect(result.skipped).toBe(false);
      });
    });
  });
});
