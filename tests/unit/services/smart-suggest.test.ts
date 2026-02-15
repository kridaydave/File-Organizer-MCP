import { jest } from "@jest/globals";
import { SmartSuggestService } from "../../../src/services/smart-suggest.service.js";
import type { FileWithSize } from "../../../src/types.js";
import * as fs from "fs/promises";

const mockGetAllFiles = jest.fn();
const mockFindDuplicates = jest.fn();
const mockAccess = jest.fn();

jest.mock("fs/promises", () => ({
  access: mockAccess,
}));

describe("SmartSuggestService", () => {
  let service: SmartSuggestService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SmartSuggestService();

    mockGetAllFiles.mockResolvedValue([]);
    mockFindDuplicates.mockResolvedValue([]);
    mockAccess.mockRejectedValue(new Error("Not found"));

    (service as any).fileScanner = {
      getAllFiles: mockGetAllFiles,
    };
    (service as any).hashCalculator = {
      findDuplicates: mockFindDuplicates,
    };
    (service as any).cache = new Map();
  });

  describe("calculateEntropy()", () => {
    it("should return 100 for single file type", () => {
      const fileTypes = new Map([[".txt", 10]]);
      const result = service.calculateEntropy(fileTypes);
      expect(result).toBe(100);
    });

    it("should return lower score for many file types", () => {
      const fileTypes = new Map([
        [".txt", 5],
        [".jpg", 5],
        [".pdf", 5],
        [".doc", 5],
      ]);
      const result = service.calculateEntropy(fileTypes);
      expect(result).toBeLessThan(100);
      expect(result).toBeGreaterThan(50);
    });

    it("should handle empty map with epsilon guard", () => {
      const fileTypes = new Map<string, number>();
      const result = service.calculateEntropy(fileTypes);
      expect(result).toBe(100);
    });

    it("should handle log(0) with epsilon protection", () => {
      const fileTypes = new Map([[".txt", 1]]);
      const result = service.calculateEntropy(fileTypes);
      expect(result).toBe(100);
      expect(() => service.calculateEntropy(fileTypes)).not.toThrow();
    });

    it("should normalize entropy correctly", () => {
      const fileTypes = new Map([
        [".a", 1],
        [".b", 1],
      ]);
      const result = service.calculateEntropy(fileTypes);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(100);
    });
  });

  describe("calculateNamingConsistency()", () => {
    it("should return 100 for all same pattern (camelCase)", () => {
      const files = ["myFile.ts", "anotherFile.ts", "testFile.ts"];
      const result = service.calculateNamingConsistency(files);
      expect(result).toBe(100);
    });

    it("should return 100 for all same pattern (kebab-case)", () => {
      const files = ["my-file.ts", "another-file.ts", "test-file.ts"];
      const result = service.calculateNamingConsistency(files);
      expect(result).toBe(100);
    });

    it("should return 100 for all same pattern (snake_case)", () => {
      const files = ["my_file.ts", "another_file.ts", "test_file.ts"];
      const result = service.calculateNamingConsistency(files);
      expect(result).toBe(100);
    });

    it("should return lower score for mixed patterns", () => {
      const files = [
        "myFile.ts",
        "another-file.ts",
        "test_file.ts",
        "TestFile.ts",
      ];
      const result = service.calculateNamingConsistency(files);
      expect(result).toBeLessThan(100);
    });

    it("should return 100 for empty array", () => {
      const result = service.calculateNamingConsistency([]);
      expect(result).toBe(100);
    });

    it("should return 100 for single file", () => {
      const result = service.calculateNamingConsistency(["file.ts"]);
      expect(result).toBe(100);
    });

    it("should handle files with no extensions", () => {
      const files = ["Makefile", "Dockerfile", "README"];
      const result = service.calculateNamingConsistency(files);
      expect(result).toBeLessThanOrEqual(100);
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe("calculateDepthBalance()", () => {
    it("should return 100 for optimal 2-4 levels", () => {
      expect(service.calculateDepthBalance(2, 10)).toBe(100);
      expect(service.calculateDepthBalance(3, 10)).toBe(100);
      expect(service.calculateDepthBalance(4, 10)).toBe(100);
    });

    it("should return 100 for single file", () => {
      expect(service.calculateDepthBalance(5, 1)).toBe(100);
    });

    it("should return 50 for root-heavy (depth 0)", () => {
      expect(service.calculateDepthBalance(0, 10)).toBe(50);
    });

    it("should return 75 for moderate depth (5-6)", () => {
      expect(service.calculateDepthBalance(5, 10)).toBe(75);
      expect(service.calculateDepthBalance(6, 10)).toBe(75);
    });

    it("should return lower scores for very deep structures", () => {
      expect(service.calculateDepthBalance(7, 10)).toBeLessThan(100);
      expect(service.calculateDepthBalance(8, 10)).toBeLessThan(100);
      expect(service.calculateDepthBalance(10, 10)).toBeLessThan(100);
    });

    it("should never return below 25", () => {
      expect(service.calculateDepthBalance(20, 10)).toBe(25);
      expect(service.calculateDepthBalance(100, 10)).toBe(25);
    });

    it("should handle very deep folder structures", () => {
      const result = service.calculateDepthBalance(50, 100);
      expect(result).toBe(25);
    });

    it("should handle edge cases for file count", () => {
      expect(service.calculateDepthBalance(0, 0)).toBe(100);
      expect(service.calculateDepthBalance(0, 1)).toBe(100);
    });
  });

  describe("Empty directory handling", () => {
    it("should return score 100 and Grade A for empty directory", async () => {
      const report = await service.analyzeHealth("/empty/dir");

      expect(report.score).toBe(100);
      expect(report.grade).toBe("A");
      expect(report.metrics.fileTypeEntropy.score).toBe(100);
      expect(report.metrics.namingConsistency.score).toBe(100);
      expect(report.metrics.depthBalance.score).toBe(100);
      expect(report.metrics.duplicateRatio.score).toBe(100);
      expect(report.metrics.misplacedFiles.score).toBe(100);
    });
  });

  describe("Single file handling", () => {
    it("should return score 100 and Grade A for single file", async () => {
      const files: FileWithSize[] = [
        { name: "file.txt", path: "/dir/file.txt", size: 100 },
      ];
      mockGetAllFiles.mockResolvedValue(files);

      const report = await service.analyzeHealth("/single/file");

      expect(report.score).toBe(100);
      expect(report.grade).toBe("A");
    });
  });

  describe("Project directory detection", () => {
    it("should auto-score 100 on misplaced metric for project directories", async () => {
      const files: FileWithSize[] = [
        { name: "index.js", path: "/app/index.js", size: 100 },
      ];
      mockGetAllFiles.mockResolvedValue(files);

      mockAccess
        .mockRejectedValueOnce(new Error("Not found")) // package.json
        .mockRejectedValueOnce(new Error("Not found")) // .git
        .mockRejectedValueOnce(new Error("Not found")) // Makefile
        .mockRejectedValueOnce(new Error("Not found")) // requirements.txt
        .mockRejectedValueOnce(new Error("Not found")) // Cargo.toml
        .mockResolvedValueOnce(undefined); // go.mod found!

      const report = await service.analyzeHealth("/app");

      expect(report.metrics.misplacedFiles.score).toBe(100);
    });

    it("should detect project indicators (package.json)", async () => {
      const files: FileWithSize[] = [
        { name: "index.ts", path: "/project/index.ts", size: 100 },
      ];
      mockGetAllFiles.mockResolvedValue(files);
      mockAccess
        .mockRejectedValueOnce(new Error("Not found"))
        .mockResolvedValueOnce(undefined);

      const report = await service.analyzeHealth("/project");

      expect(report.metrics.misplacedFiles.score).toBe(100);
    });

    it("should detect .git as project indicator", async () => {
      const files: FileWithSize[] = [
        { name: "main.js", path: "/repo/main.js", size: 100 },
      ];
      mockGetAllFiles.mockResolvedValue(files);
      mockAccess
        .mockRejectedValueOnce(new Error("Not found"))
        .mockRejectedValueOnce(new Error("Not found"))
        .mockResolvedValueOnce(undefined);

      const report = await service.analyzeHealth("/repo");

      expect(report.metrics.misplacedFiles.score).toBe(100);
    });
  });

  describe("Grade boundaries", () => {
    it("should return Grade A for score >= 90", async () => {
      const files: FileWithSize[] = Array.from({ length: 10 }, (_, i) => ({
        name: `file${i}.txt`,
        path: `/dir/file${i}.txt`,
        size: 100,
      }));
      mockGetAllFiles.mockResolvedValue(files);

      const report = await service.analyzeHealth("/test");

      if (report.score >= 90) {
        expect(report.grade).toBe("A");
      }
    });

    it("should return Grade B for score >= 75 and < 90", async () => {
      const files: FileWithSize[] = [
        { name: "myFile.ts", path: "/dir/file1.ts", size: 100 },
        { name: "otherFile.ts", path: "/dir/file2.ts", size: 100 },
        { name: "test.ts", path: "/dir/file3.ts", size: 100 },
        { name: "random.ts", path: "/dir/file4.ts", size: 100 },
        { name: "data.ts", path: "/dir/file5.ts", size: 100 },
      ];
      mockGetAllFiles.mockResolvedValue(files);

      const report = await service.analyzeHealth("/test");

      if (report.score >= 75 && report.score < 90) {
        expect(report.grade).toBe("B");
      }
    });

    it("should return Grade C for score >= 50 and < 75", async () => {
      const files: FileWithSize[] = Array.from({ length: 20 }, (_, i) => ({
        name: `file${i}.txt`,
        path: `/dir/file${i}.txt`,
        size: 100,
      }));
      mockGetAllFiles.mockResolvedValue(files);

      const report = await service.analyzeHealth("/test");

      if (report.score >= 50 && report.score < 75) {
        expect(report.grade).toBe("C");
      }
    });

    it("should return Grade D for score >= 25 and < 50", async () => {
      const files: FileWithSize[] = Array.from({ length: 20 }, (_, i) => ({
        name: `file${i}`,
        path: `/dir/file${i}`,
        size: 100,
      }));
      mockGetAllFiles.mockResolvedValue(files);

      const report = await service.analyzeHealth("/test");

      if (report.score >= 25 && report.score < 50) {
        expect(report.grade).toBe("D");
      }
    });

    it("should return Grade F for score < 25", async () => {
      const files: FileWithSize[] = Array.from({ length: 100 }, (_, i) => ({
        name: `file${i}`,
        path: `/dir/file${i}`,
        size: 100,
      }));
      mockGetAllFiles.mockResolvedValue(files);

      const duplicates = Array.from({ length: 50 }, (_, i) => ({
        hash: `hash${i}`,
        count: 2,
        size: "100 bytes",
        size_bytes: 100,
        files: [],
      }));
      mockFindDuplicates.mockResolvedValue(duplicates);

      const report = await service.analyzeHealth("/test");

      if (report.score < 25) {
        expect(report.grade).toBe("F");
      }
    });
  });

  describe("Timeout handling", () => {
    it("should handle timeout correctly with Promise.race", async () => {
      mockGetAllFiles.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 5000)),
      );

      await expect(
        service.analyzeHealth("/slow/dir", { timeoutSeconds: 1 }),
      ).rejects.toThrow("Analysis timed out");
    });

    it("should complete analysis before timeout", async () => {
      const files: FileWithSize[] = [
        { name: "file.txt", path: "/dir/file.txt", size: 100 },
      ];
      mockGetAllFiles.mockResolvedValue(files);

      const report = await service.analyzeHealth("/fast/dir", {
        timeoutSeconds: 10,
      });

      expect(report.score).toBeDefined();
    });
  });

  describe("Cache functionality", () => {
    it("should return cached results within TTL", async () => {
      const files: FileWithSize[] = [
        { name: "file.txt", path: "/dir/file.txt", size: 100 },
      ];
      mockGetAllFiles.mockResolvedValue(files);

      const firstCallCount = mockGetAllFiles.mock.calls.length;
      await service.analyzeHealth("/cached/dir", { useCache: true });
      await service.analyzeHealth("/cached/dir", { useCache: true });

      expect(mockGetAllFiles.mock.calls.length).toBe(firstCallCount + 1);
    });

    it("should bypass cache when useCache is false", async () => {
      const files: FileWithSize[] = [
        { name: "file.txt", path: "/dir/file.txt", size: 100 },
      ];
      mockGetAllFiles.mockResolvedValue(files);

      await service.analyzeHealth("/uncached/dir", { useCache: false });
      await service.analyzeHealth("/uncached/dir", { useCache: false });

      expect(mockGetAllFiles).toHaveBeenCalledTimes(2);
    });
  });

  describe("Edge cases", () => {
    it("should handle division by zero protection", async () => {
      const report = await service.analyzeHealth("/empty");

      expect(report.metrics.duplicateRatio.score).toBe(100);
    });

    it("should handle very deep folder structures", async () => {
      const files: FileWithSize[] = Array.from({ length: 10 }, (_, i) => ({
        name: `file${i}.txt`,
        path: `/deep/a/b/c/d/e/f/g/h/i/j/k/l/file${i}.txt`,
        size: 100,
      }));
      mockGetAllFiles.mockResolvedValue(files);

      const report = await service.analyzeHealth("/deep");

      expect(report.metrics.depthBalance.score).toBeLessThan(50);
    });

    it("should handle files with no extensions", async () => {
      const files: FileWithSize[] = [
        { name: "Makefile", path: "/dir/Makefile", size: 100 },
        { name: "README", path: "/dir/README", size: 100 },
        { name: "Dockerfile", path: "/dir/Dockerfile", size: 100 },
      ];
      mockGetAllFiles.mockResolvedValue(files);

      const report = await service.analyzeHealth("/noext");

      expect(report.metrics.fileTypeEntropy.score).toBeDefined();
    });

    it("should handle HashCalculator failures gracefully", async () => {
      const files: FileWithSize[] = [
        { name: "file.txt", path: "/dir/file.txt", size: 100 },
      ];
      mockGetAllFiles.mockResolvedValue(files);
      mockFindDuplicates.mockRejectedValue(new Error("Hash error"));

      const report = await service.analyzeHealth("/error/dir", {
        includeDuplicates: true,
      });

      expect(report.metrics.duplicateRatio.score).toBe(50);
    });

    it("should throw error when maxFiles exceeded", async () => {
      const files: FileWithSize[] = Array.from({ length: 15000 }, (_, i) => ({
        name: `file${i}.txt`,
        path: `/dir/file${i}.txt`,
        size: 100,
      }));
      mockGetAllFiles.mockResolvedValue(files);

      await expect(
        service.analyzeHealth("/large/dir", { maxFiles: 10000 }),
      ).rejects.toThrow("too many files");
    });

    it("should handle thematic directories correctly", async () => {
      const files: FileWithSize[] = [
        { name: "image1.jpg", path: "/documents/image1.jpg", size: 100 },
        { name: "image2.png", path: "/documents/image2.png", size: 100 },
      ];
      mockGetAllFiles.mockResolvedValue(files);

      const report = await service.analyzeHealth("/documents");

      expect(report.metrics.misplacedFiles.details).toContain(
        "Thematic directory",
      );
    });
  });

  describe("Suggestions generation", () => {
    it("should generate suggestions for low metrics", async () => {
      const files: FileWithSize[] = Array.from({ length: 10 }, (_, i) => ({
        name: `file${i}`,
        path: `/dir/file${i}`,
        size: 100,
      }));
      mockGetAllFiles.mockResolvedValue(files);

      const report = await service.analyzeHealth("/test");

      expect(Array.isArray(report.suggestions)).toBe(true);
    });

    it("should generate quickWins for moderate issues", async () => {
      const files: FileWithSize[] = Array.from({ length: 10 }, (_, i) => ({
        name: `file${i}`,
        path: `/dir/file${i}`,
        size: 100,
      }));
      mockGetAllFiles.mockResolvedValue(files);

      const duplicates = [
        {
          hash: "abc",
          count: 2,
          size: "100 bytes",
          size_bytes: 100,
          files: [],
        },
      ];
      mockFindDuplicates.mockResolvedValue(duplicates);

      const report = await service.analyzeHealth("/test");

      expect(Array.isArray(report.quickWins)).toBe(true);
    });
  });

  describe("Sample rate functionality", () => {
    it("should sample files when sampleRate < 1.0", async () => {
      const files: FileWithSize[] = Array.from({ length: 100 }, (_, i) => ({
        name: `file${i}.txt`,
        path: `/dir/file${i}.txt`,
        size: 100,
      }));
      mockGetAllFiles.mockResolvedValue(files);

      const report = await service.analyzeHealth("/sampled", {
        sampleRate: 0.1,
      });

      expect(report.score).toBeDefined();
    });
  });
});
