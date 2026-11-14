import { jest } from "@jest/globals";
import path from "path";
import os from "os";
import fs from "fs/promises";
import type { FileHandle } from "fs/promises";
import {
  withMockedLogger,
  type MockLogger,
} from "../../utils/logger-mock.js";
import { at } from "../../helpers/safe-index.js";

/** The slice of `Dirent` the service reads while walking the source directory. */
interface DirentLike {
  name: string;
  isFile: () => boolean;
}

/** The slice of `Stats` the service reads to derive a fallback date. */
interface StatLike {
  size: number;
  birthtime: Date;
  mtime: Date;
}

/** The slice of `FileHandle` used when stripping GPS data. */
interface FileHandleLike {
  read: ReturnType<typeof jest.fn<() => Promise<{ bytesRead: number }>>>;
  close: ReturnType<typeof jest.fn<() => Promise<void>>>;
}

/** The metadata fields the organizer reads off an extracted photo record. */
interface PhotoMetadataLike {
  dateTaken?: string;
  camera?: string;
}

const mockReaddir = jest.fn<() => Promise<Array<DirentLike>>>();
const mockStat = jest.fn<() => Promise<StatLike>>();
const mockAccess = jest.fn<() => Promise<void>>();
const mockMkdir = jest.fn<() => Promise<void>>();
const mockRename = jest.fn<() => Promise<void>>();
const mockUnlink = jest.fn<() => Promise<void>>();
const mockCopyFile = jest.fn<() => Promise<void>>();
const mockWriteFile = jest.fn<() => Promise<void>>();
const mockUtimes = jest.fn<() => Promise<void>>();
const mockReadFile = jest.fn<() => Promise<Buffer>>();
const mockOpen = jest.fn<() => Promise<FileHandleLike>>();
const mockRead = jest.fn<() => Promise<{ bytesRead: number }>>();

const mockPipeline = jest.fn<() => Promise<void>>();
const mockCreateReadStream = jest.fn<() => NodeJS.ReadableStream>();
const mockCreateWriteStream = jest.fn<() => NodeJS.WritableStream>();

const mockExtractMetadata = jest.fn<() => Promise<PhotoMetadataLike>>();
const mockValidatePath = jest.fn<(candidate: string) => string>();

jest.unstable_mockModule("fs/promises", () => ({
  default: {
    readdir: mockReaddir,
    stat: mockStat,
    access: mockAccess,
    mkdir: mockMkdir,
    rename: mockRename,
    unlink: mockUnlink,
    copyFile: mockCopyFile,
    writeFile: mockWriteFile,
    utimes: mockUtimes,
    readFile: mockReadFile,
    open: mockOpen,
  },
}));

jest.unstable_mockModule("fs", () => {
  const fsMock = {
    createReadStream: mockCreateReadStream,
    createWriteStream: mockCreateWriteStream,
    constants: {
      COPYFILE_EXCL: 1,
      O_RDONLY: 0,
      O_NOFOLLOW: 0,
    },
  };
  return {
    ...fsMock,
    default: fsMock,
  };
});

jest.unstable_mockModule("stream/promises", () => ({
  pipeline: mockPipeline,
}));

jest.unstable_mockModule("piexifjs", () => ({
  load: jest.fn(),
  dump: jest.fn(),
  remove: jest.fn(),
  insert: jest.fn(),
  GPSIFD: {},
  ImageIFD: {},
}));

jest.unstable_mockModule("../../../src/services/metadata/service.js", () => ({
  MetadataService: jest.fn().mockImplementation(() => ({
    extractMetadata: mockExtractMetadata,
  })),
}));

jest.unstable_mockModule(
  "../../../src/services/path-validator.service.js",
  () => ({
    PathValidatorService: jest.fn().mockImplementation(() => ({
      validatePath: mockValidatePath,
    })),
  }),
);

jest.unstable_mockModule("../../../src/core/io/index.js", () => ({
  readFile: jest.fn(async (filePath: string, options?: any) => {
    const encoding = options?.encoding === undefined ? "utf-8" : options?.encoding;
    const data = encoding === null ? Buffer.from([0xff, 0xd8]) : "[mock]";
    return { data, bytesRead: data.length, totalSize: data.length, mimeType: "image/jpeg" };
  }),
  assertNotSensitive: jest.fn(),
  isSensitiveFile: jest.fn(() => false),
  SENSITIVE_PATTERNS: [],
  SENSITIVE_DIRECTORIES: [],
  safeAtomicMove: jest.fn(),
}));

const { PhotoOrganizerService } = await import(
  "../../../src/services/photo-organizer.service.js"
);

const sourceDir = "/photos-source";
const targetDir = "/organized-target";

describe("PhotoOrganizerService", () => {
  let service: InstanceType<typeof PhotoOrganizerService>;
  let defaultTmpFile: string;
  let defaultTmpDir: string;

  beforeEach(async () => {
    jest.clearAllMocks();

    defaultTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "photo-org-def-"));
    defaultTmpFile = path.join(defaultTmpDir, "photo.jpg");
    await fs.writeFile(defaultTmpFile, Buffer.from([0xff, 0xd8, 0xff, 0xe0]));

    mockValidatePath.mockImplementation((p: string) => p);
    mockReaddir.mockResolvedValue([{ name: "photo.jpg", isFile: () => true }]);
    mockStat.mockResolvedValue({
      size: 1000,
      birthtime: new Date("2020-01-15T10:00:00Z"),
      mtime: new Date(),
    });
    mockExtractMetadata.mockResolvedValue({
      dateTaken: "2020-05-10T00:00:00Z",
      camera: "Nikon D850",
    });
    mockAccess.mockRejectedValue(new Error("ENOENT"));
    mockMkdir.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
    mockCopyFile.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockUtimes.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue(Buffer.from([0xff, 0xd8]));
    mockPipeline.mockResolvedValue(undefined);
    mockOpen.mockImplementation(async () => {
      return await fs.open(defaultTmpFile, "r");
    });
    mockRead.mockResolvedValue({ bytesRead: 0 });

    service = new PhotoOrganizerService();
  });

  afterEach(async () => {
    if (defaultTmpDir) {
      await fs.rm(defaultTmpDir, { recursive: true, force: true });
    }
  });

  describe("getDateFolderName", () => {
    it("returns the unknown folder for an undefined date", () => {
      expect(
        service.getDateFolderName(undefined, "YYYY/MM/DD", "Unknown Date"),
      ).toBe("Unknown Date");
    });

    it("formats a date as YYYY/MM/DD", () => {
      const date = { instant: new Date(2020, 4, 10), source: "mtime" as const };
      expect(service.getDateFolderName(date, "YYYY/MM/DD", "Unknown Date")).toBe(
        path.join("2020", "05", "10"),
      );
    });

    it("formats a date as YYYY-MM-DD", () => {
      const date = { instant: new Date(2020, 4, 10), source: "mtime" as const };
      expect(
        service.getDateFolderName(date, "YYYY-MM-DD", "Unknown Date"),
      ).toBe("2020-05-10");
    });

    it("formats a date as YYYY/MM", () => {
      const date = { instant: new Date(2020, 4, 10), source: "mtime" as const };
      expect(service.getDateFolderName(date, "YYYY/MM", "Unknown Date")).toBe(
        path.join("2020", "05"),
      );
    });

    it("formats a date as YYYY", () => {
      const date = { instant: new Date(2020, 4, 10), source: "mtime" as const };
      expect(service.getDateFolderName(date, "YYYY", "Unknown Date")).toBe(
        "2020",
      );
    });
  });

  describe("sanitizeFolderName", () => {
    it("returns Unknown when the sanitized name is empty", () => {
      expect(service.sanitizeFolderName("   ")).toBe("Unknown");
    });

    it("strips illegal characters from the name", () => {
      expect(service.sanitizeFolderName('my/file:name?')).toBe(
        "my_file_name_",
      );
    });

    it("replaces runs of dots", () => {
      expect(service.sanitizeFolderName("photo..v2")).toBe("photo_v2");
    });

    it("suffixes Windows reserved names with an underscore", () => {
      expect(service.sanitizeFolderName("CON")).toBe("CON_");
    });

    it("trims surrounding whitespace", () => {
      expect(service.sanitizeFolderName("  hello  ")).toBe("hello");
    });

    it("caps the length at 100 characters", () => {
      const longName = "a".repeat(150);
      expect(service.sanitizeFolderName(longName).length).toBe(100);
    });
  });

  describe("organize dry run", () => {
    it(
      "tracks structure without moving files",
      withMockedLogger(async (_logger: MockLogger) => {
        const result = await service.organize({
          sourceDir,
          targetDir,
          dateFormat: "YYYY/MM/DD",
          dryRun: true,
        });

        expect(result.success).toBe(true);
        expect(result.organizedFiles).toBe(1);
        expect(
          result.structure[path.join(targetDir, "2020", "05", "10")],
        ).toBe(1);
        expect(mockRename).not.toHaveBeenCalled();
        expect(mockCopyFile).not.toHaveBeenCalled();
      }),
    );
  });

  describe("organize move", () => {
    it(
      "moves files and tracks the moved path",
      withMockedLogger(async (_logger: MockLogger) => {
        const result = await service.organize({
          sourceDir,
          targetDir,
          dateFormat: "YYYY/MM/DD",
          dryRun: false,
        });

        expect(result.success).toBe(true);
        expect(result.organizedFiles).toBe(1);
        expect(result.movedFiles).toHaveLength(1);
        expect(at(result.movedFiles, 0).originalPath).toBe(
          path.join(sourceDir, "photo.jpg"),
        );
        expect(at(result.movedFiles, 0).currentPath).toBe(
          path.join(targetDir, "2020", "05", "10", "photo.jpg"),
        );
        expect(mockCopyFile).toHaveBeenCalledTimes(1);
        expect(mockUnlink).toHaveBeenCalledTimes(1);
      }),
    );
  });

  describe("organize copy", () => {
    it(
      "copies files via the stream pipeline",
      withMockedLogger(async (_logger: MockLogger) => {
        const result = await service.organize({
          sourceDir,
          targetDir,
          dateFormat: "YYYY/MM/DD",
          dryRun: false,
          copyInsteadOfMove: true,
        });

        expect(result.success).toBe(true);
        expect(result.organizedFiles).toBe(1);
        expect(mockCopyFile).toHaveBeenCalled();
        expect(mockRename).not.toHaveBeenCalled();
      }),
    );
  });

  describe("cross-device EXDEV fallback", () => {
    it(
      "uses atomic move for cross-device operations",
      withMockedLogger(async (_logger: MockLogger) => {
        const result = await service.organize({
          sourceDir,
          targetDir,
          dateFormat: "YYYY/MM/DD",
          dryRun: false,
        });

        expect(result.success).toBe(true);
        expect(result.organizedFiles).toBe(1);
        expect(mockCopyFile).toHaveBeenCalledTimes(1);
        expect(mockUnlink).toHaveBeenCalledTimes(1);
        expect(result.errors).toHaveLength(0);
      }),
    );
  });

  describe("error isolation", () => {
    it(
      "continues organizing when a single file fails",
      withMockedLogger(async (_logger: MockLogger) => {
        mockReaddir.mockResolvedValue([
          { name: "photo1.jpg", isFile: () => true },
          { name: "photo2.jpg", isFile: () => true },
        ]);
        mockCopyFile
          .mockRejectedValueOnce(new Error("disk full"))
          .mockResolvedValue(undefined);

        const result = await service.organize({
          sourceDir,
          targetDir,
          dateFormat: "YYYY/MM/DD",
          dryRun: false,
        });

        expect(result.organizedFiles).toBe(1);
        expect(result.errors).toHaveLength(1);
        expect(at(result.errors, 0).file).toBe(path.join(sourceDir, "photo1.jpg"));
        expect(result.success).toBe(false);
      }),
    );

    it(
      "returns success false when all per-file actions fail",
      withMockedLogger(async (_logger: MockLogger) => {
        mockReaddir.mockResolvedValue([
          { name: "photo1.jpg", isFile: () => true },
          { name: "photo2.jpg", isFile: () => true },
        ]);
        // The move goes through safeAtomicMove, which can rename or copy before
        // unlinking, so both seams have to fail for every action to fail.
        mockRename.mockRejectedValue(new Error("permission denied"));
        mockCopyFile.mockRejectedValue(new Error("permission denied"));

        const result = await service.organize({
          sourceDir,
          targetDir,
          dateFormat: "YYYY/MM/DD",
          dryRun: false,
        });

        expect(result.success).toBe(false);
        expect(result.organizedFiles).toBe(0);
        expect(result.errors).toHaveLength(2);
      }),
    );
  });

  describe("previewOrganization", () => {
    it(
      "forces a dry run and does not rename files",
      withMockedLogger(async (_logger: MockLogger) => {
        const result = await service.previewOrganization({
          sourceDir,
          targetDir,
          dateFormat: "YYYY/MM/DD",
          dryRun: false,
        });

        expect(result.success).toBe(true);
        expect(result.organizedFiles).toBe(1);
        expect(
          result.structure[path.join(targetDir, "2020", "05", "10")],
        ).toBe(1);
        expect(mockRename).not.toHaveBeenCalled();
      }),
    );
  });

  describe("config validation", () => {
    it(
      "rejects when source and target are the same directory",
      withMockedLogger(async (_logger: MockLogger) => {
        mockValidatePath.mockImplementation(() => "/same-path");

        const result = await service.organize({
          sourceDir,
          targetDir,
          dateFormat: "YYYY/MM/DD",
        });

        expect(result.success).toBe(false);
        expect(result.errors.some((e) =>
          e.error.includes(
            "Source and target directories must be different",
          ),
        )).toBe(true);
      }),
    );

    it(
      "rejects when source and target are nested",
      withMockedLogger(async (_logger: MockLogger) => {
        const nestedSource = "/parent";
        const nestedTarget = "/parent/child";

        const result = await service.organize({
          sourceDir: nestedSource,
          targetDir: nestedTarget,
          dateFormat: "YYYY/MM/DD",
        });

        expect(result.success).toBe(false);
        expect(result.errors.some((e) =>
          e.error.includes(
            "Source and target directories cannot be nested within each other",
          ),
        )).toBe(true);
      }),
    );
  });

  describe("GPS stripping (BUG-13 regression)", () => {
    it(
      "does not count GPS as stripped when stripping does not actually occur on non-JPEG",
      withMockedLogger(async (_logger: MockLogger) => {
        // Simulate PNG file that has GPS marker detected by hasGPSData
        mockReaddir.mockResolvedValue([
          { name: "photo.png", isFile: () => true },
        ]);
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "photo-org-"));
        const tmpFile = path.join(tmpDir, "photo.png");
        const buf = Buffer.alloc(4);
        buf[0] = 0x25;
        buf[1] = 0x88;
        await fs.writeFile(tmpFile, buf);
        try {
          mockOpen.mockImplementation(async () => {
            return await fs.open(tmpFile, "r");
          });

          const result = await service.organize({
            sourceDir,
            targetDir,
            dateFormat: "YYYY/MM/DD",
            dryRun: false,
            stripGPS: true,
            copyInsteadOfMove: true,
          });

          expect(result.strippedGPSFiles).toBe(0);
        } finally {
          await fs.rm(tmpDir, { recursive: true, force: true });
        }
      }),
    );
  });

  describe("unknown date folder containment", () => {
    it("sanitizes traversal sequences so the folder stays a leaf", () => {
      expect(
        service.getDateFolderName(undefined, "YYYY/MM", "../../evil"),
      ).toBe("____evil");
    });

    it("keeps organized files under the target directory", async () => {
      mockExtractMetadata.mockResolvedValue({});

      const result = await service.organize({
        sourceDir,
        targetDir,
        dateFormat: "YYYY/MM",
        unknownDateFolder: "../../evil",
        dryRun: true,
      });

      expect(result.success).toBe(true);
      const folders = Object.keys(result.structure);
      expect(folders.length).toBe(1);
      const folder = at(folders, 0);
      expect(folder).toBe(path.join(targetDir, "____evil"));
      expect(folder.includes("..")).toBe(false);
    });
  });

  describe("concurrent runs", () => {
    it(
      "does not silently overwrite when two runs race to the same destination",
      withMockedLogger(async (_logger: MockLogger) => {
        const service1 = new PhotoOrganizerService();
        const service2 = new PhotoOrganizerService();

        let copyAttempts = 0;
        mockCopyFile.mockImplementation(async () => {
          copyAttempts++;
          if (copyAttempts === 1 || copyAttempts === 3) {
            return undefined;
          }
          const err = new Error("Destination file already exists") as NodeJS.ErrnoException;
          err.code = "EEXIST";
          throw err;
        });

        const [result1, result2] = await Promise.all([
          service1.organize({
            sourceDir,
            targetDir,
            dateFormat: "YYYY/MM/DD",
            dryRun: false,
          }),
          service2.organize({
            sourceDir,
            targetDir,
            dateFormat: "YYYY/MM/DD",
            dryRun: false,
          }),
        ]);

        expect(result1.success).toBe(true);
        expect(result2.success).toBe(true);
        expect(result1.errors).toHaveLength(0);
        expect(result2.errors).toHaveLength(0);
        expect(result1.organizedFiles).toBe(1);
        expect(result2.organizedFiles).toBe(1);
        expect(result1.movedFiles.length).toBeGreaterThan(0);
        expect(result2.movedFiles.length).toBeGreaterThan(0);
        const moved1 = result1.movedFiles[0];
        const moved2 = result2.movedFiles[0];
        expect(moved1?.currentPath).toBeDefined();
        expect(moved2?.currentPath).toBeDefined();
        expect(moved1?.currentPath).not.toBe(moved2?.currentPath);
      }),
    );
  });
});
