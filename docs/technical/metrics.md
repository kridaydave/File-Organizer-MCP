# Technical Metrics

This document defines the metrics collection framework, monitoring standards, and performance benchmarks for the File Organizer MCP system.

---

## 1. TypeScript Interfaces for Metrics Collection

```typescript
// types/metrics.ts

export interface AgentMetrics {
  agentId: string;
  agentType: AgentType;
  sessionId: string;
  timestamp: Date;
  successRate: number;
  responseTimeMs: number;
  operationsCount: number;
  errorCount: number;
  kpis: AgentKPI[];
}

export type AgentType =
  | 'Shepherd'
  | 'Retriever'
  | 'Kane'
  | 'Sentinel'
  | 'Bones'
  | 'Jonnah'
  | 'Echo';

export interface AgentKPI {
  name: string;
  value: number;
  unit: string;
  threshold: KPIThreshold;
  status: KPIStatus;
}

export interface KPIThreshold {
  warning: number;
  critical: number;
  target: number;
}

export type KPIStatus = 'optimal' | 'acceptable' | 'degraded' | 'critical';

export interface SystemMetrics {
  systemId: string;
  version: string;
  uptime: number;
  memoryUsage: MemoryMetrics;
  cpuUsage: number;
  activeAgents: number;
  queueDepth: number;
  throughput: ThroughputMetrics;
}

export interface MemoryMetrics {
  heapUsed: number;
  heapTotal: number;
  external: number;
  unit: 'bytes';
}

export interface ThroughputMetrics {
  requestsPerSecond: number;
  operationsPerSecond: number;
  averageLatencyMs: number;
  percentileLatency: PercentileLatency;
}

export interface PercentileLatency {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
}

export interface MetricsCollectorConfig {
  enabled: boolean;
  flushIntervalMs: number;
  maxBufferSize: number;
  exportEndpoint?: string;
  sampleRate: number;
}

export interface MetricsEvent {
  type: MetricsEventType;
  timestamp: Date;
  payload: Record<string, unknown>;
  severity: 'info' | 'warning' | 'error' | 'critical';
}

export type MetricsEventType =
  | 'agent_started'
  | 'agent_completed'
  | 'agent_failed'
  | 'operation_started'
  | 'operation_completed'
  | 'operation_failed'
  | 'resource_threshold_exceeded'
  | 'system_warning'
  | 'system_error';
```

---

## 2. Agent-Level Metrics

### 2.1 Success Rate Calculation

```typescript
interface SuccessRateMetrics {
  agentId: string;
  period: TimePeriod;
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  successRate: number;
  errorBreakdown: Record<string, number>;
}

function calculateSuccessRate(metrics: SuccessRateMetrics): number {
  if (metrics.totalOperations === 0) return 100;
  return (metrics.successfulOperations / metrics.totalOperations) * 100;
}

const SUCCESS_RATE_THRESHOLDS = {
  optimal: 99,
  acceptable: 95,
  degraded: 90,
  critical: 85,
} as const;
```

### 2.2 Response Time Metrics

```typescript
interface ResponseTimeMetrics {
  agentId: string;
  operationType: string;
  samples: number[];
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
  percentileLatency: PercentileLatency;
}

const RESPONSE_TIME_THRESHOLDS = {
  fast: { ms: 100, operationsPerSecond: 10 },
  acceptable: { ms: 500, operationsPerSecond: 2 },
  slow: { ms: 1000, operationsPerSecond: 1 },
} as const;
```

### 2.3 Agent KPIs by Type

```typescript
const AGENT_KPIS: Record<AgentType, AgentKPI[]> = {
  Shepherd: [
    {
      name: 'task_decomposition_accuracy',
      unit: '%',
      threshold: { warning: 90, critical: 80, target: 95 },
    },
    { name: 'tasks_per_minute', unit: 'count', threshold: { warning: 5, critical: 3, target: 8 } },
    { name: 'mapping_accuracy', unit: '%', threshold: { warning: 95, critical: 90, target: 98 } },
  ],
  Retriever: [
    { name: 'context_accuracy', unit: '%', threshold: { warning: 85, critical: 75, target: 92 } },
    {
      name: 'search_latency_ms',
      unit: 'ms',
      threshold: { warning: 200, critical: 500, target: 100 },
    },
    {
      name: 'relevant_results_ratio',
      unit: '%',
      threshold: { warning: 80, critical: 70, target: 90 },
    },
  ],
  Kane: [
    { name: 'build_success_rate', unit: '%', threshold: { warning: 90, critical: 80, target: 95 } },
    { name: 'code_coverage', unit: '%', threshold: { warning: 80, critical: 70, target: 90 } },
    {
      name: 'implementation_latency_ms',
      unit: 'ms',
      threshold: { warning: 5000, critical: 10000, target: 3000 },
    },
  ],
  Sentinel: [
    {
      name: 'security_issues_caught',
      unit: 'count',
      threshold: { warning: 0, critical: 0, target: 5 },
    },
    { name: 'false_positive_rate', unit: '%', threshold: { warning: 10, critical: 20, target: 5 } },
    {
      name: 'audit_latency_ms',
      unit: 'ms',
      threshold: { warning: 1000, critical: 2000, target: 500 },
    },
  ],
  Bones: [
    { name: 'test_pass_rate', unit: '%', threshold: { warning: 90, critical: 80, target: 95 } },
    { name: 'edge_case_coverage', unit: '%', threshold: { warning: 80, critical: 70, target: 90 } },
    {
      name: 'test_execution_time_ms',
      unit: 'ms',
      threshold: { warning: 30000, critical: 60000, target: 15000 },
    },
  ],
  Jonnah: [
    { name: 'output_accuracy', unit: '%', threshold: { warning: 90, critical: 85, target: 95 } },
    {
      name: 'aggregation_latency_ms',
      unit: 'ms',
      threshold: { warning: 500, critical: 1000, target: 300 },
    },
    {
      name: 'error_detection_rate',
      unit: '%',
      threshold: { warning: 95, critical: 90, target: 98 },
    },
  ],
  Echo: [
    {
      name: 'documentation_coverage',
      unit: '%',
      threshold: { warning: 85, critical: 75, target: 95 },
    },
    {
      name: 'update_latency_ms',
      unit: 'ms',
      threshold: { warning: 2000, critical: 5000, target: 1000 },
    },
  ],
};
```

### 2.4 Metrics Collection Implementation

```typescript
class MetricsCollector {
  private buffer: AgentMetrics[] = [];
  private config: MetricsCollectorConfig;

  constructor(config: MetricsCollectorConfig) {
    this.config = config;
  }

  recordAgentMetric(metric: Omit<AgentMetrics, 'timestamp'>): void {
    const fullMetric: AgentMetrics = {
      ...metric,
      timestamp: new Date(),
    };

    if (Math.random() > this.config.sampleRate) return;

    this.buffer.push(fullMetric);

    if (this.buffer.length >= this.config.maxBufferSize) {
      this.flush();
    }
  }

  flush(): void {
    if (this.buffer.length === 0) return;

    if (this.config.exportEndpoint) {
      this.exportToEndpoint(this.buffer);
    }

    this.buffer = [];
  }

  private async exportToEndpoint(metrics: AgentMetrics[]): Promise<void> {
    try {
      await fetch(this.config.exportEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metrics, timestamp: new Date() }),
      });
    } catch {
      console.error('Failed to export metrics');
    }
  }
}
```

---

## 3. System-Level Metrics

### 3.1 Core System Metrics

```typescript
interface SystemHealthMetrics {
  status: 'healthy' | 'degraded' | 'unhealthy';
  components: ComponentHealth[];
  lastChecked: Date;
  checks: HealthCheck[];
}

interface ComponentHealth {
  name: string;
  status: 'up' | 'down' | 'degraded';
  latencyMs: number;
  errorRate: number;
}

interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  durationMs: number;
}

const SYSTEM_HEALTH_CHECKS: HealthCheck[] = [
  { name: 'disk_space', status: 'pass', message: 'Sufficient disk space', durationMs: 10 },
  { name: 'memory_availability', status: 'pass', message: 'Memory within limits', durationMs: 5 },
  { name: 'database_connection', status: 'pass', message: 'Connected', durationMs: 50 },
  { name: 'agent_pool_availability', status: 'pass', message: 'Agents available', durationMs: 20 },
];
```

### 3.2 Resource Utilization Metrics

```typescript
interface ResourceMetrics {
  cpu: {
    usagePercent: number;
    cores: number;
    loadAverage: number[];
  };
  memory: {
    usedBytes: number;
    totalBytes: number;
    availableBytes: number;
    usagePercent: number;
  };
  disk: {
    readBytes: number;
    writeBytes: number;
    readIOPS: number;
    writeIOPS: number;
    usagePercent: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    connectionCount: number;
  };
}

const RESOURCE_THRESHOLDS = {
  cpu: { warning: 70, critical: 90 },
  memory: { warning: 80, critical: 95 },
  disk: { warning: 75, critical: 90 },
  network: { warning: 1000, critical: 5000, unit: 'MB/s' },
} as const;
```

### 3.3 Queue and Throughput Metrics

```typescript
interface QueueMetrics {
  pendingTasks: number;
  processingTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageWaitTimeMs: number;
  maxWaitTimeMs: number;
  queueDepthByPriority: Record<number, number>;
}

interface ThroughputMetrics {
  requestsPerSecond: number;
  operationsPerSecond: number;
  bytesProcessedPerSecond: number;
  averageOperationSize: number;
}
```

---

## 4. Monitoring Dashboard Setup

### 4.1 Dashboard Configuration

```typescript
interface DashboardConfig {
  name: string;
  refreshIntervalMs: number;
  panels: DashboardPanel[];
  alerts: DashboardAlert[];
  timeRange: TimeRange;
}

interface DashboardPanel {
  id: string;
  title: string;
  type: 'graph' | 'stat' | 'table' | 'gauge';
  metrics: string[];
  position: { x: number; y: number; width: number; height: number };
  thresholds?: PanelThreshold[];
}

interface DashboardAlert {
  id: string;
  metric: string;
  condition: AlertCondition;
  severity: 'info' | 'warning' | 'error' | 'critical';
  notificationChannels: string[];
  cooldownMs: number;
}

interface AlertCondition {
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  value: number;
  duration: number;
}
```

### 4.2 Recommended Dashboard Panels

```typescript
const DEFAULT_DASHBOARD_PANELS: DashboardPanel[] = [
  {
    id: 'system-overview',
    title: 'System Overview',
    type: 'stat',
    metrics: ['system.uptime', 'system.activeAgents', 'system.queueDepth'],
    position: { x: 0, y: 0, width: 4, height: 2 },
  },
  {
    id: 'agent-success-rates',
    title: 'Agent Success Rates',
    type: 'graph',
    metrics: ['agent.successRate.*'],
    position: { x: 4, y: 0, width: 8, height: 3 },
  },
  {
    id: 'response-times',
    title: 'Response Times (P95)',
    type: 'graph',
    metrics: ['agent.responseTime.p95'],
    position: { x: 0, y: 3, width: 6, height: 3 },
  },
  {
    id: 'throughput',
    title: 'Throughput',
    type: 'graph',
    metrics: ['system.throughput.requestsPerSecond', 'system.throughput.operationsPerSecond'],
    position: { x: 6, y: 3, width: 6, height: 3 },
  },
  {
    id: 'resource-usage',
    title: 'Resource Usage',
    type: 'gauge',
    metrics: ['system.resources.cpu.usagePercent', 'system.resources.memory.usagePercent'],
    position: { x: 0, y: 6, width: 4, height: 2 },
  },
  {
    id: 'error-rate',
    title: 'Error Rate',
    type: 'graph',
    metrics: ['agent.errorCount.*'],
    position: { x: 4, y: 6, width: 4, height: 2 },
  },
  {
    id: 'kpi-summary',
    title: 'KPI Summary',
    type: 'table',
    metrics: ['agent.kpis.*'],
    position: { x: 8, y: 6, width: 4, height: 2 },
  },
];
```

### 4.3 Alert Configuration

```typescript
const DEFAULT_ALERTS: DashboardAlert[] = [
  {
    id: 'high-error-rate',
    metric: 'agent.errorRate',
    condition: { operator: 'gt', value: 5, duration: 300000 },
    severity: 'error',
    notificationChannels: ['slack', 'email'],
    cooldownMs: 900000,
  },
  {
    id: 'low-success-rate',
    metric: 'agent.successRate',
    condition: { operator: 'lt', value: 90, duration: 600000 },
    severity: 'warning',
    notificationChannels: ['slack'],
    cooldownMs: 1800000,
  },
  {
    id: 'high-response-time',
    metric: 'agent.responseTime.p95',
    condition: { operator: 'gt', value: 5000, duration: 300000 },
    severity: 'warning',
    notificationChannels: ['slack'],
    cooldownMs: 900000,
  },
  {
    id: 'system-resource-critical',
    metric: 'system.resources.*.usagePercent',
    condition: { operator: 'gt', value: 95, duration: 120000 },
    severity: 'critical',
    notificationChannels: ['slack', 'email', 'pager'],
    cooldownMs: 300000,
  },
  {
    id: 'agent-down',
    metric: 'system.activeAgents',
    condition: { operator: 'lt', value: 1, duration: 60000 },
    severity: 'critical',
    notificationChannels: ['slack', 'pager'],
    cooldownMs: 120000,
  },
];
```

---

## 5. Logging Standards

### 5.1 Log Format

```typescript
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  agentId?: string;
  sessionId?: string;
  operationId?: string;
  message: string;
  context: Record<string, unknown>;
  metadata: LogMetadata;
}

interface LogMetadata {
  file?: string;
  line?: number;
  function?: string;
  durationMs?: number;
  retryCount?: number;
}

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

const LOG_FORMAT = {
  timestamp: 'ISO8601',
  level: 'uppercase',
  fields: ['timestamp', 'level', 'agentId', 'sessionId', 'message', 'context'],
};
```

### 5.2 Log Levels by Operation

```typescript
const LOG_LEVEL_GUIDELINES: Record<string, LogLevel> = {
  agent_startup: 'INFO',
  agent_completion: 'INFO',
  agent_failure: 'ERROR',
  operation_start: 'DEBUG',
  operation_success: 'DEBUG',
  operation_failure: 'WARN',
  validation_passed: 'DEBUG',
  validation_failed: 'WARN',
  resource_threshold: 'WARN',
  system_error: 'ERROR',
  security_violation: 'FATAL',
  metrics_recorded: 'DEBUG',
  audit_event: 'INFO',
} as const;
```

### 5.3 Structured Logging Implementation

```typescript
class MetricsLogger {
  private context: Record<string, unknown>;

  constructor(context: Record<string, unknown>) {
    this.context = context;
  }

  log(level: LogLevel, message: string, additionalContext: Record<string, unknown> = {}): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...this.context, ...additionalContext },
      metadata: {
        file: new Error().stack?.split('\n')[2]?.trim().split('(')[0],
      },
    };

    this.write(entry);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('DEBUG', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('INFO', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('WARN', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('ERROR', message, context);
  }

  fatal(message: string, context?: Record<string, unknown>): void {
    this.log('FATAL', message, context);
  }

  private write(entry: LogEntry): void {
    console.log(JSON.stringify(entry));
  }
}
```

---

## 6. Resource Allocation Guidelines

### 6.1 Memory Allocation

```typescript
interface MemoryAllocation {
  heapSize: number;
  stackSize: number;
  bufferSize: number;
  cacheSize: number;
  maxFileSize: number;
}

const DEFAULT_MEMORY_ALLOCATION: MemoryAllocation = {
  heapSize: 512 * 1024 * 1024,
  stackSize: 1024 * 1024,
  bufferSize: 64 * 1024 * 1024,
  cacheSize: 128 * 1024 * 1024,
  maxFileSize: 1024 * 1024 * 1024,
};

const MEMORY_ALLOCATION_TIERS = {
  small: { heapSize: 256 * 1024 * 1024, maxFiles: 1000, maxDepth: 3 },
  medium: { heapSize: 512 * 1024 * 1024, maxFiles: 10000, maxDepth: 5 },
  large: { heapSize: 1024 * 1024 * 1024, maxFiles: 100000, maxDepth: 10 },
} as const;
```

### 6.2 Agent Pool Configuration

```typescript
interface AgentPoolConfig {
  shepherd: PoolConfig;
  retriever: PoolConfig;
  kane: PoolConfig;
  sentinel: PoolConfig;
  bones: PoolConfig;
  jonnah: PoolConfig;
  echo: PoolConfig;
}

interface PoolConfig {
  minInstances: number;
  maxInstances: number;
  maxQueueSize: number;
  timeoutMs: number;
  priority: number;
}

const DEFAULT_POOL_CONFIG: AgentPoolConfig = {
  shepherd: { minInstances: 1, maxInstances: 2, maxQueueSize: 100, timeoutMs: 60000, priority: 1 },
  retriever: { minInstances: 2, maxInstances: 5, maxQueueSize: 500, timeoutMs: 30000, priority: 2 },
  kane: { minInstances: 2, maxInstances: 8, maxQueueSize: 200, timeoutMs: 300000, priority: 3 },
  sentinel: { minInstances: 1, maxInstances: 3, maxQueueSize: 100, timeoutMs: 60000, priority: 1 },
  bones: { minInstances: 1, maxInstances: 4, maxQueueSize: 100, timeoutMs: 120000, priority: 2 },
  jonnah: { minInstances: 1, maxInstances: 2, maxQueueSize: 50, timeoutMs: 30000, priority: 1 },
  echo: { minInstances: 1, maxInstances: 2, maxQueueSize: 50, timeoutMs: 60000, priority: 4 },
};
```

### 6.3 Resource Scaling Policy

```typescript
interface ScalingPolicy {
  metric: string;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  scaleUpIncrement: number;
  scaleDownDecrement: number;
  cooldownMs: number;
}

const SCALING_POLICIES: ScalingPolicy[] = [
  {
    metric: 'queueDepth',
    scaleUpThreshold: 100,
    scaleDownThreshold: 20,
    scaleUpIncrement: 1,
    scaleDownDecrement: 1,
    cooldownMs: 120000,
  },
  {
    metric: 'cpuUsage',
    scaleUpThreshold: 80,
    scaleDownThreshold: 40,
    scaleUpIncrement: 1,
    scaleDownDecrement: 1,
    cooldownMs: 180000,
  },
  {
    metric: 'memoryUsage',
    scaleUpThreshold: 85,
    scaleDownThreshold: 50,
    scaleUpIncrement: 1,
    scaleDownDecrement: 1,
    cooldownMs: 180000,
  },
];
```

---

## 7. Performance Benchmarks

### 7.1 Baseline Performance Targets

```typescript
interface PerformanceBenchmark {
  operation: string;
  targetP50Ms: number;
  targetP95Ms: number;
  targetP99Ms: number;
  throughputTarget: number;
  resourceLimit: string;
}

const PERFORMANCE_BENCHMARKS: PerformanceBenchmark[] = [
  {
    operation: 'file_scan',
    targetP50Ms: 50,
    targetP95Ms: 200,
    targetP99Ms: 500,
    throughputTarget: 1000,
    resourceLimit: 'memory:256MB',
  },
  {
    operation: 'file_organize',
    targetP50Ms: 100,
    targetP95Ms: 500,
    targetP99Ms: 1000,
    throughputTarget: 100,
    resourceLimit: 'memory:512MB',
  },
  {
    operation: 'duplicate_detection',
    targetP50Ms: 500,
    targetP95Ms: 2000,
    targetP99Ms: 5000,
    throughputTarget: 10,
    resourceLimit: 'memory:1GB',
  },
  {
    operation: 'metadata_extraction',
    targetP50Ms: 20,
    targetP95Ms: 100,
    targetP99Ms: 250,
    throughputTarget: 500,
    resourceLimit: 'memory:256MB',
  },
  {
    operation: 'rollback_execution',
    targetP50Ms: 100,
    targetP95Ms: 500,
    targetP99Ms: 1000,
    throughputTarget: 50,
    resourceLimit: 'memory:512MB',
  },
];
```

### 7.2 Load Testing Configuration

```typescript
interface LoadTestConfig {
  warmupDurationMs: 30000;
  testDurationMs: 300000;
  cooldownDurationMs: 30000;
  concurrentUsers: number;
  rampUpUsers: number;
  requestsPerUser: number;
  thinkTimeMs: number;
}

const LOAD_TEST_CONFIG: LoadTestConfig = {
  warmupDurationMs: 30000,
  testDurationMs: 300000,
  cooldownDurationMs: 30000,
  concurrentUsers: 10,
  rampUpUsers: 2,
  requestsPerUser: 100,
  thinkTimeMs: 1000,
};
```

### 7.3 Benchmark Reporting

```typescript
interface BenchmarkReport {
  id: string;
  timestamp: Date;
  environment: string;
  results: BenchmarkResult[];
  summary: BenchmarkSummary;
  recommendations: string[];
}

interface BenchmarkResult {
  operation: string;
  samples: number;
  minMs: number;
  maxMs: number;
  meanMs: number;
  medianMs: number;
  stdDevMs: number;
  percentiles: PercentileLatency;
  throughputOpsPerSecond: number;
  successRate: number;
  errorRate: number;
}

interface BenchmarkSummary {
  overallScore: number;
  passedOperations: number;
  failedOperations: number;
  averageResponseTimeMs: number;
  peakThroughput: number;
  resourcePeakUsage: ResourceMetrics;
}
```

---

## 8. Summary

All team members MUST adhere to these metrics standards:

1. **Metrics Collection** must use the defined TypeScript interfaces for consistency
2. **Agent KPIs** must be monitored with defined thresholds for each agent type
3. **System Metrics** must track health, resources, and throughput continuously
4. **Dashboards** should be configured with the recommended panels and alerts
5. **Logging** must follow the structured logging format with appropriate log levels
6. **Resource Allocation** should follow tier-based configuration and scaling policies
7. **Performance Benchmarks** establish baselines for all core operations

Violations will result in failed CI/CD pipelines and quality gates.
