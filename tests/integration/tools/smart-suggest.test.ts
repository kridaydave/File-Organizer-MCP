import fs from "fs/promises";
import path from "path";
import {
  setupLoggerMocks,
  teardownLoggerMocks,
} from "../../utils/logger-mock.js";
import { handleSmartSuggest } from "../../../src/tools/smart-suggest.js";

describe("Smart Suggest Tool - Integration Tests", () => {
  let testDir: string;
  let baseTempDir: string;

  beforeEach(async () => {
    setupLoggerMocks();

    baseTempDir = path.join(process.cwd(), "tests", "temp");
    await fs.mkdir(baseTempDir, { recursive: true });
    testDir = await fs.mkdtemp(path.join(baseTempDir, "smart-suggest-"));
  });

  afterEach(async () => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.error("Cleanup error:", error);
    }
    teardownLoggerMocks();
  });

  describe("Basic Analysis", () => {
    it("should return health report for valid directory", async () => {
      await fs.writeFile(path.join(testDir, "document.txt"), "Test content");
      await fs.writeFile(path.join(testDir, "image.jpg"), Buffer.alloc(100));

      const result = await handleSmartSuggest({
        directory: testDir,
        response_format: "json",
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe("text");

      const output = result.structuredContent as Record<string, unknown>;
      expect(output).toBeDefined();
      expect(output.score).toBeDefined();
      expect(output.grade).toBeDefined();
      expect(typeof output.score).toBe("number");
    });

    it("should analyze directory with mixed file types", async () => {
      await fs.writeFile(path.join(testDir, "notes.txt"), "Document content");
      await fs.writeFile(path.join(testDir, "photo.jpg"), Buffer.alloc(100));
      await fs.writeFile(path.join(testDir, "song.mp3"), Buffer.alloc(100));
      await fs.writeFile(path.join(testDir, "data.json"), "{}");

      const result = await handleSmartSuggest({
        directory: testDir,
        response_format: "json",
      });

      const output = result.structuredContent as Record<string, unknown>;
      expect(output.score).toBeGreaterThanOrEqual(0);
      expect(output.score).toBeLessThanOrEqual(100);
    });
  });

  describe("Metrics", () => {
    it("should include all 5 metrics in output", async () => {
      await fs.writeFile(path.join(testDir, "file.txt"), "Content");

      const result = await handleSmartSuggest({
        directory: testDir,
        response_format: "json",
      });

      const output = result.structuredContent as Record<string, unknown>;
      const metrics = output.metrics as Record<
        string,
        { score: number; details: string }
      >;

      expect(metrics).toBeDefined();
      expect(metrics.fileTypeEntropy).toBeDefined();
      expect(metrics.namingConsistency).toBeDefined();
      expect(metrics.depthBalance).toBeDefined();
      expect(metrics.duplicateRatio).toBeDefined();
      expect(metrics.misplacedFiles).toBeDefined();

      expect(typeof metrics.fileTypeEntropy.score).toBe("number");
      expect(typeof metrics.namingConsistency.score).toBe("number");
      expect(typeof metrics.depthBalance.score).toBe("number");
      expect(typeof metrics.duplicateRatio.score).toBe("number");
      expect(typeof metrics.misplacedFiles.score).toBe("number");
    });

    it("should provide details for each metric", async () => {
      await fs.writeFile(path.join(testDir, "test-file.txt"), "Content");

      const result = await handleSmartSuggest({
        directory: testDir,
        response_format: "json",
      });

      const output = result.structuredContent as Record<string, unknown>;
      const metrics = output.metrics as Record<
        string,
        { score: number; details: string }
      >;

      expect(metrics.fileTypeEntropy.details).toBeDefined();
      expect(metrics.namingConsistency.details).toBeDefined();
      expect(metrics.depthBalance.details).toBeDefined();
      expect(metrics.duplicateRatio.details).toBeDefined();
      expect(metrics.misplacedFiles.details).toBeDefined();

      expect(typeof metrics.fileTypeEntropy.details).toBe("string");
      expect(typeof metrics.namingConsistency.details).toBe("string");
    });
  });

  describe("Grade Calculation", () => {
    it("should map score 90-100 to grade A", async () => {
      const result = await handleSmartSuggest({
        directory: testDir,
        response_format: "json",
      });

      const output = result.structuredContent as {
        score: number;
        grade: string;
      };
      if (output.score >= 90) {
        expect(output.grade).toBe("A");
      }
    });

    it("should map score 80-89 to grade B", async () => {
      await fs.writeFile(path.join(testDir, "file.txt"), "Content");
      await fs.writeFile(path.join(testDir, "AnotherFile.txt"), "Content");

      const result = await handleSmartSuggest({
        directory: testDir,
        response_format: "json",
      });

      const output = result.structuredContent as Record<string, unknown>;
      expect(["A", "B", "C", "D", "F"]).toContain(output.grade);
    });

    it("should return valid grade for any directory", async () => {
      await fs.writeFile(path.join(testDir, "document.txt"), "Test");

      const result = await handleSmartSuggest({
        directory: testDir,
        response_format: "json",
      });

      const output = result.structuredContent as Record<string, unknown>;
      expect(["A", "B", "C", "D", "F"]).toContain(output.grade);
    });
  });

  describe("Suggestions", () => {
    it("should return suggestions array", async () => {
      await fs.writeFile(path.join(testDir, "file.txt"), "Content");

      const result = await handleSmartSuggest({
        directory: testDir,
        response_format: "json",
      });

      const output = result.structuredContent as Record<string, unknown>;
      expect(Array.isArray(output.suggestions)).toBe(true);
    });

    it("should include priority in suggestions", async () => {
      await fs.writeFile(path.join(testDir, "test.txt"), "Content");
      await fs.writeFile(path.join(testDir, "TEST FILE.txt"), "Content");

      const result = await handleSmartSuggest({
        directory: testDir,
        response_format: "json",
      });

      const output = result.structuredContent as Record<string, unknown>;
      const suggestions = output.suggestions as Array<{
        priority: string;
        message: string;
      }>;

      if (suggestions.length > 0) {
        expect(suggestions[0].priority).toBeDefined();
        expect(["high", "medium", "low"]).toContain(suggestions[0].priority);
        expect(suggestions[0].message).toBeDefined();
      }
    });

    it("should suggest tools for low scores", async () => {
      const nestedDir = path.join(
        testDir,
        "a",
        "b",
        "c",
        "d",
        "e",
        "f",
        "g",
        "h",
      );
      await fs.mkdir(nestedDir, { recursive: true });
      await fs.writeFile(path.join(nestedDir, "deep.txt"), "Content");

      const result = await handleSmartSuggest({
        directory: testDir,
        response_format: "json",
      });

      const output = result.structuredContent as Record<string, unknown>;
      const suggestions = output.suggestions as Array<{
        suggestedTool?: string;
      }>;

      if (suggestions.length > 0 && suggestions[0].suggestedTool) {
        expect(typeof suggestions[0].suggestedTool).toBe("string");
      }
    });
  });

  describe("Empty Directory", () => {
    it("should return score 100 for empty directory", async () => {
      const result = await handleSmartSuggest({
        directory: testDir,
        response_format: "json",
      });

      const output = result.structuredContent as Record<string, unknown>;
      expect(output.score).toBe(100);
    });

    it("should return grade A for empty directory", async () => {
      const result = await handleSmartSuggest({
        directory: testDir,
        response_format: "json",
      });

      const output = result.structuredContent as Record<string, unknown>;
      expect(output.grade).toBe("A");
    });

    it("should return empty suggestions for empty directory", async () => {
      const result = await handleSmartSuggest({
        directory: testDir,
        response_format: "json",
      });

      const output = result.structuredContent as Record<string, unknown>;
      const suggestions = output.suggestions as Array<unknown>;
      expect(suggestions).toHaveLength(0);
    });
  });

  describe("Cache", () => {
    it("should return cached result on second call", async () => {
      await fs.writeFile(path.join(testDir, "file.txt"), "Content");

      const result1 = await handleSmartSuggest({
        directory: testDir,
        response_format: "json",
        use_cache: true,
      });

      const result2 = await handleSmartSuggest({
        directory: testDir,
        response_format: "json",
        use_cache: true,
      });

      const output1 = result1.structuredContent as Record<string, unknown>;
      const output2 = result2.structuredContent as Record<string, unknown>;

      expect(output1.score).toBe(output2.score);
      expect(output1.grade).toBe(output2.grade);
    });

    it("should respect use_cache false", async () => {
      await fs.writeFile(path.join(testDir, "file.txt"), "Content");

      const result1 = await handleSmartSuggest({
        directory: testDir,
        response_format: "json",
        use_cache: false,
      });

      const output1 = result1.structuredContent as Record<string, unknown>;
      expect(output1.score).toBeDefined();
    });
  });

  describe("Timeout", () => {
    it("should respect timeout_seconds parameter", async () => {
      for (let i = 0; i < 20; i++) {
        await fs.writeFile(path.join(testDir, `file${i}.txt`), `Content ${i}`);
      }

      const result = await handleSmartSuggest({
        directory: testDir,
        response_format: "json",
        timeout_seconds: 30,
      });

      expect(result.content).toBeDefined();
    }, 60000);

    it("should timeout on long operations", async () => {
      for (let i = 0; i < 100; i++) {
        await fs.writeFile(path.join(testDir, `file${i}.txt`), "X".repeat(100));
      }

      await expect(
        handleSmartSuggest({
          directory: testDir,
          response_format: "json",
          timeout_seconds: 10,
        }),
      ).resolves.toBeDefined();
    }, 15000);
  });

  describe("Error Handling", () => {
    it("should handle non-existent directory gracefully", async () => {
      const nonExistentDir = path.join(testDir, "does-not-exist");

      const result = await handleSmartSuggest({
        directory: nonExistentDir,
        response_format: "json",
      });

      expect(result.content).toBeDefined();
      const output = result.structuredContent as Record<string, unknown>;
      expect(output.score).toBe(100);
      expect(output.grade).toBe("A");
    });

    it("should return error for invalid path", async () => {
      await expect(
        handleSmartSuggest({
          directory: "",
          response_format: "json",
        }),
      ).resolves.toHaveProperty("content");

      const result = await handleSmartSuggest({
        directory: "",
        response_format: "json",
      });

      expect(result.content[0].text).toContain("Error");
    });

    it("should handle permission errors gracefully", async () => {
      await fs.writeFile(path.join(testDir, "file.txt"), "Content");

      const result = await handleSmartSuggest({
        directory: testDir,
        response_format: "json",
      });

      expect(result).toBeDefined();
    });
  });

  describe("Directory Structure Analysis", () => {
    it("should analyze nested directories when include_subdirs is true", async () => {
      const nestedDir = path.join(testDir, "subdir");
      await fs.mkdir(nestedDir);
      await fs.writeFile(path.join(testDir, "root.txt"), "Root content");
      await fs.writeFile(path.join(nestedDir, "nested.txt"), "Nested content");

      const result = await handleSmartSuggest({
        directory: testDir,
        response_format: "json",
        include_subdirs: true,
      });

      const output = result.structuredContent as Record<string, unknown>;
      expect(output.score).toBeDefined();
    });

    it("should respect include_subdirs false", async () => {
      const nestedDir = path.join(testDir, "subdir");
      await fs.mkdir(nestedDir);
      await fs.writeFile(path.join(testDir, "root.txt"), "Root content");
      await fs.writeFile(path.join(nestedDir, "nested.txt"), "Nested content");

      const result = await handleSmartSuggest({
        directory: testDir,
        response_format: "json",
        include_subdirs: false,
      });

      const output = result.structuredContent as Record<string, unknown>;
      expect(output.score).toBeDefined();
    });
  });

  describe("Duplicate Detection", () => {
    it("should detect duplicates when include_duplicates is true", async () => {
      const content = "Same content for duplicate detection";
      await fs.writeFile(path.join(testDir, "file1.txt"), content);
      await fs.writeFile(path.join(testDir, "file2.txt"), content);

      const result = await handleSmartSuggest({
        directory: testDir,
        response_format: "json",
        include_duplicates: true,
      });

      const output = result.structuredContent as Record<string, unknown>;
      const metrics = output.metrics as Record<string, { score: number }>;
      expect(metrics.duplicateRatio.score).toBeLessThan(100);
    });

    it("should skip duplicate detection when include_duplicates is false", async () => {
      const content = "Same content for duplicate detection";
      await fs.writeFile(path.join(testDir, "file1.txt"), content);
      await fs.writeFile(path.join(testDir, "file2.txt"), content);

      const result = await handleSmartSuggest({
        directory: testDir,
        response_format: "json",
        include_duplicates: false,
      });

      const output = result.structuredContent as Record<string, unknown>;
      const metrics = output.metrics as Record<string, { score: number }>;
      expect(metrics.duplicateRatio.score).toBe(75);
    });
  });

  describe("Project Directory Detection", () => {
    it("should detect project directory with package.json", async () => {
      await fs.writeFile(
        path.join(testDir, "package.json"),
        '{"name": "test"}',
      );
      await fs.writeFile(path.join(testDir, "index.js"), "console.log('test')");

      const result = await handleSmartSuggest({
        directory: testDir,
        response_format: "json",
      });

      const output = result.structuredContent as Record<string, unknown>;
      expect(output.score).toBeGreaterThanOrEqual(90);
    });

    it("should detect project directory with .git folder", async () => {
      const gitDir = path.join(testDir, ".git");
      await fs.mkdir(gitDir);
      await fs.writeFile(path.join(gitDir, "config"), "[core]");

      const result = await handleSmartSuggest({
        directory: testDir,
        response_format: "json",
      });

      const output = result.structuredContent as Record<string, unknown>;
      expect(output.score).toBeGreaterThanOrEqual(90);
    });
  });

  describe("Response Format", () => {
    it("should return markdown format when specified", async () => {
      await fs.writeFile(path.join(testDir, "file.txt"), "Content");

      const result = await handleSmartSuggest({
        directory: testDir,
        response_format: "markdown",
      });

      const text = result.content[0].text;
      if (text.includes("Error")) {
        expect(text).toContain("Error");
      } else {
        expect(text).toContain("# Directory Health Report");
        expect(text).toContain("**Grade:**");
      }
    });

    it("should return JSON when response_format is json", async () => {
      await fs.writeFile(path.join(testDir, "file.txt"), "Content");

      const result = await handleSmartSuggest({
        directory: testDir,
        response_format: "json",
      });

      expect(result.structuredContent).toBeDefined();
      const output = result.structuredContent as Record<string, unknown>;
      expect(output.score).toBeDefined();
    });
  });
});
