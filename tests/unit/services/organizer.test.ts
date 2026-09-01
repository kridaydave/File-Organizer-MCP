import fs from "fs/promises";

import path from "path";
import os from "os";
import { OrganizerService } from "../../../src/core/organize/organizer.js";
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

  describe("executeOrganization", () => {
    it("should backup existing destination file before overwrite", async () => {
      const srcFile = path.join(testDir, "report.pdf");
      await fs.writeFile(srcFile, "new-content");

      const docsDir = path.join(testDir, "Documents");
      await fs.mkdir(docsDir, { recursive: true });
      const destFile = path.join(docsDir, "report.pdf");
      await fs.writeFile(destFile, "old-content");

      const files: FileWithSize[] = [
        {
          name: "report.pdf",
          path: srcFile,
          size: 11,
          modified: new Date(),
        },
      ];

      const result = await organizer.organize(testDir, files, {
        dryRun: false,
        conflictStrategy: "overwrite",
      });
      expect(result.errors).toHaveLength(0);
      expect(result.actions).toHaveLength(1);

      // Verify destination has new content
      const finalContent = await fs.readFile(destFile, "utf-8");
      expect(finalContent).toBe("new-content");

      // Verify backup directory contains the old file
      const backupDir = path.join(process.cwd(), ".file-organizer-backups");
      const backupFiles = await fs.readdir(backupDir);
      const overwriteBackup = backupFiles.find((f) => f.includes("overwrite_report.pdf"));
      expect(overwriteBackup).toBeDefined();

      if (overwriteBackup) {
        const backupContent = await fs.readFile(
          path.join(backupDir, overwriteBackup),
          "utf-8",
        );
        expect(backupContent).toBe("old-content");
      }
    });

    it("should correctly rename files with numeric suffixes on conflict", async () => {
      const srcFile = path.join(testDir, "invoice_2024.pdf");
      await fs.writeFile(srcFile, "invoice 2024 content");

      const docsDir = path.join(testDir, "Documents");
      await fs.mkdir(docsDir, { recursive: true });
      const destFile = path.join(docsDir, "invoice_2024.pdf");
      await fs.writeFile(destFile, "existing invoice 2024");

      const files: FileWithSize[] = [
        {
          name: "invoice_2024.pdf",
          path: srcFile,
          size: 20,
          modified: new Date(),
        },
      ];

      const result = await organizer.organize(testDir, files, {
        dryRun: false,
        conflictStrategy: "rename",
      });

      expect(result.errors).toHaveLength(0);
      expect(result.actions).toHaveLength(1);
      expect(path.basename(result.actions[0].to)).toBe("invoice_2024_1.pdf");
    });

    it("should correctly rename files like archive_001.zip on conflict", async () => {
      const srcFile = path.join(testDir, "archive_001.zip");
      await fs.writeFile(srcFile, "zip content");

      const archivesDir = path.join(testDir, "Archives");
      await fs.mkdir(archivesDir, { recursive: true });
      const destFile = path.join(archivesDir, "archive_001.zip");
      await fs.writeFile(destFile, "existing zip");

      const files: FileWithSize[] = [
        {
          name: "archive_001.zip",
          path: srcFile,
          size: 15,
          modified: new Date(),
        },
      ];

      const result = await organizer.organize(testDir, files, {
        dryRun: false,
        conflictStrategy: "rename",
      });

      expect(result.errors).toHaveLength(0);
      expect(result.actions).toHaveLength(1);
      expect(path.basename(result.actions[0].to)).toBe("archive_001_1.zip");
    });
  });
});

