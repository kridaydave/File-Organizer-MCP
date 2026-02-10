/**
 * File Organizer MCP Server v3.2.0
 * Issue Integration Unit Tests
 */

import { describe, it, expect, beforeEach, beforeAll } from "@jest/globals";
import {
  DebateIssueIntegrator,
  IssueSyncManager,
  DebateIssueLink,
  CreatedIssue,
  IssueConfig,
  Debate,
  createDefaultIssueIntegrator,
  createDefaultSyncManager,
  MockGitHubApi,
} from "../issue-integration.js";

describe("DebateIssueIntegrator", () => {
  let integrator: DebateIssueIntegrator;

  beforeEach(() => {
    integrator = new DebateIssueIntegrator();
  });

  describe("createIssuesFromDebate", () => {
    it("should create issues from debate outcomes", async () => {
      const debate: Debate = {
        id: "debate-001",
        title: "Test Debate",
        description: "A test debate description",
        participants: ["s1", "s2"],
        status: "active",
        outcomes: ["Outcome 1", "Outcome 2"],
        startTime: new Date(),
      };

      const issues = await integrator.createIssuesFromDebate(
        debate,
        "project-001",
      );

      expect(issues).toHaveLength(2);
      expect(issues[0].title).toContain("Test Debate");
      expect(issues[0].linkedDebate).toBe("debate-001");
    });

    it("should create tracking issue for high-participation debates", async () => {
      const debate: Debate = {
        id: "debate-002",
        title: "Large Debate",
        description: "A debate with many participants",
        participants: Array.from({ length: 5 }, (_, i) => `s${i}`),
        status: "active",
        outcomes: ["Single outcome"],
        startTime: new Date(),
      };

      const issues = await integrator.createIssuesFromDebate(
        debate,
        "project-001",
      );

      expect(issues).toHaveLength(2);
      expect(issues[1].title).toContain("Tracking");
    });

    it("should not create tracking issue for small debates", async () => {
      const debate: Debate = {
        id: "debate-003",
        title: "Small Debate",
        description: "A small debate",
        participants: ["s1"],
        status: "active",
        outcomes: ["One outcome"],
        startTime: new Date(),
      };

      const issues = await integrator.createIssuesFromDebate(
        debate,
        "project-001",
      );

      expect(issues).toHaveLength(1);
      expect(issues[0].title).not.toContain("Tracking");
    });

    it("should handle empty outcomes", async () => {
      const debate: Debate = {
        id: "debate-004",
        title: "Empty Debate",
        description: "No outcomes yet",
        participants: ["s1"],
        status: "active",
        outcomes: [],
        startTime: new Date(),
      };

      const issues = await integrator.createIssuesFromDebate(
        debate,
        "project-001",
      );

      expect(issues).toHaveLength(0);
    });

    it("should apply labels to created issues", async () => {
      integrator.configureProject({
        projectId: "test-project",
        baseUrl: "https://github.com/test",
        labels: ["custom-label", "test-label"],
      });

      const debate: Debate = {
        id: "debate-005",
        title: "Label Test",
        description: "Testing labels",
        participants: ["s1"],
        status: "active",
        outcomes: ["Test outcome"],
        startTime: new Date(),
      };

      const issues = await integrator.createIssuesFromDebate(
        debate,
        "test-project",
      );

      expect(issues).toHaveLength(1);
    });
  });

  describe("linkIssue", () => {
    it("should create a valid link between issue and debate", () => {
      const link = integrator.linkIssue(
        "issue-123",
        "debate-456",
        "implementation",
      );

      expect(link.issueId).toBe("issue-123");
      expect(link.debateId).toBe("debate-456");
      expect(link.linkType).toBe("implementation");
      expect(link.status).toBe("open");
      expect(link.createdAt).toBeInstanceOf(Date);
    });

    it("should support all link types", () => {
      const linkTypes: DebateIssueLink["linkType"][] = [
        "implementation",
        "research",
        "follow-up",
      ];

      linkTypes.forEach((type) => {
        const link = integrator.linkIssue("issue-1", "debate-1", type);
        expect(link.linkType).toBe(type);
      });
    });

    it("should store multiple links for same debate", async () => {
      integrator.linkIssue("issue-1", "debate-multi", "implementation");
      integrator.linkIssue("issue-2", "debate-multi", "research");
      integrator.linkIssue("issue-3", "debate-multi", "follow-up");

      const links = await integrator.getLinkedIssues("debate-multi");
      expect(links).toHaveLength(3);
    });
  });

  describe("getLinkedIssues", () => {
    it("should return empty array for unlinked debate", async () => {
      const issues = await integrator.getLinkedIssues("unknown-debate");
      expect(issues).toHaveLength(0);
    });

    it("should return linked issues with their link metadata", async () => {
      const mockApi = new MockGitHubApi();
      const testIntegrator = new DebateIssueIntegrator(mockApi);

      const createdIssue = await mockApi.createIssue("Test Issue", "Body", []);
      testIntegrator.linkIssue(
        createdIssue.id,
        "debate-linked",
        "implementation",
      );

      const issues = await testIntegrator.getLinkedIssues("debate-linked");

      expect(issues).toHaveLength(1);
      expect(issues[0].issue?.id).toBe(createdIssue.id);
      expect(issues[0].link.issueId).toBe(createdIssue.id);
    });

    it("should handle multiple linked issues", async () => {
      const debateId = "debate-many";
      integrator.linkIssue("issue-1", debateId, "implementation");
      integrator.linkIssue("issue-2", debateId, "research");
      integrator.linkIssue("issue-3", debateId, "follow-up");

      const issues = await integrator.getLinkedIssues(debateId);

      expect(issues).toHaveLength(3);
    });
  });

  describe("configureProject", () => {
    it("should store project configuration", () => {
      const config: IssueConfig = {
        projectId: "config-test",
        baseUrl: "https://github.com/test",
        labels: ["label1", "label2"],
        template: "Test template",
      };

      integrator.configureProject(config);
      const projects = integrator.getConfiguredProjects();

      expect(projects).toHaveLength(1);
      expect(projects[0].projectId).toBe("config-test");
    });

    it("should support multiple project configurations", () => {
      integrator.configureProject({
        projectId: "p1",
        baseUrl: "url1",
        labels: ["l1"],
      });
      integrator.configureProject({
        projectId: "p2",
        baseUrl: "url2",
        labels: ["l2"],
      });
      integrator.configureProject({
        projectId: "p3",
        baseUrl: "url3",
        labels: ["l3"],
      });

      const projects = integrator.getConfiguredProjects();
      expect(projects).toHaveLength(3);
    });

    it("should allow updating existing configuration", () => {
      integrator.configureProject({
        projectId: "update-test",
        baseUrl: "url1",
        labels: ["l1"],
      });
      integrator.configureProject({
        projectId: "update-test",
        baseUrl: "url2",
        labels: ["l2"],
      });

      const projects = integrator.getConfiguredProjects();
      expect(projects).toHaveLength(1);
    });
  });
});

describe("IssueSyncManager", () => {
  let syncManager: IssueSyncManager;

  beforeEach(() => {
    syncManager = new IssueSyncManager();
  });

  describe("syncStatus", () => {
    it("should sync status for multiple issues", async () => {
      const mockApi = new MockGitHubApi();
      const manager = new IssueSyncManager(mockApi);

      const createdIssue = await mockApi.createIssue("Test", "Body", []);
      const issues = await manager.syncStatus([createdIssue.id], "debate-1");

      expect(issues.has(createdIssue.id)).toBe(true);
    });

    it("should handle empty issue list", async () => {
      const issues = await syncManager.syncStatus([], "debate-empty");
      expect(issues.size).toBe(0);
    });

    it("should record sync history", async () => {
      const mockApi = new MockGitHubApi();
      const manager = new IssueSyncManager(mockApi);

      const issue = await mockApi.createIssue("Test", "Body", []);
      await manager.syncStatus([issue.id], "debate-history");

      const lastSync = manager.getLastSyncDate("debate-history");
      expect(lastSync).not.toBeNull();
      expect(lastSync).toBeInstanceOf(Date);
    });

    it("should skip non-existent issues", async () => {
      const issues = await syncManager.syncStatus(
        ["non-existent-1", "non-existent-2"],
        "debate-1",
      );
      expect(issues.size).toBe(0);
    });
  });

  describe("updateDebateFromIssues", () => {
    it("should calculate correct progress percentage", async () => {
      const mockApi = new MockGitHubApi();
      const manager = new IssueSyncManager(mockApi);

      const debate: Debate = {
        id: "debate-progress",
        title: "Progress Test",
        description: "Testing progress",
        participants: ["s1"],
        status: "active",
        outcomes: [],
        startTime: new Date(),
      };

      const issues: CreatedIssue[] = [
        {
          id: "i1",
          title: "Issue 1",
          url: "url1",
          status: "closed",
          linkedDebate: "debate-progress",
        },
        {
          id: "i2",
          title: "Issue 2",
          url: "url2",
          status: "in_progress",
          linkedDebate: "debate-progress",
        },
        {
          id: "i3",
          title: "Issue 3",
          url: "url3",
          status: "open",
          linkedDebate: "debate-progress",
        },
      ];

      const result = await manager.updateDebateFromIssues(debate, issues);

      expect(result.progressPercentage).toBe(50);
    });

    it("should mark debate as concluded when all issues resolved", async () => {
      const mockApi = new MockGitHubApi();
      const manager = new IssueSyncManager(mockApi);

      const debate: Debate = {
        id: "debate-concluded",
        title: "Concluded Test",
        description: "Testing conclusion",
        participants: ["s1"],
        status: "active",
        outcomes: [],
        startTime: new Date(),
      };

      const issues: CreatedIssue[] = [
        {
          id: "i1",
          title: "Closed",
          url: "url1",
          status: "closed",
          linkedDebate: "debate-concluded",
        },
        {
          id: "i2",
          title: "Also Closed",
          url: "url2",
          status: "closed",
          linkedDebate: "debate-concluded",
        },
      ];

      const result = await manager.updateDebateFromIssues(debate, issues);

      expect(result.updatedDebate.status).toBe("concluded");
      expect(result.progressPercentage).toBe(100);
    });

    it("should handle empty issues list", async () => {
      const mockApi = new MockGitHubApi();
      const manager = new IssueSyncManager(mockApi);

      const debate: Debate = {
        id: "debate-empty",
        title: "Empty Issues",
        description: "No linked issues",
        participants: ["s1"],
        status: "active",
        outcomes: [],
        startTime: new Date(),
      };

      const result = await manager.updateDebateFromIssues(debate, []);

      expect(result.progressPercentage).toBe(0);
      expect(result.updatedDebate.status).toBe("active");
    });

    it("should set endTime when concluding debate", async () => {
      const mockApi = new MockGitHubApi();
      const manager = new IssueSyncManager(mockApi);

      const debate: Debate = {
        id: "debate-endtime",
        title: "End Time Test",
        description: "Testing end time",
        participants: ["s1"],
        status: "active",
        outcomes: [],
        startTime: new Date(),
        endTime: undefined,
      };

      const issues: CreatedIssue[] = [
        {
          id: "i1",
          title: "Done",
          url: "url1",
          status: "closed",
          linkedDebate: "debate-endtime",
        },
      ];

      const result = await manager.updateDebateFromIssues(debate, issues);

      expect(result.updatedDebate.endTime).toBeDefined();
    });
  });

  describe("mapStatusToDebateStatus", () => {
    it("should map open to pending", () => {
      expect(syncManager.mapStatusToDebateStatus("open")).toBe("pending");
    });

    it("should map in_progress to active", () => {
      expect(syncManager.mapStatusToDebateStatus("in_progress")).toBe("active");
    });

    it("should map closed to concluded", () => {
      expect(syncManager.mapStatusToDebateStatus("closed")).toBe("concluded");
    });

    it("should handle unknown statuses", () => {
      expect(syncManager.mapStatusToDebateStatus("unknown")).toBe("pending");
    });

    it("should handle hyphenated statuses", () => {
      expect(syncManager.mapStatusToDebateStatus("in-progress")).toBe("active");
    });
  });

  describe("getSyncStats", () => {
    it("should return zero for fresh instance", () => {
      const stats = syncManager.getSyncStats();
      expect(stats.totalSyncs).toBe(0);
      expect(stats.debatesTracked).toBe(0);
    });

    it("should track syncs after syncing", async () => {
      const mockApi = new MockGitHubApi();
      const manager = new IssueSyncManager(mockApi);

      const issue = await mockApi.createIssue("Test", "Body", []);
      await manager.syncStatus([issue.id], "debate-1");
      await manager.syncStatus([issue.id], "debate-2");

      const stats = manager.getSyncStats();
      expect(stats.totalSyncs).toBe(2);
      expect(stats.debatesTracked).toBe(2);
    });
  });

  describe("clearSyncHistory", () => {
    it("should clear sync history for specific debate", async () => {
      const mockApi = new MockGitHubApi();
      const manager = new IssueSyncManager(mockApi);

      const issue = await mockApi.createIssue("Test", "Body", []);
      await manager.syncStatus([issue.id], "debate-1");
      await manager.syncStatus([issue.id], "debate-2");

      manager.clearSyncHistory("debate-1");

      const stats = manager.getSyncStats();
      expect(stats.debatesTracked).toBe(1);
      expect(manager.getLastSyncDate("debate-1")).toBeNull();
    });
  });
});

describe("MockGitHubApi", () => {
  let api: MockGitHubApi;

  beforeEach(() => {
    api = new MockGitHubApi();
  });

  describe("createIssue", () => {
    it("should create issue with unique ID", async () => {
      const issue1 = await api.createIssue("Title 1", "Body 1", []);
      const issue2 = await api.createIssue("Title 2", "Body 2", []);

      expect(issue1.id).not.toBe(issue2.id);
    });

    it("should create issue with correct properties", async () => {
      const issue = await api.createIssue("Test Title", "Test Body", [
        "label1",
      ]);

      expect(issue.title).toBe("Test Title");
      expect(issue.status).toBe("open");
      expect(issue.linkedDebate).toBe("");
    });

    it("should generate URL for issue", async () => {
      const issue = await api.createIssue("URL Test", "Body", []);
      expect(issue.url).toContain("github.com");
      expect(issue.url).toContain(issue.id);
    });
  });

  describe("updateIssue", () => {
    it("should update issue properties", async () => {
      const created = await api.createIssue("Original", "Body", []);
      const updated = await api.updateIssue(created.id, { status: "closed" });

      expect(updated.status).toBe("closed");
    });

    it("should throw error for non-existent issue", async () => {
      await expect(
        api.updateIssue("non-existent", { status: "closed" }),
      ).rejects.toThrow();
    });
  });

  describe("getIssue", () => {
    it("should return created issue", async () => {
      const created = await api.createIssue("Get Test", "Body", []);
      const retrieved = await api.getIssue(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
    });

    it("should return null for non-existent issue", async () => {
      const retrieved = await api.getIssue("non-existent");
      expect(retrieved).toBeNull();
    });
  });

  describe("addLabels and removeLabels", () => {
    it("should add labels without error", async () => {
      const issue = await api.createIssue("Label Test", "Body", []);
      await api.addLabels(issue.id, ["new-label"]);
    });

    it("should remove labels without error", async () => {
      const issue = await api.createIssue("Remove Label Test", "Body", []);
      await api.removeLabels(issue.id, ["some-label"]);
    });
  });
});

describe("Factory Functions", () => {
  describe("createDefaultIssueIntegrator", () => {
    it("should create integrator instance", () => {
      const integrator = createDefaultIssueIntegrator();
      expect(integrator).toBeInstanceOf(DebateIssueIntegrator);
    });
  });

  describe("createDefaultSyncManager", () => {
    it("should create sync manager instance", () => {
      const manager = createDefaultSyncManager();
      expect(manager).toBeInstanceOf(IssueSyncManager);
    });
  });
});

describe("Edge Cases", () => {
  it("should handle very long debate titles", async () => {
    const integrator = new DebateIssueIntegrator();
    const debate: Debate = {
      id: "debate-long",
      title: "A".repeat(500),
      description: "Long title test",
      participants: ["s1"],
      status: "active",
      outcomes: ["Outcome"],
      startTime: new Date(),
    };

    const issues = await integrator.createIssuesFromDebate(debate, "project-1");
    expect(issues[0].title.length).toBeLessThan(500 + 50);
  });

  it("should handle debate with many outcomes", async () => {
    const integrator = new DebateIssueIntegrator();
    const debate: Debate = {
      id: "debate-many-outcomes",
      title: "Many Outcomes Test",
      description: "Testing many outcomes",
      participants: ["s1"],
      status: "active",
      outcomes: Array.from({ length: 20 }, (_, i) => `Outcome ${i + 1}`),
      startTime: new Date(),
    };

    const issues = await integrator.createIssuesFromDebate(debate, "project-1");
    expect(issues).toHaveLength(20);
  });

  it("should handle many participants", async () => {
    const integrator = new DebateIssueIntegrator();
    const debate: Debate = {
      id: "debate-lots-participants",
      title: "Lots of Participants",
      description: "Testing many participants",
      participants: Array.from({ length: 100 }, (_, i) => `s${i}`),
      status: "active",
      outcomes: ["One outcome"],
      startTime: new Date(),
    };

    const issues = await integrator.createIssuesFromDebate(debate, "project-1");
    expect(issues).toHaveLength(2);
  });
});
