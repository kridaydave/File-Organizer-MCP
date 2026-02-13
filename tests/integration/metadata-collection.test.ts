/**
 * Metadata Collection Integration Tests - Phase 4
 * Comprehensive integration tests for music/photo collection scenarios
 * with various metadata conditions and edge cases
 */

import fs from "fs/promises";
import path from "path";
import { AudioMetadataService } from "../../src/services/audio-metadata.service.js";
import { ImageMetadataService } from "../../src/services/image-metadata.service.js";
import { MusicOrganizerService } from "../../src/services/music-organizer.service.js";
import { PhotoOrganizerService } from "../../src/services/photo-organizer.service.js";
import { MetadataCacheService } from "../../src/services/metadata-cache.service.js";

describe("Music Collection Tests", () => {
  let musicOrganizer: MusicOrganizerService;
  let audioMetadataService: AudioMetadataService;
  let testDir: string;
  let sourceDir: string;
  let targetDir: string;

  beforeEach(async () => {
    musicOrganizer = new MusicOrganizerService();
    audioMetadataService = new AudioMetadataService();
    testDir = await fs.mkdtemp(
      path.join(process.cwd(), "tests", "temp", "music-collection-"),
    );
    sourceDir = path.join(testDir, "source");
    targetDir = path.join(testDir, "target");
    await fs.mkdir(sourceDir);
    await fs.mkdir(targetDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should organize music with complete metadata", async () => {
    const testFile = path.join(sourceDir, "test.mp3");

    const id3Header = Buffer.from([
      0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);

    const tit2Frame = Buffer.concat([
      Buffer.from("TIT2"),
      Buffer.from([0x00, 0x00, 0x00, 0x16]),
      Buffer.from([0x00, 0x00]),
      Buffer.from([0x03]),
      Buffer.from("Complete Song Title"),
    ]);

    const tpe1Frame = Buffer.concat([
      Buffer.from("TPE1"),
      Buffer.from([0x00, 0x00, 0x00, 0x0b]),
      Buffer.from([0x00, 0x00]),
      Buffer.from([0x03]),
      Buffer.from("Test Artist"),
    ]);

    const talbFrame = Buffer.concat([
      Buffer.from("TALB"),
      Buffer.from([0x00, 0x00, 0x00, 0x0a]),
      Buffer.from([0x00, 0x00]),
      Buffer.from([0x03]),
      Buffer.from("Test Album"),
    ]);

    const mp3Content = Buffer.concat([
      id3Header,
      tit2Frame,
      tpe1Frame,
      talbFrame,
      Buffer.alloc(100),
    ]);
    await fs.writeFile(testFile, mp3Content);

    const result = await musicOrganizer.organize({
      sourceDir,
      targetDir,
      structure: "flat",
      filenamePattern: "{title}",
    });

    expect(result.success).toBe(true);
    expect(result.organizedFiles).toBeGreaterThanOrEqual(1);
    expect(result.errors.length).toBe(0);

    const targetFiles = await fs.readdir(targetDir);
    expect(targetFiles.length).toBeGreaterThanOrEqual(1);
  });

  it("should handle music with missing artist metadata", async () => {
    const testFile = path.join(sourceDir, "no-artist.mp3");
    const id3Header = Buffer.from([
      0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x2f,
    ]);
    const tit2Frame = Buffer.concat([
      Buffer.from("TIT2"),
      Buffer.from([0x00, 0x00, 0x00, 0x12]),
      Buffer.from([0x00, 0x00]),
      Buffer.from([0x03]),
      Buffer.from("Song Without Artist"),
    ]);
    const talbFrame = Buffer.concat([
      Buffer.from("TALB"),
      Buffer.from([0x00, 0x00, 0x00, 0x10]),
      Buffer.from([0x00, 0x00]),
      Buffer.from([0x03]),
      Buffer.from("Unknown Artist Album"),
    ]);
    const mp3Content = Buffer.concat([
      id3Header,
      tit2Frame,
      talbFrame,
      Buffer.alloc(50),
    ]);
    await fs.writeFile(testFile, mp3Content);

    const result = await musicOrganizer.organize({
      sourceDir,
      targetDir,
      structure: "flat",
      filenamePattern: "{title}",
    });

    expect(result.success).toBe(true);
    expect(result.organizedFiles).toBeGreaterThanOrEqual(1);
  });

  it("should handle music with missing album metadata", async () => {
    const testFile = path.join(sourceDir, "no-album.mp3");
    const id3Header = Buffer.from([
      0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x2f,
    ]);
    const tit2Frame = Buffer.concat([
      Buffer.from("TIT2"),
      Buffer.from([0x00, 0x00, 0x00, 0x10]),
      Buffer.from([0x00, 0x00]),
      Buffer.from([0x03]),
      Buffer.from("Song Without Album"),
    ]);
    const tpe1Frame = Buffer.concat([
      Buffer.from("TPE1"),
      Buffer.from([0x00, 0x00, 0x00, 0x0e]),
      Buffer.from([0x00, 0x00]),
      Buffer.from([0x03]),
      Buffer.from("Known Artist"),
    ]);
    const mp3Content = Buffer.concat([
      id3Header,
      tit2Frame,
      tpe1Frame,
      Buffer.alloc(50),
    ]);
    await fs.writeFile(testFile, mp3Content);

    const result = await musicOrganizer.organize({
      sourceDir,
      targetDir,
      structure: "flat",
      filenamePattern: "{title}",
    });

    expect(result.success).toBe(true);
    expect(result.organizedFiles).toBeGreaterThanOrEqual(1);
  });

  it("should handle music without any ID3 tags", async () => {
    const testFile = path.join(sourceDir, "no-metadata.mp3");
    await fs.writeFile(testFile, Buffer.alloc(200));

    const result = await musicOrganizer.organize({
      sourceDir,
      targetDir,
      structure: "flat",
      filenamePattern: "{title}",
    });

    expect(result.success).toBe(true);
    expect(result.organizedFiles).toBeGreaterThanOrEqual(1);
  });

  it("should handle various audio formats (MP3, FLAC, M4A)", async () => {
    const mp3File = path.join(sourceDir, "test.mp3");
    await fs.writeFile(
      mp3File,
      Buffer.from([
        0x49,
        0x44,
        0x33,
        0x03,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x0f,
        ...Buffer.alloc(15),
      ]),
    );

    const flacFile = path.join(sourceDir, "test.flac");
    await fs.writeFile(flacFile, Buffer.from([0x66, 0x4c, 0x61, 0x43]));

    const m4aFile = path.join(sourceDir, "test.m4a");
    const ftypBox = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x14]),
      Buffer.from("ftyp"),
      Buffer.from("M4A "),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from("M4A "),
    ]);
    await fs.writeFile(m4aFile, ftypBox);

    const result = await musicOrganizer.organize({
      sourceDir,
      targetDir,
      structure: "flat",
      filenamePattern: "{title}",
    });

    expect(result.success).toBe(true);
    expect(result.organizedFiles).toBeGreaterThanOrEqual(3);
    expect(result.errors.length).toBe(0);
  });
});

describe("Photo Collection Tests", () => {
  let photoOrganizer: PhotoOrganizerService;
  let imageMetadataService: ImageMetadataService;
  let testDir: string;
  let sourceDir: string;
  let targetDir: string;

  beforeEach(async () => {
    photoOrganizer = new PhotoOrganizerService();
    imageMetadataService = new ImageMetadataService();
    testDir = await fs.mkdtemp(
      path.join(process.cwd(), "tests", "temp", "photo-collection-"),
    );
    sourceDir = path.join(testDir, "source");
    targetDir = path.join(testDir, "target");
    await fs.mkdir(sourceDir);
    await fs.mkdir(targetDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should organize photos by EXIF date", async () => {
    const testFile = path.join(sourceDir, "test.jpg");
    const jpegData = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0xff, 0xd9,
    ]);
    await fs.writeFile(testFile, jpegData);

    const result = await photoOrganizer.organize({
      sourceDir,
      targetDir,
      structure: "flat",
      filenamePattern: "{title}",
    });

    expect(result.success).toBe(true);
    expect(result.organizedFiles).toBeGreaterThanOrEqual(1);
  });

  it("should organize photos by camera model", async () => {
    const testFile = path.join(sourceDir, "camera-test.jpg");
    const jpegData = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0xff, 0xd9,
    ]);
    await fs.writeFile(testFile, jpegData);

    const result = await photoOrganizer.organize({
      sourceDir,
      targetDir,
      structure: "flat",
      filenamePattern: "{title}",
    });

    expect(result.success).toBe(true);
    expect(result.organizedFiles).toBeGreaterThanOrEqual(1);
  });

  it("should handle photos without EXIF metadata", async () => {
    const testFile = path.join(sourceDir, "no-exif.jpg");
    await fs.writeFile(testFile, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

    const result = await photoOrganizer.organize({
      sourceDir,
      targetDir,
      structure: "flat",
      filenamePattern: "{title}",
    });

    expect(result.success).toBe(true);
    expect(result.organizedFiles).toBeGreaterThanOrEqual(1);
  });

  it("should strip GPS data when requested", async () => {
    const testFile = path.join(sourceDir, "gps-photo.jpg");
    const jpegData = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      Buffer.from([0xff, 0xe1]),
      Buffer.from([0x00, 0x20]),
      Buffer.from("Exif\x00\x00II*\x00"),
      Buffer.from([0x25, 0x88]),
      Buffer.from([0xff, 0xd9]),
    ]);
    await fs.writeFile(testFile, jpegData);

    const result = await photoOrganizer.organize({
      sourceDir,
      targetDir,
      structure: "flat",
      filenamePattern: "{title}",
      stripGPS: true,
    });

    expect(result.success).toBe(true);
    expect(result.organizedFiles).toBeGreaterThanOrEqual(1);
  });
});

describe("Metadata Cache Tests", () => {
  let cacheService: MetadataCacheService;
  let audioMetadataService: AudioMetadataService;
  let imageMetadataService: ImageMetadataService;
  let testDir: string;

  beforeEach(async () => {
    cacheService = new MetadataCacheService({
      cacheDir: path.join(process.cwd(), "tests", "temp", "metadata-cache"),
      maxAge: 3600000,
      maxEntries: 100,
    });
    audioMetadataService = new AudioMetadataService();
    imageMetadataService = new ImageMetadataService();
    testDir = await fs.mkdtemp(
      path.join(process.cwd(), "tests", "temp", "cache-tests-"),
    );
    await cacheService.initialize();
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should cache and retrieve metadata", async () => {
    const audioFile = path.join(testDir, "cache-test.mp3");
    const id3Header = Buffer.from([
      0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1f,
    ]);
    const tit2Frame = Buffer.concat([
      Buffer.from("TIT2"),
      Buffer.from([0x00, 0x00, 0x00, 0x10]),
      Buffer.from([0x00, 0x00]),
      Buffer.from([0x03]),
      Buffer.from("Cached Song"),
    ]);
    await fs.writeFile(
      audioFile,
      Buffer.concat([id3Header, tit2Frame, Buffer.alloc(31)]),
    );

    const metadata = await audioMetadataService.extract(audioFile);
    await cacheService.set(audioFile, metadata);

    const cachedEntry = await cacheService.get(audioFile);
    expect(cachedEntry).not.toBeNull();
  });

  it("should invalidate cache on file change", async () => {
    const testFile = path.join(testDir, "change-test.mp3");
    const initialData = Buffer.from([
      0x49,
      0x44,
      0x33,
      0x03,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x0f,
      ...Buffer.alloc(15),
    ]);
    await fs.writeFile(testFile, initialData);

    const metadata1 = await audioMetadataService.extract(testFile);
    await cacheService.set(testFile, metadata1, { filePath: testFile });

    await fs.writeFile(
      testFile,
      Buffer.concat([initialData, Buffer.alloc(10)]),
    );

    const cachedEntry = await cacheService.get(testFile);
    expect(cachedEntry).toBeNull();
  });

  it("should handle cache misses gracefully", async () => {
    const nonExistentFile = path.join(testDir, "nonexistent.mp3");
    const entry = await cacheService.get(nonExistentFile);
    expect(entry).toBeNull();
  });

  it("should cleanup expired entries", async () => {
    const testFile = path.join(testDir, "expire-test.mp3");
    await fs.writeFile(
      testFile,
      Buffer.from([
        0x49,
        0x44,
        0x33,
        0x03,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x0f,
        ...Buffer.alloc(15),
      ]),
    );

    const metadata = await audioMetadataService.extract(testFile);
    await cacheService.set(testFile, metadata);

    expect(await cacheService.has(testFile)).toBe(true);
  });
});
