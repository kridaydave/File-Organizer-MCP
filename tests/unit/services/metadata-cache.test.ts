/**
 * Metadata Cache Service Tests - Phase 2.5
 * Tests for caching, atomic writes, invalidation
 */

import fs from "fs/promises";
import path from "path";
import { MetadataCacheService } from "../../../src/services/metadata-cache.service.js";

describe("MetadataCacheService", () => {
  let service: MetadataCacheService;
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(process.cwd(), "tests", "temp", "cache-"));
    service = new MetadataCacheService({ cacheDir });
  });

  afterEach(async () => {
    try {
      await fs.rm(cacheDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ==================== UNIT TESTS ====================

  describe("get", () => {
    it("should return null for non-existent key", async () => {
      const result = await service.get("nonexistent");
      expect(result).toBeNull();
    });

    it("should return cached value", async () => {
      const key = "test-key";
      const value = { title: "Test", artist: "Artist" };

      await service.set(key, value);
      const result = await service.get(key);

      expect(result).toEqual(value);
    });

    it("should return null for expired cache entry", async () => {
      const key = "expired-key";
      const value = { data: "test" };

      // Set with very short TTL
      await service.set(key, value, { ttl: 1 }); // 1ms TTL
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const result = await service.get(key);
      expect(result).toBeNull();
    });

    it("should handle nested keys", async () => {
      const key = "audio/metadata/song1";
      const value = { title: "Song" };

      await service.set(key, value);
      const result = await service.get(key);

      expect(result).toEqual(value);
    });

    it("should handle keys with special characters", async () => {
      const key = "file:/path/to/song.mp3";
      const value = { title: "Song" };

      await service.set(key, value);
      const result = await service.get(key);

      expect(result).toEqual(value);
    });
  });

  describe("set", () => {
    it("should store value in cache", async () => {
      const key = "store-test";
      const value = { data: "test-value" };

      await service.set(key, value);
      const result = await service.get(key);

      expect(result).toEqual(value);
    });

    it("should overwrite existing value", async () => {
      const key = "overwrite-test";
      
      await service.set(key, { version: 1 });
      await service.set(key, { version: 2 });
      
      const result = await service.get(key);
      expect(result).toEqual({ version: 2 });
    });

    it("should store complex objects", async () => {
      const key = "complex-test";
      const value = {
        title: "Complex Song",
        artist: "Artist Name",
        album: "Album Name",
        year: 2023,
        tracks: [
          { number: 1, title: "Track 1" },
          { number: 2, title: "Track 2" },
        ],
        metadata: {
          bitrate: 320000,
          sampleRate: 44100,
        },
      };

      await service.set(key, value);
      const result = await service.get(key);

      expect(result).toEqual(value);
    });

    it("should handle Date objects", async () => {
      const key = "date-test";
      const date = new Date("2023-06-15T14:30:00Z");
      const value = { extractedAt: date };

      await service.set(key, value);
      const result = await service.get(key);

      expect(result?.extractedAt).toEqual(date.toISOString());
    });
  });

  describe("delete", () => {
    it("should remove cached value", async () => {
      const key = "delete-test";
      await service.set(key, { data: "to-delete" });

      await service.delete(key);
      const result = await service.get(key);

      expect(result).toBeNull();
    });

    it("should handle deleting non-existent key", async () => {
      await expect(service.delete("nonexistent")).resolves.not.toThrow();
    });
  });

  describe("clear", () => {
    it("should remove all cached values", async () => {
      await service.set("key1", { data: 1 });
      await service.set("key2", { data: 2 });
      await service.set("key3", { data: 3 });

      await service.clear();

      expect(await service.get("key1")).toBeNull();
      expect(await service.get("key2")).toBeNull();
      expect(await service.get("key3")).toBeNull();
    });

    it("should handle empty cache", async () => {
      await expect(service.clear()).resolves.not.toThrow();
    });
  });

  describe("has", () => {
    it("should return true for existing key", async () => {
      const key = "has-test";
      await service.set(key, { data: "exists" });

      const result = await service.has(key);
      expect(result).toBe(true);
    });

    it("should return false for non-existent key", async () => {
      const result = await service.has("nonexistent");
      expect(result).toBe(false);
    });

    it("should return false for expired key", async () => {
      const key = "expired-has-test";
      await service.set(key, { data: "test" }, { ttl: 1 });
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const result = await service.has(key);
      expect(result).toBe(false);
    });
  });

  // ==================== PERSISTENCE TESTS ====================

  describe("Persistence", () => {
    it("should persist cache to disk", async () => {
      const key = "persist-test";
      const value = { data: "persistent" };

      await service.set(key, value);
      
      // Create new service instance pointing to same directory
      const newService = new MetadataCacheService({ cacheDir });
      const result = await newService.get(key);

      expect(result).toEqual(value);
    });

    it("should load existing cache on initialization", async () => {
      // Pre-populate cache file
      const cacheData = {
        entries: {
          "preloaded": {
            value: { title: "Preloaded" },
            timestamp: Date.now(),
            ttl: null,
          },
        },
      };
      
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(
        path.join(cacheDir, "metadata-cache.json"),
        JSON.stringify(cacheData),
      );

      const newService = new MetadataCacheService({ cacheDir });
      const result = await newService.get("preloaded");

      expect(result).toEqual({ title: "Preloaded" });
    });

    it("should handle corrupted cache file", async () => {
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(
        path.join(cacheDir, "metadata-cache.json"),
        "not valid json",
      );

      // Should not throw on initialization
      const newService = new MetadataCacheService({ cacheDir });
      const result = await newService.get("any");
      expect(result).toBeNull();
    });

    it("should handle missing cache directory", async () => {
      const nonExistentDir = path.join(cacheDir, "nonexistent", "nested");
      const newService = new MetadataCacheService({ cacheDir: nonExistentDir });

      await newService.set("key", { data: "test" });
      const result = await newService.get("key");

      expect(result).toEqual({ data: "test" });
    });
  });

  // ==================== TTL TESTS ====================

  describe("TTL (Time To Live)", () => {
    it("should expire entries after TTL", async () => {
      const key = "ttl-test";
      const value = { data: "expires" };

      await service.set(key, value, { ttl: 50 }); // 50ms TTL
      
      // Should exist immediately
      expect(await service.get(key)).toEqual(value);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should be expired
      expect(await service.get(key)).toBeNull();
    });

    it("should not expire entries without TTL", async () => {
      const key = "no-ttl-test";
      const value = { data: "persistent" };

      await service.set(key, value); // No TTL
      
      // Wait
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Should still exist
      expect(await service.get(key)).toEqual(value);
    });

    it("should update TTL on set", async () => {
      const key = "update-ttl";
      
      // Set with short TTL
      await service.set(key, { version: 1 }, { ttl: 50 });
      
      // Update with longer TTL before expiration
      await new Promise(resolve => setTimeout(resolve, 20));
      await service.set(key, { version: 2 }, { ttl: 200 });
      
      // Wait past original TTL
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should still exist due to TTL update
      expect(await service.get(key)).toEqual({ version: 2 });
    });
  });

  // ==================== STATS TESTS ====================

  describe("getStats", () => {
    it("should return cache statistics", async () => {
      await service.set("key1", { data: 1 });
      await service.set("key2", { data: 2 });

      const stats = await service.getStats();

      expect(stats.entries).toBe(2);
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });

    it("should track hits and misses", async () => {
      await service.set("exists", { data: "yes" });
      
      // Cache hit
      await service.get("exists");
      
      // Cache miss
      await service.get("notexists");
      
      const stats = await service.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it("should return zero stats for empty cache", async () => {
      const stats = await service.getStats();

      expect(stats.entries).toBe(0);
      expect(stats.size).toBe(0);
    });
  });

  // ==================== VALIDATION TESTS ====================

  describe("File Validation", () => {
    it("should invalidate stale cache entries based on file mtime", async () => {
      const filePath = path.join(cacheDir, "test.txt");
      await fs.writeFile(filePath, "content");
      
      const key = `file:${filePath}`;
      await service.set(key, { cached: "data" }, { filePath });
      
      // Modify file
      await new Promise(resolve => setTimeout(resolve, 10));
      await fs.writeFile(filePath, "modified content");
      
      // Should be stale now
      const isStale = await service.isStale(key);
      expect(isStale).toBe(true);
    });

    it("should return fresh for unchanged files", async () => {
      const filePath = path.join(cacheDir, "unchanged.txt");
      await fs.writeFile(filePath, "content");
      
      const key = `file:${filePath}`;
      await service.set(key, { cached: "data" }, { filePath });
      
      const isStale = await service.isStale(key);
      expect(isStale).toBe(false);
    });

    it("should handle missing files", async () => {
      const filePath = path.join(cacheDir, "deleted.txt");
      await fs.writeFile(filePath, "content");
      
      const key = `file:${filePath}`;
      await service.set(key, { cached: "data" }, { filePath });
      
      // Delete file
      await fs.unlink(filePath);
      
      const isStale = await service.isStale(key);
      expect(isStale).toBe(true);
    });
  });

  // ==================== ATOMIC WRITE TESTS ====================

  describe("Atomic Writes", () => {
    it("should write cache atomically", async () => {
      // Rapid concurrent writes
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(service.set(`concurrent-${i}`, { index: i }));
      }
      
      await Promise.all(promises);
      
      // All values should be present
      for (let i = 0; i < 10; i++) {
        const result = await service.get(`concurrent-${i}`);
        expect(result).toEqual({ index: i });
      }
    });
  });

  // ==================== CACHE PRUNING TESTS ====================

  describe("prune", () => {
    it("should remove expired entries", async () => {
      await service.set("fresh", { data: "fresh" });
      await service.set("expired", { data: "expired" }, { ttl: 1 });
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await service.prune();
      
      expect(await service.get("fresh")).toEqual({ data: "fresh" });
      expect(await service.get("expired")).toBeNull();
    });

    it("should handle empty cache during prune", async () => {
      await expect(service.prune()).resolves.not.toThrow();
    });
  });

  // ==================== EDGE CASE TESTS ====================

  describe("Edge Cases", () => {
    it("should handle empty string keys", async () => {
      await service.set("", { data: "empty key" });
      const result = await service.get("");
      expect(result).toEqual({ data: "empty key" });
    });

    it("should handle null values", async () => {
      await service.set("null-key", null);
      const result = await service.get("null-key");
      expect(result).toBeNull();
    });

    it("should handle undefined values", async () => {
      await service.set("undefined-key", undefined);
      const result = await service.get("undefined-key");
      expect(result).toBeNull();
    });

    it("should handle very long keys", async () => {
      const longKey = "a".repeat(500);
      const value = { data: "test" };
      
      await service.set(longKey, value);
      const result = await service.get(longKey);
      
      expect(result).toEqual(value);
    });

    it("should handle special characters in keys", async () => {
      const keys = [
        "key:with:colons",
        "key/with/slashes",
        "key\\with\\backslashes",
        "key with spaces",
        "key\nwith\nnewlines",
        "key\twith\ttabs",
      ];
      
      for (const key of keys) {
        await service.set(key, { key });
        const result = await service.get(key);
        expect(result).toEqual({ key });
      }
    });

    it("should handle large values", async () => {
      const key = "large-value";
      const value = {
        data: "x".repeat(10000),
        array: Array(1000).fill({ item: "data" }),
      };
      
      await service.set(key, value);
      const result = await service.get(key);
      
      expect(result).toEqual(value);
    });

    it("should handle many entries", async () => {
      const entries = 100;
      
      for (let i = 0; i < entries; i++) {
        await service.set(`entry-${i}`, { index: i, data: `value-${i}` });
      }
      
      const stats = await service.getStats();
      expect(stats.entries).toBe(entries);
    });

    it("should handle concurrent reads and writes", async () => {
      const operations = [];
      
      for (let i = 0; i < 20; i++) {
        operations.push(service.set(`concurrent-${i}`, { value: i }));
        operations.push(service.get(`concurrent-${i}`));
        operations.push(service.has(`concurrent-${i}`));
      }
      
      await Promise.all(operations);
      
      // All sets should succeed
      for (let i = 0; i < 20; i++) {
        const result = await service.get(`concurrent-${i}`);
        expect(result?.value).toBe(i);
      }
    });

    it("should handle cache file corruption gracefully", async () => {
      await service.set("key1", { data: "value1" });
      
      // Corrupt the cache file
      const cacheFile = path.join(cacheDir, "metadata-cache.json");
      await fs.writeFile(cacheFile, "{ invalid json");
      
      // Should handle gracefully
      const result = await service.get("key1");
      // Might return null or recover, but should not throw
    });

    it("should handle permission errors gracefully", async () => {
      // This test might not work on all systems
      const restrictedDir = path.join(cacheDir, "restricted");
      await fs.mkdir(restrictedDir, { recursive: true });
      
      try {
        // Try to make directory read-only (may not work on Windows)
        await fs.chmod(restrictedDir, 0o444);
        
        const restrictedService = new MetadataCacheService({ 
          cacheDir: restrictedDir 
        });
        
        // Should handle permission error gracefully
        await restrictedService.set("key", { data: "test" });
      } catch {
        // Expected on some systems
      } finally {
        // Restore permissions for cleanup
        await fs.chmod(restrictedDir, 0o755).catch(() => {});
      }
    });
  });

  // ==================== INTEGRATION TESTS ====================

  describe("Integration", () => {
    it("should work with audio metadata workflow", async () => {
      // Simulate caching audio metadata
      const audioFiles = [
        { path: "/music/song1.mp3", title: "Song 1", artist: "Artist A" },
        { path: "/music/song2.mp3", title: "Song 2", artist: "Artist B" },
        { path: "/music/song3.mp3", title: "Song 3", artist: "Artist A" },
      ];
      
      // Cache metadata
      for (const file of audioFiles) {
        await service.set(`audio:${file.path}`, file);
      }
      
      // Retrieve cached metadata
      const cached = await service.get(`audio:/music/song1.mp3`);
      expect(cached?.title).toBe("Song 1");
      
      // Update metadata
      await service.set(`audio:/music/song1.mp3`, { ...cached, playCount: 1 });
      const updated = await service.get(`audio:/music/song1.mp3`);
      expect(updated?.playCount).toBe(1);
    });

    it("should work with image metadata workflow", async () => {
      const imageFiles = [
        { 
          path: "/photos/img1.jpg", 
          width: 1920, 
          height: 1080,
          camera: { make: "Canon", model: "EOS" },
        },
        { 
          path: "/photos/img2.jpg", 
          width: 4032, 
          height: 3024,
          gps: { lat: 40.7128, lng: -74.0060 },
        },
      ];
      
      // Cache with TTL for images
      for (const file of imageFiles) {
        await service.set(`image:${file.path}`, file, { ttl: 3600000 }); // 1 hour
      }
      
      // Batch retrieve
      const results = await Promise.all([
        service.get("image:/photos/img1.jpg"),
        service.get("image:/photos/img2.jpg"),
      ]);
      
      expect(results[0]?.camera?.make).toBe("Canon");
      expect(results[1]?.gps?.lat).toBe(40.7128);
    });

    it("should maintain cache across service restarts", async () => {
      const key = "persistent";
      const value = { data: "should persist" };
      
      // First service instance
      await service.set(key, value);
      
      // Simulate restart by creating new instance
      const newService = new MetadataCacheService({ cacheDir });
      
      // Should retrieve from persisted cache
      const result = await newService.get(key);
      expect(result).toEqual(value);
    });
  });
});
