/**
 * File Organizer MCP Server v3.4.0
 * File Utils New Functions Unit Tests
 * Tests for isWindowsReservedName and performAtomicMove
 */

import { jest, describe, it, expect, beforeEach } from "@jest/globals";

// Mock fs/promises with default export for ESM compatibility
const mockCopyFile = jest.fn<() => Promise<void>>();
const mockUnlink = jest.fn<() => Promise<void>>();

jest.unstable_mockModule("fs/promises", () => ({
  default: {
    copyFile: mockCopyFile,
    unlink: mockUnlink,
  },
}));

jest.unstable_mockModule("fs", () => ({
  constants: {
    COPYFILE_EXCL: 1,
  },
}));

// Dynamic imports after mocks are set up
const { isWindowsReservedName, performAtomicMove } =
  await import("../../../src/utils/file-utils.js");

describe("file-utils - New Functions", () => {
  beforeEach(() => {
    mockCopyFile.mockClear();
    mockUnlink.mockClear();
  });

  describe("isWindowsReservedName", () => {
    it("should return true for 'CON'", () => {
      expect(isWindowsReservedName("CON")).toBe(true);
    });

    it("should return true for 'con' (case insensitive)", () => {
      expect(isWindowsReservedName("con")).toBe(true);
      expect(isWindowsReservedName("Con")).toBe(true);
      expect(isWindowsReservedName("cOn")).toBe(true);
    });

    it("should return true for 'CON.txt' (with extension)", () => {
      expect(isWindowsReservedName("CON.txt")).toBe(true);
      expect(isWindowsReservedName("con.TXT")).toBe(true);
    });

    it("should return true for 'PRN', 'AUX', 'NUL'", () => {
      expect(isWindowsReservedName("PRN")).toBe(true);
      expect(isWindowsReservedName("AUX")).toBe(true);
      expect(isWindowsReservedName("NUL")).toBe(true);
    });

    it("should return true for 'COM1' through 'COM9'", () => {
      for (let i = 1; i <= 9; i++) {
        expect(isWindowsReservedName(`COM${i}`)).toBe(true);
      }
    });

    it("should return true for 'LPT1' through 'LPT9'", () => {
      for (let i = 1; i <= 9; i++) {
        expect(isWindowsReservedName(`LPT${i}`)).toBe(true);
      }
    });

    it("should return false for 'CONSOLE'", () => {
      expect(isWindowsReservedName("CONSOLE")).toBe(false);
    });

    it("should return false for 'normal.txt'", () => {
      expect(isWindowsReservedName("normal.txt")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isWindowsReservedName("")).toBe(false);
    });

    it("should return false for 'COM10' (not in range)", () => {
      expect(isWindowsReservedName("COM10")).toBe(false);
    });

    it("should return false for 'LPT10' (not in range)", () => {
      expect(isWindowsReservedName("LPT10")).toBe(false);
    });

    it("should return false for null/undefined", () => {
      expect(isWindowsReservedName(null as unknown as string)).toBe(false);
      expect(isWindowsReservedName(undefined as unknown as string)).toBe(false);
    });

    it("should return false for non-string values", () => {
      expect(isWindowsReservedName(123 as unknown as string)).toBe(false);
      expect(isWindowsReservedName({} as unknown as string)).toBe(false);
    });

    // Note: path.parse().name returns the name before the FIRST extension only
    // "CON.tar.gz" -> baseName = "CON.tar", which is not a reserved name
    it("should return false for reserved names with multiple extensions (path.parse behavior)", () => {
      expect(isWindowsReservedName("CON.tar.gz")).toBe(false);
      expect(isWindowsReservedName("COM1.backup.txt")).toBe(false);
    });

    it("should return false for names that start with reserved names", () => {
      expect(isWindowsReservedName("CONNECTION")).toBe(false);
      expect(isWindowsReservedName("COMPANY")).toBe(false);
      expect(isWindowsReservedName("AUXILIARY")).toBe(false);
    });
  });

  describe("performAtomicMove", () => {
    it("should successfully copy and unlink", async () => {
      mockCopyFile.mockResolvedValue(undefined);
      mockUnlink.mockResolvedValue(undefined);

      await performAtomicMove("/source/file.txt", "/dest/file.txt");

      expect(mockCopyFile).toHaveBeenCalledWith(
        "/source/file.txt",
        "/dest/file.txt",
        1, // COPYFILE_EXCL
      );
      expect(mockUnlink).toHaveBeenCalledWith("/source/file.txt");
    });

    it("should throw on EEXIST (destination exists)", async () => {
      const eexistError = new Error("File exists") as NodeJS.ErrnoException;
      eexistError.code = "EEXIST";
      mockCopyFile.mockRejectedValue(eexistError);

      await expect(
        performAtomicMove("/source/file.txt", "/dest/file.txt"),
      ).rejects.toThrow("Cannot move file: destination already exists");

      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it("should cleanup copied file if unlink fails", async () => {
      mockCopyFile.mockResolvedValue(undefined);

      const unlinkError = new Error("Permission denied");
      mockUnlink
        .mockRejectedValueOnce(unlinkError)
        .mockResolvedValueOnce(undefined);

      await expect(
        performAtomicMove("/source/file.txt", "/dest/file.txt"),
      ).rejects.toThrow("Failed to delete source file after copy");

      // Should attempt cleanup
      expect(mockUnlink).toHaveBeenCalledTimes(2);
      expect(mockUnlink).toHaveBeenNthCalledWith(1, "/source/file.txt");
      expect(mockUnlink).toHaveBeenNthCalledWith(2, "/dest/file.txt");
    });

    it("should propagate other copy errors", async () => {
      const enoentError = new Error("No such file") as NodeJS.ErrnoException;
      enoentError.code = "ENOENT";
      mockCopyFile.mockRejectedValue(enoentError);

      await expect(
        performAtomicMove("/source/file.txt", "/dest/file.txt"),
      ).rejects.toThrow("Failed to copy file from /source/file.txt");

      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it("should handle non-errno exceptions during copy", async () => {
      mockCopyFile.mockRejectedValue(new Error("Random error"));

      await expect(
        performAtomicMove("/source/file.txt", "/dest/file.txt"),
      ).rejects.toThrow("Failed to copy file from /source/file.txt");
    });

    it("should handle cleanup failure gracefully", async () => {
      mockCopyFile.mockResolvedValue(undefined);

      const unlinkError = new Error("Permission denied on source");
      const cleanupError = new Error("Permission denied on dest");
      mockUnlink
        .mockRejectedValueOnce(unlinkError)
        .mockRejectedValueOnce(cleanupError);

      await expect(
        performAtomicMove("/source/file.txt", "/dest/file.txt"),
      ).rejects.toThrow("Failed to delete source file after copy");

      expect(mockUnlink).toHaveBeenCalledTimes(2);
    });

    it("should handle string errors in error message construction", async () => {
      mockCopyFile.mockRejectedValue("String error");

      await expect(
        performAtomicMove("/source/file.txt", "/dest/file.txt"),
      ).rejects.toThrow("Failed to copy file from /source/file.txt");
    });

    it("should handle string errors in unlink error message construction", async () => {
      mockCopyFile.mockResolvedValue(undefined);
      mockUnlink
        .mockRejectedValueOnce("String unlink error")
        .mockResolvedValueOnce(undefined);

      await expect(
        performAtomicMove("/source/file.txt", "/dest/file.txt"),
      ).rejects.toThrow("Failed to delete source file after copy");
    });
  });
});
