/**
 * Metadata Cache — Legacy file-based API
 * Extracted from metadata-cache.service.ts — no behavior change.
 */
import { promises as fs } from "fs";
import { logger } from "../../utils/logger.js";
import type { AudioMetadata, ImageMetadata, MetadataCache, MetadataCacheEntry } from "../../types.js";
import { MetadataCacheStatsMixin } from "./stats.js";
function isMetadataCache(obj: unknown): obj is MetadataCache { if (typeof obj !== "object" || obj === null) return false; const cache = obj as Record<string, unknown>; return typeof cache.version === "string" && Array.isArray(cache.entries); }
function isValidDate(value: unknown): value is Date { return value instanceof Date && !isNaN(value.getTime()); }
export class MetadataCacheLegacyMixin extends MetadataCacheStatsMixin {
  async getFileMetadata(filePath: string): Promise<MetadataCacheEntry | null> {
    try {
      let stats; try { stats = await fs.stat(filePath); } catch { logger.debug(`File not accessible for cache check: ${filePath}`); return null; }
      const cache = await this.readLegacyCache();
      const entry = cache.entries.find((e) => e.filePath === filePath);
      if (!entry) { logger.debug(`Cache miss: ${filePath}`); return null; }
      const currentHash = this.generateFileHash(filePath, stats.mtimeMs);
      const cachedAtTime = isValidDate(entry.cachedAt) ? entry.cachedAt.getTime() : 0;
      const isExpired = Date.now() - cachedAtTime > this.maxAge;
      const isHashValid = entry.fileHash === currentHash;
      if (isExpired || !isHashValid) {
        logger.debug(`Cache entry invalidated for: ${filePath}`, { expired: isExpired, hashValid: isHashValid, });
        this.invalidate(filePath).catch((err) => { logger.warn(`Failed to invalidate stale entry for ${filePath}`, err); });
        return null;
      }
      logger.debug(`Cache hit: ${filePath}`, { cachedAt: entry.cachedAt, type: entry.audioMetadata ? "audio" : entry.imageMetadata ? "image" : "unknown", });
      return entry;
    } catch (error) { logger.error(`Error getting cache for ${filePath}`, error); return null; }
  }
  protected async readLegacyCache(): Promise<MetadataCache> {
    try {
      const data = await fs.readFile(this.cacheFilePath, "utf-8");
      const parsed = JSON.parse(data); if (!isMetadataCache(parsed)) throw new Error("Invalid cache file format");
      const cache = parsed;
      return { ...cache, createdAt: new Date(cache.createdAt), updatedAt: new Date(cache.updatedAt), entries: cache.entries.map((entry) => ({ ...entry, cachedAt: new Date(entry.cachedAt), audioMetadata: entry.audioMetadata ? { ...entry.audioMetadata, extractedAt: new Date(entry.audioMetadata.extractedAt) } : undefined, imageMetadata: entry.imageMetadata ? { ...entry.imageMetadata, extractedAt: new Date(entry.imageMetadata.extractedAt) } : undefined, })), };
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") return { version: "1.0", createdAt: new Date(), updatedAt: new Date(), entries: [] };
      logger.error("Failed to read cache file", error); throw error;
    }
  }
  protected async writeCache(cache: MetadataCache): Promise<void> {
    const tempPath = `${this.cacheFilePath}.tmp`;
    try { await fs.writeFile(tempPath, JSON.stringify(cache, null, 2), "utf-8"); await fs.rename(tempPath, this.cacheFilePath); logger.debug("Cache written successfully", { entries: cache.entries.length, path: this.cacheFilePath }); } catch (error) {
      try { await fs.unlink(tempPath); } catch {}
      logger.error("Failed to write cache file", error); throw error;
    }
  }
  async setFileMetadata(filePath: string, metadata: AudioMetadata | ImageMetadata): Promise<void> {
    await this.acquireLock(async () => {
      try {
        const stats = await fs.stat(filePath); const fileHash = this.generateFileHash(filePath, stats.mtimeMs);
        const cache = await this.readLegacyCache();
        const isAudioMetadata = "format" in metadata && "hasEmbeddedArtwork" in metadata;
        const isImageMetadata = "width" in metadata && "height" in metadata;
        const newEntry: MetadataCacheEntry = { filePath, fileHash, lastModified: stats.mtimeMs, audioMetadata: isAudioMetadata ? (metadata as AudioMetadata) : undefined, imageMetadata: isImageMetadata ? (metadata as ImageMetadata) : undefined, cachedAt: new Date(), };
        const existingIndex = cache.entries.findIndex((e) => e.filePath === filePath); if (existingIndex !== -1) cache.entries.splice(existingIndex, 1);
        cache.entries.push(newEntry);
        if (cache.entries.length > this.maxEntries) { const removed = cache.entries.splice(0, cache.entries.length - this.maxEntries); logger.debug(`Removed ${removed.length} oldest cache entries due to maxEntries limit`); }
        cache.updatedAt = new Date(); await this.writeCache(cache);
        if (isAudioMetadata) logger.info(`Cached audio metadata for security scan: ${filePath}`, { filePath, format: (metadata as AudioMetadata).format, hasEmbeddedArtwork: (metadata as AudioMetadata).hasEmbeddedArtwork, cachedAt: newEntry.cachedAt, });
        else if (isImageMetadata) logger.info(`Cached image metadata for security scan: ${filePath}`, { filePath, format: (metadata as ImageMetadata).format, dimensions: `${(metadata as ImageMetadata).width}x${(metadata as ImageMetadata).height}`, cachedAt: newEntry.cachedAt, });
      } catch (error) { logger.error(`Failed to cache metadata for ${filePath}`, error); throw error; }
    });
  }
  async setBatch(metadataEntries: Array<{ filePath: string; metadata: AudioMetadata | ImageMetadata }>): Promise<void> {
    await this.acquireLock(async () => {
      try {
        const cache = await this.readLegacyCache();
        for (const { filePath, metadata } of metadataEntries) {
          try {
            const stats = await fs.stat(filePath); const fileHash = this.generateFileHash(filePath, stats.mtimeMs);
            const isAudioMetadata = "format" in metadata && "hasEmbeddedArtwork" in metadata;
            const isImageMetadata = "width" in metadata && "height" in metadata;
            const newEntry: MetadataCacheEntry = { filePath, fileHash, lastModified: stats.mtimeMs, audioMetadata: isAudioMetadata ? (metadata as AudioMetadata) : undefined, imageMetadata: isImageMetadata ? (metadata as ImageMetadata) : undefined, cachedAt: new Date(), };
            const existingIndex = cache.entries.findIndex((e) => e.filePath === filePath); if (existingIndex !== -1) cache.entries.splice(existingIndex, 1);
            cache.entries.push(newEntry);
          } catch (error) { logger.error(`Failed to cache metadata for ${filePath}`, error); }
        }
        if (cache.entries.length > this.maxEntries) { const removed = cache.entries.splice(0, cache.entries.length - this.maxEntries); logger.debug(`Removed ${removed.length} oldest cache entries due to maxEntries limit`); }
        cache.updatedAt = new Date(); await this.writeCache(cache); logger.info(`Cached ${metadataEntries.length} metadata entries in bulk`);
      } catch (error) { logger.error(`Failed to cache metadata in bulk`, error); throw error; }
    });
  }
  async getBatch(filePaths: string[]): Promise<MetadataCacheEntry[]> {
    const results: MetadataCacheEntry[] = []; for (const filePath of filePaths) { const entry = await this.getFileMetadata(filePath); if (entry) results.push(entry); } return results;
  }
  async invalidate(filePath: string): Promise<void> {
    await this.acquireLock(async () => {
      try { const cache = await this.readLegacyCache(); const initialLength = cache.entries.length; cache.entries = cache.entries.filter((e) => e.filePath !== filePath); if (cache.entries.length < initialLength) { cache.updatedAt = new Date(); await this.writeCache(cache); logger.debug(`Invalidated cache entry: ${filePath}`); } } catch (error) { logger.error(`Failed to invalidate cache for ${filePath}`, error); throw error; }
    });
  }
  async invalidateAll(): Promise<void> {
    await this.acquireLock(async () => {
      try { const cache: MetadataCache = { version: "1.0", createdAt: new Date(), updatedAt: new Date(), entries: [] }; await this.writeCache(cache); logger.info("Cache invalidated completely"); } catch (error) { logger.error("Failed to invalidate all cache", error); throw error; }
    });
  }
  async getFileCacheStats(): Promise<{ totalEntries: number; audioEntries: number; imageEntries: number; cacheSize: number }> {
    try {
      const cache = await this.readLegacyCache(); let audioEntries = 0; let imageEntries = 0; let cacheSize = 0;
      for (const entry of cache.entries) { if (entry.audioMetadata) audioEntries++; if (entry.imageMetadata) imageEntries++; cacheSize += JSON.stringify(entry).length; }
      return { totalEntries: cache.entries.length, audioEntries, imageEntries, cacheSize };
    } catch (error) { logger.error("Failed to get cache stats", error); return { totalEntries: 0, audioEntries: 0, imageEntries: 0, cacheSize: 0 }; }
  }
  async cleanup(): Promise<void> {
    await this.acquireLock(async () => {
      try {
        const cache = await this.readLegacyCache(); const now = Date.now();
        const validEntries: MetadataCacheEntry[] = []; const expiredEntries: MetadataCacheEntry[] = [];
        for (const entry of cache.entries) { const cachedAtTime = isValidDate(entry.cachedAt) ? entry.cachedAt.getTime() : 0; const age = now - cachedAtTime; if (age <= this.maxAge) validEntries.push(entry); else expiredEntries.push(entry); }
        if (expiredEntries.length > 0) {
          cache.entries = validEntries; cache.updatedAt = new Date(); await this.writeCache(cache);
          logger.info(`Cache cleanup completed`, { removed: expiredEntries.length, remaining: validEntries.length, expiredFiles: expiredEntries.map((e) => e.filePath), });
          for (const entry of expiredEntries) logger.info(`Security scan cache expired for file`, { filePath: entry.filePath, cachedAt: entry.cachedAt, expiredAt: new Date(), });
        } else logger.debug("Cache cleanup: no expired entries found");
      } catch (error) { logger.error("Failed to cleanup cache", error); throw error; }
    });
  }
  async hasFile(filePath: string): Promise<boolean> { const entry = await this.getFileMetadata(filePath); return entry !== null; }
  async getAllEntries(): Promise<MetadataCacheEntry[]> { const cache = await this.readLegacyCache(); return [...cache.entries]; }
}
