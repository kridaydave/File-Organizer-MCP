/**
 * Issue Tracking Integration for Debates
 *
 * Provides functionality to create and sync GitHub issues from debates,
 * with automatic label application and status synchronization.
 */

import { randomUUID } from "node:crypto";

export interface CreatedIssue {
  id: string;
  title: string;
  url: string;
  status: string;
  linkedDebate: string;
}

export interface IssueConfig {
  projectId: string;
  baseUrl: string;
  labels: string[];
  template?: string;
}

export interface DebateIssueLink {
  issueId: string;
  debateId: string;
  linkType: "implementation" | "research" | "follow-up";
  status: "open" | "in-progress" | "resolved";
  createdAt: Date;
}

export interface Debate {
  id: string;
  title: string;
  description: string;
  participants: string[];
  status: "pending" | "active" | "concluded";
  outcomes: string[];
  startTime: Date;
  endTime?: Date;
}

export interface GitHubApi {
  createIssue(
    title: string,
    body: string,
    labels: string[],
  ): Promise<CreatedIssue>;
  updateIssue(
    issueId: string,
    updates: Partial<CreatedIssue>,
  ): Promise<CreatedIssue>;
  getIssue(issueId: string): Promise<CreatedIssue | null>;
  addLabels(issueId: string, labels: string[]): Promise<void>;
  removeLabels(issueId: string, labels: string[]): Promise<void>;
}

export class MockGitHubApi implements GitHubApi {
  private issues: Map<string, CreatedIssue> = new Map();

  async createIssue(
    title: string,
    body: string,
    labels: string[],
  ): Promise<CreatedIssue> {
    const id = `issue-${randomUUID().slice(0, 8)}`;
    const issue: CreatedIssue = {
      id,
      title,
      url: `https://github.com/example/project/issues/${id}`,
      status: "open",
      linkedDebate: "",
    };
    this.issues.set(id, issue);
    return issue;
  }

  async updateIssue(
    issueId: string,
    updates: Partial<CreatedIssue>,
  ): Promise<CreatedIssue> {
    const issue = this.issues.get(issueId);
    if (!issue) {
      throw new Error(`Issue ${issueId} not found`);
    }
    const updated = { ...issue, ...updates };
    this.issues.set(issueId, updated);
    return updated;
  }

  async getIssue(issueId: string): Promise<CreatedIssue | null> {
    return this.issues.get(issueId) ?? null;
  }

  async addLabels(issueId: string, labels: string[]): Promise<void> {
    const issue = this.issues.get(issueId);
    if (issue) {
      this.issues.set(issueId, { ...issue });
    }
  }

  async removeLabels(issueId: string, labels: string[]): Promise<void> {
    const issue = this.issues.get(issueId);
    if (issue) {
      this.issues.set(issueId, { ...issue });
    }
  }
}

export class DebateIssueIntegrator {
  private githubApi: GitHubApi;
  private links: Map<string, DebateIssueLink[]> = new Map();
  private issueConfigs: Map<string, IssueConfig> = new Map();

  constructor(githubApi?: GitHubApi) {
    this.githubApi = githubApi ?? new MockGitHubApi();
  }

  /**
   * Creates GitHub issues from a debate's outcomes and topics
   * @param debate - The debate to create issues from
   * @param projectId - The GitHub project ID
   * @returns Array of created issues
   */
  async createIssuesFromDebate(
    debate: Debate,
    projectId: string,
  ): Promise<CreatedIssue[]> {
    const config = this.issueConfigs.get(projectId) ?? {
      projectId,
      baseUrl: "https://github.com/example/project",
      labels: ["debate", "from-discussion"],
    };

    const issues: CreatedIssue[] = [];

    for (const outcome of debate.outcomes) {
      const title = `[Debate] ${debate.title}: ${outcome.slice(0, 50)}`;
      const body = this.generateIssueBody(debate, outcome, config);
      const labels = [...config.labels, this.categorizeOutcome(outcome)];

      const issue = await this.githubApi.createIssue(title, body, labels);
      issue.linkedDebate = debate.id;
      issues.push(issue);

      await this.githubApi.addLabels(issue.id, labels);
    }

    if (debate.participants.length > 3) {
      const trackingIssue = await this.githubApi.createIssue(
        `[Debate Tracking] ${debate.title}`,
        this.generateTrackingBody(debate, config),
        [...config.labels, "tracking-issue", "high-priority"],
      );
      trackingIssue.linkedDebate = debate.id;
      issues.push(trackingIssue);
    }

    return issues;
  }

  /**
   * Links an existing issue to a debate
   * @param issueId - The GitHub issue ID
   * @param debateId - The debate ID to link to
   * @param linkType - The type of link relationship
   * @returns The created link
   */
  linkIssue(
    issueId: string,
    debateId: string,
    linkType: DebateIssueLink["linkType"],
  ): DebateIssueLink {
    const link: DebateIssueLink = {
      issueId,
      debateId,
      linkType,
      status: "open",
      createdAt: new Date(),
    };

    const existingLinks = this.links.get(debateId) ?? [];
    existingLinks.push(link);
    this.links.set(debateId, existingLinks);

    return link;
  }

  /**
   * Gets all issues linked to a specific debate
   * @param debateId - The debate ID
   * @returns Array of linked issues with their link metadata
   */
  async getLinkedIssues(
    debateId: string,
  ): Promise<{ issue: CreatedIssue | null; link: DebateIssueLink }[]> {
    const links = this.links.get(debateId) ?? [];
    const results: { issue: CreatedIssue | null; link: DebateIssueLink }[] = [];

    for (const link of links) {
      const issue = await this.githubApi.getIssue(link.issueId);
      results.push({ issue, link });
    }

    return results;
  }

  /**
   * Configures issue creation settings for a project
   * @param config - The issue configuration
   */
  configureProject(config: IssueConfig): void {
    this.issueConfigs.set(config.projectId, config);
  }

  /**
   * Gets all configured projects
   * @returns Array of issue configurations
   */
  getConfiguredProjects(): IssueConfig[] {
    return Array.from(this.issueConfigs.values());
  }

  private generateIssueBody(
    debate: Debate,
    outcome: string,
    config: IssueConfig,
  ): string {
    return `
## Debate Context
- **Debate ID**: ${debate.id}
- **Title**: ${debate.title}
- **Status**: ${debate.status}
- **Participants**: ${debate.participants.join(", ")}

## Description
${debate.description}

## Agreed Outcome
${outcome}

---
*Generated from debate discussion. Labels: ${config.labels.join(", ")}*
`.trim();
  }

  private generateTrackingBody(debate: Debate, config: IssueConfig): string {
    return `
## High-Priority Debate Tracking
- **Debate**: ${debate.title}
- **Participants**: ${debate.participants.length} shepherds involved
- **Started**: ${debate.startTime.toISOString()}

### Summary
This debate had significant participation (${debate.participants.length} participants). All related issues should be tracked here.

### Outcomes
${debate.outcomes.map((o, i) => `${i + 1}. ${o}`).join("\n")}

---
*Auto-generated tracking issue for high-participation debate*
`.trim();
  }

  private categorizeOutcome(outcome: string): string {
    const lower = outcome.toLowerCase();
    if (
      lower.includes("implement") ||
      lower.includes("create") ||
      lower.includes("build")
    ) {
      return "action-item";
    }
    if (
      lower.includes("research") ||
      lower.includes("investigate") ||
      lower.includes("explore")
    ) {
      return "research-needed";
    }
    if (
      lower.includes("review") ||
      lower.includes("discuss") ||
      lower.includes("consider")
    ) {
      return "discussion";
    }
    return "debt";
  }
}

export class IssueSyncManager {
  private githubApi: GitHubApi;
  private syncHistory: Map<string, Date> = new Map();
  private statusMappings: Map<string, string> = new Map([
    ["open", "pending"],
    ["in-progress", "active"],
    ["closed", "concluded"],
  ]);

  constructor(githubApi?: GitHubApi) {
    this.githubApi = githubApi ?? new MockGitHubApi();
  }

  /**
   * Synchronizes issue statuses with debate progress
   * @param issueIds - Array of GitHub issue IDs to sync
   * @param debateId - The debate ID for logging
   * @returns Sync result with updated issues
   */
  async syncStatus(
    issueIds: string[],
    debateId: string,
  ): Promise<Map<string, CreatedIssue>> {
    const results = new Map<string, CreatedIssue>();

    for (const issueId of issueIds) {
      const issue = await this.githubApi.getIssue(issueId);
      if (issue) {
        results.set(issueId, issue);
      }
    }

    this.syncHistory.set(debateId, new Date());

    return results;
  }

  /**
   * Updates a debate based on linked issue progress
   * @param debate - The debate to update
   * @param issues - Array of issues to check progress from
   * @returns Updated debate status
   */
  async updateDebateFromIssues(
    debate: Debate,
    issues: CreatedIssue[],
  ): Promise<{ updatedDebate: Debate; progressPercentage: number }> {
    let resolvedCount = 0;
    let inProgressCount = 0;

    for (const issue of issues) {
      if (issue.status === "closed" || issue.status === "resolved") {
        resolvedCount++;
      } else if (
        issue.status === "in_progress" ||
        issue.status === "in-progress"
      ) {
        inProgressCount++;
      }
    }

    const totalIssues = issues.length;
    const progressPercentage =
      totalIssues > 0
        ? Math.round(
            ((resolvedCount + inProgressCount * 0.5) / totalIssues) * 100,
          )
        : 0;

    let updatedStatus: Debate["status"] = debate.status;
    if (progressPercentage >= 100) {
      updatedStatus = "concluded";
    } else if (progressPercentage >= 50) {
      updatedStatus = "active";
    }

    const updatedDebate: Debate = {
      ...debate,
      status: updatedStatus,
      endTime: updatedStatus === "concluded" ? new Date() : debate.endTime,
    };

    return { updatedDebate, progressPercentage };
  }

  /**
   * Gets the sync history for a debate
   * @param debateId - The debate ID
   * @returns Last sync date or null
   */
  getLastSyncDate(debateId: string): Date | null {
    return this.syncHistory.get(debateId) ?? null;
  }

  /**
   * Maps GitHub issue status to debate status
   * @param issueStatus - The GitHub issue status
   * @returns Corresponding debate status
   */
  mapStatusToDebateStatus(issueStatus: string): string {
    const normalizedStatus = issueStatus.toLowerCase().replace("_", "-");
    return this.statusMappings.get(normalizedStatus) ?? "pending";
  }

  /**
   * Gets sync statistics
   * @returns Object with sync stats
   */
  getSyncStats(): { totalSyncs: number; debatesTracked: number } {
    return {
      totalSyncs: this.syncHistory.size,
      debatesTracked: this.syncHistory.size,
    };
  }

  /**
   * Clears sync history for a specific debate
   * @param debateId - The debate ID
   */
  clearSyncHistory(debateId: string): void {
    this.syncHistory.delete(debateId);
  }
}

/**
 * Creates a default issue integrator with mock GitHub API
 * @returns Configured DebateIssueIntegrator instance
 */
export function createDefaultIssueIntegrator(): DebateIssueIntegrator {
  return new DebateIssueIntegrator();
}

/**
 * Creates a default sync manager with mock GitHub API
 * @returns Configured IssueSyncManager instance
 */
export function createDefaultSyncManager(): IssueSyncManager {
  return new IssueSyncManager();
}

// Example usage and testing
if (import.meta.url === `file://${process.argv[1]}`) {
  async function demonstrateIssueIntegration(): Promise<void> {
    console.log("=== Debate Issue Integration Demo ===\n");

    const integrator = createDefaultIssueIntegrator();
    const syncManager = createDefaultSyncManager();

    const sampleDebate: Debate = {
      id: "debate-001",
      title: "Architecture Decision: Microservices Migration",
      description:
        "Discussion about migrating from monolith to microservices architecture",
      participants: ["shepherd-1", "shepherd-2", "shepherd-3", "shepherd-4"],
      status: "active",
      outcomes: [
        "Implement API gateway pattern for service communication",
        "Research event-driven architecture options",
        "Create migration roadmap with phased approach",
      ],
      startTime: new Date("2025-01-15T10:00:00Z"),
    };

    console.log("1. Creating issues from debate...");
    const createdIssues = await integrator.createIssuesFromDebate(
      sampleDebate,
      "project-001",
    );
    console.log(`   Created ${createdIssues.length} issues:`);
    createdIssues.forEach((issue) => {
      console.log(`   - ${issue.title} (${issue.id})`);
    });

    console.log("\n2. Linking issues to debate...");
    createdIssues.forEach((issue, index) => {
      const linkType =
        index === 0 ? "implementation" : index === 1 ? "research" : "follow-up";
      const link = integrator.linkIssue(issue.id, sampleDebate.id, linkType);
      console.log(`   - Linked ${issue.id} as ${linkType}`);
    });

    console.log("\n3. Getting linked issues...");
    const linkedIssues = await integrator.getLinkedIssues(sampleDebate.id);
    console.log(`   Found ${linkedIssues.length} linked issues`);

    console.log("\n4. Simulating issue progress...");
    const mockApi = new MockGitHubApi();
    const syncManager2 = new IssueSyncManager(mockApi);

    const issuesWithProgress = await Promise.all(
      createdIssues.map(async (issue, index) => {
        const statuses = ["open", "in_progress", "closed"];
        const newStatus = statuses[index % 3];
        return mockApi.updateIssue(issue.id, { status: newStatus });
      }),
    );

    const { updatedDebate, progressPercentage } =
      await syncManager2.updateDebateFromIssues(
        sampleDebate,
        issuesWithProgress,
      );
    console.log(`   Progress: ${progressPercentage}%`);
    console.log(`   Updated debate status: ${updatedDebate.status}`);

    console.log("\n5. Configuring project settings...");
    integrator.configureProject({
      projectId: "project-002",
      baseUrl: "https://github.com/team/project",
      labels: ["enhancement", "discussed"],
      template: "## Summary\n## Action Items\n## Notes",
    });
    const projects = integrator.getConfiguredProjects();
    console.log(`   Configured ${projects.length} project(s)`);

    console.log("\n=== Demo Complete ===");
  }

  demonstrateIssueIntegration().catch(console.error);
}
