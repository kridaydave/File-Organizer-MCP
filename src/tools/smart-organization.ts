/**
 * File Organizer MCP Server v3.2.0
 * organize_smart Tool
 *
 * Unified organization tool that auto-detects file types and applies
 * the appropriate organization strategy (music, photos, or content-based).
 *
 * @module tools/smart-organization
 */

import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import type { ToolDefinition, ToolResponse } from "../types.js";
import { validateStrictPath } from "../services/path-validator.service.js";
import { FileScannerService } from "../services/file-scanner.service.js";
import { MusicOrganizerService } from "../services/music-organizer.service.js";
import { PhotoOrganizerService } from "../services/photo-organizer.service.js";
import { textExtractionService } from "../services/text-extraction.service.js";
import { topicExtractorService } from "../services/topic-extractor.service.js";
import { createErrorResponse } from "../utils/error-handler.js";
import { CommonParamsSchema } from "../schemas/common.schemas.js";
import { logger } from "../utils/logger.js";

export const OrganizeSmartInputSchema = z
  .object({
    source_dir: z
      .string()
      .min(1, "Source directory path cannot be empty")
      .describe(
        "Full path to the directory containing mixed files (music, photos, documents)",
      ),
    target_dir: z
      .string()
      .min(1, "Target directory path cannot be empty")
      .describe(
        "Full path to the directory where organized files will be placed",
      ),
    // Music options
    music_structure: z
      .enum(["artist/album", "album", "genre/artist", "flat"])
      .optional()
      .default("artist/album")
      .describe("Folder structure for music files"),
    // Photo options
    photo_date_format: z
      .enum(["YYYY/MM/DD", "YYYY-MM-DD", "YYYY/MM", "YYYY"])
      .optional()
      .default("YYYY/MM")
      .describe("Date format for photo folder structure"),
    photo_group_by_camera: z
      .boolean()
      .optional()
      .default(false)
      .describe("Group photos by camera model within date folders"),
    strip_gps: z
      .boolean()
      .optional()
      .default(false)
      .describe("Strip GPS location data from photos for privacy"),
    // Document options
    create_shortcuts: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "For multi-topic documents, create shortcuts in additional topic folders",
      ),
    // Common options
    dry_run: z
      .boolean()
      .optional()
      .default(true)
      .describe("If true, only preview changes without moving files"),
    copy_instead_of_move: z
      .boolean()
      .optional()
      .default(false)
      .describe("Copy files instead of moving them"),
    recursive: z
      .boolean()
      .optional()
      .default(true)
      .describe("Scan subdirectories recursively"),
  })
  .merge(CommonParamsSchema);

export type OrganizeSmartInput = z.infer<typeof OrganizeSmartInputSchema>;

// File type detection extensions
const MUSIC_EXTENSIONS = new Set([
  ".mp3",
  ".flac",
  ".ogg",
  ".wav",
  ".m4a",
  ".aac",
  ".wma",
  ".opus",
]);

const PHOTO_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".tiff",
  ".tif",
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
  ".gif",
  ".bmp",
  ".webp",
]);

const DOCUMENT_EXTENSIONS = new Set([
  ".pdf",
  ".docx",
  ".doc",
  ".txt",
  ".md",
  ".rtf",
  ".odt",
]);

type FileType = "music" | "photo" | "document" | "other";

interface FileClassification {
  path: string;
  type: FileType;
  ext: string;
}

interface SmartOrganizationResult {
  success: boolean;
  summary: {
    totalFiles: number;
    musicFiles: number;
    photoFiles: number;
    documentFiles: number;
    otherFiles: number;
  };
  music?: {
    organized: number;
    skipped: number;
    errors: Array<{ file: string; error: string }>;
  };
  photos?: {
    organized: number;
    skipped: number;
    strippedGPS: number;
    errors: Array<{ file: string; error: string }>;
  };
  documents?: {
    organized: number;
    skipped: number;
    errors: Array<{ file: string; error: string }>;
  };
}

export const organizeSmartToolDefinition: ToolDefinition = {
  name: "file_organizer_organize_smart",
  title: "Smart Organize Files",
  description:
    "Automatically organizes mixed files (music, photos, documents) using the appropriate strategy for each type. " +
    "Music → Artist/Album structure. Photos → Date-based folders with optional GPS stripping. " +
    "Documents → Topic-based folders. Use dry_run=true to preview changes.",
  inputSchema: {
    type: "object",
    properties: {
      source_dir: {
        type: "string",
        description:
          "Full path to the directory containing mixed files (music, photos, documents)",
      },
      target_dir: {
        type: "string",
        description:
          "Full path to the directory where organized files will be placed",
      },
      music_structure: {
        type: "string",
        enum: ["artist/album", "album", "genre/artist", "flat"],
        description: "Folder structure for music files",
        default: "artist/album",
      },
      photo_date_format: {
        type: "string",
        enum: ["YYYY/MM/DD", "YYYY-MM-DD", "YYYY/MM", "YYYY"],
        description: "Date format for photo folder structure",
        default: "YYYY/MM",
      },
      photo_group_by_camera: {
        type: "boolean",
        description: "Group photos by camera model within date folders",
        default: false,
      },
      strip_gps: {
        type: "boolean",
        description: "Strip GPS location data from photos for privacy",
        default: false,
      },
      create_shortcuts: {
        type: "boolean",
        description:
          "For multi-topic documents, create shortcuts in additional topic folders",
        default: false,
      },
      dry_run: {
        type: "boolean",
        description: "If true, only preview changes without moving files",
        default: true,
      },
      copy_instead_of_move: {
        type: "boolean",
        description: "Copy files instead of moving them",
        default: false,
      },
      recursive: {
        type: "boolean",
        description: "Scan subdirectories recursively",
        default: true,
      },
    },
    required: ["source_dir", "target_dir"],
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
};

// Smart organization service
class SmartOrganizerService {
  private musicService = new MusicOrganizerService();
  private photoService = new PhotoOrganizerService();
  private scanner = new FileScannerService();

  async organize(
    sourceDir: string,
    targetDir: string,
    options: {
      musicStructure: string;
      photoDateFormat: string;
      photoGroupByCamera: boolean;
      stripGPS: boolean;
      createShortcuts: boolean;
      dryRun: boolean;
      copyInsteadOfMove: boolean;
      recursive: boolean;
    },
  ): Promise<SmartOrganizationResult> {
    // Scan source directory
    const files = await this.scanner.scanDirectory(sourceDir, {
      includeSubdirs: options.recursive,
    });

    // Classify files by type
    const classified = this.classifyFiles(files);

    logger.info("Smart organization: file classification complete", {
      total: classified.length,
      music: classified.filter((f) => f.type === "music").length,
      photos: classified.filter((f) => f.type === "photo").length,
      documents: classified.filter((f) => f.type === "document").length,
      other: classified.filter((f) => f.type === "other").length,
    });

    const result: SmartOrganizationResult = {
      success: true,
      summary: {
        totalFiles: classified.length,
        musicFiles: classified.filter((f) => f.type === "music").length,
        photoFiles: classified.filter((f) => f.type === "photo").length,
        documentFiles: classified.filter((f) => f.type === "document").length,
        otherFiles: classified.filter((f) => f.type === "other").length,
      },
    };

    // Create target subdirectories
    const musicTarget = path.join(targetDir, "Music");
    const photosTarget = path.join(targetDir, "Photos");
    const documentsTarget = path.join(targetDir, "Documents");
    const otherTarget = path.join(targetDir, "Other");

    if (!options.dryRun) {
      await fs.mkdir(musicTarget, { recursive: true });
      await fs.mkdir(photosTarget, { recursive: true });
      await fs.mkdir(documentsTarget, { recursive: true });
      await fs.mkdir(otherTarget, { recursive: true });
    }

    // Organize music files
    if (result.summary.musicFiles > 0) {
      const musicFiles = classified
        .filter((f) => f.type === "music")
        .map((f) => ({ path: f.path, size: 0 }));

      const musicResult = await this.musicService.organize({
        sourceDir,
        targetDir: musicTarget,
        structure: options.musicStructure as
          | "artist/album"
          | "album"
          | "genre/artist"
          | "flat",
        filenamePattern: "{track} - {title}",
        copyInsteadOfMove: options.copyInsteadOfMove,
      });

      result.music = {
        organized: musicResult.organizedFiles,
        skipped: musicResult.skippedFiles,
        errors: musicResult.errors,
      };
    }

    // Organize photo files
    if (result.summary.photoFiles > 0) {
      const photoResult = await this.photoService.organize({
        sourceDir,
        targetDir: photosTarget,
        dateFormat: options.photoDateFormat as
          | "YYYY/MM/DD"
          | "YYYY-MM-DD"
          | "YYYY/MM"
          | "YYYY",
        groupByCamera: options.photoGroupByCamera,
        stripGPS: options.stripGPS,
        copyInsteadOfMove: options.copyInsteadOfMove,
        unknownDateFolder: "Unknown Date",
      });

      result.photos = {
        organized: photoResult.organizedFiles,
        skipped: photoResult.skippedFiles,
        strippedGPS: photoResult.strippedGPSFiles,
        errors: photoResult.errors,
      };
    }

    // Organize document files
    if (result.summary.documentFiles > 0) {
      result.documents = await this.organizeDocuments(
        classified.filter((f) => f.type === "document"),
        documentsTarget,
        options,
      );
    }

    return result;
  }

  private classifyFiles(files: Array<{ path: string }>): FileClassification[] {
    return files.map((file) => {
      const ext = path.extname(file.path).toLowerCase();

      if (MUSIC_EXTENSIONS.has(ext)) {
        return { path: file.path, type: "music", ext };
      } else if (PHOTO_EXTENSIONS.has(ext)) {
        return { path: file.path, type: "photo", ext };
      } else if (DOCUMENT_EXTENSIONS.has(ext)) {
        return { path: file.path, type: "document", ext };
      } else {
        return { path: file.path, type: "other", ext };
      }
    });
  }

  private async organizeDocuments(
    files: FileClassification[],
    targetDir: string,
    options: {
      dryRun: boolean;
      createShortcuts: boolean;
    },
  ): Promise<{
    organized: number;
    skipped: number;
    errors: Array<{ file: string; error: string }>;
  }> {
    const errors: Array<{ file: string; error: string }> = [];
    let organized = 0;
    let skipped = 0;

    for (const file of files) {
      try {
        // Extract text
        const extraction = await textExtractionService.extract(file.path);

        if (!extraction.text || extraction.text.trim().length === 0) {
          skipped++;
          continue;
        }

        // Extract topics
        const topics = topicExtractorService.extractTopics(extraction.text);

        if (topics.topics.length === 0) {
          skipped++;
          continue;
        }

        const primaryTopic = topics.topics[0]?.topic;
        if (!primaryTopic) {
          skipped++;
          continue;
        }
        const topicDir = path.join(
          targetDir,
          this.sanitizeFolderName(primaryTopic),
        );

        if (!options.dryRun) {
          await fs.mkdir(topicDir, { recursive: true });

          const fileName = path.basename(file.path);
          const targetPath = path.join(topicDir, fileName);

          // Copy or move file
          await fs.copyFile(file.path, targetPath);

          // Create shortcuts for additional topics if enabled
          if (options.createShortcuts && topics.length > 1) {
            for (const topic of topics.slice(1)) {
              if (!topic) continue;
              const shortcutDir = path.join(
                targetDir,
                this.sanitizeFolderName(topic.topic),
              );
              await fs.mkdir(shortcutDir, { recursive: true });

              // Create symlink (shortcut)
              const shortcutPath = path.join(shortcutDir, fileName);
              try {
                await fs.symlink(targetPath, shortcutPath);
              } catch {
                // Ignore symlink errors
              }
            }
          }
        }

        organized++;
      } catch (error) {
        errors.push({
          file: file.path,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { organized, skipped, errors };
  }

  private sanitizeFolderName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, "_") // Replace illegal chars
      .replace(/\s+/g, " ") // Normalize whitespace
      .trim()
      .substring(0, 50); // Limit length
  }
}

const smartOrganizer = new SmartOrganizerService();

export async function handleOrganizeSmart(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const parsed = OrganizeSmartInputSchema.safeParse(args);
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
      source_dir,
      target_dir,
      music_structure,
      photo_date_format,
      photo_group_by_camera,
      strip_gps,
      create_shortcuts,
      dry_run,
      copy_instead_of_move,
      recursive,
    } = parsed.data;

    // Validate paths
    const validatedSource = await validateStrictPath(source_dir);
    const validatedTarget = await validateStrictPath(target_dir);

    // Execute smart organization
    const result = await smartOrganizer.organize(
      validatedSource,
      validatedTarget,
      {
        musicStructure: music_structure,
        photoDateFormat: photo_date_format,
        photoGroupByCamera: photo_group_by_camera,
        stripGPS: strip_gps,
        createShortcuts: create_shortcuts,
        dryRun: dry_run,
        copyInsteadOfMove: copy_instead_of_move,
        recursive: recursive,
      },
    );

    // Format response
    const lines: string[] = [];
    lines.push("# Smart Organization Results\n");

    if (dry_run) {
      lines.push("⚠️ **DRY RUN MODE** - No files were actually moved\n");
    }

    // Summary
    lines.push("## 📊 File Classification");
    lines.push(`- **Total Files:** ${result.summary.totalFiles}`);
    lines.push(`- 🎵 **Music:** ${result.summary.musicFiles}`);
    lines.push(`- 📸 **Photos:** ${result.summary.photoFiles}`);
    lines.push(`- 📄 **Documents:** ${result.summary.documentFiles}`);
    lines.push(`- 📦 **Other:** ${result.summary.otherFiles}\n`);

    // Music results
    if (result.music) {
      lines.push("## 🎵 Music Organization");
      lines.push(`- Organized: ${result.music.organized}`);
      lines.push(`- Skipped: ${result.music.skipped}`);
      if (result.music.errors.length > 0) {
        lines.push(`- Errors: ${result.music.errors.length}`);
      }
      lines.push("");
    }

    // Photo results
    if (result.photos) {
      lines.push("## 📸 Photo Organization");
      lines.push(`- Organized: ${result.photos.organized}`);
      lines.push(`- Skipped: ${result.photos.skipped}`);
      if (strip_gps) {
        lines.push(`- GPS Stripped: ${result.photos.strippedGPS}`);
      }
      if (result.photos.errors.length > 0) {
        lines.push(`- Errors: ${result.photos.errors.length}`);
      }
      lines.push("");
    }

    // Document results
    if (result.documents) {
      lines.push("## 📄 Document Organization");
      lines.push(`- Organized: ${result.documents.organized}`);
      lines.push(`- Skipped: ${result.documents.skipped}`);
      if (result.documents.errors.length > 0) {
        lines.push(`- Errors: ${result.documents.errors.length}`);
      }
      lines.push("");
    }

    // Output structure
    lines.push("## 📁 Output Structure");
    lines.push(`\`\`\``);
    lines.push(`${validatedTarget}/`);
    if (result.summary.musicFiles > 0) lines.push("├── Music/");
    if (result.summary.photoFiles > 0) lines.push("├── Photos/");
    if (result.summary.documentFiles > 0) lines.push("├── Documents/");
    if (result.summary.otherFiles > 0) lines.push("└── Other/");
    lines.push(`\`\`\`\n`);

    // Errors summary
    const totalErrors =
      (result.music?.errors.length || 0) +
      (result.photos?.errors.length || 0) +
      (result.documents?.errors.length || 0);

    if (totalErrors > 0) {
      lines.push(`## ⚠️ Errors (${totalErrors})`);
      lines.push(
        "Some files could not be organized. Check logs for details.\n",
      );
    }

    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}
