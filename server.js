#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

class FileOrganizerServer {
  constructor() {
    this.server = new Server(
      {
        name: "file-organizer",
        version: "2.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

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
              text: `Error: ${error.message}`,
            },
          ],
        };
      }
    });
  }

  async listFiles(directory) {
    const files = await fs.readdir(directory, { withFileTypes: true });
    const fileList = files
      .filter((f) => f.isFile())
      .map((f) => ({
        name: f.name,
        path: path.join(directory, f.name),
      }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              directory,
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
    const results = [];

    const scanDir = async (dir, currentDepth = 0) => {
      if (maxDepth !== -1 && currentDepth > maxDepth) return;

      const items = await fs.readdir(dir, { withFileTypes: true });

      for (const item of items) {
        const fullPath = path.join(dir, item.name);

        if (item.isFile()) {
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

    await scanDir(directory);

    const totalSize = results.reduce((sum, file) => sum + file.size, 0);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              directory,
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
    const files = await this.getAllFiles(directory, includeSubdirs);
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
              directory,
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
    const files = await this.getAllFiles(directory, includeSubdirs);
    const sorted = files.sort((a, b) => b.size - a.size).slice(0, topN);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              directory,
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
    const files = await this.getAllFiles(directory, false);
    const hashMap = {};

    // Calculate hash for each file
    for (const file of files) {
      const hash = await this.calculateFileHash(file.path);
      if (!hashMap[hash]) {
        hashMap[hash] = [];
      }
      hashMap[hash].push(file);
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
              directory,
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
    const files = await this.getAllFiles(directory, false);
    const stats = {};
    const actions = [];
    const errors = [];

    // Create category folders
    for (const category in this.categories) {
      const categoryPath = path.join(directory, category);
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
        const destFolder = path.join(directory, category);
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
          const categoryPath = path.join(directory, category);
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
              directory,
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

  // Helper methods
  async getAllFiles(directory, includeSubdirs = false) {
    const results = [];

    const scanDir = async (dir) => {
      const items = await fs.readdir(dir, { withFileTypes: true });

      for (const item of items) {
        const fullPath = path.join(dir, item.name);

        if (item.isFile()) {
          const stats = await fs.stat(fullPath);
          results.push({
            name: item.name,
            path: fullPath,
            size: stats.size,
          });
        } else if (item.isDirectory() && includeSubdirs) {
          await scanDir(fullPath);
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
    const fileBuffer = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(fileBuffer).digest("hex");
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

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("File Organizer MCP Server running on stdio");
  }
}

// Start the server
const server = new FileOrganizerServer();
server.run().catch(console.error);