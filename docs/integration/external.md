# External Integrations

This document provides TypeScript code examples for integrating with common external services.

## GitHub Integration

```typescript
import { Octokit } from '@octokit/rest';

interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
}

class GitHubIntegration {
  private octokit: Octokit;

  constructor(config: GitHubConfig) {
    this.octokit = new Octokit({ auth: config.token });
  }

  async createIssue(title: string, body: string, labels?: string[]): Promise<void> {
    await this.octokit.issues.create({
      owner: this.config.owner,
      repo: this.config.repo,
      title,
      body,
      labels,
    });
  }

  async createPullRequest(
    title: string,
    head: string,
    base: string,
    body?: string
  ): Promise<number> {
    const { data } = await this.octokit.pulls.create({
      owner: this.config.owner,
      repo: this.config.repo,
      title,
      head,
      base,
      body,
    });
    return data.number;
  }

  async uploadFile(path: string, content: string, message: string): Promise<void> {
    const { data } = await this.octokit.repos.createOrUpdateFileContents({
      owner: this.config.owner,
      repo: this.config.repo,
      path,
      message,
      content: Buffer.from(content).toString('base64'),
    });
  }

  async getFile(path: string): Promise<string> {
    const { data } = await this.octokit.repos.getContent({
      owner: this.config.owner,
      repo: this.config.repo,
      path,
    });
    if ('content' in data) {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    throw new Error('Path is a directory');
  }
}
```

## Slack Integration

```typescript
import { WebClient } from '@slack/web-api';

interface SlackConfig {
  token: string;
  channel: string;
}

class SlackIntegration {
  private client: WebClient;
  private defaultChannel: string;

  constructor(config: SlackConfig) {
    this.client = new WebClient(config.token);
    this.defaultChannel = config.channel;
  }

  async sendMessage(text: string, channel?: string): Promise<void> {
    await this.client.chat.postMessage({
      channel: channel || this.defaultChannel,
      text,
    });
  }

  async sendBlockMessage(blocks: any[], channel?: string): Promise<void> {
    await this.client.chat.postMessage({
      channel: channel || this.defaultChannel,
      blocks,
    });
  }

  async uploadFile(filePath: string, title: string, channel?: string): Promise<void> {
    await this.client.files.upload({
      file: filePath,
      title,
      channels: channel || this.defaultChannel,
    });
  }

  async getChannelInfo(channelId: string): Promise<any> {
    return this.client.conversations.info({ channel: channelId });
  }
}
```

## MongoDB Integration

```typescript
import { MongoClient, Db, Collection, ObjectId } from 'mongodb';

interface MongoConfig {
  uri: string;
  dbName: string;
}

class MongoDBIntegration {
  private client: MongoClient;
  private db: Db;

  async connect(config: MongoConfig): Promise<void> {
    this.client = new MongoClient(config.uri);
    await this.client.connect();
    this.db = this.client.db(config.dbName);
  }

  async disconnect(): Promise<void> {
    await this.client.close();
  }

  getCollection<T extends Document>(name: string): Collection<T> {
    return this.db.collection<T>(name);
  }

  async insertOne<T>(collection: string, document: T): Promise<ObjectId> {
    const result = await this.db.collection(collection).insertOne(document);
    return result.insertedId;
  }

  async find<T>(collection: string, query: any): Promise<T[]> {
    return this.db.collection(collection).find<T>(query).toArray();
  }

  async updateOne(collection: string, filter: any, update: any): Promise<void> {
    await this.db.collection(collection).updateOne(filter, { $set: update });
  }

  async deleteOne(collection: string, query: any): Promise<void> {
    await this.db.collection(collection).deleteOne(query);
  }

  async aggregate<T>(collection: string, pipeline: any[]): Promise<T[]> {
    return this.db.collection(collection).aggregate<T>(pipeline).toArray();
  }
}
```

## Redis Integration

```typescript
import { createClient, RedisClientType } from 'redis';

interface RedisConfig {
  url: string;
}

class RedisIntegration {
  private client: RedisClientType;

  async connect(config: RedisConfig): Promise<void> {
    this.client = createClient({ url: config.url });
    this.client.on('error', (err) => console.error('Redis Client Error', err));
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }

  async set(key: string, value: string): Promise<void> {
    await this.client.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async setJson(key: string, value: object): Promise<void> {
    await this.client.set(key, JSON.stringify(value));
  }

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : null;
  }

  async setEx(key: string, seconds: number, value: string): Promise<void> {
    await this.client.setEx(key, seconds, value);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async increment(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async addToSet(key: string, ...values: string[]): Promise<number> {
    return this.client.sAdd(key, values);
  }

  async getSetMembers(key: string): Promise<string[]> {
    return this.client.sMembers(key);
  }

  async pushToList(key: string, ...values: string[]): Promise<number> {
    return this.client.rPush(key, values);
  }

  async getListRange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.lRange(key, start, stop);
  }
}
```

## Prometheus/Grafana Integration

```typescript
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

interface MetricsConfig {
  prefix: string;
  labels?: Record<string, string>;
}

class MetricsIntegration {
  private registry: Registry;
  private httpRequestDuration: Histogram<string>;
  private httpRequestsTotal: Counter<string>;
  private activeConnections: Gauge<string>;

  constructor(config: MetricsConfig) {
    this.registry = new Registry();
    this.registry.setDefaultLabels(config.labels || {});

    this.httpRequestDuration = new Histogram({
      name: `${config.prefix}_http_request_duration_seconds`,
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    });

    this.httpRequestsTotal = new Counter({
      name: `${config.prefix}_http_requests_total`,
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
    });

    this.activeConnections = new Gauge({
      name: `${config.prefix}_active_connections`,
      help: 'Number of active connections',
    });

    this.registry.registerMetric(this.httpRequestDuration);
    this.registry.registerMetric(this.httpRequestsTotal);
    this.registry.registerMetric(this.activeConnections);

    collectDefaultMetrics({ register: this.registry });
  }

  recordRequest(method: string, route: string, statusCode: number, duration: number): void {
    this.httpRequestDuration.observe(
      { method, route, status_code: statusCode.toString() },
      duration
    );
    this.httpRequestsTotal.inc({ method, route, status_code: statusCode.toString() });
  }

  setActiveConnections(count: number): void {
    this.activeConnections.set(count);
  }

  incrementActiveConnections(): void {
    this.activeConnections.inc();
  }

  decrementActiveConnections(): void {
    this.activeConnections.dec();
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}

class GrafanaClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async createDashboard(dashboard: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/dashboards/db`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ dashboard, overwrite: true }),
    });
    return response.json();
  }

  async createAlert(alert: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/alerts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(alert),
    });
    return response.json();
  }

  async getDashboard(uid: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/dashboards/uid/${uid}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
    return response.json();
  }
}
```

## CI/CD Integration Examples

### GitHub Actions

```typescript
import { Octokit } from '@octokit/rest';

interface WorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
}

class GitHubActionsIntegration {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(octokit: Octokit, owner: string, repo: string) {
    this.octokit = octokokit;
    this.owner = owner;
    this.repo = repo;
  }

  async listWorkflowRuns(workflowId: string, perPage = 30): Promise<WorkflowRun[]> {
    const { data } = await this.octokit.actions.listWorkflowRuns({
      owner: this.owner,
      repo: this.repo,
      workflow_id: workflowId,
      per_page: perPage,
    });
    return data.workflow_runs;
  }

  async triggerWorkflow(
    workflowId: string,
    ref = 'main',
    inputs?: Record<string, string>
  ): Promise<void> {
    await this.octokit.actions.createWorkflowDispatch({
      owner: this.owner,
      repo: this.repo,
      workflow_id: workflowId,
      ref,
      inputs,
    });
  }

  async cancelWorkflowRun(runId: number): Promise<void> {
    await this.octokit.actions.cancelWorkflowRun({
      owner: this.owner,
      repo: this.repo,
      run_id: runId,
    });
  }

  async rerunWorkflow(runId: number): Promise<void> {
    await this.octokit.actions.reRunWorkflow({
      owner: this.owner,
      repo: this.repo,
      run_id: runId,
    });
  }

  async getWorkflowRunStatus(runId: number): Promise<WorkflowRun> {
    const { data } = await this.octokit.actions.getWorkflowRun({
      owner: this.owner,
      repo: this.repo,
      run_id: runId,
    });
    return data;
  }
}
```

### Jenkins Integration

```typescript
interface JenkinsConfig {
  baseUrl: string;
  username: string;
  apiToken: string;
}

class JenkinsIntegration {
  private baseUrl: string;
  private auth: string;

  constructor(config: JenkinsConfig) {
    this.baseUrl = config.baseUrl;
    this.auth = Buffer.from(`${config.username}:${config.apiToken}`).toString('base64');
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Basic ${this.auth}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    if (!response.ok) {
      throw new Error(`Jenkins API error: ${response.statusText}`);
    }
    return response.json();
  }

  async getJobs(): Promise<any[]> {
    const data = await this.request(
      '/api/json?tree=jobs[name,url,color,lastBuild[number,result,timestamp,duration]]'
    );
    return data.jobs;
  }

  async triggerBuild(jobName: string, parameters?: Record<string, string>): Promise<void> {
    let url = `/job/${encodeURIComponent(jobName)}/build`;
    if (parameters) {
      const params = new URLSearchParams(parameters);
      url = `/job/${encodeURIComponent(jobName)}/buildWithParameters?${params}`;
    }
    await fetch(`${this.baseUrl}${url}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${this.auth}`,
      },
    });
  }

  async getBuildInfo(jobName: string, buildNumber: number): Promise<any> {
    return this.request(`/job/${encodeURIComponent(jobName)}/${buildNumber}/api/json`);
  }

  async getLastBuildInfo(jobName: string): Promise<any> {
    return this.request(`/job/${encodeURIComponent(jobName)}/lastBuild/api/json`);
  }

  async getQueueInfo(): Promise<any[]> {
    const data = await this.request('/queue/api/json?tree=items[id,url,inQueueSince,why]');
    return data.items;
  }
}
```

### CircleCI Integration

```typescript
interface CircleCIConfig {
  token: string;
  projectSlug: string;
}

class CircleCIIntegration {
  private baseUrl = 'https://circleci.com/api/v2';
  private token: string;
  private projectSlug: string;

  constructor(config: CircleCIConfig) {
    this.token = config.token;
    this.projectSlug = config.projectSlug;
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Circle-Token': this.token,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    if (!response.ok) {
      throw new Error(`CircleCI API error: ${response.statusText}`);
    }
    return response.json();
  }

  async getPipelines(branch?: string): Promise<any[]> {
    const params = branch ? `?branch=${encodeURIComponent(branch)}` : '';
    const data = await this.request(`/project/${this.projectSlug}/pipeline${params}`);
    return data.items;
  }

  async triggerPipeline(branch: string, parameters?: Record<string, any>): Promise<any> {
    return this.request(`/project/${this.projectSlug}/pipeline`, {
      method: 'POST',
      body: JSON.stringify({ branch, parameters }),
    });
  }

  async getWorkflowJobs(workflowId: string): Promise<any[]> {
    const data = await this.request(`/workflow/${workflowId}/job`);
    return data.items;
  }

  async cancelWorkflow(workflowId: string): Promise<void> {
    await this.request(`/workflow/${workflowId}/cancel`, { method: 'POST' });
  }

  async rerunWorkflow(workflowId: string, fromFailed = false): Promise<void> {
    const endpoint = fromFailed
      ? `/workflow/${workflowId}/rerun?from.failed=true`
      : `/workflow/${workflowId}/rerun`;
    await this.request(endpoint, { method: 'POST' });
  }
}
```

### GitLab CI Integration

```typescript
interface GitLabConfig {
  baseUrl: string;
  privateToken: string;
  projectId: string;
}

class GitLabCIIntegration {
  private baseUrl: string;
  private headers: HeadersInit;
  private projectId: string;

  constructor(config: GitLabConfig) {
    this.baseUrl = config.baseUrl;
    this.headers = {
      'PRIVATE-TOKEN': config.privateToken,
      'Content-Type': 'application/json',
    };
    this.projectId = config.projectId;
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/v4${endpoint}`, {
      ...options,
      headers: { ...this.headers, ...options.headers },
    });
    if (!response.ok) {
      throw new Error(`GitLab API error: ${response.statusText}`);
    }
    return response.json();
  }

  async getPipelines(ref?: string, perPage = 20): Promise<any[]> {
    const params = new URLSearchParams({ per_page: perPage.toString() });
    if (ref) params.append('ref', ref);
    return this.request(`/projects/${this.projectId}/pipelines?${params}`);
  }

  async triggerPipeline(ref: string, variables?: Record<string, string>): Promise<any> {
    const body: any = { ref };
    if (variables) {
      body.variables = Object.entries(variables).map(([key, value]) => ({ key, value }));
    }
    return this.request(`/projects/${this.projectId}/pipeline`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async getPipelineJobs(pipelineId: number): Promise<any[]> {
    return this.request(`/projects/${this.projectId}/pipelines/${pipelineId}/jobs`);
  }

  async cancelPipeline(pipelineId: number): Promise<void> {
    await this.request(`/projects/${this.projectId}/pipelines/${pipelineId}/cancel`, {
      method: 'POST',
    });
  }

  async retryPipeline(pipelineId: number): Promise<void> {
    await this.request(`/projects/${this.projectId}/pipelines/${pipelineId}/retry`, {
      method: 'POST',
    });
  }

  async getJobTrace(jobId: number): Promise<string> {
    const response = await fetch(
      `${this.baseUrl}/api/v4/projects/${this.projectId}/jobs/${jobId}/trace`,
      {
        headers: { 'PRIVATE-TOKEN': this.headers['PRIVATE-TOKEN'] as string },
      }
    );
    return response.text();
  }
}
```
