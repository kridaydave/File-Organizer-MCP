/**
 * File Organizer MCP Server v3.4.2
 * Content Screening and Error Validation Schemas
 */

import { z } from "zod";

// ==================== Issue Types ====================

export const IssueTypeSchema = z.enum([
  "extension_mismatch",
  "executable_disguised",
  "suspicious_pattern",
  "unknown_type",
  "malicious_content",
  "policy_violation",
]);

export const ThreatLevelSchema = z.enum([
  "none",
  "low",
  "medium",
  "high",
  "critical",
]);

// ==================== Screen Issue Schema ====================

/**
 * Schema for serializable details (no functions, undefined, or symbols)
 * Allows: strings, numbers, booleans, null, arrays, and nested objects
 */
export const SerializableValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(SerializableValueSchema),
    z.record(z.string(), SerializableValueSchema),
  ]),
);

/**
 * Schema for ScreenIssue - validates that details are serializable
 */
export const ScreenIssueSchema = z.object({
  type: IssueTypeSchema,
  severity: z.enum(["warning", "error"]),
  message: z.string().min(1),
  details: z.record(z.string(), SerializableValueSchema).optional(),
});

// ==================== Screen Result Schema ====================

/**
 * Schema for individual file screening result
 */
export const ScreenResultSchema = z.object({
  filePath: z.string().min(1),
  passed: z.boolean(),
  threatLevel: ThreatLevelSchema,
  detectedType: z.string(),
  declaredExtension: z.string(),
  issues: z.array(ScreenIssueSchema),
  timestamp: z.date(),
});

// ==================== Screening Report Schema ====================

/**
 * Schema for threat summary in screening report
 */
export const ThreatSummarySchema = z.object({
  none: z.number().int().nonnegative(),
  low: z.number().int().nonnegative(),
  medium: z.number().int().nonnegative(),
  high: z.number().int().nonnegative(),
});

/**
 * Schema for comprehensive screening report
 */
export const ScreeningReportSchema = z.object({
  totalFiles: z.number().int().nonnegative(),
  passedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  threatSummary: ThreatSummarySchema,
  issuesByType: z.record(z.string(), z.number().int().nonnegative()),
  timestamp: z.date(),
  results: z.array(ScreenResultSchema),
});

// ==================== Validation Error Details Schema ====================

/**
 * Schema for values that can be stored in ValidationErrorDetails
 * Allows primitive types and simple serializable values
 */
export const ValidationErrorValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  ]),
);

/**
 * Schema for ValidationErrorDetails
 */
export const ValidationErrorDetailsSchema = z.object({
  field: z.string().optional(),
  value: ValidationErrorValueSchema.optional(),
  constraint: z.string().optional(),
});

// ==================== Type Exports ====================

export type IssueType = z.infer<typeof IssueTypeSchema>;
export type ThreatLevel = z.infer<typeof ThreatLevelSchema>;
export type SerializableValue = z.infer<typeof SerializableValueSchema>;
export type ScreenIssue = z.infer<typeof ScreenIssueSchema>;
export type ScreenResult = z.infer<typeof ScreenResultSchema>;
export type ThreatSummary = z.infer<typeof ThreatSummarySchema>;
export type ScreeningReport = z.infer<typeof ScreeningReportSchema>;
export type ValidationErrorValue = z.infer<typeof ValidationErrorValueSchema>;
export type ValidationErrorDetails = z.infer<
  typeof ValidationErrorDetailsSchema
>;
