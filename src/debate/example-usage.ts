/**
 * Jonnah Auto-Documentation Generator - Example Usage
 */

import {
  DocumentationGenerator,
  DebateInput,
  DebateParticipant,
  Proposal,
  RawConcern,
} from "./documentation-generator.js";

function demonstrateDocumentationGeneration(): void {
  console.log("=== Jonnah Auto-Documentation Generator ===\n");

  const generator = new DocumentationGenerator();

  const participants: DebateParticipant[] = [
    {
      id: "shepherd-security-1",
      name: "Dr. Sarah Chen",
      specialty: "security",
      votes: [
        {
          proposalId: "proposal-1",
          vote: {
            type: "approve",
            weight: 3,
            reason: "Meets all security requirements",
          },
        },
        {
          proposalId: "proposal-2",
          vote: {
            type: "conditional",
            weight: 2,
            conditions: ["Add rate limiting", "Implement audit logging"],
          },
        },
      ],
      concerns: ["Need encryption at rest", "Must support 2FA"],
    },
    {
      id: "shepherd-performance-1",
      name: "Marcus Johnson",
      specialty: "performance",
      votes: [
        {
          proposalId: "proposal-1",
          vote: {
            type: "approve",
            weight: 2,
            reason: "Performance characteristics are acceptable",
          },
        },
      ],
      concerns: ["Response time requirements not specified"],
    },
    {
      id: "shepherd-scalability-1",
      name: "Elena Rodriguez",
      specialty: "scalability",
      votes: [
        {
          proposalId: "proposal-1",
          vote: { type: "approve", weight: 2 },
        },
      ],
      concerns: [],
    },
    {
      id: "shepherd-usability-1",
      name: "James Wilson",
      specialty: "usability",
      votes: [
        {
          proposalId: "proposal-1",
          vote: {
            type: "reject",
            weight: 1,
            reason: "API documentation is insufficient",
          },
        },
      ],
      concerns: ["Need comprehensive API docs", "DX could be improved"],
    },
  ];

  const proposals: Proposal[] = [
    {
      id: "proposal-1",
      title: "Microservices Architecture with API Gateway",
      description:
        "Implement [AuthService] and [UserService] using Node.js with Express, " +
        "PostgreSQL for persistence, and Redis for caching. " +
        "Expose <auth-api> and <user-api> interfaces. " +
        "Use Docker containers orchestrated with Kubernetes. " +
        "All services must implement health checks and metrics endpoint.",
      proposer: "Dr. Sarah Chen",
      votes: [
        { type: "approve", weight: 3 },
        { type: "approve", weight: 2 },
        { type: "approve", weight: 2 },
        { type: "reject", weight: 1 },
      ],
    },
    {
      id: "proposal-2",
      title: "Add Rate Limiting to AuthService",
      description:
        "Implement TODO: Add rate limiting to prevent brute force attacks",
      proposer: "Marcus Johnson",
      votes: [
        {
          type: "conditional",
          weight: 2,
          conditions: ["Add rate limiting", "Implement audit logging"],
        },
      ],
    },
  ];

  const concerns: RawConcern[] = [
    {
      id: "concern-1",
      author: "James Wilson",
      category: "usability",
      description: "API documentation is insufficient",
      severity: "minor",
    },
    {
      id: "concern-2",
      author: "Dr. Sarah Chen",
      category: "security",
      description: "Need encryption at rest for user data",
      severity: "critical",
    },
    {
      id: "concern-3",
      author: "Marcus Johnson",
      category: "performance",
      description: "Response time requirements not specified in SLA",
      severity: "major",
    },
  ];

  const debate: DebateInput = {
    id: "debate-2024-001",
    title: "Authentication Service Architecture Design",
    description:
      "Architectural debate to determine the authentication service implementation approach, " +
      "including technology stack, security requirements, and scalability considerations.",
    participants,
    proposals,
    concerns,
    timestamp: new Date("2024-01-15T10:00:00Z"),
  };

  console.log("1. Generating Documentation...\n");
  const documentation = generator.generate(debate);

  console.log("Title:", documentation.title);
  console.log("Abstract:", documentation.abstract.substring(0, 100) + "...");
  console.log("Participants:", documentation.participants.length);
  console.log("Key Decisions:", documentation.keyDecisions.length);
  console.log("Concerns:", documentation.concerns.length);
  console.log(
    "Design Components:",
    documentation.finalDesign.components.length,
  );
  console.log(
    "Technologies:",
    documentation.finalDesign.technologies.join(", "),
  );
  console.log("Action Items:", documentation.actionItems.length);
  console.log();

  console.log("2. Exporting as Markdown...\n");
  const markdown = generator.exportMarkdown(documentation);

  console.log("Markdown output (first 500 chars):");
  console.log(markdown.substring(0, 500));
  console.log("...\n");

  console.log("3. Exporting as OpenAPI Specification...\n");
  const openapi = generator.exportOpenAPI(documentation);
  const openapiObj = JSON.parse(openapi);

  console.log("OpenAPI Version:", openapiObj.openapi);
  console.log("Info Title:", openapiObj.info.title);
  console.log("Servers:", openapiObj.servers.length);
  console.log("Paths:", Object.keys(openapiObj.paths).length);
  console.log("Schemas:", Object.keys(openapiObj.components.schemas).length);
  console.log();

  console.log("4. Key Decisions Summary...\n");
  for (const decision of documentation.keyDecisions) {
    console.log(`Decision: ${decision.id.substring(0, 8)}`);
    console.log(`  Proposer: ${decision.proposer}`);
    console.log(`  Passed: ${decision.voteResult.passed}`);
    console.log(
      `  Approval: ${((decision.voteResult.approveWeight / decision.voteResult.totalWeight) * 100).toFixed(1)}%`,
    );
    console.log();
  }

  console.log("5. Design Components...\n");
  for (const component of documentation.finalDesign.components) {
    console.log(`- ${component.name} (${component.type})`);
    console.log(`  Description: ${component.description}`);
    console.log(`  Interfaces: ${component.interfaces.join(", ")}`);
    console.log();
  }

  console.log("6. Action Items...\n");
  for (const action of documentation.actionItems) {
    console.log(`[${action.priority.toUpperCase()}] ${action.description}`);
    console.log(`  Assignee: ${action.assignee ?? "Unassigned"}`);
    console.log();
  }

  console.log("7. Open Questions...\n");
  for (const question of documentation.openQuestions) {
    console.log(`? ${question}`);
    console.log();
  }

  console.log("=== Example Complete ===");
}

function demonstrateVoteCalculation(): void {
  console.log("\n=== Weighted Consensus Demo ===\n");

  const generator = new DocumentationGenerator();

  const votes = [
    { type: "approve" as const, weight: 5 },
    { type: "approve" as const, weight: 4 },
    { type: "reject" as const, weight: 2 },
    { type: "abstain" as const, weight: 1 },
  ];

  const debate: DebateInput = {
    id: "test",
    title: "Test",
    description: "Test",
    participants: [],
    proposals: [
      {
        id: "test",
        title: "Test",
        description: "Test",
        proposer: "Test",
        votes,
      },
    ],
    concerns: [],
    timestamp: new Date(),
  };

  const decisions = generator.extractDecisions(debate);
  const decision = decisions[0];

  if (decision) {
    console.log("Vote Breakdown:");
    console.log(`  Total Weight: ${decision.voteResult.totalWeight}`);
    console.log(`  Approve Weight: ${decision.voteResult.approveWeight}`);
    console.log(`  Reject Weight: ${decision.voteResult.rejectWeight}`);
    console.log(`  Abstain Weight: ${decision.voteResult.abstainWeight}`);
    console.log(`  Threshold (70%): ${decision.voteResult.threshold}`);
    console.log(
      `  Result: ${decision.voteResult.passed ? "APPROVED" : "REJECTED"}`,
    );
  }
}

function demonstrateTechnologyExtraction(): void {
  console.log("\n=== Technology Extraction Demo ===\n");

  const generator = new DocumentationGenerator();

  const debate: DebateInput = {
    id: "test",
    title: "Tech Stack Debate",
    description: "Selecting technologies",
    participants: [
      {
        id: "p1",
        name: "Dev1",
        specialty: "maintainability",
        votes: [],
        concerns: [],
      },
    ],
    proposals: [
      {
        id: "p1",
        title: "Full Stack",
        description:
          "Use React for frontend, Node.js with Express for backend, " +
          "PostgreSQL database, MongoDB for logs, Redis for caching, " +
          "Kafka for events, Docker for containers, Kubernetes for orchestration. " +
          "Deploy to AWS with Terraform.",
        proposer: "Dev1",
        votes: [{ type: "approve", weight: 1 }],
      },
    ],
    concerns: [],
    timestamp: new Date(),
  };

  const documentation = generator.generate(debate);

  console.log("Detected Technologies:");
  for (const tech of documentation.finalDesign.technologies) {
    console.log(`  - ${tech}`);
  }
}

demonstrateDocumentationGeneration();
demonstrateVoteCalculation();
demonstrateTechnologyExtraction();
