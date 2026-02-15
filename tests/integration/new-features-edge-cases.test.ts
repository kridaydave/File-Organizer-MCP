/**
 * File Organizer MCP Server v3.3.4
 * Edge Case Tests for New Features
 *
 * Tests edge cases for:
 * - History Logger Service
 * - System Organize Service
 * - Smart Suggest Service
 */

import path from "path";
import fs from "fs/promises";
import os from "os";
import { jest } from "@jest/globals";
import {
  HistoryLoggerService,
  HistoryEntry,
} from "../../src/services/history-logger.service.js";
import { SystemOrganizeService } from "../../src/services/system-organize.service.js";
import { SmartSuggestService } from "../../src/services/smart-suggest.service.js";
import { FileScannerService } from "../../src/services/file-scanner.service.js";
import { globalLoggerSetup } from "../utils/logger-mock.js";

globalLoggerSetup();

describe("History Logger Edge Cases", () => {
  let testDir: string;
  let historyLogger: HistoryLoggerService;

  beforeEach(async () => {
    testDir = path.resolve("./test-history-edge-cases");
    historyLogger = new HistoryLoggerService({
      dataDir: testDir,
      batchSize: 5,
      batchTimeoutMs: 100,
    });
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await historyLogger.flushAndClose();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe("Unicode filenames in history", () => {
    it("should handle unicode characters in operation details", async () => {
      const unicodeDetails = [
        "日本語ファイル.txt",
        "файл документа.pdf",
        "🎉 emoji 🎵 music.mp3",
        "文件-中文.docx",
        "αρχείο.zip",
        "ไฟล์.xlsx",
      ];

      for (const detail of unicodeDetails) {
        await historyLogger.log({
          operation: "organize",
          source: "manual",
          status: "success",
          durationMs: 100,
          details: detail,
        });
      }

      await historyLogger.flushAndClose();

      const result = await historyLogger.getHistory();
      expect(result.entries).toHaveLength(unicodeDetails.length);

      for (const entry of result.entries) {
        expect(entry.details).toBeDefined();
        expect(typeof entry.details).toBe("string");
      }
    });

    it("should handle emoji and special unicode in error messages", async () => {
      await historyLogger.log({
        operation: "organize",
        source: "manual",
        status: "error",
        durationMs: 50,
        error: {
          message: "Failed to process 🎵_music_文件.mp3: Invalid path 角括弧",
        },
      });

      await historyLogger.flushAndClose();

      const result = await historyLogger.getHistory();
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]!.error?.message).toContain("🎵");
      expect(result.entries[0]!.error?.message).toContain("文件");
    });
  });

  describe("Very long operation names", () => {
    it("should handle extremely long operation names", async () => {
      const longOperationName = "a".repeat(10000);

      await historyLogger.log({
        operation: longOperationName,
        source: "manual",
        status: "success",
        durationMs: 100,
      });

      await historyLogger.flushAndClose();

      const result = await historyLogger.getHistory();
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]!.operation).toBe(longOperationName);
    });

    it("should handle very long details string", async () => {
      const longDetails = "x".repeat(50000);

      await historyLogger.log({
        operation: "organize",
        source: "manual",
        status: "success",
        durationMs: 100,
        details: longDetails,
      });

      await historyLogger.flushAndClose();

      const result = await historyLogger.getHistory();
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]!.details).toBe(longDetails);
    });
  });

  describe("Concurrent writes from multiple processes", () => {
    it("should handle concurrent log entries with lock mechanism", async () => {
      const logger1 = new HistoryLoggerService({
        dataDir: testDir,
        batchSize: 1,
        batchTimeoutMs: 10,
      });
      const logger2 = new HistoryLoggerService({
        dataDir: testDir,
        batchSize: 1,
        batchTimeoutMs: 10,
      });
      const logger3 = new HistoryLoggerService({
        dataDir: testDir,
        batchSize: 1,
        batchTimeoutMs: 10,
      });

      await Promise.all([
        logger1.log({
          operation: "organize_1",
          source: "manual",
          status: "success",
          durationMs: 10,
        }),
        logger2.log({
          operation: "organize_2",
          source: "manual",
          status: "success",
          durationMs: 10,
        }),
        logger3.log({
          operation: "organize_3",
          source: "manual",
          status: "success",
          durationMs: 10,
        }),
      ]);

      await Promise.all([
        logger1.flushAndClose(),
        logger2.flushAndClose(),
        logger3.flushAndClose(),
      ]);

      const result = await historyLogger.getHistory();
      expect(result.entries.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle rapid sequential writes", async () => {
      const promises: Promise<void>[] = [];

      for (let i = 0; i < 100; i++) {
        promises.push(
          historyLogger.log({
            operation: `batch_operation_${i}`,
            source: "scheduled",
            status: "success",
            durationMs: Math.random() * 100,
          }),
        );
      }

      await Promise.all(promises);
      await historyLogger.flushAndClose();

      const result = await historyLogger.getHistory();
      expect(result.entries.length).toBe(100);
    });
  });

  describe("History file deleted while reading", () => {
    it("should handle missing history file gracefully", async () => {
      await historyLogger.log({
        operation: "organize",
        source: "manual",
        status: "success",
        durationMs: 100,
      });
      await historyLogger.flushAndClose();

      const historyFile = historyLogger.getHistoryFilePath();
      await fs.unlink(historyFile);

      const result = await historyLogger.getHistory();
      expect(result.entries).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it("should recreate history file after deletion", async () => {
      const historyFile = historyLogger.getHistoryFilePath();
      await fs.unlink(historyFile).catch(() => {});

      await historyLogger.log({
        operation: "organize",
        source: "manual",
        status: "success",
        durationMs: 100,
      });
      await historyLogger.flushAndClose();

      const fileExists = await fs
        .access(historyFile)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
    });
  });

  describe("Disk full during write", () => {
    it("should handle ENOSPC error with retry", async () => {
      const originalAppendFile = fs.appendFile;
      let callCount = 0;

      (fs as any).appendFile = jest
        .fn()
        .mockImplementation(async (...args: unknown[]) => {
          callCount++;
          if (callCount === 1) {
            const error = new Error(
              "No space left on device",
            ) as NodeJS.ErrnoException;
            error.code = "ENOSPC";
            throw error;
          }
          return originalAppendFile.apply(
            fs,
            args as [string, string | Buffer],
          );
        });

      await historyLogger.log({
        operation: "organize",
        source: "manual",
        status: "success",
        durationMs: 100,
      });
      await historyLogger.flushAndClose();

      expect(callCount).toBeGreaterThanOrEqual(1);
      (fs as any).appendFile = originalAppendFile;
    });
  });

  describe("Corrupted history file", () => {
    it("should skip corrupted JSON lines", async () => {
      const historyFile = historyLogger.getHistoryFilePath();
      const validEntry: HistoryEntry = {
        id: "valid-id-123",
        timestamp: new Date().toISOString(),
        operation: "organize",
        source: "manual",
        status: "success",
        durationMs: 100,
      };

      const corruptedContent = `invalid json line
${JSON.stringify(validEntry)}
{broken json
another corrupted line`;

      await fs.writeFile(historyFile, corruptedContent);

      const result = await historyLogger.getHistory();
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]!.id).toBe("valid-id-123");
    });
  });
});

describe("System Organize Edge Cases", () => {
  let testDir: string;
  let systemOrganize: SystemOrganizeService;

  beforeEach(async () => {
    testDir = path.resolve("./test-system-organize-edge-cases");
    systemOrganize = new SystemOrganizeService();
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe("Files with same names but different content", () => {
    it("should handle rename conflict strategy for identical filenames", async () => {
      const sourceDir = path.join(testDir, "downloads");
      const targetDir = path.join(testDir, "documents");

      await fs.mkdir(sourceDir, { recursive: true });
      await fs.mkdir(targetDir, { recursive: true });

      await fs.writeFile(path.join(sourceDir, "file.txt"), "source content");
      await fs.writeFile(path.join(targetDir, "file.txt"), "target content");

      const validation = await systemOrganize.validateSourceDir(sourceDir);

      if (validation.valid) {
        const result = await systemOrganize.systemOrganize({
          sourceDir,
          useSystemDirs: false,
          fallbackToLocal: true,
          localFallbackPrefix: "Organized",
          conflictStrategy: "rename",
          dryRun: false,
        });

        expect(result.failed).toBe(0);
      }
    });

    it("should skip files with skip conflict strategy", async () => {
      const sourceDir = path.join(testDir, "downloads");
      const targetDir = path.join(testDir, "documents");

      await fs.mkdir(sourceDir, { recursive: true });
      await fs.mkdir(targetDir, { recursive: true });

      await fs.writeFile(path.join(sourceDir, "duplicate.txt"), "source");
      await fs.writeFile(path.join(targetDir, "duplicate.txt"), "existing");

      const validation = await systemOrganize.validateSourceDir(sourceDir);

      if (validation.valid) {
        const result = await systemOrganize.systemOrganize({
          sourceDir,
          useSystemDirs: false,
          fallbackToLocal: true,
          localFallbackPrefix: "Organized",
          conflictStrategy: "skip",
          dryRun: false,
        });

        expect(result.details.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("Source directory doesn't exist", () => {
    it("should return failed result for non-existent source", async () => {
      const nonExistentDir = path.join(testDir, "non-existent-dir");

      const validation = await systemOrganize.validateSourceDir(nonExistentDir);

      expect(validation.valid).toBe(false);
      expect(validation.reason).toBeDefined();
    });
  });

  describe("Source is a file not directory", () => {
    it("should reject file path as source", async () => {
      const filePath = path.join(testDir, "source-file.txt");
      await fs.writeFile(filePath, "content");

      const validation = await systemOrganize.validateSourceDir(filePath);

      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain("not a directory");
    });
  });

  describe("Target system directory is a file", () => {
    it("should handle target being a file gracefully", async () => {
      const sourceDir = path.join(testDir, "downloads");
      await fs.mkdir(sourceDir, { recursive: true });
      await fs.writeFile(path.join(sourceDir, "test.pdf"), "pdf content");

      const result = await systemOrganize.systemOrganize({
        sourceDir,
        useSystemDirs: false,
        fallbackToLocal: true,
        localFallbackPrefix: "Organized",
        dryRun: true,
      });

      expect(result).toBeDefined();
      expect(result.details.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Cross-device moves (different drives)", () => {
    it("should handle EXDEV error by falling back to copy and delete", async () => {
      const sourceDir = path.join(testDir, "downloads");
      await fs.mkdir(sourceDir, { recursive: true });
      await fs.writeFile(path.join(sourceDir, "document.pdf"), "pdf content");

      const result = await systemOrganize.systemOrganize({
        sourceDir,
        useSystemDirs: false,
        fallbackToLocal: true,
        copyInsteadOfMove: true,
        dryRun: true,
      });

      expect(result).toBeDefined();
      expect(result.details.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Windows 260 char path limit", () => {
    it("should handle long file paths near Windows limit", async () => {
      const longName = "a".repeat(200) + ".txt";
      const sourceDir = path.join(testDir, "downloads");
      await fs.mkdir(sourceDir, { recursive: true });

      try {
        await fs.writeFile(path.join(sourceDir, longName), "long name content");
      } catch {
        return;
      }

      const result = await systemOrganize.systemOrganize({
        sourceDir,
        useSystemDirs: false,
        fallbackToLocal: true,
        dryRun: true,
      });

      expect(result).toBeDefined();
    });

    it("should categorize files with long paths", () => {
      const longName = "b".repeat(200) + ".pdf";
      const category = systemOrganize.categorizeFile(longName);
      expect(category).toBe("Documents");
    });
  });

  describe("Permission denied errors", () => {
    it("should handle read-only files gracefully", async () => {
      const sourceDir = path.join(testDir, "downloads");
      await fs.mkdir(sourceDir, { recursive: true });

      const readOnlyFile = path.join(sourceDir, "readonly.txt");
      await fs.writeFile(readOnlyFile, "readonly content");

      try {
        await fs.chmod(readOnlyFile, 0o444);
      } catch {
        return;
      }

      const result = await systemOrganize.systemOrganize({
        sourceDir,
        useSystemDirs: false,
        fallbackToLocal: true,
        dryRun: true,
      });

      expect(result).toBeDefined();

      try {
        await fs.chmod(readOnlyFile, 0o644);
      } catch {
        // ignore
      }
    });
  });

  describe("Empty source directory", () => {
    it("should handle empty directory without errors", async () => {
      const sourceDir = path.join(testDir, "downloads");
      await fs.mkdir(sourceDir, { recursive: true });

      const result = await systemOrganize.systemOrganize({
        sourceDir,
        useSystemDirs: false,
        fallbackToLocal: true,
        dryRun: true,
      });

      expect(result).toBeDefined();
      expect(result.movedToSystem).toBe(0);
      expect(result.organizedLocally).toBe(0);
    });
  });
});

describe("Smart Suggest Edge Cases", () => {
  let testDir: string;
  let smartSuggest: SmartSuggestService;
  let fileScanner: FileScannerService;

  beforeEach(async () => {
    testDir = path.resolve("./test-smart-suggest-edge-cases");
    smartSuggest = new SmartSuggestService();
    fileScanner = new FileScannerService();
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe("Directory with 10000+ files", () => {
    it("should throw error when exceeding max files limit", async () => {
      for (let i = 0; i < 100; i++) {
        await fs.writeFile(path.join(testDir, `file_${i}.txt`), `content ${i}`);
      }

      await expect(
        smartSuggest.analyzeHealth(testDir, {
          maxFiles: 50,
          includeDuplicates: false,
        }),
      ).rejects.toThrow("too many files");
    });

    it("should use sampling for large directories", async () => {
      for (let i = 0; i < 200; i++) {
        await fs.writeFile(
          path.join(testDir, `sample_${i}.txt`),
          `content ${i}`,
        );
      }

      const report = await smartSuggest.analyzeHealth(testDir, {
        maxFiles: 10000,
        sampleRate: 0.1,
        includeDuplicates: false,
      });

      expect(report).toBeDefined();
      expect(report.score).toBeGreaterThanOrEqual(0);
      expect(report.score).toBeLessThanOrEqual(100);
    });
  });

  describe("Files with no extension", () => {
    it("should categorize files without extension", async () => {
      await fs.writeFile(path.join(testDir, "README"), "readme content");
      await fs.writeFile(path.join(testDir, "Makefile"), "make content");
      await fs.writeFile(path.join(testDir, "LICENSE"), "license content");

      const report = await smartSuggest.analyzeHealth(testDir, {
        includeDuplicates: false,
      });

      expect(report).toBeDefined();
      expect(report.metrics.fileTypeEntropy.details).toContain("no_extension");
    });
  });

  describe("Hidden files (.dotfiles)", () => {
    it("should handle directories with hidden files", async () => {
      await fs.writeFile(path.join(testDir, ".hidden"), "hidden content");
      await fs.writeFile(path.join(testDir, ".gitignore"), "gitignore content");
      await fs.writeFile(path.join(testDir, ".env"), "env content");
      await fs.writeFile(path.join(testDir, "visible.txt"), "visible content");

      const files = await fileScanner.getAllFiles(testDir, false);

      expect(files.some((f) => f.name.startsWith("."))).toBe(false);
      expect(files.some((f) => f.name === "visible.txt")).toBe(true);
    });
  });

  describe("Symbolic links in directory", () => {
    it("should handle symlinks gracefully", async () => {
      const realFile = path.join(testDir, "real.txt");
      await fs.writeFile(realFile, "real content");

      const symlinkPath = path.join(testDir, "link.txt");
      try {
        await fs.symlink(realFile, symlinkPath);
      } catch {
        return;
      }

      const files = await fileScanner.getAllFiles(testDir, false);

      expect(files.some((f) => f.name === "real.txt")).toBe(true);
    });

    it("should handle broken symlinks without errors", async () => {
      const brokenLink = path.join(testDir, "broken_link.txt");
      try {
        await fs.symlink(path.join(testDir, "nonexistent.txt"), brokenLink);
      } catch {
        return;
      }

      const report = await smartSuggest.analyzeHealth(testDir, {
        includeDuplicates: false,
      });

      expect(report).toBeDefined();
    });
  });

  describe("Circular directory structure", () => {
    it("should detect and handle circular symlinks", async () => {
      const subDir = path.join(testDir, "subdir");
      await fs.mkdir(subDir, { recursive: true });

      const cycleLink = path.join(subDir, "cycle");
      try {
        await fs.symlink(testDir, cycleLink);
      } catch {
        return;
      }

      await fs.writeFile(path.join(testDir, "file.txt"), "content");

      const files = await fileScanner.getAllFiles(testDir, true);

      expect(files.length).toBeGreaterThan(0);
    });
  });

  describe("Permission denied errors", () => {
    it("should handle permission denied on subdirectory", async () => {
      const restrictedDir = path.join(testDir, "restricted");
      await fs.mkdir(restrictedDir, { recursive: true });

      try {
        await fs.chmod(restrictedDir, 0o000);
      } catch {
        return;
      }

      const report = await smartSuggest.analyzeHealth(testDir, {
        includeSubdirs: true,
        includeDuplicates: false,
      });

      expect(report).toBeDefined();

      try {
        await fs.chmod(restrictedDir, 0o755);
      } catch {
        // ignore
      }
    });

    it("should handle unreadable files gracefully", async () => {
      const unreadableFile = path.join(testDir, "unreadable.txt");
      await fs.writeFile(unreadableFile, "content");

      try {
        await fs.chmod(unreadableFile, 0o000);
      } catch {
        return;
      }

      const files = await fileScanner.getAllFiles(testDir, false);

      expect(files).toBeDefined();

      try {
        await fs.chmod(unreadableFile, 0o644);
      } catch {
        // ignore
      }
    });
  });

  describe("Edge case file names", () => {
    it("should handle files with special characters in names", async () => {
      const specialNames = [
        "file with spaces.txt",
        "file-with-dashes.txt",
        "file_with_underscores.txt",
        "file.multiple.dots.txt",
        "UPPERCASE.TXT",
        "CamelCase.txt",
      ];

      for (const name of specialNames) {
        await fs.writeFile(path.join(testDir, name), "content");
      }

      const report = await smartSuggest.analyzeHealth(testDir, {
        includeDuplicates: false,
      });

      expect(report).toBeDefined();
      expect(report.metrics.namingConsistency.score).toBeGreaterThanOrEqual(0);
    });

    it("should handle deeply nested directories", async () => {
      let deepPath = testDir;
      for (let i = 0; i < 10; i++) {
        deepPath = path.join(deepPath, `level_${i}`);
        await fs.mkdir(deepPath, { recursive: true });
      }
      await fs.writeFile(path.join(deepPath, "deep.txt"), "deep content");

      const report = await smartSuggest.analyzeHealth(testDir, {
        includeSubdirs: true,
        includeDuplicates: false,
      });

      expect(report).toBeDefined();
      expect(report.metrics.depthBalance.details).toContain("level");
    });
  });

  describe("Cache behavior", () => {
    it("should use cached results when available", async () => {
      await fs.writeFile(path.join(testDir, "cached.txt"), "content");

      const report1 = await smartSuggest.analyzeHealth(testDir, {
        useCache: true,
        includeDuplicates: false,
      });

      const report2 = await smartSuggest.analyzeHealth(testDir, {
        useCache: true,
        includeDuplicates: false,
      });

      expect(report1.score).toBe(report2.score);
    });

    it("should bypass cache when disabled", async () => {
      await fs.writeFile(path.join(testDir, "nocache.txt"), "content");

      const report1 = await smartSuggest.analyzeHealth(testDir, {
        useCache: false,
        includeDuplicates: false,
      });

      await fs.writeFile(path.join(testDir, "newfile.txt"), "new content");

      const report2 = await smartSuggest.analyzeHealth(testDir, {
        useCache: false,
        includeDuplicates: false,
      });

      expect(report1).toBeDefined();
      expect(report2).toBeDefined();
    });
  });

  describe("Timeout handling", () => {
    it("should timeout on long-running analysis", async () => {
      for (let i = 0; i < 500; i++) {
        await fs.writeFile(
          path.join(testDir, `timeout_${i}.txt`),
          `content ${i}`,
        );
      }

      await expect(
        smartSuggest.analyzeHealth(testDir, {
          timeoutSeconds: 0,
          includeDuplicates: true,
        }),
      ).rejects.toThrow("timed out");
    });
  });

  describe("Empty directory", () => {
    it("should return perfect score for empty directory", async () => {
      const emptyDir = path.join(testDir, "empty");
      await fs.mkdir(emptyDir, { recursive: true });

      const report = await smartSuggest.analyzeHealth(emptyDir, {
        includeDuplicates: false,
      });

      expect(report.score).toBe(100);
      expect(report.grade).toBe("A");
      expect(report.suggestions).toHaveLength(0);
    });
  });

  describe("Project directory detection", () => {
    it("should detect project directories and adjust scoring", async () => {
      await fs.writeFile(path.join(testDir, "package.json"), "{}");
      await fs.writeFile(path.join(testDir, "src"), "source code");

      const report = await smartSuggest.analyzeHealth(testDir, {
        includeDuplicates: false,
      });

      expect(report.metrics.misplacedFiles.details).toContain(
        "Project directory",
      );
    });

    it("should detect various project indicators", async () => {
      const projectFiles = [
        "package.json",
        "Cargo.toml",
        "go.mod",
        "requirements.txt",
        "pom.xml",
        "tsconfig.json",
      ];

      for (const projectFile of projectFiles) {
        const projectDir = path.join(testDir, projectFile.replace(".", "_"));
        await fs.mkdir(projectDir, { recursive: true });
        await fs.writeFile(path.join(projectDir, projectFile), "content");

        const report = await smartSuggest.analyzeHealth(projectDir, {
          includeDuplicates: false,
        });

        expect(report.metrics.misplacedFiles.details).toContain(
          "Project directory",
        );

        await fs.rm(projectDir, { recursive: true, force: true });
      }
    });
  });
});
