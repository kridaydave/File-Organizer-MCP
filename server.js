#!/usr/bin/env node

/**
 * File Organizer MCP Server v3.0.0
 * 
 * A powerful, security-hardened Model Context Protocol server for intelligent file organization.
 * Phase 1 implements enhanced path validation with 7-layer security checks.
 * 
 * @version 3.0.0
 * @license MIT
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from 'url';

// Import Phase 1 security validators
import { validateStrictPath, formatStrictModeError } from "./lib/validators/strict-validator.js";
import { AccessDeniedError, sanitizeError as baseSanitizeError } from "./lib/validators/base-validator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class FileOrganizerServer {
  constructor() {
    this.server = new Server(
      {
        name: "file-organizer",
        version: "3.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Security constants
    this.MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
    this.MAX_FILES = 10000;
    this.MAX_DEPTH = 10;

    // File type categories
    this.categories = {
      Executables: [".exe", ".msi", ".bat", ".cmd", ".sh"],
      Videos: [".mp4", ".avi", ".mkv", ".mov", ".wmv", ".flv", ".webm", ".m4v"],
      Documents: [".pdf", ".doc", ".docx", ".txt", ".rtf", ".odt"],
      Presentations: [".ppt", ".pptx", ".odp", ".key"],
      Spreadsheets: [".xls", ".xlsx", ".csv", ".ods"],
      Images: [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".svg", ".ico", ".webp"],
      Audio: [".mp3", ".wav", ".flac", ".aac", ".ogg", ".wma", ".m4a"],
      Archives: [".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz"],
      Code: [".py", ".js", ".ts", ".java", ".cpp", ".c", ".html", ".css", ".php", ".rb", ".go", ".json"],
      Installers: [".dmg", ".pkg", ".deb", ".rpm", ".apk"],
      Ebooks: [".epub", ".mobi", ".azw", ".azw3"],
      Fonts: [".ttf", ".otf", ".woff", ".woff2"],
      Others: [],
    };

    this.setupHandlers();
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "list_files",
          description: "List all files in a directory with basic information",
          inputSchema: {
            type: "object",
            properties: {
              directory: {
                type: "string",
                description: "Full path to the directory to list files from",
              },
            },
            required: ["directory"],
          },
        },
        {
          name: "scan_directory",
          description: "Scan directory and get detailed file information including size, dates, and extensions",
          inputSchema: {
            type: "object",
            properties: {
              directory: {
                type: "string",
                description: "Full path to the directory to scan",
              },
              include_subdirs: {
                type: "boolean",
                description: "Include subdirectories in the scan",
                default: false,
              },
              max_depth: {
                type: "number",
                description: "Maximum depth to scan (0 = current directory only, -1 = unlimited)",
                default: -1,
              },
            },
            required: ["directory"],
          },
        },
        {
          name: "categorize_by_type",
          description: "Categorize files by their type and show statistics for each category",
          inputSchema: {
            type: "object",
            properties: {
              directory: {
                type: "string",
                description: "Full path to the directory to categorize",
              },
              include_subdirs: {
                type: "boolean",
                description: "Include subdirectories in categorization",
                default: false,
              },
            },
            required: ["directory"],
          },
        },
        {
          name: "find_largest_files",
          description: "Find the largest files in a directory",
          inputSchema: {
            type: "object",
            properties: {
              directory: {
                type: "string",
                description: "Full path to the directory to search",
              },
              include_subdirs: {
                type: "boolean",
                description: "Include subdirectories in search",
                default: false,
              },
              top_n: {
                type: "number",
                description: "Number of largest files to return",
                default: 10,
              },
            },
            required: ["directory"],
          },
        },
        {
          name: "find_duplicate_files",
          description: "Find duplicate files in a directory based on their content",
          inputSchema: {
            type: "object",
            properties: {
              directory: {
                type: "string",
                description: "Full path to the directory to search for duplicates",
              },
            },
            required: ["directory"],
          },
        },
        {
          name: "organize_files",
          description: "Automatically organize files into categorized folders (Executables, Videos, Documents, etc.)",
          inputSchema: {
            type: "object",
            properties: {
              directory: {
                type: "string",
                description: "Full path to the directory to organize",
              },
              dry_run: {
                type: "boolean",
                description: "If true, only simulate the organization without moving files",
                default: false,
              },
            },
            required: ["directory"],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "list_files":
            return await this.listFiles(args.directory);
          case "scan_directory":
            return await this.scanDirectory(args.directory, args.include_subdirs, args.max_depth);
          case "categorize_by_type":
            return await this.categorizeByType(args.directory, args.include_subdirs);
          case "find_largest_files":
            return await this.findLargestFiles(args.directory, args.include_subdirs, args.top_n);
          case "find_duplicate_files":
            return await this.findDuplicateFiles(args.directory);
          case "organize_files":
            return await this.organizeFiles(args.directory, args.dry_run);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${this.sanitizeError(error)}`,
            },
          ],
        };
      }
    });
  }

  // ==================== Path Validation (Phase 1: STRICT mode only) ====================

  /**
   * Validate path using the new 7-layer strict validator
   * This is the Phase 1 implementation - STRICT mode only (CWD containment)
   */
  async validatePath(requestedPath) {
    try {
      return await validateStrictPath(requestedPath);
    } catch (error) {
      if (error instanceof AccessDeniedError) {
        // Re-throw with user-friendly error message
        const enhancedError = new Error(formatStrictModeError(error, requestedPath));
        enhancedError.code = 'EACCES';
        throw enhancedError;
      }
      throw error;
    }
  }

  // ==================== File Operation Methods ====================

  async listFiles(directory) {
    const validatedPath = await this.validatePath(directory);
    const files = await fs.readdir(validatedPath, { withFileTypes: true });
    const fileList = files
      .filter((f) => f.isFile())
      .map((f) => ({
        name: f.name,
        path: path.join(validatedPath, f.name),
      }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              directory: validatedPath,
              total_files: fileList.length,
              files: fileList,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async scanDirectory(directory, includeSubdirs = false, maxDepth = -1) {
    const validatedPath = await this.validatePath(directory);
    const results = [];

    const scanDir = async (dir, currentDepth = 0) => {
      // Enforce limits
      if (maxDepth !== -1 && currentDepth > maxDepth) return;
      if (currentDepth > this.MAX_DEPTH) {
        console.error(`Warning: Max depth ${this.MAX_DEPTH} reached at ${dir}`);
        return;
      }

      const items = await fs.readdir(dir, { withFileTypes: true });

      for (const item of items) {
        if (item.name.startsWith(".")) continue;
        // Skip node_modules and .git directories
        if (item.name === 'node_modules' || item.name === '.git') continue;

        const fullPath = path.join(dir, item.name);

        if (item.isFile()) {
          // Enforce max files
          if (results.length >= this.MAX_FILES) {
            throw new Error(`Maximum file limit (${this.MAX_FILES}) reached`);
          }

          const stats = await fs.stat(fullPath);
          results.push({
            name: item.name,
            path: fullPath,
            size: stats.size,
            extension: path.extname(item.name),
            created: stats.birthtime,
            modified: stats.mtime,
          });
        } else if (item.isDirectory() && includeSubdirs) {
          await scanDir(fullPath, currentDepth + 1);
        }
      }
    };

    await scanDir(validatedPath);

    const totalSize = results.reduce((sum, file) => sum + file.size, 0);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              directory: validatedPath,
              total_files: results.length,
              total_size: totalSize,
              total_size_readable: this.formatBytes(totalSize),
              files: results,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async categorizeByType(directory, includeSubdirs = false) {
    const validatedPath = await this.validatePath(directory);
    const files = await this.getAllFiles(validatedPath, includeSubdirs);
    const categorized = {};

    for (const category in this.categories) {
      categorized[category] = {
        count: 0,
        total_size: 0,
        files: [],
      };
    }

    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase();
      const category = this.getCategory(ext);

      categorized[category].count++;
      categorized[category].total_size += file.size;
      categorized[category].files.push(file.name);
    }

    // Remove empty categories
    for (const category in categorized) {
      if (categorized[category].count === 0) {
        delete categorized[category];
      } else {
        categorized[category].total_size_readable = this.formatBytes(
          categorized[category].total_size
        );
      }
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              directory: validatedPath,
              categories: categorized,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async findLargestFiles(directory, includeSubdirs = false, topN = 10) {
    const validatedPath = await this.validatePath(directory);
    const files = await this.getAllFiles(validatedPath, includeSubdirs);
    const sorted = files.sort((a, b) => b.size - a.size).slice(0, topN);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              directory: validatedPath,
              largest_files: sorted.map((f) => ({
                name: f.name,
                path: f.path,
                size: f.size,
                size_readable: this.formatBytes(f.size),
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async findDuplicateFiles(directory) {
    const validatedPath = await this.validatePath(directory);
    const files = await this.getAllFiles(validatedPath, false);
    const hashMap = {};

    // Calculate hash for each file
    for (const file of files) {
      try {
        // Skip files that are too large
        if (file.size > this.MAX_FILE_SIZE) {
          console.error(`Skipping large file: ${file.name} (${this.formatBytes(file.size)})`);
          continue;
        }

        const hash = await this.calculateFileHash(file.path);
        if (!hashMap[hash]) {
          hashMap[hash] = [];
        }
        hashMap[hash].push(file);
      } catch (error) {
        console.error(`Error hashing ${file.name}: ${error.message}`);
      }
    }

    // Filter only duplicates
    const duplicates = Object.values(hashMap).filter((group) => group.length > 1);

    const totalDuplicateSize = duplicates.reduce((sum, group) => {
      return sum + group[0].size * (group.length - 1);
    }, 0);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              directory: validatedPath,
              duplicate_groups: duplicates.length,
              total_duplicate_files: duplicates.reduce((sum, g) => sum + g.length, 0),
              wasted_space: this.formatBytes(totalDuplicateSize),
              duplicates: duplicates.map((group) => ({
                count: group.length,
                size: this.formatBytes(group[0].size),
                files: group.map((f) => ({ name: f.name, path: f.path })),
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async organizeFiles(directory, dryRun = false) {
    const validatedPath = await this.validatePath(directory);
    const files = await this.getAllFiles(validatedPath, false);
    const stats = {};
    const actions = [];
    const errors = [];

    // Create category folders
    for (const category in this.categories) {
      const categoryPath = path.join(validatedPath, category);
      if (!dryRun) {
        try {
          await fs.mkdir(categoryPath, { recursive: true });
        } catch (error) {
          if (error.code !== "EEXIST") {
            errors.push(`Failed to create folder ${category}: ${error.message}`);
          }
        }
      }
      stats[category] = 0;
    }

    // Organize files
    for (const file of files) {
      try {
        const ext = path.extname(file.name).toLowerCase();
        const category = this.getCategory(ext);
        const destFolder = path.join(validatedPath, category);
        let destPath = path.join(destFolder, file.name);

        // Handle duplicates
        let counter = 1;
        while (await this.fileExists(destPath)) {
          const baseName = path.basename(file.name, ext);
          const newName = `${baseName}_${counter}${ext}`;
          destPath = path.join(destFolder, newName);
          counter++;
        }

        if (!dryRun) {
          await fs.rename(file.path, destPath);
        }

        stats[category]++;
        actions.push({
          file: file.name,
          from: file.path,
          to: destPath,
          category,
        });
      } catch (error) {
        errors.push(`Failed to move ${file.name}: ${error.message}`);
      }
    }

    // Clean up empty folders
    if (!dryRun) {
      for (const category in this.categories) {
        if (stats[category] === 0) {
          const categoryPath = path.join(validatedPath, category);
          try {
            await fs.rmdir(categoryPath);
          } catch (error) {
            // Ignore errors for non-empty or non-existent directories
          }
        }
      }
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              directory: validatedPath,
              dry_run: dryRun,
              total_files: files.length,
              statistics: stats,
              actions: actions,
              errors: errors,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // ==================== Helper Methods ====================

  async getAllFiles(directory, includeSubdirs = false) {
    const results = [];

    const scanDir = async (dir, depth = 0) => {
      if (includeSubdirs && depth > this.MAX_DEPTH) {
        return;
      }

      const items = await fs.readdir(dir, { withFileTypes: true });

      for (const item of items) {
        if (item.name.startsWith(".")) continue;
        // Skip node_modules and .git directories
        if (item.name === 'node_modules' || item.name === '.git') continue;

        const fullPath = path.join(dir, item.name);

        if (item.isFile()) {
          // Enforce max files
          if (results.length >= this.MAX_FILES) {
            throw new Error(`Maximum file limit (${this.MAX_FILES}) reached`);
          }

          const stats = await fs.stat(fullPath);
          results.push({
            name: item.name,
            path: fullPath,
            size: stats.size,
          });
        } else if (item.isDirectory() && includeSubdirs) {
          await scanDir(fullPath, depth + 1);
        }
      }
    };

    await scanDir(directory);
    return results;
  }

  getCategory(extension) {
    for (const [category, extensions] of Object.entries(this.categories)) {
      if (extensions.includes(extension)) {
        return category;
      }
    }
    return "Others";
  }

  async calculateFileHash(filePath) {
    // Check file size first
    const stats = await fs.stat(filePath);
    if (stats.size > this.MAX_FILE_SIZE) {
      throw new Error(`File exceeds maximum size for hashing (${this.formatBytes(this.MAX_FILE_SIZE)})`);
    }

    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("sha256");
      const stream = createReadStream(filePath, {
        highWaterMark: 64 * 1024 // 64KB chunks
      });

      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", reject);
    });
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  }

  sanitizeError(error) {
    return baseSanitizeError(error);
  }

  async run() {
    console.error(`File Organizer MCP Server v3.0.0 starting...`);
    console.error(`Security Mode: STRICT (CWD only)`);
    console.error(`Working Directory: ${process.cwd()}`);

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("File Organizer MCP Server running on stdio");
  }
}

// Export the class for testing
export { FileOrganizerServer };

// Start the server if running directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = new FileOrganizerServer();
  server.run().catch(console.error);
}