import fs from "fs/promises";

import path from "path";
import os from "os";
import { OrganizerService } from "../../../src/services/organizer.service.js";
import { CategorizerService } from "../../../src/services/categorizer.service.js";
import { FileWithSize } from "../../../src/types.js";

describe("OrganizerService", () => {
  let organizer: OrganizerService;
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-organizer-"));
    organizer = new OrganizerService(new CategorizerService());
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.error("Cleanup error:", error);
    }
  });

  describe("generateOrganizationPlan", () => {
    it("should plan moves correctly based on categories", async () => {
      const files: FileWithSize[] = [
        {
          name: "pic.jpg",
          path: path.join(testDir, "pic.jpg"),
          size: 100,
          modified: new Date(),
        },
        {
          name: "doc.pdf",
          path: path.join(testDir, "doc.pdf"),
          size: 200,
          modified: new Date(),
        },
      ];

      const plan = await organizer.generateOrganizationPlan(testDir, files);

      expect(plan.moves.length).toBe(2);

      const jpgMove = plan.moves.find((m) => m.source.endsWith("pic.jpg"));
      expect(jpgMove?.destination).toContain("Images");
      expect(jpgMove?.category).toBe("Images");

      const pdfMove = plan.moves.find((m) => m.source.endsWith("doc.pdf"));
      expect(pdfMove?.destination).toContain("Documents");
    });

    it("should handle conflict strategy: rename", async () => {
      const imagesDir = path.join(testDir, "Images");
      await fs.mkdir(imagesDir, { recursive: true });

      // TOCTOU-FIX: We no longer check disk for conflicts in planning phase
      // The plan only tracks batch-internal collisions
      // Disk conflicts are handled at execution time
      const files: FileWithSize[] = [
        {
          name: "pic.jpg",
          path: path.join(testDir, "pic.jpg"),
          size: 100,
          modified: new Date(),
        },
      ];

      // Strategy is 'rename' by default
      const plan = await organizer.generateOrganizationPlan(
        testDir,
        files,
        "rename",
      );

      const move = plan.moves[0];
      if (!move) throw new Error("Expected a move");

      // Plan doesn't detect disk conflicts (TOCTOU-free), only batch-internal
      expect(move.hasConflict).toBe(false);
      // Execution will handle disk conflicts at runtime
    });

    it("should handle conflict strategy: skip", async () => {
      const imagesDir = path.join(testDir, "Images");
      await fs.mkdir(imagesDir, { recursive: true });

      // TOCTOU-FIX: We no longer check disk for conflicts in planning phase
      const files: FileWithSize[] = [
        {
          name: "pic.jpg",
          path: path.join(testDir, "pic.jpg"),
          size: 100,
          modified: new Date(),
        },
      ];

      const plan = await organizer.generateOrganizationPlan(
        testDir,
        files,
        "skip",
      );

      const move = plan.moves[0];
      if (!move) throw new Error("Expected a move");

      // Plan doesn't detect disk conflicts - execution handles them
      expect(move.hasConflict).toBe(false);
    });

    it("should handle conflict strategy: skip", async () => {
      const imagesDir = path.join(testDir, "Images");
      await fs.mkdir(imagesDir, { recursive: true });
      await fs.writeFile(path.join(imagesDir, "pic.jpg"), "existing");

      const files: FileWithSize[] = [
        {
          name: "pic.jpg",
          path: path.join(testDir, "pic.jpg"),
          size: 100,
          modified: new Date(),
        },
      ];

      const plan = await organizer.generateOrganizationPlan(
        testDir,
        files,
        "skip",
      );

      const move = plan.moves[0];
      if (!move) throw new Error("Expected a move");

      // Plan doesn't detect disk conflicts - execution handles them
      expect(move.hasConflict).toBe(false);
      // But the strategy is recorded for execution phase to use
      expect(move.conflictResolution).toBe("skip");
    });
  });
});
