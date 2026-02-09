# Agent Communication Protocols

This document defines the communication patterns, message formats, and protocols used by the multi-agent system in File Organizer MCP.

---

## 1. Message Format Specification

### 1.1 Base Message Structure

```typescript
// src/agents/messaging/message.types.ts

export enum AgentMessageType {
  REQUEST = 'REQUEST',
  RESPONSE = 'RESPONSE',
  BROADCAST = 'BROADCAST',
  HEARTBEAT = 'HEARTBEAT',
  ERROR = 'ERROR',
  ACK = 'ACK',
  CONTROL = 'CONTROL',
}

export interface BaseMessage {
  id: string;
  type: AgentMessageType;
  timestamp: number;
  version: string;
  correlationId?: string;
  source: string;
  destination?: string;
}

export interface AgentMessage<T = unknown> extends BaseMessage {
  payload: T;
  priority: 'low' | 'normal' | 'high' | 'critical';
  ttl?: number;
  retryCount?: number;
  metadata?: Record<string, unknown>;
}
```

### 1.2 Message Envelope

```typescript
// src/agents/messaging/message-envelope.ts

import { AgentMessage, AgentMessageType } from './message.types.js';

export class MessageEnvelope<T> {
  readonly id: string;
  readonly type: AgentMessageType;
  readonly timestamp: number;
  readonly payload: T;
  readonly source: string;
  readonly destination?: string;
  readonly correlationId?: string;
  readonly priority: 'low' | 'normal' | 'high' | 'critical';
  readonly metadata?: Record<string, unknown>;

  constructor(message: AgentMessage<T>) {
    this.id = message.id;
    this.type = message.type;
    this.timestamp = message.timestamp;
    this.payload = message.payload;
    this.source = message.source;
    this.destination = message.destination;
    this.correlationId = message.correlationId;
    this.priority = message.priority;
    this.metadata = message.metadata;
  }

  static create<T>(
    type: AgentMessageType,
    payload: T,
    source: string,
    options: {
      destination?: string;
      correlationId?: string;
      priority?: 'low' | 'normal' | 'high' | 'critical';
      metadata?: Record<string, unknown>;
    } = {}
  ): MessageEnvelope<T> {
    const id = crypto.randomUUID();
    const message: AgentMessage<T> = {
      id,
      type,
      timestamp: Date.now(),
      version: '1.0.0',
      payload,
      source,
      destination: options.destination,
      correlationId: options.correlationId,
      priority: options.priority || 'normal',
      metadata: options.metadata,
    };
    return new MessageEnvelope(message);
  }

  toJSON(): string {
    return JSON.stringify({
      id: this.id,
      type: this.type,
      timestamp: this.timestamp,
      payload: this.payload,
      source: this.source,
      destination: this.destination,
      correlationId: this.correlationId,
      priority: this.priority,
      metadata: this.metadata,
    });
  }

  static fromJSON(json: string): MessageEnvelope<unknown> {
    const parsed = JSON.parse(json);
    return new MessageEnvelope(parsed);
  }
}
```

---

## 2. Request-Response Pattern Implementation

### 2.1 Request-Response Manager

```typescript
// src/agents/messaging/request-response.ts

import { EventEmitter } from 'events';
import { MessageEnvelope } from './message-envelope.js';
import { AgentMessageType } from './message.types.js';

interface PendingRequest {
  resolve: (value: MessageEnvelope<unknown>) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  createdAt: number;
}

export class RequestResponseManager extends EventEmitter {
  private pendingRequests = new Map<string, PendingRequest>();
  private readonly defaultTimeout = 30000;

  constructor(private agentId: string) {
    super();
  }

  async request<T, R>(
    destination: string,
    payload: T,
    options: {
      correlationId?: string;
      priority?: 'low' | 'normal' | 'high' | 'critical';
      timeout?: number;
    } = {}
  ): Promise<MessageEnvelope<R>> {
    const correlationId = options.correlationId || crypto.randomUUID();
    const timeout = options.timeout || this.defaultTimeout;

    return new Promise((resolve, reject) => {
      const envelope = MessageEnvelope.create(AgentMessageType.REQUEST, payload, this.agentId, {
        destination,
        correlationId,
        priority: options.priority,
      });

      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        reject(new Error(`Request to ${destination} timed out after ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(correlationId, {
        resolve: resolve as (value: MessageEnvelope<unknown>) => void,
        reject,
        timeout: timeoutId,
        createdAt: Date.now(),
      });

      this.emit('request', envelope);
    });
  }

  respond<T, R>(
    originalEnvelope: MessageEnvelope<T>,
    payload: R,
    options: {
      success: boolean;
      error?: string;
    } = { success: true }
  ): MessageEnvelope<R | { success: boolean; error?: string }> {
    const responseType = options.success ? AgentMessageType.RESPONSE : AgentMessageType.ERROR;

    const response = MessageEnvelope.create(
      responseType,
      options.success ? payload : { success: false, error: options.error },
      this.agentId,
      {
        destination: originalEnvelope.source,
        correlationId: originalEnvelope.correlationId,
      }
    );

    this.emit('response', response);
    return response;
  }

  handleResponse(envelope: MessageEnvelope<unknown>): void {
    const pending = this.pendingRequests.get(envelope.correlationId || '');
    if (!pending) {
      console.warn(`No pending request found for correlationId: ${envelope.correlationId}`);
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(envelope.correlationId!);
    pending.resolve(envelope);
  }

  cancelRequest(correlationId: string, reason?: string): void {
    const pending = this.pendingRequests.get(correlationId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(correlationId);
      pending.reject(new Error(reason || 'Request cancelled'));
    }
  }

  getPendingRequestCount(): number {
    return this.pendingRequests.size;
  }

  cleanup(): void {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Manager shutdown'));
    }
    this.pendingRequests.clear();
  }
}
```

### 2.2 Request Handler Decorator

```typescript
// src/agents/messaging/request-handler.ts

import { MessageEnvelope } from './message-envelope.js';
import { RequestResponseManager } from './request-response.js';

export function createRequestHandler<TRequest, TResponse>(
  manager: RequestResponseManager,
  handler: (request: MessageEnvelope<TRequest>) => Promise<TResponse>
): (envelope: MessageEnvelope<TRequest>) => void {
  return (envelope: MessageEnvelope<TRequest>): void => {
    (async () => {
      try {
        const response = await handler(envelope);
        manager.respond(envelope, response);
      } catch (error) {
        manager.respond(envelope, null as unknown as TResponse, {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    })();
  };
}
```

### 2.3 Usage Example

```typescript
// src/agents/example-requester.ts

import { RequestResponseManager } from './messaging/request-response.js';
import { MessageEnvelope } from './messaging/message-envelope.js';

interface ScanRequest {
  path: string;
  recursive: boolean;
}

interface ScanResult {
  files: string[];
  count: number;
}

class ScanAgent {
  private requestManager: RequestResponseManager;

  constructor(agentId: string) {
    this.requestManager = new RequestResponseManager(agentId);
  }

  async requestScan(destination: string, request: ScanRequest): Promise<ScanResult> {
    return this.requestManager
      .request<ScanRequest, ScanResult>(destination, request, { priority: 'high', timeout: 60000 })
      .then((envelope) => envelope.payload as ScanResult);
  }

  registerScanHandler(
    handler: (request: MessageEnvelope<ScanRequest>) => Promise<ScanResult>
  ): void {
    const wrappedHandler = createRequestHandler(this.requestManager, handler);
    // Register with message bus
  }
}
```

---

## 3. Broadcast Pattern Implementation

### 3.1 Broadcast Manager

```typescript
// src/agents/messaging/broadcast-manager.ts

import { EventEmitter } from 'events';
import { MessageEnvelope } from './message-envelope.js';
import { AgentMessageType } from './message.types.js';

interface Subscription {
  agentId: string;
  filter?: (envelope: MessageEnvelope<unknown>) => boolean;
  handler: (envelope: MessageEnvelope<unknown>) => void;
}

export class BroadcastManager extends EventEmitter {
  private subscriptions = new Map<string, Subscription[]>();
  private readonly broadcastChannel: EventEmitter;

  constructor() {
    super();
    this.broadcastChannel = new EventEmitter();
    this.broadcastChannel.setMaxListeners(1000);
  }

  subscribe(
    agentId: string,
    topic: string,
    handler: (envelope: MessageEnvelope<unknown>) => void,
    filter?: (envelope: MessageEnvelope<unknown>) => boolean
  ): () => void {
    const existing = this.subscriptions.get(topic) || [];
    const subscription: Subscription = { agentId, handler, filter };
    existing.push(subscription);
    this.subscriptions.set(topic, existing);

    return () => this.unsubscribe(agentId, topic, handler);
  }

  unsubscribe(
    agentId: string,
    topic: string,
    handler?: (envelope: MessageEnvelope<unknown>) => void
  ): void {
    const subscriptions = this.subscriptions.get(topic);
    if (!subscriptions) return;

    if (handler) {
      const index = subscriptions.findIndex((s) => s.agentId === agentId && s.handler === handler);
      if (index > -1) subscriptions.splice(index, 1);
    } else {
      this.subscriptions.set(
        topic,
        subscriptions.filter((s) => s.agentId !== agentId)
      );
    }
  }

  broadcast<T>(
    topic: string,
    payload: T,
    source: string,
    options: {
      priority?: 'low' | 'normal' | 'high' | 'critical';
      metadata?: Record<string, unknown>;
    } = {}
  ): number {
    const envelope = MessageEnvelope.create(AgentMessageType.BROADCAST, payload, source, {
      metadata: { topic, ...options.metadata },
    });

    const subscriptions = this.subscriptions.get(topic) || [];
    let deliveredCount = 0;

    for (const subscription of subscriptions) {
      if (subscription.filter && !subscription.filter(envelope)) continue;

      try {
        subscription.handler(envelope);
        deliveredCount++;
      } catch (error) {
        console.error(`Broadcast handler error for ${subscription.agentId}:`, error);
      }
    }

    this.emit('broadcast', { topic, envelope, deliveredCount });
    return deliveredCount;
  }

  getTopicSubscribers(topic: string): string[] {
    const subscriptions = this.subscriptions.get(topic) || [];
    return [...new Set(subscriptions.map((s) => s.agentId))];
  }

  getAllTopics(): string[] {
    return [...this.subscriptions.keys()];
  }
}
```

### 3.2 Topic-Based Broadcast

```typescript
// src/agents/messaging/topic-broadcast.ts

import { BroadcastManager } from './broadcast-manager.js';
import { MessageEnvelope } from './message-envelope.js';

export enum BroadcastTopics {
  FILE_CHANGED = 'file:changed',
  TASK_COMPLETED = 'task:completed',
  ERROR_OCCURRED = 'error:occurred',
  PROGRESS_UPDATE = 'progress:update',
  STATE_CHANGE = 'state:change',
}

export interface ProgressUpdate {
  taskId: string;
  percentage: number;
  message: string;
}

export interface StateChange {
  previousState: string;
  newState: string;
  timestamp: number;
}

export class TopicBroadcast {
  constructor(private broadcastManager: BroadcastManager) {}

  subscribeToProgress(agentId: string, handler: (update: ProgressUpdate) => void): () => void {
    return this.broadcastManager.subscribe(agentId, BroadcastTopics.PROGRESS_UPDATE, (envelope) =>
      handler(envelope.payload as ProgressUpdate)
    );
  }

  publishProgress(source: string, update: ProgressUpdate): number {
    return this.broadcastManager.broadcast(BroadcastTopics.PROGRESS_UPDATE, update, source, {
      priority: 'low',
    });
  }

  subscribeToFileChanges(
    agentId: string,
    handler: (change: { path: string; type: 'create' | 'modify' | 'delete' }) => void,
    filter?: (envelope: MessageEnvelope<unknown>) => boolean
  ): () => void {
    return this.broadcastManager.subscribe(
      agentId,
      BroadcastTopics.FILE_CHANGED,
      (envelope) =>
        handler(envelope.payload as { path: string; type: 'create' | 'modify' | 'delete' }),
      filter
    );
  }

  publishFileChange(
    source: string,
    change: { path: string; type: 'create' | 'modify' | 'delete' }
  ): number {
    return this.broadcastManager.broadcast(BroadcastTopics.FILE_CHANGED, change, source, {
      priority: 'high',
    });
  }
}
```

---

## 4. Message Queue Configuration

### 4.1 Message Queue Manager

```typescript
// src/agents/messaging/message-queue.ts

import { PriorityQueue } from './priority-queue.js';
import { MessageEnvelope } from './message-envelope.js';
import { AgentMessageType } from './message.types.js';

interface QueueConfig {
  maxSize: number;
  processingConcurrency: number;
  retryAttempts: number;
  retryDelay: number;
  deadLetterQueue: boolean;
}

const defaultConfig: QueueConfig = {
  maxSize: 1000,
  processingConcurrency: 5,
  retryAttempts: 3,
  retryDelay: 1000,
  deadLetterQueue: true,
};

export class MessageQueue {
  private highPriorityQueue = new PriorityQueue<MessageEnvelope<unknown>>();
  private normalPriorityQueue = new PriorityQueue<MessageEnvelope<unknown>>();
  private lowPriorityQueue = new PriorityQueue<MessageEnvelope<unknown>>();
  private processingCount = 0;
  private deadLetterQueue: MessageEnvelope<unknown>[] = [];
  private isShuttingDown = false;

  constructor(
    private agentId: string,
    private config: Partial<QueueConfig> = {}
  ) {
    this.config = { ...defaultConfig, ...config };
  }

  enqueue<T>(envelope: MessageEnvelope<T>): boolean {
    if (this.isShuttingDown) return false;

    const totalSize = this.getQueueSize();
    if (totalSize >= this.config.maxSize) {
      console.warn(`Queue ${this.agentId} is full, dropping message ${envelope.id}`);
      return false;
    }

    switch (envelope.priority) {
      case 'critical':
      case 'high':
        this.highPriorityQueue.enqueue(envelope, Date.now());
        break;
      case 'normal':
        this.normalPriorityQueue.enqueue(envelope, Date.now());
        break;
      case 'low':
        this.lowPriorityQueue.enqueue(envelope, Date.now());
        break;
    }

    return true;
  }

  dequeue(): MessageEnvelope<unknown> | null {
    if (this.highPriorityQueue.size > 0) {
      return this.highPriorityQueue.dequeue() || null;
    }
    if (this.normalPriorityQueue.size > 0) {
      return this.normalPriorityQueue.dequeue() || null;
    }
    if (this.lowPriorityQueue.size > 0) {
      return this.lowPriorityQueue.dequeue() || null;
    }
    return null;
  }

  async process<T>(handler: (envelope: MessageEnvelope<T>) => Promise<void>): Promise<void> {
    if (this.processingCount >= this.config.processingConcurrency) {
      return;
    }

    const envelope = this.dequeue();
    if (!envelope) return;

    this.processingCount++;

    try {
      await handler(envelope as MessageEnvelope<T>);
    } catch (error) {
      await this.handleProcessingError(envelope, error);
    } finally {
      this.processingCount--;
    }
  }

  private async handleProcessingError(
    envelope: MessageEnvelope<unknown>,
    error: unknown
  ): Promise<void> {
    const retryCount = (envelope.retryCount || 0) + 1;

    if (retryCount < this.config.retryAttempts) {
      const delayedEnvelope = {
        ...envelope,
        retryCount,
        metadata: {
          ...envelope.metadata,
          lastError: error instanceof Error ? error.message : 'Unknown error',
          retryDelay: this.config.retryDelay * retryCount,
        },
      };

      setTimeout(() => {
        this.enqueue(delayedEnvelope);
      }, this.config.retryDelay * retryCount);
    } else if (this.config.deadLetterQueue) {
      this.deadLetterQueue.push(envelope);
      this.emit('deadLetter', { envelope, error });
    }
  }

  getQueueSize(): number {
    return this.highPriorityQueue.size + this.normalPriorityQueue.size + this.lowPriorityQueue.size;
  }

  getDeadLetterCount(): number {
    return this.deadLetterQueue.length;
  }

  getDeadLetterMessages(): MessageEnvelope<unknown>[] {
    return [...this.deadLetterQueue];
  }

  clear(): void {
    this.highPriorityQueue.clear();
    this.normalPriorityQueue.clear();
    this.lowPriorityQueue.clear();
  }

  shutdown(): void {
    this.isShuttingDown = true;
  }
}
```

### 4.2 Priority Queue Implementation

```typescript
// src/agents/messaging/priority-queue.ts

interface QueueItem<T> {
  item: T;
  priority: number;
  insertedAt: number;
}

export class PriorityQueue<T> {
  private items: QueueItem<T>[] = [];

  enqueue(item: T, priority: number): void {
    const queueItem: QueueItem<T> = {
      item,
      priority,
      insertedAt: Date.now(),
    };

    if (this.items.length === 0) {
      this.items.push(queueItem);
      return;
    }

    let inserted = false;
    for (let i = 0; i < this.items.length; i++) {
      if (queueItem.priority < this.items[i].priority) {
        this.items.splice(i, 0, queueItem);
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      this.items.push(queueItem);
    }
  }

  dequeue(): T | null {
    if (this.items.length === 0) return null;
    return this.items.shift()!.item;
  }

  peek(): T | null {
    if (this.items.length === 0) return null;
    return this.items[0].item;
  }

  size: number = this.items.length;

  clear(): void {
    this.items = [];
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }
}
```

---

## 5. Message Handling Code

### 5.1 Message Handler Router

```typescript
// src/agents/messaging/message-router.ts

import { MessageEnvelope } from './message-envelope.js';
import { AgentMessageType } from './message.types.js';

type HandlerFunction<T = unknown> = (envelope: MessageEnvelope<T>) => Promise<void>;

interface Route {
  type: AgentMessageType;
  handler: HandlerFunction;
  priority: number;
}

export class MessageRouter {
  private routes: Map<string, Route[]> = new Map();
  private defaultHandler?: HandlerFunction;

  registerRoute(type: AgentMessageType, handler: HandlerFunction, priority: number = 0): void {
    const existing = this.routes.get(type) || [];
    existing.push({ type, handler, priority });
    existing.sort((a, b) => b.priority - a.priority);
    this.routes.set(type, existing);
  }

  setDefaultHandler(handler: HandlerFunction): void {
    this.defaultHandler = handler;
  }

  async route<T>(envelope: MessageEnvelope<T>): Promise<void> {
    const handlers = this.routes.get(envelope.type) || [];

    for (const route of handlers) {
      try {
        await route.handler(envelope);
        return;
      } catch (error) {
        console.error(`Handler error for type ${envelope.type}:`, error);
      }
    }

    if (this.defaultHandler) {
      await this.defaultHandler(envelope);
    }
  }
}
```

### 5.2 Agent Base Class

```typescript
// src/agents/agent-base.ts

import { EventEmitter } from 'events';
import { MessageRouter } from './messaging/message-router.js';
import { RequestResponseManager } from './messaging/request-response.js';
import { BroadcastManager } from './messaging/broadcast-manager.js';
import { MessageQueue } from './messaging/message-queue.js';
import { MessageEnvelope } from './messaging/message-envelope.js';
import { AgentMessageType } from './messaging/message.types.js';
import { TopicBroadcast } from './messaging/topic-broadcast.js';

export abstract class AgentBase extends EventEmitter {
  readonly agentId: string;
  protected readonly requestManager: RequestResponseManager;
  protected readonly broadcastManager: BroadcastManager;
  protected readonly messageQueue: MessageQueue;
  protected readonly messageRouter: MessageRouter;
  protected readonly topicBroadcast: TopicBroadcast;
  protected isRunning = false;
  private heartbeatInterval?: ReturnType<typeof setInterval>;

  constructor(agentId: string) {
    super();
    this.agentId = agentId;
    this.requestManager = new RequestResponseManager(agentId);
    this.broadcastManager = new BroadcastManager();
    this.messageQueue = new MessageQueue(agentId);
    this.messageRouter = new MessageRouter();
    this.topicBroadcast = new TopicBroadcast(this.broadcastManager);

    this.setupDefaultRoutes();
  }

  protected setupDefaultRoutes(): void {
    this.messageRouter.registerRoute(AgentMessageType.REQUEST, this.handleRequest.bind(this), 100);

    this.messageRouter.registerRoute(
      AgentMessageType.RESPONSE,
      this.handleResponse.bind(this),
      100
    );

    this.messageRouter.registerRoute(
      AgentMessageType.BROADCAST,
      this.handleBroadcast.bind(this),
      50
    );

    this.messageRouter.registerRoute(
      AgentMessageType.HEARTBEAT,
      this.handleHeartbeat.bind(this),
      200
    );

    this.messageRouter.registerRoute(AgentMessageType.ERROR, this.handleError.bind(this), 150);
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startHeartbeat();
    this.emit('started');
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.stopHeartbeat();
    this.messageQueue.shutdown();
    this.emit('stopped');
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }

  protected sendHeartbeat(): void {
    const envelope = MessageEnvelope.create(
      AgentMessageType.HEARTBEAT,
      { agentId: this.agentId, timestamp: Date.now() },
      this.agentId,
      { priority: 'low' }
    );
    this.emit('heartbeat', envelope);
  }

  async send<T>(envelope: MessageEnvelope<T>): Promise<void> {
    if (envelope.destination) {
      this.messageQueue.enqueue(envelope);
      await this.processQueue();
    } else {
      this.broadcastManager.broadcast(
        (envelope.metadata?.topic as string) || 'general',
        envelope.payload,
        this.agentId
      );
    }
  }

  protected async handleRequest<T>(envelope: MessageEnvelope<T>): Promise<void> {
    const response = await this.processRequest(envelope);
    this.send(response);
  }

  protected async handleResponse<T>(envelope: MessageEnvelope<T>): Promise<void> {
    this.requestManager.handleResponse(envelope);
  }

  protected async handleBroadcast<T>(envelope: MessageEnvelope<T>): Promise<void> {
    this.emit('broadcast', envelope);
  }

  protected async handleHeartbeat<T>(envelope: MessageEnvelope<T>): Promise<void> {
    this.emit('heartbeatReceived', envelope);
  }

  protected async handleError<T>(envelope: MessageEnvelope<T>): Promise<void> {
    const errorPayload = envelope.payload as { message: string; stack?: string };
    console.error(`Error from ${envelope.source}:`, errorPayload.message);
    this.emit('error', envelope);
  }

  protected abstract processRequest<T>(
    envelope: MessageEnvelope<T>
  ): Promise<MessageEnvelope<unknown>>;

  private async processQueue(): Promise<void> {
    await this.messageQueue.process(async (envelope) => {
      await this.messageRouter.route(envelope);
    });
  }

  getStatus(): { isRunning: boolean; queueSize: number; pendingRequests: number } {
    return {
      isRunning: this.isRunning,
      queueSize: this.messageQueue.getQueueSize(),
      pendingRequests: this.requestManager.getPendingRequestCount(),
    };
  }
}
```

---

## 6. Error Recovery Protocols

### 6.1 Circuit Breaker

```typescript
// src/agents/resilience/circuit-breaker.ts

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenMaxCalls: number;
}

export class CircuitBreaker {
  private state = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: number;
  private halfOpenCalls = 0;

  constructor(
    private name: string,
    private config: Partial<CircuitBreakerConfig> = {}
  ) {
    this.config = {
      failureThreshold: 5,
      resetTimeout: 30000,
      halfOpenMaxCalls: 3,
      ...this.config,
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private shouldAttemptReset(): boolean {
    return (
      this.lastFailureTime !== undefined &&
      Date.now() - this.lastFailureTime >= this.config.resetTimeout!
    );
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.successCount++;

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenCalls++;
      if (this.halfOpenCalls >= this.config.halfOpenMaxCalls!) {
        this.transitionTo(CircuitState.CLOSED);
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.successCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
    } else if (this.failureCount >= this.config.failureThreshold!) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  private transitionTo(state: CircuitState): void {
    const previousState = this.state;
    this.state = state;

    if (state === CircuitState.HALF_OPEN) {
      this.halfOpenCalls = 0;
    }

    this.emit('stateChange', { name: this.name, from: previousState, to: state });
  }

  getState(): CircuitState {
    return this.state;
  }

  getMetrics(): { failureCount: number; successCount: number } {
    return { failureCount: this.failureCount, successCount: this.successCount };
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
    this.halfOpenCalls = 0;
  }
}
```

### 6.2 Retry Handler

```typescript
// src/agents/resilience/retry-handler.ts

interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: Set<string>;
  nonRetryableErrors: Set<string>;
}

export class RetryHandler {
  constructor(private config: Partial<RetryConfig> = {}) {
    this.config = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      retryableErrors: new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND']),
      nonRetryableErrors: new Set(['VALIDATION_ERROR', 'UNAUTHORIZED']),
      ...this.config,
    };
  }

  async execute<T>(
    fn: () => Promise<T>,
    options: { errorName?: string; onRetry?: (attempt: number, error: Error) => void } = {}
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.config.maxAttempts!; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (!this.isRetryable(lastError, options.errorName)) {
          throw lastError;
        }

        if (attempt < this.config.maxAttempts!) {
          const delay = this.calculateDelay(attempt);
          options.onRetry?.(attempt, lastError);
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  private isRetryable(error: Error, errorName?: string): boolean {
    if (errorName && this.config.nonRetryableErrors!.has(errorName)) {
      return false;
    }

    if (errorName && this.config.retryableErrors!.has(errorName)) {
      return true;
    }

    const errorMessage = error.message.toUpperCase();
    return (
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('ETIMEDOUT') ||
      errorMessage.includes('ENOTFOUND') ||
      errorMessage.includes('NETWORK')
    );
  }

  private calculateDelay(attempt: number): number {
    const delay = this.config.baseDelay! * Math.pow(this.config.backoffMultiplier!, attempt - 1);
    return Math.min(delay, this.config.maxDelay!);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

### 6.3 Recovery Manager

```typescript
// src/agents/resilience/recovery-manager.ts

import { EventEmitter } from 'events';
import { CircuitBreaker, CircuitState } from './circuit-breaker.js';
import { RetryHandler } from './retry-handler.js';
import { MessageEnvelope } from '../messaging/message-envelope.js';

interface RecoveryConfig {
  circuitBreaker: {
    failureThreshold: number;
    resetTimeout: number;
  };
  retry: {
    maxAttempts: number;
    baseDelay: number;
    backoffMultiplier: number;
  };
  checkpointInterval: number;
}

interface RecoveryCheckpoint {
  id: string;
  timestamp: number;
  state: Record<string, unknown>;
  processedMessages: string[];
}

export class RecoveryManager extends EventEmitter {
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private checkpoints: RecoveryCheckpoint[] = [];
  private currentCheckpoint?: RecoveryCheckpoint;
  private checkpointInterval?: ReturnType<typeof setInterval>;

  constructor(private config: Partial<RecoveryConfig> = {}) {
    super();
    this.config = {
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeout: 30000,
        ...this.config.circuitBreaker,
      },
      retry: {
        maxAttempts: 3,
        baseDelay: 1000,
        backoffMultiplier: 2,
        ...this.config.retry,
      },
      checkpointInterval: 60000,
      ...this.config,
    };
  }

  getCircuitBreaker(name: string): CircuitBreaker {
    let cb = this.circuitBreakers.get(name);
    if (!cb) {
      cb = new CircuitBreaker(name, this.config.circuitBreaker);
      this.circuitBreakers.set(name, cb);
      cb.on('stateChange', (event) => {
        this.emit('circuitStateChange', event);
      });
    }
    return cb;
  }

  createRetryHandler(errorName?: string): RetryHandler {
    const handler = new RetryHandler(this.config.retry);
    handler.execute(async () => {}, { errorName });
    return handler;
  }

  async executeWithRecovery<T>(
    operation: string,
    fn: () => Promise<T>,
    checkpointState?: Record<string, unknown>
  ): Promise<T> {
    const circuitBreaker = this.getCircuitBreaker(operation);

    return circuitBreaker.execute(async () => {
      const retryHandler = this.createRetryHandler(operation);

      return retryHandler.execute(async () => {
        this.startCheckpoint(operation, checkpointState);
        try {
          const result = await fn();
          this.commitCheckpoint(operation);
          return result;
        } catch (error) {
          this.handleFailure(operation, error);
          throw error;
        }
      });
    });
  }

  private startCheckpoint(operation: string, state?: Record<string, unknown>): void {
    this.currentCheckpoint = {
      id: `${operation}-${Date.now()}`,
      timestamp: Date.now(),
      state: state || {},
      processedMessages: [],
    };
  }

  private commitCheckpoint(operation: string): void {
    if (this.currentCheckpoint) {
      this.checkpoints.push(this.currentCheckpoint);
      if (this.checkpoints.length > 10) {
        this.checkpoints.shift();
      }
      this.emit('checkpointCommitted', { operation, checkpoint: this.currentCheckpoint });
      this.currentCheckpoint = undefined;
    }
  }

  private handleFailure(operation: string, error: unknown): void {
    this.emit('operationFailed', { operation, error, checkpoint: this.currentCheckpoint });
  }

  startPeriodicCheckpoints(): void {
    this.stopPeriodicCheckpoints();
    this.checkpointInterval = setInterval(() => {
      this.createSnapshot();
    }, this.config.checkpointInterval);
  }

  stopPeriodicCheckpoints(): void {
    if (this.checkpointInterval) {
      clearInterval(this.checkpointInterval);
    }
  }

  createSnapshot(): RecoveryCheckpoint | null {
    if (!this.currentCheckpoint) return null;

    const snapshot: RecoveryCheckpoint = {
      ...this.currentCheckpoint,
      id: `snapshot-${Date.now()}`,
      timestamp: Date.now(),
    };

    this.checkpoints.push(snapshot);
    this.emit('snapshotCreated', snapshot);
    return snapshot;
  }

  async restoreFromSnapshot(snapshotId: string): Promise<Record<string, unknown> | null> {
    const snapshot = this.checkpoints.find((c) => c.id === snapshotId);
    if (!snapshot) {
      console.warn(`Snapshot ${snapshotId} not found`);
      return null;
    }

    this.emit('snapshotRestored', { snapshotId, state: snapshot.state });
    return snapshot.state;
  }

  getLastCheckpoint(): RecoveryCheckpoint | undefined {
    return this.checkpoints[this.checkpoints.length - 1];
  }

  getCircuitBreakerStates(): Record<string, CircuitState> {
    const states: Record<string, CircuitState> = {};
    for (const [name, cb] of this.circuitBreakers) {
      states[name] = cb.getState();
    }
    return states;
  }

  cleanup(): void {
    this.stopPeriodicCheckpoints();
    for (const cb of this.circuitBreakers.values()) {
      cb.reset();
    }
    this.checkpoints = [];
  }
}
```

### 6.4 Dead Letter Handler

```typescript
// src/agents/resilience/dead-letter-handler.ts

import { EventEmitter } from 'events';
import { MessageEnvelope } from '../messaging/message-envelope.js';

interface DeadLetterConfig {
  maxStoredMessages: number;
  cleanupInterval: number;
  alertThreshold: number;
}

interface DeadLetterEntry {
  envelope: MessageEnvelope<unknown>;
  timestamp: number;
  failureCount: number;
  lastError?: string;
  originalDestination?: string;
}

export class DeadLetterHandler extends EventEmitter {
  private deadLetters: DeadLetterEntry[] = [];
  private cleanupInterval?: ReturnType<typeof setInterval>;

  constructor(private config: Partial<DeadLetterConfig> = {}) {
    super();
    this.config = {
      maxStoredMessages: 100,
      cleanupInterval: 300000,
      alertThreshold: 10,
      ...this.config,
    };

    this.startCleanup();
  }

  add(envelope: MessageEnvelope<unknown>, error?: Error): void {
    const entry: DeadLetterEntry = {
      envelope,
      timestamp: Date.now(),
      failureCount: (envelope.retryCount || 0) + 1,
      lastError: error?.message,
    };

    this.deadLetters.unshift(entry);

    if (this.deadLetters.length > this.config.maxStoredMessages!) {
      this.deadLetters = this.deadLetters.slice(0, this.config.maxStoredMessages);
    }

    this.emit('deadLetterReceived', entry);

    if (this.deadLetters.length >= this.config.alertThreshold!) {
      this.emit('alertThresholdExceeded', {
        count: this.deadLetters.length,
        threshold: this.config.alertThreshold,
      });
    }
  }

  retry(entryId: number): boolean {
    const entry = this.deadLetters[entryId];
    if (!entry) return false;

    this.emit('retryRequested', entry);
    this.remove(entryId);
    return true;
  }

  retryAll(): number {
    const count = this.deadLetters.length;
    this.deadLetters = [];
    this.emit('retryAllRequested', { count });
    return count;
  }

  remove(entryId: number): void {
    this.deadLetters.splice(entryId, 1);
  }

  clear(): void {
    const count = this.deadLetters.length;
    this.deadLetters = [];
    this.emit('cleared', { count });
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const cutoff = Date.now() - 86400000;
      const oldCount = this.deadLetters.filter((e) => e.timestamp < cutoff).length;
      this.deadLetters = this.deadLetters.filter((e) => e.timestamp >= cutoff);

      if (oldCount > 0) {
        this.emit('cleanup', { removedCount: oldCount });
      }
    }, this.config.cleanupInterval!);
  }

  getDeadLetters(): DeadLetterEntry[] {
    return [...this.deadLetters];
  }

  getStats(): { total: number; oldest: number | null; newest: number | null } {
    if (this.deadLetters.length === 0) {
      return { total: 0, oldest: null, newest: null };
    }

    const timestamps = this.deadLetters.map((e) => e.timestamp);
    return {
      total: this.deadLetters.length,
      oldest: Math.min(...timestamps),
      newest: Math.max(...timestamps),
    };
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}
```

---

## 7. Complete Usage Example

```typescript
// src/agents/example-usage.ts

import { AgentBase } from './agent-base.js';
import { MessageEnvelope } from './messaging/message-envelope.js';
import { RecoveryManager } from './resilience/recovery-manager.js';
import { DeadLetterHandler } from './resilience/dead-letter-handler.js';

interface OrganizeTask {
  sourcePath: string;
  rules: string[];
}

interface OrganizeResult {
  organizedFiles: number;
  errors: string[];
}

class OrganizerAgent extends AgentBase {
  private recoveryManager: RecoveryManager;
  private deadLetterHandler: DeadLetterHandler;

  constructor() {
    super('organizer-agent');
    this.recoveryManager = new RecoveryManager();
    this.deadLetterHandler = new DeadLetterHandler();
  }

  protected async processRequest<T>(
    envelope: MessageEnvelope<T>
  ): Promise<MessageEnvelope<unknown>> {
    const task = envelope.payload as OrganizeTask;

    const result = await this.recoveryManager.executeWithRecovery(
      'organize-files',
      async () => {
        await this.organizeFiles(task);
        return { organizedFiles: 10, errors: [] } as OrganizeResult;
      },
      { task }
    );

    return this.respond(envelope, result);
  }

  private async organizeFiles(task: OrganizeTask): Promise<void> {
    console.log(`Organizing files in ${task.sourcePath}`);
    this.topicBroadcast.publishProgress(this.agentId, {
      taskId: envelope.id,
      percentage: 50,
      message: 'Processing files...',
    });
  }
}

const agent = new OrganizerAgent();
agent.start();

agent.topicBroadcast.publishProgress(agent.agentId, {
  taskId: '123',
  percentage: 100,
  message: 'Complete',
});
```

---

## Summary

This communication protocol implements:

- **Message Format**: Structured envelopes with type, priority, and correlation tracking
- **Request-Response**: With correlation IDs and timeout handling
- **Broadcast**: Topic-based pub/sub with filtering
- **Message Queue**: Priority-based with dead letter handling
- **Error Recovery**: Circuit breakers, retry handlers, and checkpoint recovery
