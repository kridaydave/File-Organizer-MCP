/**
 * Regression test for BUG-30: HEIC photos sniff as MP4 because they share the ftyp box
 */

import fs from "fs/promises";
import path from "path";
import os from "os";
import { CategorizerService } from "../../../src/services/categorizer.service.js";

describe("BUG-30 HEIC sniffing", () => {
  let categorizer: CategorizerService;
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "bug30-heic-"));
    categorizer = new CategorizerService();
  });

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  const createFile = async (name: string, content: Buffer | string) => {
    const filePath = path.join(testDir, name);
    await fs.writeFile(filePath, content);
    return filePath;
  };

  it("categorizes HEIC with ftypheic as Images not Videos", async () => {
    const heicHeader = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]),
      Buffer.from("ftyp"),
      Buffer.from("heic"),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
    ]);
    const filePath = await createFile("photo.heic", heicHeader);

    const result = await categorizer.getCategoryByContent(filePath);

    expect(result.category).toBe("Images");
  });

  it("categorizes HEIC with ftypheix as Images not Videos", async () => {
    const heicHeader = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x1c]),
      Buffer.from("ftyp"),
      Buffer.from("heix"),
    ]);
    const filePath = await createFile("photo.heix.heic", heicHeader);

    const result = await categorizer.getCategoryByContent(filePath);

    expect(result.category).toBe("Images");
  });

  it("still categorizes valid MP4 as Videos", async () => {
    const mp4Header = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x20]),
      Buffer.from("ftyp"),
      Buffer.from("mp42"),
    ]);
    const filePath = await createFile("video.mp4", mp4Header);

    const result = await categorizer.getCategoryByContent(filePath);

    expect(result.category).toBe("Videos");
  });

  it("still categorizes MP4 with isom brand as Videos", async () => {
    const mp4Header = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]),
      Buffer.from("ftyp"),
      Buffer.from("isom"),
    ]);
    const filePath = await createFile("video2.mp4", mp4Header);

    const result = await categorizer.getCategoryByContent(filePath);

    expect(result.category).toBe("Videos");
  });
});
