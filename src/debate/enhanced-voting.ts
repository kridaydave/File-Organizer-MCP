/**
 * Enhanced Voting System & Weighted Voting System
 * for the Multi-Shepherd Debate System.
 *
 * Provides granular voting with approval scales, confidence metrics,
 * concern tracking, conditional approvals, and ranked preferences.
 * Supports weighted consensus calculation driven by specialty,
 * conflict type, and reputation adjustments.
 *
 * @module debate/enhanced-voting
 */

// ---------------------------------------------------------------------------
// Branded / Opaque Id Types
// ---------------------------------------------------------------------------

/** Unique identifier for a shepherd participant. */
export type ShepherdId = string & { readonly __brand: unique symbol };

/** Creates a {@link ShepherdId} from a plain string. */
export function shepherdId(id: string): ShepherdId {
  return id as ShepherdId;
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Domain specialties a shepherd can hold. */
export enum ShepherdSpecialty {
  Security = "security",
  Performance = "performance",
  Architecture = "architecture",
  Testing = "testing",
  UX = "ux",
  DataIntegrity = "data-integrity",
  General = "general",
}

/** Classification of the conflict being voted on. */
export enum ConflictType {
  SecurityVsPerformance = "security-vs-performance",
  ArchitectureVsTesting = "architecture-vs-testing",
  UXVsSecurity = "ux-vs-security",
  General = "general",
}

// ---------------------------------------------------------------------------
// Core Interfaces
// ---------------------------------------------------------------------------

/**
 * A single enhanced vote cast by a shepherd.
 *
 * @property approval          - 0-1 scale indicating approval strength.
 * @property confidence        - 0-1 scale indicating how confident the voter is.
 * @property concerns          - Free-text list of concerns.
 * @property conditions        - Requirements that must be met for approval.
 * @property rankedPreferences - Ordered preference list (most preferred first).
 */
export interface EnhancedVote {
  readonly approval: number;
  readonly confidence: number;
  readonly concerns: string[];
  readonly conditions: string[];
  readonly rankedPreferences: string[];
}

/**
 * Minimal representation of a shepherd participant.
 */
export interface Shepherd {
  readonly id: ShepherdId;
  readonly specialty: ShepherdSpecialty;
}

/**
 * Contextual information supplied alongside a vote.
 */
export interface VotingContext {
  readonly conflictType: ConflictType;
  readonly round: number;
  readonly topic: string;
}

/**
 * Configuration that drives weight calculations.
 *
 * @property baseWeight             - Default weight applied to every vote.
 * @property specialtyWeights       - Per-specialty weight overrides.
 * @property conflictMultipliers    - Per-conflict-type multipliers keyed by specialty.
 * @property reputationAdjustments  - Per-shepherd additive adjustment.
 */
export interface WeightedVotingConfig {
  readonly baseWeight: number;
  readonly specialtyWeights: Map<ShepherdSpecialty, number>;
  readonly conflictMultipliers: Map<
    ConflictType,
    Map<ShepherdSpecialty, number>
  >;
  readonly reputationAdjustments: Map<ShepherdId, number>;
}

/**
 * Weighted consensus metrics computed from a set of votes.
 *
 * @property agreementIndex   - 0-1 weighted average of approvals.
 * @property confidenceIndex  - 0-1 weighted average of confidences.
 * @property concernDensity   - Average number of concerns per participating voter.
 * @property participationRate - Ratio of voters who actually voted vs total participants.
 */
export interface WeightedConsensus {
  readonly agreementIndex: number;
  readonly confidenceIndex: number;
  readonly concernDensity: number;
  readonly participationRate: number;
}

/**
 * Record stored internally for every vote cast.
 */
export interface VoteRecord {
  readonly shepherd: Shepherd;
  readonly vote: EnhancedVote;
  readonly context: VotingContext;
  readonly weight: number;
  readonly timestamp: number;
}

/**
 * Aggregated results returned by {@link EnhancedVotingSystem.getVotingResults}.
 */
export interface VotingResults {
  readonly consensus: WeightedConsensus;
  readonly votes: readonly VoteRecord[];
  readonly totalParticipants: number;
  readonly allConcerns: string[];
  readonly allConditions: string[];
  readonly rankedPreferenceTally: Map<string, number>;
}

// ---------------------------------------------------------------------------
// Default configuration factory
// ---------------------------------------------------------------------------

/** Returns a sensible default {@link WeightedVotingConfig}. */
export function createDefaultConfig(): WeightedVotingConfig {
  return {
    baseWeight: 1.0,
    specialtyWeights: new Map<ShepherdSpecialty, number>([
      [ShepherdSpecialty.Security, 1.5],
      [ShepherdSpecialty.Performance, 1.3],
      [ShepherdSpecialty.Architecture, 1.4],
      [ShepherdSpecialty.Testing, 1.2],
      [ShepherdSpecialty.UX, 1.1],
      [ShepherdSpecialty.DataIntegrity, 1.3],
      [ShepherdSpecialty.General, 1.0],
    ]),
    conflictMultipliers: new Map<ConflictType, Map<ShepherdSpecialty, number>>([
      [
        ConflictType.SecurityVsPerformance,
        new Map<ShepherdSpecialty, number>([
          [ShepherdSpecialty.Security, 1.8],
          [ShepherdSpecialty.Performance, 1.6],
        ]),
      ],
      [
        ConflictType.ArchitectureVsTesting,
        new Map<ShepherdSpecialty, number>([
          [ShepherdSpecialty.Architecture, 1.7],
          [ShepherdSpecialty.Testing, 1.5],
        ]),
      ],
      [
        ConflictType.UXVsSecurity,
        new Map<ShepherdSpecialty, number>([
          [ShepherdSpecialty.UX, 1.4],
          [ShepherdSpecialty.Security, 1.6],
        ]),
      ],
    ]),
    reputationAdjustments: new Map<ShepherdId, number>(),
  };
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function validateVote(vote: EnhancedVote): void {
  if (vote.approval < 0 || vote.approval > 1) {
    throw new RangeError(`approval must be 0-1, got ${vote.approval}`);
  }
  if (vote.confidence < 0 || vote.confidence > 1) {
    throw new RangeError(`confidence must be 0-1, got ${vote.confidence}`);
  }
}

// ---------------------------------------------------------------------------
// WeightedVotingSystem
// ---------------------------------------------------------------------------

/**
 * Calculates the effective weight for a vote given the shepherd's profile
 * and the voting context.
 *
 * Weight = (specialtyWeight ?? baseWeight)
 *        * (conflictMultiplier ?? 1)
 *        + (reputationAdjustment ?? 0)
 */
export class WeightedVotingSystem {
  private readonly config: WeightedVotingConfig;

  constructor(config?: WeightedVotingConfig) {
    this.config = config ?? createDefaultConfig();
  }

  /**
   * Compute the weight for a single vote.
   *
   * @param vote     - The vote being weighted.
   * @param shepherd - The shepherd who cast the vote.
   * @param context  - The voting context (conflict type, round, etc.).
   * @returns A non-negative weight value.
   */
  calculateWeightedVote(
    vote: EnhancedVote,
    shepherd: Shepherd,
    context: VotingContext,
  ): number {
    const specialtyWeight =
      this.config.specialtyWeights.get(shepherd.specialty) ??
      this.config.baseWeight;

    let conflictMultiplier = 1.0;
    const conflictMap = this.config.conflictMultipliers.get(
      context.conflictType,
    );
    if (conflictMap) {
      conflictMultiplier = conflictMap.get(shepherd.specialty) ?? 1.0;
    }

    const reputationAdj =
      this.config.reputationAdjustments.get(shepherd.id) ?? 0;

    const weight = specialtyWeight * conflictMultiplier + reputationAdj;
    return Math.max(0, weight);
  }

  /** Expose the active configuration (read-only). */
  getConfig(): WeightedVotingConfig {
    return this.config;
  }
}

// ---------------------------------------------------------------------------
// VotingCalculator
// ---------------------------------------------------------------------------

/**
 * Pure calculator that derives {@link WeightedConsensus} from a set of
 * {@link VoteRecord}s.
 */
export class VotingCalculator {
  /**
   * Calculate weighted consensus metrics.
   *
   * @param votes           - Array of vote records (may be empty).
   * @param totalParticipants - Total number of eligible participants.
   * @returns Consensus metrics.
   */
  calculateConsensus(
    votes: readonly VoteRecord[],
    totalParticipants: number,
  ): WeightedConsensus {
    if (votes.length === 0 || totalParticipants === 0) {
      return {
        agreementIndex: 0,
        confidenceIndex: 0,
        concernDensity: 0,
        participationRate: 0,
      };
    }

    let weightedApprovalSum = 0;
    let weightedConfidenceSum = 0;
    let totalWeight = 0;
    let totalConcerns = 0;

    for (const record of votes) {
      const w = record.weight;
      weightedApprovalSum += record.vote.approval * w;
      weightedConfidenceSum += record.vote.confidence * w;
      totalWeight += w;
      totalConcerns += record.vote.concerns.length;
    }

    const agreementIndex =
      totalWeight > 0 ? clamp01(weightedApprovalSum / totalWeight) : 0;
    const confidenceIndex =
      totalWeight > 0 ? clamp01(weightedConfidenceSum / totalWeight) : 0;
    const concernDensity = totalConcerns / votes.length;
    const participationRate = clamp01(votes.length / totalParticipants);

    return {
      agreementIndex,
      confidenceIndex,
      concernDensity,
      participationRate,
    };
  }

  /**
   * Tally ranked preferences using a simple Borda-count style scoring.
   * The first preference gets N points, the second N-1, etc.
   *
   * @param votes - Vote records to tally.
   * @returns Map of preference label to cumulative score.
   */
  tallyRankedPreferences(votes: readonly VoteRecord[]): Map<string, number> {
    const tally = new Map<string, number>();
    for (const record of votes) {
      const prefs = record.vote.rankedPreferences;
      const n = prefs.length;
      for (let i = 0; i < n; i++) {
        const pref = prefs[i]!;
        const score = n - i;
        tally.set(pref, (tally.get(pref) ?? 0) + score * record.weight);
      }
    }
    return tally;
  }
}

// ---------------------------------------------------------------------------
// EnhancedVotingSystem  (orchestrator)
// ---------------------------------------------------------------------------

/**
 * Top-level orchestrator that manages the lifecycle of an enhanced voting
 * session: collecting votes, computing weights, and producing results.
 *
 * @example
 * ```ts
 * const system = new EnhancedVotingSystem({ totalParticipants: 3 });
 * system.castVote(shepherd, vote, context);
 * const results = system.getVotingResults();
 * console.log(results.consensus.agreementIndex);
 * ```
 */
export class EnhancedVotingSystem {
  private readonly weightedSystem: WeightedVotingSystem;
  private readonly calculator: VotingCalculator;
  private readonly records: VoteRecord[] = [];
  private readonly totalParticipants: number;

  constructor(options: {
    totalParticipants: number;
    config?: WeightedVotingConfig;
  }) {
    this.totalParticipants = options.totalParticipants;
    this.weightedSystem = new WeightedVotingSystem(options.config);
    this.calculator = new VotingCalculator();
  }

  /**
   * Record a shepherd's vote.
   *
   * @param shepherd - The voting shepherd.
   * @param vote     - The enhanced vote payload.
   * @param context  - Voting context.
   * @returns The stored {@link VoteRecord}.
   * @throws {RangeError} If approval or confidence are outside 0-1.
   * @throws {Error} If the shepherd has already voted.
   */
  castVote(
    shepherd: Shepherd,
    vote: EnhancedVote,
    context: VotingContext,
  ): VoteRecord {
    validateVote(vote);

    if (this.records.some((r) => r.shepherd.id === shepherd.id)) {
      throw new Error(`Shepherd ${shepherd.id} has already voted`);
    }

    const weight = this.weightedSystem.calculateWeightedVote(
      vote,
      shepherd,
      context,
    );

    const record: VoteRecord = {
      shepherd,
      vote,
      context,
      weight,
      timestamp: Date.now(),
    };

    this.records.push(record);
    return record;
  }

  /**
   * Compute current consensus metrics from all collected votes.
   *
   * @param context - Optional context (currently unused; reserved for future per-round filtering).
   * @returns Consensus metrics.
   */
  calculateConsensus(_context?: VotingContext): WeightedConsensus {
    return this.calculator.calculateConsensus(
      this.records,
      this.totalParticipants,
    );
  }

  /**
   * Retrieve full voting results including consensus, individual records,
   * aggregated concerns / conditions, and ranked-preference tallies.
   */
  getVotingResults(): VotingResults {
    const consensus = this.calculator.calculateConsensus(
      this.records,
      this.totalParticipants,
    );
    const rankedPreferenceTally = this.calculator.tallyRankedPreferences(
      this.records,
    );

    const allConcerns: string[] = [];
    const allConditions: string[] = [];
    for (const r of this.records) {
      allConcerns.push(...r.vote.concerns);
      allConditions.push(...r.vote.conditions);
    }

    return {
      consensus,
      votes: [...this.records],
      totalParticipants: this.totalParticipants,
      allConcerns,
      allConditions,
      rankedPreferenceTally,
    };
  }

  /** Number of votes cast so far. */
  get voteCount(): number {
    return this.records.length;
  }
}
