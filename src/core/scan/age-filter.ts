/**
 * Age filter — pure logic behind the find_old_files tool.
 *
 * Traversal lives in FileScannerService; this only decides which scanned files
 * count as old. Keeping it pure means the day math is testable without a
 * filesystem, and the tool stays a thin validate → scan → filter → format.
 */

import type { FileWithSize } from "../../types.js";

/** Which stat timestamp "old" is measured from. */
export type AgeSource = "mtime" | "atime";

export interface OldFileCandidate {
  name: string;
  path: string;
  size: number;
  /** Whole days between the chosen timestamp and `now`, rounded down. */
  age_days: number;
  /** The timestamp the age was measured from. */
  date: Date;
}

export interface AgeFilterOptions {
  olderThanDays: number;
  source: AgeSource;
  /** Injectable clock so tests age files instead of sleeping. */
  now?: Date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The timestamp a source selects, or undefined when the producer never statted it. */
function timestampFor(file: FileWithSize, source: AgeSource): Date | undefined {
  return source === "atime" ? file.accessed : file.modified;
}

/**
 * Files untouched for at least `olderThanDays` days, oldest first. Uncapped —
 * the caller applies top_n so it can report both counts.
 *
 * A file with no timestamp for the requested source is skipped rather than
 * counted as infinitely old — an absent stat is missing data, not an age.
 */
export function filterOldFiles(
  files: readonly FileWithSize[],
  options: AgeFilterOptions,
): OldFileCandidate[] {
  const { olderThanDays, source, now = new Date() } = options;
  const cutoff = now.getTime() - olderThanDays * MS_PER_DAY;

  const matches = files
    .flatMap((file): OldFileCandidate[] => {
      const date = timestampFor(file, source);
      if (!date) return [];

      const time = date.getTime();
      if (!(time <= cutoff)) return [];

      return [
        {
          name: file.name,
          path: file.path,
          size: file.size,
          age_days: Math.floor((now.getTime() - time) / MS_PER_DAY),
          date,
        },
      ];
    })
    .sort((a, b) => b.age_days - a.age_days || a.path.localeCompare(b.path));

  return matches;
}
