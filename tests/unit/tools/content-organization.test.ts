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
const mockDetectProjects = jest.fn();
const mockCreateManifest = jest.fn();

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
    STOP_WORDS: new Set<string>(),
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

jest.unstable_mockModule("../../../src/services/rollback.service.js", () => ({
  RollbackService: jest.fn().mockImplementation(() => ({
    createManifest: mockCreateManifest,
  })),
}));

const { handleOrganizeByContent, OrganizeByContentInputSchema } =
  await import("../../../src/tools/content-organization.js");

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
      projectDetector: {
        detect: mockDetectProjects,
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

      const result = await handleOrganizeByContent(
        {
          source_dir: testDir,
          target_dir: targetDir,
          dry_run: true,
        },
        services,
      );

      const text = result.content[0].text;
      expect(text).toContain("Dry Run");
      expect(text).toContain("**Organized Files:** 1");
      expect(text).toContain("Mathematics");

      await expect(fs.access(mathDoc)).resolves.toBeUndefined();
    });
  });

  describe("Error handling", () => {
    it("should handle scanner errors gracefully", async () => {
      mockGetAllFiles.mockRejectedValue(new Error("Scanner failure"));

      const result = await handleOrganizeByContent(
        {
          source_dir: testDir,
          target_dir: targetDir,
        },
        services,
      );

      expect(result.isError).toBe(true);
    });
  });

  describe("Empty directory", () => {
    it("should handle empty directory with zero files", async () => {
      mockGetAllFiles.mockResolvedValue([]);

      const result = await handleOrganizeByContent(
        {
          source_dir: testDir,
          target_dir: targetDir,
          dry_run: true,
        },
        services,
      );

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
        topics: [
          { topic: "TestTopic", confidence: 0.9, matchedKeywords: ["test"] },
        ],
        keywords: ["test"],
        language: "en",
        documentType: "general",
      });

      await handleOrganizeByContent(
        {
          source_dir: testDir,
          target_dir: targetDir,
          dry_run: false,
        },
        services,
      );

      const targetFile = path.join(targetDir, "TestTopic", "doc.pdf");
      await expect(fs.access(targetFile)).resolves.toBeUndefined();
      await expect(fs.access(docPath)).rejects.toThrow();
    });
  });

  describe("Project strategy", () => {
    it("should preview project groups without moving files on dry run", async () => {
      const planPath = path.join(testDir, "apollo_plan.md");
      const logoPath = path.join(testDir, "apollo_logo.png");
      await fs.writeFile(planPath, "content");
      await fs.writeFile(logoPath, "content");

      mockGetAllFiles.mockResolvedValue([
        { name: "apollo_plan.md", path: planPath, size: 100 },
        { name: "apollo_logo.png", path: logoPath, size: 100 },
      ]);

      mockDetectProjects.mockResolvedValue([
        {
          name: "Apollo",
          confidence: 1.5,
          files: [
            {
              path: planPath,
              name: "apollo_plan.md",
              signal: 'shared name token "apollo"',
            },
            {
              path: logoPath,
              name: "apollo_logo.png",
              signal: 'shared name token "apollo"',
            },
          ],
        },
      ]);

      const result = await handleOrganizeByContent(
        {
          source_dir: testDir,
          target_dir: targetDir,
          dry_run: true,
          strategy: "project",
        },
        services,
      );

      const text = result.content[0].text;
      expect(text).toContain("Project Organization Result");
      expect(text).toContain("Dry Run");
      expect(text).toContain("Apollo");
      expect(text).toContain("apollo\\_plan.md");

      await expect(fs.access(planPath)).resolves.toBeUndefined();
      await expect(fs.access(logoPath)).resolves.toBeUndefined();
    });

    it("should move files into project folders when dry_run is false", async () => {
      const planPath = path.join(testDir, "apollo_plan.md");
      const logoPath = path.join(testDir, "apollo_logo.png");
      await fs.writeFile(planPath, "content");
      await fs.writeFile(logoPath, "content");

      mockGetAllFiles.mockResolvedValue([
        { name: "apollo_plan.md", path: planPath, size: 100 },
        { name: "apollo_logo.png", path: logoPath, size: 100 },
      ]);

      mockDetectProjects.mockResolvedValue([
        {
          name: "Apollo",
          confidence: 1.5,
          files: [
            {
              path: planPath,
              name: "apollo_plan.md",
              signal: 'shared name token "apollo"',
            },
            {
              path: logoPath,
              name: "apollo_logo.png",
              signal: 'shared name token "apollo"',
            },
          ],
        },
      ]);

      await handleOrganizeByContent(
        {
          source_dir: testDir,
          target_dir: targetDir,
          dry_run: false,
          strategy: "project",
        },
        services,
      );

      const targetPlan = path.join(targetDir, "Apollo", "apollo_plan.md");
      const targetLogo = path.join(targetDir, "Apollo", "apollo_logo.png");
      await expect(fs.access(targetPlan)).resolves.toBeUndefined();
      await expect(fs.access(targetLogo)).resolves.toBeUndefined();
      await expect(fs.access(planPath)).rejects.toThrow();
      await expect(fs.access(logoPath)).rejects.toThrow();
    });

    it("should report no projects when detection returns empty", async () => {
      mockGetAllFiles.mockResolvedValue([
        { name: "solo.txt", path: path.join(testDir, "solo.txt"), size: 100 },
      ]);
      mockDetectProjects.mockResolvedValue([]);

      const result = await handleOrganizeByContent(
        {
          source_dir: testDir,
          target_dir: targetDir,
          dry_run: true,
          strategy: "project",
        },
        services,
      );

      const text = result.content[0].text;
      expect(text).toContain("Project Organization Result");
      expect(text).toContain("**Projects Detected:** 0");
    });

    it("should return structured JSON for project strategy on dry run", async () => {
      const planPath = path.join(testDir, "apollo_plan.md");
      await fs.writeFile(planPath, "content");

      mockGetAllFiles.mockResolvedValue([
        { name: "apollo_plan.md", path: planPath, size: 100 },
      ]);

      mockDetectProjects.mockResolvedValue([
        {
          name: "Apollo",
          confidence: 1.5,
          files: [
            {
              path: planPath,
              name: "apollo_plan.md",
              signal: 'shared name token "apollo"',
            },
          ],
        },
      ]);

      const result = await handleOrganizeByContent(
        {
          source_dir: testDir,
          target_dir: targetDir,
          dry_run: true,
          strategy: "project",
          response_format: "json",
        },
        services,
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.organizedFiles).toBe(1);
      expect(parsed.skippedFiles).toBe(0);
      expect(parsed.structure.Apollo).toEqual(["apollo_plan.md"]);
    });

    it("should give colliding project names distinct folder names", async () => {
      const planPath = path.join(testDir, "apollo_plan.md");
      const logoPath = path.join(testDir, "apollo_logo.png");
      await fs.writeFile(planPath, "content");
      await fs.writeFile(logoPath, "content");

      mockGetAllFiles.mockResolvedValue([
        { name: "apollo_plan.md", path: planPath, size: 100 },
        { name: "apollo_logo.png", path: logoPath, size: 100 },
      ]);

      mockDetectProjects.mockResolvedValue([
        {
          name: "Apollo",
          confidence: 1.5,
          files: [
            {
              path: planPath,
              name: "apollo_plan.md",
              signal: 'shared name token "apollo"',
            },
          ],
        },
        {
          name: "Apollo",
          confidence: 1.2,
          files: [
            {
              path: logoPath,
              name: "apollo_logo.png",
              signal: 'shared name token "apollo"',
            },
          ],
        },
      ]);

      await handleOrganizeByContent(
        {
          source_dir: testDir,
          target_dir: targetDir,
          dry_run: false,
          strategy: "project",
        },
        services,
      );

      await expect(
        fs.access(path.join(targetDir, "Apollo", "apollo_plan.md")),
      ).resolves.toBeUndefined();
      await expect(
        fs.access(path.join(targetDir, "Apollo-2", "apollo_logo.png")),
      ).resolves.toBeUndefined();
    });

    it("should skip and report files whose move fails without leaking paths", async () => {
      const planPath = path.join(testDir, "apollo_plan.md");
      await fs.writeFile(planPath, "content");

      mockGetAllFiles.mockResolvedValue([
        { name: "apollo_plan.md", path: planPath, size: 100 },
      ]);

      mockDetectProjects.mockResolvedValue([
        {
          name: "Apollo",
          confidence: 1.5,
          files: [
            {
              path: path.join("/nonexistent", "apollo_plan.md"),
              name: "apollo_plan.md",
              signal: "signal",
            },
          ],
        },
      ]);

      const result = await handleOrganizeByContent(
        {
          source_dir: testDir,
          target_dir: targetDir,
          dry_run: false,
          strategy: "project",
          response_format: "json",
        },
        services,
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.organizedFiles).toBe(0);
      expect(parsed.skippedFiles).toBe(1);
      expect(parsed.errors).toHaveLength(1);
      expect(parsed.errors[0].error).not.toContain("/nonexistent");
    });

    it("should count ungrouped files as skipped", async () => {
      const planPath = path.join(testDir, "apollo_plan.md");
      const orphanPath = path.join(testDir, "orphan.txt");
      await fs.writeFile(planPath, "content");
      await fs.writeFile(orphanPath, "content");

      mockGetAllFiles.mockResolvedValue([
        { name: "apollo_plan.md", path: planPath, size: 100 },
        { name: "orphan.txt", path: orphanPath, size: 100 },
      ]);

      mockDetectProjects.mockResolvedValue([
        {
          name: "Apollo",
          confidence: 1.5,
          files: [{ path: planPath, name: "apollo_plan.md", signal: "signal" }],
        },
      ]);

      const result = await handleOrganizeByContent(
        {
          source_dir: testDir,
          target_dir: targetDir,
          dry_run: true,
          strategy: "project",
          response_format: "json",
        },
        services,
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.organizedFiles).toBe(1);
      expect(parsed.skippedFiles).toBe(1);
    });

    it("should create a rollback manifest with the moved actions", async () => {
      const planPath = path.join(testDir, "apollo_plan.md");
      await fs.writeFile(planPath, "content");

      mockGetAllFiles.mockResolvedValue([
        { name: "apollo_plan.md", path: planPath, size: 100 },
      ]);

      mockDetectProjects.mockResolvedValue([
        {
          name: "Apollo",
          confidence: 1.5,
          files: [
            {
              path: planPath,
              name: "apollo_plan.md",
              signal: 'shared name token "apollo"',
            },
          ],
        },
      ]);

      await handleOrganizeByContent(
        {
          source_dir: testDir,
          target_dir: targetDir,
          dry_run: false,
          strategy: "project",
        },
        services,
      );

      expect(mockCreateManifest).toHaveBeenCalledTimes(1);
      const [title, actions] = mockCreateManifest.mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(title).toContain("Project organization");
      expect(actions).toHaveLength(1);
      expect((actions[0] as { type: string }).type).toBe("move");
    });
  });
});
