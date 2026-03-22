/**
 * File Organizer MCP Server v3.4.2
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
  const index = Math.min(i, sizes.length - 1);

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
