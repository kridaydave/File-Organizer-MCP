/**
 * File Organizer MCP Server v3.2.0
 * Metadata Cache Service
 * Caches metadata extractions for audio and image files
 */

import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { logger } from "../utils/logger.js";

import { AudioMetadata, ImageMetadata } from "../types.js";

export interface CacheStats {
  totalEntries: number;
  audioEntries: number;
  imageEntries: number;
  cacheSize: number;
}

import {
  MetadataCacheOptions,
  MetadataCache,
  MetadataCacheEntry,
} from "../types.js";

// ==================== Metadata Cache Service ====================

export class MetadataCacheService {
  private readonly cacheDir: string;
  private readonly maxAge: number;
  private readonly maxEntries: number;
  private readonly cacheFilePath: string;
  private writeLock: Promise<void> = Promise.resolve();

  constructor(options: MetadataCacheOptions = {}) {
    this.cacheDir = options.cacheDir || path.join(process.cwd(), ".cache");
    this.maxAge = options.maxAge || 604800000; // 7 days in milliseconds
    this.maxEntries = options.maxEntries || 10000;
    this.cacheFilePath = path.join(this.cacheDir, "metadata-cache.json");

    logger.info("MetadataCacheService initialized", {
      cacheDir: this.cacheDir,
      maxAge: this.maxAge,
      maxEntries: this.maxEntries,
    });
  }

  /**
   * Initialize the cache directory
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      logger.debug(`Cache directory ensured: ${this.cacheDir}`);
    } catch (error) {
      logger.error("Failed to create cache directory", error);
      throw error;
    }
  }

  /**
   * Generate a hash for a file based on path and modification time
   */
  private generateFileHash(filePath: string, lastModified: number): string {
    const hash = crypto.createHash("md5");
    hash.update(`${filePath}:${lastModified}`);
    return hash.digest("hex");
  }

  /**
   * Read the cache file, returns empty cache if file doesn't exist
   */
  private async readCache(): Promise<MetadataCache> {
    try {
      const data = await fs.readFile(this.cacheFilePath, "utf-8");
      const cache = JSON.parse(data) as MetadataCache;

      // Revive Date objects from JSON
      return {
        ...cache,
        createdAt: new Date(cache.createdAt),
        updatedAt: new Date(cache.updatedAt),
        entries: cache.entries.map((entry) => ({
          ...entry,
          cachedAt: new Date(entry.cachedAt),
          audioMetadata: entry.audioMetadata
            ? {
                ...entry.audioMetadata,
                extractedAt: new Date(entry.audioMetadata.extractedAt),
              }
            : undefined,
          imageMetadata: entry.imageMetadata
            ? {
                ...entry.imageMetadata,
                extractedAt: new Date(entry.imageMetadata.extractedAt),
              }
            : undefined,
        })),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // Cache file doesn't exist, return empty cache
        return {
          version: "1.0",
          createdAt: new Date(),
          updatedAt: new Date(),
          entries: [],
        };
      }
      logger.error("Failed to read cache file", error);
      throw error;
    }
  }

  /**
   * Write cache to file atomically
   */
  private async writeCache(cache: MetadataCache): Promise<void> {
    const tempPath = `${this.cacheFilePath}.tmp`;

    try {
      // Write to temporary file first
      await fs.writeFile(tempPath, JSON.stringify(cache, null, 2), "utf-8");

      // Atomic rename
      await fs.rename(tempPath, this.cacheFilePath);

      logger.debug("Cache written successfully", {
        entries: cache.entries.length,
        path: this.cacheFilePath,
      });
    } catch (error) {
      // Clean up temp file if it exists
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      logger.error("Failed to write cache file", error);
      throw error;
    }
  }

  /**
   * Acquire write lock for atomic operations
   */
  private async acquireLock<T>(operation: () => Promise<T>): Promise<T> {
    const release = await this.writeLock;
    let resolveLock: () => void;

    this.writeLock = new Promise((resolve) => {
      resolveLock = resolve;
    });

    try {
      const result = await operation();
      return result;
    } finally {
      resolveLock!();
    }
  }

  /**
   * Get cached metadata for a file if valid
   */
  async get(filePath: string): Promise<MetadataCacheEntry | null> {
    try {
      // Get current file stats
      let stats;
      try {
        stats = await fs.stat(filePath);
      } catch (error) {
        logger.debug(`File not accessible for cache check: ${filePath}`);
        return null;
      }

      const cache = await this.readCache();
      const entry = cache.entries.find((e) => e.filePath === filePath);

      if (!entry) {
        logger.debug(`Cache miss: ${filePath}`);
        return null;
      }

      // Validate cache entry
      const currentHash = this.generateFileHash(filePath, stats.mtimeMs);
      const isExpired = Date.now() - entry.cachedAt.getTime() > this.maxAge;
      const isHashValid = entry.fileHash === currentHash;

      if (isExpired || !isHashValid) {
        logger.debug(`Cache entry invalidated for: ${filePath}`, {
          expired: isExpired,
          hashValid: isHashValid,
        });

        // Remove invalid entry in background
        this.invalidate(filePath).catch((err) => {
          logger.warn(`Failed to invalidate stale entry for ${filePath}`, err);
        });

        return null;
      }

      logger.debug(`Cache hit: ${filePath}`, {
        cachedAt: entry.cachedAt,
        type: entry.audioMetadata
          ? "audio"
          : entry.imageMetadata
            ? "image"
            : "unknown",
      });

      return entry;
    } catch (error) {
      logger.error(`Error getting cache for ${filePath}`, error);
      return null;
    }
  }

  /**
   * Cache metadata for a file
   */
  async set(
    filePath: string,
    metadata: AudioMetadata | ImageMetadata,
  ): Promise<void> {
    await this.acquireLock(async () => {
      try {
        // Get current file stats
        const stats = await fs.stat(filePath);
        const fileHash = this.generateFileHash(filePath, stats.mtimeMs);

        // Read current cache
        const cache = await this.readCache();

        // Determine metadata type
        const isAudioMetadata =
          "format" in metadata && "hasEmbeddedArtwork" in metadata;
        const isImageMetadata = "width" in metadata && "height" in metadata;

        // Create or update entry
        const newEntry: MetadataCacheEntry = {
          filePath,
          fileHash,
          lastModified: stats.mtimeMs,
          audioMetadata: isAudioMetadata
            ? (metadata as AudioMetadata)
            : undefined,
          imageMetadata: isImageMetadata
            ? (metadata as ImageMetadata)
            : undefined,
          cachedAt: new Date(),
        };

        // Remove existing entry if present
        const existingIndex = cache.entries.findIndex(
          (e) => e.filePath === filePath,
        );
        if (existingIndex !== -1) {
          cache.entries.splice(existingIndex, 1);
        }

        // Add new entry
        cache.entries.push(newEntry);

        // Enforce max entries limit (FIFO)
        if (cache.entries.length > this.maxEntries) {
          const removed = cache.entries.splice(
            0,
            cache.entries.length - this.maxEntries,
          );
          logger.debug(
            `Removed ${removed.length} oldest cache entries due to maxEntries limit`,
          );
        }

        // Update metadata
        cache.updatedAt = new Date();

        // Write cache
        await this.writeCache(cache);

        // Log security scan results if available
        if (isAudioMetadata) {
          logger.info(`Cached audio metadata for security scan: ${filePath}`, {
            filePath,
            format: (metadata as AudioMetadata).format,
            hasEmbeddedArtwork: (metadata as AudioMetadata).hasEmbeddedArtwork,
            cachedAt: newEntry.cachedAt,
          });
        } else if (isImageMetadata) {
          logger.info(`Cached image metadata for security scan: ${filePath}`, {
            filePath,
            format: (metadata as ImageMetadata).format,
            dimensions: `${(metadata as ImageMetadata).width}x${(metadata as ImageMetadata).height}`,
            cachedAt: newEntry.cachedAt,
          });
        }
      } catch (error) {
        logger.error(`Failed to cache metadata for ${filePath}`, error);
        throw error;
      }
    });
  }

  /**
   * Remove a specific entry from the cache
   */
  async invalidate(filePath: string): Promise<void> {
    await this.acquireLock(async () => {
      try {
        const cache = await this.readCache();
        const initialLength = cache.entries.length;

        cache.entries = cache.entries.filter((e) => e.filePath !== filePath);

        if (cache.entries.length < initialLength) {
          cache.updatedAt = new Date();
          await this.writeCache(cache);
          logger.debug(`Invalidated cache entry: ${filePath}`);
        }
      } catch (error) {
        logger.error(`Failed to invalidate cache for ${filePath}`, error);
        throw error;
      }
    });
  }

  /**
   * Clear the entire cache
   */
  async invalidateAll(): Promise<void> {
    await this.acquireLock(async () => {
      try {
        const cache: MetadataCache = {
          version: "1.0",
          createdAt: new Date(),
          updatedAt: new Date(),
          entries: [],
        };

        await this.writeCache(cache);
        logger.info("Cache invalidated completely");
      } catch (error) {
        logger.error("Failed to invalidate all cache", error);
        throw error;
      }
    });
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      const cache = await this.readCache();

      let audioEntries = 0;
      let imageEntries = 0;
      let cacheSize = 0;

      for (const entry of cache.entries) {
        if (entry.audioMetadata) audioEntries++;
        if (entry.imageMetadata) imageEntries++;
        // Rough estimate of entry size
        cacheSize += JSON.stringify(entry).length;
      }

      return {
        totalEntries: cache.entries.length,
        audioEntries,
        imageEntries,
        cacheSize,
      };
    } catch (error) {
      logger.error("Failed to get cache stats", error);
      return {
        totalEntries: 0,
        audioEntries: 0,
        imageEntries: 0,
        cacheSize: 0,
      };
    }
  }

  /**
   * Remove expired entries from cache
   */
  async cleanup(): Promise<void> {
    await this.acquireLock(async () => {
      try {
        const cache = await this.readCache();
        const now = Date.now();
        const initialLength = cache.entries.length;

        // Filter out expired entries
        const validEntries: MetadataCacheEntry[] = [];
        const expiredEntries: MetadataCacheEntry[] = [];

        for (const entry of cache.entries) {
          const age = now - entry.cachedAt.getTime();
          if (age <= this.maxAge) {
            validEntries.push(entry);
          } else {
            expiredEntries.push(entry);
          }
        }

        if (expiredEntries.length > 0) {
          cache.entries = validEntries;
          cache.updatedAt = new Date();
          await this.writeCache(cache);

          logger.info(`Cache cleanup completed`, {
            removed: expiredEntries.length,
            remaining: validEntries.length,
            expiredFiles: expiredEntries.map((e) => e.filePath),
          });

          // Log security scan results for expired entries
          for (const entry of expiredEntries) {
            logger.info(`Security scan cache expired for file`, {
              filePath: entry.filePath,
              cachedAt: entry.cachedAt,
              expiredAt: new Date(),
            });
          }
        } else {
          logger.debug("Cache cleanup: no expired entries found");
        }
      } catch (error) {
        logger.error("Failed to cleanup cache", error);
        throw error;
      }
    });
  }

  /**
   * Check if a file has valid cached metadata
   */
  async has(filePath: string): Promise<boolean> {
    const entry = await this.get(filePath);
    return entry !== null;
  }

  /**
   * Get all cached entries (for debugging/admin purposes)
   */
  async getAllEntries(): Promise<MetadataCacheEntry[]> {
    const cache = await this.readCache();
    return [...cache.entries];
  }
}

// ==================== Global Instance ====================

export const globalMetadataCache = new MetadataCacheService();
