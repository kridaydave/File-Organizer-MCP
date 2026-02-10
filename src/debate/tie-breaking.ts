/**
 * File Organizer MCP Server v3.2.0
 * Tie-Breaking Mechanisms for the Debate System
 *
 * Provides multiple strategies for breaking ties in multi-shepherd debates,
 * including weighted voting, Borzoi pattern-based decisions, confidence bonuses,
 * round-robin rotation, and escalation paths.
 *
 * @module debate/tie-breaking
 */

import { shepherdId, ShepherdId } from "./enhanced-voting.js";

// ============================================================================
// Enums
// ============================================================================

/**
 * Methods available for breaking ties between debate options.
 */
export enum TieBreakMethod {
  WEIGHTED_VOTE = "weighted_vote",
  BORZOI_DECISION = "borzoi_decision",
  CONFIDENCE_BONUS = "confidence_bonus",
  ROUND_ROBIN = "round_robin",
  ESCALATE = "escalate",
}

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Represents an option in a tie-breaking scenario.
 */
export interface TieOption {
  /** Unique identifier for the option */
  id: string;
  /** Human-readable description of the option */
  description: string;
  /** Number of votes received */
  votes: number;
  /** Confidence level (0-1) from voting shepherds */
  confidence: number;
  /** Array of shepherd IDs who voted for this option */
  shepherdIds: string[];
}

/**
 * Result of a tie-breaking decision.
 */
export interface TieBreakResult {
  /** The winning option after tie-breaking */
  winner: TieOption;
  /** The method used to break the tie */
  method: TieBreakMethod;
  /** Confidence level of the decision (0-1) */
  confidence: number;
  /** Human-readable reasoning for the decision */
  reasoning: string;
}

/**
 * Context provided to tie-breaking methods for making decisions.
 */
export interface TieBreakContext {
  /** Current round of debate */
  round: number;
  /** Topic being debated */
  topic: string;
  /** Total number of participants in the debate */
  totalParticipants: number;
  /** History of previous tie-breaks (for avoiding repetition) */
  previousTieBreaks: readonly TieBreakMethod[];
  /** Escalation level (0 = initial, higher = more authority) */
  escalationLevel: number;
  /** Additional metadata for decision-making */
  metadata?: Record<string, unknown>;
}

/**
 * Borzoi pattern analysis result.
 */
export interface BorzoiPatternResult {
  /** Recommended option ID */
  recommendedId: string;
  /** Pattern match confidence (0-1) */
  confidence: number;
  /** Identified patterns in the debate */
  patterns: readonly string[];
  /** Reasoning from Borzoi analysis */
  reasoning: string;
}

/**
 * Escalation handler for handling unresolved ties.
 */
export interface EscalationHandler {
  /** Handle an escalated tie */
  handleEscalation(
    options: readonly TieOption[],
    context: TieBreakContext,
  ): Promise<TieBreakResult>;
  /** Get the authority level of this handler */
  getAuthorityLevel(): number;
  /** Get the name of this handler */
  getName(): string;
}

// ============================================================================
// Borzoi Integration
// ============================================================================

/**
 * BorzoiTieBreakAdvisor - Borzoi-based pattern analysis for tie-breaking
 *
 * Uses AI-like pattern recognition to analyze debate patterns and recommend
 * optimal tie-breaking outcomes based on historical data and contextual analysis.
 */
class BorzoiTieBreakAdvisor {
  private patternDatabase: Map<string, readonly string[]> = new Map();
  private decisionHistory: BorzoiPatternResult[] = [];

  /**
   * Create a new Borzoi advisor instance.
   */
  constructor() {
    this.initializePatternDatabase();
  }

  /**
   * Initialize the pattern database with known debate patterns.
   */
  private initializePatternDatabase(): void {
    this.patternDatabase.set("security-focused", [
      "prioritize-security",
      "minimize-risk",
      "defense-first",
    ]);
    this.patternDatabase.set("performance-focused", [
      "optimize-speed",
      "minimize-latency",
      "efficiency-first",
    ]);
    this.patternDatabase.set("balance-oriented", [
      "compromise-solution",
      "weighted-approach",
      "hybrid-resolution",
    ]);
    this.patternDatabase.set("innovation-driven", [
      "novel-approach",
      "cutting-edge",
      "forward-thinking",
    ]);
  }

  /**
   * Analyze debate options and return a pattern-based recommendation.
   *
   * @param options - Array of tied options to analyze
   * @param context - Tie-breaking context
   * @returns Borzoi pattern analysis result
   */
  analyzePatterns(
    options: readonly TieOption[],
    context: TieBreakContext,
  ): BorzoiPatternResult {
    const patterns = this.identifyPatterns(options, context);
    const recommendedOption = this.selectBestOption(options, patterns, context);
    const reasoning = this.generateReasoning(
      options,
      recommendedOption,
      patterns,
      context,
    );

    const result: BorzoiPatternResult = {
      recommendedId: recommendedOption.id,
      confidence: this.calculateConfidence(options, patterns, context),
      patterns: patterns,
      reasoning: reasoning,
    };

    this.decisionHistory.push(result);
    return result;
  }

  /**
   * Identify relevant patterns from the current debate context.
   */
  private identifyPatterns(
    options: readonly TieOption[],
    context: TieBreakContext,
  ): readonly string[] {
    const detectedPatterns: string[] = [];
    const topic = context.topic.toLowerCase();

    if (
      topic.includes("security") ||
      topic.includes("risk") ||
      topic.includes("vulnerability")
    ) {
      detectedPatterns.push("security-focused");
    }

    if (
      topic.includes("performance") ||
      topic.includes("speed") ||
      topic.includes("optimization")
    ) {
      detectedPatterns.push("performance-focused");
    }

    if (
      topic.includes("balance") ||
      topic.includes("compromise") ||
      topic.includes("fairness")
    ) {
      detectedPatterns.push("balance-oriented");
    }

    if (
      topic.includes("innovation") ||
      topic.includes("new") ||
      topic.includes("improve")
    ) {
      detectedPatterns.push("innovation-driven");
    }

    // Check for conflicting patterns
    if (options.length > 2 && options.every((opt) => opt.confidence > 0.7)) {
      detectedPatterns.push("high-consensus-environment");
    }

    // Check for low-confidence tie
    if (options.every((opt) => opt.confidence < 0.5)) {
      detectedPatterns.push("low-confidence-environment");
    }

    return detectedPatterns;
  }

  /**
   * Select the best option based on identified patterns.
   */
  private selectBestOption(
    options: readonly TieOption[],
    patterns: readonly string[],
    context: TieBreakContext,
  ): TieOption {
    let bestOption = options[0]!;
    let highestScore = -Infinity;

    for (const option of options) {
      let score = 0;

      // Base score from votes
      score += option.votes * 10;

      // Base score from confidence
      score += option.confidence * 20;

      // Pattern-based scoring
      for (const pattern of patterns) {
        switch (pattern) {
          case "security-focused":
            if (
              option.description.toLowerCase().includes("security") ||
              option.description.toLowerCase().includes("risk")
            ) {
              score += 15;
            }
            break;
          case "performance-focused":
            if (
              option.description.toLowerCase().includes("performance") ||
              option.description.toLowerCase().includes("speed")
            ) {
              score += 15;
            }
            break;
          case "balance-oriented":
            if (
              option.description.toLowerCase().includes("balance") ||
              option.description.toLowerCase().includes("compromise")
            ) {
              score += 15;
            }
            break;
          case "innovation-driven":
            if (
              option.description.toLowerCase().includes("innovation") ||
              option.description.toLowerCase().includes("new")
            ) {
              score += 15;
            }
            break;
          case "high-consensus-environment":
            score += option.confidence * 10;
            break;
          case "low-confidence-environment":
            score += option.shepherdIds.length * 5;
            break;
        }
      }

      // Round-based adjustment (prefer different approaches in later rounds)
      if (context.round > 2) {
        if (
          !context.previousTieBreaks.includes(TieBreakMethod.BORZOI_DECISION)
        ) {
          score += 5;
        }
      }

      if (score > highestScore) {
        highestScore = score;
        bestOption = option;
      }
    }

    return bestOption;
  }

  /**
   * Generate human-readable reasoning for the decision.
   */
  private generateReasoning(
    options: readonly TieOption[],
    winner: TieOption,
    patterns: readonly string[],
    context: TieBreakContext,
  ): string {
    const parts: string[] = [];

    if (patterns.length > 0) {
      parts.push(`Detected patterns: ${patterns.join(", ")}. `);
    }

    const topOption = this.findTopVotedOption(options);
    if (winner.id === topOption.id) {
      parts.push(
        `Selected the option with highest votes (${winner.votes}) as primary factor.`,
      );
    } else {
      parts.push(
        `Pattern analysis superseded vote count, selecting "${winner.description}" based on contextual relevance.`,
      );
    }

    if (winner.confidence > 0.7) {
      parts.push(
        `High confidence score (${(winner.confidence * 100).toFixed(0)}%) reinforced the decision.`,
      );
    }

    if (patterns.includes("low-confidence-environment")) {
      parts.push(
        `Broad shepherd support (${winner.shepherdIds.length} supporters) was prioritized in this low-confidence scenario.`,
      );
    }

    return parts.join(" ");
  }

  /**
   * Calculate confidence in the pattern-based decision.
   */
  private calculateConfidence(
    options: readonly TieOption[],
    patterns: readonly string[],
    context: TieBreakContext,
  ): number {
    let confidence = 0.5;

    // Increase confidence based on pattern matches
    confidence += patterns.length * 0.1;

    // Increase confidence if there's a clear vote leader
    const topOption = this.findTopVotedOption(options);
    const voteGap = Math.max(...options.map((o) => o.votes)) - topOption.votes;
    if (voteGap > 0) {
      confidence += 0.1;
    }

    // Decrease confidence in later rounds (more uncertainty)
    confidence -= context.round * 0.05;

    // Adjust based on vote spread
    const voteSpread =
      Math.max(...options.map((o) => o.votes)) -
      Math.min(...options.map((o) => o.votes));
    if (voteSpread > 2) {
      confidence += 0.1;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Find the option with the highest vote count.
   */
  private findTopVotedOption(options: readonly TieOption[]): TieOption {
    return options.reduce((best, current) =>
      current.votes > best.votes ? current : best,
    );
  }

  /**
   * Get the history of past decisions for auditing.
   */
  getDecisionHistory(): readonly BorzoiPatternResult[] {
    return [...this.decisionHistory];
  }

  /**
   * Clear the decision history.
   */
  clearHistory(): void {
    this.decisionHistory = [];
  }
}

// ============================================================================
// TieBreaker
// ============================================================================

/**
 * TieBreaker - Main tie-breaking logic for the debate system
 *
 * Orchestrates multiple tie-breaking methods and provides a unified interface
 * for resolving deadlocked debates.
 *
 * @example
 * ```ts
 * const tieBreaker = new TieBreaker();
 *
 * const options: TieOption[] = [
 *   { id: 'opt1', description: 'Implement security first', votes: 5, confidence: 0.8, shepherdIds: ['s1', 's2'] },
 *   { id: 'opt2', description: 'Implement performance first', votes: 5, confidence: 0.7, shepherdIds: ['s3', 's4'] },
 * ];
 *
 * const context: TieBreakContext = {
 *   round: 1,
 *   topic: 'Security vs Performance trade-off',
 *   totalParticipants: 4,
 *   previousTieBreaks: [],
 *   escalationLevel: 0,
 * };
 *
 * const result = await tieBreaker.breakTie(options, TieBreakMethod.WEIGHTED_VOTE, context);
 * console.log(result.winner.description);
 * ```
 */
class TieBreaker {
  private readonly borzoiAdvisor: BorzoiTieBreakAdvisor;
  private readonly escalationHandlers: EscalationHandler[] = [];
  private readonly methodUsageCount: Map<TieBreakMethod, number> = new Map();

  /**
   * Create a new TieBreaker instance.
   */
  constructor() {
    this.borzoiAdvisor = new BorzoiTieBreakAdvisor();
    this.initializeDefaultEscalationHandlers();
  }

  /**
   * Initialize default escalation handlers.
   */
  private initializeDefaultEscalationHandlers(): void {
    const defaultHandler: EscalationHandler = {
      handleEscalation: async (options, context) => {
        return this.confidenceBonus(options, context);
      },
      getAuthorityLevel: () => 1,
      getName: () => "DefaultEscalationHandler",
    };

    const seniorHandler: EscalationHandler = {
      handleEscalation: async (options, context) => {
        return this.borzoiDecision(options, context);
      },
      getAuthorityLevel: () => 2,
      getName: () => "SeniorShepherdHandler",
    };

    this.escalationHandlers.push(defaultHandler, seniorHandler);
  }

  /**
   * Register a custom escalation handler.
   *
   * @param handler - The escalation handler to register
   */
  registerEscalationHandler(handler: EscalationHandler): void {
    this.escalationHandlers.push(handler);
    // Sort by authority level (highest first)
    this.escalationHandlers.sort(
      (a, b) => b.getAuthorityLevel() - a.getAuthorityLevel(),
    );
  }

  /**
   * Main entry point for breaking ties.
   *
   * @param options - Array of tied options
   * @param method - The tie-breaking method to use
   * @param context - The tie-breaking context
   * @returns TieBreakResult with the winning option
   */
  async breakTie(
    options: readonly TieOption[],
    method: TieBreakMethod,
    context: TieBreakContext,
  ): Promise<TieBreakResult> {
    if (options.length === 0) {
      throw new Error("Cannot break tie with no options provided");
    }

    if (options.length === 1) {
      return this.createTieBreakResult(
        options[0]!,
        method,
        1.0,
        "Single option available - automatically selected",
      );
    }

    // Update method usage count
    const currentCount = this.methodUsageCount.get(method) ?? 0;
    this.methodUsageCount.set(method, currentCount + 1);

    switch (method) {
      case TieBreakMethod.WEIGHTED_VOTE:
        return this.weightedVote(options, context);
      case TieBreakMethod.BORZOI_DECISION:
        return this.borzoiDecision(options, context);
      case TieBreakMethod.CONFIDENCE_BONUS:
        return this.confidenceBonus(options, context);
      case TieBreakMethod.ROUND_ROBIN:
        return this.roundRobin(options, context);
      case TieBreakMethod.ESCALATE:
        return this.escalate(options, context);
      default:
        throw new Error(`Unknown tie-breaking method: ${method}`);
    }
  }

  /**
   * Resolve tie using weighted vote counting.
   *
   * Factors in vote count, confidence levels, and shepherd participation
   * to determine the winner.
   */
  weightedVote(
    options: readonly TieOption[],
    context: TieBreakContext,
  ): TieBreakResult {
    const scoredOptions = options.map((option) => {
      const voteScore = option.votes * 10;
      const confidenceScore = option.confidence * 20;
      const participationBonus = option.shepherdIds.length * 5;

      const totalScore = voteScore + confidenceScore + participationBonus;

      return { option, totalScore };
    });

    scoredOptions.sort((a, b) => b.totalScore - a.totalScore);

    const winner = scoredOptions[0]!.option;
    const runnerUpScore = scoredOptions[1]?.totalScore ?? 0;

    let reasoning = `Weighted vote calculation: votes (${winner.votes}) * 10 + confidence (${winner.confidence.toFixed(2)}) * 20 + participation (${winner.shepherdIds.length}) * 5 = ${scoredOptions[0]!.totalScore.toFixed(1)}`;

    if (scoredOptions[1]) {
      const runnerUp = scoredOptions[1]!.option;
      const scoreDiff =
        scoredOptions[0]!.totalScore - scoredOptions[1]!.totalScore;
      reasoning += `; winner beat runner-up by ${scoreDiff.toFixed(1)} points`;
    }

    const confidence = scoredOptions[1]
      ? Math.min(
          0.9,
          0.5 +
            scoredOptions[0]!.totalScore /
              (scoredOptions[0]!.totalScore + runnerUpScore),
        )
      : 1.0;

    return this.createTieBreakResult(
      winner,
      TieBreakMethod.WEIGHTED_VOTE,
      confidence,
      reasoning,
    );
  }

  /**
   * Resolve tie using Borzoi pattern-based decision making.
   */
  borzoiDecision(
    options: readonly TieOption[],
    context: TieBreakContext,
  ): TieBreakResult {
    const borzoiResult = this.borzoiAdvisor.analyzePatterns(options, context);

    const winner = options.find((o) => o.id === borzoiResult.recommendedId);
    if (!winner) {
      throw new Error(
        `Borzoi recommended invalid option ID: ${borzoiResult.recommendedId}`,
      );
    }

    return this.createTieBreakResult(
      winner,
      TieBreakMethod.BORZOI_DECISION,
      borzoiResult.confidence,
      `Borzoi analysis: ${borzoiResult.reasoning}. Patterns detected: ${borzoiResult.patterns.join(", ")}`,
    );
  }

  /**
   * Resolve tie by selecting the option with highest confidence score.
   *
   * When multiple options have equal or similar confidence, factors in
   * vote count as a secondary criterion.
   */
  confidenceBonus(
    options: readonly TieOption[],
    context: TieBreakContext,
  ): TieBreakResult {
    // Sort by confidence (descending), then by votes (descending) as tiebreaker
    const sortedOptions = [...options].sort((a, b) => {
      if (Math.abs(a.confidence - b.confidence) > 0.01) {
        return b.confidence - a.confidence;
      }
      return b.votes - a.votes;
    });

    const winner = sortedOptions[0]!;
    const runnerUp = sortedOptions[1];

    let reasoning = `Selected option with highest confidence score: ${winner.confidence.toFixed(2)}`;

    if (runnerUp) {
      const confidenceDiff = winner.confidence - runnerUp.confidence;
      reasoning += `; confidence advantage of ${(confidenceDiff * 100).toFixed(1)}% over runner-up`;
    }

    // Confidence increases if there's a clear winner
    const confidence = runnerUp
      ? Math.min(0.95, 0.7 + (winner.confidence - runnerUp.confidence) * 0.5)
      : 1.0;

    return this.createTieBreakResult(
      winner,
      TieBreakMethod.CONFIDENCE_BONUS,
      confidence,
      reasoning,
    );
  }

  /**
   * Resolve tie using round-robin rotation.
   *
   * Rotates through available options based on the round number and
   * previous selections to ensure fair distribution.
   */
  roundRobin(
    options: readonly TieOption[],
    context: TieBreakContext,
  ): TieBreakResult {
    // Calculate rotation index based on round and previous selections
    let rotationOffset = context.round;

    // Factor in previous tie-break usage to distribute evenly
    for (const method of context.previousTieBreaks) {
      rotationOffset += this.methodUsageCount.get(method) ?? 0;
    }

    const rotationIndex = rotationOffset % options.length;
    const winner = options[rotationIndex]!;

    const reasoning = `Round-robin selection: round ${context.round} with ${options.length} options -> index ${rotationIndex} -> "${winner.description}"`;

    // Round-robin has lower confidence as it's not based on merit
    const confidence = 0.6;

    return this.createTieBreakResult(
      winner,
      TieBreakMethod.ROUND_ROBIN,
      confidence,
      reasoning,
    );
  }

  /**
   * Escalate the tie to a higher authority level.
   *
   * Delegates the decision to registered escalation handlers based on
   * the escalation level in the context.
   */
  async escalate(
    options: readonly TieOption[],
    context: TieBreakContext,
  ): Promise<TieBreakResult> {
    const handlerIndex = Math.min(
      context.escalationLevel,
      this.escalationHandlers.length - 1,
    );
    const handler = this.escalationHandlers[handlerIndex];

    if (!handler) {
      // Fallback to confidence bonus if no handler available
      return this.confidenceBonus(options, context);
    }

    const result = await handler.handleEscalation(options, context);

    return this.createTieBreakResult(
      result.winner,
      TieBreakMethod.ESCALATE,
      result.confidence * 0.9, // Slightly reduce confidence for escalation
      `Escalated to ${handler.getName()}: ${result.reasoning}`,
    );
  }

  /**
   * Create a TieBreakResult with consistent formatting.
   */
  private createTieBreakResult(
    winner: TieOption,
    method: TieBreakMethod,
    confidence: number,
    reasoning: string,
  ): TieBreakResult {
    return {
      winner,
      method,
      confidence: Math.max(0, Math.min(1, confidence)),
      reasoning,
    };
  }

  /**
   * Get the Borzoi advisor for direct pattern analysis.
   */
  getBorzoiAdvisor(): BorzoiTieBreakAdvisor {
    return this.borzoiAdvisor;
  }

  /**
   * Get method usage statistics.
   */
  getMethodUsageStats(): Map<TieBreakMethod, number> {
    return new Map(this.methodUsageCount);
  }

  /**
   * Reset method usage statistics.
   */
  resetStats(): void {
    this.methodUsageCount.clear();
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a set of options represents a true tie.
 *
 * @param options - Options to check for tie
 * @param tolerance - Tolerance for considering values equal
 * @returns True if options are in a tie
 */
function isTie(
  options: readonly TieOption[],
  tolerance: number = 0.01,
): boolean {
  if (options.length < 2) {
    return false;
  }

  const sortedByVotes = [...options].sort((a, b) => b.votes - a.votes);
  const topVotes = sortedByVotes[0]!.votes;

  return options.every((opt) => Math.abs(opt.votes - topVotes) < tolerance);
}

/**
 * Create a TieOption from raw data.
 *
 * @param id - Unique identifier
 * @param description - Human-readable description
 * @param votes - Number of votes
 * @param confidence - Confidence level (0-1)
 * @param shepherdIds - Array of shepherd IDs
 * @returns A new TieOption
 */
function createTieOption(
  id: string,
  description: string,
  votes: number,
  confidence: number,
  shepherdIds: string[],
): TieOption {
  return {
    id,
    description,
    votes,
    confidence: Math.max(0, Math.min(1, confidence)),
    shepherdIds: [...shepherdIds],
  };
}

// ============================================================================
// Example Usage
// ============================================================================

/**
 * @example
 * ```ts
 * import {
 *   TieBreaker,
 *   TieBreakMethod,
 *   createTieOption,
 *   isTie,
 * } from './debate/tie-breaking.js';
 *
 * // Example 1: Basic tie-breaking
 * async function exampleBasicTieBreak() {
 *   const tieBreaker = new TieBreaker();
 *
 *   const options = [
 *     createTieOption('opt1', 'Implement security audit first', 5, 0.8, ['s1', 's2', 's3', 's4', 's5']),
 *     createTieOption('opt2', 'Optimize performance first', 5, 0.75, ['s6', 's7', 's8', 's9', 's10']),
 *   ];
 *
 *   const context = {
 *     round: 1,
 *     topic: 'Security vs Performance implementation order',
 *     totalParticipants: 10,
 *     previousTieBreaks: [],
 *     escalationLevel: 0,
 *   };
 *
 *   console.log('Is tie:', isTie(options)); // true
 *
 *   const result = await tieBreaker.breakTie(
 *     options,
 *     TieBreakMethod.WEIGHTED_VOTE,
 *     context,
 *   );
 *
 *   console.log(`Winner: ${result.winner.description}`);
 *   console.log(`Method: ${result.method}`);
 *   console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
 *   console.log(`Reasoning: ${result.reasoning}`);
 * }
 *
 * // Example 2: Multi-round debate with escalation
 * async function exampleMultiRoundDebate() {
 *   const tieBreaker = new TieBreaker();
 *   const previousMethods: TieBreakMethod[] = [];
 *
 *   for (let round = 1; round <= 3; round++) {
 *     const options = [
 *       createTieOption('opt1', 'Cloud-native solution', 4, 0.85, ['s1', 's2', 's3', 's4']),
 *       createTieOption('opt2', 'On-premise solution', 4, 0.82, ['s5', 's6', 's7', 's8']),
 *     ];
 *
 *     const context = {
 *       round,
 *       topic: 'Deployment architecture decision',
 *       totalParticipants: 8,
 *       previousTieBreaks: previousMethods,
 *       escalationLevel: 0,
 *     };
 *
 *     // Try different methods in different rounds
 *     const method = round === 1
 *       ? TieBreakMethod.BORZOI_DECISION
 *       : round === 2
 *         ? TieBreakMethod.CONFIDENCE_BONUS
 *         : TieBreakMethod.ESCALATE;
 *
 *     const result = await tieBreaker.breakTie(options, method, context);
 *     previousMethods.push(result.method);
 *
 *     console.log(`Round ${round}: ${result.winner.description} won via ${result.method}`);
 *   }
 * }
 *
 * // Example 3: Custom escalation handler
 * async function exampleCustomEscalation() {
 *   const tieBreaker = new TieBreaker();
 *
 *   const options = [
 *     createTieOption('opt1', 'Approve the PR', 3, 0.6, ['s1', 's2', 's3']),
 *     createTieOption('opt2', 'Request changes', 3, 0.6, ['s4', 's5', 's6']),
 *   ];
 *
 *   // Register custom escalation handler
 *   tieBreaker.registerEscalationHandler({
 *     handleEscalation: async (opts, ctx) => {
 *       // Custom logic: select option with more detailed description
 *       const winner = opts.reduce((best, current) =>
 *         current.description.length > best.description.length ? current : best
 *       );
 *       return {
 *         winner,
 *         method: TieBreakMethod.ESCALATE,
 *         confidence: 0.8,
 *         reasoning: 'Selected option with more detailed specification',
 *       };
 *     },
 *     getAuthorityLevel: () => 3,
 *     getName: () => 'TechnicalLeadHandler',
 *   });
 *
 *   const context = {
 *     round: 1,
 *     topic: 'PR review approval',
 *     totalParticipants: 6,
 *     previousTieBreaks: [],
 *     escalationLevel: 2,
 *   };
 *
 *   const result = await tieBreaker.breakTie(options, TieBreakMethod.ESCALATE, context);
 *   console.log(`Escalation winner: ${result.winner.description}`);
 * }
 *
 * // Run examples
 * await exampleBasicTieBreak();
 * await exampleMultiRoundDebate();
 * await exampleCustomEscalation();
 * ```
 */

// ============================================================================
// Exports
// ============================================================================

export { TieBreaker, BorzoiTieBreakAdvisor, createTieOption, isTie };
