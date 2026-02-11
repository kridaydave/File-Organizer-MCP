/**
 * Tests for Content Screening Service - Phase 1 Security Layer
 * Tests threat detection, executable masquerading, and security screening
 */

import fs from "fs/promises";
import path from "path";
import { ContentScreeningService } from "../../../src/services/content-screening.service.js";

describe("ContentScreeningService", () => {
  let screeningService: ContentScreeningService;
  let testDir: string;
  let baseTempDir: string;

  beforeEach(async () => {
    baseTempDir = path.join(process.cwd(), "tests", "temp");
    await fs.mkdir(baseTempDir, { recursive: true });
    testDir = await fs.mkdtemp(path.join(baseTempDir, "test-screening-"));
    screeningService = new ContentScreeningService();
  });

  afterEach(async () => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  const createFile = async (name: string, content: Buffer | string) => {
    const filePath = path.join(testDir, name);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
    return filePath;
  };

  describe("Basic Screening", () => {
    it("should screen a safe PDF file successfully", async () => {
      const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
      const filePath = await createFile("document.pdf", pdfHeader);

      const result = await screeningService.screen(filePath);

      expect(result.filePath).toBe(filePath);
      expect(result.detectedType).toBe("PDF Document");
      expect(result.declaredExtension).toBe(".pdf");
      expect(result.passed).toBe(true);
      expect(result.threatLevel).toBe("none");
    });

    it("should screen a safe image file successfully", async () => {
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const filePath = await createFile("image.png", pngHeader);

      const result = await screeningService.screen(filePath);

      expect(result.passed).toBe(true);
      expect(result.threatLevel).toBe("none");
      expect(result.detectedType).toBe("PNG Image");
    });

    it("should handle empty files", async () => {
      const filePath = await createFile("empty.txt", "");

      const result = await screeningService.screen(filePath);

      expect(result.passed).toBe(true);
      expect(result.threatLevel).toBe("low");
      expect(result.issues.some((i) => i.type === "unknown_type")).toBe(true);
    });

    it("should handle non-existent files gracefully", async () => {
      const nonExistentPath = path.join(testDir, "does-not-exist.txt");

      const result = await screeningService.screen(nonExistentPath);

      expect(result.passed).toBe(false);
      expect(result.threatLevel).toBe("high");
      expect(result.issues.some((i) => i.severity === "error")).toBe(true);
    });
  });

  describe("Extension Mismatch Detection", () => {
    it("should detect extension mismatch", async () => {
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      // File claims to be JPG but is PNG
      const filePath = await createFile("image.jpg", pngHeader);

      const result = await screeningService.screen(filePath);

      expect(result.issues.some((i) => i.type === "extension_mismatch")).toBe(
        true,
      );
      expect(result.threatLevel).toBe("medium");
    });

    it("should detect JPEG with wrong extension", async () => {
      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      const filePath = await createFile("photo.png", jpegHeader);

      const result = await screeningService.screen(filePath);

      expect(result.issues.some((i) => i.type === "extension_mismatch")).toBe(
        true,
      );
      expect(result.detectedType).toBe("JPEG Image");
    });

    it("should not flag matching extensions", async () => {
      const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
      const filePath = await createFile("archive.zip", zipHeader);

      const result = await screeningService.screen(filePath);

      expect(
        result.issues.some((i) => i.type === "extension_mismatch"),
      ).toBe(false);
      expect(result.threatLevel).toBe("none");
    });
  });

  describe("Executable Masquerading Detection", () => {
    it("should detect executable disguised as PDF", async () => {
      const exeHeader = Buffer.from([0x4d, 0x5a]); // Windows EXE
      const filePath = await createFile("malware.pdf", exeHeader);

      const result = await screeningService.screen(filePath);

      expect(result.passed).toBe(false);
      expect(result.threatLevel).toBe("high");
      expect(
        result.issues.some(
          (i) =>
            i.type === "executable_disguised" && i.severity === "error",
        ),
      ).toBe(true);
    });

    it("should detect executable disguised as image", async () => {
      const exeHeader = Buffer.from([0x4d, 0x5a]);
      const filePath = await createFile("virus.jpg", exeHeader);

      const result = await screeningService.screen(filePath);

      expect(result.passed).toBe(false);
      expect(result.threatLevel).toBe("high");
      expect(
        result.issues.some((i) => i.type === "executable_disguised"),
      ).toBe(true);
    });

    it("should detect executable disguised as PNG", async () => {
      const elfHeader = Buffer.from([0x7f, 0x45, 0x4c, 0x46]); // ELF
      const filePath = await createFile("malware.png", elfHeader);

      const result = await screeningService.screen(filePath);

      expect(result.passed).toBe(false);
      expect(
        result.issues.some((i) => i.type === "executable_disguised"),
      ).toBe(true);
    });

    it("should detect executable disguised as GIF", async () => {
      const exeHeader = Buffer.from([0x4d, 0x5a]);
      const filePath = await createFile("trojan.gif", exeHeader);

      const result = await screeningService.screen(filePath);

      expect(result.passed).toBe(false);
      expect(
        result.issues.some((i) => i.type === "executable_disguised"),
      ).toBe(true);
    });

    it("should allow legitimate executables", async () => {
      const exeHeader = Buffer.from([0x4d, 0x5a]);
      const filePath = await createFile("program.exe", exeHeader);

      const result = await screeningService.screen(filePath);

      expect(result.passed).toBe(true);
      expect(result.threatLevel).toBe("none");
      expect(
        result.issues.some((i) => i.type === "executable_disguised"),
      ).toBe(false);
    });

    it("should allow legitimate ELF binaries", async () => {
      const elfHeader = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
      const filePath = await createFile("binary", elfHeader);

      const result = await screeningService.screen(filePath);

      expect(result.passed).toBe(true);
      expect(result.detectedType).toBe("ELF Executable");
    });
  });

  describe("Suspicious Filename Patterns", () => {
    it("should detect double extension with hidden executable", async () => {
      const content = " harmless content ";
      const filePath = await createFile("photo.jpg.exe", content);

      const result = await screeningService.screen(filePath);

      expect(result.passed).toBe(false);
      expect(result.threatLevel).toBe("high");
      expect(
        result.issues.some(
          (i) =>
            i.type === "suspicious_pattern" &&
            i.details?.hiddenExecutable === ".exe",
        ),
      ).toBe(true);
    });

    it("should detect double extension with hidden script", async () => {
      const content = "harmless content";
      const filePath = await createFile("document.pdf.bat", content);

      const result = await screeningService.screen(filePath);

      expect(result.passed).toBe(false);
      expect(
        result.issues.some((i) => i.type === "suspicious_pattern"),
      ).toBe(true);
    });

    it("should warn on multiple non-executable extensions", async () => {
      const content = "harmless content";
      const filePath = await createFile("archive.tar.gz.bz2", content);

      const result = await screeningService.screen(filePath);

      // Should warn but not fail
      expect(
        result.issues.some(
          (i) =>
            i.type === "suspicious_pattern" && i.severity === "warning",
        ),
      ).toBe(true);
    });

    it("should detect control characters in filename", async () => {
      // Create file with control character in name
      const content = "content";
      const fileName = "file\x01name.txt";
      const filePath = path.join(testDir, fileName);
      await fs.writeFile(filePath, content);

      const result = await screeningService.screen(filePath);

      expect(result.passed).toBe(false);
      expect(
        result.issues.some((i) =>
          i.message.includes("control characters"),
        ),
      ).toBe(true);
    });

    it("should detect right-to-left override characters", async () => {
      // U+202E is right-to-left override
      const content = "content";
      const fileName = "file\u202Etxt.exe"; // Spoofed extension
      const filePath = path.join(testDir, fileName);
      await fs.writeFile(filePath, content);

      const result = await screeningService.screen(filePath);

      expect(result.passed).toBe(false);
      expect(
        result.issues.some((i) =>
          i.message.includes("bidirectional"),
        ),
      ).toBe(true);
    });

    it("should warn on excessive dots in filename", async () => {
      const content = "content";
      const filePath = await createFile("file.name.with.many.dots.txt", content);

      const result = await screeningService.screen(filePath);

      expect(
        result.issues.some((i) =>
          i.message.includes("dots"),
        ),
      ).toBe(true);
    });
  });

  describe("Batch Screening", () => {
    it("should screen multiple files", async () => {
      const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);

      const file1 = await createFile("doc1.pdf", pdfHeader);
      const file2 = await createFile("img1.png", pngHeader);
      const file3 = await createFile("doc2.pdf", pdfHeader);

      const results = await screeningService.screenBatch([file1, file2, file3]);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.passed)).toBe(true);
    });

    it("should handle mixed safe and unsafe files", async () => {
      const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      const exeHeader = Buffer.from([0x4d, 0x5a]);

      const safeFile = await createFile("safe.pdf", pdfHeader);
      const unsafeFile = await createFile("malware.jpg", exeHeader);

      const results = await screeningService.screenBatch([safeFile, unsafeFile]);

      expect(results[0]?.passed).toBe(true);
      expect(results[1]?.passed).toBe(false);
    });
  });

  describe("Screening Report Generation", () => {
    it("should generate a comprehensive report", async () => {
      const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      const exeHeader = Buffer.from([0x4d, 0x5a]);

      const safeFile = await createFile("safe.pdf", pdfHeader);
      const unsafeFile = await createFile("malware.jpg", exeHeader);

      const results = await screeningService.screenBatch([safeFile, unsafeFile]);
      const report = screeningService.generateScreeningReport(results);

      expect(report.totalFiles).toBe(2);
      expect(report.passedCount).toBe(1);
      expect(report.failedCount).toBe(1);
      expect(report.threatSummary.high).toBe(1);
      expect(report.threatSummary.none).toBe(1);
      expect(report.timestamp).toBeInstanceOf(Date);
    });

    it("should count issues by type", async () => {
      const exeHeader = Buffer.from([0x4d, 0x5a]);
      const file = await createFile("virus.pdf", exeHeader);

      const results = await screeningService.screenBatch([file]);
      const report = screeningService.generateScreeningReport(results);

      expect(report.issuesByType["executable_disguised"]).toBeGreaterThan(0);
    });
  });

  describe("isAllowed Function", () => {
    it("should allow files when no restrictions specified", async () => {
      const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      const filePath = await createFile("doc.pdf", pdfHeader);

      const allowed = await screeningService.isAllowed(filePath);

      expect(allowed).toBe(true);
    });

    it("should allow files matching allowed types", async () => {
      const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      const filePath = await createFile("doc.pdf", pdfHeader);

      const allowed = await screeningService.isAllowed(filePath, [".pdf"]);

      expect(allowed).toBe(true);
    });

    it("should reject files not in allowed types", async () => {
      const exeHeader = Buffer.from([0x4d, 0x5a]);
      const filePath = await createFile("app.exe", exeHeader);

      const allowed = await screeningService.isAllowed(filePath, [".pdf", ".doc"]);

      expect(allowed).toBe(false);
    });

    it("should reject high threat files even if type is allowed", async () => {
      const exeHeader = Buffer.from([0x4d, 0x5a]);
      // Disguised executable
      const filePath = await createFile("malware.pdf", exeHeader);

      const allowed = await screeningService.isAllowed(filePath, [".pdf"]);

      expect(allowed).toBe(false);
    });
  });

  describe("Screening Options", () => {
    it("should skip extension check when disabled", async () => {
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const filePath = await createFile("image.jpg", pngHeader);

      const result = await screeningService.screen(filePath, {
        checkExtensionMismatch: false,
      });

      // Should not have extension mismatch issues
      expect(
        result.issues.some((i) => i.type === "extension_mismatch"),
      ).toBe(false);
    });

    it("should skip executable check when disabled", async () => {
      const exeHeader = Buffer.from([0x4d, 0x5a]);
      const filePath = await createFile("malware.pdf", exeHeader);

      const result = await screeningService.screen(filePath, {
        checkExecutableContent: false,
      });

      // Should not detect executable disguised
      expect(
        result.issues.some((i) => i.type === "executable_disguised"),
      ).toBe(false);
    });

    it("should skip suspicious pattern check when disabled", async () => {
      const content = "content";
      const filePath = await createFile("file.jpg.exe", content);

      const result = await screeningService.screen(filePath, {
        checkSuspiciousPatterns: false,
      });

      // Should not detect double extension
      expect(
        result.issues.some((i) => i.type === "suspicious_pattern"),
      ).toBe(false);
    });

    it("should fail on any warning in strict mode", async () => {
      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      // Extension mismatch
      const filePath = await createFile("image.png", jpegHeader);

      const result = await screeningService.screen(filePath, {
        strictMode: true,
      });

      expect(result.passed).toBe(false);
    });
  });

  describe("Threat Level Assessment", () => {
    it("should assign 'none' to safe files", async () => {
      const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      const filePath = await createFile("doc.pdf", pdfHeader);

      const result = await screeningService.screen(filePath);

      expect(result.threatLevel).toBe("none");
    });

    it("should assign 'low' to unknown types", async () => {
      const content = "some random content that doesn't match any signature";
      const filePath = await createFile("unknown.xyz", content);

      const result = await screeningService.screen(filePath);

      expect(result.threatLevel).toBe("low");
    });

    it("should assign 'medium' to warnings", async () => {
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      // Extension mismatch only (not executable disguised)
      const filePath = await createFile("image.jpg", pngHeader);

      const result = await screeningService.screen(filePath);

      expect(result.threatLevel).toBe("medium");
    });

    it("should assign 'high' to errors", async () => {
      const exeHeader = Buffer.from([0x4d, 0x5a]);
      const filePath = await createFile("virus.pdf", exeHeader);

      const result = await screeningService.screen(filePath);

      expect(result.threatLevel).toBe("high");
    });
  });

  describe("Archive File Screening", () => {
    it("should screen ZIP files", async () => {
      const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
      const filePath = await createFile("archive.zip", zipHeader);

      const result = await screeningService.screen(filePath);

      expect(result.passed).toBe(true);
      expect(result.detectedType).toBe("ZIP Archive");
    });

    it("should screen RAR files", async () => {
      const rarHeader = Buffer.from([
        0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00,
      ]);
      const filePath = await createFile("archive.rar", rarHeader);

      const result = await screeningService.screen(filePath);

      expect(result.passed).toBe(true);
      expect(result.detectedType).toBe("RAR Archive");
    });

    it("should screen 7Z files", async () => {
      const sevenZHeader = Buffer.from([
        0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c,
      ]);
      const filePath = await createFile("archive.7z", sevenZHeader);

      const result = await screeningService.screen(filePath);

      expect(result.passed).toBe(true);
      expect(result.detectedType).toBe("7-Zip Archive");
    });
  });

  describe("Script File Screening", () => {
    it("should detect shell scripts", async () => {
      const content = "#!/bin/sh\necho 'Hello'";
      const filePath = await createFile("script.sh", content);

      const result = await screeningService.screen(filePath);

      expect(result.detectedType).toBe("Shell Script");
    });

    it("should detect batch files", async () => {
      const content = "@echo off\necho Hello";
      const filePath = await createFile("script.bat", content);

      const result = await screeningService.screen(filePath);

      expect(result.detectedType).toBe("Batch File");
    });
  });

  describe("Edge Cases", () => {
    it("should handle files without extensions", async () => {
      const elfHeader = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
      const filePath = await createFile("elfbinary", elfHeader);

      const result = await screeningService.screen(filePath);

      expect(result.declaredExtension).toBe("");
      expect(result.detectedType).toBe("ELF Executable");
    });

    it("should handle very long filenames", async () => {
      const content = "content";
      const longName = "a".repeat(200) + ".txt";
      const filePath = await createFile(longName, content);

      const result = await screeningService.screen(filePath);

      expect(result.filePath).toBe(filePath);
      expect(result.passed).toBe(true);
    });

    it("should handle files with unicode in names", async () => {
      const content = "content";
      const unicodeName = "文件文档документ.pdf";
      const filePath = path.join(testDir, unicodeName);
      await fs.writeFile(filePath, content);

      const result = await screeningService.screen(filePath);

      expect(result.filePath).toBe(filePath);
    });
  });
});
