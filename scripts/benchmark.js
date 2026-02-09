#!/usr/bin/env node
/**
 * File Reader Performance Benchmark Script
 *
 * Generates test files of various sizes and measures:
 * - Read latency for each file size
 * - Throughput (files/sec)
 * - Memory delta during operations
 *
 * Output: JSON format for CI/CD integration
 *
 * @module scripts/benchmark
 * @version 3.1.5
 */
import fs from "fs/promises";
import path from "path";
import os from "os";
import { performance } from "perf_hooks";
import { FileReaderFactory } from "../src/readers/factory.js";
import { isOk } from "../src/readers/result.js";
// Benchmark configuration
const CONFIG = {
    iterations: 100,
    warmupIterations: 10,
    fileSizes: [
        { name: "1KB", bytes: 1 * 1024 },
        { name: "100KB", bytes: 100 * 1024 },
        { name: "1MB", bytes: 1 * 1024 * 1024 },
        { name: "10MB", bytes: 10 * 1024 * 1024 },
    ],
    outputFormat: process.env.BENCHMARK_FORMAT || "json", // 'json' or 'human'
};
// Thresholds for pass/fail
const THRESHOLDS = {
    maxP95LatencyMs: 1000, // 1 second
    minThroughputFilesPerSec: 10,
    maxMemoryDeltaMb: 100,
};
async function main() {
    console.error("Starting File Reader Benchmark...\n");
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "file-reader-benchmark-"));
    const reader = FileReaderFactory.createDefault();
    try {
        const results = [];
        let totalDuration = 0;
        let totalFilesRead = 0;
        let totalBytesRead = 0;
        // Generate and benchmark each file size
        for (const sizeConfig of CONFIG.fileSizes) {
            const result = await benchmarkFileSize(reader, tempDir, sizeConfig);
            results.push(result);
            totalDuration += result.latencies.mean * result.iterations;
            totalFilesRead += result.iterations;
            totalBytesRead += result.bytes * result.iterations;
            if (CONFIG.outputFormat === "human") {
                printHumanResult(result);
            }
        }
        // Generate report
        const report = {
            metadata: {
                timestamp: new Date().toISOString(),
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
                cpus: os.cpus().length,
                totalMemoryGb: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
            },
            summary: {
                totalDurationMs: Math.round(totalDuration),
                totalFilesRead,
                totalBytesRead,
                overallThroughputFilesPerSec: Math.round((totalFilesRead / totalDuration) * 1000),
                overallThroughputMbPerSec: parseFloat((((totalBytesRead / totalDuration) * 1000) / (1024 * 1024)).toFixed(2)),
            },
            results,
            passed: checkThresholds(results),
        };
        // Output results
        if (CONFIG.outputFormat === "json") {
            console.log(JSON.stringify(report, null, 2));
        }
        else {
            printHumanSummary(report);
        }
        // Exit with appropriate code
        process.exit(report.passed ? 0 : 1);
    }
    finally {
        // Cleanup
        await fs.rm(tempDir, { recursive: true, force: true });
    }
}
async function benchmarkFileSize(reader, tempDir, sizeConfig) {
    const testFile = path.join(tempDir, `benchmark-${sizeConfig.name}.bin`);
    // Generate test file
    const content = Buffer.alloc(sizeConfig.bytes, 0x42); // Fill with 'B'
    await fs.writeFile(testFile, content);
    // Warmup
    for (let i = 0; i < CONFIG.warmupIterations; i++) {
        const result = await reader.read(testFile);
        if (!isOk(result)) {
            throw new Error(`Warmup failed: ${result.error?.message}`);
        }
    }
    // Force GC if available
    if (global.gc) {
        global.gc();
    }
    const initialMemory = process.memoryUsage();
    const latencies = [];
    let peakMemory = initialMemory.heapUsed;
    // Benchmark iterations
    for (let i = 0; i < CONFIG.iterations; i++) {
        const start = performance.now();
        const result = await reader.read(testFile);
        const end = performance.now();
        if (!isOk(result)) {
            throw new Error(`Read failed: ${result.error?.message}`);
        }
        latencies.push(end - start);
        // Track peak memory
        const current = process.memoryUsage();
        if (current.heapUsed > peakMemory) {
            peakMemory = current.heapUsed;
        }
    }
    // Calculate statistics
    const sorted = [...latencies].sort((a, b) => a - b);
    const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    return {
        fileSize: sizeConfig.name,
        bytes: sizeConfig.bytes,
        iterations: CONFIG.iterations,
        latencies: {
            min: Math.round(sorted[0] * 100) / 100,
            max: Math.round(sorted[sorted.length - 1] * 100) / 100,
            mean: Math.round(mean * 100) / 100,
            p50: Math.round(sorted[Math.floor(sorted.length * 0.5)] * 100) / 100,
            p95: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 100) / 100,
            p99: Math.round(sorted[Math.floor(sorted.length * 0.99)] * 100) / 100,
        },
        throughput: {
            filesPerSecond: Math.round(1000 / mean),
            mbPerSecond: parseFloat((((sizeConfig.bytes / mean) * 1000) / (1024 * 1024)).toFixed(2)),
        },
        memory: {
            initialMb: Math.round((initialMemory.heapUsed / (1024 * 1024)) * 100) / 100,
            peakMb: Math.round((peakMemory / (1024 * 1024)) * 100) / 100,
            deltaMb: Math.round(((peakMemory - initialMemory.heapUsed) / (1024 * 1024)) * 100) / 100,
        },
    };
}
function checkThresholds(results) {
    for (const result of results) {
        if (result.latencies.p95 > THRESHOLDS.maxP95LatencyMs) {
            return false;
        }
        if (result.throughput.filesPerSecond < THRESHOLDS.minThroughputFilesPerSec) {
            return false;
        }
        if (result.memory.deltaMb > THRESHOLDS.maxMemoryDeltaMb) {
            return false;
        }
    }
    return true;
}
function printHumanResult(result) {
    console.error(`\n=== ${result.fileSize} File Results ===`);
    console.error(`Iterations: ${result.iterations}`);
    console.error(`\nLatency (ms):`);
    console.error(`  Min: ${result.latencies.min}`);
    console.error(`  Max: ${result.latencies.max}`);
    console.error(`  Mean: ${result.latencies.mean}`);
    console.error(`  P50: ${result.latencies.p50}`);
    console.error(`  P95: ${result.latencies.p95}`);
    console.error(`  P99: ${result.latencies.p99}`);
    console.error(`\nThroughput:`);
    console.error(`  Files/sec: ${result.throughput.filesPerSecond}`);
    console.error(`  MB/sec: ${result.throughput.mbPerSecond}`);
    console.error(`\nMemory:`);
    console.error(`  Initial: ${result.memory.initialMb} MB`);
    console.error(`  Peak: ${result.memory.peakMb} MB`);
    console.error(`  Delta: ${result.memory.deltaMb} MB`);
    console.error("=".repeat(40));
}
function printHumanSummary(report) {
    console.error("\n" + "=".repeat(60));
    console.error("BENCHMARK SUMMARY");
    console.error("=".repeat(60));
    console.error(`\nSystem:`);
    console.error(`  Node.js: ${report.metadata.nodeVersion}`);
    console.error(`  Platform: ${report.metadata.platform} (${report.metadata.arch})`);
    console.error(`  CPUs: ${report.metadata.cpus}`);
    console.error(`  Memory: ${report.metadata.totalMemoryGb} GB`);
    console.error(`\nOverall Results:`);
    console.error(`  Total Duration: ${report.summary.totalDurationMs} ms`);
    console.error(`  Total Files Read: ${report.summary.totalFilesRead.toLocaleString()}`);
    console.error(`  Total Bytes Read: ${(report.summary.totalBytesRead / (1024 * 1024)).toFixed(2)} MB`);
    console.error(`  Throughput: ${report.summary.overallThroughputFilesPerSec} files/sec`);
    console.error(`  Data Rate: ${report.summary.overallThroughputMbPerSec} MB/sec`);
    console.error(`\nStatus: ${report.passed ? "✅ PASSED" : "❌ FAILED"}`);
    console.error("=".repeat(60));
}
// Run benchmark
main().catch((error) => {
    console.error("Benchmark failed:", error);
    process.exit(1);
});
//# sourceMappingURL=benchmark.js.map