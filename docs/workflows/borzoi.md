# Borzoi Workflows

This document describes workflows for the Borzoi agent (pattern analysis, predictive organizing, and debate intelligence).

---

## Overview

Borzoi provides intelligent pattern analysis, predictive suggestions, and participates in multi-shepherd debates as the **Intelligence Shepherd**.

---

## Workflow 1: Pattern Analysis & Learning

Continuous learning of file organization patterns.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Pattern Analysis Workflow                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │  File Event     │───▶│  Analyze        │───▶│  Update          │        │
│  │  (Create/Move)  │    │  Patterns       │    │  Pattern Model  │        │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│                                                              │            │
│                                                              ▼            │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │  User           │───▶│  Generate        │───▶│  Present         │        │
│  │  Requests Help  │    │  Suggestions    │    │  Suggestions    │        │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### TypeScript Implementation

```typescript
import { BorzoiAgent } from "./borzoi.js";

interface PatternAnalysisConfig {
  minSamples: number;
  confidenceThreshold: number;
  maxPatterns: number;
  learningRate: number;
}

interface OrganizationSuggestion {
  id: string;
  type: "move" | "rename" | "categorize" | "archive" | "merge";
  confidence: number;
  reason: string;
  sourcePath: string;
  targetPath?: string;
  category?: string;
  estimatedImpact: "low" | "medium" | "high";
}

class PatternAnalysisWorkflow {
  private borzoi: BorzoiAgent;
  private config: PatternAnalysisConfig;

  constructor(borzoi: BorzoiAgent, config?: Partial<PatternAnalysisConfig>) {
    this.borzoi = borzoi;
    this.config = {
      minSamples: 5,
      confidenceThreshold: 0.7,
      maxPatterns: 100,
      learningRate: 0.1,
      ...config,
    };
  }

  async learnFromEvent(event: FileEvent): Promise<void> {
    // Extract patterns from file event
    const pattern = await this.borzoi.extractPattern(event);

    // Update learned patterns
    await this.borzoi.updatePatternModel(pattern);

    // Check if we can generate suggestions
    const patterns = await this.borzoi.getLearnedPatterns();
    for (const p of patterns) {
      if (p.sampleCount >= this.config.minSamples) {
        await this.generateSuggestionsForPattern(p);
      }
    }
  }

  async analyzeDirectory(directory: string): Promise<PatternReport> {
    const patterns = await this.borzoi.analyzePatterns(directory);

    return {
      directory,
      patterns,
      recommendations: await this.generateRecommendations(patterns),
      confidence: this.calculateConfidence(patterns),
      analyzedAt: new Date(),
    };
  }

  async suggestOrganization(
    directory: string,
  ): Promise<OrganizationSuggestion[]> {
    const patterns = await this.analyzePatterns(directory);

    const suggestions: OrganizationSuggestion[] = [];

    for (const pattern of patterns) {
      if (pattern.confidence >= this.config.confidenceThreshold) {
        const suggestion = await this.borzoi.generateSuggestion(pattern);
        if (suggestion) {
          suggestions.push(suggestion);
        }
      }
    }

    // Sort by confidence and impact
    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  async learnFromOutcome(
    suggestionId: string,
    outcome: "accepted" | "rejected" | "modified",
  ): Promise<void> {
    const suggestion = await this.borzoi.getSuggestion(suggestionId);
    if (!suggestion) return;

    // Learn from user feedback
    await this.borzoi.updatePatternFromOutcome(suggestion, outcome);

    // Adjust confidence based on outcome
    await this.borzoi.adjustPatternConfidence(suggestion, outcome);
  }

  private async generateRecommendations(
    patterns: LearnedPattern[],
  ): Promise<string[]> {
    const recommendations: string[] = [];

    for (const pattern of patterns) {
      if (pattern.type === "category" && pattern.confidence > 0.8) {
        recommendations.push(
          `Consider creating a dedicated folder for "${pattern.value}" files`,
        );
      }
      if (pattern.type === "naming" && pattern.confidence > 0.7) {
        recommendations.push(`Apply naming convention: ${pattern.value}`);
      }
    }

    return recommendations;
  }

  private calculateConfidence(patterns: LearnedPattern[]): number {
    if (patterns.length === 0) return 0;

    const totalConfidence = patterns.reduce((sum, p) => sum + p.confidence, 0);
    const sampleBonus = Math.min(patterns.length / 20, 0.2);

    return Math.min(totalConfidence / patterns.length + sampleBonus, 1);
  }
}

interface FileEvent {
  type: "create" | "move" | "rename" | "delete";
  path: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

interface LearnedPattern {
  id: string;
  type: "category" | "naming" | "location" | "temporal";
  value: string;
  confidence: number;
  sampleCount: number;
  lastUpdated: Date;
}

interface PatternReport {
  directory: string;
  patterns: LearnedPattern[];
  recommendations: string[];
  confidence: number;
  analyzedAt: Date;
}
```

---

## Workflow 2: Borzoi in Multi-Shepherd Debate

Borzoi participates as the **Intelligence Shepherd** providing pattern analysis and predictive insights.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Borzoi Debate Intelligence Workflow                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Multi-Shepherd Debate                              │   │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────────────┐ │   │
│  │  │Architect │ │Performance│ │ Security  │ │  BORZOI (NEW!)    │ │   │
│  │  │           │ │           │ │           │ │  Intelligence     │ │   │
│  │  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────────┬─────────┘ │   │
│  └────────┼─────────────┼─────────────┼─────────────────┼───────────┘   │
│           │             │             │                 │                  │
│           ▼             ▼             ▼                 ▼                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Borzoi Debate Contribution                       │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │   │
│  │  │ Pattern Analysis │  │ Predictive      │  │ Risk Assessment │    │   │
│  │  │ of Proposals    │  │ Success Score   │  │ & Mitigation    │    │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  PHASES:                                                                    │
│  1. Idea Generation     → Borzoi suggests proven patterns                   │
│  2. Cross-Validation   → Borzoi analyzes all proposals                     │
│  3. Conflict Resolution → Borzoi predicts potential conflicts              │
│  4. Consensus          → Borzoi provides confidence scoring                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### TypeScript Implementation

```typescript
import { BorzoiAgent } from "./borzoi.js";
import {
  ShepherdSpecialty,
  Proposal,
  Debate,
} from "./multi-shepherd-debate.js";

export class IntelligenceShepherd {
  private borzoi: BorzoiAgent;
  private readonly specialty = ShepherdSpecialty.INTELLIGENCE;
  private readonly weight = 1.1;

  constructor(borzoi: BorzoiAgent) {
    this.borzoi = borzoi;
  }

  async validateProposal(proposal: Proposal): Promise<SpecialistValidation> {
    const concerns: string[] = [];
    const recommendations: string[] = [];
    let score = 1.0;

    // Borzoi analyzes proposal patterns
    const patternAnalysis = await this.borzoi.analyzeProposalPatterns(
      proposal.content,
    );

    // Check for anti-patterns
    const antiPatterns = await this.borzoi.detectAntiPatterns(proposal.content);
    if (antiPatterns.length > 0) {
      concerns.push(`Anti-patterns detected: ${antiPatterns.join(", ")}`);
      score -= 0.15 * antiPatterns.length;
    }

    // Check pattern efficiency
    if (!patternAnalysis.usesOptimalPatterns) {
      concerns.push("Proposal does not follow optimal patterns");
      score -= 0.1;
      recommendations.push(...patternAnalysis.suggestedPatterns);
    }

    // Check historical success
    const historicalAnalysis = await this.borzoi.analyzeHistoricalOutcomes(
      proposal.type,
      proposal.content,
    );
    if (historicalAnalysis.successRate < 0.6) {
      concerns.push(
        `Low historical success rate: ${(historicalAnalysis.successRate * 100).toFixed(0)}%`,
      );
      score -= 0.15;
    }

    return {
      specialty: this.specialty,
      score: Math.max(0, score),
      passed: score >= 0.7,
      concerns,
      recommendations,
      patternAnalysis,
      historicalData: historicalAnalysis,
    };
  }

  async assessQuality(proposal: Proposal): Promise<QualityScores> {
    const patternAnalysis = await this.borzoi.analyzeProposalPatterns(
      proposal.content,
    );
    const predictions = await this.borzoi.predictOutcome(proposal);
    const historicalData = await this.borzoi.analyzeHistoricalOutcomes(
      proposal.type,
      proposal.content,
    );

    return {
      architecturalSoundness: patternAnalysis.architecturalScore,
      performanceImpact: patternAnalysis.performanceScore,
      securityPosture: patternAnalysis.securityScore,
      maintainabilityScore: patternAnalysis.maintainabilityScore,
      deliveryRisk: 1 - predictions.successProbability,
      overallQuality: this.calculateOverallScore(
        patternAnalysis,
        predictions,
        historicalData,
      ),
    };
  }

  async contributeToDebate(debate: Debate): Promise<BorzoiDebateContribution> {
    const proposals = debate.proposals;

    // Phase 1: Pattern Analysis of all proposals
    const patternAnalysis = await this.analyzeAllProposals(proposals);

    // Phase 2: Predictive scoring
    const predictions = await this.predictProposalOutcomes(proposals);

    // Phase 3: Risk assessment
    const risks = await this.assessRisks(proposals);

    // Phase 4: Generate recommendations
    const recommendations = await this.generateDebateRecommendations(
      patternAnalysis,
      predictions,
      risks,
    );

    return {
      patternAnalysis,
      predictions,
      risks,
      recommendations,
      confidenceScore: this.calculateDebateConfidence(
        patternAnalysis,
        predictions,
      ),
    };
  }

  private async analyzeAllProposals(
    proposals: Proposal[],
  ): Promise<PatternAnalysisResult> {
    const results = await Promise.all(
      proposals.map((p) => this.borzoi.analyzeProposalPatterns(p.content)),
    );

    return {
      proposals: proposals.map((p, i) => ({
        id: p.id,
        patterns: results[i],
      })),
      commonPatterns: this.findCommonPatterns(results),
      antiPatterns: this.detectGlobalAntiPatterns(results),
      patternQuality: this.calculatePatternQuality(results),
    };
  }

  private async predictProposalOutcomes(
    proposals: Proposal[],
  ): Promise<PredictiveInsight> {
    const predictions = await Promise.all(
      proposals.map((p) => this.borzoi.predictOutcome(p)),
    );

    return {
      proposals: proposals.map((p, i) => ({
        id: p.id,
        successProbability: predictions[i].successProbability,
        estimatedComplexity: predictions[i].estimatedComplexity,
        risks: predictions[i].risks,
      })),
      expectedWinners: this.determineExpectedWinners(proposals, predictions),
      averageSuccessRate:
        predictions.reduce((sum, p) => sum + p.successProbability, 0) /
        predictions.length,
    };
  }

  private async assessRisks(proposals: Proposal[]): Promise<RiskAssessment> {
    const allRisks: Risk[] = [];

    for (const proposal of proposals) {
      const risks = await this.borzoi.identifyRisks(proposal);
      allRisks.push(...risks.map((r) => ({ ...r, proposalId: proposal.id })));
    }

    return {
      risks: allRisks,
      criticalRisks: allRisks.filter((r) => r.severity === "critical"),
      mitigationStrategies: await this.generateMitigationStrategies(allRisks),
    };
  }

  private async generateDebateRecommendations(
    patterns: PatternAnalysisResult,
    predictions: PredictiveInsight,
    risks: RiskAssessment,
  ): Promise<DebateRecommendation[]> {
    const recommendations: DebateRecommendation[] = [];

    // Recommend best proposal based on patterns
    const bestProposal = patterns.patternQuality.sort(
      (a, b) => b.score - a.score,
    )[0];
    if (bestProposal) {
      recommendations.push({
        type: "proposal-preference",
        targetId: bestProposal.id,
        reason: "Highest pattern quality score",
        confidence: bestProposal.score,
      });
    }

    // Recommend risk mitigations
    for (const risk of risks.criticalRisks) {
      const mitigation = risks.mitigationStrategies.find(
        (m) => m.riskId === risk.id,
      );
      if (mitigation) {
        recommendations.push({
          type: "risk-mitigation",
          targetId: risk.proposalId,
          reason: mitigation.strategy,
          confidence: mitigation.effectiveness,
        });
      }
    }

    // Recommend pattern improvements
    if (patterns.commonPatterns.length > 0) {
      recommendations.push({
        type: "pattern-adoption",
        targetId: "all",
        reason: `Common patterns detected: ${patterns.commonPatterns.join(", ")}`,
        confidence: 0.8,
      });
    }

    return recommendations;
  }

  private calculateOverallScore(
    patterns: PatternAnalysisResult,
    predictions: PredictiveInsight,
    historical: HistoricalAnalysis,
  ): number {
    const patternScore =
      patterns.patternQuality.reduce((sum, p) => sum + p.score, 0) /
      (patterns.patternQuality.length || 1);
    const successScore = predictions.averageSuccessRate;
    const historicalScore = historical.successRate;

    return patternScore * 0.3 + successScore * 0.4 + historicalScore * 0.3;
  }

  private calculateDebateConfidence(
    patterns: PatternAnalysisResult,
    predictions: PredictiveInsight,
  ): number {
    const patternConfidence =
      patterns.patternQuality.reduce((sum, p) => sum + p.confidence, 0) /
      (patterns.patternQuality.length || 1);
    const predictionConfidence = predictions.averageSuccessRate;

    return patternConfidence * 0.5 + predictionConfidence * 0.5;
  }

  private findCommonPatterns(results: ProposalPatternResult[]): string[] {
    const patternCounts = new Map<string, number>();
    for (const result of results) {
      for (const pattern of result.patterns) {
        patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);
      }
    }
    return Array.from(patternCounts.entries())
      .filter(([_, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .map(([pattern]) => pattern);
  }

  private detectGlobalAntiPatterns(
    results: ProposalPatternResult[],
  ): AntiPattern[] {
    const antiPatterns: AntiPattern[] = [];
    for (const result of results) {
      for (const anti of result.antiPatterns) {
        antiPatterns.push(anti);
      }
    }
    return antiPatterns;
  }

  private determineExpectedWinners(
    proposals: Proposal[],
    predictions: PredictiveInsight,
  ): string[] {
    return predictions.proposals
      .sort((a, b) => b.successProbability - a.successProbability)
      .slice(0, 3)
      .map((p) => p.id);
  }

  private async generateMitigationStrategies(
    risks: Risk[],
  ): Promise<Mitigation[]> {
    return Promise.all(
      risks.map(async (risk) => {
        const strategy = await this.borzoi.suggestMitigation(risk);
        return {
          riskId: risk.id,
          strategy,
          effectiveness: risk.severity === "critical" ? 0.7 : 0.9,
        };
      }),
    );
  }
}

interface BorzoiDebateContribution {
  patternAnalysis: PatternAnalysisResult;
  predictions: PredictiveInsight;
  risks: RiskAssessment;
  recommendations: DebateRecommendation[];
  confidenceScore: number;
}

interface PatternAnalysisResult {
  proposals: Array<{ id: string; patterns: ProposalPatternResult }>;
  commonPatterns: string[];
  antiPatterns: AntiPattern[];
  patternQuality: Array<{ id: string; score: number; confidence: number }>;
}

interface PredictiveInsight {
  proposals: Array<{
    id: string;
    successProbability: number;
    estimatedComplexity: number;
    risks: string[];
  }>;
  expectedWinners: string[];
  averageSuccessRate: number;
}

interface RiskAssessment {
  risks: Risk[];
  criticalRisks: Risk[];
  mitigationStrategies: Mitigation[];
}

interface Risk {
  id: string;
  proposalId: string;
  type: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
}

interface Mitigation {
  riskId: string;
  strategy: string;
  effectiveness: number;
}

interface DebateRecommendation {
  type: "proposal-preference" | "risk-mitigation" | "pattern-adoption";
  targetId: string;
  reason: string;
  confidence: number;
}

interface ProposalPatternResult {
  patterns: string[];
  antiPatterns: AntiPattern[];
  usesOptimalPatterns: boolean;
  suggestedPatterns: string[];
  architecturalScore: number;
  performanceScore: number;
  securityScore: number;
  maintainabilityScore: number;
}

interface AntiPattern {
  name: string;
  description: string;
  severity: "low" | "medium" | "high";
}

interface HistoricalAnalysis {
  successRate: number;
  sampleCount: number;
  commonFailures: string[];
}
```

---

## Workflow 3: Predictive Organizing

AI-powered suggestions based on learned patterns.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Predictive Organizing Workflow                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │  User Uploads   │───▶│  Borzoi          │───▶│  Generate        │        │
│  │  Files          │    │  Analyzes        │    │  Predictions     │        │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│                                                              │            │
│                                                              ▼            │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │  User Reviews   │───▶│  Apply          │───▶│  Learn From      │        │
│  │  Suggestions    │    │  Organization   │    │  Outcome         │        │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### TypeScript Implementation

```typescript
interface PredictiveOrganizingConfig {
  autoApplyThreshold: number;
  confirmationRequired: boolean;
  batchSize: number;
  dryRunEnabled: boolean;
}

class PredictiveOrganizingWorkflow {
  private borzoi: BorzoiAgent;
  private config: PredictiveOrganizingConfig;

  constructor(
    borzoi: BorzoiAgent,
    config?: Partial<PredictiveOrganizingConfig>,
  ) {
    this.borzoi = borzoi;
    this.config = {
      autoApplyThreshold: 0.95,
      confirmationRequired: true,
      batchSize: 50,
      dryRunEnabled: true,
      ...config,
    };
  }

  async analyzeAndSuggest(directory: string): Promise<PredictiveReport> {
    // Analyze current state
    const currentPatterns = await this.borzoi.analyzePatterns(directory);
    const historicalPatterns =
      await this.borzoi.getHistoricalPatterns(directory);

    // Generate predictions
    const predictions = await this.borzoi.predictOrganization(directory);

    // Create suggestions
    const suggestions = await this.createSuggestions(
      directory,
      currentPatterns,
      predictions,
    );

    return {
      directory,
      currentPatterns,
      predictions,
      suggestions,
      confidence: this.calculateOverallConfidence(currentPatterns, predictions),
      analyzedAt: new Date(),
    };
  }

  async previewOrganization(directory: string): Promise<OrganizationPreview> {
    const report = await this.analyzeAndSuggest(directory);

    // Create dry-run preview
    const preview: OrganizationPreview = {
      directory: directory,
      moves: [],
      renames: [],
      newFolders: [],
      archives: [],
      summary: {
        totalFiles: 0,
        affectedFiles: report.suggestions.length,
        estimatedTime: report.suggestions.length * 0.5, // seconds
        confidence: report.confidence,
      },
    };

    for (const suggestion of report.suggestions) {
      switch (suggestion.type) {
        case "move":
          preview.moves.push({
            from: suggestion.sourcePath,
            to: suggestion.targetPath!,
            reason: suggestion.reason,
            confidence: suggestion.confidence,
          });
          break;
        case "rename":
          preview.renames.push({
            path: suggestion.sourcePath,
            newName: suggestion.targetPath!.split("/").pop()!,
            reason: suggestion.reason,
            confidence: suggestion.confidence,
          });
          break;
        case "categorize":
          preview.newFolders.push({
            name: suggestion.category!,
            files: report.suggestions
              .filter((s) => s.category === suggestion.category)
              .map((s) => s.sourcePath),
            reason: suggestion.reason,
          });
          break;
        case "archive":
          preview.archives.push({
            path: suggestion.sourcePath,
            archivePath: suggestion.targetPath!,
            reason: suggestion.reason,
            confidence: suggestion.confidence,
          });
          break;
      }
    }

    preview.summary.totalFiles = await this.countFiles(directory);
    preview.summary.estimatedTime = preview.summary.affectedFiles * 0.3;

    return preview;
  }

  async applyOrganization(
    directory: string,
    suggestions: OrganizationSuggestion[],
    options?: {
      dryRun?: boolean;
      onConflict?: "skip" | "rename" | "overwrite";
    },
  ): Promise<OrganizationResult> {
    const dryRun = options?.dryRun ?? this.config.dryRunEnabled;

    const results: OrganizationResultItem[] = [];

    for (const suggestion of suggestions) {
      if (suggestion.confidence < 0.5) {
        results.push({
          suggestion,
          status: "skipped",
          reason: "Confidence too low",
        });
        continue;
      }

      if (
        suggestion.confidence >= this.config.autoApplyThreshold &&
        !this.config.confirmationRequired
      ) {
        // Auto-apply high-confidence suggestions
        const result = await this.executeSuggestion(
          suggestion,
          options?.onConflict,
        );
        results.push({
          suggestion,
          status: dryRun ? "would-apply" : "applied",
          ...result,
        });
      } else {
        // Require confirmation
        results.push({
          suggestion,
          status: "pending-confirmation",
          reason: "Confirmation required",
        });
      }
    }

    // Learn from applied suggestions
    for (const result of results) {
      if (result.status === "applied") {
        await this.borzoi.learnFromOrganization(result.suggestion);
      }
    }

    return {
      directory,
      results,
      totalProcessed: results.length,
      successCount: results.filter((r) => r.status === "applied").length,
      skippedCount: results.filter((r) => r.status === "skipped").length,
      pendingCount: results.filter((r) => r.status === "pending-confirmation")
        .length,
      dryRun,
    };
  }

  private async createSuggestions(
    directory: string,
    patterns: PatternReport,
    predictions: PredictionResult,
  ): Promise<OrganizationSuggestion[]> {
    const suggestions: OrganizationSuggestion[] = [];

    // Category-based suggestions
    for (const category of predictions.suggestedCategories) {
      const files = await this.findFilesForCategory(directory, category);
      if (files.length > 0) {
        suggestions.push({
          id: `cat-${category}-${Date.now()}`,
          type: "categorize",
          confidence: category.confidence,
          reason: `Detected ${files.length} ${category.name} files`,
          sourcePath: directory,
          category: category.name,
          estimatedImpact:
            files.length > 20 ? "high" : files.length > 10 ? "medium" : "low",
        });
      }
    }

    // Naming pattern suggestions
    for (const pattern of predictions.suggestedNamingPatterns) {
      const files = await this.findFilesMatchingPattern(directory, pattern);
      if (files.length > 0) {
        suggestions.push({
          id: `name-${pattern}-${Date.now()}`,
          type: "rename",
          confidence: pattern.confidence,
          reason: `Apply naming pattern: ${pattern}`,
          sourcePath: files[0],
          targetPath: this.applyNamingPattern(files[0], pattern),
          estimatedImpact: files.length > 10 ? "high" : "medium",
        });
      }
    }

    // Archive suggestions
    for (const archive of predictions.suggestedArchives) {
      suggestions.push({
        id: `arch-${archive.category}-${Date.now()}`,
        type: "archive",
        confidence: archive.confidence,
        reason: `Archive old ${archive.category} files`,
        sourcePath: archive.path,
        targetPath: `${directory}/Archive/${archive.category}`,
        estimatedImpact: archive.fileCount > 50 ? "high" : "medium",
      });
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  private async executeSuggestion(
    suggestion: OrganizationSuggestion,
    onConflict?: "skip" | "rename" | "overwrite",
  ): Promise<{ originalPath: string; newPath: string } | undefined> {
    // Implementation for executing organization suggestion
    return undefined;
  }

  private calculateOverallConfidence(
    patterns: PatternReport,
    predictions: PredictionResult,
  ): number {
    const patternConfidence = patterns.confidence;
    const predictionConfidence = predictions.confidence;

    return patternConfidence * 0.4 + predictionConfidence * 0.6;
  }

  private async findFilesForCategory(
    directory: string,
    category: CategoryPrediction,
  ): Promise<string[]> {
    return [];
  }

  private async findFilesMatchingPattern(
    directory: string,
    pattern: string,
  ): Promise<string[]> {
    return [];
  }

  private applyNamingPattern(path: string, pattern: string): string {
    return path;
  }

  private async countFiles(directory: string): Promise<number> {
    return 0;
  }
}

interface PredictiveReport {
  directory: string;
  currentPatterns: PatternReport;
  predictions: PredictionResult;
  suggestions: OrganizationSuggestion[];
  confidence: number;
  analyzedAt: Date;
}

interface OrganizationPreview {
  directory: string;
  moves: Array<{
    from: string;
    to: string;
    reason: string;
    confidence: number;
  }>;
  renames: Array<{
    path: string;
    newName: string;
    reason: string;
    confidence: number;
  }>;
  newFolders: Array<{ name: string; files: string[]; reason: string }>;
  archives: Array<{
    path: string;
    archivePath: string;
    reason: string;
    confidence: number;
  }>;
  summary: {
    totalFiles: number;
    affectedFiles: number;
    estimatedTime: number;
    confidence: number;
  };
}

interface PredictionResult {
  suggestedCategories: CategoryPrediction[];
  suggestedNamingPatterns: NamingPattern[];
  suggestedArchives: ArchiveSuggestion[];
  confidence: number;
}

interface CategoryPrediction {
  name: string;
  confidence: number;
  extensions: string[];
}

interface NamingPattern {
  pattern: string;
  confidence: number;
  examples: string[];
}

interface ArchiveSuggestion {
  category: string;
  path: string;
  fileCount: number;
  confidence: number;
}

interface OrganizationResult {
  directory: string;
  results: OrganizationResultItem[];
  totalProcessed: number;
  successCount: number;
  skippedCount: number;
  pendingCount: number;
  dryRun: boolean;
}

interface OrganizationResultItem {
  suggestion: OrganizationSuggestion;
  status:
    | "applied"
    | "would-apply"
    | "skipped"
    | "pending-confirmation"
    | "failed";
  reason?: string;
  originalPath?: string;
  newPath?: string;
  error?: string;
}
```

---

## Workflow 4: Continuous Improvement

Learning from outcomes to improve predictions.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Continuous Improvement Workflow                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │  Operation      │───▶│  Record          │───▶│  Analyze         │        │
│  │  Complete       │    │  Outcome         │    │  Results         │        │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│                                                              │            │
│                                                              ▼            │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │  Update          │───▶│  Adjust           │───▶│  Improve          │        │
│  │  Pattern Model   │    │  Confidence      │    │  Predictions     │        │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### TypeScript Implementation

```typescript
interface ImprovementConfig {
  learningInterval: number;
  minSamplesForLearning: number;
  confidenceAdjustmentRate: number;
  patternDecayFactor: number;
}

class ContinuousImprovementWorkflow {
  private borzoi: BorzoiAgent;
  private config: ImprovementConfig;

  constructor(borzoi: BorzoiAgent, config?: Partial<ImprovementConfig>) {
    this.borzoi = borzoi;
    this.config = {
      learningInterval: 3600000, // 1 hour
      minSamplesForLearning: 10,
      confidenceAdjustmentRate: 0.05,
      patternDecayFactor: 0.95,
      ...config,
    };
  }

  async learnFromOutcome(
    context: OrganizationContext,
    outcome: OutcomeType,
  ): Promise<void> {
    // Record the outcome
    await this.borzoi.recordOutcome(context, outcome);

    // Check if we have enough samples to learn
    const recentOutcomes = await this.borzoi.getRecentOutcomes(
      context.suggestionId,
    );
    if (recentOutcomes.length < this.config.minSamplesForLearning) {
      return;
    }

    // Analyze patterns in outcomes
    const analysis = await this.borzoi.analyzeOutcomes(recentOutcomes);

    // Update pattern models
    await this.updatePatternModels(analysis);

    // Adjust confidences
    await this.adjustConfidences(analysis);
  }

  async executeLearningCycle(): Promise<LearningReport> {
    const patterns = await this.borzoi.getLearnedPatterns();
    const updates: PatternUpdate[] = [];

    for (const pattern of patterns) {
      const outcomes = await this.borzoi.getPatternOutcomes(pattern.id);
      if (outcomes.length >= this.config.minSamplesForLearning) {
        const update = await this.calculatePatternUpdate(pattern, outcomes);
        updates.push(update);

        // Apply update
        await this.borzoi.updatePattern(pattern.id, update);
      }
    }

    // Decay unused patterns
    await this.decayUnusedPatterns();

    return {
      timestamp: new Date(),
      patternsUpdated: updates.length,
      updates,
      recommendations: await this.generateImprovementRecommendations(updates),
    };
  }

  private async updatePatternModels(analysis: OutcomeAnalysis): Promise<void> {
    for (const [patternId, stats] of analysis.patternStats) {
      await this.borzoi.updatePatternModel(patternId, {
        successRate: stats.successRate,
        averageConfidence: stats.averageConfidence,
        commonFailureModes: stats.failureModes,
      });
    }
  }

  private async adjustConfidences(analysis: OutcomeAnalysis): Promise<void> {
    for (const [patternId, stats] of analysis.patternStats) {
      const adjustment = this.calculateConfidenceAdjustment(
        stats.successRate,
        stats.averageConfidence,
      );

      await this.borzoi.adjustPatternConfidence(patternId, adjustment);
    }
  }

  private async calculatePatternUpdate(
    pattern: LearnedPattern,
    outcomes: OrganizationOutcome[],
  ): Promise<PatternUpdate> {
    const successRate =
      outcomes.filter((o) => o.type === "accepted" || o.type === "modified")
        .length / outcomes.length;

    const avgConfidence =
      outcomes.reduce((sum, o) => sum + o.confidence, 0) / outcomes.length;

    const failureModes = this.identifyFailureModes(outcomes);

    return {
      patternId: pattern.id,
      newConfidence:
        pattern.confidence +
        this.config.confidenceAdjustmentRate * (successRate - 0.5),
      successRate,
      failureModes,
      samplesUsed: outcomes.length,
    };
  }

  private calculateConfidenceAdjustment(
    successRate: number,
    averageConfidence: number,
  ): number {
    // If confidence was accurate (close to actual success rate), adjust less
    const accuracy = 1 - Math.abs(averageConfidence - successRate);
    return (
      this.config.confidenceAdjustmentRate * (successRate - 0.5) * accuracy
    );
  }

  private async decayUnusedPatterns(): Promise<void> {
    const patterns = await this.borzoi.getLearnedPatterns();
    const cutoff = Date.now() - this.config.learningInterval * 24 * 7; // 1 week

    for (const pattern of patterns) {
      if (pattern.lastUsed.getTime() < cutoff) {
        await this.borzoi.decayPattern(
          pattern.id,
          this.config.patternDecayFactor,
        );
      }
    }
  }

  private identifyFailureModes(outcomes: OrganizationOutcome[]): string[] {
    const failures = outcomes.filter((o) => o.type === "rejected");
    const modes = new Set<string>();

    for (const failure of failures) {
      if (failure.feedback) {
        modes.add(failure.feedback);
      }
    }

    return Array.from(modes);
  }

  private async generateImprovementRecommendations(
    updates: PatternUpdate[],
  ): Promise<string[]> {
    const recommendations: string[] = [];

    for (const update of updates) {
      if (update.newConfidence < 0.5) {
        recommendations.push(
          `Pattern "${update.patternId}" has low confidence (${update.newConfidence.toFixed(2)}). Consider reviewing examples.`,
        );
      }

      if (update.failureModes.length > 0) {
        recommendations.push(
          `Common failure for "${update.patternId}": ${update.failureModes.join(", ")}`,
        );
      }
    }

    return recommendations;
  }
}

interface OrganizationContext {
  suggestionId: string;
  directory: string;
  suggestion: OrganizationSuggestion;
  userId?: string;
  timestamp: Date;
}

type OutcomeType = "accepted" | "rejected" | "modified" | "ignored";

interface OrganizationOutcome {
  suggestionId: string;
  type: OutcomeType;
  confidence: number;
  timestamp: Date;
  feedback?: string;
}

interface OutcomeAnalysis {
  patternStats: Map<string, PatternStats>;
  overallSuccessRate: number;
}

interface PatternStats {
  successRate: number;
  averageConfidence: number;
  failureModes: string[];
}

interface PatternUpdate {
  patternId: string;
  newConfidence: number;
  successRate: number;
  failureModes: string[];
  samplesUsed: number;
}

interface LearningReport {
  timestamp: Date;
  patternsUpdated: number;
  updates: PatternUpdate[];
  recommendations: string[];
}
```

---

## Workflow Integration

### With Multi-Shepherd Debate

```typescript
// Register Borzoi as Intelligence Shepherd
const debateRegistry = {
  specialty: ShepherdSpecialty.INTELLIGENCE,
  shepherdClass: IntelligenceShepherd,
  phases: [
    "idea-generation",
    "cross-validation",
    "conflict-resolution",
    "consensus",
  ],
  weight: 1.1,
};
```

### Command Triggers

```typescript
const borzoiCommands = {
  "workflow:analyze": async (directory: string) => {
    const workflow = new PatternAnalysisWorkflow(borzoi);
    return workflow.analyzeDirectory(directory);
  },

  "workflow:suggest": async (directory: string) => {
    const workflow = new PatternAnalysisWorkflow(borzoi);
    return workflow.suggestOrganization(directory);
  },

  "workflow:predict": async (directory: string) => {
    const workflow = new PredictiveOrganizingWorkflow(borzoi);
    return workflow.previewOrganization(directory);
  },

  "workflow:learn": async (
    context: OrganizationContext,
    outcome: OutcomeType,
  ) => {
    const workflow = new ContinuousImprovementWorkflow(borzoi);
    return workflow.learnFromOutcome(context, outcome);
  },

  "workflow:debate-intelligence": async (debate: Debate) => {
    const shepherd = new IntelligenceShepherd(borzoi);
    return shepherd.contributeToDebate(debate);
  },
};
```

---

## Configuration Example

```typescript
const borzoiConfig = {
  patternAnalysis: {
    minSamples: 5,
    confidenceThreshold: 0.7,
    maxPatterns: 100,
    learningRate: 0.1,
  },

  debateIntelligence: {
    weight: 1.1,
    phases: [
      "idea-generation",
      "cross-validation",
      "conflict-resolution",
      "consensus",
    ],
  },

  predictiveOrganizing: {
    autoApplyThreshold: 0.95,
    confirmationRequired: true,
    batchSize: 50,
    dryRunEnabled: true,
  },

  continuousLearning: {
    learningInterval: 3600000,
    minSamplesForLearning: 10,
    confidenceAdjustmentRate: 0.05,
    patternDecayFactor: 0.95,
  },
};
```
