/**
 * Metadata Service Tests - Windows Reserved Names
 * Tests for the sanitizeMetadataValue method's reserved name handling
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { MetadataService } from "../../../src/services/metadata.service.js";
import * as fileUtils from "../../../src/utils/file-utils.js";

describe("MetadataService - sanitizeMetadataValue (Reserved Names)", () => {
  let service: MetadataService;

  beforeEach(() => {
    service = new MetadataService();
  });

  describe("Windows Reserved Names Handling", () => {
    it("should append '_' to 'CON'", () => {
      // Access private method via type assertion for testing
      const result = (service as any).sanitizeMetadataValue("CON");
      expect(result).toBe("CON_");
    });

    it("should append '_' to 'PRN'", () => {
      const result = (service as any).sanitizeMetadataValue("PRN");
      expect(result).toBe("PRN_");
    });

    it("should append '_' to 'AUX'", () => {
      const result = (service as any).sanitizeMetadataValue("AUX");
      expect(result).toBe("AUX_");
    });

    it("should append '_' to 'NUL'", () => {
      const result = (service as any).sanitizeMetadataValue("NUL");
      expect(result).toBe("NUL_");
    });

    it("should append '_' to 'com1' (case insensitive)", () => {
      const result = (service as any).sanitizeMetadataValue("com1");
      expect(result).toBe("com1_");
    });

    it("should append '_' to 'COM1' (uppercase)", () => {
      const result = (service as any).sanitizeMetadataValue("COM1");
      expect(result).toBe("COM1_");
    });

    it("should append '_' to 'Com9' (mixed case)", () => {
      const result = (service as any).sanitizeMetadataValue("Com9");
      expect(result).toBe("Com9_");
    });

    it("should append '_' to 'LPT1'", () => {
      const result = (service as any).sanitizeMetadataValue("LPT1");
      expect(result).toBe("LPT1_");
    });

    it("should append '_' to 'lpt9' (lowercase)", () => {
      const result = (service as any).sanitizeMetadataValue("lpt9");
      expect(result).toBe("lpt9_");
    });

    it("should not modify normal values", () => {
      const result = (service as any).sanitizeMetadataValue("Normal Artist");
      expect(result).toBe("Normal Artist");
    });

    it("should not modify values that contain reserved names as substrings", () => {
      // "CON" is reserved, but "CONNECT" is not
      const result = (service as any).sanitizeMetadataValue("CONNECT");
      expect(result).toBe("CONNECT");
    });

    it("should not modify values starting with reserved names", () => {
      // "CON" is reserved, but "CONTEXT" is not
      const result = (service as any).sanitizeMetadataValue("CONTEXT");
      expect(result).toBe("CONTEXT");
    });

    it("should not modify values ending with reserved names", () => {
      // "AUX" is reserved, but "FAUX" is not
      const result = (service as any).sanitizeMetadataValue("FAUX");
      expect(result).toBe("FAUX");
    });
  });

  describe("Illegal Character Sanitization with Reserved Names", () => {
    it("should still sanitize illegal chars like / in reserved names", () => {
      const result = (service as any).sanitizeMetadataValue("CON/TEST");
      expect(result).toBe("CON_TEST");
      // Note: CON_TEST is not a reserved name since it contains underscore
      expect(result).not.toBe("CON_TEST_");
    });

    it("should still sanitize illegal chars like \\ in reserved names", () => {
      const result = (service as any).sanitizeMetadataValue("PRN\\TEST");
      expect(result).toBe("PRN_TEST");
    });

    it("should still sanitize illegal chars like : in reserved names", () => {
      const result = (service as any).sanitizeMetadataValue("AUX:TEST");
      expect(result).toBe("AUX_TEST");
    });

    it("should still sanitize illegal chars like * in reserved names", () => {
      const result = (service as any).sanitizeMetadataValue("NUL*TEST");
      expect(result).toBe("NUL_TEST");
    });

    it("should still sanitize illegal chars like ? in reserved names", () => {
      const result = (service as any).sanitizeMetadataValue("COM1?TEST");
      expect(result).toBe("COM1_TEST");
    });

    it('should still sanitize illegal chars like " in reserved names', () => {
      const result = (service as any).sanitizeMetadataValue('LPT1"TEST');
      expect(result).toBe("LPT1_TEST");
    });

    it("should still sanitize illegal chars like < in reserved names", () => {
      const result = (service as any).sanitizeMetadataValue("COM2<TEST");
      expect(result).toBe("COM2_TEST");
    });

    it("should still sanitize illegal chars like > in reserved names", () => {
      const result = (service as any).sanitizeMetadataValue("COM3>TEST");
      expect(result).toBe("COM3_TEST");
    });

    it("should still sanitize illegal chars like | in reserved names", () => {
      const result = (service as any).sanitizeMetadataValue("COM4|TEST");
      expect(result).toBe("COM4_TEST");
    });
  });

  describe("Edge Cases", () => {
    it("should return undefined for empty string", () => {
      const result = (service as any).sanitizeMetadataValue("");
      expect(result).toBeUndefined();
    });

    it("should return undefined for whitespace-only string", () => {
      const result = (service as any).sanitizeMetadataValue("   ");
      expect(result).toBeUndefined();
    });

    it("should return undefined for undefined input", () => {
      const result = (service as any).sanitizeMetadataValue(undefined);
      expect(result).toBeUndefined();
    });

    it("should trim whitespace before checking reserved names", () => {
      // "CON" with whitespace should be trimmed first, then checked
      const result = (service as any).sanitizeMetadataValue("  CON  ");
      expect(result).toBe("CON_");
    });

    it("should limit length to 100 characters", () => {
      const longValue = "A".repeat(200);
      const result = (service as any).sanitizeMetadataValue(longValue);
      expect(result).toHaveLength(100);
    });

    it("should handle reserved name at 100 character boundary", () => {
      // Create a string that becomes a reserved name exactly at 100 chars
      const value = "CON" + "A".repeat(97);
      const result = (service as any).sanitizeMetadataValue(value);
      expect(result).toHaveLength(100);
      // Since it's not exactly a reserved name (too long), no underscore appended
      expect(result?.startsWith("CON")).toBe(true);
    });
  });

  describe("Reserved Name Variations", () => {
    it("should handle all COM ports 1-9", () => {
      for (let i = 1; i <= 9; i++) {
        const result = (service as any).sanitizeMetadataValue(`COM${i}`);
        expect(result).toBe(`COM${i}_`);
      }
    });

    it("should handle all LPT ports 1-9", () => {
      for (let i = 1; i <= 9; i++) {
        const result = (service as any).sanitizeMetadataValue(`LPT${i}`);
        expect(result).toBe(`LPT${i}_`);
      }
    });

    it("should handle reserved names with extensions", () => {
      // With extension, the base name is still reserved
      const result = (service as any).sanitizeMetadataValue("CON.txt");
      // path.parse("CON.txt").name = "CON", which is reserved
      expect(result).toBe("CON.txt_");
    });

    it("should handle reserved names with multiple extensions", () => {
      // path.parse("PRN.tar.gz").name = "PRN.tar" which is NOT a reserved name
      // Only "PRN" would be reserved, not "PRN.tar"
      const result = (service as any).sanitizeMetadataValue("PRN.tar.gz");
      expect(result).toBe("PRN.tar.gz");
    });
  });

  describe("Integration with isWindowsReservedName", () => {
    it("should use isWindowsReservedName utility correctly", () => {
      // Verify the integration with the utility function
      expect(fileUtils.isWindowsReservedName("CON")).toBe(true);
      expect(fileUtils.isWindowsReservedName("PRN")).toBe(true);
      expect(fileUtils.isWindowsReservedName("AUX")).toBe(true);
      expect(fileUtils.isWindowsReservedName("NUL")).toBe(true);
      expect(fileUtils.isWindowsReservedName("COM1")).toBe(true);
      expect(fileUtils.isWindowsReservedName("LPT1")).toBe(true);
      expect(fileUtils.isWindowsReservedName("Normal")).toBe(false);
    });
  });
});
