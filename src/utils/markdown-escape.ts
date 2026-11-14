/**
 * Escape markdown special characters to prevent injection
 */
export function escapeMarkdown(text: string, options: { inCodeSpan?: boolean } = {}): string {
  if (options.inCodeSpan) {
    // In inline code spans, backslashes are literal and backticks/pipes
    // do not need to be escaped with backslashes.
    return text;
  }

  return text
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\|/g, "\\|");
}
