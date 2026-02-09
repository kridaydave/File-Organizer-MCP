/**
 * File Organizer MCP Server v3.2.0
 * inspect_metadata Tool
 *
 * @module tools/metadata-inspection
 */

import { z } from 'zod';
import type { ToolDefinition, ToolResponse } from '../types.js';
import { validateStrictPath } from '../services/path-validator.service.js';
import { createErrorResponse } from '../utils/error-handler.js';
import { CommonParamsSchema } from '../schemas/common.schemas.js';
import { MetadataService } from '../services/metadata.service.js';
import * as path from 'path';

export const InspectMetadataInputSchema = z
  .object({
    file: z
      .string()
      .min(1, 'File path cannot be empty')
      .describe('Full path to the file to inspect'),
  })
  .merge(CommonParamsSchema);

export type InspectMetadataInput = z.infer<typeof InspectMetadataInputSchema>;

export interface MetadataInspectionResult {
  file: string;
  category: string | null;
  metadata: {
    // Image metadata
    dateTaken?: string;
    camera?: string;
    dimensions?: {
      width: number;
      height: number;
    };
    // Audio metadata
    artist?: string;
    album?: string;
    title?: string;
    year?: number;
    duration?: number;
    // Common metadata
    fileSize: number;
    fileExtension: string;
    lastModified: string;
  };
  organizationPath?: string;
  warnings?: string[];
}

export const inspectMetadataToolDefinition: ToolDefinition = {
  name: 'file_organizer_inspect_metadata',
  title: 'Inspect File Metadata',
  description:
    'Inspects a file and returns comprehensive but privacy-safe metadata. For images, extracts EXIF data (date, camera, dimensions). For audio, extracts ID3 tags (artist, album, title). Excludes sensitive data like GPS coordinates.',
  inputSchema: {
    type: 'object',
    properties: {
      file: { type: 'string', description: 'Full path to the file to inspect' },
      response_format: { type: 'string', enum: ['json', 'markdown'], default: 'markdown' },
    },
    required: ['file'],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
};

export async function handleInspectMetadata(args: Record<string, unknown>): Promise<ToolResponse> {
  try {
    const parsed = InspectMetadataInputSchema.safeParse(args);
    if (!parsed.success) {
      return {
        content: [
          { type: 'text', text: `Error: ${parsed.error.issues.map((i) => i.message).join(', ')}` },
        ],
      };
    }

    const { file, response_format } = parsed.data;
    const validatedPath = await validateStrictPath(file);

    // Get file stats
    const fs = await import('fs/promises');
    const stats = await fs.stat(validatedPath);

    if (!stats.isFile()) {
      return {
        content: [{ type: 'text', text: `Error: ${validatedPath} is not a file` }],
      };
    }

    const metadataService = new MetadataService();
    const fileExtension = path.extname(validatedPath).toLowerCase();
    const fileName = path.basename(validatedPath);

    // Determine category
    let category: string | null = null;
    const imageExts = ['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.heic', '.heif'];
    const audioExts = ['.mp3', '.flac', '.ogg', '.wav', '.m4a', '.aac'];

    if (imageExts.includes(fileExtension)) {
      category = 'Images';
    } else if (audioExts.includes(fileExtension)) {
      category = 'Audio';
    }

    const result: MetadataInspectionResult = {
      file: validatedPath,
      category,
      metadata: {
        fileSize: stats.size,
        fileExtension: fileExtension.slice(1), // Remove leading dot
        lastModified: stats.mtime.toISOString(),
      },
      warnings: [],
    };

    // Extract metadata based on category
    if (category) {
      try {
        const extractedMetadata = await metadataService.extractMetadata(
          validatedPath,
          fileExtension
        );

        if (category === 'Images' && extractedMetadata) {
          if (extractedMetadata.dateTaken) {
            result.metadata.dateTaken = extractedMetadata.dateTaken;
          }
          if (extractedMetadata.camera) {
            result.metadata.camera = extractedMetadata.camera;
          }
          if (extractedMetadata.width && extractedMetadata.height) {
            result.metadata.dimensions = {
              width: extractedMetadata.width,
              height: extractedMetadata.height,
            };
          }
        } else if (category === 'Audio' && extractedMetadata) {
          if (extractedMetadata.artist) {
            result.metadata.artist = extractedMetadata.artist;
          }
          if (extractedMetadata.album) {
            result.metadata.album = extractedMetadata.album;
          }
          if (extractedMetadata.title) {
            result.metadata.title = extractedMetadata.title;
          }
          if (extractedMetadata.year) {
            result.metadata.year = extractedMetadata.year;
          }
          if (extractedMetadata.duration) {
            result.metadata.duration = extractedMetadata.duration;
          }
        }

        // Get suggested organization path
        const subpath = await metadataService.getMetadataSubpath(validatedPath, category as any);
        if (subpath) {
          result.organizationPath = path.join(category, subpath, fileName);
        }
      } catch (metadataError) {
        result.warnings?.push(
          `Could not extract metadata: ${metadataError instanceof Error ? metadataError.message : String(metadataError)}`
        );
      }
    } else {
      result.warnings?.push(`File type ${fileExtension} is not supported for metadata extraction`);
    }

    // Add privacy reminder
    if (category === 'Images') {
      result.warnings?.push(
        'Note: GPS/Location data is excluded from metadata extraction for privacy protection'
      );
    }

    if (response_format === 'json') {
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    }

    // Format as markdown
    let markdown = `### Metadata Inspection: \`${fileName}\`\n\n`;
    markdown += `**File Path:** \`${result.file}\`\n`;
    markdown += `**Category:** ${result.category || 'Unknown'}\n\n`;

    markdown += `#### File Information\n`;
    markdown += `- **Size:** ${formatBytes(result.metadata.fileSize)}\n`;
    markdown += `- **Extension:** ${result.metadata.fileExtension}\n`;
    markdown += `- **Last Modified:** ${new Date(result.metadata.lastModified).toLocaleString()}\n\n`;

    if (category === 'Images') {
      markdown += `#### Image Metadata\n`;
      if (result.metadata.dateTaken) {
        markdown += `- **Date Taken:** ${result.metadata.dateTaken}\n`;
      }
      if (result.metadata.camera) {
        markdown += `- **Camera:** ${result.metadata.camera}\n`;
      }
      if (result.metadata.dimensions) {
        markdown += `- **Dimensions:** ${result.metadata.dimensions.width}x${result.metadata.dimensions.height}\n`;
      }
      markdown += '\n';
    } else if (category === 'Audio') {
      markdown += `#### Audio Metadata\n`;
      if (result.metadata.title) {
        markdown += `- **Title:** ${result.metadata.title}\n`;
      }
      if (result.metadata.artist) {
        markdown += `- **Artist:** ${result.metadata.artist}\n`;
      }
      if (result.metadata.album) {
        markdown += `- **Album:** ${result.metadata.album}\n`;
      }
      if (result.metadata.year) {
        markdown += `- **Year:** ${result.metadata.year}\n`;
      }
      if (result.metadata.duration) {
        markdown += `- **Duration:** ${formatDuration(result.metadata.duration)}\n`;
      }
      markdown += '\n';
    }

    if (result.organizationPath) {
      markdown += `#### Suggested Organization Path\n`;
      markdown += `\`${result.organizationPath}\`\n\n`;
    }

    if (result.warnings && result.warnings.length > 0) {
      markdown += `#### Warnings\n`;
      result.warnings.forEach((warning) => {
        markdown += `- ${warning}\n`;
      });
    }

    return {
      content: [{ type: 'text', text: markdown }],
    };
  } catch (error) {
    return createErrorResponse(error);
  }
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format duration in seconds to MM:SS or HH:MM:SS
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
