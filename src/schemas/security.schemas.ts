/**
 * File Organizer MCP Server v3.4.0
 * Security Validation Schemas
 */

import { z } from "zod";

/**
 * Schema for path validation - ensures path is a valid non-empty string
 * without null bytes (security check)
 */
export const PathSchema = z
  .string()
  .min(1, "Path cannot be empty")
  .max(4096, "Path too long")
  .refine((path) => !path.includes("\0"), {
    message: "Path cannot contain null bytes",
  })
  .refine((path) => !path.includes(".."), {
    message: "Path cannot contain parent directory traversal",
  });

/**
 * Schema for security mode configuration
 */
const SecurityModeSchema = z.enum(["strict", "sandboxed", "unrestricted"]);

/**
 * Schema for allowed paths configuration
 */
const AllowedPathsSchema = z.array(PathSchema).min(1);

type SecurityMode = z.infer<typeof SecurityModeSchema>;
type AllowedPaths = z.infer<typeof AllowedPathsSchema>;
