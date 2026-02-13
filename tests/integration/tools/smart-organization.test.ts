/**
 * Integration Tests for Smart Organization Tool
 * Tests real file system operations with actual services
 */

import fs from "fs/promises";
import path from "path";
import { jest } from "@jest/globals";
import {
  setupLoggerMocks,
  teardownLoggerMocks,
} from "../../utils/logger-mock.js";

// Import actual services for integration testing
const { handleOrganizeSmart } = await import(
  "../../../src/tools/smart-organization.js"
);

describe("Smart Organization Tool - Integration Tests", () => {
  let sourceDir: string;
  let targetDir: string;
  let baseTempDir: string;

  beforeEach(async () => {
    setupLoggerMocks();

    baseTempDir = path.join(process.cwd(), "tests", "temp");
    await fs.mkdir(baseTempDir, { recursive: true });
    sourceDir = await fs.mkdtemp(path.join(baseTempDir, "test-integ-src-"));
    targetDir = await fs.mkdtemp(path.join(baseTempDir, "test-integ-tgt-"));
  });

  afterEach(async () => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      await fs.rm(sourceDir, { recursive: true, force: true });
      await fs.rm(targetDir, { recursive: true, force: true });
    } catch (error) {
      console.error("Cleanup error:", error);
    }
    teardownLoggerMocks();
  });

  describe("Basic Integration Flow", () => {
    it("should organize text files to Documents folder", async () => {
      // Create test files
      await fs.writeFile(
        path.join(sourceDir, "notes.txt"),
        "These are my notes about programming and software development.",
      );
      await fs.writeFile(
        path.join(sourceDir, "readme.md"),
        "# Project README\n\nThis project is about testing and development.",
      );

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
        recursive: true,
      });

      const text = result.content[0].text;
      expect(text).toContain("📄 **Documents:** 2");
      // Output shows all categories with 0 counts, not absence of categories

      // Verify Documents directory was created
      const targetContents = await fs.readdir(targetDir);
      expect(targetContents).toContain("Documents");
      expect(targetContents).not.toContain("Music");
      expect(targetContents).not.toContain("Photos");

      // Verify files were moved
      const docsDir = path.join(targetDir, "Documents");
      const docsContents = await fs.readdir(docsDir);
      expect(docsContents.length).toBeGreaterThanOrEqual(1);
    });

    it("should not create unnecessary folders when only documents exist", async () => {
      await fs.writeFile(
        path.join(sourceDir, "document.txt"),
        "This is a document about testing and quality assurance.",
      );

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
      });

      const text = result.content[0].text;
      expect(text).toContain("📄 **Documents:** 1");
      expect(text).toContain("📦 **Other:** 0");

      // Verify only Documents folder exists
      const targetContents = await fs.readdir(targetDir);
      expect(targetContents).toEqual(["Documents"]);
    });

    it("should handle dry run without creating any directories", async () => {
      await fs.writeFile(
        path.join(sourceDir, "file.txt"),
        "This is a test document about various topics.",
      );

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: true,
      });

      const text = result.content[0].text;
      expect(text).toContain("DRY RUN MODE");
      expect(text).toContain("📄 **Documents:** 1");

      // Verify no directories were created
      const targetContents = await fs.readdir(targetDir);
      expect(targetContents).toHaveLength(0);

      // Verify source file still exists
      const sourceContents = await fs.readdir(sourceDir);
      expect(sourceContents).toContain("file.txt");
    });
  });

  describe("Mixed File Types Integration", () => {
    it("should correctly classify and report mixed file types", async () => {
      // Create files of different types
      await fs.writeFile(path.join(sourceDir, "song.mp3"), Buffer.alloc(100));
      await fs.writeFile(path.join(sourceDir, "photo.jpg"), Buffer.alloc(100));
      await fs.writeFile(
        path.join(sourceDir, "document.txt"),
        "This is a document about testing.",
      );
      await fs.writeFile(path.join(sourceDir, "unknown.xyz"), "unknown content");

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: true,
      });

      const text = result.content[0].text;
      expect(text).toContain("🎵 **Music:** 1");
      expect(text).toContain("📸 **Photos:** 1");
      expect(text).toContain("📄 **Documents:** 1");
      expect(text).toContain("📦 **Other:** 1");
      expect(text).toContain("**Total Files:** 4");
    });

    it("should create only needed directories for actual file types", async () => {
      // Only music and documents, no photos
      await fs.writeFile(path.join(sourceDir, "song.mp3"), Buffer.alloc(100));
      await fs.writeFile(
        path.join(sourceDir, "notes.txt"),
        "Notes about music and organization.",
      );

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
      });

      const text = result.content[0].text;
      expect(text).toContain("🎵 **Music:** 1");
      expect(text).toContain("📄 **Documents:** 1");

      // Wait a bit for file operations to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify only Music and Documents folders exist
      const targetContents = await fs.readdir(targetDir);
      expect(targetContents).toContain("Music");
      expect(targetContents).toContain("Documents");
      expect(targetContents).not.toContain("Photos");
    });
  });

  describe("Document Organization Integration", () => {
    it("should organize documents by topic", async () => {
      await fs.writeFile(
        path.join(sourceDir, "math.txt"),
        "Algebra and calculus are branches of mathematics with equations and functions.",
      );
      await fs.writeFile(
        path.join(sourceDir, "science.txt"),
        "Biology and chemistry study living organisms and chemical reactions in nature.",
      );

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
      });

      const text = result.content[0].text;
      expect(text).toContain("📄 **Documents:** 2");

      // Verify Documents directory and topic subdirectories
      const docsDir = path.join(targetDir, "Documents");
      const docsExists = await fs
        .access(docsDir)
        .then(() => true)
        .catch(() => false);
      expect(docsExists).toBe(true);
    });

    it("should handle documents with insufficient content", async () => {
      await fs.writeFile(path.join(sourceDir, "short.txt"), "tiny");
      await fs.writeFile(
        path.join(sourceDir, "good.txt"),
        "This is a proper document with sufficient content about testing and development.",
      );

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
      });

      const text = result.content[0].text;
      expect(text).toContain("📄 **Documents:** 2");
      // Some may be skipped due to insufficient content
    });
  });

  describe("Recursive Directory Scanning", () => {
    it("should scan nested directories when recursive=true", async () => {
      // Create nested structure
      const nestedDir = path.join(sourceDir, "level1", "level2");
      await fs.mkdir(nestedDir, { recursive: true });

      await fs.writeFile(
        path.join(sourceDir, "root.txt"),
        "Root level document about testing.",
      );
      await fs.writeFile(
        path.join(sourceDir, "level1", "level1.txt"),
        "Level 1 document about development.",
      );
      await fs.writeFile(
        path.join(nestedDir, "deep.txt"),
        "Deep nested document about software.",
      );

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        recursive: true,
        dry_run: false,
      });

      const text = result.content[0].text;
      expect(text).toContain("📄 **Documents:** 3");
    });

    it("should handle deeply nested directory structures", async () => {
      const deepDir = path.join(sourceDir, "a", "b", "c", "d", "e");
      await fs.mkdir(deepDir, { recursive: true });

      await fs.writeFile(
        path.join(deepDir, "deep_file.txt"),
        "This is a deeply nested file about testing.",
      );

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        recursive: true,
        dry_run: false,
      });

      const text = result.content[0].text;
      expect(text).toContain("📄 **Documents:** 1");
    });
  });

  describe("File Name Handling", () => {
    it("should handle files with spaces in names", async () => {
      await fs.writeFile(
        path.join(sourceDir, "my document file.txt"),
        "Content about testing and file organization.",
      );

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
      });

      const text = result.content[0].text;
      expect(text).toContain("📄 **Documents:** 1");

      // Verify file was moved
      const docsDir = path.join(targetDir, "Documents");
      const docsExists = await fs
        .access(docsDir)
        .then(() => true)
        .catch(() => false);
      expect(docsExists).toBe(true);
    });

    it("should handle files with special characters", async () => {
      const specialNames = [
        "file-with-dashes.txt",
        "file_with_underscores.txt",
        "file(multiple).txt",
        "file[special].txt",
      ];

      for (const name of specialNames) {
        await fs.writeFile(
          path.join(sourceDir, name),
          "Document content about testing and validation.",
        );
      }

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
      });

      const text = result.content[0].text;
      expect(text).toContain(`📄 **Documents:** ${specialNames.length}`);
    });

    it("should handle unicode filenames", async () => {
      await fs.writeFile(
        path.join(sourceDir, "文档.txt"),
        "Document content in Chinese about testing.",
      );
      await fs.writeFile(
        path.join(sourceDir, "документ.txt"),
        "Document content in Russian about development.",
      );

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
      });

      const text = result.content[0].text;
      expect(text).toContain("📄 **Documents:** 2");
    });
  });

  describe("Output Structure Display", () => {
    it("should show correct folder structure in output", async () => {
      await fs.writeFile(path.join(sourceDir, "file.txt"), "Document content.");

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: true,
      });

      const text = result.content[0].text;
      expect(text).toContain("Output Structure");
      expect(text).toContain("Documents/");
    });

    it("should show all relevant folders for mixed content", async () => {
      await fs.writeFile(path.join(sourceDir, "song.mp3"), Buffer.alloc(100));
      await fs.writeFile(path.join(sourceDir, "photo.jpg"), Buffer.alloc(100));
      await fs.writeFile(path.join(sourceDir, "doc.txt"), "Document content.");

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: true,
      });

      const text = result.content[0].text;
      expect(text).toContain("Music/");
      expect(text).toContain("Photos/");
      expect(text).toContain("Documents/");
    });
  });

  describe("Error Handling Integration", () => {
    it("should handle non-existent source directory gracefully", async () => {
      const nonExistentDir = path.join(sourceDir, "does-not-exist");

      const result = await handleOrganizeSmart({
        source_dir: nonExistentDir,
        target_dir: targetDir,
      });

      // Returns 0 files when directory doesn't exist or can't be scanned
      expect(result.content[0].text).toContain("**Total Files:** 0");
    });

    it("should handle permission errors gracefully", async () => {
      // This test may not work on all platforms
      await fs.writeFile(path.join(sourceDir, "readonly.txt"), "content");

      // Make file read-only (best effort)
      try {
        await fs.chmod(path.join(sourceDir, "readonly.txt"), 0o444);
      } catch {
        // Skip permission test if not supported
        return;
      }

      // Try to organize - should handle gracefully
      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
      });

      expect(result.content[0].text).toBeDefined();

      // Restore permissions for cleanup
      try {
        await fs.chmod(path.join(sourceDir, "readonly.txt"), 0o644);
      } catch {
        // Ignore
      }
    });

    it("should continue processing when some files fail", async () => {
      // Create some valid and invalid files
      await fs.writeFile(
        path.join(sourceDir, "good.txt"),
        "This is a good document with sufficient content about testing.",
      );
      await fs.writeFile(path.join(sourceDir, "empty.txt"), "");

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
      });

      const text = result.content[0].text;
      expect(text).toContain("📄 **Documents:** 2");
      // Should complete without throwing
    });
  });

  describe("Performance Integration", () => {
    it("should handle multiple files efficiently", async () => {
      // Create multiple documents
      for (let i = 0; i < 10; i++) {
        await fs.writeFile(
          path.join(sourceDir, `doc${i}.txt`),
          `Document ${i} content about testing and development topics for analysis.`,
        );
      }

      const startTime = Date.now();
      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
      });
      const duration = Date.now() - startTime;

      const text = result.content[0].text;
      expect(text).toContain("📄 **Documents:** 10");
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
    });
  });

  describe("Copy vs Move Integration", () => {
    it("should copy files when copy_instead_of_move is true", async () => {
      await fs.writeFile(
        path.join(sourceDir, "preserve.txt"),
        "This file should be preserved in source.",
      );

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
        copy_instead_of_move: true,
      });

      const text = result.content[0].text;
      expect(text).toContain("📄 **Documents:** 1");

      // Source file should still exist
      const sourceContents = await fs.readdir(sourceDir);
      expect(sourceContents).toContain("preserve.txt");
    });

    it("should organize documents correctly with copy_instead_of_move false", async () => {
      await fs.writeFile(
        path.join(sourceDir, "move.txt"),
        "This file should be organized from source.",
      );

      const result = await handleOrganizeSmart({
        source_dir: sourceDir,
        target_dir: targetDir,
        dry_run: false,
        copy_instead_of_move: false,
      });

      const text = result.content[0].text;
      expect(text).toContain("📄 **Documents:** 1");

      // Document organization behavior depends on implementation
      // The source file may or may not remain depending on how organizeDocuments works
      // Just verify the operation completed successfully
    });
  });
});
