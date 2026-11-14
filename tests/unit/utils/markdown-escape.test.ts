import { escapeMarkdown } from "../../../src/utils/markdown-escape.js";

describe("escapeMarkdown", () => {
  it("escapes backticks in free text", () => {
    expect(escapeMarkdown("file`name.txt")).toBe("file\\`name.txt");
  });

  it("does not backslash-escape backticks in code spans", () => {
    expect(escapeMarkdown("file`name.txt", { inCodeSpan: true })).toBe(
      "file`name.txt",
    );
  });
});
