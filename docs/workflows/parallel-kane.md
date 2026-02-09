# Parallel Kane Workflow

This document describes the parallel task distribution system for multiple Kane agents working concurrently on file organization tasks.

## Overview

The Parallel Kane system enables horizontal scaling of Kane agent instances for high-throughput file operations. It includes cluster management, inter-agent communication, load balancing, and comprehensive error handling.

---

## TypeScript Interfaces

```typescript
/**
 * Parallel Kane System Type Definitions
 */

// Task Distribution Types
export interface KaneTask {
  id: string;
  type: TaskType;
  priority: number;
  payload: unknown;
  dependencies: string[];
  createdAt: Date;
  deadline?: Date;
  metadata: TaskMetadata;
}

export type TaskType =
  | 'file-scan'
  | 'file-categorize'
  | 'file-duplicate-check'
  | 'file-organize'
  | 'file-move'
  | 'file-hash'
  | 'metadata-extract';

export interface TaskMetadata {
  sourcePath: string;
  targetPath?: string;
  options?: Record<string, unknown>;
  retryCount: number;
  maxRetries: number;
}

export interface TaskResult {
  taskId: string;
  kaneId: string;
  success: boolean;
  result?: unknown;
  error?: TaskError;
  executionTime: number;
  completedAt: Date;
}

export interface TaskError {
  code: string;
  message: string;
  recoverable: boolean;
  stack?: string;
}

// Kane Agent Types
export interface KaneAgent {
  id: string;
  status: KaneStatus;
  capabilities: TaskType[];
  currentTask?: KaneTask;
  metrics: KaneMetrics;
  lastHeartbeat: Date;
  clusterId: string;
}

export type KaneStatus = 'idle' | 'executing' | 'paused' | 'error' | 'disconnected';

export interface KaneMetrics {
  tasksCompleted: number;
  tasksFailed: number;
  totalExecutionTime: number;
  averageTaskTime: number;
  currentLoad: number;
  memoryUsage: number;
  cpuUsage: number;
}

// Cluster Types
export interface KaneCluster {
  id: string;
  name: string;
  agents: Map<string, KaneAgent>;
  coordinator: ClusterCoordinator;
  config: ClusterConfig;
  state: ClusterState;
}

export interface ClusterConfig {
  maxAgents: number;
  minAgents: number;
  taskBatchSize: number;
  heartbeatInterval: number;
  taskTimeout: number;
  retryAttempts: number;
  loadThreshold: number;
}

export interface ClusterState {
  status: ClusterStatus;
  totalTasksQueued: number;
  totalTasksCompleted: number;
  totalTasksFailed: number;
  averageLoad: number;
  lastTaskDistribution: Date;
}

export type ClusterStatus = 'initializing' | 'running' | 'degraded' | 'stopping' | 'stopped';

// Communication Types
export interface AgentMessage {
  id: string;
  from: string;
  to: string;
  type: MessageType;
  payload: unknown;
  timestamp: Date;
  priority: MessagePriority;
}

export type MessageType =
  | 'task-assign'
  | 'task-complete'
  | 'task-failed'
  | 'heartbeat'
  | 'status-update'
  | 'load-report'
  | 'sync-request'
  | 'sync-response'
  | 'error-report';

export type MessagePriority = 'low' | 'normal' | 'high' | 'critical';

export interface TaskDistributionMessage {
  taskIds: string[];
  batchSize: number;
  priority: number;
  strategy: DistributionStrategy;
}

export type DistributionStrategy = 'round-robin' | 'least-loaded' | 'random' | 'capability-based';

// Load Balancing Types
export interface LoadReport {
  agentId: string;
  timestamp: Date;
  cpuUsage: number;
  memoryUsage: number;
  activeTasks: number;
  queueLength: number;
  loadScore: number;
}

export interface ResourceMetrics {
  totalMemory: number;
  availableMemory: number;
  totalCpu: number;
  cpuCores: number;
  diskIO: DiskIOMetrics;
  networkIO: NetworkIOMetrics;
}

export interface DiskIOMetrics {
  readSpeed: number;
  writeSpeed: number;
  iops: number;
}

export interface NetworkIOMetrics {
  bytesIn: number;
  bytesOut: number;
  latency: number;
}

// Performance Types
export interface PerformanceBenchmark {
  id: string;
  timestamp: Date;
  configuration: BenchmarkConfig;
  results: BenchmarkResult[];
  summary: BenchmarkSummary;
}

export interface BenchmarkConfig {
  agentCount: number;
  taskCount: number;
  taskTypes: TaskType[];
  parallelismLevel: number;
  duration: number;
}

export interface BenchmarkResult {
  agentId: string;
  tasksCompleted: number;
  tasksFailed: number;
  averageTaskTime: number;
  totalExecutionTime: number;
  throughput: number;
  resourceUtilization: ResourceMetrics;
}

export interface BenchmarkSummary {
  totalTasksCompleted: number;
  totalTasksFailed: number;
  averageThroughput: number;
  averageLatency: number;
  peakMemoryUsage: number;
  peakCpuUsage: number;
  efficiency: number;
}
```

---

## Kane Cluster Management System

```typescript
/**
 * Kane Cluster Manager
 * Core implementation for managing parallel Kane agent instances
 */

import {
  KaneAgent,
  KaneCluster,
  ClusterConfig,
  ClusterState,
  KaneStatus,
  KaneMetrics,
  TaskType,
  TaskResult,
  LoadReport,
} from './types';

export class KaneClusterManager {
  private cluster: KaneCluster;
  private taskQueue: TaskQueue;
  private messageBus: MessageBus;
  private loadBalancer: LoadBalancer;
  private resourceMonitor: ResourceMonitor;
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(config: Partial<ClusterConfig> = {}) {
    this.cluster = {
      id: this.generateClusterId(),
      name: `KaneCluster-${Date.now()}`,
      agents: new Map(),
      coordinator: new ClusterCoordinatorImpl(),
      config: this.getDefaultConfig(config),
      state: this.getInitialState(),
    };
    this.taskQueue = new TaskQueueImpl();
    this.messageBus = new InMemoryMessageBus();
    this.loadBalancer = new LeastLoadedBalancer();
    this.resourceMonitor = new ResourceMonitorImpl();
  }

  async initialize(): Promise<void> {
    this.cluster.state.status = 'initializing';
    await this.resourceMonitor.start();
    await this.setupCommunicationChannels();
    await this.startHeartbeatMonitor();
    this.cluster.state.status = 'running';
  }

  async registerAgent(agent: KaneAgent): Promise<boolean> {
    if (this.cluster.agents.size >= this.cluster.config.maxAgents) {
      return false;
    }

    this.cluster.agents.set(agent.id, {
      ...agent,
      status: 'idle',
      lastHeartbeat: new Date(),
      metrics: this.getInitialMetrics(),
    });

    await this.messageBus.subscribe(agent.id, this.handleAgentMessage.bind(this));
    return true;
  }

  async unregisterAgent(agentId: string): Promise<void> {
    const agent = this.cluster.agents.get(agentId);
    if (!agent) return;

    if (agent.currentTask) {
      await this.requeueTask(agent.currentTask.id);
    }

    this.cluster.agents.delete(agentId);
    await this.messageBus.unsubscribe(agentId);
  }

  async distributeTasks(
    taskIds: string[],
    strategy: DistributionStrategy = 'least-loaded'
  ): Promise<void> {
    const tasks = await this.taskQueue.getTasks(taskIds);

    for (const task of tasks) {
      const targetAgent = await this.selectAgent(task.type, strategy);
      if (targetAgent) {
        await this.assignTask(targetAgent.id, task);
      } else {
        await this.taskQueue.requeue(task);
      }
    }

    this.cluster.state.lastTaskDistribution = new Date();
  }

  async selectAgent(taskType: TaskType, strategy: DistributionStrategy): Promise<KaneAgent | null> {
    const eligibleAgents = Array.from(this.cluster.agents.values()).filter(
      (agent) => agent.status === 'idle' && agent.capabilities.includes(taskType)
    );

    if (eligibleAgents.length === 0) {
      return null;
    }

    switch (strategy) {
      case 'least-loaded':
        return this.loadBalancer.selectLeastLoaded(eligibleAgents);
      case 'round-robin':
        return this.loadBalancer.selectRoundRobin(eligibleAgents);
      case 'random':
        return this.loadBalancer.selectRandom(eligibleAgents);
      case 'capability-based':
        return this.loadBalancer.selectByCapability(eligibleAgents, taskType);
      default:
        return this.loadBalancer.selectLeastLoaded(eligibleAgents);
    }
  }

  private async assignTask(agentId: string, task: KaneTask): Promise<void> {
    const agent = this.cluster.agents.get(agentId);
    if (!agent || agent.status !== 'idle') {
      throw new Error(`Agent ${agentId} is not available`);
    }

    agent.status = 'executing';
    agent.currentTask = task;

    await this.messageBus.send({
      id: this.generateMessageId(),
      from: 'coordinator',
      to: agentId,
      type: 'task-assign',
      payload: task,
      timestamp: new Date(),
      priority: 'high',
    });
  }

  async handleTaskComplete(result: TaskResult): Promise<void> {
    const agent = this.cluster.agents.get(result.kaneId);
    if (agent) {
      agent.status = 'idle';
      agent.currentTask = undefined;
      agent.metrics.tasksCompleted++;
      agent.metrics.totalExecutionTime += result.executionTime;
      agent.metrics.averageTaskTime =
        agent.metrics.totalExecutionTime / agent.metrics.tasksCompleted;
    }

    this.cluster.state.totalTasksCompleted++;
    await this.processTaskDependencies(result);
  }

  async handleTaskFailed(result: TaskResult): Promise<void> {
    const agent = this.cluster.agents.get(result.kaneId);
    if (agent) {
      agent.status = 'idle';
      agent.currentTask = undefined;
      agent.metrics.tasksFailed++;
    }

    this.cluster.state.totalTasksFailed++;

    if (result.taskId) {
      await this.taskQueue.handleFailure(result.taskId, result.error);
    }
  }

  private async processTaskDependencies(result: TaskResult): Promise<void> {
    // Process dependent tasks when parent task completes
    // Implementation depends on task dependency graph
  }

  private async handleAgentMessage(message: AgentMessage): Promise<void> {
    switch (message.type) {
      case 'task-complete':
        await this.handleTaskComplete(message.payload as TaskResult);
        break;
      case 'task-failed':
        await this.handleTaskFailed(message.payload as TaskResult);
        break;
      case 'heartbeat':
        await this.updateAgentHeartbeat(message.from);
        break;
      case 'load-report':
        await this.updateAgentLoad(message.from, message.payload as LoadReport);
        break;
    }
  }

  private async updateAgentHeartbeat(agentId: string): Promise<void> {
    const agent = this.cluster.agents.get(agentId);
    if (agent) {
      agent.lastHeartbeat = new Date();
    }
  }

  private async updateAgentLoad(agentId: string, report: LoadReport): Promise<void> {
    const agent = this.cluster.agents.get(agentId);
    if (agent) {
      agent.metrics.currentLoad = report.loadScore;
      agent.metrics.memoryUsage = report.memoryUsage;
      agent.metrics.cpuUsage = report.cpuUsage;
    }
  }

  private async startHeartbeatMonitor(): Promise<void> {
    this.heartbeatTimer = setInterval(async () => {
      const now = Date.now();
      const timeout = this.cluster.config.heartbeatInterval * 3;

      for (const [agentId, agent] of this.cluster.agents) {
        if (now - agent.lastHeartbeat.getTime() > timeout) {
          await this.handleAgentTimeout(agentId);
        }
      }
    }, this.cluster.config.heartbeatInterval);
  }

  private async handleAgentTimeout(agentId: string): Promise<void> {
    const agent = this.cluster.agents.get(agentId);
    if (!agent) return;

    agent.status = 'disconnected';

    if (agent.currentTask) {
      await this.requeueTask(agent.currentTask.id);
    }

    await this.messageBus.send({
      id: this.generateMessageId(),
      from: 'coordinator',
      to: agentId,
      type: 'error-report',
      payload: { code: 'AGENT_TIMEOUT', message: 'Agent heartbeat timeout' },
      timestamp: new Date(),
      priority: 'critical',
    });
  }

  private async requeueTask(taskId: string): Promise<void> {
    await this.taskQueue.requeueById(taskId);
  }

  async shutdown(): Promise<void> {
    this.cluster.state.status = 'stopping';

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    await this.resourceMonitor.stop();
    await this.messageBus.close();

    this.cluster.state.status = 'stopped';
  }

  private getDefaultConfig(overrides: Partial<ClusterConfig>): ClusterConfig {
    return {
      maxAgents: 10,
      minAgents: 1,
      taskBatchSize: 100,
      heartbeatInterval: 5000,
      taskTimeout: 300000,
      retryAttempts: 3,
      loadThreshold: 0.8,
      ...overrides,
    };
  }

  private getInitialState(): ClusterState {
    return {
      status: 'initializing',
      totalTasksQueued: 0,
      totalTasksCompleted: 0,
      totalTasksFailed: 0,
      averageLoad: 0,
      lastTaskDistribution: new Date(),
    };
  }

  private getInitialMetrics(): KaneMetrics {
    return {
      tasksCompleted: 0,
      tasksFailed: 0,
      totalExecutionTime: 0,
      averageTaskTime: 0,
      currentLoad: 0,
      memoryUsage: 0,
      cpuUsage: 0,
    };
  }

  private generateClusterId(): string {
    return `cluster-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Supporting Interfaces
interface TaskQueue {
  add(task: KaneTask): Promise<void>;
  getTasks(ids: string[]): Promise<KaneTask[]>;
  requeue(task: KaneTask): Promise<void>;
  requeueById(taskId: string): Promise<void>;
  handleFailure(taskId: string, error: TaskError): Promise<void>;
}

interface MessageBus {
  send(message: AgentMessage): Promise<void>;
  subscribe(agentId: string, handler: (message: AgentMessage) => Promise<void>): Promise<void>;
  unsubscribe(agentId: string): Promise<void>;
  close(): Promise<void>;
}

interface LoadBalancer {
  selectLeastLoaded(agents: KaneAgent[]): KaneAgent;
  selectRoundRobin(agents: KaneAgent[]): KaneAgent;
  selectRandom(agents: KaneAgent[]): KaneAgent;
  selectByCapability(agents: KaneAgent[], taskType: TaskType): KaneAgent;
}

interface ResourceMonitor {
  start(): Promise<void>;
  stop(): Promise<void>;
  getMetrics(): Promise<ResourceMetrics>;
}

interface ClusterCoordinator {
  coordinate(agents: KaneAgent[]): Promise<void>;
}
```

---

## Communication Protocols

```typescript
/**
 * Inter-Agent Communication Protocol
 * Handles message passing between parallel Kane agents
 */

import { AgentMessage, MessageType, MessagePriority } from './types';

export enum ProtocolVersion {
  V1 = '1.0',
  V2 = '2.0',
}

export interface ProtocolConfig {
  version: ProtocolVersion;
  maxMessageSize: number;
  ackTimeout: number;
  retryAttempts: number;
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
}

export class CommunicationProtocol {
  private config: ProtocolConfig;
  private messageQueue: Map<string, AgentMessage[]>;
  private pendingAcks: Map<string, Promise<void>>;
  private messageHandlers: Map<MessageType, MessageHandler[]>;

  constructor(config: Partial<ProtocolConfig> = {}) {
    this.config = {
      version: ProtocolVersion.V2,
      maxMessageSize: 1024 * 1024,
      ackTimeout: 5000,
      retryAttempts: 3,
      compressionEnabled: true,
      encryptionEnabled: false,
      ...config,
    };
    this.messageQueue = new Map();
    this.pendingAcks = new Map();
    this.messageHandlers = new Map();
  }

  async send(message: AgentMessage): Promise<void> {
    this.validateMessage(message);

    const serialized = await this.serializeMessage(message);

    if (serialized.length > this.config.maxMessageSize) {
      throw new Error('Message exceeds maximum size');
    }

    await this.transmit(message.to, serialized);
    await this.waitForAck(message.id);
  }

  async broadcast(message: Omit<AgentMessage, 'to'>): Promise<void> {
    const agents = await this.getActiveAgents();

    await Promise.all(
      agents.map((agentId) =>
        this.send({
          ...message,
          to: agentId,
          id: this.generateMessageId(),
        } as AgentMessage)
      )
    );
  }

  async requestReply(message: AgentMessage, timeout: number = 5000): Promise<AgentMessage> {
    await this.send(message);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Request timeout for message ${message.id}`));
      }, timeout);

      this.messageHandlers.get('sync-response')?.push({
        async handle(msg: AgentMessage) {
          clearTimeout(timer);
          resolve(msg);
        },
      });
    });
  }

  async subscribe(messageType: MessageType, handler: MessageHandler): Promise<void> {
    const handlers = this.messageHandlers.get(messageType) || [];
    handlers.push(handler);
    this.messageHandlers.set(messageType, handlers);
  }

  async handleIncomingMessage(rawMessage: string): Promise<void> {
    const message = await this.deserializeMessage(rawMessage);

    if (message.priority === 'critical') {
      await this.handleCriticalMessage(message);
    } else {
      await this.queueMessage(message);
    }
  }

  private async queueMessage(message: AgentMessage): Promise<void> {
    const queue = this.messageQueue.get(message.to) || [];
    queue.push(message);
    this.messageQueue.set(message.to, queue);

    await this.dispatchMessage(message);
  }

  private async dispatchMessage(message: AgentMessage): Promise<void> {
    const handlers = this.messageHandlers.get(message.type) || [];

    for (const handler of handlers) {
      try {
        await handler.handle(message);
      } catch (error) {
        await this.handleMessageError(message, error);
      }
    }

    await this.sendAck(message.id);
  }

  private async handleCriticalMessage(message: AgentMessage): Promise<void> {
    const handlers = this.messageHandlers.get(message.type) || [];

    await Promise.all(handlers.map((handler) => handler.handle(message).catch(() => {})));
  }

  private async transmit(recipient: string, message: string): Promise<void> {
    // Implementation-specific transmission logic
    // Can be replaced with WebSocket, IPC, or HTTP-based transport
  }

  private async waitForAck(messageId: string): Promise<void> {
    if (this.pendingAcks.has(messageId)) {
      return this.pendingAcks.get(messageId)!;
    }

    const promise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingAcks.delete(messageId);
        reject(new Error(`ACK timeout for message ${messageId}`));
      }, this.config.ackTimeout);

      this.pendingAcks.set(messageId, promise);
    });

    return promise;
  }

  private async sendAck(messageId: string): Promise<void> {
    const ackMessage: AgentMessage = {
      id: this.generateMessageId(),
      from: 'system',
      to: 'sender',
      type: 'status-update',
      payload: { ackFor: messageId },
      timestamp: new Date(),
      priority: 'low',
    };

    await this.transmit('sender', await this.serializeMessage(ackMessage));
  }

  private async serializeMessage(message: AgentMessage): Promise<string> {
    let data = JSON.stringify(message);

    if (this.config.compressionEnabled) {
      data = await this.compress(data);
    }

    if (this.config.encryptionEnabled) {
      data = await this.encrypt(data);
    }

    return data;
  }

  private async deserializeMessage(raw: string): Promise<AgentMessage> {
    let data = raw;

    if (this.config.encryptionEnabled) {
      data = await this.decrypt(data);
    }

    if (this.config.compressionEnabled) {
      data = await this.decompress(data);
    }

    return JSON.parse(data) as AgentMessage;
  }

  private validateMessage(message: AgentMessage): void {
    if (!message.id || !message.from || !message.to || !message.type) {
      throw new Error('Invalid message structure');
    }

    if (message.priority === 'critical' && message.type !== 'error-report') {
      throw new Error('Critical priority only allowed for error reports');
    }
  }

  private async handleMessageError(message: AgentMessage, error: unknown): Promise<void> {
    console.error(`Error handling message ${message.id}:`, error);

    await this.send({
      id: this.generateMessageId(),
      from: 'system',
      to: message.from,
      type: 'error-report',
      payload: {
        code: 'MESSAGE_HANDLER_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        originalMessageId: message.id,
      },
      timestamp: new Date(),
      priority: 'high',
    });
  }

  private async compress(data: string): Promise<string> {
    // Implementation using zlib or similar
    return data;
  }

  private async decompress(data: string): Promise<string> {
    return data;
  }

  private async encrypt(data: string): Promise<string> {
    // Implementation using crypto
    return data;
  }

  private async decrypt(data: string): Promise<string> {
    return data;
  }

  private async getActiveAgents(): Promise<string[]> {
    // Implementation to get list of active agent IDs
    return [];
  }

  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

interface MessageHandler {
  handle(message: AgentMessage): Promise<void>;
}

// Implementations
class InMemoryMessageBus implements MessageBus {
  private protocol: CommunicationProtocol;
  private agentQueues: Map<string, AgentMessage[]>;

  constructor() {
    this.protocol = new CommunicationProtocol();
    this.agentQueues = new Map();
  }

  async send(message: AgentMessage): Promise<void> {
    await this.protocol.send(message);
  }

  async subscribe(
    agentId: string,
    handler: (message: AgentMessage) => Promise<void>
  ): Promise<void> {
    await this.protocol.subscribe('*', {
      async handle(message: AgentMessage) {
        if (message.to === agentId) {
          await handler(message);
        }
      },
    });
  }

  async unsubscribe(agentId: string): Promise<void> {
    this.agentQueues.delete(agentId);
  }

  async close(): Promise<void> {
    this.agentQueues.clear();
  }
}
```

---

## Load Balancing & Resource Monitoring

```typescript
/**
 * Load Balancing and Resource Monitoring System
 */

import { LoadReport, ResourceMetrics, KaneAgent, DiskIOMetrics, NetworkIOMetrics } from './types';

export interface LoadBalancerConfig {
  evaluationInterval: number;
  historyWindow: number;
  decayFactor: number;
  thresholdHigh: number;
  thresholdLow: number;
}

export class LoadBalancer {
  private config: LoadBalancerConfig;
  private agentHistory: Map<string, LoadReport[]>;
  private lastSelected: Map<string, number>;

  constructor(config: Partial<LoadBalancerConfig> = {}) {
    this.config = {
      evaluationInterval: 1000,
      historyWindow: 60,
      decayFactor: 0.9,
      thresholdHigh: 0.8,
      thresholdLow: 0.3,
      ...config,
    };
    this.agentHistory = new Map();
    this.lastSelected = new Map();
  }

  selectLeastLoaded(agents: KaneAgent[]): KaneAgent {
    this.updateAgentHistory(agents);

    const availableAgents = agents.filter(
      (agent) => agent.metrics.currentLoad < this.config.thresholdHigh
    );

    if (availableAgents.length === 0) {
      return agents.reduce((min, agent) =>
        agent.metrics.currentLoad < min.metrics.currentLoad ? agent : min
      );
    }

    return availableAgents.reduce((min, agent) =>
      agent.metrics.currentLoad < min.metrics.currentLoad ? agent : min
    );
  }

  selectRoundRobin(agents: KaneAgent[]): KaneAgent {
    const index = (this.lastSelected.get('round-robin') || 0) % agents.length;
    this.lastSelected.set('round-robin', index + 1);
    return agents[index];
  }

  selectRandom(agents: KaneAgent[]): KaneAgent {
    return agents[Math.floor(Math.random() * agents.length)];
  }

  selectByCapability(agents: KaneAgent[], taskType: TaskType): KaneAgent {
    const specializedAgents = agents.filter((agent) => agent.capabilities.includes(taskType));

    if (specializedAgents.length > 0) {
      return this.selectLeastLoaded(specializedAgents);
    }

    return this.selectLeastLoaded(agents);
  }

  calculateLoadScore(report: LoadReport): number {
    const cpuWeight = 0.4;
    const memoryWeight = 0.3;
    const queueWeight = 0.3;

    const normalizedCpu = Math.min(report.cpuUsage, 1);
    const normalizedMemory = Math.min(report.memoryUsage, 1);
    const normalizedQueue = Math.min(report.queueLength / 10, 1);

    return (
      cpuWeight * normalizedCpu + memoryWeight * normalizedMemory + queueWeight * normalizedQueue
    );
  }

  private updateAgentHistory(agents: KaneAgent[]): void {
    for (const agent of agents) {
      const history = this.agentHistory.get(agent.id) || [];
      const currentLoad = this.calculateLoadScore({
        agentId: agent.id,
        timestamp: new Date(),
        cpuUsage: agent.metrics.cpuUsage,
        memoryUsage: agent.metrics.memoryUsage,
        activeTasks: agent.currentTask ? 1 : 0,
        queueLength: 0,
        loadScore: agent.metrics.currentLoad,
      });

      history.push({
        agentId: agent.id,
        timestamp: new Date(),
        cpuUsage: agent.metrics.cpuUsage,
        memoryUsage: agent.metrics.memoryUsage,
        activeTasks: history.length,
        queueLength: 0,
        loadScore: currentLoad,
      });

      if (history.length > this.config.historyWindow) {
        history.shift();
      }

      this.agentHistory.set(agent.id, history);
    }
  }

  getAverageLoad(agentId: string): number {
    const history = this.agentHistory.get(agentId) || [];
    if (history.length === 0) return 0;

    const scores = history.map((r) => r.loadScore);
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  getLoadTrend(agentId: string): 'increasing' | 'decreasing' | 'stable' {
    const history = this.agentHistory.get(agentId) || [];
    if (history.length < 2) return 'stable';

    const recent = history.slice(-5);
    const older = history.slice(-10, -5);

    if (recent.length < 2 || older.length < 2) return 'stable';

    const recentAvg = recent.reduce((a, b) => a + b.loadScore, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b.loadScore, 0) / older.length;

    const diff = recentAvg - olderAvg;
    if (diff > 0.1) return 'increasing';
    if (diff < -0.1) return 'decreasing';
    return 'stable';
  }
}

export class ResourceMonitor {
  private metricsHistory: ResourceMetrics[];
  private monitoringInterval?: NodeJS.Timeout;
  private readonly maxHistorySize = 3600;

  constructor() {
    this.metricsHistory = [];
  }

  async start(): Promise<void> {
    this.monitoringInterval = setInterval(() => this.collectMetrics(), 1000);
    await this.collectMetrics();
  }

  async stop(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
  }

  async getMetrics(): Promise<ResourceMetrics> {
    return this.metricsHistory[this.metricsHistory.length - 1] || this.getEmptyMetrics();
  }

  async getAggregatedMetrics(duration: number): Promise<ResourceMetrics> {
    const cutoff = Date.now() - duration;
    const recent = this.metricsHistory.filter((m) => m.timestamp.getTime() > cutoff);

    if (recent.length === 0) return this.getEmptyMetrics();

    return {
      totalMemory: this.getMax(recent, 'totalMemory'),
      availableMemory: this.getMin(recent, 'availableMemory'),
      totalCpu: this.getMax(recent, 'totalCpu'),
      cpuCores: recent[0].cpuCores,
      diskIO: this.getAggregatedDiskIO(recent),
      networkIO: this.getAggregatedNetworkIO(recent),
    };
  }

  private async collectMetrics(): Promise<void> {
    const metrics = await this.gatherSystemMetrics();
    this.metricsHistory.push(metrics);

    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory.shift();
    }
  }

  private async gatherSystemMetrics(): Promise<ResourceMetrics> {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      totalMemory: memUsage.heapTotal + memUsage.external,
      availableMemory: memUsage.heapTotal - memUsage.heapUsed,
      totalCpu: cpuUsage.user + cpuUsage.system,
      cpuCores: require('os').cpus().length,
      diskIO: await this.getDiskIOMetrics(),
      networkIO: await this.getNetworkIOMetrics(),
    };
  }

  private async getDiskIOMetrics(): Promise<DiskIOMetrics> {
    return {
      readSpeed: 0,
      writeSpeed: 0,
      iops: 0,
    };
  }

  private async getNetworkIOMetrics(): Promise<NetworkIOMetrics> {
    return {
      bytesIn: 0,
      bytesOut: 0,
      latency: 0,
    };
  }

  private getAggregatedDiskIO(metrics: ResourceMetrics[]): DiskIOMetrics {
    return {
      readSpeed: this.getAverage(metrics, (m) => m.diskIO.readSpeed),
      writeSpeed: this.getAverage(metrics, (m) => m.diskIO.writeSpeed),
      iops: this.getAverage(metrics, (m) => m.diskIO.iops),
    };
  }

  private getAggregatedNetworkIO(metrics: ResourceMetrics[]): NetworkIOMetrics {
    return {
      bytesIn: this.getAverage(metrics, (m) => m.networkIO.bytesIn),
      bytesOut: this.getAverage(metrics, (m) => m.networkIO.bytesOut),
      latency: this.getAverage(metrics, (m) => m.networkIO.latency),
    };
  }

  private getMax<T>(items: T[], accessor: (item: T) => number): number {
    return Math.max(...items.map(accessor));
  }

  private getMin<T>(items: T[], accessor: (item: T) => number): number {
    return Math.min(...items.map(accessor));
  }

  private getAverage<T>(items: T[], accessor: (item: T) => number): number {
    if (items.length === 0) return 0;
    const sum = items.reduce((acc, item) => acc + accessor(item), 0);
    return sum / items.length;
  }

  private getEmptyMetrics(): ResourceMetrics {
    return {
      totalMemory: 0,
      availableMemory: 0,
      totalCpu: 0,
      cpuCores: 1,
      diskIO: { readSpeed: 0, writeSpeed: 0, iops: 0 },
      networkIO: { bytesIn: 0, bytesOut: 0, latency: 0 },
    };
  }
}

// Least Loaded Balancer Implementation
export class LeastLoadedBalancer extends LoadBalancer {
  selectLeastLoaded(agents: KaneAgent[]): KaneAgent {
    const scored = agents.map((agent) => ({
      agent,
      score: this.calculateCompositeScore(agent),
    }));

    scored.sort((a, b) => a.score - b.score);
    return scored[0]?.agent || agents[0];
  }

  private calculateCompositeScore(agent: KaneAgent): number {
    const loadScore = agent.metrics.currentLoad;
    const memoryPressure = agent.metrics.memoryUsage / (1024 * 1024 * 1024);
    const cpuPressure = agent.metrics.cpuUsage;
    const taskSaturation =
      agent.metrics.tasksCompleted / (agent.metrics.tasksCompleted + agent.metrics.tasksFailed + 1);

    return loadScore * 0.4 + memoryPressure * 0.3 + cpuPressure * 0.2 + (1 - taskSaturation) * 0.1;
  }
}
```

---

## Error Handling for Parallel Execution

```typescript
/**
 * Parallel Execution Error Handling System
 */

export interface ErrorRecoveryConfig {
  maxRetries: number;
  backoffMultiplier: number;
  maxBackoffMs: number;
  retryableErrors: Set<string>;
  fatalErrors: Set<string>;
}

export interface ErrorBoundary {
  id: string;
  parentId?: string;
  errorCount: number;
  lastError?: TaskError;
  state: ErrorBoundaryState;
}

export type ErrorBoundaryState = 'active' | 'recovering' | 'failed' | 'dismissed';

export class ParallelErrorHandler {
  private config: ErrorRecoveryConfig;
  private errorBoundaries: Map<string, ErrorBoundary>;
  private errorLog: TaskError[];
  private circuitBreakers: Map<string, CircuitBreaker>;

  constructor(config: Partial<ErrorRecoveryConfig> = {}) {
    this.config = {
      maxRetries: 3,
      backoffMultiplier: 2,
      maxBackoffMs: 30000,
      retryableErrors: new Set(['EAGAIN', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED']),
      fatalErrors: new Set(['EACCES', 'EPERM', 'EBUSY', 'EINVAL', 'ENOENT']),
      ...config,
    };
    this.errorBoundaries = new Map();
    this.errorLog = [];
    this.circuitBreakers = new Map();
  }

  async handleError(
    taskId: string,
    error: TaskError,
    context?: ErrorContext
  ): Promise<ErrorRecoveryAction> {
    this.logError(taskId, error);

    const boundary = this.getOrCreateBoundary(taskId, context?.parentId);

    if (this.isFatal(error)) {
      return this.handleFatalError(taskId, error, boundary);
    }

    if (this.shouldRetry(taskId, error)) {
      return this.handleRetryableError(taskId, error, boundary);
    }

    return this.handleExhaustedRetries(taskId, error, boundary);
  }

  private isFatal(error: TaskError): boolean {
    return this.config.fatalErrors.has(error.code);
  }

  private shouldRetry(taskId: string, error: TaskError): boolean {
    const boundary = this.errorBoundaries.get(taskId);
    if (!boundary) return true;

    return (
      this.config.retryableErrors.has(error.code) && boundary.errorCount < this.config.maxRetries
    );
  }

  private handleFatalError(
    taskId: string,
    error: TaskError,
    boundary: ErrorBoundary
  ): Promise<ErrorRecoveryAction> {
    boundary.state = 'failed';
    boundary.lastError = error;

    return Promise.resolve({
      action: 'fail',
      taskId,
      reason: `Fatal error: ${error.message}`,
      recovery: 'none',
    });
  }

  private handleRetryableError(
    taskId: string,
    error: TaskError,
    boundary: ErrorBoundary
  ): Promise<ErrorRecoveryAction> {
    boundary.state = 'recovering';
    boundary.errorCount++;

    const backoffMs = this.calculateBackoff(boundary.errorCount);

    return Promise.resolve({
      action: 'retry',
      taskId,
      reason: error.message,
      recovery: 'retry',
      delayMs: backoffMs,
      attempt: boundary.errorCount,
      maxAttempts: this.config.maxRetries,
    });
  }

  private handleExhaustedRetries(
    taskId: string,
    error: TaskError,
    boundary: ErrorBoundary
  ): Promise<ErrorRecoveryAction> {
    boundary.state = 'failed';

    return Promise.resolve({
      action: 'fail',
      taskId,
      reason: `Max retries exhausted: ${error.message}`,
      recovery: 'escalate',
    });
  }

  private calculateBackoff(attempt: number): number {
    const backoff = Math.pow(this.config.backoffMultiplier, attempt) * 1000;
    return Math.min(backoff, this.config.maxBackoffMs);
  }

  private getOrCreateBoundary(taskId: string, parentId?: string): ErrorBoundary {
    let boundary = this.errorBoundaries.get(taskId);

    if (!boundary) {
      boundary = {
        id: taskId,
        parentId,
        errorCount: 0,
        state: 'active',
      };
      this.errorBoundaries.set(taskId, boundary);
    }

    return boundary;
  }

  private logError(taskId: string, error: TaskError): void {
    this.errorLog.push({
      ...error,
      timestamp: new Date(),
      taskId,
    });
  }

  async getErrorStats(): Promise<ErrorStats> {
    const byCode = new Map<string, number>();
    const byTask = new Map<string, number>();

    for (const error of this.errorLog) {
      byCode.set(error.code, (byCode.get(error.code) || 0) + 1);
      byTask.set(error.code, (byTask.get(error.code) || 0) + 1);
    }

    return {
      total: this.errorLog.length,
      byCode: Object.fromEntries(byCode),
      byTask: Object.fromEntries(byTask),
      recovered: Array.from(this.errorBoundaries.values()).filter((b) => b.state === 'active')
        .length,
      failed: Array.from(this.errorBoundaries.values()).filter((b) => b.state === 'failed').length,
    };
  }

  async reset(): Promise<void> {
    this.errorBoundaries.clear();
    this.errorLog.length = 0;

    for (const breaker of this.circuitBreakers.values()) {
      await breaker.reset();
    }
  }
}

export interface ErrorContext {
  parentId?: string;
  agentId?: string;
  clusterId?: string;
  metadata?: Record<string, unknown>;
}

export interface ErrorRecoveryAction {
  action: 'retry' | 'fail' | 'escalate' | 'skip';
  taskId: string;
  reason: string;
  recovery: 'retry' | 'none' | 'escalate' | 'alternative';
  delayMs?: number;
  attempt?: number;
  maxAttempts?: number;
  alternativeAgent?: string;
}

export interface ErrorStats {
  total: number;
  byCode: Record<string, number>;
  byTask: Record<string, number>;
  recovered: number;
  failed: number;
}

// Circuit Breaker for Agent Health
export class CircuitBreaker {
  private failureCount: number;
  private successCount: number;
  private lastFailure?: Date;
  private state: CircuitBreakerState;
  private readonly threshold: number;
  private readonly timeout: number;

  constructor(
    private readonly id: string,
    options: { threshold?: number; timeout?: number } = {}
  ) {
    this.failureCount = 0;
    this.successCount = 0;
    this.state = 'closed';
    this.threshold = options.threshold || 5;
    this.timeout = options.timeout || 30000;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.state = 'half-open';
      } else {
        throw new Error(`Circuit breaker ${this.id} is open`);
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.successCount++;
    this.failureCount = 0;

    if (this.state === 'half-open') {
      this.state = 'closed';
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailure = new Date();

    if (this.failureCount >= this.threshold) {
      this.state = 'open';
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailure) return true;
    return Date.now() - this.lastFailure.getTime() > this.timeout;
  }

  async reset(): Promise<void> {
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailure = undefined;
    this.state = 'closed';
  }

  getState(): CircuitBreakerState {
    return this.state;
  }
}

export type CircuitBreakerState = 'closed' | 'open' | 'half-open';
```

---

## Performance Benchmarks

```typescript
/**
 * Performance Benchmarking System for Parallel Kane
 */

export interface BenchmarkRunnerConfig {
  warmupIterations: number;
  measurementIterations: number;
  reportInterval: number;
  collectGCStats: boolean;
}

export class PerformanceBenchmarkRunner {
  private config: BenchmarkRunnerConfig;
  private results: BenchmarkResult[];

  constructor(config: Partial<BenchmarkRunnerConfig> = {}) {
    this.config = {
      warmupIterations: 3,
      measurementIterations: 10,
      reportInterval: 1000,
      collectGCStats: false,
      ...config,
    };
    this.results = [];
  }

  async runBenchmark(
    cluster: KaneClusterManager,
    tasks: KaneTask[],
    options: Partial<BenchmarkConfig>
  ): Promise<PerformanceBenchmark> {
    const config: BenchmarkConfig = {
      agentCount: cluster.getAgentCount(),
      taskCount: tasks.length,
      taskTypes: [...new Set(tasks.map((t) => t.type))],
      parallelismLevel: options.parallelismLevel || cluster.getAgentCount(),
      duration: options.duration || 60000,
      ...options,
    };

    await this.warmup(cluster, tasks);

    const startTime = Date.now();
    const results: BenchmarkResult[] = [];

    for (let i = 0; i < this.config.measurementIterations; i++) {
      const iterationResult = await this.runIteration(cluster, tasks, config);
      results.push(iterationResult);
    }

    const endTime = Date.now();

    return {
      id: `benchmark-${Date.now()}`,
      timestamp: new Date(),
      configuration: config,
      results,
      summary: this.calculateSummary(results, startTime, endTime),
    };
  }

  private async warmup(cluster: KaneClusterManager, tasks: KaneTask[]): Promise<void> {
    const warmupTasks = tasks.slice(0, Math.min(10, tasks.length));

    for (let i = 0; i < this.config.warmupIterations; i++) {
      await cluster.distributeTasks(
        warmupTasks.map((t) => t.id),
        'least-loaded'
      );
      await this.delay(100);
    }
  }

  private async runIteration(
    cluster: KaneClusterManager,
    tasks: KaneTask[],
    config: BenchmarkConfig
  ): Promise<BenchmarkResult> {
    const startTime = Date.now();
    const completedTasks: string[] = [];
    const failedTasks: string[] = [];
    const agentMetrics = new Map<string, KaneMetrics>();

    const distributionPromise = cluster.distributeTasks(
      tasks.map((t) => t.id),
      'least-loaded'
    );

    await distributionPromise;

    await this.waitForCompletion(cluster, tasks.length, config.duration);

    const endTime = Date.now();
    const totalTime = endTime - startTime;
    const throughput = tasks.length / (totalTime / 1000);

    return {
      agentId: 'cluster',
      tasksCompleted: completedTasks.length,
      tasksFailed: failedTasks.length,
      averageTaskTime: totalTime / tasks.length,
      totalExecutionTime: totalTime,
      throughput,
    };
  }

  private async waitForCompletion(
    cluster: KaneClusterManager,
    expectedCount: number,
    timeout: number
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const stats = await cluster.getStatistics();
      if (stats.totalTasksCompleted >= expectedCount) {
        return;
      }
      await this.delay(100);
    }
  }

  private calculateSummary(
    results: BenchmarkResult[],
    startTime: number,
    endTime: number
  ): BenchmarkSummary {
    const totalCompleted = results.reduce((sum, r) => sum + r.tasksCompleted, 0);
    const totalFailed = results.reduce((sum, r) => sum + r.tasksFailed, 0);
    const totalTime = endTime - startTime;

    return {
      totalTasksCompleted: totalCompleted,
      totalTasksFailed: totalFailed,
      averageThroughput: totalCompleted / (totalTime / 1000),
      averageLatency: results.reduce((sum, r) => sum + r.averageTaskTime, 0) / results.length,
      peakMemoryUsage: 0,
      peakCpuUsage: 0,
      efficiency: totalCompleted / (totalCompleted + totalFailed),
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  generateReport(benchmark: PerformanceBenchmark): string {
    const summary = benchmark.summary;

    return `
# Performance Benchmark Report

**ID:** ${benchmark.id}
**Date:** ${benchmark.timestamp.toISOString()}

## Configuration
- Agents: ${benchmark.configuration.agentCount}
- Tasks: ${benchmark.configuration.taskCount}
- Parallelism: ${benchmark.configuration.parallelismLevel}
- Duration: ${benchmark.configuration.duration}ms

## Summary
- **Total Completed:** ${summary.totalTasksCompleted}
- **Total Failed:** ${summary.totalTasksFailed}
- **Throughput:** ${summary.averageThroughput.toFixed(2)} tasks/sec
- **Average Latency:** ${summary.averageLatency.toFixed(2)}ms
- **Efficiency:** ${(summary.efficiency * 100).toFixed(2)}%
- **Peak Memory:** ${(summary.peakMemoryUsage / 1024 / 1024).toFixed(2)} MB
- **Peak CPU:** ${summary.peakCpuUsage.toFixed(2)}%
`;
  }
}
```

---

## Usage Example

```typescript
/**
 * Parallel Kane System - Complete Usage Example
 */

import { KaneClusterManager } from './cluster-manager.js';
import { CommunicationProtocol } from './communication.js';
import { LoadBalancer, ResourceMonitor } from './load-balancing.js';
import { ParallelErrorHandler } from './error-handling.js';
import { PerformanceBenchmarkRunner } from './benchmarks.js';

async function main() {
  const cluster = new KaneClusterManager({
    maxAgents: 8,
    taskBatchSize: 500,
    heartbeatInterval: 5000,
    taskTimeout: 60000,
  });

  await cluster.initialize();

  const agent1 = createKaneAgent('kane-1', ['file-scan', 'file-categorize']);
  const agent2 = createKaneAgent('kane-2', ['file-duplicate-check', 'file-hash']);
  const agent3 = createKaneAgent('kane-3', ['file-organize', 'file-move']);

  await cluster.registerAgent(agent1);
  await cluster.registerAgent(agent2);
  await cluster.registerAgent(agent3);

  const tasks = generateTasks(1000);

  await cluster.distributeTasks(
    tasks.map((t) => t.id),
    'least-loaded'
  );

  const benchmark = await new PerformanceBenchmarkRunner().runBenchmark(cluster, tasks, {
    parallelismLevel: 3,
  });

  console.log(benchmark);

  await cluster.shutdown();
}

function createKaneAgent(id: string, capabilities: TaskType[]): KaneAgent {
  return {
    id,
    status: 'idle',
    capabilities,
    metrics: {
      tasksCompleted: 0,
      tasksFailed: 0,
      totalExecutionTime: 0,
      averageTaskTime: 0,
      currentLoad: 0,
      memoryUsage: 0,
      cpuUsage: 0,
    },
    lastHeartbeat: new Date(),
    clusterId: 'main-cluster',
  };
}

function generateTasks(count: number): KaneTask[] {
  const types: TaskType[] = [
    'file-scan',
    'file-categorize',
    'file-duplicate-check',
    'file-organize',
    'file-hash',
  ];

  return Array.from({ length: count }, (_, i) => ({
    id: `task-${i}`,
    type: types[i % types.length],
    priority: Math.floor(Math.random() * 10),
    payload: { path: `/tmp/file-${i}.txt` },
    dependencies: [],
    createdAt: new Date(),
    metadata: {
      sourcePath: `/tmp/file-${i}.txt`,
      retryCount: 0,
      maxRetries: 3,
    },
  }));
}

main().catch(console.error);
```
