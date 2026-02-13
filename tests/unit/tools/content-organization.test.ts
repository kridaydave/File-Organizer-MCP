/**
 * Tests for organize_by_content Tool
 * Tests content-based document organization functionality
 */

import fs from "fs/promises";
import path from "path";
import { jest } from "@jest/globals";
import {
  setupLoggerMocks,
  teardownLoggerMocks,
} from "../../utils/logger-mock.js";

const mockGetAllFiles = jest.fn();
const mockExtractTopics = jest.fn();

jest.unstable_mockModule(
  "../../../src/services/file-scanner.service.js",
  () => ({
    FileScannerService: jest.fn().mockImplementation(() => ({
      getAllFiles: mockGetAllFiles,
    })),
  }),
);

jest.unstable_mockModule(
  "../../../src/services/topic-extractor.service.js",
  () => ({
    topicExtractorService: {
      extractTopics: mockExtractTopics,
    },
    TopicMatch: {} as any,
  }),
);

jest.unstable_mockModule(
  "../../../src/services/path-validator.service.js",
  () => ({
    validateStrictPath: jest.fn((p: string) => Promise.resolve(p)),
  }),
);

jest.unstable_mockModule(
  "../../../src/services/text-extraction.service.js",
  () => ({
    textExtractionService: {
      extract: jest.fn(async (filePath: string) => {
        const fs = await import("fs/promises");
        const path = await import("path");
        const ext = path.extname(filePath).toLowerCase();
        const basename = path.basename(filePath).toLowerCase();

        if (basename === "empty.pdf") {
          return {
            text: "",
            truncated: false,
            originalLength: 0,
            extractionMethod: "pdf-parse-empty",
          };
        }

        if (basename === "corrupted.pdf" || basename === "bad.pdf") {
          return {
            text: "",
            truncated: false,
            originalLength: 0,
            extractionMethod: "pdf-parse-error",
          };
        }

        if (ext === ".txt" || ext === ".md") {
          try {
            const content = await fs.readFile(filePath, "utf-8");
            return {
              text: content,
              truncated: false,
              originalLength: content.length,
              extractionMethod: "plain-text-mock",
            };
          } catch {
            return {
              text: "",
              truncated: false,
              originalLength: 0,
              extractionMethod: "error",
            };
          }
        }

        if (ext === ".pdf") {
          return {
            text: "This is a PDF document with sufficient text content about various topics for testing purposes. It contains mathematics, science, and business content.",
            truncated: false,
            originalLength: 150,
            extractionMethod: "pdf-parse-mock",
          };
        }

        if (ext === ".docx") {
          return {
            text: "This is a DOCX document with sufficient text content about business and financial topics for testing purposes.",
            truncated: false,
            originalLength: 120,
            extractionMethod: "mammoth-mock",
          };
        }

        return {
          text: "",
          truncated: false,
          originalLength: 0,
          extractionMethod: "unsupported",
        };
      }),
    },
  }),
);

const { handleOrganizeByContent, OrganizeByContentInputSchema } =
  await import("../../../src/tools/content-organization.js");

describe("organize_by_content Tool", () => {
  let testDir: string;
  let targetDir: string;
  let baseTempDir: string;

  beforeEach(async () => {
    setupLoggerMocks();

    baseTempDir = path.join(process.cwd(), "tests", "temp");
    await fs.mkdir(baseTempDir, { recursive: true });
    testDir = await fs.mkdtemp(path.join(baseTempDir, "test-content-src-"));
    targetDir = await fs.mkdtemp(path.join(baseTempDir, "test-content-tgt-"));

    jest.clearAllMocks();
  });

  afterEach(async () => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      await fs.rm(testDir, { recursive: true, force: true });
      await fs.rm(targetDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    teardownLoggerMocks();
    jest.clearAllMocks();
  });

  describe("Dry run mode", () => {
    it("should return preview without moving files", async () => {
      const mathDoc = path.join(testDir, "calculus.pdf");
      await fs.writeFile(
        mathDoc,
        "This document covers calculus, algebra, derivatives and mathematical functions for advanced students.",
      );

      mockGetAllFiles.mockResolvedValue([
        { name: "calculus.pdf", path: mathDoc, size: 100 },
      ]);

      mockExtractTopics.mockReturnValue({
        topics: [
          {
            topic: "Mathematics",
            confidence: 0.9,
            matchedKeywords: ["calculus", "algebra"],
          },
        ],
        keywords: ["calculus", "algebra", "derivatives"],
        language: "en",
        documentType: "academic",
      });

      const result = await handleOrganizeByContent({
        source_dir: testDir,
        target_dir: targetDir,
        dry_run: true,
      });

      const text = result.content[0].text;
      expect(text).toContain("Dry Run");
      expect(text).toContain("**Organized Files:** 1");
      expect(text).toContain("Mathematics");

      await expect(
        fs.access(path.join(targetDir, "Mathematics")),
      ).rejects.toThrow();
      await expect(fs.access(mathDoc)).resolves.not.toThrow();
    });
  });

  describe("Non-existent source directory", () => {
    it("should handle non-existent source directory gracefully", async () => {
      mockGetAllFiles.mockRejectedValue(
        Object.assign(new Error("ENOENT: no such file or directory"), {
          code: "ENOENT",
        }),
      );

      const result = await handleOrganizeByContent({
        source_dir: "/nonexistent/path",
        target_dir: targetDir,
      });

      expect(result.content[0].text).toBeDefined();
    });
  });

  describe("Empty directory", () => {
    it("should handle empty directory with zero files", async () => {
      mockGetAllFiles.mockResolvedValue([]);

      const result = await handleOrganizeByContent({
        source_dir: testDir,
        target_dir: targetDir,
        dry_run: true,
      });

      const text = result.content[0].text;
      expect(text).toContain("**Organized Files:** 0");
      expect(text).toContain("**Skipped Files:** 0");
    });
  });

  describe("Topic categorization", () => {
    it("should correctly categorize documents by topic", async () => {
      const scienceDoc = path.join(testDir, "research.pdf");
      await fs.writeFile(
        scienceDoc,
        "This is a scientific research paper about DNA and molecules in biology.",
      );

      mockGetAllFiles.mockResolvedValue([
        { name: "research.pdf", path: scienceDoc, size: 100 },
      ]);

      mockExtractTopics.mockReturnValue({
        topics: [
          {
            topic: "Science",
            confidence: 0.85,
            matchedKeywords: ["DNA", "molecules"],
          },
        ],
        keywords: ["scientific", "paper", "DNA", "molecules"],
        language: "en",
        documentType: "academic",
      });

      const result = await handleOrganizeByContent({
        source_dir: testDir,
        target_dir: targetDir,
        dry_run: true,
        response_format: "json",
      });

      const structured = result.structuredContent as {
        organizedFiles: number;
        results: Array<{ primaryTopic: string }>;
        structure: Record<string, string[]>;
      };
      expect(structured.organizedFiles).toBe(1);
      expect(structured.results[0].primaryTopic).toBe("Science");
      expect(structured.structure["Science"]).toContain("research.pdf");
    });

    it("should categorize multiple documents into different topics", async () => {
      const mathDoc = path.join(testDir, "algebra.txt");
      const bizDoc = path.join(testDir, "quarterly.docx");
      await fs.writeFile(
        mathDoc,
        "Linear algebra and matrix operations for solving complex equations in mathematics",
      );
      await fs.writeFile(
        bizDoc,
        "Quarterly revenue and profit forecast for business planning and financial analysis",
      );

      mockGetAllFiles.mockResolvedValue([
        { name: "algebra.txt", path: mathDoc, size: 50 },
        { name: "quarterly.docx", path: bizDoc, size: 60 },
      ]);

      mockExtractTopics
        .mockReturnValueOnce({
          topics: [
            {
              topic: "Mathematics",
              confidence: 0.9,
              matchedKeywords: ["algebra", "matrix"],
            },
          ],
          keywords: ["algebra", "matrix"],
          language: "en",
          documentType: "academic",
        })
        .mockReturnValueOnce({
          topics: [
            {
              topic: "Business",
              confidence: 0.88,
              matchedKeywords: ["revenue", "profit"],
            },
          ],
          keywords: ["quarterly", "revenue", "profit"],
          language: "en",
          documentType: "business",
        });

      const result = await handleOrganizeByContent({
        source_dir: testDir,
        target_dir: targetDir,
        dry_run: true,
        response_format: "json",
      });

      const structured = result.structuredContent as {
        organizedFiles: number;
        structure: Record<string, string[]>;
      };
      expect(structured.organizedFiles).toBe(2);
      expect(structured.structure["Mathematics"]).toContain("algebra.txt");
      expect(structured.structure["Business"]).toContain("quarterly.docx");
    });
  });

  describe("Insufficient content handling", () => {
    it("should skip files with insufficient text content", async () => {
      const shortDoc = path.join(testDir, "short.txt");
      await fs.writeFile(shortDoc, "tiny");

      mockGetAllFiles.mockResolvedValue([
        { name: "short.txt", path: shortDoc, size: 4 },
      ]);

      const result = await handleOrganizeByContent({
        source_dir: testDir,
        target_dir: targetDir,
        dry_run: true,
        response_format: "json",
      });

      const structured = result.structuredContent as {
        skippedFiles: number;
        errors: Array<{ file: string; error: string }>;
      };
      expect(structured.skippedFiles).toBe(1);
      expect(structured.errors[0].file).toBe("short.txt");
      expect(structured.errors[0].error).toContain("Insufficient text content");
    });

    it("should skip files that return empty text after extraction", async () => {
      const emptyDoc = path.join(testDir, "empty.pdf");
      await fs.writeFile(emptyDoc, "");

      mockGetAllFiles.mockResolvedValue([
        { name: "empty.pdf", path: emptyDoc, size: 0 },
      ]);

      const result = await handleOrganizeByContent({
        source_dir: testDir,
        target_dir: targetDir,
        dry_run: true,
        response_format: "json",
      });

      const structured = result.structuredContent as { skippedFiles: number };
      expect(structured.skippedFiles).toBe(1);
    });
  });

  describe("Error handling for unreadable files", () => {
    it("should handle unreadable files gracefully", async () => {
      const unreadableDoc = path.join(testDir, "corrupted.pdf");

      mockGetAllFiles.mockResolvedValue([
        { name: "corrupted.pdf", path: unreadableDoc, size: 100 },
      ]);

      const result = await handleOrganizeByContent({
        source_dir: testDir,
        target_dir: targetDir,
        dry_run: true,
        response_format: "json",
      });

      const structured = result.structuredContent as {
        errors: Array<{ file: string; error: string }>;
      };
      expect(structured.errors.length).toBeGreaterThanOrEqual(1);
      expect(structured.errors[0].file).toBe("corrupted.pdf");
    });

    it("should continue processing other files when one fails", async () => {
      const goodDoc = path.join(testDir, "good.txt");
      const badDoc = path.join(testDir, "bad.pdf");
      await fs.writeFile(
        goodDoc,
        "This is about calculus and algebra for mathematics and advanced mathematical concepts.",
      );

      mockGetAllFiles.mockResolvedValue([
        { name: "bad.pdf", path: badDoc, size: 100 },
        { name: "good.txt", path: goodDoc, size: 50 },
      ]);

      mockExtractTopics.mockReturnValue({
        topics: [
          {
            topic: "Mathematics",
            confidence: 0.9,
            matchedKeywords: ["calculus"],
          },
        ],
        keywords: ["calculus", "algebra", "mathematics"],
        language: "en",
        documentType: "academic",
      });

      const result = await handleOrganizeByContent({
        source_dir: testDir,
        target_dir: targetDir,
        dry_run: true,
        response_format: "json",
      });

      const structured = result.structuredContent as {
        organizedFiles: number;
        errors: Array<{ file: string }>;
      };
      expect(structured.organizedFiles).toBeGreaterThanOrEqual(1);
      expect(structured.errors.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Input validation", () => {
    it("should reject empty source_dir", async () => {
      const parsed = OrganizeByContentInputSchema.safeParse({
        source_dir: "",
        target_dir: targetDir,
      });

      expect(parsed.success).toBe(false);
    });

    it("should reject empty target_dir", async () => {
      const parsed = OrganizeByContentInputSchema.safeParse({
        source_dir: testDir,
        target_dir: "",
      });

      expect(parsed.success).toBe(false);
    });

    it("should apply default values for optional fields", async () => {
      mockGetAllFiles.mockResolvedValue([]);

      await handleOrganizeByContent({
        source_dir: testDir,
        target_dir: targetDir,
      });

      expect(mockGetAllFiles).toHaveBeenCalledWith(testDir, true);
    });
  });

  describe("Non-dry run mode", () => {
    it("should move files when dry_run is false", async () => {
      const mathDoc = path.join(testDir, "calculus.txt");
      await fs.writeFile(
        mathDoc,
        "This document covers calculus, algebra, and derivatives in mathematics.",
      );

      mockGetAllFiles.mockResolvedValue([
        { name: "calculus.txt", path: mathDoc, size: 80 },
      ]);

      mockExtractTopics.mockReturnValue({
        topics: [
          {
            topic: "Mathematics",
            confidence: 0.95,
            matchedKeywords: ["calculus", "algebra"],
          },
        ],
        keywords: ["calculus", "algebra", "derivatives", "mathematics"],
        language: "en",
        documentType: "academic",
      });

      const result = await handleOrganizeByContent({
        source_dir: testDir,
        target_dir: targetDir,
        dry_run: false,
      });

      const text = result.content[0].text;
      expect(text).not.toContain("Dry Run");
      expect(text).toContain("**Organized Files:** 1");

      const targetFile = path.join(targetDir, "Mathematics", "calculus.txt");
      await expect(fs.access(targetFile)).resolves.not.toThrow();
      await expect(fs.access(mathDoc)).rejects.toThrow();
    });
  });
});
