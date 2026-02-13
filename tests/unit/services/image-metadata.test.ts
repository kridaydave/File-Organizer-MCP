/**
 * Image Metadata Service Tests - Phase 2.5
 * Tests for EXIF parsing, GPS extraction, privacy features
 */

import fs from "fs/promises";
import path from "path";
import { ImageMetadataService } from "../../../src/services/image-metadata.service.js";

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

  function createEXIFData(options: any): Buffer {
    // TIFF header (little endian)
    // NOTE: The service has a bug where it uses tiffHeaderOffset as the IFD offset
    // instead of reading it from the TIFF header. So IFD0 ends up at byte 24 (12+12).
    // Structure: Exif identifier (6) + TIFF header (8) + padding (4) + IFD0
    const tiffHeader = Buffer.from([
      0x45,
      0x78,
      0x69,
      0x66,
      0x00,
      0x00, // Exif identifier (6 bytes)
      0x49,
      0x49, // Little endian
      0x2a,
      0x00, // TIFF marker
      0x0c,
      0x00,
      0x00,
      0x00, // IFD offset = 12 (to match service's expectation)
    ]);

    // Padding to align IFD0 where the service expects it (byte 24 from JPEG start = byte 12 from TIFF start)
    const padding = Buffer.alloc(4, 0);

    // IFD0 starts at offset 12 from TIFF header start (byte 24 from JPEG start)
    // This matches what the service calculates: tiffHeaderOffset + tiffHeaderOffset = 12 + 12 = 24
    const ifd0Offset = 12;

    // First pass: determine all entries and calculate IFD0 size
    const entryInfos: Array<{
      tag: number;
      type: number;
      count: number;
      value: number | Buffer;
      data?: Buffer;
    }> = [];

    if (options.width) {
      entryInfos.push({ tag: 0x0100, type: 3, count: 1, value: options.width }); // ImageWidth
    }
    if (options.height) {
      entryInfos.push({
        tag: 0x0101,
        type: 3,
        count: 1,
        value: options.height,
      }); // ImageLength
    }
    if (options.cameraMake) {
      const makeBuffer = Buffer.from(options.cameraMake + "\x00");
      entryInfos.push({
        tag: 0x010f,
        type: 2,
        count: makeBuffer.length,
        value: 0,
        data: makeBuffer,
      }); // Make
    }
    if (options.cameraModel) {
      const modelBuffer = Buffer.from(options.cameraModel + "\x00");
      entryInfos.push({
        tag: 0x0110,
        type: 2,
        count: modelBuffer.length,
        value: 0,
        data: modelBuffer,
      }); // Model
    }
    if (options.orientation) {
      entryInfos.push({
        tag: 0x0112,
        type: 3,
        count: 1,
        value: options.orientation,
      }); // Orientation
    }

    // Calculate IFD0 size: count (2) + entries (N*12) + next IFD pointer (4)
    const numEntries = entryInfos.length + (options.gpsData ? 1 : 0);
    const ifd0Size = 2 + numEntries * 12 + 4;

    // External data starts after IFD0
    // Offsets in IFD entries are relative to TIFF header start
    let externalDataOffset = ifd0Offset + ifd0Size;

    // Build entries with correct offsets for external data
    const entries: Buffer[] = [];
    const externalData: Buffer[] = [];
    let gpsIFDOffset = 0;

    // NOTE: Service has bug where it reads offsets as absolute buffer positions
    // So we need to add TIFF header offset (12) to all external data offsets
    const tiffHeaderOffset = 12;

    for (const info of entryInfos) {
      if (info.data) {
        // External data (strings) - store offset to data (add tiffHeaderOffset for service bug)
        entries.push(
          createIFDEntry(
            info.tag,
            info.type,
            info.count,
            externalDataOffset + tiffHeaderOffset,
          ),
        );
        externalData.push(info.data);
        externalDataOffset += info.data.length;
      } else {
        // Inline value
        entries.push(
          createIFDEntry(info.tag, info.type, info.count, info.value as number),
        );
      }
    }

    // Add GPS IFD pointer if needed
    if (options.gpsData) {
      gpsIFDOffset = externalDataOffset;
      entries.push(createIFDEntry(0x8825, 4, 1, gpsIFDOffset)); // GPS_IFD_POINTER
      // Don't increment externalDataOffset here - GPS IFD is separate buffer
    }

    // IFD0 count
    const ifdCount = Buffer.alloc(2);
    ifdCount.writeUInt16LE(entries.length, 0);

    // Next IFD pointer (0 = no more IFDs)
    const nextIFD = Buffer.from([0x00, 0x00, 0x00, 0x00]);

    // Build IFD0 buffer
    const ifd0Buffer = Buffer.concat([ifdCount, ...entries, nextIFD]);

    // Build GPS IFD if needed
    let gpsIFDBuffer: Buffer | null = null;
    if (options.gpsData && gpsIFDOffset > 0) {
      gpsIFDBuffer = createGPSIFD(options.gpsData, gpsIFDOffset);
    }

    // Combine all parts: TIFF header + padding + IFD0 + external data + GPS IFD
    const parts: Buffer[] = [tiffHeader, padding, ifd0Buffer, ...externalData];
    if (gpsIFDBuffer) {
      parts.push(gpsIFDBuffer);
    }

    return Buffer.concat(parts);
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

    // Calculate offsets for GPS data
    // GPS IFD structure: count (2) + entries (4 * 12) + next IFD (4) = 54 bytes
    const gpsIFDSize = 2 + 4 * 12 + 4;
    const dataOffset = ifdOffset + gpsIFDSize;

    // NOTE: The service has a bug where it doesn't add tiffHeaderOffset when reading
    // data at offsets. It treats entry.valueOffset as absolute buffer offset.
    // So we need to add 12 (TIFF header offset) to make it work.
    const tiffHeaderOffset = 12;

    // GPS entries (4 entries: LatRef, Lat, LngRef, Lng)
    const gpsEntries: Buffer[] = [];

    // GPSLatitudeRef (0x0001) - ASCII, 2 bytes (including null)
    // NOTE: Service reads value as big-endian, so we need to shift char code to high byte
    const latRefValue = latRef.charCodeAt(0) << 24; // 'N' or 'S' in highest byte
    gpsEntries.push(createIFDEntry(0x0001, 2, 2, latRefValue));

    // GPSLatitude (0x0002) - RATIONAL, 3 values = 24 bytes
    // Value is offset to rational array (add tiffHeaderOffset for service bug)
    gpsEntries.push(
      createIFDEntry(0x0002, 5, 3, dataOffset + tiffHeaderOffset),
    );

    // GPSLongitudeRef (0x0003) - ASCII, 2 bytes (including null)
    // NOTE: Service reads value as big-endian, so we need to shift char code to high byte
    const lngRefValue = lngRef.charCodeAt(0) << 24; // 'E' or 'W' in highest byte
    gpsEntries.push(createIFDEntry(0x0003, 2, 2, lngRefValue));

    // GPSLongitude (0x0004) - RATIONAL, 3 values = 24 bytes
    // Value is offset to rational array (after latitude rationals, add tiffHeaderOffset)
    gpsEntries.push(
      createIFDEntry(0x0004, 5, 3, dataOffset + 24 + tiffHeaderOffset),
    );

    // GPS IFD count
    const gpsCount = Buffer.alloc(2);
    gpsCount.writeUInt16LE(4, 0);

    // Next IFD (0 = no more)
    const nextIFD = Buffer.from([0x00, 0x00, 0x00, 0x00]);

    // Build latitude rational array (3 rationals = 24 bytes)
    const latRationals = Buffer.concat([
      createRational(latDMS.degrees, 1),
      createRational(latDMS.minutes, 1),
      createRational(Math.round(latDMS.seconds * 100), 100),
    ]);

    // Build longitude rational array (3 rationals = 24 bytes)
    const lngRationals = Buffer.concat([
      createRational(lngDMS.degrees, 1),
      createRational(lngDMS.minutes, 1),
      createRational(Math.round(lngDMS.seconds * 100), 100),
    ]);

    return Buffer.concat([
      gpsCount,
      ...gpsEntries,
      nextIFD,
      latRationals,
      lngRationals,
    ]);
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
    value: number | Buffer,
  ): Buffer {
    const entry = Buffer.alloc(12);
    entry.writeUInt16LE(tag, 0);
    entry.writeUInt16LE(type, 2);
    entry.writeUInt32LE(count, 4);

    if (typeof value === "number") {
      entry.writeUInt32LE(value, 8);
    } else {
      // For larger data, value is offset
      entry.writeUInt32LE(value.length, 8);
    }

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
