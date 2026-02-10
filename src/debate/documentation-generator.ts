/**
 * Jonnah Auto-Documentation Generator
 * Generates comprehensive documentation from architectural debates
 */

import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";

/** Default output directory for debate documentation */
const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), "docs", "debate_doc");

/** Sanitize filename by removing illegal characters */
function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .substring(0, 100);
}

/**
 * Shepherd specialty types representing different expertise domains
 */
export type ShepherdSpecialty =
  | "security"
  | "performance"
  | "scalability"
  | "usability"
  | "maintainability"
  | "cost"
  | "reliability"
  | "compliance";

const SHEPHERD_SPECIALTIES: readonly ShepherdSpecialty[] = [
  "security",
  "performance",
  "scalability",
  "usability",
  "maintainability",
  "cost",
  "reliability",
  "compliance",
];

/**
 * Vote type for participant voting
 */
export type VoteType = "approve" | "reject" | "abstain" | "conditional";

/**
 * Priority levels for action items
 */
export type ActionPriority = "high" | "medium" | "low";

/**
 * Represents a participant's weighted vote in the debate
 */
export interface EnhancedVote {
  type: VoteType;
  weight: number;
  reason?: string;
  conditions?: string[];
}

/**
 * Weighted consensus result from a vote
 */
export interface WeightedConsensus {
  approveWeight: number;
  rejectWeight: number;
  abstainWeight: number;
  totalWeight: number;
  threshold: number;
  passed: boolean;
}

/**
 * Summary of concerns raised during debate
 */
export interface ConcernSummary {
  id: string;
  category: ShepherdSpecialty;
  description: string;
  severity: "critical" | "major" | "minor" | "cosmetic";
  raisedBy: string;
  resolved: boolean;
  resolution?: string;
}

/**
 * Technical specification component in the final design
 */
export interface DesignComponent {
  name: string;
  type: string;
  description: string;
  interfaces: string[];
  dependencies: string[];
}

/**
 * Complete design specification
 */
export interface DesignSpec {
  architecture: string;
  components: DesignComponent[];
  dataFlow: string[];
  interfaces: string[];
  technologies: string[];
  constraints: string[];
}

/**
 * Reference to external documentation or resources
 */
export interface Reference {
  id: string;
  title: string;
  url?: string;
  type: "documentation" | "article" | "specification" | "example";
  description?: string;
}

/**
 * Summary of a participant's involvement in the debate
 */
export interface ParticipantSummary {
  shepherdId: string;
  specialty: ShepherdSpecialty;
  voteCount: number;
  concernsRaised: number;
  agreementsMade: number;
  finalVote: EnhancedVote;
}

/**
 * Key decision made during the debate
 */
export interface Decision {
  id: string;
  description: string;
  proposer: string;
  voteResult: WeightedConsensus;
  timestamp: Date;
}

/**
 * Action item resulting from a decision
 */
export interface ActionItem {
  id: string;
  description: string;
  assignee?: string;
  priority: ActionPriority;
  linkedDecision: string;
}

/**
 * Complete debate documentation structure
 */
export interface DebateDocumentation {
  title: string;
  abstract: string;
  participants: ParticipantSummary[];
  keyDecisions: Decision[];
  concerns: ConcernSummary[];
  finalDesign: DesignSpec;
  openQuestions: string[];
  actionItems: ActionItem[];
  references: Reference[];
}

/**
 * Input debate structure for documentation generation
 */
export interface DebateInput {
  id: string;
  title: string;
  description: string;
  participants: DebateParticipant[];
  proposals: Proposal[];
  concerns: RawConcern[];
  timestamp: Date;
}

/**
 * Individual participant in a debate
 */
export interface DebateParticipant {
  id: string;
  name: string;
  specialty: ShepherdSpecialty;
  votes: ParticipantVote[];
  concerns: string[];
}

/**
 * Individual vote from a participant
 */
export interface ParticipantVote {
  proposalId: string;
  vote: EnhancedVote;
}

/**
 * Proposal submitted during debate
 */
export interface Proposal {
  id: string;
  title: string;
  description: string;
  proposer: string;
  votes: EnhancedVote[];
}

/**
 * Raw concern before processing
 */
export interface RawConcern {
  id: string;
  author: string;
  category: ShepherdSpecialty;
  description: string;
  severity: "critical" | "major" | "minor" | "cosmetic";
}

/**
 * Template variables for documentation generation
 */
interface TemplateVariables {
  title: string;
  abstract: string;
  participantsTable: string;
  decisionsList: string;
  concernsSection: string;
  designSection: string;
  dataFlowSection: string;
  actionItemsList: string;
  openQuestionsList: string;
  referencesList: string;
  timestamp: string;
}

/**
 * Renderer interface for documentation output formats
 */
export interface DocumentationRenderer {
  render(doc: DebateDocumentation): string;
}

/**
 * Documentation Generator - Creates comprehensive documentation from debate data
 */
export class DocumentationGenerator {
  private markdownRenderer: MarkdownRenderer;
  private openAPIRenderer: OpenAPIRenderer;

  constructor() {
    this.markdownRenderer = new MarkdownRenderer();
    this.openAPIRenderer = new OpenAPIRenderer();
  }

  /**
   * Generate complete documentation from a debate
   * @param debate - The input debate data
   * @returns Complete DebateDocumentation object
   * @example
   * ```ts
   * const doc = generator.generate(debate);
   * console.log(doc.title);
   * ```
   */
  generate(debate: DebateInput): DebateDocumentation {
    const abstract = this.summarizeDebate(debate);
    const participants = this.processParticipants(debate.participants);
    const decisions = this.extractDecisions(debate);
    const concerns = this.processConcerns(debate.concerns);
    const design = this.compileDesign(debate, decisions);
    const actionItems = this.generateActionItems(decisions, concerns);
    const openQuestions = this.identifyOpenQuestions(debate, concerns);
    const references = this.compileReferences(debate);

    return {
      title: debate.title,
      abstract,
      participants,
      keyDecisions: decisions,
      concerns,
      finalDesign: design,
      openQuestions,
      actionItems,
      references,
    };
  }

  /**
   * Export documentation as Markdown format
   * @param doc - The documentation to export
   * @returns Markdown string representation
   */
  exportMarkdown(doc: DebateDocumentation): string {
    return this.markdownRenderer.render(doc);
  }

  /**
   * Export documentation as Markdown and save to file
   * @param doc - The documentation to export
   * @param filename - Optional filename (defaults to sanitized title)
   * @param outputDir - Optional output directory (defaults to docs/debate_doc)
   * @returns Path to the saved file
   */
  async saveMarkdown(
    doc: DebateDocumentation,
    filename?: string,
    outputDir: string = DEFAULT_OUTPUT_DIR,
  ): Promise<string> {
    const content = this.markdownRenderer.render(doc);
    return this.saveFile(content, filename || doc.title, "md", outputDir);
  }

  /**
   * Export documentation as OpenAPI and save to file
   * @param doc - The documentation to export
   * @param filename - Optional filename (defaults to sanitized title)
   * @param outputDir - Optional output directory (defaults to docs/debate_doc)
   * @returns Path to the saved file
   */
  async saveOpenAPI(
    doc: DebateDocumentation,
    filename?: string,
    outputDir: string = DEFAULT_OUTPUT_DIR,
  ): Promise<string> {
    const content = this.openAPIRenderer.render(doc);
    return this.saveFile(
      content,
      filename || doc.title,
      "openapi.yaml",
      outputDir,
    );
  }

  /**
   * Generate and save complete documentation package
   * @param debate - The input debate data
   * @param filename - Optional filename (defaults to sanitized title)
   * @param outputDir - Optional output directory (defaults to docs/debate_doc)
   * @returns Object containing paths to all generated files
   */
  async generateAndSave(
    debate: DebateInput,
    filename?: string,
    outputDir: string = DEFAULT_OUTPUT_DIR,
  ): Promise<{ markdown: string; openapi: string; doc: DebateDocumentation }> {
    const doc = this.generate(debate);
    const sanitizedName = filename || debate.title;

    const [markdownPath, openapiPath] = await Promise.all([
      this.saveMarkdown(doc, sanitizedName, outputDir),
      this.saveOpenAPI(doc, sanitizedName, outputDir),
    ]);

    return {
      markdown: markdownPath,
      openapi: openapiPath,
      doc,
    };
  }

  /**
   * Get the default output directory
   * @returns Default output directory path
   */
  getOutputDirectory(): string {
    return DEFAULT_OUTPUT_DIR;
  }

  /**
   * Export documentation as OpenAPI specification
   * @param doc - The documentation to export
   * @returns OpenAPI specification string
   */
  exportOpenAPI(doc: DebateDocumentation): string {
    return this.openAPIRenderer.render(doc);
  }

  /**
   * Save content to a file in the specified directory
   * @param content - File content
   * @param filename - Filename (without extension)
   * @param extension - File extension
   * @param outputDir - Output directory
   * @returns Path to the saved file
   */
  private async saveFile(
    content: string,
    filename: string,
    extension: string,
    outputDir: string,
  ): Promise<string> {
    const sanitizedName = sanitizeFilename(filename);
    const fullFilename = `${sanitizedName}.${extension}`;
    const filePath = path.join(outputDir, fullFilename);

    await fs.promises.mkdir(outputDir, { recursive: true });
    await fs.promises.writeFile(filePath, content, "utf-8");

    return filePath;
  }

  /**
   * Generate an abstract summarizing the debate
   * @param debate - The input debate
   * @returns Abstract string
   */
  summarizeDebate(debate: DebateInput): string {
    const participantCount = debate.participants.length;
    const proposalCount = debate.proposals.length;
    const concernCount = debate.concerns.length;

    const specialties = new Set(debate.participants.map((p) => p.specialty));
    const specialtyList = Array.from(specialties).join(", ");

    return (
      `This document captures the architectural decisions from the debate "${debate.title}". ` +
      `The debate involved ${participantCount} participants representing ${specialtyList} specialties, ` +
      `resulting in ${proposalCount} proposals and ${concernCount} concerns being addressed. ` +
      `${debate.description}`
    );
  }

  /**
   * Extract key decisions from debate proposals
   * @param debate - The input debate
   * @returns Array of decisions
   */
  extractDecisions(debate: DebateInput): Decision[] {
    return debate.proposals.map((proposal) => {
      const voteResult = this.calculateWeightedConsensus(proposal.votes);

      return {
        id: randomUUID(),
        description: proposal.description,
        proposer: proposal.proposer,
        voteResult,
        timestamp: debate.timestamp,
      };
    });
  }

  /**
   * Compile final design specification from decisions
   * @param debate - The input debate
   * @param decisions - Extracted decisions
   * @returns Design specification
   */
  compileDesign(debate: DebateInput, decisions: Decision[]): DesignSpec {
    const approvedDecisions = decisions.filter((d) => d.voteResult.passed);
    const componentNames = new Set<string>();
    const technologies = new Set<string>();
    const interfaces = new Set<string>();
    const constraints = new Set<string>();

    for (const decision of approvedDecisions) {
      const words = decision.description.split(/\s+/);
      for (const word of words) {
        if (word.startsWith("[") && word.endsWith("]")) {
          componentNames.add(word.slice(1, -1));
        }
        if (word.startsWith("<") && word.endsWith(">")) {
          interfaces.add(word.slice(1, -1));
        }
      }

      const techMatch = decision.description.match(
        /\b(?:React|Node\.js|PostgreSQL|Docker|Kubernetes|AWS|Azure|GCP|REST|GraphQL|gRPC|MongoDB|Redis|Cassandra|Kafka|RabbitMQ)\b/gi,
      );
      if (techMatch) {
        techMatch.forEach((t) => technologies.add(t));
      }

      if (
        decision.description.toLowerCase().includes("must") ||
        decision.description.toLowerCase().includes("required")
      ) {
        constraints.add(decision.description);
      }
    }

    const components: DesignComponent[] = Array.from(componentNames).map(
      (name) => ({
        name,
        type: "service",
        description: `Component ${name} from approved decisions`,
        interfaces: Array.from(interfaces).filter((i) =>
          i.toLowerCase().includes(name.toLowerCase()),
        ),
        dependencies: [],
      }),
    );

    return {
      architecture: "microservices",
      components,
      dataFlow: this.inferDataFlow(decisions),
      interfaces: Array.from(interfaces),
      technologies: Array.from(technologies),
      constraints: Array.from(constraints),
    };
  }

  private processParticipants(
    participants: DebateParticipant[],
  ): ParticipantSummary[] {
    return participants.map((p) => {
      const lastVote = p.votes[p.votes.length - 1];

      return {
        shepherdId: p.id,
        specialty: p.specialty,
        voteCount: p.votes.length,
        concernsRaised: p.concerns.length,
        agreementsMade: p.votes.filter((v) => v.vote.type === "approve").length,
        finalVote: lastVote?.vote ?? { type: "abstain", weight: 0 },
      };
    });
  }

  private processConcerns(concerns: RawConcern[]): ConcernSummary[] {
    return concerns.map((c) => ({
      id: c.id,
      category: c.category,
      description: c.description,
      severity: c.severity,
      raisedBy: c.author,
      resolved: c.severity !== "critical" && c.severity !== "major",
      resolution:
        c.severity !== "critical" && c.severity !== "major"
          ? "Addressed through proposal modifications"
          : undefined,
    }));
  }

  private calculateWeightedConsensus(votes: EnhancedVote[]): WeightedConsensus {
    const totalWeight = votes.reduce((sum, v) => sum + v.weight, 0);
    const approveWeight = votes
      .filter((v) => v.type === "approve")
      .reduce((sum, v) => sum + v.weight, 0);
    const rejectWeight = votes
      .filter((v) => v.type === "reject")
      .reduce((sum, v) => sum + v.weight, 0);
    const abstainWeight = votes
      .filter((v) => v.type === "abstain")
      .reduce((sum, v) => sum + v.weight, 0);

    const threshold = totalWeight * 0.7;
    const passed =
      approveWeight >= threshold && rejectWeight < totalWeight * 0.3;

    return {
      approveWeight,
      rejectWeight,
      abstainWeight,
      totalWeight,
      threshold,
      passed,
    };
  }

  private generateActionItems(
    decisions: Decision[],
    concerns: ConcernSummary[],
  ): ActionItem[] {
    const actionItems: ActionItem[] = [];

    for (const concern of concerns) {
      if (!concern.resolved) {
        actionItems.push({
          id: randomUUID(),
          description: `Address ${concern.severity} concern: ${concern.description}`,
          assignee: concern.raisedBy,
          priority:
            concern.severity === "critical"
              ? "high"
              : concern.severity === "major"
                ? "medium"
                : "low",
          linkedDecision: decisions[0]?.id ?? "",
        });
      }
    }

    for (const decision of decisions) {
      if (decision.voteResult.passed && decision.description.includes("TODO")) {
        actionItems.push({
          id: randomUUID(),
          description: decision.description,
          priority: "medium",
          linkedDecision: decision.id,
        });
      }
    }

    return actionItems;
  }

  private identifyOpenQuestions(
    debate: DebateInput,
    concerns: ConcernSummary[],
  ): string[] {
    const questions: string[] = [];

    const unresolvedConcerns = concerns.filter((c) => !c.resolved);
    for (const concern of unresolvedConcerns) {
      questions.push(
        `How should we address the ${concern.severity} concern about ${concern.description}?`,
      );
    }

    for (const proposal of debate.proposals) {
      for (const vote of proposal.votes) {
        if (vote.type === "conditional" && vote.conditions) {
          for (const condition of vote.conditions) {
            questions.push(`Condition from participant: ${condition}`);
          }
        }
      }
    }

    return Array.from(new Set(questions));
  }

  private compileReferences(debate: DebateInput): Reference[] {
    const references: Reference[] = [];

    for (const proposal of debate.proposals) {
      references.push({
        id: randomUUID(),
        title: `Proposal: ${proposal.title}`,
        type: "specification",
        description: proposal.description,
      });
    }

    for (const participant of debate.participants) {
      for (const concern of participant.concerns) {
        references.push({
          id: randomUUID(),
          title: `Concern by ${participant.name}`,
          type: "article",
          description: concern,
        });
      }
    }

    return references;
  }

  private inferDataFlow(decisions: Decision[]): string[] {
    const flows: string[] = [];
    const approvedDecisions = decisions.filter((d) => d.voteResult.passed);

    for (const decision of approvedDecisions) {
      if (decision.description.toLowerCase().includes("request")) {
        flows.push("Client → API Gateway → Service");
      }
      if (decision.description.toLowerCase().includes("data")) {
        flows.push("Service → Database → Cache");
      }
      if (decision.description.toLowerCase().includes("event")) {
        flows.push("Service → Message Queue → Consumer");
      }
    }

    return Array.from(new Set(flows));
  }
}

/**
 * Markdown Renderer - Converts documentation to Markdown format
 */
export class MarkdownRenderer implements DocumentationRenderer {
  private readonly markdownTemplate = `
# {{title}}

{{abstract}}

---

## Table of Contents
1. [Participants](#participants)
2. [Key Decisions](#key-decisions)
3. [Concerns](#concerns)
4. [Final Design](#final-design)
5. [Action Items](#action-items)
6. [Open Questions](#open-questions)
7. [References](#references)

## Participants

| ID | Specialty | Votes | Concerns | Agreements | Final Vote |
|----|-----------|-------|----------|------------|------------|
{{participantsTable}}

## Key Decisions

{{decisionsList}}

## Concerns

{{concernsSection}}

## Final Design

### Architecture
{{designSection}}

### Data Flow
{{dataFlowSection}}

## Action Items

{{actionItemsList}}

## Open Questions

{{openQuestionsList}}

## References

{{referencesList}}

---

*Generated on: {{timestamp}}*
`;

  /**
   * Render documentation as Markdown
   * @param doc - The documentation to render
   * @returns Markdown string
   */
  render(doc: DebateDocumentation): string {
    const vars = this.buildTemplateVariables(doc);
    return this.applyTemplate(this.markdownTemplate, vars);
  }

  private buildTemplateVariables(doc: DebateDocumentation): TemplateVariables {
    const participantsTable = doc.participants
      .map(
        (p) =>
          `| ${p.shepherdId} | ${p.specialty} | ${p.voteCount} | ${p.concernsRaised} | ${p.agreementsMade} | ${p.finalVote.type} (${p.finalVote.weight}) |`,
      )
      .join("\n");

    const decisionsList = doc.keyDecisions
      .map(
        (d) => `
### Decision: ${d.id.substring(0, 8)}

**Description:** ${d.description}

**Proposer:** ${d.proposer}

**Vote Result:**
- Approve: ${d.voteResult.approveWeight} (${((d.voteResult.approveWeight / d.voteResult.totalWeight) * 100).toFixed(1)}%)
- Reject: ${d.voteResult.rejectWeight} (${((d.voteResult.rejectWeight / d.voteResult.totalWeight) * 100).toFixed(1)}%)
- Abstain: ${d.voteResult.abstainWeight} (${((d.voteResult.abstainWeight / d.voteResult.totalWeight) * 100).toFixed(1)}%)

**Status:** ${d.voteResult.passed ? "✅ Approved" : "❌ Rejected"}

**Timestamp:** ${d.timestamp.toISOString()}
`,
      )
      .join("\n");

    const concernsSection = doc.concerns
      .map(
        (c) => `
#### ${c.resolved ? "✅" : "⚠️"} ${c.category.toUpperCase()} - ${c.severity}

${c.description}

- **Raised by:** ${c.raisedBy}
- **Resolved:** ${c.resolved ? "Yes" : "No"}
${c.resolution ? `- **Resolution:** ${c.resolution}` : ""}
`,
      )
      .join("\n");

    const designSection = `
**Architecture Type:** ${doc.finalDesign.architecture}

**Components:**
${doc.finalDesign.components.map((c) => `- ${c.name} (${c.type}): ${c.description}`).join("\n")}

**Technologies:**
${doc.finalDesign.technologies.map((t) => `- ${t}`).join("\n")}
`;

    const dataFlowSection = doc.finalDesign.dataFlow
      .map((flow) => `- \`${flow}\``)
      .join("\n");

    const actionItemsList = doc.actionItems
      .map(
        (a) => `
- **[${a.priority.toUpperCase()}]** ${a.description}
  - ID: \`${a.id}\`
  ${a.assignee ? `- Assignee: ${a.assignee}` : ""}
  - Linked Decision: \`${a.linkedDecision}\`
`,
      )
      .join("\n");

    const openQuestionsList = doc.openQuestions.map((q) => `- ${q}`).join("\n");

    const referencesList = doc.references
      .map(
        (r) =>
          `- [${r.title}](${r.url ?? "#"}) - ${r.type}${r.description ? `: ${r.description}` : ""}`,
      )
      .join("\n");

    return {
      title: doc.title,
      abstract: doc.abstract,
      participantsTable,
      decisionsList,
      concernsSection,
      designSection,
      dataFlowSection,
      actionItemsList,
      openQuestionsList,
      referencesList,
      timestamp: new Date().toISOString(),
    };
  }

  private applyTemplate(template: string, vars: TemplateVariables): string {
    let result = template;

    for (const [key, value] of Object.entries(vars)) {
      const placeholder = `{{${key}}}`;
      result = result.replace(new RegExp(placeholder, "g"), value.trim());
    }

    return result.trim();
  }
}

/**
 * OpenAPI Renderer - Converts documentation to OpenAPI specification format
 */
export class OpenAPIRenderer implements DocumentationRenderer {
  /**
   * Render documentation as OpenAPI specification
   * @param doc - The documentation to render
   * @returns OpenAPI specification JSON string
   */
  render(doc: DebateDocumentation): string {
    const spec = this.buildOpenAPISpec(doc);
    return JSON.stringify(spec, null, 2);
  }

  private buildOpenAPISpec(doc: DebateDocumentation): object {
    const approvedDecisions = doc.keyDecisions.filter(
      (d) => d.voteResult.passed,
    );

    const paths: Record<string, object> = {};
    const schemas: Record<string, object> = {};

    for (const component of doc.finalDesign.components) {
      const componentName = component.name.replace(/\s+/g, "");

      paths[`/${component.name.toLowerCase()}`] = {
        get: {
          summary: `Get ${component.name}`,
          description: component.description,
          responses: {
            "200": {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    $ref: `#/components/schemas/${componentName}Response`,
                  },
                },
              },
            },
          },
        },
        post: {
          summary: `Create ${component.name}`,
          description: `Create a new ${component.name}`,
          responses: {
            "201": {
              description: "Created",
            },
          },
        },
      };

      schemas[`${componentName}Response`] = {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          type: { type: "string", enum: [component.type] },
          description: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      };

      schemas[`${componentName}Request`] = {
        type: "object",
        required: ["name"],
        properties: {
          name: {
            type: "string",
            description: `Name of the ${component.name}`,
          },
          description: { type: "string" },
        },
      };
    }

    for (const decision of approvedDecisions) {
      if (decision.description.toLowerCase().includes("endpoint")) {
        const endpointMatch = decision.description.match(
          /(\w+)\s+(?:endpoint|route|API)/i,
        );
        if (endpointMatch && endpointMatch[1]) {
          const path = `/${endpointMatch[1].toLowerCase()}`;
          if (!paths[path]) {
            paths[path] = {
              get: {
                summary: `Get ${endpointMatch[1]} data`,
                description: decision.description,
                responses: {
                  "200": {
                    description: "Successful response",
                  },
                },
              },
            };
          }
        }
      }
    }

    schemas["DebateDocumentation"] = {
      type: "object",
      properties: {
        title: { type: "string", description: doc.title },
        abstract: { type: "string", description: doc.abstract },
        participants: {
          type: "array",
          items: { $ref: "#/components/schemas/ParticipantSummary" },
        },
        keyDecisions: {
          type: "array",
          items: { $ref: "#/components/schemas/Decision" },
        },
      },
    };

    schemas["ParticipantSummary"] = {
      type: "object",
      properties: {
        shepherdId: { type: "string" },
        specialty: { type: "string", enum: SHEPHERD_SPECIALTIES },
        voteCount: { type: "integer" },
        concernsRaised: { type: "integer" },
        agreementsMade: { type: "integer" },
        finalVote: { $ref: "#/components/schemas/EnhancedVote" },
      },
    };

    schemas["EnhancedVote"] = {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["approve", "reject", "abstain", "conditional"],
        },
        weight: { type: "number" },
        reason: { type: "string" },
        conditions: {
          type: "array",
          items: { type: "string" },
        },
      },
    };

    schemas["Decision"] = {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        description: { type: "string" },
        proposer: { type: "string" },
        voteResult: { $ref: "#/components/schemas/WeightedConsensus" },
        timestamp: { type: "string", format: "date-time" },
      },
    };

    schemas["WeightedConsensus"] = {
      type: "object",
      properties: {
        approveWeight: { type: "number" },
        rejectWeight: { type: "number" },
        abstainWeight: { type: "number" },
        totalWeight: { type: "number" },
        threshold: { type: "number" },
        passed: { type: "boolean" },
      },
    };

    schemas["ActionItem"] = {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        description: { type: "string" },
        assignee: { type: "string" },
        priority: { type: "string", enum: ["high", "medium", "low"] },
        linkedDecision: { type: "string" },
      },
    };

    return {
      openapi: "3.0.3",
      info: {
        title: doc.title,
        version: "1.0.0",
        description: doc.abstract,
      },
      servers: [
        {
          url: "https://api.example.com/v1",
          description: "Production server",
        },
        {
          url: "https://staging-api.example.com/v1",
          description: "Staging server",
        },
      ],
      paths,
      components: {
        schemas,
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
      tags: doc.finalDesign.components.map((c) => ({
        name: c.name,
        description: c.description,
      })),
    };
  }
}

export type { TemplateVariables };
