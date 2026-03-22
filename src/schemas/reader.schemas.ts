/**
 * File Organizer MCP Server v3.4.2
 * File Reader Schemas
 *
 * @module schemas/reader.schemas
 */

import { z } from "zod";

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
