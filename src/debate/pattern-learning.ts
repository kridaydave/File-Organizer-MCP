/**
 * Debate Pattern Learning System for Borzoi
 *
 * This module provides functionality to learn from debate outcomes,
 * store and retrieve patterns, and analyze historical data to improve
 * future debate performance.
 *
 * @module debate/pattern-learning
 */

import { v4 as uuidv4 } from "uuid";

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Represents a proposal in a debate context
 */
export interface Proposal {
  id: string;
  content: string;
  design: Record<string, unknown>;
  votes: number;
  timestamp: Date;
}

/**
 * Represents a conflict that occurred during a debate
 */
export interface Conflict {
  id: string;
  type: string;
  description: string;
  participants: string[];
  resolution?: string;
  severity: "low" | "medium" | "high";
}

/**
 * Represents a resolution pattern for conflicts
 */
export interface Resolution {
  id: string;
  pattern: string;
  effectiveness: number;
  conflictTypes: string[];
  description: string;
}

/**
 * Represents a debate outcome for learning
 */
export interface DebateOutcome {
  debateId: string;
  topic: string;
  proposals: Proposal[];
  conflicts: Conflict[];
  resolutions: Resolution[];
  winningProposalId?: string;
  participantSatisfaction: number;
  timestamp: Date;
}

/**
 * Represents a learned pattern from debates
 */
export interface DebatePattern {
  patternId: string;
  topic: string;
  successfulDesigns: Proposal[];
  failedDesigns: Proposal[];
  commonConflicts: Conflict[];
  resolutionPatterns: Resolution[];
  successRate: number;
  recommendations: string[];
  occurrences: number;
  lastUpdated: Date;
}

/**
 * Represents a historical suggestion based on patterns
 */
export interface HistoricalSuggestion {
  pattern: string;
  successRate: number;
  recommendations: string[];
  warnings: string[];
  matchingCriteria: string[];
  frequency: number;
}

/**
 * Search criteria for finding patterns
 */
export interface PatternSearchCriteria {
  topic?: string;
  minSuccessRate?: number;
  maxAgeDays?: number;
  conflictTypes?: string[];
  limit?: number;
}

/**
 * Configuration for the pattern learning system
 */
export interface PatternLearningConfig {
  similarityThreshold: number;
  maxPatternAgeDays: number;
  minOccurrencesForPattern: number;
  enableAutoLearning: boolean;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculates Jaccard similarity between two sets
 * @param set1 - First set of strings
 * @param set2 - Second set of strings
 * @returns Similarity coefficient between 0 and 1
 */
function jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 && set2.size === 0) return 1;
  if (set1.size === 0 || set2.size === 0) return 0;

  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

/**
 * Tokenizes a string into words for similarity matching
 * @param text - Text to tokenize
 * @returns Set of lowercase tokens
 */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2),
  );
}

/**
 * Calculates similarity between two topics
 * @param topic1 - First topic
 * @param topic2 - Second topic
 * @returns Similarity score between 0 and 1
 */
function calculateTopicSimilarity(topic1: string, topic2: string): number {
  const tokens1 = tokenize(topic1);
  const tokens2 = tokenize(String(topic2));
  return jaccardSimilarity(tokens1, tokens2);
}

// ============================================================================
// PatternDatabase Class
// ============================================================================

/**
 * Stores and manages debate patterns with persistence capabilities
 */
export class PatternDatabase {
  private patterns: Map<string, DebatePattern>;
  private config: PatternLearningConfig;

  constructor(config?: Partial<PatternLearningConfig>) {
    this.patterns = new Map();
    this.config = {
      similarityThreshold: config?.similarityThreshold ?? 0.6,
      maxPatternAgeDays: config?.maxPatternAgeDays ?? 90,
      minOccurrencesForPattern: config?.minOccurrencesForPattern ?? 3,
      enableAutoLearning: config?.enableAutoLearning ?? true,
    };
  }

  /**
   * Stores a new pattern or updates an existing one
   * @param pattern - The pattern to store
   * @returns The stored pattern with updated metadata
   */
  storePattern(
    pattern: Omit<DebatePattern, "patternId" | "lastUpdated">,
  ): DebatePattern {
    const existingPattern = this.findByTopic(pattern.topic);

    if (existingPattern) {
      const updatedPattern = this.mergePatterns(existingPattern, pattern);
      this.patterns.set(existingPattern.patternId, updatedPattern);
      return updatedPattern;
    }

    const newPattern: DebatePattern = {
      ...pattern,
      patternId: uuidv4(),
      lastUpdated: new Date(),
    };

    this.patterns.set(newPattern.patternId, newPattern);
    return newPattern;
  }

  /**
   * Finds patterns matching the search criteria
   * @param criteria - Search criteria
   * @returns Array of matching patterns
   */
  findPatterns(criteria: PatternSearchCriteria): DebatePattern[] {
    const results: DebatePattern[] = [];

    for (const pattern of this.patterns.values()) {
      if (this.matchesCriteria(pattern, criteria)) {
        results.push(pattern);
      }
    }

    results.sort((a, b) => b.successRate - a.successRate);

    if (criteria.limit) {
      return results.slice(0, criteria.limit);
    }

    return results;
  }

  /**
   * Finds a pattern by exact topic match
   * @param topic - Topic to search for
   * @returns Matching pattern or undefined
   */
  findByTopic(topic: string): DebatePattern | undefined {
    for (const pattern of this.patterns.values()) {
      if (pattern.topic.toLowerCase() === topic.toLowerCase()) {
        return pattern;
      }
    }
    return undefined;
  }

  /**
   * Finds similar patterns based on topic similarity
   * @param topic - Topic to find similar patterns for
   * @param threshold - Similarity threshold (default from config)
   * @returns Array of similar patterns with similarity scores
   */
  findSimilarPatterns(
    topic: string,
    threshold?: number,
  ): Array<{ pattern: DebatePattern; similarity: number }> {
    const simThreshold = threshold ?? this.config.similarityThreshold;
    const results: Array<{ pattern: DebatePattern; similarity: number }> = [];

    for (const pattern of this.patterns.values()) {
      const similarity = calculateTopicSimilarity(topic, pattern.topic);
      if (similarity >= simThreshold) {
        results.push({ pattern, similarity });
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results;
  }

  /**
   * Gets a pattern by ID
   * @param patternId - Pattern ID to retrieve
   * @returns The pattern or undefined if not found
   */
  getById(patternId: string): DebatePattern | undefined {
    return this.patterns.get(patternId);
  }

  /**
   * Updates an existing pattern
   * @param patternId - ID of the pattern to update
   * @param updates - Partial updates to apply
   * @returns Updated pattern or undefined if not found
   */
  updatePattern(
    patternId: string,
    updates: Partial<DebatePattern>,
  ): DebatePattern | undefined {
    const existing = this.patterns.get(patternId);
    if (!existing) return undefined;

    const updated: DebatePattern = {
      ...existing,
      ...updates,
      patternId: existing.patternId,
      lastUpdated: new Date(),
    };

    this.patterns.set(patternId, updated);
    return updated;
  }

  /**
   * Deletes a pattern by ID
   * @param patternId - ID of the pattern to delete
   * @returns True if deleted, false if not found
   */
  deletePattern(patternId: string): boolean {
    return this.patterns.delete(patternId);
  }

  /**
   * Gets all stored patterns
   * @returns Array of all patterns
   */
  getAllPatterns(): DebatePattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Clears all stored patterns
   */
  clear(): void {
    this.patterns.clear();
  }

  /**
   * Gets the count of stored patterns
   * @returns Number of patterns
   */
  count(): number {
    return this.patterns.size;
  }

  private matchesCriteria(
    pattern: DebatePattern,
    criteria: PatternSearchCriteria,
  ): boolean {
    if (
      criteria.topic &&
      !pattern.topic.toLowerCase().includes(criteria.topic.toLowerCase())
    ) {
      return false;
    }

    if (
      criteria.minSuccessRate &&
      pattern.successRate < criteria.minSuccessRate
    ) {
      return false;
    }

    if (criteria.maxAgeDays) {
      const ageMs = Date.now() - pattern.lastUpdated.getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      if (ageDays > criteria.maxAgeDays) {
        return false;
      }
    }

    if (criteria.conflictTypes && criteria.conflictTypes.length > 0) {
      const patternConflictTypes = new Set(
        pattern.commonConflicts.map((c) => c.type),
      );
      if (
        !criteria.conflictTypes.some((type) => patternConflictTypes.has(type))
      ) {
        return false;
      }
    }

    return true;
  }

  private mergePatterns(
    existing: DebatePattern,
    newData: Omit<DebatePattern, "patternId" | "lastUpdated">,
  ): DebatePattern {
    const successfulDesigns = [...existing.successfulDesigns];
    const failedDesigns = [...existing.failedDesigns];
    const commonConflicts = [...existing.commonConflicts];
    const recommendations = [...existing.recommendations];

    for (const proposal of newData.successfulDesigns) {
      if (!successfulDesigns.find((d) => d.id === proposal.id)) {
        successfulDesigns.push(proposal);
      }
    }

    for (const proposal of newData.failedDesigns) {
      if (!failedDesigns.find((d) => d.id === proposal.id)) {
        failedDesigns.push(proposal);
      }
    }

    for (const conflict of newData.commonConflicts) {
      if (!commonConflicts.find((c) => c.id === conflict.id)) {
        commonConflicts.push(conflict);
      }
    }

    for (const rec of newData.recommendations) {
      if (!recommendations.includes(rec)) {
        recommendations.push(rec);
      }
    }

    const totalProposals = successfulDesigns.length + failedDesigns.length;
    const successRate =
      totalProposals > 0 ? successfulDesigns.length / totalProposals : 0;

    return {
      ...existing,
      successfulDesigns,
      failedDesigns,
      commonConflicts,
      recommendations,
      successRate,
      occurrences: existing.occurrences + 1,
    };
  }
}

// ============================================================================
// HistoricalAnalyzer Class
// ============================================================================

/**
 * Analyzes historical debate data to generate insights and suggestions
 */
export class HistoricalAnalyzer {
  private database: PatternDatabase;

  constructor(database: PatternDatabase) {
    this.database = database;
  }

  /**
   * Generates historical suggestions for a topic
   * @param topic - Topic to generate suggestions for
   * @returns Array of historical suggestions
   */
  suggestFromHistory(topic: string): HistoricalSuggestion[] {
    const similarPatterns = this.database.findSimilarPatterns(topic);
    const suggestions: HistoricalSuggestion[] = [];

    for (const { pattern, similarity } of similarPatterns) {
      const suggestion = this.generateSuggestion(pattern, similarity);
      suggestions.push(suggestion);
    }

    suggestions.sort((a, b) => b.successRate - a.successRate);
    return suggestions;
  }

  /**
   * Calculates overall success rate for patterns
   * @param patternId - Pattern ID to calculate for
   * @returns Success rate between 0 and 1
   */
  calculateSuccessRate(patternId: string): number {
    const pattern = this.database.getById(patternId);
    if (!pattern) {
      throw new Error(`Pattern not found: ${patternId}`);
    }

    return pattern.successRate;
  }

  /**
   * Analyzes common conflict patterns for a topic
   * @param topic - Topic to analyze
   * @returns Map of conflict types to frequencies
   */
  analyzeCommonConflicts(topic: string): Map<string, number> {
    const similarPatterns = this.database.findSimilarPatterns(topic);
    const conflictFrequency = new Map<string, number>();

    for (const { pattern } of similarPatterns) {
      for (const conflict of pattern.commonConflicts) {
        const current = conflictFrequency.get(conflict.type) ?? 0;
        conflictFrequency.set(conflict.type, current + 1);
      }
    }

    return conflictFrequency;
  }

  /**
   * Identifies successful design patterns
   * @param topic - Topic to analyze
   * @returns Array of successful design elements
   */
  identifySuccessfulDesigns(
    topic: string,
  ): Array<{ element: string; frequency: number }> {
    const similarPatterns = this.database.findSimilarPatterns(topic);
    const elementFrequency = new Map<string, number>();

    for (const { pattern } of similarPatterns) {
      for (const proposal of pattern.successfulDesigns) {
        for (const [key, value] of Object.entries(proposal.design)) {
          const element = `${key}:${JSON.stringify(value)}`;
          const current = elementFrequency.get(element) ?? 0;
          elementFrequency.set(element, current + 1);
        }
      }
    }

    return Array.from(elementFrequency.entries())
      .map(([element, frequency]) => ({ element, frequency }))
      .sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Generates warnings based on historical patterns
   * @param topic - Topic to analyze
   * @returns Array of warning messages
   */
  generateWarnings(topic: string): string[] {
    const suggestions = this.suggestFromHistory(topic);
    const warnings: string[] = [];

    for (const suggestion of suggestions) {
      warnings.push(...suggestion.warnings);
    }

    return [...new Set(warnings)];
  }

  /**
   * Calculates pattern statistics
   * @returns Statistics object
   */
  getStatistics(): {
    totalPatterns: number;
    averageSuccessRate: number;
    topPatterns: DebatePattern[];
    conflictDistribution: Map<string, number>;
  } {
    const patterns = this.database.getAllPatterns();
    const totalPatterns = patterns.length;
    const averageSuccessRate =
      totalPatterns > 0
        ? patterns.reduce((sum, p) => sum + p.successRate, 0) / totalPatterns
        : 0;

    const topPatterns = patterns
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 5);

    const conflictDistribution = new Map<string, number>();
    for (const pattern of patterns) {
      for (const conflict of pattern.commonConflicts) {
        const current = conflictDistribution.get(conflict.type) ?? 0;
        conflictDistribution.set(conflict.type, current + 1);
      }
    }

    return {
      totalPatterns,
      averageSuccessRate,
      topPatterns,
      conflictDistribution,
    };
  }

  private generateSuggestion(
    pattern: DebatePattern,
    similarity: number,
  ): HistoricalSuggestion {
    const recommendations: string[] = [];
    const warnings: string[] = [];
    const matchingCriteria: string[] = [];

    matchingCriteria.push(
      `Topic similarity: ${(similarity * 100).toFixed(1)}%`,
    );
    matchingCriteria.push(`Pattern occurrences: ${pattern.occurrences}`);

    if (pattern.successRate >= 0.7) {
      recommendations.push(
        "This pattern has high success rate - consider adopting similar approaches",
      );
      recommendations.push(
        `Successful designs include: ${pattern.successfulDesigns.length} proposals`,
      );
    } else if (pattern.successRate >= 0.4) {
      recommendations.push(
        "Moderate success rate - combine with other strategies",
      );
      warnings.push(
        "Mixed results - validate approach with small-scale test first",
      );
    } else {
      warnings.push("Low success rate pattern - proceed with caution");
      warnings.push("Consider alternative approaches");
    }

    for (const conflict of pattern.commonConflicts.slice(0, 3)) {
      warnings.push(
        `Common conflict: ${conflict.type} (${conflict.description})`,
      );
      if (conflict.severity === "high") {
        warnings.push(`High severity conflict detected: ${conflict.type}`);
      }
    }

    for (const resolution of pattern.resolutionPatterns.slice(0, 2)) {
      if (resolution.effectiveness >= 0.7) {
        recommendations.push(`Effective resolution: ${resolution.description}`);
      }
    }

    return {
      pattern: pattern.topic,
      successRate: pattern.successRate,
      recommendations: [...new Set(recommendations)],
      warnings: [...new Set(warnings)],
      matchingCriteria,
      frequency: pattern.occurrences,
    };
  }
}

// ============================================================================
// DebateLearningSystem Class
// ============================================================================

/**
 * Main system for learning from debate outcomes and managing patterns
 */
export class DebateLearningSystem {
  private database: PatternDatabase;
  private analyzer: HistoricalAnalyzer;

  constructor(config?: Partial<PatternLearningConfig>) {
    this.database = new PatternDatabase(config);
    this.analyzer = new HistoricalAnalyzer(this.database);
  }

  /**
   * Learns from a debate outcome and stores extracted patterns
   * @param debate - The debate to learn from
   * @param outcome - The outcome of the debate
   * @returns The extracted pattern
   */
  learnFromDebate(
    debate: DebateOutcome,
    outcome: "success" | "failure" | "partial",
  ): DebatePattern {
    const successfulDesigns: Proposal[] = [];
    const failedDesigns: Proposal[] = [];
    const commonConflicts: Conflict[] = [...debate.conflicts];

    for (const proposal of debate.proposals) {
      if (proposal.id === debate.winningProposalId) {
        successfulDesigns.push(proposal);
      } else if (outcome === "failure") {
        failedDesigns.push(proposal);
      } else if (outcome === "partial") {
        if (proposal.votes > debate.proposals.length / 2) {
          successfulDesigns.push(proposal);
        } else {
          failedDesigns.push(proposal);
        }
      }
    }

    const recommendations = this.extractRecommendations(debate, outcome);

    const patternData: Omit<DebatePattern, "patternId" | "lastUpdated"> = {
      topic: debate.topic,
      successfulDesigns,
      failedDesigns,
      commonConflicts,
      resolutionPatterns: debate.resolutions,
      successRate:
        outcome === "success" ? 0.8 : outcome === "failure" ? 0.2 : 0.5,
      recommendations,
      occurrences: 1,
    };

    return this.database.storePattern(patternData);
  }

  /**
   * Finds relevant historical patterns for a topic
   * @param topic - Topic to find patterns for
   * @param threshold - Similarity threshold (optional)
   * @returns Array of similar patterns
   */
  findPatterns(
    topic: string,
    threshold?: number,
  ): Array<{ pattern: DebatePattern; similarity: number }> {
    return this.database.findSimilarPatterns(topic, threshold);
  }

  /**
   * Generates suggestions based on historical patterns
   * @param topic - Topic to generate suggestions for
   * @returns Array of historical suggestions
   */
  suggestFromHistory(topic: string): HistoricalSuggestion[] {
    return this.analyzer.suggestFromHistory(topic);
  }

  /**
   * Updates pattern database with new data
   * @param patterns - Patterns to add or update
   * @param outcome - The outcome associated with these patterns
   * @returns Array of updated patterns
   */
  updatePatternDatabase(
    patterns: DebatePattern[],
    outcome: "success" | "failure" | "partial",
  ): DebatePattern[] {
    return patterns.map((pattern) => {
      const successRate =
        outcome === "success"
          ? Math.min(pattern.successRate + 0.1, 1)
          : outcome === "failure"
            ? Math.max(pattern.successRate - 0.1, 0)
            : pattern.successRate;

      return this.database.updatePattern(pattern.patternId, { successRate })!;
    });
  }

  /**
   * Calculates success rate for a specific pattern
   * @param patternId - Pattern ID to calculate for
   * @returns Success rate between 0 and 1
   */
  calculateSuccessRate(patternId: string): number {
    return this.analyzer.calculateSuccessRate(patternId);
  }

  /**
   * Gets the pattern database instance
   * @returns The pattern database
   */
  getDatabase(): PatternDatabase {
    return this.database;
  }

  /**
   * Gets the historical analyzer instance
   * @returns The historical analyzer
   */
  getAnalyzer(): HistoricalAnalyzer {
    return this.analyzer;
  }

  /**
   * Imports patterns from external source
   * @param patterns - Array of patterns to import
   * @returns Number of patterns imported
   */
  importPatterns(patterns: DebatePattern[]): number {
    let imported = 0;
    for (const pattern of patterns) {
      try {
        this.database.storePattern({
          topic: pattern.topic,
          successfulDesigns: pattern.successfulDesigns,
          failedDesigns: pattern.failedDesigns,
          commonConflicts: pattern.commonConflicts,
          resolutionPatterns: pattern.resolutionPatterns,
          successRate: pattern.successRate,
          recommendations: pattern.recommendations,
          occurrences: pattern.occurrences,
        });
        imported++;
      } catch {
        // Skip patterns that fail to import
      }
    }
    return imported;
  }

  /**
   * Exports all patterns from the database
   * @returns Array of all patterns
   */
  exportPatterns(): DebatePattern[] {
    return this.database.getAllPatterns();
  }

  private extractRecommendations(
    debate: DebateOutcome,
    outcome: "success" | "failure" | "partial",
  ): string[] {
    const recommendations: string[] = [];

    if (outcome === "success") {
      recommendations.push("Successful debate approach identified");
      recommendations.push("Consider replicating the proposal structure");

      for (const resolution of debate.resolutions) {
        if (resolution.effectiveness >= 0.7) {
          recommendations.push(
            `Effective resolution pattern: ${resolution.pattern}`,
          );
        }
      }
    } else if (outcome === "failure") {
      recommendations.push(
        "Review failed proposals for improvement opportunities",
      );
      recommendations.push(
        "Consider alternative conflict resolution strategies",
      );

      for (const conflict of debate.conflicts) {
        if (conflict.severity === "high") {
          recommendations.push(
            `Address high-severity conflict: ${conflict.type}`,
          );
        }
      }
    } else {
      recommendations.push("Partial success - identify areas for improvement");
      recommendations.push("Balance successful and failed design elements");
    }

    if (debate.participantSatisfaction >= 0.7) {
      recommendations.push("High participant satisfaction achieved");
    } else if (debate.participantSatisfaction < 0.4) {
      recommendations.push("Consider participant feedback in future debates");
    }

    return recommendations;
  }
}

// ============================================================================
// Unit Tests
// ============================================================================

export function runTests(): void {
  console.log("Running Debate Pattern Learning System tests...\n");

  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => boolean): void {
    try {
      if (fn()) {
        console.log(`✓ ${name}`);
        passed++;
      } else {
        console.log(`✗ ${name}`);
        failed++;
      }
    } catch (e) {
      console.log(`✗ ${name} - Error: ${e}`);
      failed++;
    }
  }

  // Test PatternDatabase
  test("PatternDatabase: Should create a new database", () => {
    const db = new PatternDatabase();
    return db.count() === 0;
  });

  test("PatternDatabase: Should store a pattern", () => {
    const db = new PatternDatabase();
    const pattern = db.storePattern({
      topic: "Test Topic",
      successfulDesigns: [],
      failedDesigns: [],
      commonConflicts: [],
      resolutionPatterns: [],
      successRate: 0.5,
      recommendations: [],
      occurrences: 1,
    });
    return pattern.topic === "Test Topic" && pattern.patternId.length > 0;
  });

  test("PatternDatabase: Should find pattern by topic", () => {
    const db = new PatternDatabase();
    db.storePattern({
      topic: "Machine Learning",
      successfulDesigns: [],
      failedDesigns: [],
      commonConflicts: [],
      resolutionPatterns: [],
      successRate: 0.7,
      recommendations: [],
      occurrences: 1,
    });
    const found = db.findByTopic("Machine Learning");
    return found !== undefined && found.topic === "Machine Learning";
  });

  test("PatternDatabase: Should find similar patterns", () => {
    const db = new PatternDatabase();
    db.storePattern({
      topic: "Artificial Intelligence Ethics",
      successfulDesigns: [],
      failedDesigns: [],
      commonConflicts: [],
      resolutionPatterns: [],
      successRate: 0.8,
      recommendations: [],
      occurrences: 1,
    });
    db.storePattern({
      topic: "Machine Learning Algorithms",
      successfulDesigns: [],
      failedDesigns: [],
      commonConflicts: [],
      resolutionPatterns: [],
      successRate: 0.6,
      recommendations: [],
      occurrences: 1,
    });
    const similar = db.findSimilarPatterns("AI Ethics");
    return similar.length > 0;
  });

  test("PatternDatabase: Should merge patterns on duplicate topic", () => {
    const db = new PatternDatabase();
    db.storePattern({
      topic: "Test Topic",
      successfulDesigns: [
        { id: "1", content: "A", design: {}, votes: 10, timestamp: new Date() },
      ],
      failedDesigns: [],
      commonConflicts: [],
      resolutionPatterns: [],
      successRate: 1.0,
      recommendations: ["Rec 1"],
      occurrences: 1,
    });
    const pattern = db.storePattern({
      topic: "Test Topic",
      successfulDesigns: [
        { id: "2", content: "B", design: {}, votes: 20, timestamp: new Date() },
      ],
      failedDesigns: [],
      commonConflicts: [],
      resolutionPatterns: [],
      successRate: 1.0,
      recommendations: ["Rec 2"],
      occurrences: 1,
    });
    return pattern.successfulDesigns.length === 2 && pattern.occurrences === 2;
  });

  test("PatternDatabase: Should filter by criteria", () => {
    const db = new PatternDatabase();
    db.storePattern({
      topic: "Topic A",
      successfulDesigns: [],
      failedDesigns: [],
      commonConflicts: [
        {
          id: "c1",
          type: "type1",
          description: "desc",
          participants: [],
          severity: "high",
        },
      ],
      resolutionPatterns: [],
      successRate: 0.9,
      recommendations: [],
      occurrences: 1,
    });
    const results = db.findPatterns({
      minSuccessRate: 0.8,
      conflictTypes: ["type1"],
    });
    return results.length === 1;
  });

  // Test HistoricalAnalyzer
  test("HistoricalAnalyzer: Should generate suggestions", () => {
    const db = new PatternDatabase();
    db.storePattern({
      topic: "Web Development",
      successfulDesigns: [],
      failedDesigns: [],
      commonConflicts: [],
      resolutionPatterns: [],
      successRate: 0.8,
      recommendations: ["Test thoroughly"],
      occurrences: 5,
    });
    const analyzer = new HistoricalAnalyzer(db);
    const suggestions = analyzer.suggestFromHistory("Web Apps");
    return suggestions.length > 0 && suggestions[0]!.successRate === 0.8;
  });

  test("HistoricalAnalyzer: Should calculate success rate", () => {
    const db = new PatternDatabase();
    const pattern = db.storePattern({
      topic: "Test",
      successfulDesigns: [],
      failedDesigns: [],
      commonConflicts: [],
      resolutionPatterns: [],
      successRate: 0.75,
      recommendations: [],
      occurrences: 1,
    });
    const analyzer = new HistoricalAnalyzer(db);
    return analyzer.calculateSuccessRate(pattern.patternId) === 0.75;
  });

  test("HistoricalAnalyzer: Should analyze common conflicts", () => {
    const db = new PatternDatabase();
    db.storePattern({
      topic: "Topic 1",
      successfulDesigns: [],
      failedDesigns: [],
      commonConflicts: [
        {
          id: "c1",
          type: "resource",
          description: "desc",
          participants: [],
          severity: "medium",
        },
      ],
      resolutionPatterns: [],
      successRate: 0.5,
      recommendations: [],
      occurrences: 1,
    });
    const analyzer = new HistoricalAnalyzer(db);
    const conflicts = analyzer.analyzeCommonConflicts("Related Topic");
    return conflicts.get("resource") === 1;
  });

  test("HistoricalAnalyzer: Should identify successful designs", () => {
    const db = new PatternDatabase();
    db.storePattern({
      topic: "Test",
      successfulDesigns: [
        {
          id: "1",
          content: "A",
          design: { key: "value" },
          votes: 100,
          timestamp: new Date(),
        },
      ],
      failedDesigns: [],
      commonConflicts: [],
      resolutionPatterns: [],
      successRate: 1.0,
      recommendations: [],
      occurrences: 1,
    });
    const analyzer = new HistoricalAnalyzer(db);
    const designs = analyzer.identifySuccessfulDesigns("Test");
    return designs.length > 0;
  });

  test("HistoricalAnalyzer: Should generate warnings", () => {
    const db = new PatternDatabase();
    db.storePattern({
      topic: "Topic",
      successfulDesigns: [],
      failedDesigns: [],
      commonConflicts: [
        {
          id: "c1",
          type: "conflict1",
          description: "High severity issue",
          participants: [],
          severity: "high",
        },
      ],
      resolutionPatterns: [],
      successRate: 0.3,
      recommendations: [],
      occurrences: 1,
    });
    const analyzer = new HistoricalAnalyzer(db);
    const warnings = analyzer.generateWarnings("Related Topic");
    return warnings.some((w) => w.includes("High severity"));
  });

  // Test DebateLearningSystem
  test("DebateLearningSystem: Should learn from debate", () => {
    const system = new DebateLearningSystem();
    const debate: DebateOutcome = {
      debateId: "d1",
      topic: "Climate Policy",
      proposals: [
        {
          id: "p1",
          content: "Proposal A",
          design: { type: "carbon" },
          votes: 150,
          timestamp: new Date(),
        },
        {
          id: "p2",
          content: "Proposal B",
          design: { type: "tax" },
          votes: 50,
          timestamp: new Date(),
        },
      ],
      conflicts: [
        {
          id: "c1",
          type: "economic",
          description: "Cost concerns",
          participants: [],
          severity: "medium",
        },
      ],
      resolutions: [
        {
          id: "r1",
          pattern: "compromise",
          effectiveness: 0.8,
          conflictTypes: ["economic"],
          description: "Economic compromise",
        },
      ],
      winningProposalId: "p1",
      participantSatisfaction: 0.8,
      timestamp: new Date(),
    };
    const pattern = system.learnFromDebate(debate, "success");
    return (
      pattern.topic === "Climate Policy" &&
      pattern.successfulDesigns.length === 1
    );
  });

  test("DebateLearningSystem: Should find patterns", () => {
    const system = new DebateLearningSystem();
    const debate: DebateOutcome = {
      debateId: "d2",
      topic: "Healthcare Reform",
      proposals: [],
      conflicts: [],
      resolutions: [],
      participantSatisfaction: 0.5,
      timestamp: new Date(),
    };
    system.learnFromDebate(debate, "success");
    const patterns = system.findPatterns("Healthcare");
    return patterns.length > 0;
  });

  test("DebateLearningSystem: Should suggest from history", () => {
    const system = new DebateLearningSystem();
    const debate: DebateOutcome = {
      debateId: "d3",
      topic: "Education Technology",
      proposals: [],
      conflicts: [],
      resolutions: [],
      participantSatisfaction: 0.7,
      timestamp: new Date(),
    };
    system.learnFromDebate(debate, "success");
    const suggestions = system.suggestFromHistory("EdTech");
    return suggestions.length > 0;
  });

  test("DebateLearningSystem: Should update pattern database", () => {
    const system = new DebateLearningSystem();
    const debate: DebateOutcome = {
      debateId: "d4",
      topic: "Update Test",
      proposals: [],
      conflicts: [],
      resolutions: [],
      participantSatisfaction: 0.5,
      timestamp: new Date(),
    };
    const pattern = system.learnFromDebate(debate, "success");
    const updated = system.updatePatternDatabase([pattern], "failure");
    return updated[0]!.successRate < pattern.successRate;
  });

  test("DebateLearningSystem: Should import/export patterns", () => {
    const system = new DebateLearningSystem();
    const exportData = system.exportPatterns();
    const imported = system.importPatterns(exportData);
    return imported === 0; // Empty export, no patterns to import
  });

  test("DebateLearningSystem: Should calculate success rate", () => {
    const system = new DebateLearningSystem();
    const debate: DebateOutcome = {
      debateId: "d5",
      topic: "Success Rate Test",
      proposals: [],
      conflicts: [],
      resolutions: [],
      participantSatisfaction: 0.6,
      timestamp: new Date(),
    };
    const pattern = system.learnFromDebate(debate, "success");
    const rate = system.calculateSuccessRate(pattern.patternId);
    return rate > 0;
  });

  // Test utility functions
  test("Utility: Jaccard similarity should work correctly", () => {
    const set1 = new Set(["a", "b", "c"]);
    const set2 = new Set(["b", "c", "d"]);
    const similarity = jaccardSimilarity(set1, set2);
    return similarity === 0.5; // Intersection: 2, Union: 4
  });

  test("Utility: Tokenization should work correctly", () => {
    const tokens = tokenize("Hello World Test");
    return tokens.has("hello") && tokens.has("world") && tokens.has("test");
  });

  test("Utility: Topic similarity should calculate correctly", () => {
    const sim = calculateTopicSimilarity(
      "Machine Learning",
      "Machine Learning Algorithms",
    );
    return sim > 0 && sim <= 1;
  });

  console.log(`\nTest Results: ${passed} passed, ${failed} failed`);
}

// ============================================================================
// Example Usage
// ============================================================================

if (require.main === module) {
  console.log("Debate Pattern Learning System - Example Usage\n");
  console.log("=".repeat(60));

  const learningSystem = new DebateLearningSystem({
    similarityThreshold: 0.5,
    maxPatternAgeDays: 90,
    minOccurrencesForPattern: 2,
    enableAutoLearning: true,
  });

  console.log("\n1. Learning from a successful debate...\n");
  const debate1: DebateOutcome = {
    debateId: "debate-001",
    topic: "Renewable Energy Policy",
    proposals: [
      {
        id: "p1",
        content: "Solar Subsidy Program",
        design: { type: "subsidy", amount: 1000000 },
        votes: 250,
        timestamp: new Date(),
      },
      {
        id: "p2",
        content: "Wind Farm Initiative",
        design: { type: "infrastructure", scale: "large" },
        votes: 180,
        timestamp: new Date(),
      },
      {
        id: "p3",
        content: "Nuclear Expansion",
        design: { type: "energy", source: "nuclear" },
        votes: 70,
        timestamp: new Date(),
      },
    ],
    conflicts: [
      {
        id: "c1",
        type: "cost",
        description: "High implementation costs",
        participants: ["Group A", "Group B"],
        severity: "high",
      },
      {
        id: "c2",
        type: "environmental",
        description: "Environmental impact concerns",
        participants: ["Group C"],
        severity: "medium",
      },
    ],
    resolutions: [
      {
        id: "r1",
        pattern: "phased_implementation",
        effectiveness: 0.85,
        conflictTypes: ["cost", "environmental"],
        description:
          "Implement in phases to manage costs and environmental impact",
      },
    ],
    winningProposalId: "p1",
    participantSatisfaction: 0.82,
    timestamp: new Date(),
  };

  const pattern1 = learningSystem.learnFromDebate(debate1, "success");
  console.log(`Stored pattern: ${pattern1.topic}`);
  console.log(`Success rate: ${(pattern1.successRate * 100).toFixed(1)}%`);
  console.log(`Recommendations: ${pattern1.recommendations.length}`);

  console.log("\n2. Learning from a failed debate...\n");
  const debate2: DebateOutcome = {
    debateId: "debate-002",
    topic: "Urban Traffic Management",
    proposals: [
      {
        id: "p4",
        content: "Congestion Pricing",
        design: { mechanism: "pricing" },
        votes: 40,
        timestamp: new Date(),
      },
      {
        id: "p5",
        content: "Public Transit Expansion",
        design: { mode: "bus", capacity: "high" },
        votes: 30,
        timestamp: new Date(),
      },
    ],
    conflicts: [
      {
        id: "c3",
        type: "equity",
        description: "Concerns about fairness to low-income drivers",
        participants: ["Advocacy Group"],
        severity: "high",
      },
    ],
    resolutions: [
      {
        id: "r2",
        pattern: "exemptions",
        effectiveness: 0.4,
        conflictTypes: ["equity"],
        description: "Provide exemptions for residents",
      },
    ],
    winningProposalId: undefined,
    participantSatisfaction: 0.25,
    timestamp: new Date(),
  };

  const pattern2 = learningSystem.learnFromDebate(debate2, "failure");
  console.log(`Stored pattern: ${pattern2.topic}`);
  console.log(`Success rate: ${(pattern2.successRate * 100).toFixed(1)}%`);

  console.log("\n3. Finding similar patterns...\n");
  const similarPatterns = learningSystem.findPatterns(
    "Sustainable Transportation",
  );
  console.log(`Found ${similarPatterns.length} similar pattern(s):`);
  for (const { pattern, similarity } of similarPatterns) {
    console.log(
      `  - ${pattern.topic} (${(similarity * 100).toFixed(1)}% similar)`,
    );
  }

  console.log("\n4. Generating historical suggestions...\n");
  const suggestions = learningSystem.suggestFromHistory("Green Infrastructure");
  console.log(`Generated ${suggestions.length} suggestion(s):`);
  for (const suggestion of suggestions) {
    console.log(`\nPattern: ${suggestion.pattern}`);
    console.log(`Success Rate: ${(suggestion.successRate * 100).toFixed(1)}%`);
    console.log(`Recommendations:`);
    for (const rec of suggestion.recommendations.slice(0, 2)) {
      console.log(`  - ${rec}`);
    }
  }

  console.log("\n5. Database statistics...\n");
  const stats = learningSystem.getAnalyzer().getStatistics();
  console.log(`Total patterns: ${stats.totalPatterns}`);
  console.log(
    `Average success rate: ${(stats.averageSuccessRate * 100).toFixed(1)}%`,
  );
  console.log(`Top pattern: ${stats.topPatterns[0]?.topic || "N/A"}`);

  console.log("\n6. Running unit tests...\n");
  runTests();

  console.log("\n" + "=".repeat(60));
  console.log("Example usage complete!\n");
}
