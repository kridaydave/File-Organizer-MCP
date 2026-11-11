/**
 * filterOldFiles — the pure day math behind find_old_files.
 *
 * Timestamps are built from a fixed clock rather than by aging real files, so
 * these tests never sleep and never drift. The boundary case (exactly N days)
 * is included because "> N days" and ">= N days" are different tools.
 */

import { describe, it, expect } from "@jest/globals";
import { filterOldFiles } from "../../../src/core/scan/age-filter.js";
import type { FileWithSize } from "../../../src/types.js";

const NOW = new Date("2026-01-15T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function file(
  name: string,
  timestamps: { modified?: Date; accessed?: Date },
): FileWithSize {
  return { name, path: `/tmp/${name}`, size: 10, ...timestamps };
}

const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

describe("filterOldFiles", () => {
  it("keeps only files at or past the threshold, measured from mtime", () => {
    const matches = filterOldFiles(
      [
        file("ancient.txt", { modified: daysAgo(800) }),
        file("recent.txt", { modified: daysAgo(3) }),
        file("exactly-a-year.txt", { modified: daysAgo(365) }),
      ],
      { olderThanDays: 365, source: "mtime", now: NOW },
    );

    expect(matches.map((m) => m.name)).toEqual([
      "ancient.txt",
      "exactly-a-year.txt",
    ]);
  });

  it("reports whole days of age", () => {
    const [oldest] = filterOldFiles(
      [file("ancient.txt", { modified: daysAgo(800) })],
      { olderThanDays: 365, source: "mtime", now: NOW },
    );

    expect(oldest?.age_days).toBe(800);
  });

  it("rounds age down, so a partial day is not counted", () => {
    const [recent] = filterOldFiles(
      [file("edge.txt", { modified: new Date(NOW.getTime() - 5.75 * DAY) })],
      { olderThanDays: 5, source: "mtime", now: NOW },
    );

    expect(recent?.age_days).toBe(5);
  });

  it("measures from atime when asked, ignoring mtime", () => {
    const files = [
      // Modified long ago but read yesterday: old by mtime, fresh by atime.
      file("stale-but-read.txt", { modified: daysAgo(900), accessed: daysAgo(1) }),
      // Read long ago but rewritten this week: fresh by mtime, old by atime.
      file("rewritten.txt", { modified: daysAgo(2), accessed: daysAgo(500) }),
    ];

    const byAtime = filterOldFiles(files, {
      olderThanDays: 365,
      source: "atime",
      now: NOW,
    });
    const byMtime = filterOldFiles(files, {
      olderThanDays: 365,
      source: "mtime",
      now: NOW,
    });

    expect(byAtime.map((m) => m.name)).toEqual(["rewritten.txt"]);
    expect(byMtime.map((m) => m.name)).toEqual(["stale-but-read.txt"]);
  });

  it("skips a file with no timestamp for the requested source", () => {
    const matches = filterOldFiles(
      [
        file("no-stats.txt", {}),
        file("mtime-only.txt", { modified: daysAgo(500) }),
      ],
      { olderThanDays: 365, source: "atime", now: NOW },
    );

    expect(matches.map((m) => m.name)).toEqual([]);
  });

  it("orders oldest first and breaks ties by path", () => {
    const matches = filterOldFiles(
      [
        file("b.txt", { modified: daysAgo(500) }),
        file("a.txt", { modified: daysAgo(500) }),
        file("oldest.txt", { modified: daysAgo(2000) }),
      ],
      { olderThanDays: 365, source: "mtime", now: NOW },
    );

    expect(matches.map((m) => m.name)).toEqual([
      "oldest.txt",
      "a.txt",
      "b.txt",
    ]);
  });

  it("carries the size and the timestamp it measured from", () => {
    const modified = daysAgo(700);
    const [match] = filterOldFiles(
      [{ name: "big.bin", path: "/tmp/big.bin", size: 2048, modified }],
      { olderThanDays: 365, source: "mtime", now: NOW },
    );

    expect(match).toEqual({
      name: "big.bin",
      path: "/tmp/big.bin",
      size: 2048,
      age_days: 700,
      date: modified,
    });
  });

  it("returns nothing when nothing is old enough", () => {
    expect(
      filterOldFiles([file("today.txt", { modified: daysAgo(1) })], {
        olderThanDays: 365,
        source: "mtime",
        now: NOW,
      }),
    ).toEqual([]);
  });
});