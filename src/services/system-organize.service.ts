/**
 * File Organizer MCP Server v3.3.3
 * System Organize Service
 *
 * Handles organizing files from system directories (Downloads, Desktop, Temp)
 * to appropriate system folders (Music, Documents, Pictures, Videos)
 */

import fs from "fs/promises";
import { constants, Dirent } from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { logger } from "../utils/logger.js";
import { PathValidatorService } from "./path-validator.service.js";
import { CategorizerService } from "./categorizer.service.js";

export interface SystemDirs {
  music: string;
  documents: string;
  pictures: string;
  videos: string;
  downloads: string;
  desktop: string;
  temp: string;
}

export interface SystemOrganizeOptions {
  sourceDir: string;
  useSystemDirs?: boolean;
  createSubfolders?: boolean;
  fallbackToLocal?: boolean;
  localFallbackPrefix?: string;
  conflictStrategy?: "skip" | "rename" | "overwrite";
  dryRun?: boolean;
  copyInsteadOfMove?: boolean;
}

export interface SystemOrganizeResult {
  movedToSystem: number;
  organizedLocally: number;
  failed: number;
  details: Array<{
    file: string;
    destination: "system" | "local";
    targetPath: string;
    category: string;
  }>;
  undoManifest?: {
    manifestId: string;
    operations: Array<{ from: string; to: string; timestamp: string }>;
  };
}

interface FileOperation {
  from: string;
  to: string;
  timestamp: string;
}

const CATEGORY_TO_SYSTEM_DIR: Record<string, keyof SystemDirs> = {
  Music: "music",
  Audio: "music",
  Documents: "documents",
  Videos: "videos",
  Images: "pictures",
  Photos: "pictures",
  Pictures: "pictures",
};

const RETRY_MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 100;

export class SystemOrganizeService {
  private pathValidator: PathValidatorService;
  private categorizer: CategorizerService;
  private systemDirs: SystemDirs | null = null;

  constructor() {
    this.pathValidator = new PathValidatorService();
    this.categorizer = new CategorizerService();
  }

  async getSystemDirectories(): Promise<SystemDirs> {
    if (this.systemDirs) {
      return this.systemDirs;
    }

    const homeDir = os.homedir();
    const platform = process.platform;

    const dirs: SystemDirs = {
      music: "",
      documents: "",
      pictures: "",
      videos: "",
      downloads: "",
      desktop: "",
      temp: "",
    };

    if (platform === "win32") {
      dirs.music = path.join(homeDir, "Music");
      dirs.documents = path.join(homeDir, "Documents");
      dirs.pictures = path.join(homeDir, "Pictures");
      dirs.videos = path.join(homeDir, "Videos");
      dirs.downloads = path.join(homeDir, "Downloads");
      dirs.desktop = path.join(homeDir, "Desktop");
      dirs.temp = os.tmpdir();
    } else if (platform === "darwin") {
      dirs.music = path.join(homeDir, "Music");
      dirs.documents = path.join(homeDir, "Documents");
      dirs.pictures = path.join(homeDir, "Pictures");
      dirs.videos = path.join(homeDir, "Movies");
      dirs.downloads = path.join(homeDir, "Downloads");
      dirs.desktop = path.join(homeDir, "Desktop");
      dirs.temp = os.tmpdir();
    } else {
      dirs.music = path.join(homeDir, "Music");
      dirs.documents = path.join(homeDir, "Documents");
      dirs.pictures = path.join(homeDir, "Pictures");
      dirs.videos = path.join(homeDir, "Videos");
      dirs.downloads = path.join(homeDir, "Downloads");
      dirs.desktop = path.join(homeDir, "Desktop");
      dirs.temp = os.tmpdir();
    }

    const validatedDirs: SystemDirs = {
      music: "",
      documents: "",
      pictures: "",
      videos: "",
      downloads: "",
      desktop: "",
      temp: "",
    };

    for (const [key, dirPath] of Object.entries(dirs)) {
      try {
        const validated = await this.pathValidator.validatePath(dirPath, {
          requireExists: true,
        });
        (validatedDirs as any)[key] = validated;
      } catch {
        (validatedDirs as any)[key] = dirPath;
      }
    }

    this.systemDirs = validatedDirs;
    return validatedDirs;
  }

  async validateSourceDir(sourceDir: string): Promise<{
    valid: boolean;
    normalizedPath: string;
    reason?: string;
  }> {
    try {
      const validatedPath = await this.pathValidator.validatePath(sourceDir, {
        requireExists: true,
        checkWrite: true,
        allowSymlinks: false,
      });

      const stats = await fs.stat(validatedPath);
      if (!stats.isDirectory()) {
        return {
          valid: false,
          normalizedPath: validatedPath,
          reason: "Source path is not a directory",
        };
      }

      const systemDirs = await this.getSystemDirectories();
      const allowedDirs = [
        systemDirs.downloads,
        systemDirs.desktop,
        systemDirs.temp,
      ];

      const isAllowedDir = allowedDirs.some(
        (allowed) => allowed && this.isSubPath(allowed, validatedPath),
      );

      if (!isAllowedDir) {
        return {
          valid: false,
          normalizedPath: validatedPath,
          reason: "Source must be Downloads, Desktop, or Temp directory",
        };
      }

      return { valid: true, normalizedPath: validatedPath };
    } catch (error) {
      return {
        valid: false,
        normalizedPath: sourceDir,
        reason:
          error instanceof Error ? error.message : "Unknown validation error",
      };
    }
  }

  private isSubPath(parent: string, child: string): boolean {
    const relative = path.relative(parent, child);
    return !relative.startsWith("..") && !path.isAbsolute(relative);
  }

  async canWriteToDirectory(dirPath: string): Promise<{
    writable: boolean;
    hasSpace: boolean;
    availableBytes?: number;
    reason?: string;
  }> {
    try {
      await fs.access(dirPath, constants.W_OK);

      let availableBytes: number | undefined;
      try {
        const stats = await fs.statfs(dirPath);
        availableBytes = stats.bsize * stats.bfree;
      } catch {
        // statfs might not be available on all platforms
      }

      const MIN_FREE_SPACE = 100 * 1024 * 1024;
      const hasSpace =
        availableBytes === undefined || availableBytes > MIN_FREE_SPACE;

      return {
        writable: true,
        hasSpace,
        availableBytes,
        reason: hasSpace ? undefined : "Insufficient disk space",
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      return {
        writable: false,
        hasSpace: false,
        reason:
          err.code === "EACCES"
            ? "Permission denied"
            : err.code === "ENOENT"
              ? "Directory does not exist"
              : "Unknown error",
      };
    }
  }

  async determineSystemDestination(
    category: string,
    useSystemDirs: boolean,
    sourceDir: string,
  ): Promise<{
    destination: string;
    useLocalFallback: boolean;
  }> {
    const systemDirs = await this.getSystemDirectories();
    const systemDirKey = CATEGORY_TO_SYSTEM_DIR[category];

    if (!useSystemDirs || !systemDirKey) {
      return this.determineLocalFallback(sourceDir, category);
    }

    const systemDir = systemDirs[systemDirKey];
    if (!systemDir) {
      return this.determineLocalFallback(sourceDir, category);
    }

    const writeCheck = await this.canWriteToDirectory(systemDir);
    if (!writeCheck.writable || !writeCheck.hasSpace) {
      logger.warn(`System directory not writable, using local fallback`, {
        category,
        systemDir,
        reason: writeCheck.reason,
      });
      return this.determineLocalFallback(sourceDir, category);
    }

    return {
      destination: systemDir,
      useLocalFallback: false,
    };
  }

  private determineLocalFallback(
    sourceDir: string,
    category: string,
  ): {
    destination: string;
    useLocalFallback: true;
  } {
    const organizedDir = path.join(sourceDir, "Organized", category);
    return {
      destination: organizedDir,
      useLocalFallback: true,
    };
  }

  categorizeFile(fileName: string): string {
    const category = this.categorizer.getCategory(fileName);
    return category;
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== "EEXIST") {
        throw error;
      }
    }
  }

  private async moveOrCopyFile(
    sourcePath: string,
    destPath: string,
    copyInsteadOfMove: boolean,
    retryCount = 0,
  ): Promise<void> {
    try {
      if (copyInsteadOfMove) {
        await fs.copyFile(sourcePath, destPath);
      } else {
        await fs.rename(sourcePath, destPath);
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException;

      if (
        (err.code === "EPERM" || err.code === "EBUSY") &&
        retryCount < RETRY_MAX_ATTEMPTS
      ) {
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY_MS * (retryCount + 1)),
        );
        return this.moveOrCopyFile(
          sourcePath,
          destPath,
          copyInsteadOfMove,
          retryCount + 1,
        );
      }

      if (err.code === "EXDEV") {
        const content = await fs.readFile(sourcePath);
        await fs.writeFile(destPath, content);
        if (!copyInsteadOfMove) {
          await fs.unlink(sourcePath);
        }
        return;
      }

      throw error;
    }
  }

  private async handleConflict(
    destPath: string,
    strategy: "skip" | "rename" | "overwrite",
  ): Promise<string | null> {
    try {
      await fs.access(destPath, constants.F_OK);

      if (strategy === "skip") {
        return null;
      }

      if (strategy === "overwrite") {
        return destPath;
      }

      if (strategy === "rename") {
        const dir = path.dirname(destPath);
        const ext = path.extname(destPath);
        const baseName = path.basename(destPath, ext);
        let counter = 1;
        let newPath: string;

        do {
          newPath = path.join(dir, `${baseName}_${counter}${ext}`);
          counter++;
        } while (counter < 1000);

        try {
          await fs.access(newPath, constants.F_OK);
        } catch {
          return newPath;
        }

        return newPath;
      }

      return destPath;
    } catch {
      return destPath;
    }
  }

  async systemOrganize(
    options: SystemOrganizeOptions,
  ): Promise<SystemOrganizeResult> {
    const {
      sourceDir,
      useSystemDirs = true,
      createSubfolders = true,
      fallbackToLocal = true,
      localFallbackPrefix = "Organized",
      conflictStrategy = "rename",
      dryRun = false,
      copyInsteadOfMove = false,
    } = options;

    const validation = await this.validateSourceDir(sourceDir);
    if (!validation.valid) {
      logger.error("Source directory validation failed", {
        sourceDir,
        reason: validation.reason,
      });
      return {
        movedToSystem: 0,
        organizedLocally: 0,
        failed: 0,
        details: [],
      };
    }

    const normalizedSourceDir = validation.normalizedPath;
    const operations: FileOperation[] = [];
    let movedToSystem = 0;
    let organizedLocally = 0;
    let failed = 0;
    const details: SystemOrganizeResult["details"] = [];

    let entries: Dirent[];
    try {
      entries = await fs.readdir(normalizedSourceDir, {
        withFileTypes: true,
      });
    } catch (error) {
      logger.error("Failed to read source directory", {
        sourceDir: normalizedSourceDir,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        movedToSystem: 0,
        organizedLocally: 0,
        failed: 0,
        details: [],
      };
    }

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const fileName = entry.name;
      const sourcePath = path.join(normalizedSourceDir, fileName);

      try {
        const stats = await fs.stat(sourcePath);

        const category = this.categorizeFile(fileName);
        const destResult = await this.determineSystemDestination(
          category,
          useSystemDirs,
          normalizedSourceDir,
        );

        const targetDir = destResult.destination;
        const useLocalFallback = destResult.useLocalFallback;

        await this.ensureDirectoryExists(targetDir);

        let targetPath = path.join(targetDir, fileName);
        targetPath = (await this.handleConflict(
          targetPath,
          conflictStrategy,
        )) as string;

        if (!targetPath) {
          logger.info("Skipped file due to conflict strategy", { fileName });
          continue;
        }

        if (!dryRun) {
          await this.moveOrCopyFile(sourcePath, targetPath, copyInsteadOfMove);
        }

        operations.push({
          from: sourcePath,
          to: targetPath,
          timestamp: new Date().toISOString(),
        });

        if (useLocalFallback || !useSystemDirs) {
          organizedLocally++;
        } else {
          movedToSystem++;
        }

        details.push({
          file: fileName,
          destination: useLocalFallback || !useSystemDirs ? "local" : "system",
          targetPath,
          category,
        });

        logger.info("File organized", {
          fileName,
          category,
          destination: useLocalFallback ? "local" : "system",
          targetPath,
          dryRun,
        });
      } catch (error) {
        failed++;
        logger.error("Failed to organize file", {
          fileName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const manifestId = crypto.randomUUID();
    const undoManifest =
      operations.length > 0
        ? {
            manifestId,
            operations,
          }
        : undefined;

    return {
      movedToSystem,
      organizedLocally,
      failed,
      details,
      undoManifest,
    };
  }
}
