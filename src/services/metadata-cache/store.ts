/**
 * Metadata Cache — Store (core in-memory TTL + disk persistence)
 * Extracted from metadata-cache.service.ts — no behavior change.
 */
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { logger } from "../../utils/logger.js";
import type { MetadataCacheOptions } from "../../types.js";
export interface ExtendedCacheEntry { value: unknown; timestamp: number; ttl: number | null; filePath?: string; fileMtime?: number; fileSize?: number; }
export class MetadataCacheStore {
  protected readonly cacheDir: string;
  protected readonly maxAge: number;
  protected readonly maxEntries: number;
  protected readonly cacheFilePath: string;
  protected writeLock: Promise<void> = Promise.resolve();
  protected initLock: Promise<void> = Promise.resolve();
  protected memoryCache: Map<string, ExtendedCacheEntry> = new Map();
  protected stats: { hits: number; misses: number } = { hits: 0, misses: 0 };
  protected initialized: boolean = false;
  protected statsCache: { data: import("./stats.js").CacheStats; timestamp: number } | null = null;
  protected lastModified: number = Date.now();
  constructor(options: MetadataCacheOptions = {}) {
    this.cacheDir = options.cacheDir || path.join(process.cwd(), ".cache");
    this.maxAge = options.maxAge || 604800000;
    this.maxEntries = options.maxEntries || 10000;
    this.cacheFilePath = path.join(this.cacheDir, "metadata-cache.json");
    logger.info("MetadataCacheService initialized", { cacheDir: this.cacheDir, maxAge: this.maxAge, maxEntries: this.maxEntries, });
  }
  async initialize(): Promise<void> {
    if (this.initialized) return;
    const previousLock = this.initLock; let resolveLock: () => void;
    this.initLock = new Promise<void>((resolve) => { resolveLock = resolve; });
    await previousLock;
    try { if (this.initialized) return; await fs.mkdir(this.cacheDir, { recursive: true }); await this.loadFromDisk(); this.initialized = true; logger.debug(`Cache directory ensured: ${this.cacheDir}`); } catch (error) { logger.error("Failed to create cache directory", error); throw error; } finally { resolveLock!(); }
  }
  protected generateFileHash(filePath: string, lastModified: number): string { const hash = crypto.createHash("md5"); hash.update(`${filePath}:${lastModified}`); return hash.digest("hex"); }
  protected async loadFromDisk(): Promise<void> {
    try { const data = await fs.readFile(this.cacheFilePath, "utf-8"); const diskCache = JSON.parse(data) as { entries?: Record<string, ExtendedCacheEntry>; stats?: { hits: number; misses: number }; }; if (diskCache.entries) this.memoryCache = new Map(Object.entries(diskCache.entries)); if (diskCache.stats) this.stats = diskCache.stats; } catch { this.memoryCache = new Map(); }
  }
  protected async saveToDisk(): Promise<void> {
    try { await fs.mkdir(this.cacheDir, { recursive: true }); } catch {}
    const cacheData = { entries: Object.fromEntries(this.memoryCache), stats: this.stats, savedAt: new Date().toISOString(), };
    const isWindows = process.platform === "win32";
    if (isWindows) { try { await fs.writeFile(this.cacheFilePath, JSON.stringify(cacheData), "utf-8"); } catch (error) { logger.error("Failed to save cache to disk", error); throw error; } } else { const tempPath = `${this.cacheFilePath}.tmp`; try { await fs.writeFile(tempPath, JSON.stringify(cacheData), "utf-8"); await fs.rename(tempPath, this.cacheFilePath); } catch (error) { try { await fs.unlink(tempPath); } catch {} logger.error("Failed to save cache to disk", error); throw error; } }
  }
  protected async acquireLock<T>(operation: () => Promise<T>): Promise<T> { const previousLock = this.writeLock; let resolveLock: () => void; this.writeLock = new Promise<void>((resolve) => { resolveLock = resolve; }); await previousLock; try { return await operation(); } finally { resolveLock!(); } }
  async get(key: string): Promise<unknown | null> { await this.initialize(); const entry = this.memoryCache.get(key); if (!entry) { this.stats.misses++; return null; } if (entry.ttl != null && Date.now() - entry.timestamp > entry.ttl) { this.memoryCache.delete(key); this.stats.misses++; return null; } if (entry.filePath) { const isStaleEntry = await this.isFileStale(entry); if (isStaleEntry) { this.memoryCache.delete(key); this.stats.misses++; return null; } } this.stats.hits++; return entry.value; }
  async set(key: string, value: unknown, options?: { ttl?: number; filePath?: string }): Promise<void> { await this.initialize(); await this.acquireLock(async () => { let fileMtime: number | undefined; let fileSize: number | undefined; if (options?.filePath) { try { const s = await fs.stat(options.filePath); fileMtime = s.mtimeMs; fileSize = s.size; } catch {} } const serializedValue = value === undefined ? null : JSON.parse(JSON.stringify(value)); const entry: ExtendedCacheEntry = { value: serializedValue, timestamp: Date.now(), ttl: options?.ttl !== undefined ? options.ttl : this.maxAge, filePath: options?.filePath, fileMtime, fileSize, }; this.memoryCache.set(key, entry); this.lastModified = Date.now(); if (this.memoryCache.size > this.maxEntries) { const firstKey = this.memoryCache.keys().next().value; if (firstKey !== undefined) this.memoryCache.delete(firstKey); } await this.saveToDisk(); }); }
  async delete(key: string): Promise<void> { await this.initialize(); await this.acquireLock(async () => { this.memoryCache.delete(key); this.lastModified = Date.now(); await this.saveToDisk(); }); }
  async clear(): Promise<void> { await this.initialize(); await this.acquireLock(async () => { this.memoryCache.clear(); this.stats = { hits: 0, misses: 0 }; this.lastModified = Date.now(); await this.saveToDisk(); }); }
  async has(key: string): Promise<boolean> { const value = await this.get(key); return value !== null; }
  protected async isFileStale(entry: ExtendedCacheEntry): Promise<boolean> { if (!entry.filePath) return false; try { const s = await fs.stat(entry.filePath); if (entry.fileSize !== undefined && s.size !== entry.fileSize) return true; if (entry.fileMtime !== undefined && s.mtimeMs !== entry.fileMtime) return true; } catch { return true; } return false; }
  async isStale(key: string): Promise<boolean> { await this.initialize(); const entry = this.memoryCache.get(key); if (!entry) return true; return this.isFileStale(entry); }
  async prune(): Promise<void> { await this.initialize(); await this.acquireLock(async () => { const now = Date.now(); const keysToDelete: string[] = []; for (const [key, entry] of this.memoryCache) { if (entry.ttl != null && now - entry.timestamp > entry.ttl) keysToDelete.push(key); } for (const key of keysToDelete) this.memoryCache.delete(key); if (keysToDelete.length > 0) { this.lastModified = Date.now(); await this.saveToDisk(); } }); }
}
