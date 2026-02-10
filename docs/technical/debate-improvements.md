# Debate System Improvements

This document outlines potential improvements to the Multi-Shepherd Debate System.

---

## Current System Analysis

### Strengths

- Clear phase structure (4 phases)
- Multiple shepherd specialties
- Voting and quality scoring
- Integration with existing agents

### Weaknesses Identified

| Area         | Issue                      | Impact               |
| ------------ | -------------------------- | -------------------- |
| Voting       | Binary approve/reject      | Loses nuance         |
| Consensus    | No quantitative thresholds | Ambiguous agreement  |
| Time         | No time boxing per phase   | Uneven participation |
| History      | No pattern learning        | Repeats mistakes     |
| Output       | No auto-documentation      | Manual summarization |
| Tie-breaking | No escalation path         | Deadlocks possible   |

---

## Proposed Improvements

### 1. Enhanced Voting System

**Current:** Simple approve/reject/abstain

**Proposed:** Multi-dimensional scoring

```typescript
interface EnhancedVote {
  approval: number; // 0-1 scale
  confidence: number; // 0-1 scale
  concerns: string[]; // List of concerns
  conditions: string[]; // Requirements for approval
  rankedPreferences: string[]; // Ordered preference list
}

interface WeightedConsensus {
  agreementIndex: number; // 0-1 weighted average
  confidenceIndex: number; // Weighted confidence
  concernDensity: number; // Concerns per participant
  participationRate: number; // Votes / participants
}
```

**Benefits:**

- Captures "mostly agree with conditions"
- Confidence weighting prevents uncertain votes dominating
- Ranked preferences enable Condorcet method

---

### 2. Time Boxing Per Phase

**Current:** Open-ended

**Proposed:**

```typescript
interface PhaseTimeBox {
  ideaGeneration: {
    minDuration: number; // 5 minutes
    maxDuration: number; // 15 minutes
    autoExtend: boolean; // Allow extension vote
    extensionLimit: number; // Max extensions
  };
  crossValidation: {
    minDuration: number; // 10 minutes
    maxDuration: number; // 30 minutes
    perProposal: number; // 2 minutes each
  };
  conflictResolution: {
    minDuration: number; // 5 minutes
    maxDuration: number; // 20 minutes
    perConflict: number; // 5 minutes each
  };
  consensus: {
    minDuration: number; // 3 minutes
    maxDuration: number; // 10 minutes
    votingRoundLimit: number; // Max 3 rounds
  };
}
```

**Benefits:**

- Prevents extended arguments
- Ensures all phases complete
- Creates urgency for decisions

---

### 3. Pattern Learning from Debates

**Current:** No learning

**Proposed:** Borzoi learns from debate outcomes

```typescript
interface DebatePattern {
  patternId: string;
  topic: string;
  successfulDesigns: Proposal[];
  failedDesigns: Proposal[];
  commonConflicts: Conflict[];
  resolutionPatterns: Resolution[];
  successRate: number;
  recommendations: string[];
}

class DebateLearningSystem {
  async learnFromDebate(debate: Debate, outcome: DebateOutcome): Promise<void> {
    // Extract patterns from debate
    const patterns = await this.extractPatterns(debate);

    // Update historical patterns
    await this.updatePatternDatabase(patterns, outcome);

    // Generate recommendations for future debates
    await this.generateRecommendations(patterns);
  }

  async suggestFromHistory(topic: string): Promise<HistoricalSuggestion[]> {
    const relevantPatterns = await this.findPatterns(topic);
    return relevantPatterns.map((pattern) => ({
      pattern: pattern.patternId,
      successRate: pattern.successRate,
      recommendations: pattern.recommendations,
      warnings: this.generateWarnings(pattern),
    }));
  }
}
```

**Benefits:**

- Avoids repeating past mistakes
- Accelerates future debates
- Captures institutional knowledge

---

### 4. Auto-Documentation Generation

**Current:** Manual Jonnah summarization

**Proposed:** Auto-generate from debate transcript

```typescript
interface DebateDocumentation {
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

class DocumentationGenerator {
  async generate(debate: Debate): Promise<DebateDocumentation> {
    const abstract = await this.summarizeDebate(debate);
    const keyDecisions = await this.extractDecisions(debate);
    const design = await this.compileDesign(debate);
    const actionItems = await this.extractActionItems(debate);

    return {
      title: debate.topic,
      abstract,
      participants: this.summarizeParticipants(debate),
      keyDecisions,
      concerns: this.summarizeConcerns(debate),
      finalDesign: design,
      openQuestions: this.findOpenQuestions(debate),
      actionItems,
      references: this.extractReferences(debate),
    };
  }

  async exportMarkdown(doc: DebateDocumentation): Promise<string> {
    return this.renderMarkdown(doc);
  }

  async exportOpenAPI(doc: DebateDocumentation): Promise<string> {
    return this.renderOpenAPI(doc);
  }
}
```

**Benefits:**

- Consistent documentation
- Reduces Jonnah workload
- Enables traceability

---

### 5. Structured Conflict Resolution

**Current:** Free-form discussion

**Proposed:** Structured resolution workflow

```typescript
enum ConflictType {
  ARCHITECTURAL = "architectural",
  PERFORMANCE = "performance",
  SECURITY = "security",
  PRIORITY = "priority",
  SCOPE = "scope",
}

interface StructuredConflict {
  id: string;
  type: ConflictType;
  description: string;
  participants: string[];
  positionA: ConflictPosition;
  positionB: ConflictPosition;
  resolution?: ConflictResolution;
  resolutionMethod?: ResolutionMethod;
  outcome?: "accepted" | "rejected" | "compromised";
}

interface ResolutionMethod {
  type: "vote" | "data" | "expert" | "escalate";
  criteria: string[];
  dataRequired?: string[];
  expertRole?: ShepherdSpecialty;
}

const RESOLUTION_WORKFLOW = {
  [ConflictType.ARCHITECTURAL]: {
    method: "vote",
    criteria: ["cohesion", "coupling", "simplicity"],
    escalation: "Borzoi pattern analysis",
  },
  [ConflictType.PERFORMANCE]: {
    method: "data",
    criteria: ["benchmark results", "complexity analysis"],
    dataRequired: ["profiling results"],
  },
  [ConflictType.SECURITY]: {
    method: "expert",
    criteria: ["threat coverage", "risk mitigation"],
    expertRole: ShepherdSpecialty.SECURITY,
  },
  [ConflictType.PRIORITY]: {
    method: "vote",
    criteria: ["impact", "effort", "timeline"],
  },
  [ConflictType.SCOPE]: {
    method: "vote",
    criteria: ["value", "feasibility", "alignment"],
  },
};
```

**Benefits:**

- Faster conflict resolution
- Clearer criteria
- Prevents scope creep

---

### 6. Tie-Breaking Mechanisms

**Current:** Ad-hoc

**Proposed:** Formal tie-breaking

```typescript
enum TieBreakMethod {
  WEIGHTED_VOTE = "weighted_vote",
  BORZOI_DECISION = "borzoi_decision",
  CONFIDENCE_BONUS = "confidence_bonus",
  轮流 = "round_robin",
  ESCALATE = "escalate",
}

class TieBreaker {
  async breakTie(
    options: TieOption[],
    method: TieBreakMethod,
    context: DebateContext,
  ): Promise<TieOption> {
    switch (method) {
      case TieBreakMethod.WEIGHTED_VOTE:
        return this.weightedVote(options, context);

      case TieBreakMethod.BORZOI_DECISION:
        return this.borzoiDecision(options, context);

      case TieBreakMethod.CONFIDENCE_BONUS:
        return this.confidenceBonus(options);

      case TieBreakMethod.ROUND_ROBIN:
        return this.roundRobin(options, context);

      case TieBreakMethod.ESCALATE:
        return this.escalate(options, context);
    }
  }

  private async borzoiDecision(
    options: TieOption[],
    context: DebateContext,
  ): Promise<TieOption> {
    // Borzoi analyzes patterns from similar debates
    const historicalOutcome = await borzoi.predictTieBreak(options, context);

    // Return option with highest predicted success
    return options.reduce((best, current) =>
      historicalOutcome.get(current.id)! > historicalOutcome.get(best.id)!
        ? current
        : best,
    );
  }
}
```

**Benefits:**

- Prevents deadlocks
- Uses historical data
- Clear escalation path

---

### 7. Real-Time Dashboard

**Current:** Console-based output

**Proposed:** Visual dashboard

```typescript
interface DebateDashboard {
  currentPhase: PhaseType;
  phaseProgress: number; // 0-100
  participantActivity: Map<ShepherdId, ActivityMetrics>;
  proposalStatus: Map<ProposalId, ProposalMetrics>;
  conflictQueue: Conflict[];
  consensusMetrics: WeightedConsensus;
  timeRemaining: number;
}

interface ActivityMetrics {
  messagesCount: number;
  votesCast: number;
  concernsRaised: number;
  agreementsMade: number;
  lastActive: Date;
}

class DashboardRenderer {
  renderToConsole(dashboard: DebateDashboard): void {
    console.clear();
    console.log(this.renderHeader(dashboard));
    console.log(this.renderPhaseProgress(dashboard));
    console.log(this.renderParticipants(dashboard));
    console.log(this.renderProposals(dashboard));
    console.log(this.renderConflicts(dashboard));
    console.log(this.renderConsensus(dashboard));
  }

  async renderToWeb(dashboard: DebateDashboard): Promise<string> {
    return this.renderHTML(dashboard);
  }
}
```

**Benefits:**

- Better visibility
- Engagement tracking
- Stakeholder viewing

---

### 8. Debate Templates

**Current:** Ad-hoc setup

**Proposed:** Reusable templates

```typescript
interface DebateTemplate {
  id: string;
  name: string;
  description: string;
  phases: PhaseConfig[];
  requiredShepherds: ShepherdSpecialty[];
  optionalShepherds: ShepherdSpecialty[];
  defaultTimeBoxes: PhaseTimeBox;
  customRules: string[];
  successCriteria: string[];
}

const DEBATE_TEMPLATES = {
  feature_design: {
    name: "Feature Design Review",
    phases: ["idea", "cross-validation", "conflict", "consensus"],
    requiredShepherds: ["architect", "performance", "maintainability"],
    optionalShepherds: ["security", "delivery", "intelligence"],
    timeBoxes: {
      ideaGeneration: { min: 10, max: 20 },
      crossValidation: { min: 15, max: 30 },
      conflictResolution: { min: 10, max: 20 },
      consensus: { min: 5, max: 15 },
    },
  },

  security_review: {
    name: "Security Review",
    phases: [
      "idea",
      "cross-validation",
      "security-gate",
      "conflict",
      "consensus",
    ],
    requiredShepherds: ["security", "architect"],
    optionalShepherds: ["performance", "intelligence"],
    timeBoxes: {
      ideaGeneration: { min: 5, max: 10 },
      crossValidation: { min: 10, max: 20 },
      securityGate: { min: 15, max: 30 }, // NEW PHASE
      conflictResolution: { min: 10, max: 20 },
      consensus: { min: 5, max: 10 },
    },
    customRules: [
      "Security concerns have veto power",
      "All security issues must be resolved",
      "Borzoi provides threat analysis",
    ],
  },

  performance_optimization: {
    name: "Performance Optimization",
    phases: ["benchmark", "idea", "cross-validation", "consensus"],
    requiredShepherds: ["performance", "architect"],
    optionalShepherds: ["maintainability", "delivery"],
    timeBoxes: {
      benchmark: { min: 5, max: 15 }, // NEW PHASE
      ideaGeneration: { min: 10, max: 15 },
      crossValidation: { min: 15, max: 25 },
      consensus: { min: 5, max: 10 },
    },
  },

  api_design: {
    name: "API Design Review",
    phases: ["specification", "idea", "cross-validation", "consensus"],
    requiredShepherds: ["architect", "maintainability"],
    optionalShepherds: ["performance", "security"],
    timeBoxes: {
      specification: { min: 5, max: 10 },
      ideaGeneration: { min: 15, max: 25 },
      crossValidation: { min: 20, max: 35 },
      consensus: { min: 5, max: 15 },
    },
  },
};
```

**Benefits:**

- Faster setup
- Best practices baked in
- Consistency

---

### 9. Integration with Issue Tracking

**Current:** Manual

**Proposed:** Auto-create issues

```typescript
class DebateIssueIntegrator {
  async createIssuesFromDebate(
    debate: Debate,
    projectId: string,
  ): Promise<CreatedIssue[]> {
    const issues: CreatedIssue[] = [];

    // Create implementation issues
    for (const task of debate.actionItems) {
      const issue = await this.createIssue({
        projectId,
        title: `Implement: ${task.description}`,
        body: this.formatTaskAsIssue(task, debate),
        labels: ["debate-outcome", task.priority],
        linkedDebate: debate.id,
      });
      issues.push(issue);
    }

    // Create follow-up issues for open questions
    for (const question of debate.openQuestions) {
      const issue = await this.createIssue({
        projectId,
        title: `Research: ${question}`,
        body: this.formatQuestionAsIssue(question, debate),
        labels: ["debate-outcome", "research-needed"],
        linkedDebate: debate.id,
      });
      issues.push(issue);
    }

    return issues;
  }

  async syncStatus(issueIds: string[], debateId: string): Promise<void> {
    // Update debate status when issues progress
    // Enable tracking of implementation vs design
  }
}
```

**Benefits:**

- Seamless handoff
- Traceability
- Progress tracking

---

### 10. Weighted Voting by Specialty

**Current:** Equal weight

**Proposed:** Context-aware weighting

```typescript
interface WeightedVotingConfig {
  baseWeight: number; // Default weight for all
  specialtyWeights: Map<ShepherdSpecialty, number>; // Specialty multiplier
  conflictMultipliers: Map<ConflictType, Map<ShepherdSpecialty, number>>; // Context bonus
  reputationAdjustments: Map<ShepherdId, number>; // Historical accuracy
}

const DEFAULT_WEIGHTS: WeightedVotingConfig = {
  baseWeight: 1.0,
  specialtyWeights: {
    [ShepherdSpecialty.ARCHITECT]: 1.2,
    [ShepherdSpecialty.PERFORMANCE]: 1.1,
    [ShepherdSpecialty.SECURITY]: 1.3, // Security always matters
    [ShepherdSpecialty.MAINTAINABILITY]: 1.0,
    [ShepherdSpecialty.DELIVERY]: 0.9,
    [ShepherdSpecialty.INTELLIGENCE]: 1.1, // Borzoi data-driven
  },
  conflictMultipliers: {
    [ConflictType.ARCHITECTURAL]: {
      [ShepherdSpecialty.ARCHITECT]: 1.5,
    },
    [ConflictType.PERFORMANCE]: {
      [ShepherdSpecialty.PERFORMANCE]: 1.5,
    },
    [ConflictType.SECURITY]: {
      [ShepherdSpecialty.SECURITY]: 2.0, // Veto power
    },
  },
  reputationAdjustments: new Map(),
};

class WeightedVotingSystem {
  calculateVote(
    vote: EnhancedVote,
    shepherd: Shepherd,
    context: VotingContext,
  ): number {
    let weight = DEFAULT_WEIGHTS.baseWeight;

    // Apply specialty weight
    weight *= DEFAULT_WEIGHTS.specialtyWeights[shepherd.specialty] || 1.0;

    // Apply conflict context weight
    const conflictMult =
      DEFAULT_WEIGHTS.conflictMultipliers[context.conflictType]?.[
        shepherd.specialty
      ];
    if (conflictMult) {
      weight *= conflictMult;
    }

    // Apply reputation adjustment
    const reputationAdj =
      DEFAULT_WEIGHTS.reputationAdjustments[shepherd.id] || 0;
    weight *= 1 + reputationAdj;

    // Weight by confidence
    weight *= vote.confidence;

    return weight * vote.approval;
  }
}
```

**Benefits:**

- Experts have appropriate influence
- Security concerns properly weighted
- Historical accuracy rewarded

---

## Implementation Priority

| Improvement          | Priority | Effort | Impact |
| -------------------- | -------- | ------ | ------ |
| Enhanced Voting      | High     | Medium | High   |
| Time Boxing          | High     | Low    | Medium |
| Pattern Learning     | Medium   | High   | High   |
| Auto-Documentation   | Medium   | Medium | Medium |
| Structured Conflicts | High     | Low    | High   |
| Tie-Breaking         | Medium   | Low    | Medium |
| Debate Templates     | High     | Medium | High   |
| Issue Integration    | Medium   | Medium | Medium |
| Weighted Voting      | High     | Medium | High   |
| Real-Time Dashboard  | Low      | High   | Medium |

---

## Recommended First Steps

1. **Add Time Boxing** (Low effort, immediate benefit)
2. **Create Debate Templates** (Medium effort, high consistency)
3. **Implement Structured Conflicts** (Low effort, faster resolution)
4. **Enhanced Voting** (Medium effort, better decisions)
5. **Pattern Learning** (High effort, long-term value)

---

## Backward Compatibility

All improvements maintain backward compatibility:

- Enhanced voting adds fields, doesn't remove
- Time boxing is configurable (opt-in)
- Templates are new, existing debates unchanged
- Pattern learning is additive feature
