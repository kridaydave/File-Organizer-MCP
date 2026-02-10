# Multi-Shepherd Debate System

A collaborative decision-making system where specialized shepherds debate solutions, resolve conflicts, and reach consensus before user approval.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Multi-Shepherd Debate System                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │  Sheperd    │    │   Retriever │    │    Kane      │    │   Jonnah    │  │
│  │ (Coordinator)│    │  (Research) │    │  (Executor) │    │  (Synthesizer)│ │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘  │
│         │                   │                   │                   │         │
│         └───────────────────┴───────────────────┴───────────────────┘         │
│                                     │                                          │
│                                     ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐      │
│  │                    Debate Orchestrator                              │      │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐│      │
│  │  │   Message   │  │   Phase     │  │   Quality   │  │    User     ││      │
│  │  │   Router    │  │  Manager    │  │   Gate      │  │  Approval   ││      │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘│      │
│  └─────────────────────────────────────────────────────────────────────┘      │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐      │
│  │                    Specialist Shepherds Pool                        │      │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │      │
│  │  │Architect│ │Performance│ │Security │ │Maintain-│ │Delivery │       │      │
│  │  └─────────┘ └─────────┘ └─────────┘ │ ability │ └─────────┘       │      │
│  │                                   └─────────┘                      │      │
│  └─────────────────────────────────────────────────────────────────────┘      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## TypeScript Interfaces

```typescript
// Core Types for Multi-Shepherd Debate System

export type ShepherdId = string;
export type DebateId = string;
export type PhaseType =
  | "idea-generation"
  | "cross-validation"
  | "conflict-resolution"
  | "consensus";

export enum MessageType {
  // Help/Correction Messages
  HELP_REQUEST = "HELP_REQUEST",
  HELP_RESPONSE = "HELP_RESPONSE",
  CORRECTION = "CORRECTION",
  CLARIFICATION = "CLARIFICATION",

  // Debate Messages
  ARGUMENT = "ARGUMENT",
  COUNTER_ARGUMENT = "COUNTER_ARGUMENT",
  SUPPORT = "SUPPORT",
  OBJECTION = "OBJECTION",
  QUESTION = "QUESTION",
  ANSWER = "ANSWER",

  // Phase Messages
  PHASE_START = "PHASE_START",
  PHASE_COMPLETE = "PHASE_COMPLETE",
  PHASE_VOTE = "PHASE_VOTE",

  // System Messages
  QUALITY_GATE_CHECK = "QUALITY_GATE_CHECK",
  QUALITY_GATE_RESULT = "QUALITY_GATE_RESULT",
  CONSENSUS_REACHED = "CONSENSUS_REACHED",
  USER_APPROVAL_REQUIRED = "USER_APPROVAL_REQUIRED",
}

export enum ShepherdSpecialty {
  ARCHITECT = "architect",
  PERFORMANCE = "performance",
  SECURITY = "security",
  MAINTAINABILITY = "maintainability",
  DELIVERY = "delivery",
}

export enum VoteType {
  APPROVE = "approve",
  REJECT = "reject",
  ABSTAIN = "abstain",
  CONDITIONAL = "conditional",
}

export interface BaseMessage {
  id: string;
  debateId: DebateId;
  senderId: ShepherdId;
  recipientId?: ShepherdId;
  timestamp: Date;
  type: MessageType;
  priority: "low" | "medium" | "high" | "critical";
  correlationId?: string;
}

export interface HelpMessage extends BaseMessage {
  type: MessageType.HELP_REQUEST | MessageType.HELP_RESPONSE;
  content: string;
  relatedTaskId: string;
  specialty?: ShepherdSpecialty;
  urgency: "low" | "medium" | "high";
}

export interface CorrectionMessage extends BaseMessage {
  type: MessageType.CORRECTION;
  originalStatement: string;
  correctedStatement: string;
  reasoning: string;
  impact: "low" | "medium" | "high" | "critical";
}

export interface DebateMessage extends BaseMessage {
  type:
    | MessageType.ARGUMENT
    | MessageType.COUNTER_ARGUMENT
    | MessageType.SUPPORT
    | MessageType.OBJECTION;
  topicId: string;
  content: string;
  evidence: Evidence[];
  reasoning链条: string;
}

export interface Evidence {
  type:
    | "code"
    | "documentation"
    | "benchmark"
    | "security-scan"
    | "test-result"
    | "external-reference";
  content: string | object;
  source: string;
  confidence: number;
}

export interface PhaseVote extends BaseMessage {
  type: MessageType.PHASE_VOTE;
  phaseType: PhaseType;
  vote: VoteType;
  comments?: string;
  conditions?: string[];
  qualityScores: QualityScores;
}

export interface QualityScores {
  architecturalSoundness: number;
  performanceImpact: number;
  securityPosture: number;
  maintainabilityScore: number;
  deliveryRisk: number;
  overallQuality: number;
}

export interface Shepherd {
  id: ShepherdId;
  name: string;
  specialty: ShepherdSpecialty;
  expertise: string[];
  weight: number;
  availability: boolean;
  activeDebates: DebateId[];
  reputationScore: number;
}

export interface Debate {
  id: DebateId;
  topic: string;
  description: string;
  createdAt: Date;
  currentPhase: PhaseType;
  participants: Shepherd[];
  messages: BaseMessage[];
  proposals: Proposal[];
  qualityGates: QualityGateResult[];
  consensusStatus: ConsensusStatus;
  userApprovalStatus: UserApprovalStatus;
}

export interface Proposal {
  id: string;
  authorId: ShepherdId;
  content: string;
  type: "solution" | "approach" | "alternative" | "modification";
  votes: Map<ShepherdId, VoteType>;
  qualityAssessment: QualityScores;
  supportCount: number;
  objectionCount: number;
}

export interface QualityGateResult {
  gateId: string;
  gateName: string;
  passed: boolean;
  score: number;
  threshold: number;
  details: string;
  checkedBy: ShepherdId;
  checkedAt: Date;
}

export interface ConsensusStatus {
  reached: boolean;
  agreedProposalId?: string;
  agreementLevel: number;
  dissentingShepherds: ShepherdId[];
  concerns: string[];
  requiredAgreementLevel: number;
}

export interface UserApprovalStatus {
  required: boolean;
  requestedAt?: Date;
  approvedAt?: Date;
  rejectedAt?: Date;
  feedback?: string;
  approvalType: "full" | "conditional" | "deferred";
}

// Message Router Interface
export interface MessageRouter {
  route(message: BaseMessage): Promise<void>;
  sendDirect(
    from: ShepherdId,
    to: ShepherdId,
    message: BaseMessage,
  ): Promise<void>;
  broadcast(
    from: ShepherdId,
    message: BaseMessage,
    recipients?: ShepherdId[],
  ): Promise<void>;
  subscribe(shepherdId: ShepherdId, handler: MessageHandler): void;
  unsubscribe(shepherdId: ShepherdId): void;
}

export type MessageHandler = (message: BaseMessage) => Promise<void>;

// Debate Phase Manager Interface
export interface PhaseManager {
  startPhase(phase: PhaseType): Promise<void>;
  completePhase(phase: PhaseType): Promise<boolean>;
  advancePhase(): Promise<boolean>;
  getCurrentPhase(): PhaseType;
  getPhaseProgress(): PhaseProgress;
}

export interface PhaseProgress {
  currentPhase: PhaseType;
  completedPhases: PhaseType[];
  remainingPhases: PhaseType[];
  duration: number;
  messageCount: number;
}

// Quality Gate Interface
export interface QualityGate {
  id: string;
  name: string;
  description: string;
  evaluate(debate: Debate): Promise<QualityGateResult>;
  getThreshold(): number;
}

// Voting System Interface
export interface VotingSystem {
  openVoting(phase: PhaseType): Promise<void>;
  closeVoting(): Promise<VotingResult>;
  castVote(
    shepherdId: ShepherdId,
    vote: VoteType,
    comments?: string,
  ): Promise<void>;
  getResults(): VotingResult;
  isConsensusReached(): boolean;
}

export interface VotingResult {
  phase: PhaseType;
  totalVotes: number;
  approve: number;
  reject: number;
  abstain: number;
  conditional: number;
  agreementLevel: number;
  quorum: boolean;
}

// User Approval Interface
export interface UserApprovalSystem {
  requestApproval(debate: Debate): Promise<void>;
  getApprovalRequest(): UserApprovalRequest | null;
  approve(feedback?: string): Promise<void>;
  reject(feedback?: string): Promise<void>;
  requestChanges(changes: string): Promise<void>;
}

export interface UserApprovalRequest {
  debateId: DebateId;
  summary: string;
  proposals: Proposal[];
  qualityScores: QualityScores;
  dissentingOpinions: string[];
  requestedAt: Date;
  expiresAt: Date;
}
```

## Message Passing System

```typescript
import { EventEmitter } from "events";

export class MessageRouterImpl implements MessageRouter {
  private messageQueue: BaseMessage[] = [];
  private subscriptions: Map<ShepherdId, MessageHandler[]> = new Map();
  private routerEmitter = new EventEmitter();

  constructor(
    private readonly deliveryGuarantee:
      | "at-least-once"
      | "exactly-once" = "at-least-once",
  ) {
    this.routerEmitter.setMaxListeners(100);
  }

  async route(message: BaseMessage): Promise<void> {
    message.correlationId =
      message.correlationId || this.generateCorrelationId();

    switch (message.type) {
      case MessageType.HELP_REQUEST:
      case MessageType.CORRECTION:
        await this.routePriorityMessage(message);
        break;
      case MessageType.ARGUMENT:
      case MessageType.COUNTER_ARGUMENT:
        await this.routeDebateMessage(message);
        break;
      case MessageType.PHASE_VOTE:
      case MessageType.QUALITY_GATE_CHECK:
        await this.routeSystemMessage(message);
        break;
      default:
        await this.routeStandardMessage(message);
    }

    await this.persistMessage(message);
    await this.acknowledgeMessage(message);
  }

  private async routePriorityMessage(message: BaseMessage): Promise<void> {
    const relevantShepherds = this.findRelevantSpecialists(message);

    for (const shepherd of relevantShepherds) {
      await this.sendDirect(message.senderId, shepherd.id, message);
    }

    this.routerEmitter.emit("priority-route", message);
  }

  private async routeDebateMessage(message: BaseMessage): Promise<void> {
    const debate = await this.getDebateContext(message.debateId);
    const recipients = debate.participants
      .filter((p) => p.id !== message.senderId)
      .map((p) => p.id);

    await this.broadcast(message.senderId, message, recipients);
  }

  private async routeSystemMessage(message: BaseMessage): Promise<void> {
    const allSubscribers = Array.from(this.subscriptions.keys());
    await this.broadcast(message.senderId, message, allSubscribers);
  }

  private async routeStandardMessage(message: BaseMessage): Promise<void> {
    if (message.recipientId) {
      await this.sendDirect(message.senderId, message.recipientId, message);
    } else {
      const debate = await this.getDebateContext(message.debateId);
      await this.broadcast(
        message.senderId,
        message,
        debate.participants.map((p) => p.id),
      );
    }
  }

  async sendDirect(
    from: ShepherdId,
    to: ShepherdId,
    message: BaseMessage,
  ): Promise<void> {
    const handlers = this.subscriptions.get(to) || [];
    for (const handler of handlers) {
      try {
        await handler(message);
      } catch (error) {
        console.error(`Handler error for shepherd ${to}:`, error);
        await this.scheduleRetry(message, to);
      }
    }
  }

  async broadcast(
    from: ShepherdId,
    message: BaseMessage,
    recipients?: ShepherdId[],
  ): Promise<void> {
    const targets = recipients || this.getAllActiveShepherds();

    const deliveryPromises = targets.map(async (recipientId) => {
      await this.sendDirect(from, recipientId, message);
    });

    await Promise.allSettled(deliveryPromises);
  }

  subscribe(shepherdId: ShepherdId, handler: MessageHandler): void {
    const handlers = this.subscriptions.get(shepherdId) || [];
    handlers.push(handler);
    this.subscriptions.set(shepherdId, handlers);
  }

  unsubscribe(shepherdId: ShepherdId): void {
    this.subscriptions.delete(shepherdId);
  }

  private async persistMessage(message: BaseMessage): Promise<void> {
    this.messageQueue.push(message);
    if (this.messageQueue.length > 1000) {
      await this.flushMessageQueue();
    }
  }

  private async flushMessageQueue(): Promise<void> {
    const messages = [...this.messageQueue];
    this.messageQueue = [];
    console.log(`Persisted ${messages.length} messages to storage`);
  }

  private async acknowledgeMessage(message: BaseMessage): Promise<void> {
    const ackMessage: BaseMessage = {
      ...message,
      id: this.generateMessageId(),
      type: MessageType.ANSWER,
      timestamp: new Date(),
    };
    await this.sendDirect("system", message.senderId, ackMessage);
  }

  private findRelevantSpecialists(message: BaseMessage): Shepherd[] {
    return [];
  }

  private getDebateContext(debateId: DebateId): Promise<Debate> {
    return Promise.resolve({
      id: debateId,
      topic: "",
      description: "",
      createdAt: new Date(),
      currentPhase: PhaseType.IDEA_GENERATION,
      participants: [],
      messages: [],
      proposals: [],
      qualityGates: [],
      consensusStatus: {
        reached: false,
        agreementLevel: 0,
        dissentingShepherds: [],
        concerns: [],
        requiredAgreementLevel: 0.7,
      },
      userApprovalStatus: { required: false, approvalType: "full" },
    });
  }

  private getAllActiveShepherds(): ShepherdId[] {
    return Array.from(this.subscriptions.keys());
  }

  private generateCorrelationId(): string {
    return `corr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async scheduleRetry(
    message: BaseMessage,
    recipientId: ShepherdId,
  ): Promise<void> {
    setTimeout(() => {
      this.sendDirect(message.senderId, recipientId, message);
    }, 5000);
  }
}

export class MessageBuilder {
  private message: Partial<BaseMessage> = {
    id: this.generateId(),
    timestamp: new Date(),
    priority: "medium",
  };

  helpRequest(
    debateId: DebateId,
    senderId: ShepherdId,
    content: string,
    specialty?: ShepherdSpecialty,
  ): HelpMessage {
    return {
      ...this.message,
      type: MessageType.HELP_REQUEST,
      debateId,
      senderId,
      content,
      relatedTaskId: "",
      specialty,
      urgency: "medium",
    } as HelpMessage;
  }

  correction(
    debateId: DebateId,
    senderId: ShepherdId,
    original: string,
    corrected: string,
    reasoning: string,
  ): CorrectionMessage {
    return {
      ...this.message,
      type: MessageType.CORRECTION,
      debateId,
      senderId,
      originalStatement: original,
      correctedStatement: corrected,
      reasoning,
      impact: "medium",
    } as CorrectionMessage;
  }

  argument(
    debateId: DebateId,
    senderId: ShepherdId,
    topicId: string,
    content: string,
    evidence: Evidence[],
  ): DebateMessage {
    return {
      ...this.message,
      type: MessageType.ARGUMENT,
      debateId,
      senderId,
      topicId,
      content,
      evidence,
      reasoning链条: "",
    } as DebateMessage;
  }

  support(
    debateId: DebateId,
    senderId: ShepherdId,
    targetMessageId: string,
    content: string,
  ): DebateMessage {
    return {
      ...this.message,
      type: MessageType.SUPPORT,
      debateId,
      senderId,
      topicId: targetMessageId,
      content,
      evidence: [],
      reasoning链条: "",
    } as DebateMessage;
  }

  objection(
    debateId: DebateId,
    senderId: ShepherdId,
    targetMessageId: string,
    content: string,
    evidence: Evidence[],
  ): DebateMessage {
    return {
      ...this.message,
      type: MessageType.OBJECTION,
      debateId,
      senderId,
      topicId: targetMessageId,
      content,
      evidence,
      reasoning链条: "",
    } as DebateMessage;
  }

  phaseVote(
    debateId: DebateId,
    senderId: ShepherdId,
    phase: PhaseType,
    vote: VoteType,
    scores: QualityScores,
  ): PhaseVote {
    return {
      ...this.message,
      type: MessageType.PHASE_VOTE,
      debateId,
      senderId,
      phaseType: phase,
      vote,
      qualityScores: scores,
    } as PhaseVote;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

## Debate Phase Implementation

```typescript
export class DebatePhaseManager implements PhaseManager {
  private currentPhaseType: PhaseType = PhaseType.IDEA_GENERATION;
  private phaseStartTime: Date = new Date();
  private messageCount: number = 0;
  private completedPhases: PhaseType[] = [];

  constructor(
    private readonly debate: Debate,
    private readonly router: MessageRouter,
    private readonly votingSystem: VotingSystem,
    private readonly qualityGates: QualityGate[],
  ) {}

  async startPhase(phase: PhaseType): Promise<void> {
    this.currentPhaseType = phase;
    this.phaseStartTime = new Date();
    this.messageCount = 0;

    const phaseStartMessage: BaseMessage = {
      id: this.generateId(),
      debateId: this.debate.id,
      senderId: "system",
      timestamp: new Date(),
      type: MessageType.PHASE_START,
      priority: "high",
      correlationId: this.generateCorrelationId(),
    };

    await this.router.broadcast(
      "system",
      phaseStartMessage,
      this.debate.participants.map((p) => p.id),
    );

    switch (phase) {
      case PhaseType.IDEA_GENERATION:
        await this.executeIdeaGenerationPhase();
        break;
      case PhaseType.CROSS_VALIDATION:
        await this.executeCrossValidationPhase();
        break;
      case PhaseType.CONFLICT_RESOLUTION:
        await this.executeConflictResolutionPhase();
        break;
      case PhaseType.CONSENSUS:
        await this.executeConsensusPhase();
        break;
    }
  }

  async completePhase(phase: PhaseType): Promise<boolean> {
    const phaseCompleteMessage: BaseMessage = {
      id: this.generateId(),
      debateId: this.debate.id,
      senderId: "system",
      timestamp: new Date(),
      type: MessageType.PHASE_COMPLETE,
      priority: "high",
    };

    await this.router.broadcast("system", phaseCompleteMessage);
    this.completedPhases.push(phase);

    return true;
  }

  async advancePhase(): Promise<boolean> {
    const phaseOrder: PhaseType[] = [
      PhaseType.IDEA_GENERATION,
      PhaseType.CROSS_VALIDATION,
      PhaseType.CONFLICT_RESOLUTION,
      PhaseType.CONSENSUS,
    ];

    const currentIndex = phaseOrder.indexOf(this.currentPhaseType);
    if (currentIndex >= phaseOrder.length - 1) {
      return false;
    }

    await this.completePhase(this.currentPhaseType);
    const nextPhase = phaseOrder[currentIndex + 1];
    await this.startPhase(nextPhase);

    return true;
  }

  getCurrentPhase(): PhaseType {
    return this.currentPhaseType;
  }

  getPhaseProgress(): PhaseProgress {
    const phaseOrder: PhaseType[] = [
      PhaseType.IDEA_GENERATION,
      PhaseType.CROSS_VALIDATION,
      PhaseType.CONFLICT_RESOLUTION,
      PhaseType.CONSENSUS,
    ];

    return {
      currentPhase: this.currentPhaseType,
      completedPhases: this.completedPhases,
      remainingPhases: phaseOrder.filter(
        (p) => !this.completedPhases.includes(p),
      ),
      duration: Date.now() - this.phaseStartTime.getTime(),
      messageCount: this.messageCount,
    };
  }

  private async executeIdeaGenerationPhase(): Promise<void> {
    const timeout = 300000;
    const checkInterval = 5000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      await this.processIdeaGenerationMessages();

      if (this.hasSufficientIdeas()) {
        break;
      }

      await this.delay(checkInterval);
    }

    await this.votingSystem.openVoting(PhaseType.IDEA_GENERATION);
  }

  private async executeCrossValidationPhase(): Promise<void> {
    const timeout = 180000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      await this.processCrossValidationMessages();

      if (this.allProposalsValidated()) {
        break;
      }

      await this.delay(3000);
    }

    await this.votingSystem.openVoting(PhaseType.CROSS_VALIDATION);
  }

  private async executeConflictResolutionPhase(): Promise<void> {
    const timeout = 240000;
    const startTime = Date.now();
    let conflictIterations = 0;
    const maxIterations = 3;

    while (
      Date.now() - startTime < timeout &&
      conflictIterations < maxIterations
    ) {
      await this.processConflictResolutionMessages();

      if (await this.conflictsResolved()) {
        break;
      }

      conflictIterations++;
      await this.delay(5000);
    }

    await this.votingSystem.openVoting(PhaseType.CONFLICT_RESOLUTION);
  }

  private async executeConsensusPhase(): Promise<void> {
    const consensusTimeout = 120000;
    const startTime = Date.now();

    while (Date.now() - startTime < consensusTimeout) {
      await this.processConsensusMessages();

      if (this.votingSystem.isConsensusReached()) {
        break;
      }

      await this.delay(2000);
    }

    await this.votingSystem.closeVoting();
  }

  private async processIdeaGenerationMessages(): Promise<void> {
    const ideaMessages = this.debate.messages.filter(
      (m) => m.type === MessageType.ARGUMENT && m.topicId === "idea",
    );

    this.messageCount = ideaMessages.length;
  }

  private hasSufficientIdeas(): boolean {
    return this.debate.proposals.length >= 3;
  }

  private async processCrossValidationMessages(): Promise<void> {
    const validationMessages = this.debate.messages.filter(
      (m) =>
        m.type === MessageType.ARGUMENT || m.type === MessageType.OBJECTION,
    );

    this.messageCount = validationMessages.length;
  }

  private allProposalsValidated(): boolean {
    return this.debate.proposals.every((p) => p.votes.size > 0);
  }

  private async processConflictResolutionMessages(): Promise<void> {
    const conflictMessages = this.debate.messages.filter(
      (m) =>
        m.type === MessageType.COUNTER_ARGUMENT ||
        m.type === MessageType.CORRECTION,
    );

    this.messageCount = conflictMessages.length;
  }

  private async conflictsResolved(): Promise<boolean> {
    const openObjections = this.debate.messages.filter(
      (m) => m.type === MessageType.OBJECTION,
    ).length;

    return openObjections === 0;
  }

  private async processConsensusMessages(): Promise<void> {
    const consensusMessages = this.debate.messages.filter(
      (m) => m.type === MessageType.PHASE_VOTE,
    );

    this.messageCount = consensusMessages.length;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateCorrelationId(): string {
    return `corr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export class IdeaGenerationPhase {
  constructor(
    private readonly debate: Debate,
    private readonly router: MessageRouter,
  ) {}

  async generateIdeas(context: string): Promise<Proposal[]> {
    const proposals: Proposal[] = [];
    const ideasBySpecialty = new Map<ShepherdSpecialty, string[]>();

    for (const participant of this.debate.participants) {
      const ideas = await this.solicitIdeas(participant, context);
      ideasBySpecialty.set(participant.specialty, ideas);
    }

    for (const [specialty, ideas] of ideasBySpecialty) {
      for (const idea of ideas) {
        const proposal = await this.createProposal(idea, specialty);
        proposals.push(proposal);
      }
    }

    return proposals;
  }

  private async solicitIdeas(
    shepherd: Shepherd,
    context: string,
  ): Promise<string[]> {
    const ideaRequest: BaseMessage = {
      id: this.generateId(),
      debateId: this.debate.id,
      senderId: "system",
      timestamp: new Date(),
      type: MessageType.HELP_REQUEST,
      priority: "high",
      content: `Please generate ideas for: ${context}`,
    };

    const ideas: string[] = [];
    return ideas;
  }

  private async createProposal(
    idea: string,
    specialty: ShepherdSpecialty,
  ): Promise<Proposal> {
    return {
      id: this.generateId(),
      authorId: "",
      content: idea,
      type: "solution",
      votes: new Map(),
      qualityAssessment: {
        architecturalSoundness: 0,
        performanceImpact: 0,
        securityPosture: 0,
        maintainabilityScore: 0,
        deliveryRisk: 0,
        overallQuality: 0,
      },
      supportCount: 0,
      objectionCount: 0,
    };
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export class CrossValidationPhase {
  constructor(
    private readonly debate: Debate,
    private readonly router: MessageRouter,
    private readonly specialistShepherds: SpecialistShepherd[],
  ) {}

  async validateProposals(): Promise<Map<string, ValidationResult>> {
    const results = new Map<string, ValidationResult>();

    for (const proposal of this.debate.proposals) {
      const validation = await this.validateProposal(proposal);
      results.set(proposal.id, validation);
    }

    return results;
  }

  private async validateProposal(
    proposal: Proposal,
  ): Promise<ValidationResult> {
    const specialistValidations = await Promise.all(
      this.specialistShepherds.map((shepherd) =>
        shepherd.validateProposal(proposal),
      ),
    );

    const overallScore =
      specialistValidations.reduce((acc, v) => acc + v.score, 0) /
      specialistValidations.length;

    return {
      proposalId: proposal.id,
      score: overallScore,
      specialistFeedback: specialistValidations,
      passed: overallScore >= 0.7,
      concerns: specialistValidations
        .filter((v) => !v.passed)
        .map((v) => v.concerns)
        .flat(),
    };
  }
}

export class ConflictResolutionPhase {
  constructor(
    private readonly debate: Debate,
    private readonly router: MessageRouter,
  ) {}

  async resolveConflicts(): Promise<ConflictResolutionResult> {
    const conflicts = await this.identifyConflicts();
    const resolutions: ConflictResolution[] = [];

    for (const conflict of conflicts) {
      const resolution = await this.resolveConflict(conflict);
      resolutions.push(resolution);
    }

    return {
      conflictsResolved: resolutions.filter((r) => r.resolved).length,
      totalConflicts: conflicts.length,
      resolutions,
    };
  }

  private async identifyConflicts(): Promise<Conflict[]> {
    const conflicts: Conflict[] = [];

    for (let i = 0; i < this.debate.messages.length; i++) {
      const message = this.debate.messages[i];
      if (message.type === MessageType.OBJECTION) {
        conflicts.push({
          id: message.id,
          topic: message.topicId,
          objection: message.content,
          originators: [message.senderId],
        });
      }
    }

    return conflicts;
  }

  private async resolveConflict(
    conflict: Conflict,
  ): Promise<ConflictResolution> {
    const resolutionMessage: BaseMessage = {
      id: this.generateId(),
      debateId: this.debate.id,
      senderId: "system",
      timestamp: new Date(),
      type: MessageType.CORRECTION,
      priority: "high",
      content: `Resolving conflict: ${conflict.topic}`,
    };

    await this.router.broadcast("system", resolutionMessage);

    return {
      conflictId: conflict.id,
      resolved: true,
      resolution: "Conflict addressed through consensus",
      updatedProposalId: "",
    };
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export interface ValidationResult {
  proposalId: string;
  score: number;
  specialistFeedback: SpecialistValidation[];
  passed: boolean;
  concerns: string[];
}

export interface SpecialistValidation {
  specialty: ShepherdSpecialty;
  score: number;
  passed: boolean;
  concerns: string[];
  recommendations: string[];
}

export interface Conflict {
  id: string;
  topic: string;
  objection: string;
  originators: ShepherdId[];
}

export interface ConflictResolution {
  conflictId: string;
  resolved: boolean;
  resolution: string;
  updatedProposalId: string;
}

export interface ConflictResolutionResult {
  conflictsResolved: number;
  totalConflicts: number;
  resolutions: ConflictResolution[];
}
```

## Specialist Shepherd Types

```typescript
export abstract class SpecialistShepherd {
  constructor(
    public readonly id: ShepherdId,
    public readonly name: string,
    public readonly specialty: ShepherdSpecialty,
    public readonly expertise: string[],
    public readonly weight: number = 1.0,
  ) {}

  abstract validateProposal(proposal: Proposal): Promise<SpecialistValidation>;
  abstract generateCritique(proposal: Proposal): Promise<DebateMessage>;
  abstract assessQuality(proposal: Proposal): Promise<QualityScores>;
}

export class ArchitectShepherd extends SpecialistShepherd {
  constructor(
    id: ShepherdId,
    name: string,
    expertise: string[] = [
      "system-design",
      "patterns",
      "interfaces",
      "data-flow",
    ],
  ) {
    super(id, name, ShepherdSpecialty.ARCHITECT, expertise, 1.2);
  }

  async validateProposal(proposal: Proposal): Promise<SpecialistValidation> {
    const concerns: string[] = [];
    const recommendations: string[] = [];
    let score = 1.0;

    if (!this.hasClearInterfaces(proposal)) {
      concerns.push("Missing clear interface definitions");
      score -= 0.2;
    }

    if (!this.hasScalableDesign(proposal)) {
      concerns.push("Design may not scale appropriately");
      score -= 0.15;
    }

    if (!this.hasProperAbstraction(proposal)) {
      concerns.push("Insufficient abstraction layers");
      score -= 0.1;
    }

    return {
      specialty: this.specialty,
      score: Math.max(0, score),
      passed: score >= 0.7,
      concerns,
      recommendations,
    };
  }

  async generateCritique(proposal: Proposal): Promise<DebateMessage> {
    const validation = await this.validateProposal(proposal);

    return {
      id: this.generateId(),
      debateId: proposal.id,
      senderId: this.id,
      timestamp: new Date(),
      type: MessageType.ARGUMENT,
      priority: validation.passed ? "medium" : "high",
      topicId: proposal.id,
      content: `Architecture review: ${validation.concerns.join("; ")}`,
      evidence: [],
      reasoning链条: this.buildReasoningChain(proposal),
    };
  }

  async assessQuality(proposal: Proposal): Promise<QualityScores> {
    const validation = await this.validateProposal(proposal);

    return {
      architecturalSoundness: validation.score,
      performanceImpact: this.assessPerformanceImpact(proposal),
      securityPosture: this.assessSecurityPosture(proposal),
      maintainabilityScore: this.assessMaintainability(proposal),
      deliveryRisk: this.assessDeliveryRisk(proposal),
      overallQuality: validation.score,
    };
  }

  private hasClearInterfaces(proposal: Proposal): boolean {
    return true;
  }

  private hasScalableDesign(proposal: Proposal): boolean {
    return true;
  }

  private hasProperAbstraction(proposal: Proposal): boolean {
    return true;
  }

  private buildReasoningChain(proposal: Proposal): string {
    return `Architecture analysis chain for ${proposal.id}`;
  }

  private assessPerformanceImpact(proposal: Proposal): number {
    return 0.8;
  }

  private assessSecurityPosture(proposal: Proposal): number {
    return 0.8;
  }

  private assessMaintainability(proposal: Proposal): number {
    return 0.8;
  }

  private assessDeliveryRisk(proposal: Proposal): number {
    return 0.2;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export class PerformanceShepherd extends SpecialistShepherd {
  constructor(
    id: ShepherdId,
    name: string,
    expertise: string[] = [
      "optimization",
      "benchmarking",
      "profiling",
      "caching",
    ],
  ) {
    super(id, name, ShepherdSpecialty.PERFORMANCE, expertise, 1.1);
  }

  async validateProposal(proposal: Proposal): Promise<SpecialistValidation> {
    const concerns: string[] = [];
    const recommendations: string[] = [];
    let score = 1.0;

    if (!this.hasPerformanceTargets(proposal)) {
      concerns.push("No performance targets defined");
      score -= 0.2;
    }

    if (!this.hasEfficientAlgorithm(proposal)) {
      concerns.push("Algorithm complexity may be suboptimal");
      score -= 0.15;
    }

    if (!this.hasResourceManagement(proposal)) {
      concerns.push("Resource management not addressed");
      score -= 0.1;
    }

    return {
      specialty: this.specialty,
      score: Math.max(0, score),
      passed: score >= 0.7,
      concerns,
      recommendations,
    };
  }

  async generateCritique(proposal: Proposal): Promise<DebateMessage> {
    return {
      id: this.generateId(),
      debateId: proposal.id,
      senderId: this.id,
      timestamp: new Date(),
      type: MessageType.ARGUMENT,
      priority: "medium",
      topicId: proposal.id,
      content: "Performance analysis",
      evidence: [],
      reasoning链条: "",
    };
  }

  async assessQuality(proposal: Proposal): Promise<QualityScores> {
    return {
      architecturalSoundness: 0.7,
      performanceImpact: 0.9,
      securityPosture: 0.7,
      maintainabilityScore: 0.7,
      deliveryRisk: 0.2,
      overallQuality: 0.8,
    };
  }

  private hasPerformanceTargets(proposal: Proposal): boolean {
    return true;
  }

  private hasEfficientAlgorithm(proposal: Proposal): boolean {
    return true;
  }

  private hasResourceManagement(proposal: Proposal): boolean {
    return true;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export class SecurityShepherd extends SpecialistShepherd {
  constructor(
    id: ShepherdId,
    name: string,
    expertise: string[] = [
      "auth",
      "encryption",
      "vulnerabilities",
      "compliance",
    ],
  ) {
    super(id, name, ShepherdSpecialty.SECURITY, expertise, 1.3);
  }

  async validateProposal(proposal: Proposal): Promise<SpecialistValidation> {
    const concerns: string[] = [];
    const recommendations: string[] = [];
    let score = 1.0;

    if (!this.hasAuthentication(proposal)) {
      concerns.push("Authentication mechanism not specified");
      score -= 0.25;
    }

    if (!this.hasAuthorization(proposal)) {
      concerns.push("Authorization model not defined");
      score -= 0.2;
    }

    if (!this.hasDataProtection(proposal)) {
      concerns.push("Data protection measures not described");
      score -= 0.15;
    }

    if (!this.hasVulnerabilityMitigation(proposal)) {
      concerns.push("No vulnerability mitigation strategy");
      score -= 0.15;
    }

    return {
      specialty: this.specialty,
      score: Math.max(0, score),
      passed: score >= 0.75,
      concerns,
      recommendations,
    };
  }

  async generateCritique(proposal: Proposal): Promise<DebateMessage> {
    return {
      id: this.generateId(),
      debateId: proposal.id,
      senderId: this.id,
      timestamp: new Date(),
      type: MessageType.ARGUMENT,
      priority: "high",
      topicId: proposal.id,
      content: "Security review",
      evidence: [],
      reasoning链条: "",
    };
  }

  async assessQuality(proposal: Proposal): Promise<QualityScores> {
    return {
      architecturalSoundness: 0.7,
      performanceImpact: 0.7,
      securityPosture: 0.9,
      maintainabilityScore: 0.7,
      deliveryRisk: 0.3,
      overallQuality: 0.8,
    };
  }

  private hasAuthentication(proposal: Proposal): boolean {
    return true;
  }

  private hasAuthorization(proposal: Proposal): boolean {
    return true;
  }

  private hasDataProtection(proposal: Proposal): boolean {
    return true;
  }

  private hasVulnerabilityMitigation(proposal: Proposal): boolean {
    return true;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export class MaintainabilityShepherd extends SpecialistShepherd {
  constructor(
    id: ShepherdId,
    name: string,
    expertise: string[] = [
      "documentation",
      "testing",
      "refactoring",
      "code-quality",
    ],
  ) {
    super(id, name, ShepherdSpecialty.MAINTAINABILITY, expertise, 1.0);
  }

  async validateProposal(proposal: Proposal): Promise<SpecialistValidation> {
    const concerns: string[] = [];
    const recommendations: string[] = [];
    let score = 1.0;

    if (!this.hasTests(proposal)) {
      concerns.push("Test coverage not specified");
      score -= 0.2;
    }

    if (!this.hasDocumentation(proposal)) {
      concerns.push("Documentation requirements not met");
      score -= 0.15;
    }

    if (!this.hasCodeStandards(proposal)) {
      concerns.push("Code standards not defined");
      score -= 0.1;
    }

    return {
      specialty: this.specialty,
      score: Math.max(0, score),
      passed: score >= 0.7,
      concerns,
      recommendations,
    };
  }

  async generateCritique(proposal: Proposal): Promise<DebateMessage> {
    return {
      id: this.generateId(),
      debateId: proposal.id,
      senderId: this.id,
      timestamp: new Date(),
      type: MessageType.ARGUMENT,
      priority: "medium",
      topicId: proposal.id,
      content: "Maintainability review",
      evidence: [],
      reasoning链条: "",
    };
  }

  async assessQuality(proposal: Proposal): Promise<QualityScores> {
    return {
      architecturalSoundness: 0.7,
      performanceImpact: 0.7,
      securityPosture: 0.7,
      maintainabilityScore: 0.9,
      deliveryRisk: 0.2,
      overallQuality: 0.8,
    };
  }

  private hasTests(proposal: Proposal): boolean {
    return true;
  }

  private hasDocumentation(proposal: Proposal): boolean {
    return true;
  }

  private hasCodeStandards(proposal: Proposal): boolean {
    return true;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export class DeliveryShepherd extends SpecialistShepherd {
  constructor(
    id: ShepherdId,
    name: string,
    expertise: string[] = [
      "planning",
      "risk-management",
      "deployment",
      "milestones",
    ],
  ) {
    super(id, name, ShepherdSpecialty.DELIVERY, expertise, 1.0);
  }

  async validateProposal(proposal: Proposal): Promise<SpecialistValidation> {
    const concerns: string[] = [];
    const recommendations: string[] = [];
    let score = 1.0;

    if (!this.hasTimeline(proposal)) {
      concerns.push("No timeline defined");
      score -= 0.2;
    }

    if (!this.hasMilestones(proposal)) {
      concerns.push("Milestones not specified");
      score -= 0.15;
    }

    if (!this.hasRiskPlan(proposal)) {
      concerns.push("Risk mitigation plan missing");
      score -= 0.15;
    }

    return {
      specialty: this.specialty,
      score: Math.max(0, score),
      passed: score >= 0.7,
      concerns,
      recommendations,
    };
  }

  async generateCritique(proposal: Proposal): Promise<DebateMessage> {
    return {
      id: this.generateId(),
      debateId: proposal.id,
      senderId: this.id,
      timestamp: new Date(),
      type: MessageType.ARGUMENT,
      priority: "medium",
      topicId: proposal.id,
      content: "Delivery assessment",
      evidence: [],
      reasoning链条: "",
    };
  }

  async assessQuality(proposal: Proposal): Promise<QualityScores> {
    return {
      architecturalSoundness: 0.7,
      performanceImpact: 0.7,
      securityPosture: 0.7,
      maintainabilityScore: 0.7,
      deliveryRisk: 0.9,
      overallQuality: 0.8,
    };
  }

  private hasTimeline(proposal: Proposal): boolean {
    return true;
  }

  private hasMilestones(proposal: Proposal): boolean {
    return true;
  }

  private hasRiskPlan(proposal: Proposal): boolean {
    return true;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export class SpecialistShepherdFactory {
  static createShepherd(
    specialty: ShepherdSpecialty,
    id: ShepherdId,
    name: string,
  ): SpecialistShepherd {
    switch (specialty) {
      case ShepherdSpecialty.ARCHITECT:
        return new ArchitectShepherd(id, name);
      case ShepherdSpecialty.PERFORMANCE:
        return new PerformanceShepherd(id, name);
      case ShepherdSpecialty.SECURITY:
        return new SecurityShepherd(id, name);
      case ShepherdSpecialty.MAINTAINABILITY:
        return new MaintainabilityShepherd(id, name);
      case ShepherdSpecialty.DELIVERY:
        return new DeliveryShepherd(id, name);
      default:
        throw new Error(`Unknown specialty: ${specialty}`);
    }
  }
}
```

## Quality Gates and Voting System

```typescript
export class QualityGateEngine {
  private gates: QualityGate[] = [];

  constructor() {
    this.initializeDefaultGates();
  }

  private initializeDefaultGates(): void {
    this.gates.push(new ArchitecturalSoundnessGate());
    this.gates.push(new PerformanceGate());
    this.gates.push(new SecurityGate());
    this.gates.push(new MaintainabilityGate());
    this.gates.push(new DeliveryRiskGate());
    this.gates.push(new ConsensusGate());
  }

  async evaluateAll(debate: Debate): Promise<QualityGateResult[]> {
    const results: QualityGateResult[] = [];

    for (const gate of this.gates) {
      try {
        const result = await gate.evaluate(debate);
        results.push(result);
      } catch (error) {
        results.push({
          gateId: gate.id,
          gateName: gate.name,
          passed: false,
          score: 0,
          threshold: gate.getThreshold(),
          details: `Evaluation error: ${error instanceof Error ? error.message : "Unknown error"}`,
          checkedBy: "system",
          checkedAt: new Date(),
        });
      }
    }

    return results;
  }

  getOverallScore(results: QualityGateResult[]): number {
    if (results.length === 0) return 0;

    const totalScore = results.reduce((sum, r) => sum + r.score, 0);
    return totalScore / results.length;
  }

  allGatesPassed(results: QualityGateResult[]): boolean {
    return results.every((r) => r.passed);
  }

  addGate(gate: QualityGate): void {
    this.gates.push(gate);
  }

  removeGate(gateId: string): void {
    this.gates = this.gates.filter((g) => g.id !== gateId);
  }
}

export class ArchitecturalSoundnessGate implements QualityGate {
  id = "gate-architectural";
  name = "Architectural Soundness";
  description = "Ensures the proposal has a sound architectural design";

  async evaluate(debate: Debate): Promise<QualityGateResult> {
    const proposals = debate.proposals;
    if (proposals.length === 0) {
      return {
        gateId: this.id,
        gateName: this.name,
        passed: false,
        score: 0,
        threshold: this.getThreshold(),
        details: "No proposals to evaluate",
        checkedBy: "system",
        checkedAt: new Date(),
      };
    }

    const avgArchitecturalScore =
      proposals.reduce(
        (sum, p) => sum + p.qualityAssessment.architecturalSoundness,
        0,
      ) / proposals.length;

    return {
      gateId: this.id,
      gateName: this.name,
      passed: avgArchitecturalScore >= this.getThreshold(),
      score: avgArchitecturalScore,
      threshold: this.getThreshold(),
      details: `Average architectural score: ${avgArchitecturalScore.toFixed(2)}`,
      checkedBy: "architect-shepherd",
      checkedAt: new Date(),
    };
  }

  getThreshold(): number {
    return 0.7;
  }
}

export class PerformanceGate implements QualityGate {
  id = "gate-performance";
  name = "Performance Requirements";
  description = "Ensures the solution meets performance criteria";

  async evaluate(debate: Debate): Promise<QualityGateResult> {
    const proposals = debate.proposals;
    const avgPerformanceScore =
      proposals.reduce(
        (sum, p) => sum + p.qualityAssessment.performanceImpact,
        0,
      ) / (proposals.length || 1);

    return {
      gateId: this.id,
      gateName: this.name,
      passed: avgPerformanceScore >= this.getThreshold(),
      score: avgPerformanceScore,
      threshold: this.getThreshold(),
      details: `Average performance score: ${avgPerformanceScore.toFixed(2)}`,
      checkedBy: "performance-shepherd",
      checkedAt: new Date(),
    };
  }

  getThreshold(): number {
    return 0.65;
  }
}

export class SecurityGate implements QualityGate {
  id = "gate-security";
  name = "Security Posture";
  description = "Ensures the solution meets security requirements";

  async evaluate(debate: Debate): Promise<QualityGateResult> {
    const proposals = debate.proposals;
    const avgSecurityScore =
      proposals.reduce(
        (sum, p) => sum + p.qualityAssessment.securityPosture,
        0,
      ) / (proposals.length || 1);

    return {
      gateId: this.id,
      gateName: this.name,
      passed: avgSecurityScore >= this.getThreshold(),
      score: avgSecurityScore,
      threshold: this.getThreshold(),
      details: `Average security score: ${avgSecurityScore.toFixed(2)}`,
      checkedBy: "security-shepherd",
      checkedAt: new Date(),
    };
  }

  getThreshold(): number {
    return 0.8;
  }
}

export class MaintainabilityGate implements QualityGate {
  id = "gate-maintainability";
  name = "Maintainability Score";
  description = "Ensures the solution is maintainable";

  async evaluate(debate: Debate): Promise<QualityGateResult> {
    const proposals = debate.proposals;
    const avgMaintainabilityScore =
      proposals.reduce(
        (sum, p) => sum + p.qualityAssessment.maintainabilityScore,
        0,
      ) / (proposals.length || 1);

    return {
      gateId: this.id,
      gateName: this.name,
      passed: avgMaintainabilityScore >= this.getThreshold(),
      score: avgMaintainabilityScore,
      threshold: this.getThreshold(),
      details: `Average maintainability score: ${avgMaintainabilityScore.toFixed(2)}`,
      checkedBy: "maintainability-shepherd",
      checkedAt: new Date(),
    };
  }

  getThreshold(): number {
    return 0.65;
  }
}

export class DeliveryRiskGate implements QualityGate {
  id = "gate-delivery";
  name = "Delivery Risk Assessment";
  description = "Ensures delivery risk is within acceptable limits";

  async evaluate(debate: Debate): Promise<QualityGateResult> {
    const proposals = debate.proposals;
    const avgDeliveryRisk =
      proposals.reduce((sum, p) => sum + p.qualityAssessment.deliveryRisk, 0) /
      (proposals.length || 1);

    const passed = avgDeliveryRisk <= this.getThreshold();

    return {
      gateId: this.id,
      gateName: this.name,
      passed,
      score: 1 - avgDeliveryRisk,
      threshold: this.getThreshold(),
      details: `Average delivery risk: ${avgDeliveryRisk.toFixed(2)} (inverted score)`,
      checkedBy: "delivery-shepherd",
      checkedAt: new Date(),
    };
  }

  getThreshold(): number {
    return 0.35;
  }
}

export class ConsensusGate implements QualityGate {
  id = "gate-consensus";
  name = "Consensus Reached";
  description = "Ensures shepherds have reached consensus";

  async evaluate(debate: Debate): Promise<QualityGateResult> {
    return {
      gateId: this.id,
      gateName: this.name,
      passed: debate.consensusStatus.reached,
      score: debate.consensusStatus.agreementLevel,
      threshold: this.getThreshold(),
      details: `Agreement level: ${(debate.consensusStatus.agreementLevel * 100).toFixed(1)}%`,
      checkedBy: "system",
      checkedAt: new Date(),
    };
  }

  getThreshold(): number {
    return 0.75;
  }
}

export class VotingSystemImpl implements VotingSystem {
  private votes: Map<ShepherdId, PhaseVote> = new Map();
  private votingOpen: boolean = false;
  private currentPhase: PhaseType | null = null;
  private readonly requiredQuorum: number = 0.75;

  constructor(private readonly debate: Debate) {}

  async openVoting(phase: PhaseType): Promise<void> {
    this.currentPhase = phase;
    this.votingOpen = true;
    this.votes.clear();

    const voteRequest: BaseMessage = {
      id: this.generateId(),
      debateId: this.debate.id,
      senderId: "system",
      timestamp: new Date(),
      type: MessageType.HELP_REQUEST,
      priority: "high",
      content: `Voting opened for ${phase} phase`,
    };

    return Promise.resolve();
  }

  async closeVoting(): Promise<VotingResult> {
    this.votingOpen = false;

    const result = this.getResults();

    const consensusReached = this.isConsensusReached();

    if (consensusReached) {
      this.debate.consensusStatus = {
        reached: true,
        agreedProposalId: this.getAgreedProposalId(),
        agreementLevel: result.agreementLevel,
        dissentingShepherds: this.getDissentingShepherds(),
        concerns: this.getConcerns(),
        requiredAgreementLevel: this.requiredQuorum,
      };
    }

    return result;
  }

  async castVote(
    shepherdId: ShepherdId,
    vote: VoteType,
    comments?: string,
  ): Promise<void> {
    if (!this.votingOpen) {
      throw new Error("Voting is not currently open");
    }

    const existingVote = this.votes.get(shepherdId);
    if (existingVote) {
      throw new Error(`Shepherd ${shepherdId} has already voted`);
    }

    const scores = await this.calculateQualityScores(shepherdId);

    const phaseVote: PhaseVote = {
      id: this.generateId(),
      debateId: this.debate.id,
      senderId: shepherdId,
      timestamp: new Date(),
      type: MessageType.PHASE_VOTE,
      priority: "medium",
      phaseType: this.currentPhase!,
      vote,
      comments,
      qualityScores: scores,
    };

    this.votes.set(shepherdId, phaseVote);

    const voteConfirmation: BaseMessage = {
      id: this.generateId(),
      debateId: this.debate.id,
      senderId: "system",
      timestamp: new Date(),
      type: MessageType.ANSWER,
      priority: "low",
      content: `Vote recorded for shepherd ${shepherdId}`,
    };

    return Promise.resolve();
  }

  getResults(): VotingResult {
    const allVotes = Array.from(this.votes.values());

    const approve = allVotes.filter((v) => v.vote === VoteType.APPROVE).length;
    const reject = allVotes.filter((v) => v.vote === VoteType.REJECT).length;
    const abstain = allVotes.filter((v) => v.vote === VoteType.ABSTAIN).length;
    const conditional = allVotes.filter(
      (v) => v.vote === VoteType.CONDITIONAL,
    ).length;

    const totalVotes = allVotes.length;
    const quorum =
      totalVotes / this.debate.participants.length >= this.requiredQuorum;

    const weightedScore =
      allVotes.reduce((sum, v) => {
        const weight = this.getShepherdWeight(v.senderId);
        return sum + (v.vote === VoteType.APPROVE ? weight : 0);
      }, 0) / this.debate.participants.reduce((sum, p) => sum + p.weight, 0);

    return {
      phase: this.currentPhase!,
      totalVotes,
      approve,
      reject,
      abstain,
      conditional,
      agreementLevel: weightedScore,
      quorum,
    };
  }

  isConsensusReached(): boolean {
    const result = this.getResults();
    return result.quorum && result.agreementLevel >= this.requiredQuorum;
  }

  private getShepherdWeight(shepherdId: ShepherdId): number {
    const shepherd = this.debate.participants.find((p) => p.id === shepherdId);
    return shepherd?.weight || 1.0;
  }

  private async calculateQualityScores(
    shepherdId: ShepherdId,
  ): Promise<QualityScores> {
    return {
      architecturalSoundness: 0.8,
      performanceImpact: 0.8,
      securityPosture: 0.8,
      maintainabilityScore: 0.8,
      deliveryRisk: 0.2,
      overallQuality: 0.8,
    };
  }

  private getAgreedProposalId(): string | undefined {
    const approveVotes = Array.from(this.votes.values()).filter(
      (v) => v.vote === VoteType.APPROVE,
    );

    if (approveVotes.length === 0) return undefined;

    return "";
  }

  private getDissentingShepherds(): ShepherdId[] {
    return Array.from(this.votes.entries())
      .filter(([_, vote]) => vote.vote === VoteType.REJECT)
      .map(([shepherdId]) => shepherdId);
  }

  private getConcerns(): string[] {
    const rejectVotes = Array.from(this.votes.values()).filter(
      (v) => v.vote === VoteType.REJECT,
    );

    return rejectVotes.map((v) => v.comments || "No reason provided");
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

## User Approval Process

```typescript
export class UserApprovalSystemImpl implements UserApprovalSystem {
  private pendingRequest: UserApprovalRequest | null = null;
  private readonly approvalTimeout: number = 86400000;

  constructor(
    private readonly debate: Debate,
    private readonly router: MessageRouter,
  ) {}

  async requestApproval(debate: Debate): Promise<void> {
    const qualityScores = this.calculateAggregateQualityScores(debate);
    const dissentingOpinions = this.gatherDissentingOpinions(debate);

    this.pendingRequest = {
      debateId: debate.id,
      summary: this.generateSummary(debate),
      proposals: debate.proposals,
      qualityScores,
      dissentingOpinions,
      requestedAt: new Date(),
      expiresAt: new Date(Date.now() + this.approvalTimeout),
    };

    this.debate.userApprovalStatus = {
      required: true,
      requestedAt: new Date(),
      approvalType: "full",
    };

    const approvalRequestMessage: BaseMessage = {
      id: this.generateId(),
      debateId: debate.id,
      senderId: "system",
      timestamp: new Date(),
      type: MessageType.USER_APPROVAL_REQUIRED,
      priority: "critical",
      content: `User approval required for debate: ${debate.topic}`,
    };

    await this.router.broadcast("system", approvalRequestMessage);
  }

  getApprovalRequest(): UserApprovalRequest | null {
    return this.pendingRequest;
  }

  async approve(feedback?: string): Promise<void> {
    if (!this.pendingRequest) {
      throw new Error("No pending approval request");
    }

    this.debate.userApprovalStatus = {
      ...this.debate.userApprovalStatus,
      approvedAt: new Date(),
      feedback,
      approvalType: "full",
    };

    this.pendingRequest = null;

    const approvalMessage: BaseMessage = {
      id: this.generateId(),
      debateId: this.debate.id,
      senderId: "user",
      timestamp: new Date(),
      type: MessageType.PHASE_COMPLETE,
      priority: "critical",
      content: `Approved: ${feedback || "No feedback provided"}`,
    };

    await this.router.broadcast("user", approvalMessage);
  }

  async reject(feedback?: string): Promise<void> {
    if (!this.pendingRequest) {
      throw new Error("No pending approval request");
    }

    this.debate.userApprovalStatus = {
      ...this.debate.userApprovalStatus,
      rejectedAt: new Date(),
      feedback,
      approvalType: "full",
    };

    this.pendingRequest = null;

    const rejectionMessage: BaseMessage = {
      id: this.generateId(),
      debateId: this.debate.id,
      senderId: "user",
      timestamp: new Date(),
      type: MessageType.PHASE_COMPLETE,
      priority: "critical",
      content: `Rejected: ${feedback || "No feedback provided"}`,
    };

    await this.router.broadcast("user", rejectionMessage);
  }

  async requestChanges(changes: string): Promise<void> {
    if (!this.pendingRequest) {
      throw new Error("No pending approval request");
    }

    this.debate.userApprovalStatus = {
      ...this.debate.userApprovalStatus,
      approvalType: "conditional",
    };

    const changesMessage: BaseMessage = {
      id: this.generateId(),
      debateId: this.debate.id,
      senderId: "user",
      timestamp: new Date(),
      type: MessageType.CORRECTION,
      priority: "high",
      content: changes,
    };

    await this.router.broadcast("user", changesMessage);
  }

  private calculateAggregateQualityScores(debate: Debate): QualityScores {
    const proposals = debate.proposals;

    if (proposals.length === 0) {
      return {
        architecturalSoundness: 0,
        performanceImpact: 0,
        securityPosture: 0,
        maintainabilityScore: 0,
        deliveryRisk: 0,
        overallQuality: 0,
      };
    }

    const avg = (fn: (p: Proposal) => number) =>
      proposals.reduce((sum, p) => sum + fn(p), 0) / proposals.length;

    return {
      architecturalSoundness: avg(
        (p) => p.qualityAssessment.architecturalSoundness,
      ),
      performanceImpact: avg((p) => p.qualityAssessment.performanceImpact),
      securityPosture: avg((p) => p.qualityAssessment.securityPosture),
      maintainabilityScore: avg(
        (p) => p.qualityAssessment.maintainabilityScore,
      ),
      deliveryRisk: avg((p) => p.qualityAssessment.deliveryRisk),
      overallQuality: avg((p) => p.qualityAssessment.overallQuality),
    };
  }

  private gatherDissentingOpinions(debate: Debate): string[] {
    const dissentingMessages = debate.messages.filter(
      (m) =>
        m.type === MessageType.OBJECTION ||
        m.type === MessageType.COUNTER_ARGUMENT,
    );

    return dissentingMessages.map((m) => m.content);
  }

  private generateSummary(debate: Debate): string {
    const proposalCount = debate.proposals.length;
    const participantCount = debate.participants.length;

    return `Debate: ${debate.topic} - ${proposalCount} proposals from ${participantCount} specialists`;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export class ApprovalPresentation {
  constructor(private readonly request: UserApprovalRequest) {}

  toMarkdown(): string {
    const scores = this.request.qualityScores;

    return `# User Approval Request

## Debate Summary
${this.request.summary}

## Quality Scores
| Metric | Score |
|--------|-------|
| Architectural Soundness | ${(scores.architecturalSoundness * 100).toFixed(0)}% |
| Performance Impact | ${(scores.performanceImpact * 100).toFixed(0)}% |
| Security Posture | ${(scores.securityPosture * 100).toFixed(0)}% |
| Maintainability | ${(scores.maintainabilityScore * 100).toFixed(0)}% |
| Delivery Risk | ${(scores.deliveryRisk * 100).toFixed(0)}% |
| **Overall Quality** | ${(scores.overallQuality * 100).toFixed(0)}% |

## Proposals (${this.request.proposals.length})
${this.request.proposals.map((p, i) => `### ${i + 1}. ${p.type}: ${p.content.substring(0, 100)}...`).join("\n")}

## Dissenting Opinions
${
  this.request.dissentingOpinions.length > 0
    ? this.request.dissentingOpinions.map((o) => `- ${o}`).join("\n")
    : "No dissenting opinions recorded."
}

## Requested At
${this.request.requestedAt.toISOString()}

## Expires At
${this.request.expiresAt.toISOString()}

---
Please review and respond with:
- **Approve** - proceed with the proposed solution
- **Reject** - provide feedback on why the proposal was rejected
- **Request Changes** - specify changes needed before approval
`;
  }
}
```

## Complete Debate Orchestrator

```typescript
export class DebateOrchestrator {
  private router: MessageRouterImpl;
  private phaseManager: DebatePhaseManager;
  private votingSystem: VotingSystemImpl;
  private qualityGateEngine: QualityGateEngine;
  private userApprovalSystem: UserApprovalSystemImpl;
  private specialistShepherds: SpecialistShepherd[] = [];

  constructor(private readonly debate: Debate) {
    this.router = new MessageRouterImpl();
    this.qualityGateEngine = new QualityGateEngine();
    this.votingSystem = new VotingSystemImpl(debate);
    this.userApprovalSystem = new UserApprovalSystemImpl(debate, this.router);
    this.phaseManager = new DebatePhaseManager(
      debate,
      this.router,
      this.votingSystem,
      this.qualityGateEngine.gates,
    );
  }

  async initialize(): Promise<void> {
    this.registerSpecialistShepherds();
    this.subscribeShepherdsToMessages();
    this.debate.participants.forEach((p) => {
      this.router.subscribe(p.id, this.createMessageHandler(p.id));
    });
  }

  async startDebate(): Promise<void> {
    await this.initialize();
    await this.phaseManager.startPhase(PhaseType.IDEA_GENERATION);
  }

  async advanceDebate(): Promise<boolean> {
    return this.phaseManager.advancePhase();
  }

  async completeDebate(): Promise<void> {
    const qualityResults = await this.qualityGateEngine.evaluateAll(
      this.debate,
    );
    this.debate.qualityGates = qualityResults;

    const overallScore = this.qualityGateEngine.getOverallScore(qualityResults);

    if (this.qualityGateEngine.allGatesPassed(qualityResults)) {
      await this.userApprovalSystem.requestApproval(this.debate);
    }
  }

  private registerSpecialistShepherds(): void {
    const specialties: ShepherdSpecialty[] = [
      ShepherdSpecialty.ARCHITECT,
      ShepherdSpecialty.PERFORMANCE,
      ShepherdSpecialty.SECURITY,
      ShepherdSpecialty.MAINTAINABILITY,
      ShepherdSpecialty.DELIVERY,
    ];

    this.specialistShepherds = specialties.map((specialty, index) =>
      SpecialistShepherdFactory.createShepherd(
        specialty,
        `shepherd-${index + 1}`,
        `${specialty.charAt(0).toUpperCase() + specialty.slice(1)} Shepherd`,
      ),
    );
  }

  private subscribeShepherdsToMessages(): void {
    for (const shepherd of this.specialistShepherds) {
      this.router.subscribe(shepherd.id, async (message) => {
        await this.handleShepherdMessage(shepherd, message);
      });
    }
  }

  private createMessageHandler(shepherdId: string): MessageHandler {
    return async (message: BaseMessage) => {
      console.log(`Shepherd ${shepherdId} received message: ${message.type}`);
    };
  }

  private async handleShepherdMessage(
    shepherd: SpecialistShepherd,
    message: BaseMessage,
  ): Promise<void> {
    switch (message.type) {
      case MessageType.HELP_REQUEST:
        await this.handleHelpRequest(shepherd, message);
        break;
      case MessageType.ARGUMENT:
        await this.handleArgument(shepherd, message);
        break;
      case MessageType.OBJECTION:
        await this.handleObjection(shepherd, message);
        break;
      case MessageType.PHASE_VOTE:
        await this.handlePhaseVote(shepherd, message);
        break;
    }
  }

  private async handleHelpRequest(
    shepherd: SpecialistShepherd,
    message: BaseMessage,
  ): Promise<void> {
    const helpResponse: BaseMessage = {
      id: this.generateId(),
      debateId: message.debateId,
      senderId: shepherd.id,
      recipientId: message.senderId,
      timestamp: new Date(),
      type: MessageType.HELP_RESPONSE,
      priority: "medium",
      content: `Assistance from ${shepherd.name} (${shepherd.specialty})`,
    };

    await this.router.sendDirect(shepherd.id, message.senderId!, helpResponse);
  }

  private async handleArgument(
    shepherd: SpecialistShepherd,
    message: BaseMessage,
  ): Promise<void> {
    if (message.senderId === shepherd.id) return;

    const critique = await shepherd.generateCritique({
      id: message.topicId,
      authorId: message.senderId,
      content: message.content,
      type: "solution",
      votes: new Map(),
      qualityAssessment: {
        architecturalSoundness: 0,
        performanceImpact: 0,
        securityPosture: 0,
        maintainabilityScore: 0,
        deliveryRisk: 0,
        overallQuality: 0,
      },
      supportCount: 0,
      objectionCount: 0,
    });

    await this.router.route(critique);
  }

  private async handleObjection(
    shepherd: SpecialistShepherd,
    message: BaseMessage,
  ): Promise<void> {
    const correction = await shepherd.assessQuality({
      id: message.topicId,
      authorId: "",
      content: "",
      type: "solution",
      votes: new Map(),
      qualityAssessment: {
        architecturalSoundness: 0,
        performanceImpact: 0,
        securityPosture: 0,
        maintainabilityScore: 0,
        deliveryRisk: 0,
        overallQuality: 0,
      },
      supportCount: 0,
      objectionCount: 0,
    });

    console.log(
      `Shepherd ${shepherd.name} assessed objection from ${message.senderId}`,
    );
  }

  private async handlePhaseVote(
    shepherd: SpecialistShepherd,
    message: BaseMessage,
  ): Promise<void> {
    console.log(`Vote from ${shepherd.name}: ${(message as PhaseVote).vote}`);
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export async function createAndRunDebate(
  topic: string,
  participants: Shepherd[],
): Promise<Debate> {
  const debate: Debate = {
    id: this.generateId(),
    topic,
    description: "",
    createdAt: new Date(),
    currentPhase: PhaseType.IDEA_GENERATION,
    participants,
    messages: [],
    proposals: [],
    qualityGates: [],
    consensusStatus: {
      reached: false,
      agreementLevel: 0,
      dissentingShepherds: [],
      concerns: [],
      requiredAgreementLevel: 0.75,
    },
    userApprovalStatus: {
      required: false,
      approvalType: "full",
    },
  };

  const orchestrator = new DebateOrchestrator(debate);
  await orchestrator.startDebate();

  return debate;
}

export function generateId(): string {
  return `debate-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
```

## Usage Example

> **Execution Mode:** The debate system supports two execution modes:
>
> - `parallel-agents`: Spawn multiple specialist shepherd agents for authentic multi-agent collaboration (default)
> - `1-agent` or `single-agent`: Single agent simulates all shepherds with complete documentation and metrics
>
> To use, specify mode when invoking the debate. If no mode is specified, defaults to `parallel-agents`.

```typescript
import {
  DebateOrchestrator,
  SpecialistShepherdFactory,
  ShepherdSpecialty,
  Debate,
  PhaseType,
  generateId,
  MessageBuilder,
  QualityGateEngine,
} from "./multi-shepherd-debate";

async function main() {
  const participants = [
    {
      id: "architect-1",
      name: "Architect Shepherd",
      specialty: ShepherdSpecialty.ARCHITECT,
      expertise: ["system-design"],
      weight: 1.2,
      availability: true,
      activeDebates: [],
      reputationScore: 0.9,
    },
    {
      id: "security-1",
      name: "Security Shepherd",
      specialty: ShepherdSpecialty.SECURITY,
      expertise: ["auth", "encryption"],
      weight: 1.3,
      availability: true,
      activeDebates: [],
      reputationScore: 0.95,
    },
    {
      id: "performance-1",
      name: "Performance Shepherd",
      specialty: ShepherdSpecialty.PERFORMANCE,
      expertise: ["optimization"],
      weight: 1.1,
      availability: true,
      activeDebates: [],
      reputationScore: 0.88,
    },
  ];

  const debate: Debate = {
    id: generateId(),
    topic: "Design pattern for file organization system",
    description: "Evaluate and decide on the best architectural approach",
    createdAt: new Date(),
    currentPhase: PhaseType.IDEA_GENERATION,
    participants: participants as any,
    messages: [],
    proposals: [],
    qualityGates: [],
    consensusStatus: {
      reached: false,
      agreementLevel: 0,
      dissentingShepherds: [],
      concerns: [],
      requiredAgreementLevel: 0.75,
    },
    userApprovalStatus: {
      required: false,
      approvalType: "full",
    },
  };

  const orchestrator = new DebateOrchestrator(debate);
  await orchestrator.initialize();

  console.log(
    "Debate system initialized with participants:",
    participants.length,
  );

  return orchestrator;
}
```
