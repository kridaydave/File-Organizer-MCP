/**
 * File Organizer MCP Server v3.4.0
 * batch_read_files Tool
 *
 * @module tools/batch-file-reader
 * @description Reads contents of all files in a folder for LLM context.
 * For text files: reads content. For media files (audio/video/image): reads metadata.
 */

import { z } from "zod";
import type { ToolDefinition, ToolResponse } from "../types.js";
import { validateStrictPath } from "../services/path-validator.service.js";
import { FileScannerService } from "../services/file-scanner.service.js";
import { AudioMetadataService } from "../services/audio-metadata.service.js";
import { ImageMetadataService } from "../services/image-metadata.service.js";
import { MetadataService } from "../services/metadata.service.js";
import { textExtractionService } from "../services/text-extraction.service.js";
import { createErrorResponse } from "../utils/error-handler.js";
import { CommonParamsSchema } from "../schemas/common.schemas.js";
import { logger } from "../utils/logger.js";
import * as path from "path";
import * as fs from "fs/promises";

export const BatchReadFilesInputSchema = z
  .object({
    directory: z
      .string()
      .min(1, "Directory path cannot be empty")
      .describe("Full path to the directory containing files to read"),
    include_subdirs: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include subdirectories in the batch read"),
    max_files: z
      .number()
      .optional()
      .default(50)
      .describe("Maximum number of files to process (safety limit)"),
    max_file_size_mb: z
      .number()
      .optional()
      .default(10)
      .describe(
        "Maximum file size in MB to read content (larger files get metadata only)",
      ),
    include_content: z
      .boolean()
      .optional()
      .default(true)
      .describe("Include file content for text files"),
    include_metadata: z
      .boolean()
      .optional()
      .default(true)
      .describe("Include metadata for all files"),
    file_types: z
      .array(z.string())
      .optional()
      .describe(
        'Filter by specific file extensions (e.g., [".txt", ".pdf"]). Empty = all files',
      ),
  })
  .merge(CommonParamsSchema);

export type BatchReadFilesInput = z.infer<typeof BatchReadFilesInputSchema>;

export interface FileReadResult {
  filePath: string;
  fileName: string;
  extension: string;
  size: number;
  category: string;
  contentType: "text" | "media" | "binary" | "unknown";
  content?: string;
  metadata?: Record<string, any>;
  error?: string;
}

export const batchReadFilesToolDefinition: ToolDefinition = {
  name: "file_organizer_batch_read_files",
  title: "Batch Read Files for LLM Context",
  description:
    "Reads contents of all files in a specified folder for LLM context. For text files (documents, code, notes), reads the actual content. For media files (audio, video, images), reads metadata instead of binary content. Provides a comprehensive summary of folder contents.",
  inputSchema: {
    type: "object",
    properties: {
      directory: { type: "string", description: "Full path to the directory" },
      include_subdirs: {
        type: "boolean",
        description: "Include subdirectories",
        default: false,
      },
      max_files: {
        type: "number",
        description: "Maximum files to process (safety limit)",
        default: 50,
      },
      max_file_size_mb: {
        type: "number",
        description: "Max file size in MB to read content",
        default: 10,
      },
      include_content: {
        type: "boolean",
        description: "Include text content",
        default: true,
      },
      include_metadata: {
        type: "boolean",
        description: "Include metadata",
        default: true,
      },
      file_types: {
        type: "array",
        items: { type: "string" },
        description: 'Filter by file extensions (e.g., [".txt", ".pdf"])',
      },
      response_format: {
        type: "string",
        enum: ["json", "markdown"],
        default: "markdown",
      },
    },
    required: ["directory"],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
};

// Text file extensions that can be read as content
const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".xml",
  ".yaml",
  ".yml",
  ".csv",
  ".tsv",
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".mjs",
  ".cjs",
  ".py",
  ".rb",
  ".php",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".cs",
  ".go",
  ".rs",
  ".swift",
  ".kt",
  ".scala",
  ".r",
  ".pl",
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".vue",
  ".svelte",
  ".sql",
  ".graphql",
  ".gql",
  ".log",
  ".ini",
  ".conf",
  ".config",
  ".properties",
  ".env",
  ".pdf",
  ".docx",
  ".doc", // These need special handling but contain text
]);

// Media file extensions (metadata only)
const MEDIA_EXTENSIONS = new Set([
  ".mp3",
  ".flac",
  ".ogg",
  ".wav",
  ".m4a",
  ".aac",
  ".wma",
  ".opus",
  ".mp4",
  ".avi",
  ".mkv",
  ".mov",
  ".wmv",
  ".flv",
  ".webm",
  ".m4v",
  ".jpg",
  ".jpeg",
  ".png",
  ".tiff",
  ".tif",
  ".gif",
  ".bmp",
  ".webp",
  ".heic",
  ".heif",
  ".raw",
  ".cr2",
  ".cr3",
  ".nef",
  ".arw",
  ".dng",
  ".orf",
  ".rw2",
  ".pef",
  ".sr2",
  ".raf",
]);

function determineContentType(
  ext: string,
): "text" | "media" | "binary" | "unknown" {
  const lowerExt = ext.toLowerCase();
  if (TEXT_EXTENSIONS.has(lowerExt)) return "text";
  if (MEDIA_EXTENSIONS.has(lowerExt)) return "media";
  return "binary";
}

async function readTextFile(
  filePath: string,
  maxSizeBytes: number,
): Promise<string | undefined> {
  try {
    const result = await textExtractionService.extract(filePath, {
      maxFileSizeBytes: maxSizeBytes,
      maxTextLength: 50000,
    });

    if (result.truncated) {
      return `${result.text}\n\n[Content truncated - original file was ${result.originalLength} characters, extracted via ${result.extractionMethod}]`;
    }

    return result.text;
  } catch (error) {
    return `[Error reading file: ${(error as Error).message}]`;
  }
}

export async function handleBatchReadFiles(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = BatchReadFilesInputSchema.safeParse(args);
    if (!parsed.success) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
          },
        ],
      };
    }

    const {
      directory,
      include_subdirs,
      max_files,
      max_file_size_mb,
      include_content,
      include_metadata,
      file_types,
      response_format,
    } = parsed.data;

    const validatedPath = await validateStrictPath(directory);
    const scanner = new FileScannerService();
    const audioMetadataService = new AudioMetadataService();
    const imageMetadataService = new ImageMetadataService();
    const metadataService = new MetadataService();

    // Get all files
    const allFiles = await scanner.getAllFiles(validatedPath, include_subdirs);

    // Filter by file types if specified
    let files = allFiles;
    if (file_types && file_types.length > 0) {
      const allowedExts = new Set(file_types.map((e) => e.toLowerCase()));
      files = allFiles.filter((f) =>
        allowedExts.has(path.extname(f.name).toLowerCase()),
      );
    }

    // Limit max files for safety
    if (files.length > max_files) {
      logger.warn(
        `Batch read limited to ${max_files} files (found ${files.length})`,
      );
      files = files.slice(0, max_files);
    }

    const results: FileReadResult[] = [];
    const maxSizeBytes = max_file_size_mb * 1024 * 1024;

    // Process each file
    for (const file of files) {
      const ext = path.extname(file.name);
      const contentType = determineContentType(ext);

      const result: FileReadResult = {
        filePath: file.path,
        fileName: file.name,
        extension: ext,
        size: file.size,
        category:
          contentType === "media"
            ? "Media"
            : contentType === "text"
              ? "Text"
              : "Other",
        contentType,
      };

      try {
        // Read content for text files
        if (include_content && contentType === "text") {
          result.content = await readTextFile(file.path, maxSizeBytes);
        }

        // Read metadata for all files (especially important for media)
        if (include_metadata) {
          if (contentType === "media") {
            // Use specialized services for media files
            const lowerExt = ext.toLowerCase();
            if (
              [
                ".mp3",
                ".flac",
                ".ogg",
                ".wav",
                ".m4a",
                ".aac",
                ".wma",
                ".opus",
              ].includes(lowerExt)
            ) {
              try {
                const audioMeta = await audioMetadataService.extract(file.path);
                result.metadata = {
                  type: "audio",
                  format: audioMeta.format,
                  title: audioMeta.title,
                  artist: audioMeta.artist,
                  album: audioMeta.album,
                  duration: audioMeta.duration
                    ? `${Math.round(audioMeta.duration / 60)}:${String(Math.round(audioMeta.duration % 60)).padStart(2, "0")}`
                    : undefined,
                  bitrate: audioMeta.bitrate,
                  year: audioMeta.year,
                  genre: audioMeta.genre,
                  hasArtwork: audioMeta.hasEmbeddedArtwork,
                };
              } catch (e) {
                result.metadata = {
                  type: "audio",
                  error: "Failed to extract audio metadata",
                };
              }
            } else if (
              [
                ".jpg",
                ".jpeg",
                ".png",
                ".tiff",
                ".tif",
                ".gif",
                ".bmp",
                ".webp",
                ".heic",
                ".heif",
              ].includes(lowerExt)
            ) {
              try {
                const imageMeta = await imageMetadataService.extract(file.path);
                result.metadata = {
                  type: "image",
                  format: imageMeta.format,
                  width: imageMeta.width,
                  height: imageMeta.height,
                  dateTaken: imageMeta.dateTaken?.toISOString(),
                  camera:
                    imageMeta.cameraMake || imageMeta.cameraModel
                      ? `${imageMeta.cameraMake || ""} ${imageMeta.cameraModel || ""}`.trim()
                      : undefined,
                  hasGPS: imageMeta.hasGPS,
                  hasEXIF: imageMeta.hasEXIF,
                };
              } catch (e) {
                result.metadata = {
                  type: "image",
                  error: "Failed to extract image metadata",
                };
              }
            } else if (
              [
                ".mp4",
                ".avi",
                ".mkv",
                ".mov",
                ".wmv",
                ".flv",
                ".webm",
                ".m4v",
              ].includes(lowerExt)
            ) {
              // Video metadata - use basic file stats for now
              result.metadata = {
                type: "video",
                note: "Video metadata extraction not implemented",
              };
            }
          } else {
            // For text and other files, get basic metadata
            const stats = await fs.stat(file.path);
            result.metadata = {
              type: contentType,
              created: stats.birthtime.toISOString(),
              modified: stats.mtime.toISOString(),
              size: stats.size,
            };
          }
        }
      } catch (error) {
        result.error = (error as Error).message;
      }

      results.push(result);
    }

    // Group results by category for better presentation
    const grouped = results.reduce(
      (acc, r) => {
        const category = r.category || "Other";
        if (!acc[category]) acc[category] = [];
        acc[category].push(r);
        return acc;
      },
      {} as Record<string, FileReadResult[]>,
    );

    if (response_format === "json") {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                directory: validatedPath,
                fileCount: results.length,
                files: results,
              },
              null,
              2,
            ),
          },
        ],
        structuredContent: {
          directory: validatedPath,
          fileCount: results.length,
          files: results,
        } as Record<string, unknown>,
      };
    }

    // Build markdown response
    let markdown = `### Batch File Read Results\n\n`;
    markdown += `**Directory:** \`${validatedPath}\`\n`;
    markdown += `**Files Processed:** ${results.length}${allFiles.length > max_files ? ` (limited from ${allFiles.length})` : ""}\n\n`;

    // Summary table
    markdown += `#### Summary by Type\n\n`;
    markdown += `| Category | Count | Description |\n`;
    markdown += `|----------|-------|-------------|\n`;
    for (const [cat, items] of Object.entries(grouped)) {
      const desc =
        cat === "Media"
          ? "Audio/Video/Images (metadata only)"
          : cat === "Text"
            ? "Text files (content + metadata)"
            : "Binary/Unknown files";
      markdown += `| ${cat} | ${items.length} | ${desc} |\n`;
    }
    markdown += `\n`;

    // Detailed sections
    for (const [category, items] of Object.entries(grouped)) {
      markdown += `---\n\n#### ${category} Files (${items.length})\n\n`;

      for (const item of items) {
        markdown += `**${item.fileName}**\n`;
        markdown += `- Path: \`${item.filePath}\`\n`;
        markdown += `- Size: ${formatBytes(item.size)}\n`;

        if (item.metadata) {
          const metaLines = Object.entries(item.metadata)
            .filter(([_, v]) => v !== undefined && v !== null)
            .map(([k, v]) => `  - ${k}: ${v}`);
          if (metaLines.length > 0) {
            markdown += `- Metadata:\n${metaLines.join("\n")}\n`;
          }
        }

        if (item.content) {
          // Truncate content for display
          const displayContent =
            item.content.length > 500
              ? item.content.substring(0, 500) + "\n\n[...content truncated...]"
              : item.content;
          markdown += `- Content:\n\`\`\`\n${displayContent}\n\`\`\`\n`;
        }

        if (item.error) {
          markdown += `- ⚠️ Error: ${item.error}\n`;
        }

        markdown += `\n`;
      }
    }

    return {
      content: [{ type: "text", text: markdown }],
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
