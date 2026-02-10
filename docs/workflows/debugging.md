# Debugging Workflows

This document describes debugging workflows for diagnosing and resolving file organization issues.

---

## Overview

Debugging workflows help identify, diagnose, and resolve issues in file organization operations.

---

## Workflow 1: Issue Diagnosis

Systematic investigation of file organization problems.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Issue Diagnosis Workflow                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │  Issue          │───▶│  Gather          │───▶│  Analyze         │        │
│  │  Reported       │    │  Information    │    │  Root Cause     │        │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│                                                              │            │
│                                                              ▼            │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │  Solution       │───▶│  Implement       │───▶│  Verify          │        │
│  │  Proposed       │    │  Fix            │    │  Resolution      │        │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### TypeScript Implementation

```typescript
interface DiagnosticReport {
  id: string;
  timestamp: Date;
  issue: IssueDescription;
  findings: DiagnosticFinding[];
  rootCause?: string;
  recommendations: string[];
  severity: "low" | "medium" | "high" | "critical";
}

interface IssueDescription {
  type:
    | "file-not-organized"
    | "duplicate-detected"
    | "permission-denied"
    | "path-validation-failed"
    | "category-mismatch"
    | "performance-issue"
    | "custom";
  description: string;
  affectedPaths?: string[];
  expectedBehavior: string;
  actualBehavior: string;
  reproducible: boolean;
  occurrenceCount: number;
}

interface DiagnosticFinding {
  category: string;
  message: string;
  severity: "info" | "warning" | "error";
  evidence: Evidence[];
  relatedFile?: string;
}

interface Evidence {
  type: "log" | "config" | "file-metadata" | "system-info";
  data: Record<string, unknown>;
  timestamp: Date;
}

class DiagnosisWorkflow {
  async diagnose(issue: IssueDescription): Promise<DiagnosticReport> {
    const findings: DiagnosticFinding[] = [];

    // Gather diagnostic information
    const gatherers = [
      this.checkFileSystemHealth,
      this.checkConfiguration,
      this.checkPermissions,
      this.checkLogs,
      this.checkPerformance,
    ];

    for (const gatherer of gatherers) {
      const result = await gatherer(issue);
      findings.push(...result);
    }

    // Analyze findings
    const rootCause = this.analyzeRootCause(findings);

    // Generate recommendations
    const recommendations = this.generateRecommendations(findings, rootCause);

    // Determine severity
    const severity = this.determineSeverity(findings, issue);

    return {
      id: `diag-${Date.now()}`,
      timestamp: new Date(),
      issue,
      findings,
      rootCause,
      recommendations,
      severity,
    };
  }

  private async checkFileSystemHealth(
    issue: IssueDescription,
  ): Promise<DiagnosticFinding[]> {
    const findings: DiagnosticFinding[] = [];

    for (const path of issue.affectedPaths || []) {
      const exists = await this.pathExists(path);
      if (!exists) {
        findings.push({
          category: "File System",
          message: `Path does not exist: ${path}`,
          severity: "error",
          evidence: [
            {
              type: "file-metadata",
              data: { path, exists: false },
              timestamp: new Date(),
            },
          ],
        });
      }

      const stats = await this.getFileStats(path);
      if (stats) {
        if (stats.isSymlink) {
          findings.push({
            category: "File System",
            message: `Path is a symbolic link: ${path}`,
            severity: "info",
            evidence: [
              {
                type: "file-metadata",
                data: { symlinkTarget: stats.symlinkTarget },
                timestamp: new Date(),
              },
            ],
          });
        }
      }
    }

    return findings;
  }

  private async checkConfiguration(
    issue: IssueDescription,
  ): Promise<DiagnosticFinding[]> {
    const findings: DiagnosticFinding[] = [];

    const config = await this.loadConfiguration();

    // Check for category configuration
    if (issue.type === "category-mismatch") {
      const categoryConfig = config.categories;
      const missingCategories =
        issue.affectedPaths?.filter(
          (path) => !this.matchAnyCategory(path, categoryConfig),
        ) || [];

      if (missingCategories.length > 0) {
        findings.push({
          category: "Configuration",
          message: `Files not matching any category: ${missingCategories.join(", ")}`,
          severity: "warning",
          evidence: [
            {
              type: "config",
              data: { categories: categoryConfig },
              timestamp: new Date(),
            },
          ],
        });
      }
    }

    // Check for custom rules
    if (!config.customRules || config.customRules.length === 0) {
      findings.push({
        category: "Configuration",
        message: "No custom rules defined",
        severity: "info",
        evidence: [
          {
            type: "config",
            data: { customRulesExist: false },
            timestamp: new Date(),
          },
        ],
      });
    }

    return findings;
  }

  private async checkPermissions(
    issue: IssueDescription,
  ): Promise<DiagnosticFinding[]> {
    const findings: DiagnosticFinding[] = [];

    for (const path of issue.affectedPaths || []) {
      try {
        const access = await this.checkAccess(path);
        if (!access.readable) {
          findings.push({
            category: "Permissions",
            message: `Read access denied: ${path}`,
            severity: "error",
            evidence: [
              {
                type: "system-info",
                data: { path, readable: false },
                timestamp: new Date(),
              },
            ],
            relatedFile: path,
          });
        }
        if (!access.writable) {
          findings.push({
            category: "Permissions",
            message: `Write access denied: ${path}`,
            severity: "error",
            evidence: [
              {
                type: "system-info",
                data: { path, writable: false },
                timestamp: new Date(),
              },
            ],
            relatedFile: path,
          });
        }
      } catch (error) {
        findings.push({
          category: "Permissions",
          message: `Permission check failed: ${error}`,
          severity: "error",
          evidence: [
            {
              type: "log",
              data: { error: String(error) },
              timestamp: new Date(),
            },
          ],
        });
      }
    }

    return findings;
  }

  private async checkLogs(
    issue: IssueDescription,
  ): Promise<DiagnosticFinding[]> {
    const findings: DiagnosticFinding[] = [];

    const recentLogs = await this.getRecentLogs(issue.affectedPaths);

    if (recentLogs.length === 0) {
      findings.push({
        category: "Logs",
        message: "No recent logs found for affected paths",
        severity: "info",
        evidence: [
          {
            type: "log",
            data: { logCount: 0 },
            timestamp: new Date(),
          },
        ],
      });
    }

    const errors = recentLogs.filter((log) => log.level === "error");
    if (errors.length > 0) {
      findings.push({
        category: "Logs",
        message: `Found ${errors.length} error logs`,
        severity: "warning",
        evidence: [
          {
            type: "log",
            data: { errors: errors.slice(0, 10) },
            timestamp: new Date(),
          },
        ],
      });
    }

    return findings;
  }

  private async checkPerformance(
    issue: IssueDescription,
  ): Promise<DiagnosticFinding[]> {
    const findings: DiagnosticFinding[] = [];

    if (issue.type === "performance-issue") {
      const metrics = await this.getPerformanceMetrics();

      if (metrics.averageResponseTime > 5000) {
        findings.push({
          category: "Performance",
          message: `High average response time: ${metrics.averageResponseTime}ms`,
          severity: "warning",
          evidence: [
            {
              type: "system-info",
              data: metrics,
              timestamp: new Date(),
            },
          ],
        });
      }

      if (metrics.memoryUsage > 0.9) {
        findings.push({
          category: "Performance",
          message: "High memory usage detected",
          severity: "warning",
          evidence: [
            {
              type: "system-info",
              data: { memoryUsage: metrics.memoryUsage },
              timestamp: new Date(),
            },
          ],
        });
      }
    }

    return findings;
  }

  private analyzeRootCause(findings: DiagnosticFinding[]): string | undefined {
    const errors = findings.filter((f) => f.severity === "error");

    if (errors.length === 0) {
      return undefined;
    }

    const grouped = this.groupBy(errors, "category");

    for (const [category, items] of grouped) {
      if (category === "Permissions") {
        return "Permission issues are preventing file operations";
      }
      if (category === "File System") {
        return "File system issues are affecting file organization";
      }
      if (category === "Configuration") {
        return "Configuration issues are preventing proper categorization";
      }
    }

    return errors[0]?.message;
  }

  private generateRecommendations(
    findings: DiagnosticFinding[],
    rootCause?: string,
  ): string[] {
    const recommendations: string[] = [];

    const errors = findings.filter((f) => f.severity === "error");
    const warnings = findings.filter((f) => f.severity === "warning");

    // Address root cause
    if (rootCause?.includes("Permission")) {
      recommendations.push("Check and fix file permissions");
      recommendations.push(
        "Ensure the application has necessary access rights",
      );
    }

    if (rootCause?.includes("File system")) {
      recommendations.push("Verify file paths exist and are accessible");
      recommendations.push("Check for broken symbolic links");
    }

    // Address specific findings
    for (const error of errors) {
      if (error.category === "Configuration") {
        recommendations.push(`Review ${error.category.toLowerCase()} settings`);
      }
    }

    // Address warnings
    for (const warning of warnings.slice(0, 3)) {
      recommendations.push(
        `Monitor ${warning.category.toLowerCase()} for ${warning.message}`,
      );
    }

    return [...new Set(recommendations)];
  }

  private determineSeverity(
    findings: DiagnosticFinding[],
    issue: IssueDescription,
  ): "low" | "medium" | "high" | "critical" {
    const errors = findings.filter((f) => f.severity === "error");

    if (errors.length >= 5) return "critical";
    if (errors.length >= 3) return "high";
    if (errors.length >= 1) return "medium";

    const warnings = findings.filter((f) => f.severity === "warning");
    if (warnings.length >= 5) return "medium";

    return "low";
  }

  private groupBy<T>(array: T[], key: keyof T): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const item of array) {
      const keyValue = String(item[key]);
      const existing = map.get(keyValue) || [];
      existing.push(item);
      map.set(keyValue, existing);
    }
    return map;
  }

  // Helper methods (implementations would go here)
  private async pathExists(path: string): Promise<boolean> {
    return true;
  }
  private async getFileStats(
    path: string,
  ): Promise<{ isSymlink: boolean; symlinkTarget?: string } | null> {
    return null;
  }
  private async loadConfiguration(): Promise<Record<string, unknown>> {
    return {};
  }
  private matchAnyCategory(
    path: string,
    categories: Record<string, string[]>,
  ): boolean {
    return false;
  }
  private async checkAccess(
    path: string,
  ): Promise<{ readable: boolean; writable: boolean }> {
    return { readable: true, writable: true };
  }
  private async getRecentLogs(
    paths?: string[],
  ): Promise<Array<{ level: string; message: string }>> {
    return [];
  }
  private async getPerformanceMetrics(): Promise<{
    averageResponseTime: number;
    memoryUsage: number;
  }> {
    return { averageResponseTime: 0, memoryUsage: 0 };
  }
}
```

---

## Workflow 2: Duplicate Detection Debugging

Diagnose and resolve duplicate file issues.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Duplicate Detection Debugging                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │  Duplicates     │───▶│  Analyze         │───▶│  Identify        │        │
│  │  Detected       │    │  Hash Methods   │    │  False Positives │        │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│                                                              │            │
│                                                              ▼            │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │  Auto-          │───▶│  User            │───▶│  Execute         │        │
│  │  Select Kept    │    │  Review          │    │  Cleanup         │        │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### TypeScript Implementation

```typescript
interface DuplicateAnalysis {
  groups: DuplicateGroup[];
  falsePositives: DuplicateGroup[];
  recommendations: string[];
  hashAlgorithm: string;
  performance: {
    totalFiles: number;
    scannedFiles: number;
    duration: number;
  };
}

interface DuplicateGroup {
  hash: string;
  files: DuplicateFile[];
  size: number;
  isFalsePositive: boolean;
  suggestedKeep?: string;
}

interface DuplicateFile {
  path: string;
  modifiedDate: Date;
  size: number;
  quality: "high" | "medium" | "low";
  location: string;
}

class DuplicateDebugWorkflow {
  async analyzeDuplicates(
    directory: string,
    options?: DuplicateAnalysisOptions,
  ): Promise<DuplicateAnalysis> {
    const groups = await this.findDuplicateGroups(directory, options);
    const falsePositives = await this.identifyFalsePositives(groups);

    // Analyze hash quality
    const hashAnalysis = await this.analyzeHashQuality(groups);

    return {
      groups,
      falsePositives,
      recommendations: this.generateRecommendations(groups, falsePositives),
      hashAlgorithm: options?.hashAlgorithm || "sha256",
      performance: {
        totalFiles: groups.reduce((sum, g) => sum + g.files.length, 0),
        scannedFiles: groups.reduce((sum, g) => sum + g.files.length, 0),
        duration: 0, // Would track actual duration
      },
    };
  }

  private async findDuplicateGroups(
    directory: string,
    options?: DuplicateAnalysisOptions,
  ): Promise<DuplicateGroup[]> {
    const files = await this.scanDirectory(directory, options);
    const groups = await this.groupByHash(
      files,
      options?.hashAlgorithm || "sha256",
    );

    return groups.map((group) => ({
      hash: group.hash,
      files: group.files.map((f) => ({
        path: f.path,
        modifiedDate: f.modifiedDate,
        size: f.size,
        quality: this.assessQuality(f),
        location: this.categorizeLocation(f.path),
      })),
      size: group.files.length * group.files[0].size,
      isFalsePositive: false,
    }));
  }

  private async identifyFalsePositives(
    groups: DuplicateGroup[],
  ): Promise<DuplicateGroup[]> {
    const falsePositives: DuplicateGroup[] = [];

    for (const group of groups) {
      // Check if files are in different locations (likely not duplicates)
      const locations = new Set(group.files.map((f) => f.location));
      if (locations.size > 1 && locations.has("external")) {
        group.isFalsePositive = true;
        falsePositives.push(group);
        continue;
      }

      // Check file extensions differ
      const extensions = new Set(
        group.files.map((f) => this.getExtension(f.path)),
      );
      if (extensions.size > 1) {
        group.isFalsePositive = true;
        falsePositives.push(group);
        continue;
      }

      // Check content actually differs (compare first and last bytes)
      const contentDiff = await this.compareContent(
        group.files[0].path,
        group.files[1].path,
      );
      if (contentDiff) {
        group.isFalsePositive = true;
        falsePositives.push(group);
        continue;
      }
    }

    return falsePositives;
  }

  private async analyzeHashQuality(groups: DuplicateGroup[]): Promise<{
    algorithm: string;
    collisionRisk: "low" | "medium" | "high";
    recommendations: string[];
  }> {
    const recommendations: string[] = [];
    let collisionRisk: "low" | "medium" | "high" = "low";

    const smallGroups = groups.filter((g) => g.size < 1000);
    if (smallGroups.length > 100) {
      collisionRisk = "medium";
      recommendations.push(
        "Consider using SHA-512 for better collision resistance",
      );
    }

    return {
      algorithm: "sha256",
      collisionRisk,
      recommendations,
    };
  }

  private assessQuality(file: DuplicateFile): "high" | "medium" | "low" {
    // Higher quality = more recent, in better location
    const isProjectFile = file.location === "project";
    const isRecent =
      file.modifiedDate > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    if (isProjectFile && isRecent) return "high";
    if (isProjectFile || isRecent) return "medium";
    return "low";
  }

  private categorizeLocation(path: string): string {
    if (path.includes("/project/")) return "project";
    if (path.includes("/external/")) return "external";
    if (path.includes("/backup/")) return "backup";
    return "other";
  }

  private getExtension(path: string): string {
    return path.split(".").pop()?.toLowerCase() || "";
  }

  private async compareContent(path1: string, path2: string): Promise<boolean> {
    // Compare first and last bytes to detect content differences
    return false; // Simplified
  }

  private async scanDirectory(
    directory: string,
    options?: DuplicateAnalysisOptions,
  ): Promise<Array<{ path: string; modifiedDate: Date; size: number }>> {
    return [];
  }

  private async groupByHash(
    files: Array<{ path: string; modifiedDate: Date; size: number }>,
    algorithm: string,
  ): Promise<
    Array<{
      hash: string;
      files: Array<{ path: string; modifiedDate: Date; size: number }>;
    }>
  > {
    return [];
  }

  private generateRecommendations(
    groups: DuplicateGroup[],
    falsePositives: DuplicateGroup[],
  ): string[] {
    const recommendations: string[] = [];

    const totalDuplicates = groups.length - falsePositives.length;
    const wastedSpace = groups.reduce((sum, g) => {
      if (!g.isFalsePositive) {
        return sum + (g.files.length - 1) * g.files[0].size;
      }
      return sum;
    }, 0);

    if (wastedSpace > 1024 * 1024 * 100) {
      // 100MB
      recommendations.push(
        `Potential space savings: ${(wastedSpace / 1024 / 1024).toFixed(0)}MB`,
      );
    }

    if (falsePositives.length > 0) {
      recommendations.push(
        `Found ${falsePositives.length} false positive groups - review before deletion`,
      );
    }

    recommendations.push(
      "Consider implementing duplicate prevention for frequently duplicated file types",
    );

    return recommendations;
  }
}

interface DuplicateAnalysisOptions {
  hashAlgorithm?: "md5" | "sha256" | "sha512";
  includeHidden?: boolean;
  minFileSize?: number;
  maxDepth?: number;
}
```

---

## Workflow 3: Path Validation Debugging

Diagnose path validation failures.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Path Validation Debugging                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │  Path Rejected  │───▶│  Run 8-Layer     │───▶│  Identify        │        │
│  │                 │    │  Validation      │    │  Failed Layer    │        │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│                                                              │            │
│                                                              ▼            │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │  Generate        │───▶│  Suggest         │───▶│  Test            │        │
│  │  Fix Report      │    │  Solutions       │    │  Correction       │        │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### TypeScript Implementation

```typescript
interface PathValidationReport {
  path: string;
  validationLayers: LayerResult[];
  passedLayers: string[];
  failedLayer?: string;
  failedLayerIndex: number;
  fixSuggestions: FixSuggestion[];
  alternativePaths: string[];
  overallStatus: "valid" | "invalid";
}

interface LayerResult {
  layer: string;
  index: number;
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}

interface FixSuggestion {
  type: "rename" | "move" | "shorten" | "escape";
  description: string;
  example?: string;
  effort: "low" | "medium" | "high";
}

class PathValidationDebugWorkflow {
  async analyzePath(path: string): Promise<PathValidationReport> {
    const layers = await this.runAllValidationLayers(path);
    const passedLayers = layers.filter((l) => l.passed).map((l) => l.layer);
    const failedLayer = layers.find((l) => !l.passed);
    const failedIndex = layers.findIndex((l) => !l.passed);

    const fixSuggestions = failedLayer
      ? this.generateFixSuggestions(path, failedLayer)
      : [];

    const alternativePaths = failedLayer
      ? this.generateAlternativePaths(path, failedLayer)
      : [];

    return {
      path,
      validationLayers: layers,
      passedLayers,
      failedLayer: failedLayer?.layer,
      failedLayerIndex: failedIndex,
      fixSuggestions,
      alternativePaths,
      overallStatus: failedLayer ? "invalid" : "valid",
    };
  }

  private async runAllValidationLayers(path: string): Promise<LayerResult[]> {
    return [
      await this.validateLength(path),
      await this.validateCharacters(path),
      await this.validateTraversal(path),
      await this.validateReservedNames(path),
      await this.validateType(path),
      await this.validatePermissions(path),
      await this.validateQuota(path),
      await this.validateSymlinks(path),
    ];
  }

  private async validateLength(path: string): Promise<LayerResult> {
    const MAX_PATH = 260; // Windows limit
    const actualLength = path.length;

    return {
      layer: "Length Check",
      index: 1,
      passed: actualLength <= MAX_PATH,
      message:
        actualLength <= MAX_PATH
          ? `Path length (${actualLength}) is within limit`
          : `Path length (${actualLength}) exceeds maximum (${MAX_PATH})`,
      details: { actualLength, maxLength: MAX_PATH },
    };
  }

  private async validateCharacters(path: string): Promise<LayerResult> {
    const forbiddenChars = /[<>:"/\\|?*]/;
    const match = path.match(forbiddenChars);

    return {
      layer: "Character Check",
      index: 2,
      passed: !match,
      message: match
        ? `Forbidden character found: "${match[0]}"`
        : "No forbidden characters detected",
      details: match
        ? { forbiddenChar: match[0], position: match.index }
        : null,
    };
  }

  private async validateTraversal(path: string): Promise<LayerResult> {
    const traversalPatterns = /\.\.\\/g;
    const matches = path.match(traversalPatterns);

    return {
      layer: "Traversal Check",
      index: 3,
      passed: !matches || matches.length === 0,
      message: matches
        ? `Path traversal attempt detected (${matches.length} occurrences)`
        : "No path traversal detected",
      details: matches ? { occurrences: matches.length } : null,
    };
  }

  private async validateReservedNames(path: string): Promise<LayerResult> {
    const reservedNames = [
      "CON",
      "PRN",
      "AUX",
      "NUL",
      "COM1",
      "COM2",
      "COM3",
      "COM4",
      "COM5",
      "COM6",
      "COM7",
      "COM8",
      "COM9",
      "LPT1",
      "LPT2",
      "LPT3",
      "LPT4",
      "LPT5",
      "LPT6",
      "LPT7",
      "LPT8",
      "LPT9",
    ];
    const pathParts = path.split(/[/\\]/);
    const fileName = pathParts[pathParts.length - 1]
      .split(".")[0]
      .toUpperCase();

    const found = reservedNames.find((name) => name === fileName);

    return {
      layer: "Reserved Name Check",
      index: 4,
      passed: !found,
      message: found
        ? `Reserved Windows name detected: ${found}`
        : "No reserved Windows names detected",
      details: found ? { reservedName: found } : null,
    };
  }

  private async validateType(path: string): Promise<LayerResult> {
    // Simplified - actual implementation would check file type
    return {
      layer: "Type Check",
      index: 5,
      passed: true,
      message: "File type validation passed",
    };
  }

  private async validatePermissions(path: string): Promise<LayerResult> {
    // Simplified - actual implementation would check permissions
    return {
      layer: "Permission Check",
      index: 6,
      passed: true,
      message: "Permission validation passed",
    };
  }

  private async validateQuota(path: string): Promise<LayerResult> {
    // Simplified - actual implementation would check quotas
    return {
      layer: "Quota Check",
      index: 7,
      passed: true,
      message: "Quota validation passed",
    };
  }

  private async validateSymlinks(path: string): Promise<LayerResult> {
    // Simplified - actual implementation would check symlinks
    return {
      layer: "Symlink Check",
      index: 8,
      passed: true,
      message: "Symlink validation passed",
    };
  }

  private generateFixSuggestions(
    path: string,
    failedLayer: LayerResult,
  ): FixSuggestion[] {
    const suggestions: FixSuggestion[] = [];

    if (failedLayer.layer === "Length Check") {
      suggestions.push({
        type: "shorten",
        description:
          "Shorten the path by moving files closer to root or using shorter names",
        example: path.length > 100 ? path.slice(0, 100) + "..." : undefined,
        effort: "high",
      });
    }

    if (failedLayer.layer === "Character Check") {
      suggestions.push({
        type: "rename",
        description: "Replace forbidden characters with safe alternatives",
        example: path.replace(/[<>:"/\\|?*]/g, "-"),
        effort: "low",
      });
    }

    if (failedLayer.layer === "Traversal Check") {
      suggestions.push({
        type: "move",
        description: "Move files to a location that does not require traversal",
        effort: "medium",
      });
    }

    if (failedLayer.layer === "Reserved Name Check") {
      suggestions.push({
        type: "rename",
        description: "Rename the file to avoid reserved Windows names",
        example: `${failedLayer.details?.reservedName}_file.txt`,
        effort: "low",
      });
    }

    return suggestions;
  }

  private generateAlternativePaths(
    path: string,
    failedLayer: LayerResult,
  ): string[] {
    const alternatives: string[] = [];

    if (failedLayer.layer === "Length Check") {
      // Suggest using subst drive
      const driveLetter = "Z";
      alternatives.push(`${driveLetter}:\\${path.split(/[/\\]/).pop()}`);
    }

    if (failedLayer.layer === "Character Check") {
      alternatives.push(path.replace(/[<>:"/\\|?*]/g, "-"));
    }

    return alternatives;
  }
}
```

---

## Workflow Integration

### Command Triggers

```typescript
const debuggingCommands = {
  "workflow:diagnose": async (issue: IssueDescription) => {
    const workflow = new DiagnosisWorkflow();
    return workflow.diagnose(issue);
  },

  "workflow:debug-duplicates": async (
    directory: string,
    options?: DuplicateAnalysisOptions,
  ) => {
    const workflow = new DuplicateDebugWorkflow();
    return workflow.analyzeDuplicates(directory, options);
  },

  "workflow:debug-path": async (path: string) => {
    const workflow = new PathValidationDebugWorkflow();
    return workflow.analyzePath(path);
  },

  "workflow:validate-all": async (paths: string[]) => {
    const results = await Promise.all(
      paths.map((path) => new PathValidationDebugWorkflow().analyzePath(path)),
    );
    return results.filter((r) => r.overallStatus === "invalid");
  },
};
```

---

## Quick Debug Commands

| Command                     | Description                           |
| --------------------------- | ------------------------------------- |
| `workflow:diagnose`         | Run full diagnostic on reported issue |
| `workflow:debug-duplicates` | Analyze duplicate detection results   |
| `workflow:debug-path`       | Debug path validation failure         |
| `workflow:validate-all`     | Validate multiple paths at once       |

---

## Common Issues & Solutions

| Issue                      | Diagnosis Command           | Common Fix                   |
| -------------------------- | --------------------------- | ---------------------------- |
| Files not being organized  | `workflow:diagnose`         | Check category configuration |
| Duplicate detection issues | `workflow:debug-duplicates` | Review false positives       |
| Path validation failures   | `workflow:debug-path`       | Apply suggested fixes        |
| Permission denied          | `workflow:diagnose`         | Fix file permissions         |
