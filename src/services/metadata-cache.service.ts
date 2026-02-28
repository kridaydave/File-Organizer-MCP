/**
 * File Organizer MCP Server v3.4.1
 * Metadata Cache Service
 * Caches metadata extractions for audio and image files
 */

import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { logger } from "../utils/logger.js";

import { AudioMetadata, ImageMetadata } from "../types.js";

export interface CacheStats {
  entries: number;
  size: number;
  hits: number;
  misses: number;
}

import {
  MetadataCacheOptions,
  MetadataCache,
  MetadataCacheEntry,
} from "../types.js";

function isMetadataCache(obj: unknown): obj is MetadataCache {
  if (typeof obj !== "object" || obj === null) return false;
  const cache = obj as Record<string, unknown>;
  return typeof cache.version === "string" && Array.isArray(cache.entries);
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

// Extended cache entry for internal use with TTL support
interface ExtendedCacheEntry {
  value: unknown;
  timestamp: number;
  ttl: number | null; // null means no expiration
  filePath?: string;
  fileMtime?: number;
}

// ==================== Metadata Cache Service ====================

export class MetadataCacheService {
  private readonly cacheDir: string;
  private readonly maxAge: number;
  private readonly maxEntries: number;
  private readonly cacheFilePath: string;
  private writeLock: Promise<void> = Promise.resolve();
  private initLock: Promise<void> = Promise.resolve();
  private memoryCache: Map<string, ExtendedCacheEntry> = new Map();
  private stats: { hits: number; misses: number } = { hits: 0, misses: 0 };
  private initialized: boolean = false;

  // Cached stats calculation to avoid expensive JSON.stringify on every call
  private statsCache: { data: CacheStats; timestamp: number } | null = null;
  private lastModified: number = Date.now();

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
    if (this.initialized) return;

    // Use lock to prevent concurrent initialization race conditions
    const previousLock = this.initLock;
    let resolveLock: () => void;
    this.initLock = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    await previousLock;

    try {
      // Double-check after acquiring lock
      if (this.initialized) {
        return;
      }

      await fs.mkdir(this.cacheDir, { recursive: true });
      await this.loadFromDisk();
      this.initialized = true;
      logger.debug(`Cache directory ensured: ${this.cacheDir}`);
    } catch (error) {
      logger.error("Failed to create cache directory", error);
      throw error;
    } finally {
      resolveLock!();
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
   * Load cache from disk into memory
   * SECURITY JUSTIFICATION (SEC-001, SEC-016):
   * this.cacheFilePath is an internal application path constructed in the constructor
   * from this.cacheDir (defaults to ".cache" in cwd). It is NOT user-provided input.
   * Therefore, no path validation is required per the security model.
   * JSON.parse is safe here because we're parsing the application's own cache file
   * that was created by this service, not untrusted user input.
   */
  private async loadFromDisk(): Promise<void> {
    try {
      const data = await fs.readFile(this.cacheFilePath, "utf-8");
      const diskCache = JSON.parse(data) as {
        entries?: Record<string, ExtendedCacheEntry>;
        stats?: { hits: number; misses: number };
      };

      if (diskCache.entries) {
        this.memoryCache = new Map(Object.entries(diskCache.entries));
      }
      if (diskCache.stats) {
        this.stats = diskCache.stats;
      }
    } catch (error) {
      // Silently handle ENOENT (file doesn't exist) and JSON parse errors
      // by starting with an empty cache
      this.memoryCache = new Map();
    }
  }

  /**
   * Save cache to disk
   */
  private async saveToDisk(): Promise<void> {
    // Ensure directory exists before writing
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch {
      // Directory might already exist, continue
    }

    const cacheData = {
      entries: Object.fromEntries(this.memoryCache),
      stats: this.stats,
      savedAt: new Date().toISOString(),
    };

    // On Windows, use direct write with locking (already protected by writeLock)
    // On Unix, use atomic rename pattern
    const isWindows = process.platform === "win32";

    if (isWindows) {
      // Windows: Write directly since we have proper locking
      try {
        await fs.writeFile(
          this.cacheFilePath,
          JSON.stringify(cacheData),
          "utf-8",
        );
      } catch (error) {
        logger.error("Failed to save cache to disk", error);
        throw error;
      }
    } else {
      // Unix: Use atomic rename pattern
      const tempPath = `${this.cacheFilePath}.tmp`;
      try {
        await fs.writeFile(tempPath, JSON.stringify(cacheData), "utf-8");
        await fs.rename(tempPath, this.cacheFilePath);
      } catch (error) {
        // Clean up temp file on error
        try {
          await fs.unlink(tempPath);
        } catch {
          // Ignore cleanup errors
        }
        logger.error("Failed to save cache to disk", error);
        throw error;
      }
    }
  }

  /**
   * Acquire write lock for atomic operations
   */
  private async acquireLock<T>(operation: () => Promise<T>): Promise<T> {
    // Capture the previous lock BEFORE awaiting
    const previousLock = this.writeLock;

    // Create and assign new lock immediately (before any await)
    let resolveLock: () => void;
    this.writeLock = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });

    // Now await the previous lock
    await previousLock;

    try {
      return await operation();
    } finally {
      resolveLock!();
    }
  }

  /**
   * Get cached value by key
   */
  async get(key: string): Promise<unknown | null> {
    await this.initialize();

    const entry = this.memoryCache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (entry.ttl != null && Date.now() - entry.timestamp > entry.ttl) {
      this.memoryCache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Check if file-based entry is stale
    if (entry.filePath) {
      const isStaleEntry = await this.isFileStale(entry);
      if (isStaleEntry) {
        this.memoryCache.delete(key);
        this.stats.misses++;
        return null;
      }
    }

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Set cached value with optional TTL
   */
  async set(
    key: string,
    value: unknown,
    options?: { ttl?: number; filePath?: string },
  ): Promise<void> {
    await this.initialize();

    await this.acquireLock(async () => {
      let fileMtime: number | undefined;

      // If filePath is provided, get the file's modification time
      if (options?.filePath) {
        try {
          const stats = await fs.stat(options.filePath);
          fileMtime = stats.mtimeMs;
        } catch {
          // File doesn't exist, store without file tracking
        }
      }

      // Serialize/deserialize to match JSON behavior (converts Dates to strings)
      // Also converts undefined to null since JSON.stringify(undefined) is undefined
      const serializedValue =
        value === undefined ? null : JSON.parse(JSON.stringify(value));

      const entry: ExtendedCacheEntry = {
        value: serializedValue,
        timestamp: Date.now(),
        ttl: options?.ttl !== undefined ? options.ttl : this.maxAge,
        filePath: options?.filePath,
        fileMtime,
      };

      this.memoryCache.set(key, entry);
      this.lastModified = Date.now();

      // Enforce max entries limit (FIFO)
      if (this.memoryCache.size > this.maxEntries) {
        const firstKey = this.memoryCache.keys().next().value;
        if (firstKey !== undefined) {
          this.memoryCache.delete(firstKey);
        }
      }

      // Persist to disk
      await this.saveToDisk();
    });
  }

  /**
   * Delete a cached entry
   */
  async delete(key: string): Promise<void> {
    await this.initialize();

    await this.acquireLock(async () => {
      this.memoryCache.delete(key);
      this.lastModified = Date.now();
      await this.saveToDisk();
    });
  }

  /**
   * Clear all cached entries
   */
  async clear(): Promise<void> {
    await this.initialize();

    await this.acquireLock(async () => {
      this.memoryCache.clear();
      this.stats = { hits: 0, misses: 0 };
      this.lastModified = Date.now();
      await this.saveToDisk();
    });
  }

  /**
   * Check if a key exists in cache
   */
  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  /**
   * Check if a file-based cache entry is stale
   */
  private async isFileStale(entry: ExtendedCacheEntry): Promise<boolean> {
    if (!entry.filePath) return false;

    try {
      const stats = await fs.stat(entry.filePath);
      // If file has been modified since cache was created, it's stale
      if (entry.fileMtime && Math.abs(stats.mtimeMs - entry.fileMtime) > 1) {
        return true;
      }
    } catch {
      // File doesn't exist, treat as stale
      return true;
    }

    return false;
  }

  /**
   * Check if a key is stale (for file-based caching)
   */
  async isStale(key: string): Promise<boolean> {
    await this.initialize();

    const entry = this.memoryCache.get(key);
    if (!entry) return true;

    return this.isFileStale(entry);
  }

  /**
   * Prune expired entries
   */
  async prune(): Promise<void> {
    await this.initialize();

    await this.acquireLock(async () => {
      const now = Date.now();
      const keysToDelete: string[] = [];

      for (const [key, entry] of this.memoryCache) {
        if (entry.ttl != null && now - entry.timestamp > entry.ttl) {
          keysToDelete.push(key);
        }
      }

      for (const key of keysToDelete) {
        this.memoryCache.delete(key);
      }

      if (keysToDelete.length > 0) {
        this.lastModified = Date.now();
        await this.saveToDisk();
      }
    });
  }

  /**
   * Get cache statistics with 5-second caching to avoid expensive recalculation
   */
  async getStats(): Promise<CacheStats> {
    await this.initialize();

    const STATS_CACHE_TTL = 5000; // 5 seconds
    const now = Date.now();

    // Return cached stats if still valid (not expired and cache not modified)
    if (
      this.statsCache &&
      now - this.statsCache.timestamp < STATS_CACHE_TTL &&
      this.statsCache.timestamp >= this.lastModified
    ) {
      return this.statsCache.data;
    }

    // Recalculate stats
    let size = 0;
    for (const entry of this.memoryCache.values()) {
      size += JSON.stringify(entry).length;
    }

    const stats: CacheStats = {
      entries: this.memoryCache.size,
      size,
      hits: this.stats.hits,
      misses: this.stats.misses,
    };

    // Cache the result
    this.statsCache = { data: stats, timestamp: now };

    return stats;
  }

  // Legacy methods for backward compatibility with file-based caching

  /**
   * Get cached metadata for a file if valid
   */
  async getFileMetadata(filePath: string): Promise<MetadataCacheEntry | null> {
    try {
      // Get current file stats
      let stats;
      try {
        stats = await fs.stat(filePath);
      } catch (error) {
        logger.debug(`File not accessible for cache check: ${filePath}`);
        return null;
      }

      const cache = await this.readLegacyCache();
      const entry = cache.entries.find((e) => e.filePath === filePath);

      if (!entry) {
        logger.debug(`Cache miss: ${filePath}`);
        return null;
      }

      // Validate cache entry
      const currentHash = this.generateFileHash(filePath, stats.mtimeMs);
      const cachedAtTime = isValidDate(entry.cachedAt)
        ? entry.cachedAt.getTime()
        : 0;
      const isExpired = Date.now() - cachedAtTime > this.maxAge;
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
   * Read the legacy cache file
   * SECURITY JUSTIFICATION (SEC-001, SEC-016):
   * this.cacheFilePath is an internal application path constructed in the constructor
   * from this.cacheDir (defaults to ".cache" in cwd). It is NOT user-provided input.
   * Therefore, no path validation is required per the security model.
   * JSON.parse is safe here because we're parsing the application's own cache file
   * that was created by this service, not untrusted user input.
   */
  private async readLegacyCache(): Promise<MetadataCache> {
    try {
      const data = await fs.readFile(this.cacheFilePath, "utf-8");
      const parsed = JSON.parse(data);
      if (!isMetadataCache(parsed)) {
        throw new Error("Invalid cache file format");
      }
      const cache = parsed;

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
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
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
   * Cache metadata for a file
   */
  async setFileMetadata(
    filePath: string,
    metadata: AudioMetadata | ImageMetadata,
  ): Promise<void> {
    await this.acquireLock(async () => {
      try {
        // Get current file stats
        const stats = await fs.stat(filePath);
        const fileHash = this.generateFileHash(filePath, stats.mtimeMs);

        // Read current cache
        const cache = await this.readLegacyCache();

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
   * Cache metadata for multiple files in bulk
   */
  async setBatch(
    metadataEntries: Array<{
      filePath: string;
      metadata: AudioMetadata | ImageMetadata;
    }>,
  ): Promise<void> {
    await this.acquireLock(async () => {
      try {
        // Read current cache
        const cache = await this.readLegacyCache();

        // Process each entry
        for (const { filePath, metadata } of metadataEntries) {
          try {
            // Get current file stats
            const stats = await fs.stat(filePath);
            const fileHash = this.generateFileHash(filePath, stats.mtimeMs);

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
          } catch (error) {
            logger.error(`Failed to cache metadata for ${filePath}`, error);
          }
        }

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

        logger.info(
          `Cached ${metadataEntries.length} metadata entries in bulk`,
        );
      } catch (error) {
        logger.error(`Failed to cache metadata in bulk`, error);
        throw error;
      }
    });
  }

  /**
   * Get cached metadata for multiple files
   */
  async getBatch(filePaths: string[]): Promise<MetadataCacheEntry[]> {
    const results: MetadataCacheEntry[] = [];

    for (const filePath of filePaths) {
      const entry = await this.getFileMetadata(filePath);
      if (entry) {
        results.push(entry);
      }
    }

    return results;
  }

  /**
   * Remove a specific entry from the cache
   */
  async invalidate(filePath: string): Promise<void> {
    await this.acquireLock(async () => {
      try {
        const cache = await this.readLegacyCache();
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
   * Get legacy cache statistics
   */
  async getFileCacheStats(): Promise<{
    totalEntries: number;
    audioEntries: number;
    imageEntries: number;
    cacheSize: number;
  }> {
    try {
      const cache = await this.readLegacyCache();

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
        const cache = await this.readLegacyCache();
        const now = Date.now();
        const initialLength = cache.entries.length;

        // Filter out expired entries
        const validEntries: MetadataCacheEntry[] = [];
        const expiredEntries: MetadataCacheEntry[] = [];

        for (const entry of cache.entries) {
          const cachedAtTime = isValidDate(entry.cachedAt)
            ? entry.cachedAt.getTime()
            : 0;
          const age = now - cachedAtTime;
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
  async hasFile(filePath: string): Promise<boolean> {
    const entry = await this.getFileMetadata(filePath);
    return entry !== null;
  }

  /**
   * Get all cached entries (for debugging/admin purposes)
   */
  async getAllEntries(): Promise<MetadataCacheEntry[]> {
    const cache = await this.readLegacyCache();
    return [...cache.entries];
  }
}

// ==================== Global Instance ====================

export const globalMetadataCache = new MetadataCacheService();
