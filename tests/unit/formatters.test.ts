import { formatDuration } from "../../src/utils/formatters.js";

describe("formatDuration", () => {
  it("throws for NaN", () => {
    expect(() => formatDuration(NaN)).toThrow();
  });

  it("throws for negative values", () => {
    expect(() => formatDuration(-5000)).toThrow();
  });

  it("formats normal values", () => {
    expect(formatDuration(500)).toBe("500ms");
    expect(formatDuration(1500)).toBe("1.5s");
    expect(formatDuration(90000)).toBe("1.5m");
  });
});
