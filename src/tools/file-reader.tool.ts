/**
 * File Reader MCP Tool
 *
 * MCP Tool integration for the SecureFileReader.
 * Provides the `file_organizer_read_file` tool for reading file contents
 * with comprehensive security checks.
 *
 * @module tools/file-reader
 * @version 3.2.0
 */

import path from "path";
import { z } from "zod";
import type { ToolDefinition, ToolResponse } from "../types.js";
import { FileReaderFactory } from "../readers/factory.js";
import { SecureFileReader } from "../readers/secure-file-reader.js";
import { isOk, isErr } from "../readers/result.js";
import { createErrorResponse } from "../utils/error-handler.js";

// ============================================================================
// Tool Definition
// ============================================================================

/**
 * Input schema for file_organizer_read_file tool
 * Uses Zod for runtime validation
 */
export const ReadFileInputSchema = z
  .object({
    path: z
      .string()
      .min(1, "File path cannot be empty")
      .describe("Absolute path to the file to read"),
    encoding: z
      .enum(["utf-8", "base64", "binary"])
      .optional()
      .default("utf-8")
      .describe("Encoding for text files (utf-8, base64, or binary)"),
    maxBytes: z
      .number()
      .int()
      .min(1)
      .max(100 * 1024 * 1024) // Max 100MB
      .optional()
      .default(10 * 1024 * 1024) // Default 10MB
      .describe("Maximum bytes to read (1B to 100MB, default 10MB)"),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .default(0)
      .describe("Byte offset to start reading from"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100 * 1024 * 1024)
      .optional()
      .describe("Maximum bytes to read (alias for maxBytes)"),
    response_format: z
      .enum(["json", "markdown", "text"])
      .optional()
      .default("markdown")
      .describe("Response format: json, markdown, or text"),
    calculateChecksum: z
      .boolean()
      .optional()
      .default(true)
      .describe("Calculate SHA-256 checksum of content"),
  })
  .transform((data) => ({
    ...data,
    // Use limit as maxBytes if provided
    maxBytes: data.limit ?? data.maxBytes,
  }));

export type ReadFileInput = z.infer<typeof ReadFileInputSchema>;

/**
 * Tool definition for file_organizer_read_file
 * Registered with the MCP server
 */
export const fileReaderToolDefinition: ToolDefinition = {
  name: "file_organizer_read_file",
  title: "Read File Contents",
  description:
    "Read file contents with security checks. Supports text, binary, and base64 encoding. " +
    "Automatically detects file type and applies appropriate security validations. " +
    "Sensitive files (passwords, keys, credentials) are automatically blocked.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "Absolute path to the file to read (e.g., /home/user/documents/report.txt)",
      },
      encoding: {
        type: "string",
        enum: ["utf-8", "base64", "binary"],
        description: "Text encoding for the file content",
        default: "utf-8",
      },
      maxBytes: {
        type: "number",
        description: "Maximum bytes to read (default: 10MB, max: 100MB)",
        default: 10485760,
      },
      offset: {
        type: "number",
        description: "Byte offset to start reading from",
        default: 0,
      },
      limit: {
        type: "number",
        description: "Maximum bytes to read (alternative to maxBytes)",
      },
      response_format: {
        type: "string",
        enum: ["json", "markdown", "text"],
        description: "Format of the response",
        default: "markdown",
      },
      calculateChecksum: {
        type: "boolean",
        description: "Include SHA-256 checksum in response",
        default: true,
      },
    },
    required: ["path"],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
};

// ============================================================================
// Tool Handler
// ============================================================================

// Singleton reader instance for reuse across tool calls
let fileReaderInstance: SecureFileReader | null = null;

/**
 * Get or create the SecureFileReader instance
 * Uses factory pattern for consistent configuration
 */
function getFileReader(): SecureFileReader {
  if (!fileReaderInstance) {
    fileReaderInstance = FileReaderFactory.createWithOptions({
      maxReadSize: 100 * 1024 * 1024, // 100MB max
      maxRequestsPerMinute: 120,
      maxRequestsPerHour: 2000,
    });
  }
  return fileReaderInstance;
}

/**
 * Handle file_organizer_read_file tool calls
 *
 * @param args - Tool arguments from MCP
 * @returns ToolResponse with file content or error
 */
export async function handleReadFile(
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    // Validate input
    const parseResult = ReadFileInputSchema.safeParse(args);
    if (!parseResult.success) {
      return {
        content: [
          {
            type: "text",
            text: `Validation Error: ${parseResult.error.issues.map((i) => i.message).join(", ")}`,
          },
        ],
        isError: true,
      };
    }

    const input = parseResult.data;
    const reader = getFileReader();

    // Map encoding to BufferEncoding
    const encoding: BufferEncoding | null =
      input.encoding === "binary" ? null : (input.encoding as BufferEncoding);

    // Read the file
    const readResult = await reader.read(input.path, {
      encoding,
      maxBytes: input.maxBytes,
      offset: input.offset,
    });

    // Handle result
    if (isErr(readResult)) {
      const error = readResult.error;
      return {
        content: [
          {
            type: "text",
            text: `Error reading file: ${error.message}${
              error.suggestion ? `\nSuggestion: ${error.suggestion}` : ""
            }`,
          },
        ],
        isError: true,
      };
    }

    const { value } = readResult;
    const { data, bytesRead, metadata } = value;

    // Format response based on requested format
    switch (input.response_format) {
      case "json":
        return formatJsonResponse(data, bytesRead, metadata, input);
      case "text":
        return formatTextResponse(data, bytesRead, metadata);
      case "markdown":
      default:
        return formatMarkdownResponse(data, bytesRead, metadata, input);
    }
  } catch (error) {
    return createErrorResponse(error);
  }
}

// ============================================================================
// Response Formatters
// ============================================================================

function formatJsonResponse(
  data: string | Buffer,
  bytesRead: number,
  metadata: {
    path: string;
    mimeType: string;
    size: number;
    readAt: Date;
    checksum?: string;
    encoding?: string;
  },
  input: ReadFileInput,
): ToolResponse {
  const isBinary = Buffer.isBuffer(data);

  const response = {
    success: true,
    file: {
      path: metadata.path,
      mimeType: metadata.mimeType,
      size: metadata.size,
      bytesRead,
    },
    content: isBinary ? data.toString("base64") : data,
    contentEncoding: isBinary ? "base64" : input.encoding,
    metadata: {
      readAt: metadata.readAt.toISOString(),
      checksum: input.calculateChecksum ? metadata.checksum : undefined,
    },
  };

  return {
    content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
    structuredContent: response,
  };
}

function formatTextResponse(
  data: string | Buffer,
  bytesRead: number,
  metadata: {
    path: string;
    mimeType: string;
    size: number;
    readAt: Date;
    checksum?: string;
    encoding?: string;
  },
): ToolResponse {
  const isBinary = Buffer.isBuffer(data);
  const content = isBinary ? `[Binary content: ${bytesRead} bytes]` : data;

  return {
    content: [{ type: "text", text: content }],
  };
}

function formatMarkdownResponse(
  data: string | Buffer,
  bytesRead: number,
  metadata: {
    path: string;
    mimeType: string;
    size: number;
    readAt: Date;
    checksum?: string;
    encoding?: string;
  },
  input: ReadFileInput,
): ToolResponse {
  const isBinary = Buffer.isBuffer(data);
  const isTruncated = bytesRead < metadata.size;

  let content: string;
  if (isBinary) {
    content = "_[Binary content - use encoding='base64' to read]_";
  } else {
    // Truncate very long content for markdown display
    const maxDisplayLength = 10000;
    if (data.length > maxDisplayLength) {
      content =
        data.substring(0, maxDisplayLength) +
        "\n\n_[Content truncated for display]_";
    } else {
      content = data;
    }
  }

  const lines = [
    `## File: \`${path.basename(metadata.path)}\``,
    "",
    `**Path:** \`${metadata.path}\``,
    `**MIME Type:** ${metadata.mimeType}`,
    `**Size:** ${formatBytes(metadata.size)}`,
    `**Bytes Read:** ${formatBytes(bytesRead)}${isTruncated ? " (truncated)" : ""}`,
    `**Read At:** ${metadata.readAt.toISOString()}`,
  ];

  if (input.calculateChecksum && metadata.checksum) {
    lines.push(`**SHA-256:** \`${metadata.checksum.substring(0, 16)}...\``);
  }

  lines.push("", "---", "", "### Content", "", "```");

  // Add appropriate language hint for code files
  const ext = path.extname(metadata.path).toLowerCase();
  const languageMap: Record<string, string> = {
    ".ts": "typescript",
    ".js": "javascript",
    ".json": "json",
    ".md": "markdown",
    ".html": "html",
    ".css": "css",
    ".py": "python",
    ".sh": "bash",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".xml": "xml",
  };
  if (languageMap[ext] && !isBinary) {
    lines[lines.length - 1] = "```" + languageMap[ext];
  }

  lines.push(content, "```");

  return {
    content: [{ type: "text", text: lines.join("\n") }],
  };
}

// ============================================================================
// Utilities
// ============================================================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// Export for testing
export { getFileReader };
