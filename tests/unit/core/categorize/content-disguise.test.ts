import fs from "fs/promises";
import path from "path";
import { CategorizerService } from "../../../../src/services/categorizer.service.js";

describe("getCategoryByContent disguised executable as .txt", () => {
  let testDir: string;
  let baseTempDir: string;

  beforeEach(async () => {
    baseTempDir = path.join(process.cwd(), "tests", "temp");
    await fs.mkdir(baseTempDir, { recursive: true });
    testDir = await fs.mkdtemp(
      path.join(baseTempDir, "test-content-disguise-"),
    );
  });

  afterEach(async () => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("routes notes.txt with MZ bytes to Suspicious", async () => {
    const categorizer = new CategorizerService();
    const filePath = path.join(testDir, "notes.txt");
    await fs.writeFile(filePath, Buffer.from([0x4d, 0x5a]));

    const result = await categorizer.getCategoryByContent(filePath);

    expect(result.category).toBe("Suspicious");
    expect(result.warnings.some((w: string) => w.includes("CRITICAL"))).toBe(true);
    categorizer.destroy();
  });
});