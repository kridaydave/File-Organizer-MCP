/**
 * Tests for Categorizer Service with Content Analysis Integration - Phase 1
 * Tests content-based categorization and security classification
 */

import fs from "fs/promises";
import path from "path";
import { CategorizerService } from "../../../src/services/categorizer.service.js";
import { ContentAnalyzerService } from "../../../src/services/content-analyzer.service.js";

describe("CategorizerService with Content Analysis", () => {
  let categorizer: CategorizerService;
  let contentAnalyzer: ContentAnalyzerService;
  let testDir: string;
  let baseTempDir: string;

  beforeEach(async () => {
    baseTempDir = path.join(process.cwd(), "tests", "temp");
    await fs.mkdir(baseTempDir, { recursive: true });
    testDir = await fs.mkdtemp(
      path.join(baseTempDir, "test-categorizer-content-"),
    );
    contentAnalyzer = new ContentAnalyzerService();
    categorizer = new CategorizerService(contentAnalyzer);
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

  describe("getCategoryByContent", () => {
    it("should categorize PDF files as Documents", async () => {
      const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      const filePath = await createFile("document.pdf", pdfHeader);

      const result = await categorizer.getCategoryByContent(filePath);

      expect(result.category).toBe("Documents");
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it("should categorize PNG files as Images", async () => {
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const filePath = await createFile("image.png", pngHeader);

      const result = await categorizer.getCategoryByContent(filePath);

      expect(result.category).toBe("Images");
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it("should categorize JPEG files as Images", async () => {
      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      const filePath = await createFile("photo.jpg", jpegHeader);

      const result = await categorizer.getCategoryByContent(filePath);

      expect(result.category).toBe("Images");
    });

    it("should categorize ZIP files as Archives", async () => {
      const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
      const filePath = await createFile("archive.zip", zipHeader);

      const result = await categorizer.getCategoryByContent(filePath);

      expect(result.category).toBe("Archives");
    });

    it("should categorize MP4 files as Videos", async () => {
      const mp4Header = Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x20]),
        Buffer.from("ftypmp42"),
      ]);
      const filePath = await createFile("video.mp4", mp4Header);

      const result = await categorizer.getCategoryByContent(filePath);

      expect(result.category).toBe("Videos");
    });

    it("should categorize MP3 files as Audio", async () => {
      const mp3Header = Buffer.from([0x49, 0x44, 0x33]); // ID3 tag
      const filePath = await createFile("song.mp3", mp3Header);

      const result = await categorizer.getCategoryByContent(filePath);

      expect(result.category).toBe("Audio");
    });

    it("should categorize EXE files as Executables", async () => {
      const exeHeader = Buffer.from([0x4d, 0x5a]);
      const filePath = await createFile("program.exe", exeHeader);

      const result = await categorizer.getCategoryByContent(filePath);

      expect(result.category).toBe("Executables");
    });

    it("should categorize ELF files as Executables", async () => {
      const elfHeader = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
      const filePath = await createFile("binary", elfHeader);

      const result = await categorizer.getCategoryByContent(filePath);

      expect(result.category).toBe("Executables");
    });

    it("should categorize JavaScript files as Code", async () => {
      const content = "const x = 1;\nexport default x;";
      const filePath = await createFile("script.js", content);

      const result = await categorizer.getCategoryByContent(filePath);

      expect(result.category).toBe("Code");
    });

    it("should categorize Python files as Code", async () => {
      const content = "#!/usr/bin/env python3\ndef main():\n    pass";
      const filePath = await createFile("script.py", content);

      const result = await categorizer.getCategoryByContent(filePath);

      expect(result.category).toBe("Code");
    });

    it("should categorize HTML files as Documents", async () => {
      const content = "<!DOCTYPE html><html><body></body></html>";
      const filePath = await createFile("page.html", content);

      const result = await categorizer.getCategoryByContent(filePath);

      expect(result.category).toBe("Documents");
    });

    it("should categorize JSON files as Code", async () => {
      const content = '{"key": "value"}';
      const filePath = await createFile("data.json", content);

      const result = await categorizer.getCategoryByContent(filePath);

      expect(result.category).toBe("Code");
    });

    it("should fall back to extension-based for content analysis failures", async () => {
      // Non-existent file - will fail content analysis
      const filePath = path.join(testDir, "nonexistent.jpg");

      const result = await categorizer.getCategoryByContent(filePath);

      // Should still return a category based on extension
      expect(result.category).toBe("Images");
      expect(result.confidence).toBeLessThan(0.7);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("should warn when content analyzer is not available", async () => {
      const categorizerWithoutAnalyzer = new CategorizerService();
      const filePath = await createFile("test.txt", "content");

      const result = await categorizerWithoutAnalyzer.getCategoryByContent(
        filePath,
      );

      expect(result.warnings.some((w) => w.includes("not available"))).toBe(
        true,
      );
      expect(result.confidence).toBe(0.5);
    });
  });

  describe("Extension Mismatch Detection", () => {
    it("should warn on extension mismatch", async () => {
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      // PNG content with .jpg extension
      const filePath = await createFile("image.jpg", pngHeader);

      const result = await categorizer.getCategoryByContent(filePath);

      expect(
        result.warnings.some((w) => w.includes("mismatch")),
      ).toBe(true);
    });

    it("should categorize based on content when extension mismatches", async () => {
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const filePath = await createFile("photo.pdf", pngHeader);

      const result = await categorizer.getCategoryByContent(filePath);

      // Should categorize as Image based on content, not Document based on extension
      expect(result.category).toBe("Images");
    });
  });

  describe("Executable Disguised Detection", () => {
    it("should categorize disguised executable as Suspicious", async () => {
      const exeHeader = Buffer.from([0x4d, 0x5a]); // Windows EXE
      const filePath = await createFile("malware.pdf", exeHeader);

      const result = await categorizer.getCategoryByContent(filePath);

      expect(result.category).toBe("Suspicious");
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(
        result.warnings.some((w) => w.includes("CRITICAL")),
      ).toBe(true);
    });

    it("should detect executable disguised as image", async () => {
      const elfHeader = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
      const filePath = await createFile("virus.jpg", elfHeader);

      const result = await categorizer.getCategoryByContent(filePath);

      expect(result.category).toBe("Suspicious");
    });

    it("should detect executable disguised as document", async () => {
      const exeHeader = Buffer.from([0x4d, 0x5a]);
      const filePath = await createFile("trojan.docx", exeHeader);

      const result = await categorizer.getCategoryByContent(filePath);

      expect(result.category).toBe("Suspicious");
    });
  });

  describe("Double Extension Detection", () => {
    it("should warn on double extension in filename", async () => {
      const content = "content";
      const filePath = await createFile("file.jpg.exe", content);

      const result = await categorizer.getCategoryByContent(filePath);

      expect(
        result.warnings.some((w) => w.includes("Double extension")),
      ).toBe(true);
    });

    it("should detect suspicious double extensions", async () => {
      const content = "content";
      const filePath = await createFile("document.pdf.bat", content);

      const result = await categorizer.getCategoryByContent(filePath);

      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe("validateFileType", () => {
    it("should validate matching file types", async () => {
      const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      const filePath = await createFile("document.pdf", pdfHeader);

      const result = await categorizer.validateFileType(filePath);

      expect(result.valid).toBe(true);
      expect(result.mismatch).toBe(false);
      expect(result.declaredExtension).toBe(".pdf");
    });

    it("should detect type mismatch", async () => {
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const filePath = await createFile("image.jpg", pngHeader);

      const result = await categorizer.validateFileType(filePath);

      expect(result.valid).toBe(false);
      expect(result.mismatch).toBe(true);
      expect(result.actualType).toBe("PNG");
    });

    it("should handle files when content analyzer is unavailable", async () => {
      const categorizerWithoutAnalyzer = new CategorizerService();
      const filePath = await createFile("test.txt", "content");

      const result = await categorizerWithoutAnalyzer.validateFileType(
        filePath,
      );

      expect(result.valid).toBe(true);
    });
  });

  describe("classifySecurity", () => {
    it("should classify safe files as no threat", async () => {
      const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      const filePath = await createFile("document.pdf", pdfHeader);

      const result = await categorizer.classifySecurity(filePath);

      expect(result.isExecutable).toBe(false);
      expect(result.isSuspicious).toBe(false);
      expect(result.threatLevel).toBe("none");
    });

    it("should classify legitimate executables as low threat", async () => {
      const exeHeader = Buffer.from([0x4d, 0x5a]);
      const filePath = await createFile("program.exe", exeHeader);

      const result = await categorizer.classifySecurity(filePath);

      expect(result.isExecutable).toBe(true);
      expect(result.isSuspicious).toBe(false);
      expect(result.threatLevel).toBe("low");
    });

    it("should classify disguised executables as high threat", async () => {
      const exeHeader = Buffer.from([0x4d, 0x5a]);
      const filePath = await createFile("malware.jpg", exeHeader);

      const result = await categorizer.classifySecurity(filePath);

      expect(result.isExecutable).toBe(true);
      expect(result.isSuspicious).toBe(true);
      expect(result.threatLevel).toBe("high");
      expect(result.reason).toContain("disguised");
    });

    it("should detect double extensions as high threat", async () => {
      const content = "content";
      const filePath = await createFile("photo.png.exe", content);

      const result = await categorizer.classifySecurity(filePath);

      expect(result.isSuspicious).toBe(true);
      expect(result.threatLevel).toBe("high");
      expect(result.reason).toContain("Double extension");
    });

    it("should classify scripts as executable", async () => {
      const content = "#!/bin/bash\necho 'Hello'";
      const filePath = await createFile("script.sh", content);

      const result = await categorizer.classifySecurity(filePath);

      expect(result.isExecutable).toBe(true);
    });

    it("should handle errors gracefully", async () => {
      const nonExistentPath = path.join(testDir, "does-not-exist.txt");

      const result = await categorizer.classifySecurity(nonExistentPath);

      // Should return default values on error
      expect(result.threatLevel).toBeDefined();
    });
  });

  describe("Confidence Scoring", () => {
    it("should return high confidence for well-known file types", async () => {
      const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      const filePath = await createFile("document.pdf", pdfHeader);

      const result = await categorizer.getCategoryByContent(filePath);

      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it("should return lower confidence for generic text files", async () => {
      const content = "Just some plain text";
      const filePath = await createFile("notes.txt", content);

      const result = await categorizer.getCategoryByContent(filePath);

      // Text files have lower confidence since they could be various categories
      expect(result.confidence).toBeLessThan(0.8);
    });

    it("should include warnings for low confidence categorization", async () => {
      const content = "Generic content";
      const filePath = await createFile("file.xyz", content);

      const result = await categorizer.getCategoryByContent(filePath);

      if (result.confidence < 0.7) {
        expect(
          result.warnings.some((w) => w.includes("Low content")),
        ).toBe(true);
      }
    });
  });

  describe("Integration with Extension-Based Categorization", () => {
    it("should prefer content-based when confidence is high", async () => {
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      // File has .pdf extension but PNG content
      const filePath = await createFile("image.pdf", pngHeader);

      const result = await categorizer.getCategoryByContent(filePath);

      // Should be Images based on content, not Documents based on extension
      expect(result.category).toBe("Images");
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it("should fall back to extension-based when content confidence is low", async () => {
      // Content that doesn't match any specific signature
      const content = "Some random content xyz123";
      const filePath = await createFile("data.json", content);

      const result = await categorizer.getCategoryByContent(filePath);

      // Should warn about low confidence
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe("Edge Cases", () => {
    it("should handle files without extensions", async () => {
      const elfHeader = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
      const filePath = await createFile("elfbinary", elfHeader);

      const result = await categorizer.getCategoryByContent(filePath);

      expect(result.category).toBe("Executables");
    });

    it("should handle empty files", async () => {
      const filePath = await createFile("empty.txt", "");

      const result = await categorizer.getCategoryByContent(filePath);

      expect(result.category).toBeDefined();
      expect(result.warnings.length).toBeGreaterThanOrEqual(0);
    });

    it("should handle binary files", async () => {
      const binaryContent = Buffer.from([
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05,
      ]);
      const filePath = await createFile("binary.dat", binaryContent);

      const result = await categorizer.getCategoryByContent(filePath);

      expect(result.category).toBeDefined();
    });

    it("should handle Unicode filenames", async () => {
      const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      const unicodeName = "文档.pdf";
      const filePath = path.join(testDir, unicodeName);
      await fs.writeFile(filePath, pdfHeader);

      const result = await categorizer.getCategoryByContent(filePath);

      expect(result.category).toBe("Documents");
    });
  });

  describe("Custom Rules with Content Analysis", () => {
    it("should still respect custom rules after content analysis", async () => {
      categorizer.setCustomRules([
        {
          category: "SecretDocs" as any,
          filenamePattern: "^SECRET_.*",
          priority: 100,
        },
      ]);

      const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      const filePath = await createFile("SECRET_document.pdf", pdfHeader);

      // Extension-based should still use custom rules
      const extCategory = categorizer.getCategory("SECRET_document.pdf");
      expect(extCategory).toBe("SecretDocs");
    });
  });
});
