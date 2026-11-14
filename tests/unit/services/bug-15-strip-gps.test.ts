/**
 * Regression test for BUG-15
 * stripGPS must actually remove GPS data so it is not recoverable
 */

import fs from "fs/promises";
import path from "path";
import os from "os";
import { stripGPS } from "../../../src/services/metadata/image-privacy.js";
import { ImageMetadataService } from "../../../src/services/metadata/image.js";

describe("BUG-15: stripGPS removes GPS data completely", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "bug15-test-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

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

  function createGPSIFD(
    gpsData: { lat: number; lng: number },
    ifdOffset: number,
  ): Buffer {
    const latDMS = decimalToDMS(Math.abs(gpsData.lat));
    const lngDMS = decimalToDMS(Math.abs(gpsData.lng));
    const latRef = gpsData.lat >= 0 ? "N" : "S";
    const lngRef = gpsData.lng >= 0 ? "E" : "W";

    const gpsIFDSize = 2 + 4 * 12 + 4;
    const rationalBase = ifdOffset + gpsIFDSize;

    const refValue = (c: string) => c.charCodeAt(0);

    const gpsEntries = [
      createIFDEntry(0x0001, 2, 2, refValue(latRef)),
      createIFDEntry(0x0002, 5, 3, rationalBase),
      createIFDEntry(0x0003, 2, 2, refValue(lngRef)),
      createIFDEntry(0x0004, 5, 3, rationalBase + 24),
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

  function createEXIFData(options: { gpsData?: { lat: number; lng: number } }): Buffer {
    const exifIdentifier = Buffer.from("Exif\x00\x00", "ascii");
    const tiffHeader = Buffer.from([
      0x49,
      0x49,
      0x2a,
      0x00,
      0x08,
      0x00,
      0x00,
      0x00,
    ]);

    const entryInfos: Array<{
      tag: number;
      type: number;
      count: number;
      value?: number;
      data?: Buffer;
    }> = [];

    const numEntries = entryInfos.length + (options.gpsData ? 1 : 0);
    const ifd0Offset = 8;
    const ifd0Size = 2 + numEntries * 12 + 4;
    let externalOffset = ifd0Offset + ifd0Size;

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
      ...(gpsIFDBuffer ? [gpsIFDBuffer] : []),
    ]);
  }

  async function createMockJPEG(
    fileName: string,
    gpsData?: { lat: number; lng: number },
  ): Promise<string> {
    const filePath = path.join(testDir, fileName);
    let jpegData = Buffer.from([0xff, 0xd8]);

    if (gpsData) {
      const exifData = createEXIFData({ gpsData });
      const app1Marker = Buffer.from([0xff, 0xe1]);
      const app1Length = Buffer.alloc(2);
      app1Length.writeUInt16BE(exifData.length + 2, 0);
      jpegData = Buffer.concat([jpegData, app1Marker, app1Length, exifData]);
    }

    const sof0Data = Buffer.concat([
      Buffer.from([0xff, 0xc0]),
      Buffer.from([0x00, 0x0b]),
      Buffer.from([0x08]),
      Buffer.from([0x00, 0x64]),
      Buffer.from([0x00, 0x64]),
      Buffer.from([0x01, 0x01, 0x11, 0x00]),
    ]);
    const eoi = Buffer.from([0xff, 0xd9]);
    jpegData = Buffer.concat([jpegData, sof0Data, eoi]);
    await fs.writeFile(filePath, jpegData);
    return filePath;
  }

  it("removes GPS bytes so they are not recoverable", async () => {
    const inputPath = await createMockJPEG("gps.jpg", { lat: 40.7128, lng: -74.006 });
    const outputPath = path.join(testDir, "stripped.jpg");

    const result = await stripGPS(inputPath, outputPath);

    expect(result.success).toBe(true);
    expect(result.gpsRemoved).toBe(true);

    const service = new ImageMetadataService();
    const strippedMetadata = await service.extract(outputPath, {
      extractGPS: true,
    });
    expect(strippedMetadata.gps?.hasGPS).toBe(false);

    const outputBuffer = await fs.readFile(outputPath);
    // GPS IFD tag 0x8825 should not be present as a pointer
    // and GPS tags should not be recoverable
    expect(outputBuffer.includes(Buffer.from([0x25, 0x88]))).toBe(false);
  });
});
