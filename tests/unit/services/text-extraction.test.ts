import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import path from "path";
import zlib from "zlib";
import { withMockedLogger } from "../../utils/logger-mock.js";

const mockPdfParse = jest.fn();
const mockMammothExtractRawText = jest.fn();
const mockReadFile = jest.fn();
const mockStat = jest.fn();

jest.unstable_mockModule("pdf-parse", () => ({
  default: mockPdfParse,
}));

jest.unstable_mockModule("mammoth", () => ({
  default: { extractRawText: mockMammothExtractRawText },
}));

jest.unstable_mockModule("fs/promises", () => ({
  default: {
    readFile: mockReadFile,
    stat: mockStat,
  },
}));

const { TextExtractionService } = await import(
  "../../../src/services/text-extraction.service.js"
);

function buildOdtBuffer(contentXml: string): Buffer {
  const compressed = zlib.deflateRawSync(Buffer.from(contentXml, "utf8"));
  const fileName = Buffer.from("content.xml");
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt32LE(0, 14);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(Buffer.byteLength(contentXml, "utf8"), 22);
  header.writeUInt16LE(fileName.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, fileName, compressed]);
}

describe("TextExtractionService", () => {
  let service: TextExtractionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TextExtractionService();
    mockStat.mockResolvedValue({ size: 100 });
    mockReadFile.mockResolvedValue(Buffer.from(""));
  });

  describe("extract", () => {
    it("should return unsupported method for unknown extension", async () => {
      const result = await service.extract(path.join("doc", "file.xyz"));
      expect(result.extractionMethod).toBe("unsupported");
      expect(result.text).toBe("");
      expect(result.truncated).toBe(false);
    });

    it("should return plain-text content for .txt files", async () => {
      mockReadFile.mockResolvedValue("Hello world");
      const result = await service.extract(path.join("doc", "file.txt"));
      expect(result.extractionMethod).toBe("plain-text");
      expect(result.text).toBe("Hello world");
      expect(result.truncated).toBe(false);
      expect(mockReadFile).toHaveBeenCalledWith(
        path.join("doc", "file.txt"),
        "utf-8",
      );
    });

    it("should return plain-text content for .md files", async () => {
      mockReadFile.mockResolvedValue("# Heading");
      const result = await service.extract(path.join("doc", "file.md"));
      expect(result.extractionMethod).toBe("plain-text");
      expect(result.text).toBe("# Heading");
    });

    it("should truncate text when it exceeds maxTextLength", async () => {
      mockReadFile.mockResolvedValue("x".repeat(100));
      const result = await service.extract(path.join("doc", "file.txt"), {
        maxTextLength: 50,
      });
      expect(result.truncated).toBe(true);
      expect(result.originalLength).toBe(100);
      expect(result.text).toHaveLength(50);
      expect(result.extractionMethod).toBe("plain-text");
    });

    it("should return size-limit placeholder when file is too large", async () => {
      mockStat.mockResolvedValue({ size: 11 * 1024 * 1024 });
      mockReadFile.mockResolvedValue(Buffer.from("content", "utf8"));
      const result = await service.extract(path.join("doc", "file.txt"));
      expect(result.extractionMethod).toBe("size-limit");
      expect(result.truncated).toBe(true);
      expect(result.text).toContain("File too large");
    });

    it("should return doc-unsupported placeholder for .doc files", async () => {
      const result = await service.extract(path.join("doc", "file.doc"));
      expect(result.extractionMethod).toBe("doc-unsupported");
      expect(result.text).toContain("Legacy .doc");
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it("should strip RTF control words, braces and hex escapes", async () => {
      mockReadFile.mockResolvedValue(
        Buffer.from("{\\rtf1\\ansi\\b Hello\\b0 World}", "utf8"),
      );
      const result = await service.extract(path.join("doc", "file.rtf"));
      expect(result.extractionMethod).toBe("rtf-native");
      expect(result.text).toBe("Hello World");
    });

    it("should extract PDF text via pdf-parse", async () => {
      mockPdfParse.mockResolvedValue({ text: "PDF text" });
      mockReadFile.mockResolvedValue(Buffer.from("pdf-bytes"));
      const result = await service.extract(path.join("doc", "file.pdf"));
      expect(result.extractionMethod).toBe("pdf-parse");
      expect(result.text).toBe("PDF text");
      expect(mockPdfParse).toHaveBeenCalled();
    });

    it(
      "should return pdf-parse-error when pdf-parse throws",
      withMockedLogger(async () => {
        mockPdfParse.mockRejectedValue(new Error("parse failed"));
        mockReadFile.mockResolvedValue(Buffer.from("pdf-bytes"));
        const result = await service.extract(path.join("doc", "file.pdf"));
        expect(result.extractionMethod).toBe("pdf-parse-error");
        expect(result.text).toBe("");
      }),
    );

    it("should extract DOCX text via mammoth", async () => {
      mockMammothExtractRawText.mockResolvedValue({ value: "Docx text" });
      mockReadFile.mockResolvedValue(Buffer.from("docx-bytes"));
      const result = await service.extract(path.join("doc", "file.docx"));
      expect(result.extractionMethod).toBe("mammoth-docx");
      expect(result.text).toBe("Docx text");
      expect(mockMammothExtractRawText).toHaveBeenCalledWith({
        buffer: Buffer.from("docx-bytes"),
      });
    });

    it(
      "should return mammoth-error when mammoth throws",
      withMockedLogger(async () => {
        mockMammothExtractRawText.mockRejectedValue(new Error("mammoth failed"));
        mockReadFile.mockResolvedValue(Buffer.from("docx-bytes"));
        const result = await service.extract(path.join("doc", "file.docx"));
        expect(result.extractionMethod).toBe("mammoth-error");
        expect(result.text).toBe("");
      }),
    );

    it("should extract text from ODT content.xml", async () => {
      const contentXml =
        '<office:document-content><office:body><office:text><text:p>Hello World</text:p><text:p>Second Paragraph</text:p></office:text></office:body></office:document-content>';
      mockReadFile.mockResolvedValue(buildOdtBuffer(contentXml));
      const result = await service.extract(path.join("doc", "file.odt"));
      expect(result.extractionMethod).toBe("odt-native");
      expect(result.text).toContain("Hello World");
      expect(result.text).toContain("Second Paragraph");
    });

    it("should return odt-no-content for buffer without ZIP signature", async () => {
      mockReadFile.mockResolvedValue(Buffer.from("not a zip file"));
      const result = await service.extract(path.join("doc", "file.odt"));
      expect(result.extractionMethod).toBe("odt-no-content");
      expect(result.text).toBe("");
    });
  });

  describe("isSupported", () => {
    it("should return true for supported extensions", () => {
      expect(service.isSupported("file.txt")).toBe(true);
      expect(service.isSupported("file.pdf")).toBe(true);
      expect(service.isSupported("file.odt")).toBe(true);
    });

    it("should be case insensitive", () => {
      expect(service.isSupported("file.TXT")).toBe(true);
      expect(service.isSupported("file.PDF")).toBe(true);
    });

    it("should return false for unsupported extensions", () => {
      expect(service.isSupported("file.exe")).toBe(false);
      expect(service.isSupported("file.png")).toBe(false);
    });
  });

  describe("getSupportedExtensions", () => {
    it("should return all supported extensions", () => {
      const extensions = service.getSupportedExtensions();
      expect(extensions).toContain(".pdf");
      expect(extensions).toContain(".docx");
      expect(extensions).toContain(".doc");
      expect(extensions).toContain(".odt");
      expect(extensions).toContain(".rtf");
      expect(extensions).toContain(".txt");
      expect(extensions).toContain(".md");
    });
  });
});