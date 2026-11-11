/**
 * Disk usage per category — aggregate scanned files into a space breakdown
 *
 * Pure: no fs, no config, no clock. The caller hands in the scanner's output
 * plus the categorizer's lookup, so this sums the same sizes the scanner
 * already reported rather than walking directories a second time. That also
 * means there is exactly one categorization path: the rule that files a byte
 * toward a category is the rule the organizer moves them by.
 */

import { formatBytes } from "../../utils/formatters.js";
import type { FileWithSize } from "../types/files.js";
import type {
  CategoryDiskUsage,
  DiskUsageSummary,
} from "../types/categories.js";

/** Share-of-total is reported to this many decimal places. */
const PERCENT_DECIMALS = 2;

function share(bytes: number, total: number): number {
  // A directory can legitimately hold only zero-byte files, so an empty
  // denominator is a real case rather than a bug. Report no share instead of NaN.
  if (total === 0) return 0;
  const factor = 10 ** PERCENT_DECIMALS;
  return Math.round((bytes / total) * 100 * factor) / factor;
}

/**
 * Sum `files` per category: total bytes, file count, and share of the total.
 *
 * @param files - Scanner output, already filtered to the directories allowed
 * @param categorize - Resolves a file name to its category, so custom rules
 *   apply exactly as they do in `categorize_by_type`
 */
export function summarizeDiskUsage(
  files: readonly FileWithSize[],
  categorize: (name: string) => string,
): DiskUsageSummary {
  const byCategory = new Map<string, { bytes: number; files: number }>();

  let totalSize = 0;
  for (const file of files) {
    const bytes = file.size;
    totalSize += bytes;
    // Categorize once: a rule lookup can be expensive and calling it twice
    // would make the count depend on whether it is pure.
    const category = categorize(file.name);
    const bucket = byCategory.get(category) ?? { bytes: 0, files: 0 };
    bucket.bytes += bytes;
    bucket.files += 1;
    byCategory.set(category, bucket);
  }

  const categories: CategoryDiskUsage[] = [...byCategory.entries()]
    .map(([category, bucket]) => ({
      category,
      file_count: bucket.files,
      total_size: bucket.bytes,
      total_size_readable: formatBytes(bucket.bytes),
      percent_of_total: share(bucket.bytes, totalSize),
    }))
    .sort(
      (a, b) =>
        b.total_size - a.total_size || a.category.localeCompare(b.category),
    );

  return {
    total_files: files.length,
    total_size: totalSize,
    total_size_readable: formatBytes(totalSize),
    categories,
  };
}
