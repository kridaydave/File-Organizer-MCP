/**
 * File Organizer MCP Server v5.0.0
 * Formatting Utilities
 */

/**
 * Format bytes to human-readable string
 * @param bytes - Number of bytes
 * @returns Formatted string (e.g., "1.5 MB")
 * @throws Error if bytes is not finite or is negative
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "Invalid size";
  }
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"] as const;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const index = Math.max(0, Math.min(i, sizes.length - 1));

  return `${Math.round((bytes / Math.pow(k, index)) * 100) / 100} ${sizes[index]}`;
}

/**
 * Format date to ISO string
 * @param date - Date to format
 * @returns ISO date string
 * @throws Error if date is not a valid Date object
 */
export function formatDate(date: Date): string {
  return date.toISOString();
}

/**
 * Format duration in milliseconds to human-readable
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string
 * @throws Error if ms is not a finite number or is negative
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/** How many skipped files to name before deferring to the full JSON array. */
const SKIP_NOTICE_LIMIT = 20;

/**
 * Render the "these files were not analyzed" block that every duplicate tool
 * appends, so a partial analysis is never read as an exhaustive one.
 *
 * Shared by the analyze and find-duplicates handlers: the wording has to match
 * between them, because a caller comparing the two responses should not have to
 * work out whether the same skip was described differently.
 *
 * Returns the bare block with no leading or trailing newline. Where it sits in
 * the surrounding document is the caller's decision, and the two call sites
 * disagree about it, so baking the separators in here would silently restyle
 * one of them.
 *
 * @param skipped - Files excluded from analysis, each with a user-facing detail
 * @param skippedBytes - Total size of the excluded files
 * @param consequence - How the caller should read the surrounding results
 * @returns Markdown block, or an empty string when nothing was skipped
 */
export function renderSkippedNotice(
  skipped: readonly { path: string; size_bytes: number; detail: string }[],
  skippedBytes: number,
  consequence: string,
): string {
  if (skipped.length === 0) return "";

  const lines = [
    `⚠️ **Not analyzed: ${skipped.length} file(s)** (${formatBytes(skippedBytes)}) — ${consequence}`,
    ...skipped
      .slice(0, SKIP_NOTICE_LIMIT)
      .map((f) => `- \`${f.path}\` (${formatBytes(f.size_bytes)}) — ${f.detail}`),
  ];

  if (skipped.length > SKIP_NOTICE_LIMIT) {
    lines.push(
      `- *… and ${skipped.length - SKIP_NOTICE_LIMIT} more (full list in the \`skipped\` array of the JSON response)*`,
    );
  }

  return lines.join("\n");
}
