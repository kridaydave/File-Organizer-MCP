/**
 * @file timeboxing-conflicts.ts
 * @brief Time Boxing and Structured Conflict Resolution for Multi-Shepherd Debate System
 * @version 1.0.0
 * @module debate/timeboxing-conflicts
 */

export enum ConflictType {
  ARCHITECTURAL = "architectural",
  PERFORMANCE = "performance",
  SECURITY = "security",
  PRIORITY = "priority",
  SCOPE = "scope",
}

export type ShepherdSpecialty =
  | "security"
  | "performance"
  | "scalability"
  | "usability"
  | "maintainability"
  | "cost"
  | "reliability"
  | "compliance"
  | "general"
  | "architect"
  | "performance_engineer"
  | "security_expert"
  | "product_owner";

export interface Debate {
  id: string;
  topic: string;
  participants: string[];
  proposals: unknown[];
  status: "pending" | "active" | "completed";
  createdAt: Date;
  metadata: Record<string, unknown>;
}

export interface ConflictPosition {
  position: string;
  evidence: string[];
  implications: string[];
  shepherdId: string;
}

export interface ConflictResolution {
  resolvedPosition: string;
  compromises: string[];
  reasoning: string;
  timestamp: Date;
  decidedBy: string;
}

export interface ResolutionMethod {
  type: "vote" | "data" | "expert" | "escalate";
  criteria: string[];
  dataRequired?: string[];
  expertRole?: ShepherdSpecialty;
}

export type ResolutionWorkflow = Partial<
  Record<ConflictType, ResolutionMethod[]>
>;

export const RESOLUTION_WORKFLOW: ResolutionWorkflow = {
  [ConflictType.ARCHITECTURAL]: [
    {
      type: "data",
      criteria: ["system_coherence", "scalability", "maintainability"],
    },
    {
      type: "expert",
      criteria: ["technical_expertise"],
      expertRole: "architect",
    },
    { type: "vote", criteria: ["majority_agreement", "expertise_weighted"] },
  ],
  [ConflictType.PERFORMANCE]: [
    {
      type: "data",
      criteria: ["benchmark_results", "latency_metrics", "throughput"],
    },
    {
      type: "expert",
      criteria: ["performance_analysis"],
      expertRole: "performance_engineer",
    },
    { type: "vote", criteria: ["majority_agreement"] },
  ],
  [ConflictType.SECURITY]: [
    {
      type: "data",
      criteria: ["vulnerability_assessment", "compliance_check"],
    },
    {
      type: "expert",
      criteria: ["security_expertise"],
      expertRole: "security_expert",
    },
    { type: "escalate", criteria: ["requires_steering_committee"] },
  ],
  [ConflictType.PRIORITY]: [
    { type: "vote", criteria: ["impact_alignment", "resource_availability"] },
    {
      type: "expert",
      criteria: ["strategic_planning"],
      expertRole: "product_owner",
    },
  ],
  [ConflictType.SCOPE]: [
    { type: "vote", criteria: ["scope_boundaries", "deliverable_clarity"] },
    { type: "data", criteria: ["resource_requirements", "timeline_analysis"] },
    { type: "escalate", criteria: ["requires_product_approval"] },
  ],
};

export interface PhaseTimeBox {
  ideaGeneration: {
    minDuration: number;
    maxDuration: number;
    autoExtend: boolean;
    extensionLimit: number;
  };
  crossValidation: {
    minDuration: number;
    maxDuration: number;
    perProposal: number;
  };
  conflictResolution: {
    minDuration: number;
    maxDuration: number;
    perConflict: number;
  };
  consensus: {
    minDuration: number;
    maxDuration: number;
    votingRoundLimit: number;
  };
}

export interface StructuredConflict {
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

export type DebatePhase =
  | "ideaGeneration"
  | "crossValidation"
  | "conflictResolution"
  | "consensus";

interface PhaseTimer {
  phase: DebatePhase;
  startTime: Date;
  endTime: Date;
  isPaused: boolean;
  extensions: number;
}

interface ConflictLog {
  conflictId: string;
  timestamp: Date;
  action: string;
  details: string;
  performedBy: string;
}

export class TimeBoxManager {
  private timers: Map<DebatePhase, PhaseTimer> = new Map();
  private currentPhase: DebatePhase | null = null;
  private timeBoxConfig: PhaseTimeBox;
  private debateId: string;

  constructor(timeBoxConfig: PhaseTimeBox, debateId: string) {
    this.timeBoxConfig = timeBoxConfig;
    this.debateId = debateId;
  }

  startPhaseTimer(phase: DebatePhase, debate: Debate): PhaseTimer {
    if (this.timers.has(phase)) {
      throw new Error(`Timer for phase '${phase}' is already running`);
    }

    const now = new Date();
    const maxDuration = this.timeBoxConfig[phase].maxDuration;
    const endTime = new Date(now.getTime() + maxDuration * 1000);

    const timer: PhaseTimer = {
      phase,
      startTime: now,
      endTime,
      isPaused: false,
      extensions: 0,
    };

    this.timers.set(phase, timer);
    this.currentPhase = phase;

    return timer;
  }

  checkTimeout(phase: DebatePhase): {
    isTimedOut: boolean;
    elapsedSeconds: number;
    remainingSeconds: number;
    extensionsUsed: number;
  } {
    const timer = this.timers.get(phase);

    if (!timer) {
      throw new Error(`No timer found for phase '${phase}'`);
    }

    const now = new Date();
    const elapsedMs = now.getTime() - timer.startTime.getTime();
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    const remainingMs = timer.endTime.getTime() - now.getTime();
    const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));

    return {
      isTimedOut: remainingSeconds <= 0,
      elapsedSeconds,
      remainingSeconds,
      extensionsUsed: timer.extensions,
    };
  }

  requestExtension(
    phase: DebatePhase,
    reason: string,
  ): {
    granted: boolean;
    newEndTime: Date | null;
    reason: string;
  } {
    const timer = this.timers.get(phase);

    if (!timer) {
      throw new Error(`No timer found for phase '${phase}'`);
    }

    const phaseConfig = this.timeBoxConfig[phase];

    if (!("autoExtend" in phaseConfig) || !phaseConfig.autoExtend) {
      return {
        granted: false,
        newEndTime: null,
        reason: "Auto-extend disabled for this phase",
      };
    }

    const extensionLimit =
      "extensionLimit" in phaseConfig ? phaseConfig.extensionLimit : 0;

    if (timer.extensions >= extensionLimit) {
      return {
        granted: false,
        newEndTime: null,
        reason: "Extension limit reached",
      };
    }

    const extensionSeconds = 300;
    timer.endTime = new Date(timer.endTime.getTime() + extensionSeconds * 1000);
    timer.extensions++;

    return {
      granted: true,
      newEndTime: timer.endTime,
      reason,
    };
  }

  pausePhaseTimer(phase: DebatePhase): void {
    const timer = this.timers.get(phase);

    if (!timer) {
      throw new Error(`No timer found for phase '${phase}'`);
    }

    if (timer.isPaused) {
      throw new Error(`Timer for phase '${phase}' is already paused`);
    }

    timer.isPaused = true;
  }

  resumePhaseTimer(phase: DebatePhase): void {
    const timer = this.timers.get(phase);

    if (!timer) {
      throw new Error(`No timer found for phase '${phase}'`);
    }

    if (!timer.isPaused) {
      throw new Error(`Timer for phase '${phase}' is not paused`);
    }

    timer.isPaused = false;
  }

  endPhaseTimer(phase: DebatePhase): {
    duration: number;
    wasExtended: boolean;
  } {
    const timer = this.timers.get(phase);

    if (!timer) {
      throw new Error(`No timer found for phase '${phase}'`);
    }

    const duration = Math.floor(
      (new Date().getTime() - timer.startTime.getTime()) / 1000,
    );
    const wasExtended = timer.extensions > 0;

    this.timers.delete(phase);

    if (this.currentPhase === phase) {
      this.currentPhase = null;
    }

    return { duration, wasExtended };
  }

  getCurrentPhaseStatus(): {
    currentPhase: DebatePhase | null;
    timersCount: number;
  } {
    return {
      currentPhase: this.currentPhase,
      timersCount: this.timers.size,
    };
  }
}

export class ConflictManager {
  private conflicts: Map<string, StructuredConflict> = new Map();
  private conflictLogs: ConflictLog[] = [];
  private resolutionWorkflow: ResolutionWorkflow;

  constructor(resolutionWorkflow?: ResolutionWorkflow) {
    this.resolutionWorkflow = resolutionWorkflow || RESOLUTION_WORKFLOW;
  }

  registerConflict(
    conflict: Omit<StructuredConflict, "id">,
  ): StructuredConflict {
    const id = `conflict-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const registeredConflict: StructuredConflict = {
      ...conflict,
      id,
    };

    this.conflicts.set(id, registeredConflict);

    this.logConflictAction(
      id,
      "registered",
      "Conflict registered in system",
      "system",
    );

    return registeredConflict;
  }

  resolveConflict(
    conflictId: string,
    method: ResolutionMethod,
    decidedBy: string,
  ): StructuredConflict {
    const conflict = this.conflicts.get(conflictId);

    if (!conflict) {
      throw new Error(`Conflict with ID '${conflictId}' not found`);
    }

    if (conflict.resolution) {
      throw new Error(`Conflict '${conflictId}' is already resolved`);
    }

    const resolution = this.applyResolutionMethod(conflict, method, decidedBy);

    const updatedConflict: StructuredConflict = {
      ...conflict,
      resolution,
      resolutionMethod: method,
      outcome: this.determineOutcome(conflict, resolution),
    };

    this.conflicts.set(conflictId, updatedConflict);

    this.logConflictAction(
      conflictId,
      "resolved",
      `Resolved using ${method.type} method`,
      decidedBy,
    );

    return updatedConflict;
  }

  escalateConflict(conflictId: string, escalateTo: string): StructuredConflict {
    const conflict = this.conflicts.get(conflictId);

    if (!conflict) {
      throw new Error(`Conflict with ID '${conflictId}' not found`);
    }

    if (conflict.resolution) {
      throw new Error(`Conflict '${conflictId}' is already resolved`);
    }

    const escalationResolution: ConflictResolution = {
      resolvedPosition: `Escalated to ${escalateTo}`,
      compromises: [],
      reasoning: `Conflict escalated to ${escalateTo} for resolution`,
      timestamp: new Date(),
      decidedBy: escalateTo,
    };

    const updatedConflict: StructuredConflict = {
      ...conflict,
      resolution: escalationResolution,
      resolutionMethod: { type: "escalate", criteria: ["escalation_required"] },
      outcome: "compromised",
    };

    this.conflicts.set(conflictId, updatedConflict);

    this.logConflictAction(
      conflictId,
      "escalated",
      `Escalated to ${escalateTo}`,
      "system",
    );

    return updatedConflict;
  }

  getResolutionMethods(type: ConflictType): ResolutionMethod[] {
    return this.resolutionWorkflow[type] || [];
  }

  getConflict(conflictId: string): StructuredConflict | undefined {
    return this.conflicts.get(conflictId);
  }

  getUnresolvedConflicts(): StructuredConflict[] {
    const unresolved: StructuredConflict[] = [];

    this.conflicts.forEach((conflict) => {
      if (!conflict.resolution) {
        unresolved.push(conflict);
      }
    });

    return unresolved;
  }

  getConflictsByType(type: ConflictType): StructuredConflict[] {
    const filtered: StructuredConflict[] = [];

    this.conflicts.forEach((conflict) => {
      if (conflict.type === type) {
        filtered.push(conflict);
      }
    });

    return filtered;
  }

  getConflictLogs(): ConflictLog[] {
    return [...this.conflictLogs];
  }

  private applyResolutionMethod(
    conflict: StructuredConflict,
    method: ResolutionMethod,
    decidedBy: string,
  ): ConflictResolution {
    switch (method.type) {
      case "vote":
        return this.resolveByVote(conflict, decidedBy);
      case "data":
        return this.resolveByData(
          conflict,
          method.dataRequired || [],
          decidedBy,
        );
      case "expert":
        return this.resolveByExpert(
          conflict,
          method.expertRole || "general",
          decidedBy,
        );
      case "escalate":
        return this.resolveByEscalation(conflict, decidedBy);
      default:
        throw new Error(
          `Unknown resolution method type: ${(method as ResolutionMethod).type}`,
        );
    }
  }

  private resolveByVote(
    conflict: StructuredConflict,
    decidedBy: string,
  ): ConflictResolution {
    const positionAScore = conflict.positionA.evidence.length + 1;
    const positionBScore = conflict.positionB.evidence.length + 1;

    const winningPosition =
      positionAScore >= positionBScore
        ? conflict.positionA.position
        : conflict.positionB.position;

    return {
      resolvedPosition: winningPosition,
      compromises:
        positionAScore === positionBScore
          ? [conflict.positionA.position, conflict.positionB.position]
          : [],
      reasoning: `Resolved by majority vote. Position ${winningPosition === conflict.positionA.position ? "A" : "B"} had stronger evidence.`,
      timestamp: new Date(),
      decidedBy,
    };
  }

  private resolveByData(
    conflict: StructuredConflict,
    dataRequired: string[],
    decidedBy: string,
  ): ConflictResolution {
    const positionADataScore = conflict.positionA.evidence.filter((e) =>
      dataRequired.some((req) => e.toLowerCase().includes(req.toLowerCase())),
    ).length;

    const positionBDataScore = conflict.positionB.evidence.filter((e) =>
      dataRequired.some((req) => e.toLowerCase().includes(req.toLowerCase())),
    ).length;

    const winningPosition =
      positionADataScore >= positionBDataScore
        ? conflict.positionA.position
        : conflict.positionB.position;

    return {
      resolvedPosition: winningPosition,
      compromises:
        positionADataScore === positionBDataScore
          ? [conflict.positionA.position, conflict.positionB.position]
          : [],
      reasoning: `Resolved based on data analysis. Position A data relevance: ${positionADataScore}, Position B data relevance: ${positionBDataScore}`,
      timestamp: new Date(),
      decidedBy,
    };
  }

  private resolveByExpert(
    conflict: StructuredConflict,
    expertRole: ShepherdSpecialty,
    decidedBy: string,
  ): ConflictResolution {
    return {
      resolvedPosition: conflict.positionA.position,
      compromises: [conflict.positionB.position],
      reasoning: `Resolved by expert with role ${expertRole} based on domain expertise`,
      timestamp: new Date(),
      decidedBy,
    };
  }

  private resolveByEscalation(
    conflict: StructuredConflict,
    decidedBy: string,
  ): ConflictResolution {
    return {
      resolvedPosition: "Pending escalation resolution",
      compromises: [conflict.positionA.position, conflict.positionB.position],
      reasoning: "Conflict escalated to higher authority for resolution",
      timestamp: new Date(),
      decidedBy,
    };
  }

  private determineOutcome(
    conflict: StructuredConflict,
    resolution: ConflictResolution,
  ): "accepted" | "rejected" | "compromised" {
    if (resolution.compromises.length > 1) {
      return "compromised";
    }

    if (resolution.resolvedPosition === conflict.positionA.position) {
      return "accepted";
    }

    return "rejected";
  }

  private logConflictAction(
    conflictId: string,
    action: string,
    details: string,
    performedBy: string,
  ): void {
    this.conflictLogs.push({
      conflictId,
      timestamp: new Date(),
      action,
      details,
      performedBy,
    });
  }
}

export class ConflictResolutionWorkflow {
  private timeBoxManager: TimeBoxManager;
  private conflictManager: ConflictManager;
  private activeDebate: Debate | null = null;
  private workflowHistory: Array<{
    step: string;
    timestamp: Date;
    details: string;
  }> = [];

  constructor(
    timeBoxConfig: PhaseTimeBox,
    debateId: string,
    resolutionWorkflow?: ResolutionWorkflow,
  ) {
    this.timeBoxManager = new TimeBoxManager(timeBoxConfig, debateId);
    this.conflictManager = new ConflictManager(resolutionWorkflow);
  }

  initializeWorkflow(debate: Debate): void {
    this.activeDebate = debate;
    this.logWorkflowStep(
      "workflow_initialized",
      `Workflow initialized for debate ${debate.id}`,
    );
  }

  executeWorkflow(conflicts: Omit<StructuredConflict, "id">[]): {
    resolved: StructuredConflict[];
    escalated: StructuredConflict[];
    failed: StructuredConflict[];
  } {
    if (!this.activeDebate) {
      throw new Error(
        "Workflow not initialized. Call initializeWorkflow first.",
      );
    }

    this.logWorkflowStep(
      "workflow_execution_started",
      `Resolving ${conflicts.length} conflicts`,
    );

    const resolved: StructuredConflict[] = [];
    const escalated: StructuredConflict[] = [];
    const failed: StructuredConflict[] = [];

    for (const conflictInput of conflicts) {
      try {
        const registeredConflict =
          this.conflictManager.registerConflict(conflictInput);

        const methods = this.conflictManager.getResolutionMethods(
          registeredConflict.type,
        );

        if (methods.length === 0) {
          const escalatedConflict = this.conflictManager.escalateConflict(
            registeredConflict.id,
            "steering_committee",
          );
          escalated.push(escalatedConflict);
          continue;
        }

        let resultConflict: StructuredConflict | null = null;

        for (const method of methods) {
          if (method.type === "escalate") {
            resultConflict = this.conflictManager.escalateConflict(
              registeredConflict.id,
              "higher_authority",
            );
            escalated.push(resultConflict);
            break;
          }

          try {
            resultConflict = this.conflictManager.resolveConflict(
              registeredConflict.id,
              method,
              "workflow_orchestrator",
            );
            break;
          } catch {
            continue;
          }
        }

        if (resultConflict) {
          resolved.push(resultConflict);
        } else {
          failed.push(registeredConflict);
        }
      } catch {
        failed.push(conflictInput as StructuredConflict);
      }
    }

    this.logWorkflowStep(
      "workflow_execution_completed",
      `Resolved: ${resolved.length}, Escalated: ${escalated.length}, Failed: ${failed.length}`,
    );

    return { resolved, escalated, failed };
  }

  startPhase(phase: DebatePhase): void {
    if (!this.activeDebate) {
      throw new Error(
        "Workflow not initialized. Call initializeWorkflow first.",
      );
    }

    const timer = this.timeBoxManager.startPhaseTimer(phase, this.activeDebate);
    this.logWorkflowStep(
      "phase_started",
      `Phase ${phase} started at ${timer.startTime.toISOString()}`,
    );
  }

  endPhase(phase: DebatePhase): void {
    const result = this.timeBoxManager.endPhaseTimer(phase);
    this.logWorkflowStep(
      "phase_ended",
      `Phase ${phase} ended after ${result.duration}s, Extended: ${result.wasExtended}`,
    );
  }

  monitorPhaseProgress(phase: DebatePhase): {
    isRunning: boolean;
    timeoutStatus: ReturnType<TimeBoxManager["checkTimeout"]>;
    timeBoxConfig: { minDuration: number; maxDuration: number };
  } {
    const timeoutStatus = this.timeBoxManager.checkTimeout(phase);
    const timeBoxConfig = this.timeBoxManager["timeBoxConfig"][phase] as {
      minDuration: number;
      maxDuration: number;
    };

    return {
      isRunning: timeoutStatus.remainingSeconds > 0,
      timeoutStatus,
      timeBoxConfig,
    };
  }

  getAllConflicts(): StructuredConflict[] {
    return Array.from(this.conflictManager["conflicts"].values());
  }

  getUnresolvedConflicts(): StructuredConflict[] {
    return this.conflictManager.getUnresolvedConflicts();
  }

  getWorkflowHistory(): Array<{
    step: string;
    timestamp: Date;
    details: string;
  }> {
    return [...this.workflowHistory];
  }

  private logWorkflowStep(step: string, details: string): void {
    this.workflowHistory.push({
      step,
      timestamp: new Date(),
      details,
    });
  }
}

function demonstrateTimeBoxingAndConflicts(): void {
  const timeBoxConfig: PhaseTimeBox = {
    ideaGeneration: {
      minDuration: 300,
      maxDuration: 1800,
      autoExtend: true,
      extensionLimit: 2,
    },
    crossValidation: {
      minDuration: 600,
      maxDuration: 3600,
      perProposal: 300,
    },
    conflictResolution: {
      minDuration: 900,
      maxDuration: 5400,
      perConflict: 1200,
    },
    consensus: {
      minDuration: 300,
      maxDuration: 1800,
      votingRoundLimit: 3,
    },
  };

  const workflow = new ConflictResolutionWorkflow(timeBoxConfig, "debate-001");

  const sampleDebate: Debate = {
    id: "debate-001",
    topic: "Architecture Decision: Microservices vs Monolith",
    participants: ["shepherd-1", "shepherd-2", "shepherd-3"],
    proposals: [],
    status: "active",
    createdAt: new Date(),
    metadata: {},
  };

  workflow.initializeWorkflow(sampleDebate);
  workflow.startPhase("ideaGeneration");

  const conflicts: Omit<StructuredConflict, "id">[] = [
    {
      type: ConflictType.ARCHITECTURAL,
      description: "Disagreement on service decomposition strategy",
      participants: ["shepherd-1", "shepherd-2"],
      positionA: {
        position: "Fine-grained microservices",
        evidence: ["Scalability benefits", "Independent deployment"],
        implications: ["Higher operational complexity", "Network latency"],
        shepherdId: "shepherd-1",
      },
      positionB: {
        position: "Coarse-grained services",
        evidence: ["Simpler operations", "Lower latency"],
        implications: ["Less flexible scaling", "Longer deployment cycles"],
        shepherdId: "shepherd-2",
      },
    },
    {
      type: ConflictType.PERFORMANCE,
      description: "Performance implications of chosen architecture",
      participants: ["shepherd-2", "shepherd-3"],
      positionA: {
        position: "Accept initial performance overhead",
        evidence: ["Microservices have overhead", "Optimization later"],
        implications: ["User experience impact", "Technical debt"],
        shepherdId: "shepherd-2",
      },
      positionB: {
        position: "Optimize from the start",
        evidence: ["User retention", "Performance benchmarks"],
        implications: ["Development time", "Code complexity"],
        shepherdId: "shepherd-3",
      },
    },
  ];

  const results = workflow.executeWorkflow(conflicts);

  console.log("Resolution Workflow Results:");
  console.log(`- Resolved: ${results.resolved.length}`);
  console.log(`- Escalated: ${results.escalated.length}`);
  console.log(`- Failed: ${results.failed.length}`);

  workflow.endPhase("ideaGeneration");
  workflow.startPhase("conflictResolution");

  const progress = workflow.monitorPhaseProgress("conflictResolution");
  console.log("\nConflict Resolution Progress:");
  console.log(`- Running: ${progress.isRunning}`);
  console.log(`- Time Remaining: ${progress.timeoutStatus.remainingSeconds}s`);

  console.log("\nWorkflow History:");
  workflow
    .getWorkflowHistory()
    .forEach((entry: { step: string; timestamp: Date; details: string }) => {
      console.log(
        `[${entry.timestamp.toISOString()}] ${entry.step}: ${entry.details}`,
      );
    });
}
