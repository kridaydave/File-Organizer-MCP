/**
 * Unit Tests for Debate Dashboard
 */

import {
  shepherdId,
  proposalId,
  PhaseType,
  ActivityMetrics,
  ProposalMetrics,
  Conflict,
  WeightedConsensus,
  DebateDashboard,
  DashboardRenderer,
  WebDashboardServer,
  DashboardBuilder,
  getRealTimeUpdate,
} from "../dashboard.js";

describe("DebateDashboard Interfaces", () => {
  describe("ActivityMetrics", () => {
    it("should create valid activity metrics", () => {
      const metrics: ActivityMetrics = {
        messagesCount: 10,
        votesCast: 5,
        concernsRaised: 2,
        agreementsMade: 3,
        lastActive: new Date(),
      };

      expect(metrics.messagesCount).toBe(10);
      expect(metrics.votesCast).toBe(5);
      expect(metrics.concernsRaised).toBe(2);
      expect(metrics.agreementsMade).toBe(3);
      expect(metrics.lastActive).toBeInstanceOf(Date);
    });

    it("should handle zero activity", () => {
      const metrics: ActivityMetrics = {
        messagesCount: 0,
        votesCast: 0,
        concernsRaised: 0,
        agreementsMade: 0,
        lastActive: new Date(),
      };

      expect(metrics.messagesCount).toBe(0);
    });

    it("should handle high activity values", () => {
      const metrics: ActivityMetrics = {
        messagesCount: 999,
        votesCast: 500,
        concernsRaised: 100,
        agreementsMade: 200,
        lastActive: new Date(),
      };

      expect(metrics.messagesCount).toBe(999);
      expect(metrics.votesCast).toBe(500);
    });
  });

  describe("ProposalMetrics", () => {
    it("should create valid proposal metrics", () => {
      const metrics: ProposalMetrics = {
        supportCount: 8,
        objectionCount: 2,
        avgConfidence: 0.85,
        concerns: ["performance", "security"],
        status: "approved",
      };

      expect(metrics.supportCount).toBe(8);
      expect(metrics.objectionCount).toBe(2);
      expect(metrics.avgConfidence).toBe(0.85);
      expect(metrics.concerns).toHaveLength(2);
      expect(metrics.status).toBe("approved");
    });

    it("should handle pending status", () => {
      const metrics: ProposalMetrics = {
        supportCount: 3,
        objectionCount: 3,
        avgConfidence: 0.5,
        concerns: [],
        status: "pending",
      };

      expect(metrics.status).toBe("pending");
      expect(metrics.concerns).toHaveLength(0);
    });

    it("should handle rejected status", () => {
      const metrics: ProposalMetrics = {
        supportCount: 1,
        objectionCount: 7,
        avgConfidence: 0.3,
        concerns: ["too risky"],
        status: "rejected",
      };

      expect(metrics.status).toBe("rejected");
      expect(metrics.supportCount).toBeLessThan(metrics.objectionCount);
    });
  });

  describe("WeightedConsensus", () => {
    it("should create valid consensus metrics", () => {
      const consensus: WeightedConsensus = {
        agreementIndex: 0.75,
        confidenceIndex: 0.82,
        concernDensity: 1.5,
        participationRate: 0.9,
      };

      expect(consensus.agreementIndex).toBe(0.75);
      expect(consensus.confidenceIndex).toBe(0.82);
      expect(consensus.concernDensity).toBe(1.5);
      expect(consensus.participationRate).toBe(0.9);
    });

    it("should handle zero values", () => {
      const consensus: WeightedConsensus = {
        agreementIndex: 0,
        confidenceIndex: 0,
        concernDensity: 0,
        participationRate: 0,
      };

      expect(consensus.agreementIndex).toBe(0);
    });

    it("should handle full agreement", () => {
      const consensus: WeightedConsensus = {
        agreementIndex: 1.0,
        confidenceIndex: 1.0,
        concernDensity: 0,
        participationRate: 1.0,
      };

      expect(consensus.agreementIndex).toBe(1.0);
    });
  });

  describe("DebateDashboard", () => {
    it("should create complete dashboard state", () => {
      const participantActivity = new Map<string, ActivityMetrics>();
      participantActivity.set("alice", {
        messagesCount: 10,
        votesCast: 5,
        concernsRaised: 2,
        agreementsMade: 3,
        lastActive: new Date(),
      });

      const proposalStatus = new Map<string, ProposalMetrics>();
      proposalStatus.set("prop-1", {
        supportCount: 8,
        objectionCount: 2,
        avgConfidence: 0.85,
        concerns: [],
        status: "approved",
      });

      const conflictQueue: Conflict[] = [
        {
          id: "conf-1",
          type: "SecurityVsPerformance",
          description: "Encryption overhead",
          priority: 8,
          timestamp: new Date(),
          participants: ["alice", "bob"],
        },
      ];

      const dashboard: DebateDashboard = {
        currentPhase: "deliberation",
        phaseProgress: 65,
        participantActivity,
        proposalStatus,
        conflictQueue,
        consensusMetrics: {
          agreementIndex: 0.75,
          confidenceIndex: 0.82,
          concernDensity: 1.2,
          participationRate: 0.85,
        },
        timeRemaining: 300,
      };

      expect(dashboard.currentPhase).toBe("deliberation");
      expect(dashboard.phaseProgress).toBe(65);
      expect(dashboard.participantActivity.size).toBe(1);
      expect(dashboard.proposalStatus.size).toBe(1);
      expect(dashboard.conflictQueue).toHaveLength(1);
      expect(dashboard.timeRemaining).toBe(300);
    });

    it("should handle all phase types", () => {
      const phases: PhaseType[] = [
        "initialization",
        "presentation",
        "deliberation",
        "voting",
        "resolution",
        "completed",
      ];

      phases.forEach((phase) => {
        const dashboard: DebateDashboard = {
          currentPhase: phase,
          phaseProgress: 50,
          participantActivity: new Map(),
          proposalStatus: new Map(),
          conflictQueue: [],
          consensusMetrics: {
            agreementIndex: 0,
            confidenceIndex: 0,
            concernDensity: 0,
            participationRate: 0,
          },
          timeRemaining: 0,
        };

        expect(dashboard.currentPhase).toBe(phase);
      });
    });
  });
});

describe("DashboardRenderer", () => {
  let renderer: DashboardRenderer;
  let testDashboard: DebateDashboard;

  beforeEach(() => {
    renderer = new DashboardRenderer();

    const participantActivity = new Map<string, ActivityMetrics>();
    participantActivity.set("alice", {
      messagesCount: 15,
      votesCast: 8,
      concernsRaised: 3,
      agreementsMade: 5,
      lastActive: new Date(),
    });
    participantActivity.set("bob", {
      messagesCount: 5,
      votesCast: 2,
      concernsRaised: 1,
      agreementsMade: 1,
      lastActive: new Date(),
    });

    const proposalStatus = new Map<string, ProposalMetrics>();
    proposalStatus.set("prop-1", {
      supportCount: 8,
      objectionCount: 2,
      avgConfidence: 0.85,
      concerns: [],
      status: "approved",
    });
    proposalStatus.set("prop-2", {
      supportCount: 3,
      objectionCount: 3,
      avgConfidence: 0.5,
      concerns: ["needs review"],
      status: "pending",
    });

    testDashboard = {
      currentPhase: "deliberation",
      phaseProgress: 65,
      participantActivity,
      proposalStatus,
      conflictQueue: [
        {
          id: "conf-1",
          type: "SecurityVsPerformance",
          description: "Encryption overhead",
          priority: 8,
          timestamp: new Date(),
          participants: ["alice", "bob"],
        },
      ],
      consensusMetrics: {
        agreementIndex: 0.75,
        confidenceIndex: 0.82,
        concernDensity: 1.2,
        participationRate: 0.85,
      },
      timeRemaining: 300,
    };
  });

  describe("renderToConsole", () => {
    it("should render console output with phase information", () => {
      const output = renderer.renderToConsole(testDashboard);

      expect(output).toContain("Deliberation");
      expect(output).toContain("REAL-TIME DEBATE DASHBOARD");
    });

    it("should include progress bar", () => {
      const output = renderer.renderToConsole(testDashboard);

      expect(output).toContain("█");
      expect(output).toContain("░");
      expect(output).toContain("65%");
    });

    it("should include participant activity", () => {
      const output = renderer.renderToConsole(testDashboard);

      expect(output).toContain("alice");
      expect(output).toContain("bob");
      expect(output).toContain("msgs");
      expect(output).toContain("votes");
    });

    it("should include proposal information", () => {
      const output = renderer.renderToConsole(testDashboard);

      expect(output).toContain("prop-1");
      expect(output).toContain("prop-2");
      expect(output).toContain("✓");
      expect(output).toContain("○");
    });

    it("should include consensus metrics", () => {
      const output = renderer.renderToConsole(testDashboard);

      expect(output).toContain("Agreement");
      expect(output).toContain("Confidence");
      expect(output).toContain("Participation");
    });

    it("should include conflict queue", () => {
      const output = renderer.renderToConsole(testDashboard);

      expect(output).toContain("Conflict Queue");
      expect(output).toContain("Encryption overhead");
    });

    it("should handle empty participant list", () => {
      const emptyDashboard: DebateDashboard = {
        ...testDashboard,
        participantActivity: new Map(),
      };

      const output = renderer.renderToConsole(emptyDashboard);

      expect(output).toContain("Participant Activity (0)");
    });

    it("should handle empty proposal list", () => {
      const emptyDashboard: DebateDashboard = {
        ...testDashboard,
        proposalStatus: new Map(),
        conflictQueue: [],
      };

      const output = renderer.renderToConsole(emptyDashboard);

      expect(output).toContain("Proposals (0)");
      expect(output).not.toContain("Conflict Queue");
    });

    it("should handle completed phase with green coloring", () => {
      const completedDashboard: DebateDashboard = {
        ...testDashboard,
        currentPhase: "completed",
      };

      const output = renderer.renderToConsole(completedDashboard);

      expect(output).toContain("Completed");
    });
  });

  describe("renderToJSON", () => {
    it("should produce valid JSON-serializable output", () => {
      const json = renderer.renderToJSON(testDashboard);

      expect(json).toHaveProperty("phase", "deliberation");
      expect(json).toHaveProperty("progress", 65);
      expect(json).toHaveProperty("timeRemaining", 300);
      expect(json).toHaveProperty("consensus");
      expect(json).toHaveProperty("participants");
      expect(json).toHaveProperty("proposals");
      expect(json).toHaveProperty("conflicts", 1);
    });

    it("should round progress to 2 decimal places", () => {
      const json = renderer.renderToJSON(testDashboard);

      expect(typeof (json as { progress: number }).progress).toBe("number");
    });

    it("should include timestamp for real-time updates", () => {
      const json = renderer.renderToJSON(testDashboard);

      expect(json).toHaveProperty("timestamp");
      expect(typeof (json as { timestamp: number }).timestamp).toBe("number");
    });
  });

  describe("renderToHTML", () => {
    it("should produce valid HTML document", () => {
      const html = renderer.renderHTML(testDashboard);

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("</html>");
      expect(html).toContain("Real-Time Debate Dashboard");
    });

    it("should include phase badge with correct class", () => {
      const html = renderer.renderHTML(testDashboard);

      expect(html).toContain("phase-deliberation");
      expect(html).toContain("deliberation");
    });

    it("should include progress bar with correct width", () => {
      const html = renderer.renderHTML(testDashboard);

      expect(html).toContain("width: 65%");
    });

    it("should include all participant cards", () => {
      const html = renderer.renderHTML(testDashboard);

      expect(html).toContain("alice");
      expect(html).toContain("bob");
    });

    it("should include proposal cards with status", () => {
      const html = renderer.renderHTML(testDashboard);

      expect(html).toContain("APPROVED");
      expect(html).toContain("PENDING");
    });

    it("should include conflict queue when present", () => {
      const html = renderer.renderHTML(testDashboard);

      expect(html).toContain("Conflict Queue");
      expect(html).toContain("Encryption overhead");
    });

    it("should exclude conflict section when empty", () => {
      const emptyDashboard: DebateDashboard = {
        ...testDashboard,
        conflictQueue: [],
      };

      const html = renderer.renderHTML(emptyDashboard);

      expect(html).not.toContain("Conflict Queue");
    });

    it("should include embedded JSON data", () => {
      const html = renderer.renderHTML(testDashboard);

      expect(html).toContain('id="dashboard-data"');
      expect(html).toContain("application/json");
    });
  });
});

describe("DashboardBuilder", () => {
  let builder: DashboardBuilder;

  beforeEach(() => {
    builder = new DashboardBuilder();
  });

  it("should build dashboard from debate with votes", () => {
    const mockDebate = {
      getPhase: () => "voting" as PhaseType,
      getPhaseProgress: () => 80,
      getTimeRemaining: () => 120,
      getParticipants: () => [
        { id: shepherdId("alice") },
        { id: shepherdId("bob") },
        { id: shepherdId("charlie") },
      ],
      getProposals: () => [
        { id: proposalId("prop-1") },
        { id: proposalId("prop-2") },
      ],
      getConflicts: () => [],
      getVotes: () => [
        {
          participantId: shepherdId("alice"),
          proposalId: proposalId("prop-1"),
          approval: 0.8,
          confidence: 0.9,
          concerns: [],
        },
        {
          participantId: shepherdId("bob"),
          proposalId: proposalId("prop-1"),
          approval: 0.6,
          confidence: 0.7,
          concerns: ["needs testing"],
        },
        {
          participantId: shepherdId("charlie"),
          proposalId: proposalId("prop-1"),
          approval: 0.9,
          confidence: 0.8,
          concerns: [],
        },
        {
          participantId: shepherdId("alice"),
          proposalId: proposalId("prop-2"),
          approval: 0.4,
          confidence: 0.6,
          concerns: ["security risk"],
        },
      ],
    };

    const dashboard = builder.buildDashboard(
      mockDebate as unknown as import("../dashboard.js").Debate,
    );

    expect(dashboard.currentPhase).toBe("voting");
    expect(dashboard.phaseProgress).toBe(80);
    expect(dashboard.participantActivity.size).toBe(3);
    expect(dashboard.proposalStatus.size).toBe(2);
  });

  it("should handle debate with no votes", () => {
    const mockDebate = {
      getPhase: () => "initialization" as PhaseType,
      getPhaseProgress: () => 10,
      getTimeRemaining: () => 600,
      getParticipants: () => [{ id: shepherdId("alice") }],
      getProposals: () => [{ id: proposalId("prop-1") }],
      getConflicts: () => [],
      getVotes: () => [],
    };

    const dashboard = builder.buildDashboard(
      mockDebate as unknown as import("../dashboard.js").Debate,
    );

    expect(dashboard.currentPhase).toBe("initialization");
    expect(dashboard.consensusMetrics.agreementIndex).toBe(0);
    expect(dashboard.consensusMetrics.confidenceIndex).toBe(0);
  });

  it("should include conflicts in dashboard", () => {
    const conflicts = [
      {
        id: "conf-1",
        type: "ArchitectureVsTesting",
        description: "Design complexity",
        priority: 6,
        timestamp: new Date(),
        participants: [shepherdId("alice")],
      },
    ];

    const mockDebate = {
      getPhase: () => "deliberation" as PhaseType,
      getPhaseProgress: () => 50,
      getTimeRemaining: () => 200,
      getParticipants: () => [{ id: shepherdId("alice") }],
      getProposals: () => [],
      getConflicts: () => conflicts,
      getVotes: () => [],
    };

    const dashboard = builder.buildDashboard(
      mockDebate as unknown as import("../dashboard.js").Debate,
    );

    expect(dashboard.conflictQueue).toHaveLength(1);
    expect(dashboard.conflictQueue[0].description).toBe("Design complexity");
  });
});

describe("getRealTimeUpdate", () => {
  it("should return a function that generates dashboard state", () => {
    const mockDebate = {
      getPhase: () => "presentation" as PhaseType,
      getPhaseProgress: () => 25,
      getTimeRemaining: () => 500,
      getParticipants: () => [{ id: shepherdId("test") }],
      getProposals: () => [],
      getConflicts: () => [],
      getVotes: () => [],
    };

    const getUpdate = getRealTimeUpdate(
      mockDebate as unknown as import("../dashboard.js").Debate,
    );
    const dashboard = getUpdate();

    expect(dashboard.currentPhase).toBe("presentation");
    expect(dashboard.phaseProgress).toBe(25);
  });

  it("should return consistent state for same debate", () => {
    const mockDebate = {
      getPhase: () => "voting" as PhaseType,
      getPhaseProgress: () => 90,
      getTimeRemaining: () => 60,
      getParticipants: () => [{ id: shepherdId("a") }, { id: shepherdId("b") }],
      getProposals: () => [{ id: proposalId("p1") }],
      getConflicts: () => [],
      getVotes: () => [
        {
          participantId: shepherdId("a"),
          proposalId: proposalId("p1"),
          approval: 0.8,
          confidence: 0.9,
          concerns: [],
        },
      ],
    };

    const getUpdate = getRealTimeUpdate(
      mockDebate as unknown as import("../dashboard.js").Debate,
    );

    const dashboard1 = getUpdate();
    const dashboard2 = getUpdate();

    expect(dashboard1.currentPhase).toBe(dashboard2.currentPhase);
    expect(dashboard1.phaseProgress).toBe(dashboard2.phaseProgress);
  });
});

describe("ID Helper Functions", () => {
  describe("shepherdId", () => {
    it("should create valid shepherd ID", () => {
      const id = shepherdId("alice");

      expect(id).toBe("alice");
    });

    it("should maintain type safety", () => {
      const id = shepherdId("test-shepherd");

      expect(typeof id).toBe("string");
    });
  });

  describe("proposalId", () => {
    it("should create valid proposal ID", () => {
      const id = proposalId("prop-123");

      expect(id).toBe("prop-123");
    });

    it("should maintain type safety", () => {
      const id = proposalId("my-proposal");

      expect(typeof id).toBe("string");
    });
  });
});

describe("WebDashboardServer", () => {
  let server: WebDashboardServer;

  beforeEach(() => {
    server = new WebDashboardServer({ port: 9999 });
  });

  afterEach(async () => {
    await server.stop();
  });

  describe("constructor", () => {
    it("should create server with default port", () => {
      const defaultServer = new WebDashboardServer();

      expect(defaultServer.getPort()).toBe(3001);
    });

    it("should create server with custom port", () => {
      expect(server.getPort()).toBe(9999);
    });

    it("should start with zero clients", () => {
      expect(server.getClientCount()).toBe(0);
    });
  });

  describe("start", () => {
    it("should start server successfully", async () => {
      await expect(server.start()).resolves.not.toThrow();
    });
  });

  describe("stop", () => {
    it("should stop server without error", async () => {
      await server.start();
      await expect(server.stop()).resolves.not.toThrow();
    });

    it("should reset client count after stop", async () => {
      await server.start();
      await server.stop();

      expect(server.getClientCount()).toBe(0);
    });
  });
});

describe("Edge Cases", () => {
  let renderer: DashboardRenderer;

  beforeEach(() => {
    renderer = new DashboardRenderer();
  });

  it("should handle 100% progress", () => {
    const dashboard: DebateDashboard = {
      currentPhase: "completed",
      phaseProgress: 100,
      participantActivity: new Map(),
      proposalStatus: new Map(),
      conflictQueue: [],
      consensusMetrics: {
        agreementIndex: 1.0,
        confidenceIndex: 1.0,
        concernDensity: 0,
        participationRate: 1.0,
      },
      timeRemaining: 0,
    };

    const output = renderer.renderToConsole(dashboard);

    expect(output).toContain("100%");
    expect(output).toContain("Completed");
  });

  it("should handle 0% progress", () => {
    const dashboard: DebateDashboard = {
      currentPhase: "initialization",
      phaseProgress: 0,
      participantActivity: new Map(),
      proposalStatus: new Map(),
      conflictQueue: [],
      consensusMetrics: {
        agreementIndex: 0,
        confidenceIndex: 0,
        concernDensity: 0,
        participationRate: 0,
      },
      timeRemaining: 0,
    };

    const output = renderer.renderToConsole(dashboard);

    expect(output).toContain("0%");
  });

  it("should handle maximum time remaining", () => {
    const dashboard: DebateDashboard = {
      currentPhase: "initialization",
      phaseProgress: 0,
      participantActivity: new Map(),
      proposalStatus: new Map(),
      conflictQueue: [],
      consensusMetrics: {
        agreementIndex: 0,
        confidenceIndex: 0,
        concernDensity: 0,
        participationRate: 0,
      },
      timeRemaining: 86400,
    };

    const output = renderer.renderToConsole(dashboard);

    expect(output).toContain("24h");
  });

  it("should handle many participants efficiently", () => {
    const participantActivity = new Map<string, ActivityMetrics>();
    for (let i = 0; i < 100; i++) {
      participantActivity.set(`shepherd-${i}`, {
        messagesCount: i * 2,
        votesCast: i,
        concernsRaised: Math.floor(i / 2),
        agreementsMade: Math.floor(i / 3),
        lastActive: new Date(),
      });
    }

    const dashboard: DebateDashboard = {
      currentPhase: "voting",
      phaseProgress: 50,
      participantActivity,
      proposalStatus: new Map(),
      conflictQueue: [],
      consensusMetrics: {
        agreementIndex: 0.5,
        confidenceIndex: 0.5,
        concernDensity: 1,
        participationRate: 0.5,
      },
      timeRemaining: 100,
    };

    const output = renderer.renderToConsole(dashboard);

    expect(output).toContain("Participant Activity (100)");
    expect(output).toContain("shepherd-99");
  });

  it("should handle proposals with many concerns", () => {
    const proposalStatus = new Map<string, ProposalMetrics>();
    proposalStatus.set("prop-1", {
      supportCount: 5,
      objectionCount: 3,
      avgConfidence: 0.7,
      concerns: [
        "concern-1",
        "concern-2",
        "concern-3",
        "concern-4",
        "concern-5",
      ],
      status: "pending",
    });

    const dashboard: DebateDashboard = {
      currentPhase: "deliberation",
      phaseProgress: 60,
      participantActivity: new Map(),
      proposalStatus,
      conflictQueue: [],
      consensusMetrics: {
        agreementIndex: 0.5,
        confidenceIndex: 0.7,
        concernDensity: 2,
        participationRate: 0.6,
      },
      timeRemaining: 200,
    };

    const output = renderer.renderToConsole(dashboard);

    expect(output).toContain("concern-1");
    expect(output).toContain("concern-5");
  });

  it("should handle maximum priority conflicts", () => {
    const conflictQueue: Conflict[] = [
      {
        id: "conf-critical",
        type: "SecurityVsPerformance",
        description: "Critical security vulnerability",
        priority: 10,
        timestamp: new Date(),
        participants: ["sec-1", "sec-2", "arch-1"],
      },
    ];

    const dashboard: DebateDashboard = {
      currentPhase: "resolution",
      phaseProgress: 90,
      participantActivity: new Map(),
      proposalStatus: new Map(),
      conflictQueue,
      consensusMetrics: {
        agreementIndex: 0.3,
        confidenceIndex: 0.9,
        concernDensity: 3,
        participationRate: 1.0,
      },
      timeRemaining: 30,
    };

    const output = renderer.renderToConsole(dashboard);

    expect(output).toContain("🔴");
    expect(output).toContain("Critical security vulnerability");
  });
});
