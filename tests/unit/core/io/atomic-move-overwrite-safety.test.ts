/**
 * Regression test for BUG-05: overwrite must not delete destination before copying source
 */

import fs from "fs/promises";
import path from "path";
import os from "os";
import { safeAtomicMove } from "../../../../src/core/io/atomic-move.js";

describe("BUG-05 atomic move overwrite safety", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-move-bug05-"));
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("keeps destination intact if source is missing when overwriting", async () => {
    const sourcePath = path.join(tempDir, "missing-source.txt");
    const destPath = path.join(tempDir, "dest.txt");
    const originalContent = "keep me";

    await fs.writeFile(destPath, originalContent);

    await expect(
      safeAtomicMove(sourcePath, destPath, { overwrite: true }),
    ).rejects.toThrow();

    const content = await fs.readFile(destPath, "utf8");
    expect(content).toBe(originalContent);
  });

  it("keeps destination intact if source cannot be copied when overwriting", async () => {
    const sourcePath = path.join(tempDir, "unreadable-source");
    const destPath = path.join(tempDir, "dest.txt");
    const originalContent = "important data";

    await fs.writeFile(destPath, originalContent);
    // A directory as source makes copyFile fail regardless of privileges.
    await fs.mkdir(sourcePath);

    await expect(
      safeAtomicMove(sourcePath, destPath, { overwrite: true }),
    ).rejects.toThrow();

    const content = await fs.readFile(destPath, "utf8");
    expect(content).toBe(originalContent);
  });
});
