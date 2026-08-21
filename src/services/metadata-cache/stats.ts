/**
 * Metadata Cache — Stats
 * Extracted from metadata-cache.service.ts — no behavior change.
 */
import { MetadataCacheStore as Base } from "./store.js";
export interface CacheStats { entries: number; size: number; hits: number; misses: number; }
export class MetadataCacheStatsMixin extends Base {
  async getStats(): Promise<CacheStats> {
    await this.initialize();
    const STATS_CACHE_TTL = 5000; const now = Date.now();
    if (this.statsCache && now - this.statsCache.timestamp < STATS_CACHE_TTL && this.statsCache.timestamp >= this.lastModified) return this.statsCache.data;
    let size = 0; for (const entry of this.memoryCache.values()) size += JSON.stringify(entry).length;
    const stats: CacheStats = { entries: this.memoryCache.size, size, hits: this.stats.hits, misses: this.stats.misses, };
    this.statsCache = { data: stats, timestamp: now }; return stats;
  }
}
