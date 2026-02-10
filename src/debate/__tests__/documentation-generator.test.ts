/**
 * Jonnah Auto-Documentation Generator - Unit Tests
 */

import {
  DocumentationGenerator,
  MarkdownRenderer,
  OpenAPIRenderer,
  DebateDocumentation,
  DebateInput,
  DebateParticipant,
  Proposal,
  RawConcern,
  ParticipantVote,
  EnhancedVote,
  ShepherdSpecialty,
  ActionPriority,
} from "../documentation-generator.js";

describe("DocumentationGenerator", () => {
  let generator: DocumentationGenerator;

  beforeEach(() => {
    generator = new DocumentationGenerator();
  });

  describe("generate", () => {
    it("should generate complete documentation from debate input", () => {
      const debate = createMockDebate();
      const doc = generator.generate(debate);

      expect(doc).toBeDefined();
      expect(doc.title).toBe(debate.title);
      expect(doc.abstract).toContain(debate.title);
      expect(doc.participants).toHaveLength(2);
      expect(doc.keyDecisions).toHaveLength(1);
      expect(doc.concerns).toHaveLength(1);
      expect(doc.actionItems).toBeDefined();
      expect(doc.references).toBeDefined();
    });

    it("should extract participants with correct specialties", () => {
      const debate = createMockDebate();
      const doc = generator.generate(debate);

      expect(doc.participants[0].specialty).toBe("security");
      expect(doc.participants[1].specialty).toBe("performance");
    });

    it("should calculate final votes correctly", () => {
      const debate = createMockDebate();
      const doc = generator.generate(debate);

      expect(doc.participants[0].finalVote).toBeDefined();
      expect(doc.participants[0].finalVote.type).toBeDefined();
    });

    it("should compile design with components from decisions", () => {
      const debate = createMockDebate();
      debate.proposals[0].description = "Use [AuthService] with JWT tokens";

      const doc = generator.generate(debate);

      expect(doc.finalDesign.components.length).toBeGreaterThan(0);
    });

    it("should identify technologies from decisions", () => {
      const debate = createMockDebate();
      debate.proposals[0].description = "Use React with Node.js and PostgreSQL";

      const doc = generator.generate(debate);

      expect(doc.finalDesign.technologies).toContain("React");
      expect(doc.finalDesign.technologies).toContain("Node.js");
      expect(doc.finalDesign.technologies).toContain("PostgreSQL");
    });

    it("should generate action items for unresolved concerns", () => {
      const debate = createMockDebate();
      debate.concerns[0].severity = "critical";

      const doc = generator.generate(debate);

      expect(doc.actionItems.length).toBeGreaterThan(0);
      expect(doc.actionItems[0].priority).toBe("high");
    });

    it("should mark minor concerns as resolved", () => {
      const debate = createMockDebate();
      debate.concerns[0].severity = "minor";

      const doc = generator.generate(debate);

      expect(doc.concerns[0].resolved).toBe(true);
    });

    it("should identify open questions from conditional votes", () => {
      const debate = createMockDebate();
      debate.proposals[0].votes = [
        {
          type: "conditional",
          weight: 1,
          conditions: ["Add rate limiting"],
        },
      ];

      const doc = generator.generate(debate);

      expect(doc.openQuestions.some((q) => q.includes("rate limiting"))).toBe(
        true,
      );
    });
  });

  describe("summarizeDebate", () => {
    it("should generate abstract with correct participant count", () => {
      const debate = createMockDebate();
      const abstract = generator.summarizeDebate(debate);

      expect(abstract).toContain("2 participants");
      expect(abstract).toContain("security");
      expect(abstract).toContain("performance");
    });

    it("should include proposal and concern counts in abstract", () => {
      const debate = createMockDebate();
      const abstract = generator.summarizeDebate(debate);

      expect(abstract).toContain("1 proposals");
      expect(abstract).toContain("1 concerns");
    });
  });

  describe("extractDecisions", () => {
    it("should extract decisions with vote results", () => {
      const debate = createMockDebate();
      const decisions = generator.extractDecisions(debate);

      expect(decisions).toHaveLength(1);
      expect(decisions[0].description).toBe(debate.proposals[0].description);
      expect(decisions[0].proposer).toBe(debate.proposals[0].proposer);
    });

    it("should calculate correct weighted consensus for approved votes", () => {
      const debate = createMockDebate();
      const decisions = generator.extractDecisions(debate);

      expect(decisions[0].voteResult.passed).toBe(true);
      expect(decisions[0].voteResult.totalWeight).toBeGreaterThan(0);
    });

    it("should fail consensus when reject weight is too high", () => {
      const debate = createMockDebate();
      debate.proposals[0].votes = [
        { type: "approve", weight: 3 },
        { type: "reject", weight: 5 },
        { type: "abstain", weight: 2 },
      ];

      const decisions = generator.extractDecisions(debate);

      expect(decisions[0].voteResult.passed).toBe(false);
    });
  });

  describe("compileDesign", () => {
    it("should compile microservices architecture by default", () => {
      const debate = createMockDebate();
      const decisions = generator.extractDecisions(debate);
      const design = generator.compileDesign(debate, decisions);

      expect(design.architecture).toBe("microservices");
    });

    it("should infer data flow from decision keywords", () => {
      const debate = createMockDebate();
      debate.proposals[0].description =
        "Handle incoming request data through event stream";

      const decisions = generator.extractDecisions(debate);
      const design = generator.compileDesign(debate, decisions);

      expect(design.dataFlow.length).toBeGreaterThan(0);
    });

    it("should extract components from bracket notation", () => {
      const debate = createMockDebate();
      debate.proposals[0].description =
        "Use [AuthService] and [UserService] with <auth-api> interface";

      const decisions = generator.extractDecisions(debate);
      const design = generator.compileDesign(debate, decisions);

      expect(design.components.some((c) => c.name === "AuthService")).toBe(
        true,
      );
      expect(design.components.some((c) => c.name === "UserService")).toBe(
        true,
      );
      expect(design.interfaces).toContain("auth-api");
    });
  });

  describe("exportMarkdown", () => {
    it("should export valid Markdown format", () => {
      const debate = createMockDebate();
      const doc = generator.generate(debate);
      const markdown = generator.exportMarkdown(doc);

      expect(markdown).toContain("#");
      expect(markdown).toContain(doc.title);
      expect(markdown).toContain("## Participants");
      expect(markdown).toContain("## Key Decisions");
      expect(markdown).toContain("## Final Design");
    });

    it("should include table of contents", () => {
      const debate = createMockDebate();
      const doc = generator.generate(debate);
      const markdown = generator.exportMarkdown(doc);

      expect(markdown).toContain("## Table of Contents");
      expect(markdown).toContain("[Participants](#participants)");
    });

    it("should render decision status with emoji", () => {
      const debate = createMockDebate();
      const doc = generator.generate(debate);
      const markdown = generator.exportMarkdown(doc);

      expect(markdown).toContain("✅ Approved");
    });
  });

  describe("exportOpenAPI", () => {
    it("should export valid OpenAPI 3.0 spec", () => {
      const debate = createMockDebate();
      const doc = generator.generate(debate);
      const openapi = generator.exportOpenAPI(doc);

      const parsed = JSON.parse(openapi);

      expect(parsed.openapi).toBe("3.0.3");
      expect(parsed.info).toBeDefined();
      expect(parsed.info.title).toBe(doc.title);
    });

    it("should include servers configuration", () => {
      const debate = createMockDebate();
      const doc = generator.generate(debate);
      const openapi = generator.exportOpenAPI(doc);

      const parsed = JSON.parse(openapi);

      expect(parsed.servers).toBeDefined();
      expect(parsed.servers.length).toBe(2);
    });

    it("should create paths from design components", () => {
      const debate = createMockDebate();
      debate.proposals[0].description = "Use [AuthService] for authentication";

      const doc = generator.generate(debate);
      const openapi = generator.exportOpenAPI(doc);

      const parsed = JSON.parse(openapi);

      expect(parsed.paths["/authservice"]).toBeDefined();
    });

    it("should include schemas for documentation", () => {
      const debate = createMockDebate();
      const doc = generator.generate(debate);
      const openapi = generator.exportOpenAPI(doc);

      const parsed = JSON.parse(openapi);

      expect(parsed.components.schemas.Decision).toBeDefined();
      expect(parsed.components.schemas.ActionItem).toBeDefined();
      expect(parsed.components.schemas.EnhancedVote).toBeDefined();
    });

    it("should include security schemes", () => {
      const debate = createMockDebate();
      const doc = generator.generate(debate);
      const openapi = generator.exportOpenAPI(doc);

      const parsed = JSON.parse(openapi);

      expect(parsed.components.securitySchemes.bearerAuth).toBeDefined();
    });
  });
});

describe("MarkdownRenderer", () => {
  let renderer: MarkdownRenderer;

  beforeEach(() => {
    renderer = new MarkdownRenderer();
  });

  it("should render documentation to markdown string", () => {
    const doc = createMockDocumentation();
    const result = renderer.render(doc);

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("should replace template variables correctly", () => {
    const doc = createMockDocumentation();
    const result = renderer.render(doc);

    expect(result).toContain(doc.title);
    expect(result).toContain(doc.abstract);
    expect(result).not.toContain("{{title}}");
  });

  it("should format participants table", () => {
    const doc = createMockDocumentation();
    const result = renderer.render(doc);

    expect(result).toContain(
      "| ID | Specialty | Votes | Concerns | Agreements | Final Vote |",
    );
    expect(result).toContain(doc.participants[0].specialty);
  });

  it("should format decisions with vote percentages", () => {
    const doc = createMockDocumentation();
    const result = renderer.render(doc);

    expect(result).toContain("Vote Result:");
    expect(result).toContain("Approve:");
    expect(result).toContain("Reject:");
    expect(result).toContain("%");
  });

  it("should format concerns with severity indicators", () => {
    const doc = createMockDocumentation();
    const result = renderer.render(doc);

    expect(result).toContain("SECURITY");
    expect(result).toContain("critical");
    expect(result).toContain("Resolved:");
  });

  it("should format design components and technologies", () => {
    const doc = createMockDocumentation();
    const result = renderer.render(doc);

    expect(result).toContain("Architecture Type:");
    expect(result).toContain("Components:");
    expect(result).toContain("Technologies:");
  });

  it("should format action items with priorities", () => {
    const doc = createMockDocumentation();
    const result = renderer.render(doc);

    expect(result).toContain("[HIGH]");
    expect(result).toContain("Linked Decision:");
  });

  it("should format references as links", () => {
    const doc = createMockDocumentation();
    const result = renderer.render(doc);

    expect(result).toContain("[");
    expect(result).toContain("]");
    expect(result).toContain("jwt.io");
  });

  it("should include generation timestamp", () => {
    const doc = createMockDocumentation();
    const result = renderer.render(doc);

    expect(result).toContain("Generated on:");
    expect(result).toContain(new Date().toISOString().split("T")[0]);
  });
});

describe("OpenAPIRenderer", () => {
  let renderer: OpenAPIRenderer;

  beforeEach(() => {
    renderer = new OpenAPIRenderer();
  });

  it("should render documentation to JSON string", () => {
    const doc = createMockDocumentation();
    const result = renderer.render(doc);

    expect(typeof result).toBe("string");
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("should generate valid OpenAPI 3.0.3 spec", () => {
    const doc = createMockDocumentation();
    const result = renderer.render(doc);
    const parsed = JSON.parse(result);

    expect(parsed.openapi).toBe("3.0.3");
    expect(parsed.info).toBeDefined();
    expect(parsed.paths).toBeDefined();
    expect(parsed.components).toBeDefined();
  });

  it("should create tags from components", () => {
    const doc = createMockDocumentation();
    const result = renderer.render(doc);
    const parsed = JSON.parse(result);

    expect(parsed.tags).toBeDefined();
    expect(parsed.tags.length).toBeGreaterThan(0);
  });

  it("should create GET and POST endpoints for components", () => {
    const doc = createMockDocumentation();
    const result = renderer.render(doc);
    const parsed = JSON.parse(result);

    const componentPath = Object.keys(parsed.paths)[0];
    if (componentPath) {
      expect(parsed.paths[componentPath].get).toBeDefined();
      expect(parsed.paths[componentPath].post).toBeDefined();
    }
  });

  it("should include weighted consensus schema", () => {
    const doc = createMockDocumentation();
    const result = renderer.render(doc);
    const parsed = JSON.parse(result);

    expect(parsed.components.schemas.WeightedConsensus).toBeDefined();
    expect(
      parsed.components.schemas.WeightedConsensus.properties.passed,
    ).toBeDefined();
  });

  it("should include participant summary schema", () => {
    const doc = createMockDocumentation();
    const result = renderer.render(doc);
    const parsed = JSON.parse(result);

    expect(parsed.components.schemas.ParticipantSummary).toBeDefined();
  });
});

describe("Type Safety", () => {
  it("should enforce ShepherdSpecialty type", () => {
    const specialty: ShepherdSpecialty = "security";
    expect(specialty).toBe("security");
  });

  it("should enforce ActionPriority type", () => {
    const priority: ActionPriority = "high";
    expect(priority).toBe("high");
  });

  it("should enforce EnhancedVote structure", () => {
    const vote: EnhancedVote = {
      type: "approve",
      weight: 1,
      reason: "Looks good",
      conditions: ["condition1"],
    };

    expect(vote.type).toBe("approve");
    expect(vote.weight).toBe(1);
    expect(vote.conditions).toContain("condition1");
  });
});

describe("Edge Cases", () => {
  let generator: DocumentationGenerator;

  beforeEach(() => {
    generator = new DocumentationGenerator();
  });

  it("should handle empty debate with no participants", () => {
    const emptyDebate: DebateInput = {
      id: "test-id",
      title: "Empty Debate",
      description: "A debate with no participants",
      participants: [],
      proposals: [],
      concerns: [],
      timestamp: new Date(),
    };

    const doc = generator.generate(emptyDebate);

    expect(doc.participants).toHaveLength(0);
    expect(doc.keyDecisions).toHaveLength(0);
  });

  it("should handle debate with only rejections", () => {
    const debate = createMockDebate();
    debate.proposals[0].votes = [
      { type: "reject", weight: 5 },
      { type: "reject", weight: 5 },
    ];

    const doc = generator.generate(debate);

    expect(doc.keyDecisions[0].voteResult.passed).toBe(false);
  });

  it("should handle multiple conditional votes", () => {
    const debate = createMockDebate();
    debate.proposals[0].votes = [
      { type: "conditional", weight: 1, conditions: ["A", "B", "C"] },
      { type: "conditional", weight: 1, conditions: ["D", "E"] },
    ];

    const doc = generator.generate(debate);

    expect(doc.openQuestions.length).toBe(6);
  });

  it("should deduplicate open questions", () => {
    const debate = createMockDebate();
    debate.proposals[0].votes = [
      { type: "conditional", weight: 1, conditions: ["Same condition"] },
      { type: "conditional", weight: 1, conditions: ["Same condition"] },
    ];

    const doc = generator.generate(debate);

    const sameQuestions = doc.openQuestions.filter(
      (q) => q === "Condition from participant: Same condition",
    );
    expect(sameQuestions.length).toBe(1);
  });

  it("should handle design with no technologies detected", () => {
    const debate = createMockDebate();
    debate.proposals[0].description = "Make it work somehow";

    const doc = generator.generate(debate);

    expect(doc.finalDesign.technologies).toHaveLength(0);
  });

  it("should handle design with no components detected", () => {
    const debate = createMockDebate();
    debate.proposals[0].description = "Just write the code";

    const doc = generator.generate(debate);

    expect(doc.finalDesign.components).toHaveLength(0);
  });
});

function createMockDebate(): DebateInput {
  const participants: DebateParticipant[] = [
    {
      id: "shepherd-1",
      name: "Alice",
      specialty: "security",
      votes: [
        {
          proposalId: "prop-1",
          vote: { type: "approve", weight: 2, reason: "Looks secure" },
        },
      ],
      concerns: ["Need SSL"],
    },
    {
      id: "shepherd-2",
      name: "Bob",
      specialty: "performance",
      votes: [
        {
          proposalId: "prop-1",
          vote: { type: "approve", weight: 1, reason: "Good enough" },
        },
      ],
      concerns: [],
    },
  ];

  const proposals: Proposal[] = [
    {
      id: "prop-1",
      title: "Use REST API",
      description: "Implement [AuthService] using REST with JWT tokens",
      proposer: "Alice",
      votes: [
        { type: "approve", weight: 2 },
        { type: "approve", weight: 1 },
      ],
    },
  ];

  const concerns: RawConcern[] = [
    {
      id: "concern-1",
      author: "Alice",
      category: "security",
      description: "Need to add rate limiting",
      severity: "major",
    },
  ];

  return {
    id: "debate-1",
    title: "API Authentication Design",
    description: "Decide on authentication approach",
    participants,
    proposals,
    concerns,
    timestamp: new Date(),
  };
}

function createMockDocumentation(): DebateDocumentation {
  return {
    title: "API Authentication Design",
    abstract:
      "This document captures architectural decisions for API authentication.",
    participants: [
      {
        shepherdId: "shepherd-1",
        specialty: "security",
        voteCount: 2,
        concernsRaised: 1,
        agreementsMade: 2,
        finalVote: { type: "approve", weight: 2 },
      },
    ],
    keyDecisions: [
      {
        id: "decision-1",
        description: "Use JWT for authentication",
        proposer: "Alice",
        voteResult: {
          approveWeight: 3,
          rejectWeight: 0,
          abstainWeight: 1,
          totalWeight: 4,
          threshold: 2.8,
          passed: true,
        },
        timestamp: new Date(),
      },
    ],
    concerns: [
      {
        id: "concern-1",
        category: "security",
        description: "Rate limiting needed",
        severity: "critical",
        raisedBy: "Bob",
        resolved: false,
      },
    ],
    finalDesign: {
      architecture: "microservices",
      components: [
        {
          name: "AuthService",
          type: "service",
          description: "Handles authentication",
          interfaces: ["login", "verify"],
          dependencies: ["UserService"],
        },
      ],
      dataFlow: ["Client → API Gateway → AuthService"],
      interfaces: ["login", "verify"],
      technologies: ["Node.js", "JWT"],
      constraints: ["Must support OAuth2"],
    },
    openQuestions: ["How to handle token refresh?"],
    actionItems: [
      {
        id: "action-1",
        description: "Implement rate limiting",
        assignee: "Alice",
        priority: "high",
        linkedDecision: "decision-1",
      },
    ],
    references: [
      {
        id: "ref-1",
        title: "JWT Specification",
        url: "https://jwt.io",
        type: "specification",
        description: "JWT RFC 7519",
      },
    ],
  };
}
