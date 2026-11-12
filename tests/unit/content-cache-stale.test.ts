import fs from "fs/promises";
import path from "path";
import { CategorizerService } from "../../src/services/categorizer.service.js";

describe("Content cache staleness (BUG-32)", () => {
  let categorizer: CategorizerService;
  let testDir: string;

  beforeEach(async () => {
    // Inside the project so the path validator allows content sniffing
    const baseDir = path.join(process.cwd(), "tests", "temp");
    await fs.mkdir(baseDir, { recursive: true });
    testDir = await fs.mkdtemp(path.join(baseDir, "bug32-test-"));
    categorizer = new CategorizerService();
  });

  afterEach(async () => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // ignore
    }
    categorizer.destroy();
  });

  it("re-analyzes file after content changes", async () => {
    const filePath = path.join(testDir, "testfile.bin");
    await fs.writeFile(filePath, Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]));
    const first = await categorizer.waitForContentAnalysis(path.basename(filePath), filePath);
    expect(first).toBe("Documents");

    await fs.writeFile(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const second = await categorizer.waitForContentAnalysis(path.basename(filePath), filePath);
    expect(second).toBe("Images");
  });
});
