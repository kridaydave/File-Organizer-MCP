/**
 * A pass logging mid-digest must not get counted twice.
 *
 * The digest pages newest-first with an offset. A row logged between two page
 * reads lands at index 0 and shifts every older row down one, so the next
 * page starts one row early and returns the previous page's last row again.
 * The loop keys rows by id and skips repeats; this test scripts exactly that
 * shift and asserts each pass is counted once.
 */

import { describe, it, expect } from "@jest/globals";
import { handleOrganizerDigest } from "../../../src/tools/organizer-digest.js";
import type { ToolContext } from "../../../src/mcp/context.js";
import type { HistoryEntry } from "../../../src/services/history-logger.service.js";
import type { ToolResponse } from "../../../src/types.js";

function entry(id: string): HistoryEntry {
  return {
    id,
    timestamp: new Date().toISOString(),
    operation: "file_organizer_organize_files",
    source: "scheduled",
    status: "success",
    durationMs: 100,
    filesProcessed: 1,
  };
}

describe("organizer_digest paging", () => {
  it("counts a row shifted by a mid-digest write once, not twice", async () => {
    const [a, b, c] = [entry("a"), entry("b"), entry("c")];
    let calls = 0;
    // First page reads [a, b]. A pass logs before the second read, so the
    // newest-first order shifts and the second page returns [b, c]: b twice.
    const history = {
      async searchHistory(_query: { offset?: number }) {
        calls += 1;
        if (calls === 1) {
          return { entries: [a, b], total: 3, hasMore: true };
        }
        return { entries: [b, c], total: 4, hasMore: false };
      },
    };
    const ctx = { config: {}, history } as unknown as ToolContext;

    const response = (await handleOrganizerDigest(
      { last: "7d", response_format: "json" },
      ctx,
    )) as ToolResponse;
    const digest = response.structuredContent as {
      totals: { passes: number; files_processed: number };
    };

    expect(digest.totals.passes).toBe(3);
    expect(digest.totals.files_processed).toBe(3);
  });
});
