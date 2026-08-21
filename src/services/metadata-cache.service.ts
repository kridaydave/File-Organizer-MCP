/**
 * Metadata Cache Service — barrel (backward compat)
 * Original 943-line file split into src/services/metadata-cache/* — no behavior change.
 * Re-exports `MetadataCacheService`, `globalMetadataCache`, `CacheStats`.
 */
export { MetadataCacheService, globalMetadataCache } from "./metadata-cache/index.js";
export type { CacheStats } from "./metadata-cache/stats.js";
export type { ExtendedCacheEntry } from "./metadata-cache/store.js";
