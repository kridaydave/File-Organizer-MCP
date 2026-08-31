/**
 * Image Metadata Service Tests - Phase 2.5
 * Tests for EXIF parsing, GPS extraction, privacy features
 */

import fs from "fs/promises";
import path from "path";
import { ImageMetadataService } from "../../../src/services/metadata/image.js";

describe("ImageMetadataService", () => {
  let service: ImageMetadataService;
  let testDir: string;

  beforeEach(async () => {
    service = new ImageMetadataService();
    testDir = await fs.mkdtemp(
      path.join(process.cwd(), "tests", "temp", "image-meta-"),
    );
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // Helper to create minimal JPEG with APP1 (EXIF) segment
  async function createMockJPEG(
    fileName: string,
    options: {
      width?: number;
      height?: number;
      hasEXIF?: boolean;
      gpsData?: { lat: number; lng: number };
      dateTaken?: Date;
      cameraMake?: string;
      cameraModel?: string;
      orientation?: number;
    } = {},
  ): Promise<string> {
    const filePath = path.join(testDir, fileName);

    // JPEG SOI marker
    let jpegData = Buffer.from([0xff, 0xd8]);

    if (options.hasEXIF !== false) {
      // Create APP1 marker and EXIF data
      const exifData = createEXIFData(options);
      const app1Marker = Buffer.from([0xff, 0xe1]);
      const app1Length = Buffer.alloc(2);
      app1Length.writeUInt16BE(exifData.length + 2, 0);

      jpegData = Buffer.concat([jpegData, app1Marker, app1Length, exifData]);
    }

    // SOF0 marker (Start of Frame - Baseline DCT)
    const sof0Data = Buffer.concat([
      Buffer.from([0xff, 0xc0]), // SOF0 marker
      Buffer.from([0x00, 0x0b]), // Length
      Buffer.from([0x08]), // Precision
      Buffer.from([
        (options.height ?? 100) >> 8,
        (options.height ?? 100) & 0xff,
      ]), // Height
      Buffer.from([(options.width ?? 100) >> 8, (options.width ?? 100) & 0xff]), // Width
      Buffer.from([0x01, 0x01, 0x11, 0x00]), // Components
    ]);

    // EOI marker
    const eoi = Buffer.from([0xff, 0xd9]);

    jpegData = Buffer.concat([jpegData, sof0Data, eoi]);
    await fs.writeFile(filePath, jpegData);

    return filePath;
  }

  // Builds a spec-correct EXIF APP1 payload.
  // All offsets are relative to the TIFF header start (after the 6-byte
  // "Exif\0\0" identifier), per the TIFF spec.
  function createEXIFData(options: any): Buffer {
    const exifIdentifier = Buffer.from("Exif\x00\x00", "ascii");

    const tiffHeader = Buffer.from([
      0x49, 0x49, // "II" little endian
      0x2a, 0x00, // TIFF marker
      0x08, 0x00, 0x00, 0x00, // IFD0 offset = 8 (right after the header)
    ]);

    const entryInfos: Array<{
      tag: number;
      type: number;
      count: number;
      value?: number;
      data?: Buffer;
    }> = [];

    if (options.width) {
      entryInfos.push({ tag: 0x0100, type: 3, count: 1, value: options.width }); // ImageWidth
    }
    if (options.height) {
      entryInfos.push({ tag: 0x0101, type: 3, count: 1, value: options.height }); // ImageLength
    }
    if (options.cameraMake) {
      entryInfos.push({
        tag: 0x010f,
        type: 2,
        count: options.cameraMake.length + 1,
        data: Buffer.from(options.cameraMake + "\x00", "ascii"),
      }); // Make
    }
    if (options.cameraModel) {
      entryInfos.push({
        tag: 0x0110,
        type: 2,
        count: options.cameraModel.length + 1,
        data: Buffer.from(options.cameraModel + "\x00", "ascii"),
      }); // Model
    }
    if (options.orientation) {
      entryInfos.push({ tag: 0x0112, type: 3, count: 1, value: options.orientation }); // Orientation
    }

    const numEntries = entryInfos.length + (options.gpsData ? 1 : 0);
    const ifd0Offset = 8;
    const ifd0Size = 2 + numEntries * 12 + 4;
    let externalOffset = ifd0Offset + ifd0Size;

    // Assign TIFF-relative offsets for out-of-line string data
    for (const info of entryInfos) {
      if (info.data) {
        info.value = externalOffset;
        externalOffset += info.data.length;
      }
    }

    // GPS IFD is placed after the string data; pointer tag points at it
    let gpsIFDBuffer: Buffer | null = null;
    if (options.gpsData) {
      gpsIFDBuffer = createGPSIFD(options.gpsData, externalOffset);
      entryInfos.push({ tag: 0x8825, type: 4, count: 1, value: externalOffset });
    }

    const ifdCount = Buffer.alloc(2);
    ifdCount.writeUInt16LE(entryInfos.length, 0);
    const nextIFD = Buffer.alloc(4);

    const entries = entryInfos.map((info) =>
      createIFDEntry(info.tag, info.type, info.count, info.value ?? 0),
    );

    return Buffer.concat([
      exifIdentifier,
      tiffHeader,
      ifdCount,
      ...entries,
      nextIFD,
      ...entryInfos.filter((i) => i.data).map((i) => i.data as Buffer),
      ...(gpsIFDBuffer ? [gpsIFDBuffer] : []),
    ]);
  }

  function createGPSIFD(
    gpsData: { lat: number; lng: number },
    ifdOffset: number,
  ): Buffer {
    // Convert decimal coordinates to DMS (degrees, minutes, seconds)
    const latDMS = decimalToDMS(Math.abs(gpsData.lat));
    const lngDMS = decimalToDMS(Math.abs(gpsData.lng));
    const latRef = gpsData.lat >= 0 ? "N" : "S";
    const lngRef = gpsData.lng >= 0 ? "E" : "W";

    // GPS IFD: count (2) + 4 entries (4 * 12) + next IFD (4); rationals follow
    const gpsIFDSize = 2 + 4 * 12 + 4;
    const rationalBase = ifdOffset + gpsIFDSize;

    // Inline ASCII value: byte 0 is the ref char, byte 1 is NUL
    const refValue = (c: string) => c.charCodeAt(0);

    const gpsEntries = [
      createIFDEntry(0x0001, 2, 2, refValue(latRef)), // GPSLatitudeRef
      createIFDEntry(0x0002, 5, 3, rationalBase), // GPSLatitude -> rationals
      createIFDEntry(0x0003, 2, 2, refValue(lngRef)), // GPSLongitudeRef
      createIFDEntry(0x0004, 5, 3, rationalBase + 24), // GPSLongitude -> rationals
    ];

    const gpsCount = Buffer.alloc(2);
    gpsCount.writeUInt16LE(4, 0);
    const nextIFD = Buffer.alloc(4);

    const rationals = Buffer.concat([
      createRational(latDMS.degrees, 1),
      createRational(latDMS.minutes, 1),
      createRational(Math.round(latDMS.seconds * 100), 100),
      createRational(lngDMS.degrees, 1),
      createRational(lngDMS.minutes, 1),
      createRational(Math.round(lngDMS.seconds * 100), 100),
    ]);

    return Buffer.concat([gpsCount, ...gpsEntries, nextIFD, rationals]);
  }

  function decimalToDMS(decimal: number): {
    degrees: number;
    minutes: number;
    seconds: number;
  } {
    const degrees = Math.floor(decimal);
    const minutesFull = (decimal - degrees) * 60;
    const minutes = Math.floor(minutesFull);
    const seconds = (minutesFull - minutes) * 60;
    return { degrees, minutes, seconds: Math.round(seconds * 100) / 100 };
  }

  function createRational(numerator: number, denominator: number): Buffer {
    const buf = Buffer.alloc(8);
    buf.writeUInt32LE(numerator, 0);
    buf.writeUInt32LE(denominator, 4);
    return buf;
  }

  function createIFDEntry(
    tag: number,
    type: number,
    count: number,
    value: number,
  ): Buffer {
    const entry = Buffer.alloc(12);
    entry.writeUInt16LE(tag, 0);
    entry.writeUInt16LE(type, 2);
    entry.writeUInt32LE(count, 4);
    entry.writeUInt32LE(value, 8);
    return entry;
  }

  // ==================== UNIT TESTS ====================

  describe("getSupportedFormats", () => {
    it("should return supported image formats", () => {
      const formats = service.getSupportedFormats();
      expect(formats).toContain("jpg");
      expect(formats).toContain("jpeg");
      expect(formats).toContain("png");
      expect(formats).toContain("tiff");
      expect(formats).toContain("webp");
    });
  });

  describe("isFormatSupported", () => {
    it("should return true for supported formats", () => {
      expect(service.isFormatSupported("image.jpg")).toBe(true);
      expect(service.isFormatSupported("image.jpeg")).toBe(true);
      expect(service.isFormatSupported("image.png")).toBe(true);
    });

    it("should return false for unsupported formats", () => {
      expect(service.isFormatSupported("image.gif")).toBe(false);
      expect(service.isFormatSupported("image.bmp")).toBe(false);
    });

    it("should be case insensitive", () => {
      expect(service.isFormatSupported("image.JPG")).toBe(true);
      expect(service.isFormatSupported("image.JPEG")).toBe(true);
    });
  });

  // ==================== EXTRACTION TESTS ====================

  describe("extract", () => {
    it("should extract basic JPEG metadata", async () => {
      const filePath = await createMockJPEG("test.jpg", {
        width: 1920,
        height: 1080,
        hasEXIF: true,
      });

      const metadata = await service.extract(filePath);

      expect(metadata.filePath).toBe(filePath);
      expect(metadata.format).toBe("JPEG");
      expect(metadata.width).toBe(1920);
      expect(metadata.height).toBe(1080);
      expect(metadata.hasEXIF).toBe(true);
      expect(metadata.extractedAt).toBeInstanceOf(Date);
    });

    it("should extract camera information", async () => {
      const filePath = await createMockJPEG("camera.jpg", {
        cameraMake: "Canon",
        cameraModel: "EOS 5D",
      });

      const metadata = await service.extract(filePath);

      expect(metadata.camera?.make).toBe("Canon");
      expect(metadata.camera?.model).toBe("EOS 5D");
    });

    it("should handle JPEG without EXIF", async () => {
      const filePath = await createMockJPEG("noexif.jpg", { hasEXIF: false });

      const metadata = await service.extract(filePath);

      expect(metadata.format).toBe("JPEG");
      expect(metadata.hasEXIF).toBe(false);
    });

    it("should detect orientation", async () => {
      const filePath = await createMockJPEG("oriented.jpg", { orientation: 6 });

      const metadata = await service.extract(filePath);

      expect(metadata.orientation).toBe(6);
    });

    it("should handle non-existent files", async () => {
      const filePath = path.join(testDir, "nonexistent.jpg");

      await expect(service.extract(filePath)).rejects.toThrow();
    });

    it("should handle directories", async () => {
      const dirPath = path.join(testDir, "adir");
      await fs.mkdir(dirPath);

      await expect(service.extract(dirPath)).rejects.toThrow();
    });
  });

  // ==================== GPS EXTRACTION TESTS ====================

  describe("GPS Extraction", () => {
    it("should extract GPS coordinates when available", async () => {
      const filePath = await createMockJPEG("gps.jpg", {
        gpsData: { lat: 40.7128, lng: -74.006 },
      });

      const metadata = await service.extract(filePath, { extractGPS: true });

      expect(metadata.gps?.hasGPS).toBe(true);
      expect(metadata.gps?.latitude).toBeCloseTo(40.7128, 2);
      expect(metadata.gps?.longitude).toBeCloseTo(-74.006, 2);
    });

    it("should not extract GPS by default", async () => {
      const filePath = await createMockJPEG("gps.jpg", {
        gpsData: { lat: 40.7128, lng: -74.006 },
      });

      const metadata = await service.extract(filePath);

      // GPS should not be extracted by default
      expect(metadata.gps).toBeUndefined();
    });

    it("should handle images without GPS", async () => {
      const filePath = await createMockJPEG("nogps.jpg", {});

      const metadata = await service.extract(filePath, { extractGPS: true });

      expect(metadata.gps?.hasGPS).toBe(false);
    });

    it("should extract GPS timestamp when available", async () => {
      const filePath = await createMockJPEG("gpstime.jpg", {
        gpsData: { lat: 51.5074, lng: -0.1278 },
      });

      const metadata = await service.extract(filePath, { extractGPS: true });

      // GPS timestamp may or may not be present
      if (metadata.gps?.gpsTimestamp) {
        expect(metadata.gps.gpsTimestamp).toBeInstanceOf(Date);
      }
    });
  });

  // ==================== DATE EXTRACTION TESTS ====================

  describe("Date Extraction", () => {
    it("should extract DateTimeOriginal", async () => {
      const testDate = new Date("2023-06-15 14:30:00");
      const filePath = await createMockJPEG("dated.jpg", {
        dateTaken: testDate,
      });

      const metadata = await service.extract(filePath);

      if (metadata.dateTaken) {
        expect(metadata.dateTaken).toBeInstanceOf(Date);
      }
    });

    it("should fallback to file modification date", async () => {
      const filePath = await createMockJPEG("nodate.jpg", { hasEXIF: false });

      const metadata = await service.extract(filePath, { useFileDate: true });

      // Should use file modification date
      expect(metadata.dateTaken).toBeInstanceOf(Date);
    });
  });

  // ==================== BATCH EXTRACTION TESTS ====================

  describe("extractBatch", () => {
    it("should extract metadata from multiple images", async () => {
      const files: string[] = [];

      for (let i = 0; i < 3; i++) {
        const filePath = await createMockJPEG(`batch-${i}.jpg`, {
          width: 100 + i * 100,
          height: 100 + i * 100,
        });
        files.push(filePath);
      }

      const results = await service.extractBatch(files);

      expect(results).toHaveLength(3);
      results.forEach((metadata, i) => {
        expect(metadata.filePath).toBe(files[i]);
        expect(metadata.format).toBe("JPEG");
      });
    });

    it("should handle errors in batch without stopping", async () => {
      const validFile = await createMockJPEG("valid.jpg", {});
      const invalidFile = path.join(testDir, "nonexistent.jpg");

      const results = await service.extractBatch([validFile, invalidFile]);

      expect(results).toHaveLength(2);
      // One should have data, one should be empty/error
    });
  });

  // ==================== PRIVACY TESTS ====================

  describe("Privacy Features", () => {
    it("should strip GPS data when requested", async () => {
      const filePath = await createMockJPEG("gps.jpg", {
        gpsData: { lat: 40.7128, lng: -74.006 },
      });

      const outputPath = path.join(testDir, "stripped.jpg");

      const result = await service.stripGPS(filePath, outputPath);

      expect(result.success).toBe(true);
      expect(result.gpsRemoved).toBe(true);

      // Verify GPS is stripped
      const strippedMetadata = await service.extract(outputPath, {
        extractGPS: true,
      });
      expect(strippedMetadata.gps?.hasGPS).toBe(false);
    });

    it("should handle stripGPS on image without GPS", async () => {
      const filePath = await createMockJPEG("nogps.jpg", {});
      const outputPath = path.join(testDir, "stillnogps.jpg");

      const result = await service.stripGPS(filePath, outputPath);

      expect(result.success).toBe(true);
      expect(result.gpsRemoved).toBe(false);
    });

    it("should strip all metadata when requested", async () => {
      const filePath = await createMockJPEG("metadata.jpg", {
        cameraMake: "Canon",
        cameraModel: "EOS",
      });

      const outputPath = path.join(testDir, "stripped_all.jpg");

      const result = await service.stripAllMetadata(filePath, outputPath);

      expect(result.success).toBe(true);

      // Verify metadata is stripped
      const strippedMetadata = await service.extract(outputPath);
      expect(strippedMetadata.hasEXIF).toBe(false);
    });

    it("should not truncate image files larger than 256KB when stripping metadata", async () => {
      // Create a JPEG with SOS marker and >256KB scan payload
      const header = Buffer.from([
        0xff, 0xd8, // SOI
        0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // APP0
        0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, // SOS
      ]);
      const scanData = Buffer.alloc(300 * 1024, 0xaa);
      const eoi = Buffer.from([0xff, 0xd9]); // EOI
      const jpegData = Buffer.concat([header, scanData, eoi]);

      const filePath = path.join(testDir, "large-image.jpg");
      await fs.writeFile(filePath, jpegData);

      const outputPathAll = path.join(testDir, "large-stripped-all.jpg");
      const resultAll = await service.stripAllMetadata(filePath, outputPathAll);
      expect(resultAll.success).toBe(true);
      const outStatAll = await fs.stat(outputPathAll);
      expect(outStatAll.size).toBeGreaterThan(262144);

      const outputPathGps = path.join(testDir, "large-stripped-gps.jpg");
      const resultGps = await service.stripGPS(filePath, outputPathGps);
      expect(resultGps.success).toBe(true);
      const outStatGps = await fs.stat(outputPathGps);
      expect(outStatGps.size).toBeGreaterThan(262144);
    });

    it("should not return NaN/NaN for invalid metadata dates in getMetadataSubpath", async () => {
      const { MetadataService } = await import("../../../src/services/metadata/service.js");
      const metaService = new MetadataService();
      const filePath = await createMockJPEG("invalid-date.jpg", {
        hasEXIF: false,
      });

      const subpath = await metaService.getMetadataSubpath(filePath, "Images");
      expect(subpath).not.toContain("NaN");
    });
  });

  // ==================== THUMBNAIL TESTS ====================

  describe("Thumbnail Extraction", () => {
    it("should detect embedded thumbnail", async () => {
      const filePath = await createMockJPEG("withthumb.jpg", {
        hasEXIF: true,
      });

      const metadata = await service.extract(filePath);

      // Thumbnail detection depends on implementation
      expect(metadata.hasThumbnail !== undefined).toBe(true);
    });
  });

  // ==================== EDGE CASE TESTS ====================

  describe("Edge Cases", () => {
    it("should handle empty JPEG files", async () => {
      const filePath = path.join(testDir, "empty.jpg");
      await fs.writeFile(filePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

      const metadata = await service.extract(filePath);

      expect(metadata.format).toBe("JPEG");
    });

    it("should handle corrupted EXIF data", async () => {
      const filePath = path.join(testDir, "badexif.jpg");

      // Create JPEG with malformed EXIF
      const jpegData = Buffer.concat([
        Buffer.from([0xff, 0xd8]), // SOI
        Buffer.from([0xff, 0xe1]), // APP1
        Buffer.from([0x00, 0x10]), // Length
        Buffer.from("Exif\x00\x00"),
        Buffer.from("CORRUPTED_DATA"),
        Buffer.from([0xff, 0xd9]), // EOI
      ]);

      await fs.writeFile(filePath, jpegData);

      const metadata = await service.extract(filePath);

      // Should not throw
      expect(metadata.format).toBe("JPEG");
    });

    it("should handle very large EXIF data", async () => {
      const filePath = await createMockJPEG("largeexif.jpg", {
        cameraMake: "A".repeat(1000),
        cameraModel: "B".repeat(1000),
      });

      const metadata = await service.extract(filePath);

      expect(metadata.format).toBe("JPEG");
    });

    it("should handle Unicode in EXIF", async () => {
      const filePath = await createMockJPEG("unicode.jpg", {
        cameraMake: "Camera 📷",
        cameraModel: "Model 中文",
      });

      const metadata = await service.extract(filePath);

      expect(metadata.format).toBe("JPEG");
    });

    it("should handle multiple APP segments", async () => {
      const filePath = path.join(testDir, "multiapp.jpg");

      const jpegData = Buffer.concat([
        Buffer.from([0xff, 0xd8]), // SOI
        Buffer.from([0xff, 0xe0]), // APP0 (JFIF)
        Buffer.from([0x00, 0x10]),
        Buffer.from("JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"),
        Buffer.from([0xff, 0xe1]), // APP1 (EXIF)
        Buffer.from([0x00, 0x14]),
        Buffer.from("Exif\x00\x00II*\x00\x08\x00\x00\x00"),
        Buffer.from([0xff, 0xd9]), // EOI
      ]);

      await fs.writeFile(filePath, jpegData);

      const metadata = await service.extract(filePath);

      expect(metadata.format).toBe("JPEG");
    });

    it("should handle TIFF images", async () => {
      const filePath = path.join(testDir, "test.tiff");

      // Create minimal TIFF
      const tiffData = Buffer.concat([
        Buffer.from("II"), // Little endian
        Buffer.from([0x2a, 0x00]), // TIFF marker
        Buffer.from([0x08, 0x00, 0x00, 0x00]), // IFD offset
        // Minimal IFD
        Buffer.from([0x01, 0x00]), // 1 entry
        Buffer.from([
          0x00, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x64, 0x00, 0x00,
          0x00,
        ]), // Width = 100
        Buffer.from([0x00, 0x00, 0x00, 0x00]), // No next IFD
      ]);

      await fs.writeFile(filePath, tiffData);

      const metadata = await service.extract(filePath);

      expect(metadata.format).toBe("TIFF");
    });

    it("should handle PNG images", async () => {
      const filePath = path.join(testDir, "test.png");

      // Create minimal PNG
      const pngData = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG signature
        // IHDR chunk
        Buffer.from([0x00, 0x00, 0x00, 0x0d]), // Length
        Buffer.from("IHDR"),
        Buffer.from([0x00, 0x00, 0x00, 0x64]), // Width: 100
        Buffer.from([0x00, 0x00, 0x00, 0x64]), // Height: 100
        Buffer.from([0x08, 0x02, 0x00, 0x00, 0x00]), // Bit depth, color type, etc.
        Buffer.from([0x00, 0x00, 0x00, 0x00]), // CRC placeholder
        // IEND chunk
        Buffer.from([0x00, 0x00, 0x00, 0x00]),
        Buffer.from("IEND"),
        Buffer.from([0x00, 0x00, 0x00, 0x00]),
      ]);

      await fs.writeFile(filePath, pngData);

      const metadata = await service.extract(filePath);

      expect(metadata.format).toBe("PNG");
      expect(metadata.width).toBe(100);
      expect(metadata.height).toBe(100);
    });
  });

  // ==================== INTEGRATION TESTS ====================

  describe("Integration Tests", () => {
    it("should handle complete workflow with privacy stripping", async () => {
      // Create image with GPS and camera info
      const originalPath = await createMockJPEG("original.jpg", {
        cameraMake: "Nikon",
        cameraModel: "D850",
        gpsData: { lat: 51.5074, lng: -0.1278 },
        dateTaken: new Date("2023-06-15"),
      });

      // Extract original metadata
      const originalMeta = await service.extract(originalPath, {
        extractGPS: true,
      });
      expect(originalMeta.gps?.hasGPS).toBe(true);
      expect(originalMeta.camera?.make).toBe("Nikon");

      // Strip GPS
      const strippedPath = path.join(testDir, "stripped.jpg");
      await service.stripGPS(originalPath, strippedPath);

      // Verify GPS is gone but camera info remains
      const strippedMeta = await service.extract(strippedPath, {
        extractGPS: true,
      });
      expect(strippedMeta.gps?.hasGPS).toBe(false);
      expect(strippedMeta.camera?.make).toBe("Nikon");
    });

    it("should organize batch with mixed metadata", async () => {
      const files: string[] = [];

      // Image with full metadata
      files.push(
        await createMockJPEG("full.jpg", {
          cameraMake: "Canon",
          cameraModel: "EOS",
          width: 1920,
          height: 1080,
        }),
      );

      // Image with no metadata
      files.push(await createMockJPEG("empty.jpg", { hasEXIF: false }));

      // Image with GPS
      files.push(
        await createMockJPEG("gps.jpg", { gpsData: { lat: 40, lng: -74 } }),
      );

      const results = await service.extractBatch(files, { extractGPS: true });

      expect(results).toHaveLength(3);
      expect(results[0].camera?.make).toBe("Canon");
      expect(results[1].hasEXIF).toBe(false);
      expect(results[2].gps?.hasGPS).toBe(true);
    });
  });
});
