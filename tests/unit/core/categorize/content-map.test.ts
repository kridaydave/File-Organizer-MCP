/**
 * Tests for content-map - BUG-19 regression
 */

import { mapContentTypeToCategory } from "../../../../src/core/categorize/content-map.js";

describe("mapContentTypeToCategory", () => {
  it("should categorize OOXML xlsx as Spreadsheets not Documents", () => {
    const result = mapContentTypeToCategory(
      "XLSX",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(result).toBe("Spreadsheets");
  });

  it("should categorize OOXML pptx as Presentations not Documents", () => {
    const result = mapContentTypeToCategory(
      "PPTX",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    expect(result).toBe("Presentations");
  });
});
