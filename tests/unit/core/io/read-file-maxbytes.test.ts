import fs from "fs/promises";
import os from "os";
import path from "path";
import { readFile } from "../../../../src/core/io/read-file.js";
import { PathValidatorService } from "../../../../src/services/path-validator.service.js";

describe("core/io readFile maxBytes validation", () => {
  let testDir: string;
  let validator: PathValidatorService;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-io-maxbytes-"));
    validator = new PathValidatorService(testDir, [testDir]);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("rejects negative maxBytes", async () => {
    const file = path.join(testDir, "neg.txt");
    await fs.writeFile(file, "hello");

    await expect(readFile(file, { validator, maxBytes: -5 })).rejects.toThrow(
      /maxBytes/,
    );
  });

  it("rejects NaN maxBytes", async () => {
    const file = path.join(testDir, "nan.txt");
    await fs.writeFile(file, "hello");

    await expect(readFile(file, { validator, maxBytes: NaN })).rejects.toThrow(
      /maxBytes/,
    );
  });

  it("rejects Infinity maxBytes", async () => {
    const file = path.join(testDir, "inf.txt");
    await fs.writeFile(file, "hello");

    await expect(
      readFile(file, { validator, maxBytes: Infinity }),
    ).rejects.toThrow(/maxBytes/);
    await expect(
      readFile(file, { validator, maxBytes: -Infinity }),
    ).rejects.toThrow(/maxBytes/);
  });

  it("rejects non-integer maxBytes", async () => {
    const file = path.join(testDir, "float.txt");
    await fs.writeFile(file, "hello");

    await expect(readFile(file, { validator, maxBytes: 1.5 })).rejects.toThrow(
      /maxBytes/,
    );
  });

  it("rejects oversized maxBytes over cap behavior is still safe and normal values work", async () => {
    const file = path.join(testDir, "normal.txt");
    await fs.writeFile(file, "ok");

    const result = await readFile(file, { validator, maxBytes: 10 });
    expect(result.data).toBe("ok");
  });
});
