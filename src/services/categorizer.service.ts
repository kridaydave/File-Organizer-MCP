/**
 * File Organizer MCP Server v3.2.0
 * Categorizer Service
 */

import path from "path";
import { logger } from "../utils/logger.js";
import type {
  FileWithSize,
  CategoryStats,
  CategoryName,
  CustomRule,
  AudioMetadata,
  ImageMetadata,
} from "../types.js";
import { CATEGORIES, getCategory } from "../constants.js";
import { formatBytes } from "../utils/formatters.js";
import { ContentAnalyzerService } from "./content-analyzer.service.js";
import { isExecutableSignature } from "../constants/file-signatures.js";
import { PathValidatorService } from "./path-validator.service.js";
import { MetadataCacheService } from "./metadata-cache.service.js";

/**
 * Categorizer Service - file categorization by type
 * Now with content-based detection for enhanced security
 */
export class CategorizerService {
  private customRules: CustomRule[] = [];
  private pathValidator: PathValidatorService;
  private contentAnalysisPromises: Map<string, Promise<CategoryName>> =
    new Map();
  private contentAnalysisResults: Map<string, CategoryName> = new Map();

  constructor(
    private contentAnalyzer?: ContentAnalyzerService,
    private metadataCache?: MetadataCacheService,
  ) {
    this.pathValidator = new PathValidatorService();
  }

  /**
   * Set custom categorization rules
   * @returns Number of valid rules applied
   */
  setCustomRules(rules: CustomRule[]): number {
    // Validate rules
    const validRules: CustomRule[] = [];
    for (const rule of rules) {
      try {
        this.validateCategoryName(rule.category);

        // Security: Limit regex length to prevent ReDoS
        if (rule.filenamePattern && rule.filenamePattern.length > 50) {
          throw new Error(
            `Filename pattern for category '${rule.category}' exceeds 50 characters`,
          );
        }

        validRules.push(rule);
      } catch (error) {
        logger.error(
          `Skipping invalid rule for category '${rule.category}': ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Sort by priority (descending)
    this.customRules = [...validRules].sort((a, b) => b.priority - a.priority);
    return validRules.length;
  }

  /**
   * Validate category name for security
   */
  validateCategoryName(name: string): void {
    // 1. Block HTML/JS (XSS)
    if (/<[^>]*>|javascript:/i.test(name)) {
      throw new Error("Category name contains HTML/JS patterns");
    }

    // 2. Block Shell characters (Command Injection)
    // Block $, backticks, |, &, ;
    if (/[\$`|&;]/.test(name)) {
      throw new Error("Category name contains shell injection characters");
    }

    // 3. Block Path Separators & Absolute Paths
    if (/[\/\\]|:/.test(name)) {
      throw new Error("Category name contains path separators");
    }

    // 4. Block Windows Reserved Names
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(name)) {
      throw new Error("Category name is a reserved Windows filename");
    }
  }

  /**
   * Get category for a file
   * @param name - File name
   * @param useContentAnalysis - When true, verify extension matches content asynchronously
   * @param filePath - Optional file path for content analysis (required if useContentAnalysis is true)
   * @returns Category name
   */
  getCategory(
    name: string,
    useContentAnalysis?: boolean,
    filePath?: string,
  ): CategoryName {
    const extensionCategory = this.getCategoryByExtension(name);

    if (useContentAnalysis && this.contentAnalyzer && filePath) {
      this.triggerContentAnalysis(name, filePath);
    }

    return extensionCategory;
  }

  /**
   * Trigger async content analysis in the background
   * @param name - File name (used as key for result retrieval)
   * @param filePath - Full file path for analysis
   */
  private triggerContentAnalysis(name: string, filePath: string): void {
    const key = `${filePath}:${name}`;

    if (this.contentAnalysisPromises.has(key)) {
      return;
    }

    const analysisPromise = (async (): Promise<CategoryName> => {
      try {
        const result = await this.getCategoryByContent(filePath);

        if (result.confidence >= 0.7) {
          this.contentAnalysisResults.set(key, result.category);
          logger.info("Content analysis updated category", {
            filePath,
            name,
            oldCategory: this.getCategoryByExtension(name),
            newCategory: result.category,
            confidence: result.confidence,
          });
          return result.category;
        }

        return this.getCategoryByExtension(name);
      } catch (error) {
        logger.error("Content analysis failed", {
          filePath,
          name,
          error: error instanceof Error ? error.message : String(error),
        });
        return this.getCategoryByExtension(name);
      } finally {
        this.contentAnalysisPromises.delete(key);
      }
    })();

    this.contentAnalysisPromises.set(key, analysisPromise);
  }

  /**
   * Get the updated category from background content analysis (if available)
   * @param name - File name
   * @param filePath - Full file path
   * @returns Updated category or undefined if analysis not yet complete
   */
  getUpdatedCategory(name: string, filePath: string): CategoryName | undefined {
    const key = `${filePath}:${name}`;
    return this.contentAnalysisResults.get(key);
  }

  /**
   * Wait for content analysis to complete and get the final category
   * @param name - File name
   * @param filePath - Full file path
   * @returns Category after content analysis completes
   */
  async waitForContentAnalysis(
    name: string,
    filePath: string,
  ): Promise<CategoryName> {
    const key = `${filePath}:${name}`;
    const promise = this.contentAnalysisPromises.get(key);

    if (promise) {
      return promise;
    }

    const cachedResult = this.contentAnalysisResults.get(key);
    return cachedResult || this.getCategoryByExtension(name);
  }

  /**
   * Clear content analysis cache for a specific file
   * @param filePath - File path to clear
   */
  clearContentAnalysisCache(filePath?: string): void {
    if (filePath) {
      for (const key of this.contentAnalysisResults.keys()) {
        if (key.startsWith(filePath)) {
          this.contentAnalysisResults.delete(key);
          this.contentAnalysisPromises.delete(key);
        }
      }
    } else {
      this.contentAnalysisResults.clear();
      this.contentAnalysisPromises.clear();
    }
  }

  /**
   * Get category by extension only (original logic)
   */
  private getCategoryByExtension(name: string): CategoryName {
    const ext = path.extname(name).toLowerCase();

    const lowerName = name.toLowerCase();

    // Check custom rules first (highest priority)
    for (const rule of this.customRules) {
      // Check extension match
      if (
        rule.extensions &&
        rule.extensions.some((e) => e.toLowerCase() === ext)
      ) {
        return rule.category as CategoryName;
      }

      // Check regex pattern match
      if (rule.filenamePattern) {
        try {
          const regex = new RegExp(rule.filenamePattern, "i");
          if (regex.test(name)) {
            return rule.category as CategoryName;
          }
        } catch (e) {
          // Ignore invalid regex
        }
      }
    }

    // Check Pattern-Based Rules (Hardcoded fallback)
    // Tests
    if (
      lowerName.includes("test") ||
      lowerName.includes("spec") ||
      lowerName.endsWith(".test.ts") ||
      lowerName.endsWith(".spec.ts")
    ) {
      // or create a new 'Tests' category if allowed? Re-reading task: "organize as test/debug code/script".
      // The user wants sub-organization or main categories?
      // "organize as test/debug code/script".
      // If I return a new string, it will create a new folder. Ideally I should allow it.
      // Actually, let's map them to subfolders of Code? Or just top level folders?
      // "test/debug code/script" implies maybe:
      // - Tests/
      // - Scripts/
      // - Debug/
      // But these are not in CategoryName enum.
      // If I cast to `as any` it will work because `categorizeFiles` uses string keys eventually.
      return "Tests" as any;
    }

    if (
      lowerName.includes("debug") ||
      lowerName.includes("log") ||
      lowerName.endsWith(".log")
    ) {
      return "Logs" as any;
    }

    if (
      lowerName.includes("demo") ||
      lowerName.includes("sample") ||
      lowerName.includes("example")
    ) {
      return "Demos" as any;
    }

    if (
      lowerName.includes("script") ||
      lowerName.endsWith(".sh") ||
      lowerName.endsWith(".bat")
    ) {
      return "Scripts" as any;
    }

    return getCategory(ext);
  }

  /**
   * Get category using content analysis (more secure than extension-only)
   * Falls back to extension-based if content analysis fails
   */
  async getCategoryByContent(filePath: string): Promise<{
    category: CategoryName;
    confidence: number;
    warnings: string[];
    metadata?: AudioMetadata | ImageMetadata;
  }> {
    const warnings: string[] = [];
    let confidence = 0.5;
    let metadata: AudioMetadata | ImageMetadata | undefined;

    // First get extension-based category as fallback
    const fileName = path.basename(filePath);
    const extensionCategory = this.getCategoryByExtension(fileName);

    // Check metadata cache first if available
    if (this.metadataCache) {
      const cacheEntry = await this.metadataCache.get(filePath);
      if (cacheEntry) {
        metadata =
          (cacheEntry as any).audioMetadata ||
          (cacheEntry as any).imageMetadata;
      }
    }

    // If content analyzer is not available, fall back to extension
    if (!this.contentAnalyzer) {
      warnings.push(
        "Content analyzer not available - using extension-based detection",
      );
      return {
        category: extensionCategory,
        confidence: 0.5,
        warnings,
        metadata,
      };
    }

    try {
      // Validate path first
      const validatedPath = await this.pathValidator.validatePath(filePath, {
        requireExists: true,
      });

      // Perform content analysis
      const analysis = await this.contentAnalyzer.analyze(validatedPath);

      // Map content type to category
      const contentCategory = this.mapContentTypeToCategory(
        analysis.detectedType,
        analysis.mimeType,
      );

      // Check for extension mismatch
      if (!analysis.extensionMatch) {
        warnings.push(
          `Extension mismatch: file claims to be "${path.extname(fileName)}" but content is "${analysis.detectedType}"`,
        );

        // High severity if executable disguised as document
        if (
          this.isExecutableDisguisedAsDocument(analysis.detectedType, fileName)
        ) {
          warnings.push(
            "CRITICAL: Executable content disguised as document - potential security threat",
          );
          return {
            category: "Suspicious",
            confidence: 0.95,
            warnings,
            metadata,
          };
        }
      }

      // Check for suspicious patterns
      if (this.hasDoubleExtension(fileName)) {
        warnings.push("Double extension detected - potential spoofing attempt");
      }

      // Determine confidence
      confidence = analysis.confidence;

      // Return content-detected category if high confidence, otherwise extension
      if (confidence >= 0.7) {
        logger.logMetadata("info", "File categorized by content", metadata, {
          filePath,
          category: contentCategory,
          confidence,
          detectedType: analysis.detectedType,
          mimeType: analysis.mimeType,
          warnings,
        });
        return { category: contentCategory, confidence, warnings, metadata };
      } else {
        warnings.push(
          "Low content confidence - falling back to extension-based categorization",
        );
        logger.logMetadata(
          "warn",
          "File categorized by extension (low content confidence)",
          metadata,
          {
            filePath,
            category: extensionCategory,
            confidence: 0.6,
            detectedType: analysis.detectedType,
            mimeType: analysis.mimeType,
            warnings,
          },
        );
        return {
          category: extensionCategory,
          confidence: 0.6,
          warnings,
          metadata,
        };
      }
    } catch (error) {
      // On error, fall back to extension-based
      warnings.push(
        `Content analysis failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      logger.logMetadata("error", "Content analysis failed", metadata, {
        filePath,
        category: extensionCategory,
        confidence: 0.4,
        warnings,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        category: extensionCategory,
        confidence: 0.4,
        warnings,
        metadata,
      };
    }
  }

  /**
   * Get category with metadata for enhanced security detection
   */
  async getCategoryWithMetadata(filePath: string): Promise<{
    category: CategoryName;
    confidence: number;
    warnings: string[];
    metadata?: AudioMetadata | ImageMetadata;
  }> {
    return this.getCategoryByContent(filePath);
  }

  /**
   * Check if file should be in quarantine based on metadata + security
   */
  async isQuarantined(filePath: string): Promise<boolean> {
    const securityResult =
      await this.getSecurityClassificationWithMetadata(filePath);
    return (
      securityResult.threatLevel === "high" ||
      securityResult.threatLevel === "medium"
    );
  }

  /**
   * Get enhanced security classification with metadata context
   */
  async getSecurityClassificationWithMetadata(filePath: string): Promise<{
    isExecutable: boolean;
    isSuspicious: boolean;
    threatLevel: "none" | "low" | "medium" | "high";
    reason?: string;
    metadata?: any;
  }> {
    const fileName = path.basename(filePath);
    const extension = path.extname(fileName).toLowerCase();

    // Get metadata from cache if available
    let metadata: AudioMetadata | ImageMetadata | undefined;
    if (this.metadataCache) {
      const cacheEntry = await this.metadataCache.get(filePath);
      if (cacheEntry) {
        metadata =
          (cacheEntry as any).audioMetadata ||
          (cacheEntry as any).imageMetadata;
      }
    }

    // Default: no threat
    let result: {
      isExecutable: boolean;
      isSuspicious: boolean;
      threatLevel: "none" | "low" | "medium" | "high";
      reason?: string;
      metadata?: any;
    } = {
      isExecutable: false,
      isSuspicious: false,
      threatLevel: "none",
      metadata,
    };

    // Check for double extensions
    if (this.hasDoubleExtension(fileName)) {
      result = {
        isExecutable: this.isExecutableExtension(
          this.getRealExtension(fileName),
        ),
        isSuspicious: true,
        threatLevel: "high",
        reason: "Double extension detected - possible spoofing attempt",
        metadata,
      };
    }

    // If content analyzer available, do deeper analysis
    if (this.contentAnalyzer) {
      try {
        const validatedPath = await this.pathValidator.validatePath(filePath, {
          requireExists: true,
        });

        const analysis = await this.contentAnalyzer.analyze(validatedPath);

        // Check if executable disguised as document
        if (
          this.isExecutableDisguisedAsDocument(analysis.detectedType, fileName)
        ) {
          return {
            isExecutable: true,
            isSuspicious: true,
            threatLevel: "high",
            reason: `Executable content (${analysis.detectedType}) disguised as ${extension} document`,
            metadata,
          };
        }

        // Check for mismatch
        if (!analysis.extensionMatch) {
          const severity: "high" | "medium" | "low" = analysis.warnings.some(
            (w) => w.includes("CRITICAL"),
          )
            ? "high"
            : analysis.warnings.some((w) => w.includes("HIGH"))
              ? "medium"
              : "low";

          return {
            isExecutable: this.isExecutableType(analysis.detectedType),
            isSuspicious: true,
            threatLevel: severity,
            reason: `Extension mismatch: declared ${extension}, actual ${analysis.detectedType}`,
            metadata,
          };
        }

        // Check if content is executable
        if (this.isExecutableType(analysis.detectedType)) {
          return {
            isExecutable: true,
            isSuspicious: false,
            threatLevel: "low",
            reason: `Executable file detected: ${analysis.detectedType}`,
            metadata,
          };
        }
      } catch (error) {
        // Fall through to extension-based check
      }
    }

    // Extension-based fallback
    if (this.isExecutableExtension(extension) && !result.isSuspicious) {
      result = {
        isExecutable: true,
        isSuspicious: false,
        threatLevel: "low",
        reason: `Executable extension: ${extension}`,
        metadata,
      };
    }

    return result;
  }

  /**
   * Check if file extension matches actual content
   */
  async validateFileType(filePath: string): Promise<{
    valid: boolean;
    declaredExtension: string;
    actualType: string;
    mismatch: boolean;
  }> {
    const declaredExtension = path.extname(filePath).toLowerCase();

    // Default response if analysis fails
    const defaultResponse = {
      valid: true,
      declaredExtension,
      actualType: "unknown",
      mismatch: false,
    };

    if (!this.contentAnalyzer) {
      return defaultResponse;
    }

    try {
      const validatedPath = await this.pathValidator.validatePath(filePath, {
        requireExists: true,
      });

      const analysis = await this.contentAnalyzer.analyze(validatedPath);
      const mismatch = !analysis.extensionMatch;

      return {
        valid: !mismatch,
        declaredExtension,
        actualType: analysis.detectedType,
        mismatch,
      };
    } catch (error) {
      return defaultResponse;
    }
  }

  /**
   * Get security classification for a file
   */
  async classifySecurity(filePath: string): Promise<{
    isExecutable: boolean;
    isSuspicious: boolean;
    threatLevel: "none" | "low" | "medium" | "high";
    reason?: string;
  }> {
    const fileName = path.basename(filePath);
    const extension = path.extname(fileName).toLowerCase();

    // Default: no threat
    let result: {
      isExecutable: boolean;
      isSuspicious: boolean;
      threatLevel: "none" | "low" | "medium" | "high";
      reason?: string;
    } = {
      isExecutable: false,
      isSuspicious: false,
      threatLevel: "none",
    };

    // Check for double extensions
    if (this.hasDoubleExtension(fileName)) {
      result = {
        isExecutable: this.isExecutableExtension(
          this.getRealExtension(fileName),
        ),
        isSuspicious: true,
        threatLevel: "high",
        reason: "Double extension detected - possible spoofing attempt",
      };
    }

    // If content analyzer available, do deeper analysis
    if (this.contentAnalyzer) {
      try {
        const validatedPath = await this.pathValidator.validatePath(filePath, {
          requireExists: true,
        });

        const analysis = await this.contentAnalyzer.analyze(validatedPath);

        // Check if executable disguised as document
        if (
          this.isExecutableDisguisedAsDocument(analysis.detectedType, fileName)
        ) {
          return {
            isExecutable: true,
            isSuspicious: true,
            threatLevel: "high",
            reason: `Executable content (${analysis.detectedType}) disguised as ${extension} document`,
          };
        }

        // Check for mismatch
        if (!analysis.extensionMatch) {
          const severity: "high" | "medium" | "low" = analysis.warnings.some(
            (w) => w.includes("CRITICAL"),
          )
            ? "high"
            : analysis.warnings.some((w) => w.includes("HIGH"))
              ? "medium"
              : "low";

          return {
            isExecutable: this.isExecutableType(analysis.detectedType),
            isSuspicious: true,
            threatLevel: severity,
            reason: `Extension mismatch: declared ${extension}, actual ${analysis.detectedType}`,
          };
        }

        // Check if content is executable
        if (this.isExecutableType(analysis.detectedType)) {
          return {
            isExecutable: true,
            isSuspicious: false,
            threatLevel: "low",
            reason: `Executable file detected: ${analysis.detectedType}`,
          };
        }
      } catch (error) {
        // Fall through to extension-based check
      }
    }

    // Extension-based fallback
    if (this.isExecutableExtension(extension) && !result.isSuspicious) {
      result = {
        isExecutable: true,
        isSuspicious: false,
        threatLevel: "low",
        reason: `Executable extension: ${extension}`,
      };
    }

    return result;
  }

  /**
   * Map content-detected type to file organizer category
   */
  private mapContentTypeToCategory(
    detectedType: string,
    mimeType: string,
  ): CategoryName {
    const type = detectedType.toUpperCase();
    const mime = mimeType.toLowerCase();

    // Images
    if (
      mime.startsWith("image/") ||
      ["PNG", "JPEG", "GIF", "BMP", "WEBP", "TIFF", "ICO", "SVG"].includes(type)
    ) {
      return "Images";
    }

    // Videos
    if (
      mime.startsWith("video/") ||
      ["MP4", "AVI", "MKV", "MOV", "WMV", "FLV", "WEBM"].includes(type)
    ) {
      return "Videos";
    }

    // Audio
    if (
      mime.startsWith("audio/") ||
      ["MP3", "WAV", "FLAC", "OGG", "AAC", "MIDI"].includes(type)
    ) {
      return "Audio";
    }

    // Documents
    if (
      mime.includes("pdf") ||
      mime.includes("document") ||
      [
        "PDF",
        "DOC",
        "DOCX",
        "RTF",
        "ODT",
        "HTML",
        "XML",
        "TEXT",
        "MARKDOWN",
      ].includes(type)
    ) {
      return "Documents";
    }

    // Spreadsheets
    if (
      mime.includes("spreadsheet") ||
      mime.includes("excel") ||
      ["XLS", "XLSX", "CSV", "ODS"].includes(type)
    ) {
      return "Spreadsheets";
    }

    // Presentations
    if (
      mime.includes("presentation") ||
      mime.includes("powerpoint") ||
      ["PPT", "PPTX", "ODP"].includes(type)
    ) {
      return "Presentations";
    }

    // Archives
    if (
      mime.includes("archive") ||
      mime.includes("compressed") ||
      ["ZIP", "RAR", "7Z", "TAR", "GZIP", "BZ2", "XZ"].includes(type)
    ) {
      return "Archives";
    }

    // Executables
    if (
      [
        "EXE",
        "ELF",
        "MACHO",
        "MSI",
        "PE",
        "MACHO_32",
        "MACHO_64",
        "MACHO_SWAP",
        "CLASS",
        "WASM",
        "SWF",
      ].includes(type)
    ) {
      return "Executables";
    }

    // Code (including scripts)
    if (
      mime.includes("script") ||
      mime.includes("javascript") ||
      mime.includes("json") ||
      mime.includes("xml") ||
      mime.includes("css") ||
      [
        "JS",
        "NODE",
        "PYTHON",
        "SHELL",
        "BASH",
        "PERL",
        "RUBY",
        "JAR",
        "JSON",
        "CSS",
        "TS",
      ].includes(type)
    ) {
      return "Code";
    }

    // Fonts
    if (
      mime.includes("font") ||
      ["TTF", "OTF", "WOFF", "WOFF2"].includes(type)
    ) {
      return "Fonts";
    }

    // Ebooks
    if (["EPUB", "MOBI", "AZW", "AZW3"].includes(type)) {
      return "Ebooks";
    }

    // Unknown
    return "Others";
  }

  /**
   * Check if detected type is an executable disguised as document
   */
  private isExecutableDisguisedAsDocument(
    detectedType: string,
    fileName: string,
  ): boolean {
    const documentExtensions = [
      ".pdf",
      ".doc",
      ".docx",
      ".xls",
      ".xlsx",
      ".ppt",
      ".pptx",
      ".txt",
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
    ];
    const extension = path.extname(fileName).toLowerCase();

    if (!documentExtensions.includes(extension)) {
      return false;
    }

    const executableTypes = [
      "EXE",
      "ELF",
      "MACHO",
      "MSI",
      "PE",
      "MACHO_32",
      "MACHO_64",
      "MACHO_SWAP",
      "CLASS",
      "WASM",
    ];
    return executableTypes.some((t) => detectedType.toUpperCase().includes(t));
  }

  /**
   * Check if type represents executable content
   */
  private isExecutableType(detectedType: string): boolean {
    const executableTypes = [
      "EXE",
      "ELF",
      "MACHO",
      "MSI",
      "PE",
      "MACHO_32",
      "MACHO_64",
      "MACHO_SWAP",
      "CLASS",
      "WASM",
      "SWF",
      "SHELL",
      "BASH",
      "PYTHON",
      "PERL",
      "RUBY",
      "NODE",
    ];
    return (
      executableTypes.some((t) => detectedType.toUpperCase().includes(t)) ||
      isExecutableSignature(detectedType)
    );
  }

  /**
   * Check if extension is executable
   */
  private isExecutableExtension(extension: string): boolean {
    const exeExtensions = [
      ".exe",
      ".dll",
      ".bat",
      ".cmd",
      ".sh",
      ".msi",
      ".com",
      ".scr",
      ".pif",
    ];
    return exeExtensions.includes(extension.toLowerCase());
  }

  /**
   * Check for double extension patterns (e.g., file.jpg.exe)
   */
  private hasDoubleExtension(fileName: string): boolean {
    const name = path.basename(fileName).toLowerCase();
    // Pattern: something.jpg.exe or similar
    return /\.(jpg|jpeg|png|gif|bmp|pdf|doc|docx|txt|zip|rar)\.(exe|bat|cmd|scr|pif|com|msi|sh)$/i.test(
      name,
    );
  }

  /**
   * Get the real extension handling double extensions
   */
  private getRealExtension(fileName: string): string {
    const name = fileName.toLowerCase();
    const match = name.match(/\.(exe|bat|cmd|scr|pif|com|msi|sh)$/i);
    return match ? match[0] : path.extname(fileName);
  }

  /**
   * Categorize files by their type
   */
  categorizeFiles(
    files: FileWithSize[],
  ): Partial<Record<CategoryName, CategoryStats>> {
    const categorized: Record<CategoryName, CategoryStats> = {} as Record<
      CategoryName,
      CategoryStats
    >;

    // Initialize default categories
    for (const category of Object.keys(CATEGORIES) as CategoryName[]) {
      categorized[category] = {
        count: 0,
        total_size: 0,
        files: [],
      };
    }

    // Initialize custom categories if any encountered in rules?
    // Actually, custom rules might introduce NEW categories not in CATEGORIES enum/object.
    // We should allow dynamic keys in 'categorized'.
    // But Typescript says Record<CategoryName...>.
    // For now, let's cast or assume CategoryName is string for custom ones.
    // But strict typing might bite us.
    // Let's stick to known categories OR allow string keys.
    // If the user adds "WorkProjects", we need to handle that.
    // For now, let's just initialize on demand for non-standard categories.

    // Categorize each file
    for (const file of files) {
      const category = this.getCategory(file.name);

      if (!categorized[category]) {
        categorized[category] = {
          count: 0,
          total_size: 0,
          files: [],
        };
      }

      categorized[category].count++;
      categorized[category].total_size += file.size;
      categorized[category].files.push(file.name);
    }

    // Remove empty categories and add readable size
    const result: Partial<Record<string, CategoryStats>> = {}; // Changed to string to allow custom
    for (const [category, stats] of Object.entries(categorized)) {
      if (stats.count > 0) {
        result[category] = {
          ...stats,
          total_size_readable: formatBytes(stats.total_size),
        };
      }
    }

    return result;
  }
}
