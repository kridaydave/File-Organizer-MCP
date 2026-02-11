/**
 * Tests for Content Analyzer Service - Phase 1
 * Tests magic number detection, file type identification, and security warnings
 */

import fs from "fs/promises";
import path from "path";
import { ContentAnalyzerService } from "../../../src/services/content-analyzer.service.js";
import { fileSignToBuffer } from "../../utils/test-helpers.js";

describe("ContentAnalyzerService", () => {
  let analyzer: ContentAnalyzerService;
  let testDir: string;
  let baseTempDir: string;

  beforeEach(async () => {
    baseTempDir = path.join(process.cwd(), "tests", "temp");
    await fs.mkdir(baseTempDir, { recursive: true });
    testDir = await fs.mkdtemp(path.join(baseTempDir, "test-analyzer-"));
    analyzer = new ContentAnalyzerService();
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

  describe("Image File Detection", () => {
    it("should detect PNG files by magic number", async () => {
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const filePath = await createFile("test.png", pngHeader);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("PNG");
      expect(result.mimeType).toBe("image/png");
      expect(result.extensionMatch).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it("should detect JPEG files by magic number", async () => {
      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // JFIF
      const filePath = await createFile("test.jpg", jpegHeader);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("JPEG");
      expect(result.mimeType).toBe("image/jpeg");
      expect(result.extensionMatch).toBe(true);
    });

    it("should detect JPEG files with Exif header", async () => {
      const jpegExif = Buffer.from([0xff, 0xd8, 0xff, 0xe1]);
      const filePath = await createFile("photo.jpeg", jpegExif);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("JPEG");
      expect(result.extensionMatch).toBe(true);
    });

    it("should detect GIF87a files", async () => {
      const gifHeader = Buffer.from([
        0x47, 0x49, 0x46, 0x38, 0x37, 0x61,
      ]);
      const filePath = await createFile("test.gif", gifHeader);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("GIF87a");
      expect(result.mimeType).toBe("image/gif");
    });

    it("should detect GIF89a files", async () => {
      const gifHeader = Buffer.from([
        0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
      ]);
      const filePath = await createFile("test.gif", gifHeader);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("GIF89a");
      expect(result.mimeType).toBe("image/gif");
    });

    it("should detect BMP files", async () => {
      const bmpHeader = Buffer.from([0x42, 0x4d]); // BM
      const filePath = await createFile("test.bmp", bmpHeader);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("BMP");
      expect(result.mimeType).toBe("image/bmp");
    });

    it("should detect WebP files", async () => {
      const webpHeader = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42,
        0x50,
      ]);
      const filePath = await createFile("test.webp", webpHeader);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("WEBP");
      expect(result.mimeType).toBe("image/webp");
    });

    it("should detect SVG files", async () => {
      const svgContent = Buffer.from('<?xml version="1.0"?><svg></svg>');
      const filePath = await createFile("test.svg", svgContent);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("SVG");
      expect(result.mimeType).toBe("image/svg+xml");
    });
  });

  describe("Document File Detection", () => {
    it("should detect PDF files by magic number", async () => {
      const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
      const filePath = await createFile("test.pdf", pdfHeader);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("PDF");
      expect(result.mimeType).toBe("application/pdf");
      expect(result.extensionMatch).toBe(true);
    });

    it("should detect Microsoft Office documents (OLE2)", async () => {
      const ole2Header = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);
      const filePath = await createFile("test.doc", ole2Header);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("DOC");
      expect(result.mimeType).toBe("application/msword");
    });

    it("should detect Office Open XML documents (ZIP-based)", async () => {
      const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
      const filePath = await createFile("test.docx", zipHeader);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("DOCX");
      expect(result.extensionMatch).toBe(true);
    });

    it("should detect RTF files", async () => {
      const rtfHeader = Buffer.from("{\\rtf");
      const filePath = await createFile("test.rtf", rtfHeader);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("RTF");
      expect(result.mimeType).toBe("application/rtf");
    });
  });

  describe("Archive File Detection", () => {
    it("should detect ZIP files", async () => {
      const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
      const filePath = await createFile("test.zip", zipHeader);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("ZIP");
      expect(result.mimeType).toBe("application/zip");
      expect(result.extensionMatch).toBe(true);
    });

    it("should detect GZIP files", async () => {
      const gzipHeader = Buffer.from([0x1f, 0x8b]);
      const filePath = await createFile("test.gz", gzipHeader);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("GZIP");
      expect(result.mimeType).toBe("application/gzip");
    });

    it("should detect RAR files", async () => {
      const rarHeader = Buffer.from([
        0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00,
      ]);
      const filePath = await createFile("test.rar", rarHeader);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("RAR");
    });

    it("should detect 7Z files", async () => {
      const sevenZHeader = Buffer.from([
        0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c,
      ]);
      const filePath = await createFile("test.7z", sevenZHeader);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("7Z");
    });
  });

  describe("Executable File Detection", () => {
    it("should detect ELF executables", async () => {
      const elfHeader = Buffer.from([0x7f, 0x45, 0x4c, 0x46]); // \x7fELF
      const filePath = await createFile("test.elf", elfHeader);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("ELF");
      expect(result.mimeType).toBe("application/x-executable");
    });

    it("should detect PE executables (Windows)", async () => {
      const peHeader = Buffer.from([0x4d, 0x5a]); // MZ
      const filePath = await createFile("test.exe", peHeader);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("PE");
      expect(result.mimeType).toBe("application/vnd.microsoft.portable-executable");
    });

    it("should detect Mach-O 32-bit binaries", async () => {
      const macho32Header = Buffer.from([0xfe, 0xed, 0xfa, 0xce]);
      const filePath = await createFile("test.macho", macho32Header);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("MACHO_32");
    });

    it("should detect Mach-O 64-bit binaries", async () => {
      const macho64Header = Buffer.from([0xfe, 0xed, 0xfa, 0xcf]);
      const filePath = await createFile("test.dylib", macho64Header);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("MACHO_64");
    });

    it("should detect Java Class files", async () => {
      const classHeader = Buffer.from([0xca, 0xfe, 0xba, 0xbe]);
      const filePath = await createFile("test.class", classHeader);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("CLASS");
    });
  });

  describe("Script File Detection", () => {
    it("should detect shell scripts by shebang", async () => {
      const content = "#!/bin/bash\necho 'Hello World'";
      const filePath = await createFile("script.sh", content);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("BASH");
      expect(result.mimeType).toBe("text/x-shellscript");
    });

    it("should detect Python scripts by shebang", async () => {
      const content = "#!/usr/bin/env python3\nprint('Hello')";
      const filePath = await createFile("script.py", content);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("PYTHON");
      expect(result.mimeType).toBe("text/x-python");
    });

    it("should detect Node.js scripts by shebang", async () => {
      const content = "#!/usr/bin/env node\nconsole.log('Hello');";
      const filePath = await createFile("script.js", content);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("NODE");
    });

    it("should detect generic shell scripts", async () => {
      const content = "#!/bin/sh\necho 'Hello'";
      const filePath = await createFile("script", content);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("SHELL");
    });
  });

  describe("Text File Detection", () => {
    it("should detect HTML files", async () => {
      const content = "<!DOCTYPE html><html><body></body></html>";
      const filePath = await createFile("page.html", content);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("HTML");
      expect(result.mimeType).toBe("text/html");
    });

    it("should detect JSON files", async () => {
      const content = '{"key": "value"}';
      const filePath = await createFile("data.json", content);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("JSON");
      expect(result.mimeType).toBe("application/json");
    });

    it("should detect JSON array files", async () => {
      const content = '[{"key": "value"}]';
      const filePath = await createFile("data.json", content);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("JSON");
    });

    it("should detect XML files", async () => {
      const content = '<?xml version="1.0"?><root></root>';
      const filePath = await createFile("data.xml", content);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("XML");
    });

    it("should detect CSS files", async () => {
      const content = "body { color: red; }";
      const filePath = await createFile("style.css", content);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("CSS");
    });

    it("should detect Markdown files", async () => {
      const content = "# Heading\n\nSome text";
      const filePath = await createFile("readme.md", content);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("MARKDOWN");
    });

    it("should detect plain text files", async () => {
      const content = "Just some plain text content";
      const filePath = await createFile("notes.txt", content);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("TEXT");
    });
  });

  describe("Extension Mismatch Detection", () => {
    it("should detect executable disguised as image", async () => {
      const peHeader = Buffer.from([0x4d, 0x5a]); // Windows executable
      const filePath = await createFile("malware.jpg", peHeader);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("PE");
      expect(result.extensionMatch).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes("CRITICAL"))).toBe(true);
    });

    it("should detect executable disguised as document", async () => {
      const elfHeader = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
      const filePath = await createFile("virus.pdf", elfHeader);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("ELF");
      expect(result.extensionMatch).toBe(false);
      expect(result.warnings.some((w) => w.includes("CRITICAL"))).toBe(true);
    });

    it("should detect script disguised as text file", async () => {
      const content = "#!/bin/bash\nrm -rf /";
      const filePath = await createFile("readme.txt", content);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("BASH");
      expect(result.extensionMatch).toBe(false);
    });

    it("should correctly match matching extensions", async () => {
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const filePath = await createFile("image.png", pngHeader);

      const result = await analyzer.analyze(filePath);

      expect(result.extensionMatch).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe("Confidence Scoring", () => {
    it("should return high confidence for executables", async () => {
      const elfHeader = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
      const filePath = await createFile("test", elfHeader);

      const result = await analyzer.analyze(filePath);

      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it("should return high confidence for images", async () => {
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const filePath = await createFile("test.png", pngHeader);

      const result = await analyzer.analyze(filePath);

      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it("should return lower confidence for text files", async () => {
      const content = "Some plain text";
      const filePath = await createFile("test.txt", content);

      const result = await analyzer.analyze(filePath);

      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThan(1);
    });
  });

  describe("Custom Signatures", () => {
    it("should support custom signatures", async () => {
      const customAnalyzer = new ContentAnalyzerService([
        {
          type: "CUSTOM",
          mimeType: "application/x-custom",
          signatures: [Buffer.from([0x01, 0x02, 0x03, 0x04])],
          extensions: [".custom"],
          category: "code",
          isExecutable: false,
          description: "Custom file format",
        },
      ]);

      const customHeader = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]);
      const filePath = await createFile("test.custom", customHeader);

      const result = await customAnalyzer.analyze(filePath);

      expect(result.detectedType).toBe("CUSTOM");
      expect(result.mimeType).toBe("application/x-custom");
    });

    it("should allow adding signatures dynamically", () => {
      analyzer.addSignature({
        type: "DYNAMIC",
        mimeType: "application/x-dynamic",
        signatures: [Buffer.from([0xaa, 0xbb])],
        extensions: [".dyn"],
        category: "document",
        isExecutable: false,
        description: "Dynamically added format",
      });

      const types = analyzer.getSupportedTypes();
      expect(types.some((t) => t.type === "DYNAMIC")).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty files", async () => {
      const filePath = await createFile("empty.txt", "");

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("TEXT");
    });

    it("should handle very small files", async () => {
      const filePath = await createFile("tiny.bin", Buffer.from([0x00]));

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBeDefined();
      expect(result.filePath).toBe(filePath);
    });

    it("should handle binary files with null bytes", async () => {
      const content = Buffer.from([
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
      ]);
      const filePath = await createFile("binary.dat", content);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("UNKNOWN");
    });

    it("should detect files without extensions", async () => {
      const elfHeader = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
      const filePath = await createFile("elfbinary", elfHeader);

      const result = await analyzer.analyze(filePath);

      expect(result.detectedType).toBe("ELF");
      expect(result.extensionMatch).toBe(true); // Empty extension is valid for ELF
    });
  });

  describe("detectFileType (direct buffer)", () => {
    it("should detect type from buffer directly", () => {
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);

      const detection = analyzer.detectFileType(pngBuffer);

      expect(detection.type).toBe("PNG");
    });

    it("should return UNKNOWN for unrecognized binary", () => {
      const unknownBuffer = Buffer.from([
        0xde, 0xad, 0xbe, 0xef, 0xca, 0xfe, 0xba, 0xbe,
      ]);

      const detection = analyzer.detectFileType(unknownBuffer);

      expect(detection.type).toBe("UNKNOWN");
    });
  });

  describe("checkExtensionMismatch", () => {
    it("should return true for matching extensions", () => {
      const fileType = {
        type: "PNG",
        mimeType: "image/png",
        signatures: [Buffer.from([0x89, 0x50, 0x4e, 0x47])],
        extensions: [".png"],
        category: "image" as const,
        isExecutable: false,
        description: "PNG Image",
      };

      const match = analyzer.checkExtensionMismatch("/path/to/image.png", "PNG");
      expect(match).toBe(true);
    });

    it("should return false for non-matching extensions", () => {
      const match = analyzer.checkExtensionMismatch(
        "/path/to/file.jpg",
        "PNG",
      );
      expect(match).toBe(false);
    });
  });

  describe("getConfidenceScore", () => {
    it("should return 0 for UNKNOWN type", () => {
      const unknownType = {
        type: "UNKNOWN",
        mimeType: "application/octet-stream",
        signatures: [],
        extensions: [],
        category: "unknown" as const,
        isExecutable: false,
        description: "Unknown",
      };

      const score = analyzer.getConfidenceScore(unknownType);
      expect(score).toBe(0);
    });

    it("should return higher score for executables", () => {
      const exeType = {
        type: "ELF",
        mimeType: "application/x-executable",
        signatures: [Buffer.from([0x7f, 0x45, 0x4c, 0x46])],
        extensions: [".elf"],
        category: "executable" as const,
        isExecutable: true,
        description: "ELF Executable",
      };

      const score = analyzer.getConfidenceScore(exeType);
      expect(score).toBeGreaterThan(0.8);
    });
  });
});
