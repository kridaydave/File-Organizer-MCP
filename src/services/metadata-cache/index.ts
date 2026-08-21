/**
 * Metadata Cache — Index (composed service)
 * Re-exports the full MetadataCacheService with no behavior change.
 */
import { MetadataCacheLegacyMixin } from "./legacy.js";
export type { CacheStats } from "./stats.js";
export type { ExtendedCacheEntry } from "./store.js";
export class MetadataCacheService extends MetadataCacheLegacyMixin {}
export const globalMetadataCache = new MetadataCacheService();
