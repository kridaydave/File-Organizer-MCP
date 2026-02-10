import { ToolResponse } from "./types.js";

export class FileOrganizerError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, any>,
    public suggestion?: string,
  ) {
    super(message);
    this.name = "FileOrganizerError";
  }

  toResponse(): ToolResponse {
    let text = `❌ Error: ${this.message}`;

    if (this.details) {
      text += `\n\nDetails:\n${JSON.stringify(this.details, null, 2)}`;
    }

    if (this.suggestion) {
      text += `\n\n💡 Suggestion: ${this.suggestion}`;
    }

    return {
      isError: true,
      content: [{ type: "text", text }],
    };
  }
}
