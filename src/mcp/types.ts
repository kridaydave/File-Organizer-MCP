/**
 * MCP Contract Types
 * Tool definitions, responses, and error types for the MCP server
 */

// ==================== Tool Types ====================

/**
 * The text block a tool returns. Every tool returns at least one, which the MCP
 * spec requires and the handlers all honor, so `content` is a non-empty tuple
 * rather than an array. Indexing [0] is then total, and callers stop guarding an
 * emptiness that cannot occur.
 */
export type ToolContentBlock = { type: "text"; text: string };

export interface ToolResponse {
  content: [ToolContentBlock, ...ToolContentBlock[]];
  [key: string]: unknown; // Dynamic properties validated at runtime
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>; // Tool-specific properties validated via input schema
    required: string[];
  };
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  title?: string;
  outputSchema?: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
    [key: string]: unknown;
  };
}

// ==================== Error Types ====================

/**
 * Validated error value types - primitives and simple arrays
 * Excludes: functions, objects, symbols, undefined
 */
export type ValidationErrorValue =
  | string
  | number
  | boolean
  | null
  | Array<string | number | boolean | null>;

export interface ValidationErrorDetails {
  field?: string;
  value?: ValidationErrorValue;
  constraint?: string;
}

export class AccessDeniedError extends Error {
  readonly code = "EACCES";
  constructor(
    public readonly requestedPath: string,
    reason = "Path is outside allowed directory",
  ) {
    super(`Access denied: ${reason}`);
    this.name = "AccessDeniedError";
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly details: ValidationErrorDetails = {},
  ) {
    super(message);
    this.name = "ValidationError";
  }
}
