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

import type { FileWithSize } from "../../../src/types.js";

// Mock dependencies
const mockGetAllFiles = jest.fn();
const mockExtractTopics = jest.fn();
const mockTextExtract = jest.fn();

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
    TopicExtractorService: jest.fn().mockImplementation(() => ({
      extractTopics: mockExtractTopics,
    })),
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
    PathValidatorService: jest.fn().mockImplementation(() => ({
      validateStrictPath: jest.fn((p: string) => Promise.resolve(p)),
    })),
  }),
);

jest.unstable_mockModule(
  "../../../src/services/text-extraction.service.js",
  () => ({
    textExtractionService: {
      extract: mockTextExtract,
    },
  }),
);

const {
  handleOrganizeByContent,
  OrganizeByContentInputSchema,
} = await import("../../../src/tools/content-organization.js");

describe("organize_by_content Tool", () => {
  let testDir: string;
  let targetDir: string;
  let baseTempDir: string;
  let services: any;

  beforeEach(async () => {
    setupLoggerMocks();

    baseTempDir = path.join(process.cwd(), "tests", "temp");
    await fs.mkdir(baseTempDir, { recursive: true });
    testDir = await fs.mkdtemp(path.join(baseTempDir, "test-content-src-"));
    targetDir = await fs.mkdtemp(path.join(baseTempDir, "test-content-tgt-"));

    services = {
      scanner: {
        getAllFiles: mockGetAllFiles,
      },
      topicExtractor: {
        extractTopics: mockExtractTopics,
      },
    };

    jest.clearAllMocks();

    mockTextExtract.mockImplementation(async (filePath: string) => {
      const basename = path.basename(filePath);
      if (basename === "corrupted.pdf") {
        throw new Error("Simulated extraction failure");
      }
      return {
        text: "This is a document with enough text for testing purposes. It should be at least fifty characters long.",
        truncated: false,
        originalLength: 100,
        extractionMethod: "mock",
      };
    });
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
      await fs.writeFile(mathDoc, "some content");

      mockGetAllFiles.mockResolvedValue([
        { name: "calculus.pdf", path: mathDoc, size: 100 },
      ]);

      mockExtractTopics.mockReturnValue({
        topics: [
          {
            topic: "Mathematics",
            confidence: 0.9,
            matchedKeywords: ["calculus"],
          },
        ],
        keywords: ["calculus"],
        language: "en",
        documentType: "academic",
      });

      const result = await handleOrganizeByContent({
        source_dir: testDir,
        target_dir: targetDir,
        dry_run: true,
      }, services);

      const text = result.content[0].text;
      expect(text).toContain("Dry Run");
      expect(text).toContain("**Organized Files:** 1");
      expect(text).toContain("Mathematics");

      await expect(fs.access(mathDoc)).resolves.not.toThrow();
    });
  });

  describe("Error handling", () => {
    it("should handle scanner errors gracefully", async () => {
      mockGetAllFiles.mockRejectedValue(new Error("Scanner failure"));

      const result = await handleOrganizeByContent({
        source_dir: testDir,
        target_dir: targetDir,
      }, services);

      expect(result.isError).toBe(true);
    });
  });

  describe("Empty directory", () => {
    it("should handle empty directory with zero files", async () => {
      mockGetAllFiles.mockResolvedValue([]);

      const result = await handleOrganizeByContent({
        source_dir: testDir,
        target_dir: targetDir,
        dry_run: true,
      }, services);

      const text = result.content[0].text;
      expect(text).toContain("No files found");
    });
  });

  describe("Non-dry run mode", () => {
    it("should move files when dry_run is false", async () => {
      const docPath = path.join(testDir, "doc.pdf");
      await fs.writeFile(docPath, "content");

      mockGetAllFiles.mockResolvedValue([
        { name: "doc.pdf", path: docPath, size: 100 },
      ]);

      mockExtractTopics.mockReturnValue({
        topics: [{ topic: "TestTopic", confidence: 0.9, matchedKeywords: ["test"] }],
        keywords: ["test"],
        language: "en",
        documentType: "general",
      });

      await handleOrganizeByContent({
        source_dir: testDir,
        target_dir: targetDir,
        dry_run: false,
      }, services);

      const targetFile = path.join(targetDir, "TestTopic", "doc.pdf");
      await expect(fs.access(targetFile)).resolves.not.toThrow();
      await expect(fs.access(docPath)).rejects.toThrow();
    });
  });
});
