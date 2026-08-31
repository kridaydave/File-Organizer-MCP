import fs from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";
import { readFile } from "../../../../src/core/io/read-file.js";
import { isSensitiveFile } from "../../../../src/core/io/sensitive-files.js";
import { PathValidatorService } from "../../../../src/services/path-validator.service.js";

describe("core/io readFile", () => {
  let testDir: string;
  let validator: PathValidatorService;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-io-"));
    validator = new PathValidatorService(testDir, [testDir]);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("reads a text file as utf-8 by default", async () => {
    const file = path.join(testDir, "hello.txt");
    await fs.writeFile(file, "hello world");

    const result = await readFile(file, { validator });

    expect(result.data).toBe("hello world");
    expect(result.bytesRead).toBe(11);
    expect(result.totalSize).toBe(11);
    expect(result.mimeType).toBe("text/plain");
  });

  it("returns a Buffer when encoding is null", async () => {
    const file = path.join(testDir, "raw.bin");
    await fs.writeFile(file, Buffer.from([1, 2, 3]));

    const result = await readFile(file, { validator, encoding: null });

    expect(Buffer.isBuffer(result.data)).toBe(true);
    expect((result.data as Buffer).equals(Buffer.from([1, 2, 3]))).toBe(true);
  });

  it("computes sha256 of the returned bytes", async () => {
    const content = "checksum me";
    const file = path.join(testDir, "c.txt");
    await fs.writeFile(file, content);

    const result = await readFile(file, { validator });
    const expected = crypto.createHash("sha256").update(content).digest("hex");

    expect(result.checksum).toBe(expected);
  });

  it("skips checksum when asked", async () => {
    const file = path.join(testDir, "nochecksum.txt");
    await fs.writeFile(file, "x");

    const result = await readFile(file, { validator, checksum: false });

    expect(result.checksum).toBeUndefined();
  });

  it("honors offset", async () => {
    const file = path.join(testDir, "slice.txt");
    await fs.writeFile(file, "abcdefgh");

    // maxBytes caps total file size; a slice is taken via offset only.
    const offsetResult = await readFile(file, { validator, offset: 2 });
    expect(offsetResult.data).toBe("cdefgh");
    expect(offsetResult.bytesRead).toBe(6);
    expect(offsetResult.totalSize).toBe(8);
  });

  it("rejects files over maxBytes", async () => {
    const file = path.join(testDir, "big.txt");
    await fs.writeFile(file, "a".repeat(100));

    await expect(
      readFile(file, { validator, maxBytes: 10 }),
    ).rejects.toMatchObject({
      code: "E_FILE_TOO_LARGE",
    });
  });

  it("rejects an offset past the end of the file", async () => {
    const file = path.join(testDir, "short.txt");
    await fs.writeFile(file, "abc");

    await expect(
      readFile(file, { validator, offset: 10 }),
    ).rejects.toMatchObject({
      code: "E_READ_OFFSET",
    });
  });

  it("handles 0-byte files with offset 0 without throwing", async () => {
    const file = path.join(testDir, "empty.txt");
    await fs.writeFile(file, "");

    const result = await readFile(file, { validator });
    expect(result.data).toBe("");
    expect(result.bytesRead).toBe(0);
    expect(result.totalSize).toBe(0);
  });

  it("blocks sensitive files without leaking the path", async () => {
    const file = path.join(testDir, ".env");
    await fs.writeFile(file, "SECRET=1");

    await expect(readFile(file, { validator })).rejects.toMatchObject({
      code: "E_SENSITIVE_FILE",
    });
    try {
      await readFile(file, { validator });
    } catch (error) {
      const err = error as Error;
      expect(err.message).not.toContain(testDir);
      expect(err.message).toMatch(/sensitive pattern/);
    }
  });

  it("caps maxBytes at 100MB", async () => {
    const file = path.join(testDir, "cap.txt");
    await fs.writeFile(file, "ok");

    // A huge requested limit must not throw for a small file.
    const result = await readFile(file, { validator, maxBytes: Number.MAX_SAFE_INTEGER });
    expect(result.data).toBe("ok");
  });

  it("rejects paths outside allowed directories", async () => {
    const outside = path.join(os.tmpdir(), "..", "definitely-not-allowed-xyz");
    await expect(readFile(outside)).rejects.toThrow();
  });
});

describe("core/io sensitive patterns", () => {
  it.each([
    "/home/user/.env",
    "/home/user/.env.production",
    "/home/user/.env::$DATA",
    "/home/user/%2e%65%6e%76",
    "/home/user/.ssh/id_rsa",
    "/home/user/server.pem",
    "/home/user/aws-credentials.json",
    "/home/user/.aws/credentials",
    "/home/user/.ssh",
    "/home/user/.gnupg/secring.gpg",
    "/home/user/.kube/config",
    "/home/user/.docker/config.json",
    "/etc/shadow",
    "/home/user/api_key.txt",
  ])("flags %s", (p) => {
    expect(isSensitiveFile(p)).toBe(true);
  });

  it.each([
    "/home/user/report.pdf",
    "/home/user/src/index.ts",
    "/home/user/photos/cat.jpg",
    "",
  ])("allows %s", (p) => {
    expect(isSensitiveFile(p)).toBe(false);
  });
});
