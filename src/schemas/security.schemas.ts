/**
 * File Organizer MCP Server v3.2.0
 * Security Validation Schemas
 */

import { z } from "zod";

/**
 * Schema for path validation - ensures path is a valid non-empty string
 * without null bytes (security check)
 */
export const PathSchema = z
  .string()
  .min(1, "Path is required")
  .refine((path) => !path.includes("\0"), {
    message: "Path contains invalid null byte",
  });

/**
 * Schema for security mode configuration
 */
export const SecurityModeSchema = z.enum([
  "strict",
  "sandboxed",
  "unrestricted",
]);

/**
 * Schema for allowed paths configuration
 */
export const AllowedPathsSchema = z.array(PathSchema).min(1);

export type SecurityMode = z.infer<typeof SecurityModeSchema>;
export type AllowedPaths = z.infer<typeof AllowedPathsSchema>;
