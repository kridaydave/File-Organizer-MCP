# Performance Optimization Guide

Best practices for optimizing File Organizer MCP performance.

---

## Table of Contents

- [Benchmarking](#benchmarking)
- [Memory Optimization](#memory-optimization)
- [Parallel Processing](#parallel-processing)
- [Caching Strategies](#caching-strategies)
- [I/O Optimization](#io-optimization)

---

## Benchmarking

### Measuring Performance

```typescript
import { performance } from "perf_hooks";

class PerformanceBenchmark {
  private startTime: number = 0;
  private marks: Map<string, number> = new Map();

  start(label: string): void {
    this.startTime = performance.now();
    this.marks.set(label, this.startTime);
  }

  end(label: string): number {
    const start = this.marks.get(label) || this.startTime;
    const duration = performance.now() - start;
    console.log(`${label}: ${duration.toFixed(2)}ms`);
    return duration;
  }

  mark(name: string): void {
    this.marks.set(name, performance.now());
  }

  measure(startLabel: string, endLabel: string): number {
    const start = this.marks.get(startLabel);
    const end = this.marks.get(endLabel);
    return (end || 0) - (start || 0);
  }
}

// Usage
const bench = new PerformanceBenchmark();
bench.start("operation");
await performOperation();
bench.end("operation");
```

### Performance Metrics

| Metric       | Description             | Target           |
| ------------ | ----------------------- | ---------------- |
| Files/second | Processing throughput   | > 1000 files/sec |
| Memory usage | Peak memory consumption | < 500MB          |
| Latency      | Time per operation      | < 100ms          |
| Hash speed   | SHA-256 computation     | > 50MB/s         |

---

## Memory Optimization

### Streaming Large Files

```typescript
import * as fs from "fs";
import * as crypto from "crypto";
import * as stream from "stream";

async function streamFileInChunks(
  filePath: string,
  chunkSize: number = 64 * 1024,
): Promise<Buffer> {
  const fileHandle = await fs.promises.open(filePath, "r");
  const fileStats = await fileHandle.stat();
  const buffer = Buffer.alloc(fileStats.size);

  let offset = 0;

  while (offset < fileStats.size) {
    const chunk = Buffer.alloc(Math.min(chunkSize, fileStats.size - offset));
    const { bytesRead } = await fileHandle.read(chunk, 0, chunkSize, offset);
    chunk.copy(buffer, offset, 0, bytesRead);
    offset += bytesRead;
  }

  await fileHandle.close();
  return buffer;
}

async function streamHash(
  input: string | stream.Readable,
  algorithm: string = "sha256",
): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const stream =
      typeof input === "string" ? fs.createReadStream(input) : input;

    stream.on("data", (data) => hash.update(data));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}
```

### Batch Processing

```typescript
interface BatchOptions {
  batchSize: number;
  maxConcurrency: number;
  progressInterval: number;
}

async function processInBatches<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  options: Partial<BatchOptions> = {},
): Promise<R[]> {
  const {
    batchSize = 100,
    maxConcurrency = 4,
    progressInterval = 1000,
  } = options;

  const results: R[] = [];
  let completed = 0;
  let lastProgress = Date.now();

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map((item, index) =>
        processor(item).then((result) => {
          completed++;
          const now = Date.now();
          if (now - lastProgress >= progressInterval) {
            const percent = ((completed / items.length) * 100).toFixed(1);
            console.log(`Progress: ${percent}% (${completed}/${items.length})`);
            lastProgress = now;
          }
          return result;
        }),
      ),
    );

    results.push(...batchResults);

    // Allow GC to run between batches
    if (i > 0 && i % (batchSize * 10) === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return results;
}
```

---

## Parallel Processing

### Work Queue Pattern

```typescript
interface WorkerOptions {
  workerCount: number;
  timeout: number;
  retryCount: number;
}

class WorkQueue<T, R> {
  private workers: Worker[] = [];
  private queue: T[] = [];
  private results: R[] = [];
  private errors: Error[] = [];
  private activeCount = 0;

  constructor(
    private processor: (item: T) => Promise<R>,
    private options: WorkerOptions,
  ) {}

  async addWork(items: T[]): Promise<R[]> {
    this.queue.push(...items);

    const workers = Array.from(
      { length: this.options.workerCount },
      (_, i) => new Worker(`worker-${i}`, this),
    );
    this.workers = workers;

    await Promise.all(workers.map((w) => w.run()));
    return this.results;
  }

  private async processItem(item: T): Promise<R> {
    for (let attempt = 0; attempt < this.options.retryCount; attempt++) {
      try {
        return await Promise.race([
          this.processor(item),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("Timeout")),
              this.options.timeout,
            ),
          ),
        ]);
      } catch (error) {
        if (attempt === this.options.retryCount - 1) {
          this.errors.push(error as Error);
        }
      }
    }
    throw this.errors[0];
  }
}
```

### Load Balancing Strategies

```typescript
enum LoadBalanceStrategy {
  ROUND_ROBIN = "round-robin",
  LEAST_LOADED = "least-loaded",
  CAPABILITY_BASED = "capability-based",
}

class LoadBalancer {
  private workerLoads: Map<string, number> = new Map();

  selectWorker(
    workers: Worker[],
    strategy: LoadBalanceStrategy = LoadBalanceStrategy.LEAST_LOADED,
  ): Worker {
    switch (strategy) {
      case LoadBalanceStrategy.ROUND_ROBIN:
        return this.roundRobin(workers);

      case LoadBalanceStrategy.LEAST_LOADED:
        return this.leastLoaded(workers);

      case LoadBalanceStrategy.CAPABILITY_BASED:
        return this.capabilityBased(workers);

      default:
        return this.roundRobin(workers);
    }
  }

  private roundRobin(workers: Worker[]): Worker {
    const lastAssigned = this.workerLoads.get("last_assigned") || 0;
    const workerIndex = (lastAssigned + 1) % workers.length;
    this.workerLoads.set("last_assigned", workerIndex);
    return workers[workerIndex];
  }

  private leastLoaded(workers: Worker[]): Worker {
    let minLoad = Infinity;
    let selected = workers[0];

    for (const worker of workers) {
      const load = this.workerLoads.get(worker.id) || 0;
      if (load < minLoad) {
        minLoad = load;
        selected = worker;
      }
    }

    this.workerLoads.set(selected.id, minLoad + 1);
    return selected;
  }

  private capabilityBased(workers: Worker[]): Worker {
    const capabilities = workers.map((w) => w.getCapabilities());

    // Find worker with best match for required capabilities
    // Implementation depends on specific requirements
    return workers[0];
  }
}
```

---

## Caching Strategies

### Directory Cache

```typescript
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
}

class TimedCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxSize: number;
  private defaultTTL: number;

  constructor(maxSize: number = 1000, defaultTTL: number = 30000) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    entry.accessCount++;
    return entry.data;
  }

  set(key: string, data: T, ttl?: number): void {
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
      accessCount: 0,
    });
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.accessCount === 0 && entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}
```

### File Metadata Cache

```typescript
class FileMetadataCache {
  private statCache = new TimedCache<fs.Stats>(10000, 5000);
  private hashCache = new TimedCache<string>(5000, 60000);

  async getFileStats(filePath: string): Promise<fs.Stats | null> {
    const cached = this.statCache.get(filePath);
    if (cached) {
      return cached;
    }

    try {
      const stats = await fs.promises.stat(filePath);
      this.statCache.set(filePath, stats);
      return stats;
    } catch {
      return null;
    }
  }

  async getFileHash(filePath: string): Promise<string | null> {
    const cached = this.hashCache.get(filePath);
    if (cached) {
      return cached;
    }

    try {
      const hash = await streamHash(filePath);
      this.hashCache.set(filePath, hash);
      return hash;
    } catch {
      return null;
    }
  }

  invalidate(filePath: string): void {
    this.statCache.delete(filePath);
    this.hashCache.delete(filePath);
  }
}
```

---

## I/O Optimization

### Sequential vs Parallel I/O

```typescript
class IOOptimizer {
  private pendingOps: Map<string, Promise<unknown>> = new Map();

  async executeIO<T>(key: string, operation: () => Promise<T>): Promise<T> {
    // Deduplicate concurrent operations
    const existing = this.pendingOps.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const promise = operation().finally(() => {
      this.pendingOps.delete(key);
    });

    this.pendingOps.set(key, promise);
    return promise;
  }

  async batchIOSequential<T>(
    operations: Array<() => Promise<T>>,
  ): Promise<T[]> {
    const results: T[] = [];

    for (const op of operations) {
      results.push(await op());
    }

    return results;
  }

  async batchIOParallel<T>(
    operations: Array<() => Promise<T>>,
    concurrency: number = 4,
  ): Promise<T[]> {
    const batches = this.chunk(operations, concurrency);
    const results: T[] = [];

    for (const batch of batches) {
      const batchResults = await Promise.all(batch.map((op) => op()));
      results.push(...batchResults);
    }

    return results;
  }

  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
```

---

## Performance Monitoring

```typescript
interface PerformanceMetrics {
  operationsCount: number;
  totalDuration: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  throughput: number;
  memoryUsage: NodeJS.MemoryUsage;
}

class MetricsCollector {
  private metrics: PerformanceMetrics = {
    operationsCount: 0,
    totalDuration: 0,
    averageDuration: 0,
    minDuration: Infinity,
    maxDuration: 0,
    throughput: 0,
    memoryUsage: process.memoryUsage(),
  };

  record(duration: number, itemsProcessed: number = 1): void {
    this.metrics.operationsCount++;
    this.metrics.totalDuration += duration;
    this.metrics.averageDuration =
      this.metrics.totalDuration / this.metrics.operationsCount;
    this.metrics.minDuration = Math.min(this.metrics.minDuration, duration);
    this.metrics.maxDuration = Math.max(this.metrics.maxDuration, duration);
    this.metrics.throughput = itemsProcessed / (duration / 1000);
    this.metrics.memoryUsage = process.memoryUsage();
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  report(): string {
    const m = this.metrics;
    return `
Performance Report
------------------
Operations: ${m.operationsCount}
Total Duration: ${m.totalDuration.toFixed(2)}ms
Average Duration: ${m.averageDuration.toFixed(2)}ms
Min/Max Duration: ${m.minDuration.toFixed(2)}ms / ${m.maxDuration.toFixed(2)}ms
Throughput: ${m.throughput.toFixed(2)} ops/sec
Memory: ${(m.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB / ${(m.memoryUsage.heapTotal / 1024 / 1024).toFixed(2)}MB
`.trim();
  }
}
```

---

## Configuration Recommendations

| Operation           | Batch Size | Concurrency | TTL |
| ------------------- | ---------- | ----------- | --- |
| File scanning       | 500-1000   | 2-4         | 30s |
| Hash computation    | 10-20      | 1-2         | 60s |
| File moving         | 50-100     | 2-4         | N/A |
| Metadata extraction | 100-200    | 4-8         | 5s  |
