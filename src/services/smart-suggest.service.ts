/**
 * File Organizer MCP Server v3.3.4
 * Smart Suggest Service - Directory Health Scoring
 */

import fs from "fs/promises";
import path from "path";
import { logger } from "../utils/logger.js";
import { HashCalculatorService } from "./hash-calculator.service.js";
import { FileScannerService } from "./file-scanner.service.js";

export interface DirectoryHealthReport {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  metrics: {
    fileTypeEntropy: { score: number; details: string };
    namingConsistency: { score: number; details: string };
    depthBalance: { score: number; details: string };
    duplicateRatio: { score: number; details: string };
    misplacedFiles: { score: number; details: string };
  };
  suggestions: Array<{
    priority: "high" | "medium" | "low";
    message: string;
    suggestedTool?: string;
    suggestedArgs?: Record<string, unknown>;
  }>;
  quickWins?: Array<{
    action: string;
    estimatedScoreImprovement: number;
    tool: string;
    args: Record<string, unknown>;
  }>;
}

export interface SmartSuggestOptions {
  includeSubdirs?: boolean;
  includeDuplicates?: boolean;
  maxFiles?: number;
  timeoutSeconds?: number;
  sampleRate?: number;
  useCache?: boolean;
}

interface CacheEntry {
  report: DirectoryHealthReport;
  timestamp: number;
}

const CACHE_TTL = 30 * 60 * 1000;
const DEFAULT_MAX_FILES = 10000;
const DEFAULT_TIMEOUT = 60;
const DEFAULT_SAMPLE_RATE = 1.0;

const PROJECT_INDICATORS = [
  "package.json",
  ".git",
  "Makefile",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "CMakeLists.txt",
  "tsconfig.json",
  "pyproject.toml",
];

const THEMATIC_DIRS = [
  "project",
  "projects",
  "work",
  "personal",
  "temp",
  "archive",
  "documents",
  "downloads",
];

const CAMEL_CASE = /^[a-z]+(?:[A-Z][a-z]+)*$/;
const KEBAB_CASE = /^[a-z]+(?:-[a-z]+)*$/;
const SNAKE_CASE = /^[a-z]+(?:_[a-z]+)*$/;
const PASCAL_CASE = /^[A-Z][a-z]+(?:[A-Z][a-z]+)*$/;

export class SmartSuggestService {
  private hashCalculator: HashCalculatorService;
  private fileScanner: FileScannerService;
  private cache: Map<string, CacheEntry>;

  constructor() {
    this.hashCalculator = new HashCalculatorService();
    this.fileScanner = new FileScannerService();
    this.cache = new Map();
  }

  async analyzeHealth(
    directory: string,
    options?: SmartSuggestOptions,
  ): Promise<DirectoryHealthReport> {
    const opts: Required<SmartSuggestOptions> = {
      includeSubdirs: options?.includeSubdirs ?? true,
      includeDuplicates: options?.includeDuplicates ?? true,
      maxFiles: options?.maxFiles ?? DEFAULT_MAX_FILES,
      timeoutSeconds: options?.timeoutSeconds ?? DEFAULT_TIMEOUT,
      sampleRate: options?.sampleRate ?? DEFAULT_SAMPLE_RATE,
      useCache: options?.useCache ?? true,
    };

    const cacheKey = `${directory}:${JSON.stringify(opts)}`;
    if (opts.useCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.report;
      }
    }

    const timeoutMs = opts.timeoutSeconds * 1000;
    try {
      const report = await Promise.race([
        this.performAnalysis(directory, opts),
        this.createTimeout(timeoutMs),
      ]);

      if (opts.useCache) {
        this.cache.set(cacheKey, { report, timestamp: Date.now() });
      }

      return report;
    } catch (error) {
      if (error instanceof Error && error.message === "Analysis timed out") {
        throw new Error(`Analysis timed out after ${opts.timeoutSeconds}s`);
      }
      throw error;
    }
  }

  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Analysis timed out")), ms),
    );
  }

  private async performAnalysis(
    directory: string,
    opts: Required<SmartSuggestOptions>,
  ): Promise<DirectoryHealthReport> {
    const files = await this.fileScanner.getAllFiles(
      directory,
      opts.includeSubdirs,
    );

    if (files.length === 0) {
      return this.createPerfectReport("Empty directory");
    }

    if (files.length > opts.maxFiles) {
      throw new Error(
        `Directory contains too many files (${files.length}). Maximum allowed: ${opts.maxFiles}`,
      );
    }

    const sampledFiles =
      opts.sampleRate < 1.0 ? this.sampleFiles(files, opts.sampleRate) : files;

    const fileTypes = this.extractFileTypes(sampledFiles);
    const fileNames = sampledFiles.map((f) => path.basename(f.name));
    const maxDepth = this.calculateMaxDepth(sampledFiles, directory);

    const isProject = await this.checkProjectIndicators(directory);
    const isThematic = this.checkThematicDirectory(directory);
    const baseline = isProject ? 100 : isThematic ? 85 : 0;

    const entropyScore = this.calculateEntropy(fileTypes);
    const namingScore = this.calculateNamingConsistency(fileNames);
    const depthScore = this.calculateDepthBalance(
      maxDepth,
      sampledFiles.length,
    );

    let duplicateScore: number;
    let misplacedScore: number;

    if (opts.includeDuplicates) {
      try {
        const duplicates =
          await this.hashCalculator.findDuplicates(sampledFiles);
        const totalDupes = duplicates.reduce((sum, g) => sum + g.count - 1, 0);
        duplicateScore =
          sampledFiles.length > 0
            ? 100 * (1 - totalDupes / sampledFiles.length)
            : 100;
      } catch {
        duplicateScore = 50;
      }
    } else {
      duplicateScore = 75;
    }

    if (isProject) {
      misplacedScore = 100;
    } else {
      misplacedScore = this.calculateMisplacedScore(
        sampledFiles,
        directory,
        isThematic,
      );
    }

    const weightedScore =
      entropyScore * 0.25 +
      namingScore * 0.2 +
      depthScore * 0.15 +
      duplicateScore * 0.2 +
      misplacedScore * 0.2;

    const score = Math.round(weightedScore);
    const grade = this.calculateGrade(score);

    const metrics = {
      fileTypeEntropy: {
        score: Math.round(entropyScore),
        details: this.getEntropyDetails(fileTypes),
      },
      namingConsistency: {
        score: Math.round(namingScore),
        details: this.getNamingDetails(namingScore, fileNames),
      },
      depthBalance: {
        score: Math.round(depthScore),
        details: this.getDepthDetails(maxDepth),
      },
      duplicateRatio: {
        score: Math.round(duplicateScore),
        details: this.getDuplicateDetails(duplicateScore),
      },
      misplacedFiles: {
        score: Math.round(misplacedScore),
        details: this.getMisplacedDetails(misplacedScore, baseline),
      },
    };

    const suggestions = this.generateSuggestions(metrics, isProject);
    const quickWins = this.generateQuickWins(metrics, directory);

    return {
      score,
      grade,
      metrics,
      suggestions,
      quickWins,
    };
  }

  private sampleFiles<T>(files: T[], rate: number): T[] {
    const count = Math.ceil(files.length * rate);
    const step = Math.max(1, Math.floor(files.length / count));
    return files.filter((_, i) => i % step === 0).slice(0, count);
  }

  private extractFileTypes(
    files: Array<{ name: string }>,
  ): Map<string, number> {
    const types = new Map<string, number>();
    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase() || "no_extension";
      types.set(ext, (types.get(ext) || 0) + 1);
    }
    return types;
  }

  calculateEntropy(fileTypes: Map<string, number>): number {
    const total = Array.from(fileTypes.values()).reduce((a, b) => a + b, 0);
    if (total === 0) return 100;

    const epsilon = 1e-10;
    let entropy = 0;

    for (const count of fileTypes.values()) {
      const p = count / total;
      if (p > 0) {
        entropy += -p * Math.log2(p + epsilon);
      }
    }

    const maxEntropy = Math.log2(fileTypes.size || 1);
    const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 1;

    return normalizedEntropy * 100;
  }

  private getEntropyDetails(fileTypes: Map<string, number>): string {
    const total = Array.from(fileTypes.values()).reduce((a, b) => a + b, 0);
    const unique = fileTypes.size;

    if (unique <= 1) {
      return `Single file type (${Array.from(fileTypes.keys())[0] || "none"}). Low diversity.`;
    }

    const sortedTypes = [...fileTypes.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const topTypes = sortedTypes
      .map(([ext, count]) => `${ext} (${Math.round((count / total) * 100)}%)`)
      .join(", ");

    return `${unique} unique types. Top: ${topTypes}`;
  }

  calculateNamingConsistency(files: string[]): number {
    if (files.length === 0) return 100;
    if (files.length === 1) return 100;

    const patterns = {
      camelCase: 0,
      kebab: 0,
      snake: 0,
      Pascal: 0,
      other: 0,
    };

    for (const file of files) {
      const nameWithoutExt = path.basename(file, path.extname(file));
      if (CAMEL_CASE.test(nameWithoutExt)) patterns.camelCase++;
      else if (KEBAB_CASE.test(nameWithoutExt)) patterns.kebab++;
      else if (SNAKE_CASE.test(nameWithoutExt)) patterns.snake++;
      else if (PASCAL_CASE.test(nameWithoutExt)) patterns.Pascal++;
      else patterns.other++;
    }

    const dominant = Math.max(...Object.values(patterns));
    return (dominant / files.length) * 100;
  }

  private getNamingDetails(score: number, files: string[]): string {
    if (files.length <= 1)
      return "Single file - naming consistency not applicable";

    const patterns = {
      camelCase: 0,
      kebab: 0,
      snake: 0,
      Pascal: 0,
      other: 0,
    };

    for (const file of files) {
      const nameWithoutExt = path.basename(file, path.extname(file));
      if (CAMEL_CASE.test(nameWithoutExt)) patterns.camelCase++;
      else if (KEBAB_CASE.test(nameWithoutExt)) patterns.kebab++;
      else if (SNAKE_CASE.test(nameWithoutExt)) patterns.snake++;
      else if (PASCAL_CASE.test(nameWithoutExt)) patterns.Pascal++;
      else patterns.other++;
    }

    const dominant = Object.entries(patterns).reduce((a, b) =>
      a[1] > b[1] ? a : b,
    );

    return `Dominant pattern: ${dominant[0]} (${dominant[1]} files, ${Math.round(score)}% consistency)`;
  }

  calculateDepthBalance(maxDepth: number, fileCount: number): number {
    if (fileCount <= 1) return 100;
    if (maxDepth === 0) return 50;
    if (maxDepth >= 1 && maxDepth <= 4) return 100;
    if (maxDepth === 5 || maxDepth === 6) return 75;
    if (maxDepth > 6) return Math.max(25, 100 - (maxDepth - 6) * 10);

    return 50;
  }

  private getDepthDetails(maxDepth: number): string {
    if (maxDepth === 0)
      return "All files in root directory - consider organization";
    if (maxDepth >= 1 && maxDepth <= 4)
      return `Optimal depth: ${maxDepth} level(s)`;
    if (maxDepth <= 6) return `Moderate depth: ${maxDepth} levels`;
    return `Deep structure: ${maxDepth} levels - may benefit from flattening`;
  }

  private getDuplicateDetails(score: number): string {
    if (score >= 95) return "Very few duplicates - well maintained";
    if (score >= 80) return "Minor duplicates present";
    if (score >= 60) return "Moderate duplicate ratio - review needed";
    return "High duplicate ratio - consider running deduplication";
  }

  private getMisplacedDetails(score: number, baseline: number): string {
    if (baseline === 100)
      return "Project directory detected - no misplaced files";
    if (baseline === 85) return "Thematic directory - baseline applied";
    if (score >= 80) return "Files generally well-organized";
    if (score >= 60) return "Some files may be in suboptimal locations";
    return "Many files appear misplaced - consider reorganization";
  }

  private calculateMisplacedScore(
    files: Array<{ path: string }>,
    directory: string,
    isThematic: boolean,
  ): number {
    if (files.length === 0) return 100;

    const dirName = path.basename(directory).toLowerCase();
    const extCounts = new Map<string, number>();

    for (const file of files) {
      const ext = path.extname(file.path).toLowerCase().slice(1);
      if (ext) extCounts.set(ext, (extCounts.get(ext) || 0) + 1);
    }

    let mismatches = 0;
    const total = files.length;

    if (dirName.includes("image") || dirName.includes("photo")) {
      const imageExts = ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"];
      for (const [ext] of extCounts) {
        if (!imageExts.includes(ext)) mismatches++;
      }
    } else if (dirName.includes("document")) {
      const docExts = ["pdf", "doc", "docx", "txt", "md", "odt"];
      for (const [ext] of extCounts) {
        if (!docExts.includes(ext)) mismatches++;
      }
    } else if (dirName.includes("music") || dirName.includes("audio")) {
      const musicExts = ["mp3", "wav", "flac", "aac", "ogg", "m4a"];
      for (const [ext] of extCounts) {
        if (!musicExts.includes(ext)) mismatches++;
      }
    } else if (dirName.includes("video")) {
      const videoExts = ["mp4", "avi", "mkv", "mov", "wmv", "webm"];
      for (const [ext] of extCounts) {
        if (!videoExts.includes(ext)) mismatches++;
      }
    } else if (!isThematic) {
      mismatches = Math.floor(total * 0.3);
    }

    const mismatchRatio = total > 0 ? mismatches / total : 0;
    return Math.max(0, (1 - mismatchRatio) * 100);
  }

  private calculateMaxDepth(
    files: Array<{ path: string }>,
    baseDir: string,
  ): number {
    let maxDepth = 0;
    for (const file of files) {
      const relativePath = path.relative(baseDir, file.path);
      const depth = relativePath.split(path.sep).filter(Boolean).length - 1;
      maxDepth = Math.max(maxDepth, depth);
    }
    return maxDepth;
  }

  private async checkProjectIndicators(directory: string): Promise<boolean> {
    for (const indicator of PROJECT_INDICATORS) {
      try {
        await fs.access(path.join(directory, indicator));
        return true;
      } catch {
        continue;
      }
    }
    return false;
  }

  private checkThematicDirectory(directory: string): boolean {
    const dirName = path.basename(directory).toLowerCase();
    return THEMATIC_DIRS.some((thematic) => dirName.includes(thematic));
  }

  private calculateGrade(score: number): "A" | "B" | "C" | "D" | "F" {
    if (score >= 90) return "A";
    if (score >= 80) return "B";
    if (score >= 70) return "C";
    if (score >= 60) return "D";
    return "F";
  }

  private createPerfectReport(reason: string): DirectoryHealthReport {
    return {
      score: 100,
      grade: "A",
      metrics: {
        fileTypeEntropy: { score: 100, details: reason },
        namingConsistency: { score: 100, details: reason },
        depthBalance: { score: 100, details: reason },
        duplicateRatio: { score: 100, details: "No files to analyze" },
        misplacedFiles: { score: 100, details: reason },
      },
      suggestions: [],
      quickWins: [],
    };
  }

  private generateSuggestions(
    metrics: DirectoryHealthReport["metrics"],
    isProject: boolean,
  ): DirectoryHealthReport["suggestions"] {
    const suggestions: DirectoryHealthReport["suggestions"] = [];

    if (metrics.fileTypeEntropy.score < 60) {
      suggestions.push({
        priority: "high",
        message:
          "Low file type diversity - consider categorizing files into folders",
        suggestedTool: "organize",
      });
    }

    if (metrics.namingConsistency.score < 60) {
      suggestions.push({
        priority: "medium",
        message: "Inconsistent file naming - standardize naming convention",
        suggestedTool: "rename",
        suggestedArgs: { pattern: "kebab-case" },
      });
    }

    if (metrics.depthBalance.score < 60) {
      suggestions.push({
        priority: "medium",
        message:
          "Directory structure is too deep or flat - optimize organization",
        suggestedTool: "organize",
      });
    }

    if (metrics.duplicateRatio.score < 60) {
      suggestions.push({
        priority: "high",
        message: "High duplicate ratio - run deduplication to free space",
        suggestedTool: "find-duplicates",
      });
    }

    if (metrics.misplacedFiles.score < 60 && !isProject) {
      suggestions.push({
        priority: "medium",
        message: "Files may be in wrong locations - review organization",
        suggestedTool: "organize",
      });
    }

    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  private generateQuickWins(
    metrics: DirectoryHealthReport["metrics"],
    directory: string,
  ): DirectoryHealthReport["quickWins"] {
    const quickWins: DirectoryHealthReport["quickWins"] = [];

    if (
      metrics.duplicateRatio.score < 80 &&
      metrics.duplicateRatio.score >= 60
    ) {
      quickWins.push({
        action: "Remove duplicate files",
        estimatedScoreImprovement: 15,
        tool: "find-duplicates",
        args: { directory },
      });
    }

    if (
      metrics.namingConsistency.score < 80 &&
      metrics.namingConsistency.score >= 50
    ) {
      quickWins.push({
        action: "Standardize naming convention",
        estimatedScoreImprovement: 10,
        tool: "rename",
        args: { directory, pattern: "kebab-case" },
      });
    }

    return quickWins;
  }
}

export const smartSuggestService = new SmartSuggestService();
