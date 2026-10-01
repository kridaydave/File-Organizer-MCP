import { renderSkippedNotice } from "../../../src/utils/formatters.js";

const skip = (name: string, size = 1024) => ({
  path: `/tmp/${name}`,
  name,
  size_bytes: size,
  reason: "exceeds_size_cap" as const,
  detail: "Larger than the 100 MB hashing cap, so its content was not compared.",
});

describe("renderSkippedNotice", () => {
  it("returns an empty string when nothing was skipped", () => {
    expect(renderSkippedNotice([], 0, "the results above are partial.")).toBe("");
  });

  it("names every skipped file and the total size", () => {
    const notice = renderSkippedNotice(
      [skip("a.bin"), skip("b.bin", 2048)],
      3072,
      "the results above are partial.",
    );

    expect(notice).toContain("Not analyzed: 2 file(s)");
    expect(notice).toContain("3 KB");
    expect(notice).toContain("`/tmp/a.bin` (1 KB)");
    expect(notice).toContain("`/tmp/b.bin` (2 KB)");
    expect(notice).toContain("the results above are partial.");
  });

  it("carries each file's own detail rather than a generic reason", () => {
    const notice = renderSkippedNotice(
      [{ ...skip("odd.bin"), detail: "Could not be read for hashing: EACCES" }],
      1024,
      "partial.",
    );

    expect(notice).toContain("Could not be read for hashing: EACCES");
  });

  it("truncates past the limit and points at the full JSON array", () => {
    const many = Array.from({ length: 25 }, (_, i) => skip(`f${i}.bin`));
    const notice = renderSkippedNotice(many, 25600, "partial.");

    expect(notice).toContain("Not analyzed: 25 file(s)");
    // 20 named individually, the remainder deferred.
    expect(notice).toContain("`/tmp/f19.bin`");
    expect(notice).not.toContain("`/tmp/f20.bin`");
    expect(notice).toContain("and 5 more");
    expect(notice).toContain("`skipped` array");
  });

  // The block carries no leading or trailing newline: each caller splices it
  // into a different position in its own template, so the separators belong
  // there. tests/unit/tools/skipped_notice_placement.test.ts pins the composed
  // result at both call sites.
  it("returns the bare block with no surrounding newlines", () => {
    const notice = renderSkippedNotice([skip("a.bin")], 1024, "partial.");

    expect(notice).toBe(
      "⚠️ **Not analyzed: 1 file(s)** (1 KB) — partial.\n" +
        "- `/tmp/a.bin` (1 KB) — Larger than the 100 MB hashing cap, so its content was not compared.",
    );
  });
});
