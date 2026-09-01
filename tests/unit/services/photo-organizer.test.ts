import { jest } from "@jest/globals";
import path from "path";
import {
  withMockedLogger,
  type MockLogger,
} from "../../utils/logger-mock.js";

const mockReaddir = jest.fn();
const mockStat = jest.fn();
const mockAccess = jest.fn();
const mockMkdir = jest.fn();
const mockRename = jest.fn();
const mockUnlink = jest.fn();
const mockCopyFile = jest.fn();
const mockWriteFile = jest.fn();
const mockUtimes = jest.fn();
const mockReadFile = jest.fn();
const mockOpen = jest.fn();
const mockRead = jest.fn();

const mockPipeline = jest.fn();
const mockCreateReadStream = jest.fn();
const mockCreateWriteStream = jest.fn();

const mockExtractMetadata = jest.fn();
const mockValidatePath = jest.fn();

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

const { PhotoOrganizerService } = await import(
  "../../../src/services/photo-organizer.service.js"
);

const sourceDir = "/photos-source";
const targetDir = "/organized-target";

describe("PhotoOrganizerService", () => {
  let service: PhotoOrganizerService;

  beforeEach(() => {
    jest.clearAllMocks();

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
    mockOpen.mockResolvedValue({ read: mockRead, close: jest.fn() });
    mockRead.mockResolvedValue({ bytesRead: 0 });

    service = new PhotoOrganizerService();
  });

  describe("getDateFolderName", () => {
    it("returns the unknown folder for an undefined date", () => {
      expect(
        service.getDateFolderName(undefined, "YYYY/MM/DD", "Unknown Date"),
      ).toBe("Unknown Date");
    });

    it("formats a date as YYYY/MM/DD", () => {
      const date = new Date(2020, 4, 10);
      expect(service.getDateFolderName(date, "YYYY/MM/DD", "Unknown Date")).toBe(
        path.join("2020", "05", "10"),
      );
    });

    it("formats a date as YYYY-MM-DD", () => {
      const date = new Date(2020, 4, 10);
      expect(
        service.getDateFolderName(date, "YYYY-MM-DD", "Unknown Date"),
      ).toBe("2020-05-10");
    });

    it("formats a date as YYYY/MM", () => {
      const date = new Date(2020, 4, 10);
      expect(service.getDateFolderName(date, "YYYY/MM", "Unknown Date")).toBe(
        path.join("2020", "05"),
      );
    });

    it("formats a date as YYYY", () => {
      const date = new Date(2020, 4, 10);
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
        expect(result.movedFiles[0].originalPath).toBe(
          path.join(sourceDir, "photo.jpg"),
        );
        expect(result.movedFiles[0].currentPath).toBe(
          path.join(targetDir, "2020", "05", "10", "photo.jpg"),
        );
        expect(mockRename).toHaveBeenCalledTimes(1);
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
        expect(mockPipeline).toHaveBeenCalled();
        expect(mockRename).not.toHaveBeenCalled();
      }),
    );
  });

  describe("cross-device EXDEV fallback", () => {
    it(
      "falls back to copyFile and unlink when rename rejects with EXDEV",
      withMockedLogger(async (_logger: MockLogger) => {
        mockRename.mockRejectedValue(
          Object.assign(new Error("EXDEV"), { code: "EXDEV" }),
        );

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
        mockRename
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
        expect(result.errors[0].file).toBe(path.join(sourceDir, "photo1.jpg"));
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
});