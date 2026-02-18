/**
 * File Organizer MCP Server v3.4.0
 * Path Validator Reserved Names Unit Tests
 *
 * Tests Windows reserved name validation in validatePathBase
 */

import { jest, describe, it, expect, beforeEach } from "@jest/globals";

// Mock fs/promises with default wrapper (matching how source imports it)
jest.unstable_mockModule("fs/promises", () => ({
  default: {
    access: jest
      .fn<() => Promise<void>>()
      .mockImplementation(() => Promise.resolve()),
    realpath: jest
      .fn<(p: string) => Promise<string>>()
      .mockImplementation((p: string) => Promise.resolve(p)),
    lstat: jest.fn<() => Promise<any>>().mockRejectedValue({ code: "ENOENT" }),
    constants: { W_OK: 2, R_OK: 4, O_RDONLY: 0, O_NOFOLLOW: 131072 },
  },
}));

// Mock path-security module
jest.unstable_mockModule("../../../src/utils/path-security.js", () => ({
  isPathAllowed: jest
    .fn<() => Promise<any>>()
    .mockResolvedValue({ allowed: true }),
  formatAccessDeniedMessage: jest.fn().mockReturnValue("Access denied"),
}));

// Mock config
jest.unstable_mockModule("../../../src/config.js", () => ({
  CONFIG: {
    security: {
      enablePathValidation: false,
    },
  },
}));

// Import after mocking
const { validatePathBase, PathValidatorService } =
  await import("../../../src/services/path-validator.service.js");
const { ValidationError } = await import("../../../src/types.js");

describe("path-validator-reserved-names", () => {
  describe("validatePathBase Windows reserved name validation", () => {
    it('should reject paths containing "CON"', async () => {
      await expect(validatePathBase("CON")).rejects.toThrow(ValidationError);
      await expect(validatePathBase("CON")).rejects.toThrow(
        "Path contains Windows reserved name: CON",
      );
    });

    it('should reject paths containing "CON.txt"', async () => {
      await expect(validatePathBase("CON.txt")).rejects.toThrow(
        ValidationError,
      );
      await expect(validatePathBase("CON.txt")).rejects.toThrow(
        "Path contains Windows reserved name: CON",
      );
    });

    it('should reject paths containing "com1" (case insensitive)', async () => {
      await expect(validatePathBase("com1")).rejects.toThrow(ValidationError);
      await expect(validatePathBase("com1")).rejects.toThrow(
        "Path contains Windows reserved name: com1",
      );
      await expect(validatePathBase("COM1")).rejects.toThrow(ValidationError);
      await expect(validatePathBase("Com1")).rejects.toThrow(ValidationError);
      await expect(validatePathBase("cOm1")).rejects.toThrow(ValidationError);
    });

    it('should reject paths containing "LPT9"', async () => {
      await expect(validatePathBase("LPT9")).rejects.toThrow(ValidationError);
      await expect(validatePathBase("LPT9")).rejects.toThrow(
        "Path contains Windows reserved name: LPT9",
      );
    });

    it("should reject all LPT ports 1-9", async () => {
      for (let i = 1; i <= 9; i++) {
        await expect(validatePathBase(`LPT${i}`)).rejects.toThrow(
          ValidationError,
        );
        await expect(validatePathBase(`lpt${i}`)).rejects.toThrow(
          ValidationError,
        );
      }
    });

    it("should reject all COM ports 1-9", async () => {
      for (let i = 1; i <= 9; i++) {
        await expect(validatePathBase(`COM${i}`)).rejects.toThrow(
          ValidationError,
        );
        await expect(validatePathBase(`com${i}`)).rejects.toThrow(
          ValidationError,
        );
      }
    });

    it("should reject other reserved names (PRN, AUX, NUL)", async () => {
      await expect(validatePathBase("PRN")).rejects.toThrow(ValidationError);
      await expect(validatePathBase("AUX")).rejects.toThrow(ValidationError);
      await expect(validatePathBase("NUL")).rejects.toThrow(ValidationError);
    });

    it('should accept paths containing "CONSOLE"', async () => {
      // CONSOLE contains CON but is not a reserved name
      const fs = (await import("fs/promises")).default;
      const mockAccess = fs.access as unknown as jest.Mock<() => Promise<void>>;
      mockAccess.mockResolvedValue(undefined);

      const result = await validatePathBase("CONSOLE");
      expect(result).toBeDefined();
      expect(result).toContain("CONSOLE");
    });

    it('should accept paths containing "CONTACT"', async () => {
      const fs = (await import("fs/promises")).default;
      const mockAccess = fs.access as unknown as jest.Mock<() => Promise<void>>;
      mockAccess.mockResolvedValue(undefined);

      const result = await validatePathBase("CONTACT.txt");
      expect(result).toBeDefined();
      expect(result).toContain("CONTACT");
    });

    it("should accept normal filenames", async () => {
      const fs = (await import("fs/promises")).default;
      const mockAccess = fs.access as unknown as jest.Mock<() => Promise<void>>;
      mockAccess.mockResolvedValue(undefined);

      const result = await validatePathBase("normal-file.txt");
      expect(result).toBeDefined();
      expect(result).toContain("normal-file.txt");
    });

    it("should accept filenames with reserved names as substring", async () => {
      const fs = (await import("fs/promises")).default;
      const mockAccess = fs.access as unknown as jest.Mock<() => Promise<void>>;
      mockAccess.mockResolvedValue(undefined);

      // These contain reserved words but are not reserved themselves
      const validNames = [
        "COMMAND.txt",
        "COMPANY.doc",
        "AUXILIARY.pdf",
        "NULLABLE.js",
        "PRINTER.cfg",
        "COMPUTE.log",
      ];

      for (const name of validNames) {
        const result = await validatePathBase(name);
        expect(result).toBeDefined();
        expect(result).toContain(name.replace(/\.[^/.]+$/, "")); // basename without extension
      }
    });

    it("should throw ValidationError with correct message for reserved names", async () => {
      await expect(validatePathBase("CON")).rejects.toBeInstanceOf(
        ValidationError,
      );
      await expect(validatePathBase("CON")).rejects.toThrow(
        "Path contains Windows reserved name: CON",
      );
    });

    it("should reject reserved names with various extensions", async () => {
      const extensions = [".txt", ".doc", ".pdf", ".exe", ".jpg", ".json", ""];

      for (const ext of extensions) {
        await expect(validatePathBase(`CON${ext}`)).rejects.toThrow(
          ValidationError,
        );
        await expect(validatePathBase(`LPT1${ext}`)).rejects.toThrow(
          ValidationError,
        );
        await expect(validatePathBase(`COM9${ext}`)).rejects.toThrow(
          ValidationError,
        );
      }
    });

    it("should reject reserved names as final path component", async () => {
      // The validation checks the basename of the path, not intermediate components
      await expect(validatePathBase("./CON")).rejects.toThrow(ValidationError);
      await expect(validatePathBase("folder/LPT1.txt")).rejects.toThrow(
        ValidationError,
      );
      await expect(validatePathBase("path/to/NUL")).rejects.toThrow(
        ValidationError,
      );
    });
  });

  describe("PathValidatorService reserved name validation", () => {
    let service: InstanceType<typeof PathValidatorService>;

    beforeEach(() => {
      service = new PathValidatorService("/test/base");
    });

    it("should reject reserved names through service.validatePath", async () => {
      await expect(service.validatePath("CON")).rejects.toThrow(
        ValidationError,
      );
      await expect(service.validatePath("NUL")).rejects.toThrow(
        ValidationError,
      );
      await expect(service.validatePath("LPT9.txt")).rejects.toThrow(
        ValidationError,
      );
    });

    it("should accept valid names through service.validatePath", async () => {
      const fs = (await import("fs/promises")).default;
      const mockAccess = fs.access as unknown as jest.Mock<() => Promise<void>>;
      mockAccess.mockResolvedValue(undefined);

      const result = await service.validatePath("valid-file.txt");
      expect(result).toBeDefined();
    });
  });
});
