/**
 * summarizeDiskUsage — the aggregation behind disk_usage_by_category.
 *
 * Pure function over scanner output, so these tests need no filesystem: the
 * input is the `FileWithSize[]` the scanner produces. Every assertion names a
 * literal byte count, because a summary that returned undefined or zero would
 * otherwise still "pass" a check like `expect(out).toBeDefined()`.
 */

import { describe, it, expect } from "@jest/globals";
import { summarizeDiskUsage } from "../../../../src/core/scan/disk-usage.js";
import type { FileWithSize } from "../../../../src/types.js";

function file(name: string, size: number): FileWithSize {
  return { name, path: `/sandbox/${name}`, size };
}

/** Mirrors the categorizer's extension lookup for the names used here. */
const byExtension: Record<string, string> = {
  ".mp4": "Videos",
  ".txt": "Documents",
  ".mp3": "Audio",
};

const categorize = (name: string): string => {
  const ext = name.slice(name.lastIndexOf("."));
  return byExtension[ext] ?? "Others";
};

describe("summarizeDiskUsage", () => {
  it("sums bytes and counts per category against the real total", () => {
    const summary = summarizeDiskUsage(
      [
        file("holiday.mp4", 3000),
        file("trailer.mp4", 1000),
        file("notes.txt", 500),
        file("theme.mp3", 500),
      ],
      categorize,
    );

    expect(summary.total_files).toBe(4);
    expect(summary.total_size).toBe(5000);
    expect(summary.total_size_readable).toBe("4.88 KB");
    expect(summary.categories).toEqual([
      {
        category: "Videos",
        file_count: 2,
        total_size: 4000,
        total_size_readable: "3.91 KB",
        percent_of_total: 80,
      },
      // Tied at 500 bytes each: name order breaks the tie so the output does
      // not depend on the order the scan happened to list the files in.
      {
        category: "Audio",
        file_count: 1,
        total_size: 500,
        total_size_readable: "500 Bytes",
        percent_of_total: 10,
      },
      {
        category: "Documents",
        file_count: 1,
        total_size: 500,
        total_size_readable: "500 Bytes",
        percent_of_total: 10,
      },
    ]);
  });

  it("rounds share-of-total to two decimals", () => {
    const summary = summarizeDiskUsage(
      [file("a.mp4", 1), file("b.mp4", 1), file("notes.txt", 1)],
      categorize,
    );

    // Videos hold 2 of 3 bytes, which is 66.666...%, not 66.6666.
    expect(summary.categories).toEqual([
      {
        category: "Videos",
        file_count: 2,
        total_size: 2,
        total_size_readable: "2 Bytes",
        percent_of_total: 66.67,
      },
      {
        category: "Documents",
        file_count: 1,
        total_size: 1,
        total_size_readable: "1 Bytes",
        percent_of_total: 33.33,
      },
    ]);
  });

  it("orders categories largest first, ties by name", () => {
    const summary = summarizeDiskUsage(
      [
        file("a.mp3", 100),
        file("b.mp3", 100),
        file("c.mp4", 300),
        file("d.txt", 200),
      ],
      categorize,
    );

    // Audio and Documents both hold 200 bytes, so name order decides which
    // comes second. Without it the same input could order two ways.
    expect(summary.categories.map((c) => c.category)).toEqual([
      "Videos",
      "Audio",
      "Documents",
    ]);
  });

  it("reports zero totals for an empty scan", () => {
    const summary = summarizeDiskUsage([], categorize);

    expect(summary.total_files).toBe(0);
    expect(summary.total_size).toBe(0);
    expect(summary.total_size_readable).toBe("0 Bytes");
    expect(summary.categories).toEqual([]);
  });

  it("reports a zero share when every file is empty", () => {
    const summary = summarizeDiskUsage(
      [file("a.txt", 0), file("b.txt", 0)],
      categorize,
    );

    // Division by a zero total is a real case here, and NaN would poison the
    // response the client renders.
    expect(summary.total_size).toBe(0);
    expect(summary.categories).toEqual([
      {
        category: "Documents",
        file_count: 2,
        total_size: 0,
        total_size_readable: "0 Bytes",
        percent_of_total: 0,
      },
    ]);
  });

  it("passes through categories the default map does not know", () => {
    const summary = summarizeDiskUsage([file("component.widget", 64)], (name) =>
      name.endsWith(".widget") ? "Widgets" : categorize(name),
    );

    expect(summary.categories[0]?.category).toBe("Widgets");
    expect(summary.categories[0]?.total_size).toBe(64);
    expect(summary.categories[0]?.percent_of_total).toBe(100);
  });

  it("categorizes each file exactly once", () => {
    const seen: string[] = [];
    const files = [file("a.mp4", 10), file("b.txt", 20), file("c.mp4", 30)];

    summarizeDiskUsage(files, (name) => {
      seen.push(name);
      return categorize(name);
    });

    expect(seen).toEqual(["a.mp4", "b.txt", "c.mp4"]);
  });
});
