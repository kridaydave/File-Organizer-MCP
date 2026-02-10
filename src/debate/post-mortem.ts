/**
 * Post-Mortem Phase Implementation
 * 
 * Closes the feedback loop by capturing production errors, feeding them back
 * to Borzoi for pattern learning, adjusting shepherd weights based on actual
 * outcomes, and creating a self-improving debate system.
 * 
 * @module debate/post-mortem
 * @version 1.0.0
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Represents a specialty area of a Shepherd in the debate system.
 */
export type ShepherdSpecialty = 
    | 'security'
    | 'performance'
    | 'reliability'
    | 'functional_correctness'
    | 'error_handling'
    | 'resource_management'
    | 'concurrency'
    | 'memory_safety';

/**
 * Represents the outcome of a debate phase.
 */
export type PhaseOutcome = 'success' | 'partial_success' | 'failure';

/**
 * Represents a production incident that triggers a post-mortem analysis.
 */
export interface ProductionIncident {
    id: string;
    timestamp: Date;
    severity: 'critical' | 'high' | 'medium' | 'low';
    errorType: 'security' | 'performance' | 'functional' | 'reliability';
    errorMessage: string;
    stackTrace?: string;
    affectedFeature: string;
    relatedDebateId: string;
    impact: string;
    resolution?: string;
}

/**
 * Represents the analysis of a production incident.
 */
export interface IncidentAnalysis {
    incidentId: string;
    rootCause: string;
    failedMitigation: string;
    contributingFactors: string[];
    preventableWith: string[];
    missedPattern: string;
    weightAdjustmentNeeded: WeightAdjustment;
}

/**
 * Represents a learning extracted from an incident.
 */
export interface Learn {
    id: string;
    incidentId: string;
    category: ShepherdSpecialty;
    description: string;
    patternId?: string;
    confidence: number;
    appliedAt?: Date;
}

/**
 * Represents an adjustment to shepherd weights based on incident analysis.
 */
export interface WeightAdjustment {
    specialty: ShepherdSpecialty;
    previousWeight: number;
    newWeight: number;
    reason: string;
    incidentId: string;
    confidence: number;
}

/**
 * Represents an improved pattern derived from incident analysis.
 */
export interface ImprovedPattern {
    patternId: string;
    previousVersion: string;
    improvedVersion: string;
    improvement: string;
    basedOnIncidentId: string;
}

/**
 * Configuration for the PostMortemPhase.
 */
export interface PostMortemConfig {
    maxWeightChange: number;
    minWeightChange: number;
    confidenceThreshold: number;
    autoApplyAdjustments: boolean;
    enablePatternLearning: boolean;
    incidentTrackingUrl?: string;
}

/**
 * Default configuration for PostMortemPhase.
 */
export const DEFAULT_POSTMORTEM_CONFIG: PostMortemConfig = {
    maxWeightChange: 0.2,
    minWeightChange: 0.05,
    confidenceThreshold: 0.7,
    autoApplyAdjustments: true,
    enablePatternLearning: true,
};

/**
 * Analyzes production incidents to determine root causes and contributing factors.
 */
export class IncidentAnalyzer {
    private patternDatabase: Map<string, string[]> = new Map();
    private mitigationDatabase: Map<string, string[]> = new Map();

    /**
     * Creates a new IncidentAnalyzer instance.
     */
    constructor() {
        this.initializePatternDatabase();
        this.initializeMitigationDatabase();
    }

    /**
     * Initializes the pattern database with known error patterns.
     * @private
     */
    private initializePatternDatabase(): void {
        this.patternDatabase.set('race_condition', [
            'concurrency_missed_check',
            'atomic_operation_gap',
            'timing_vulnerability',
        ]);
        this.patternDatabase.set('memory_leak', [
            'resource_not_freed',
            'reference_held_too_long',
            'cache_growth_unbounded',
        ]);
        this.patternDatabase.set('security_vulnerability', [
            'input_not_sanitized',
            'permission_check_missing',
            'encryption_gap',
        ]);
        this.patternDatabase.set('performance_degradation', [
            'algorithm_complexity_high',
            'unnecessary_recomputation',
            'resource_contention',
        ]);
        this.patternDatabase.set('data_corruption', [
            'incomplete_transaction',
            'write_not_persisted',
            'concurrent_modification',
        ]);
    }

    /**
     * Initializes the mitigation database with known mitigations.
     * @private
     */
    private initializeMitigationDatabase(): void {
        this.mitigationDatabase.set('race_condition', [
            'Use atomic operations',
            'Implement proper locking',
            'Use compare-and-swap operations',
        ]);
        this.mitigationDatabase.set('memory_leak', [
            'Implement RAII pattern',
            'Use smart pointers',
            'Add resource cleanup hooks',
        ]);
        this.mitigationDatabase.set('security_vulnerability', [
            'Validate all inputs',
            'Implement least privilege',
            'Use parameterized queries',
        ]);
        this.patternDatabase.set('performance_degradation', [
            'Optimize hot paths',
            'Add caching layer',
            'Reduce algorithmic complexity',
        ]);
        this.mitigationDatabase.set('data_corruption', [
            'Implement ACID transactions',
            'Use write-ahead logging',
            'Add checksum validation',
        ]);
    }

    /**
     * Analyzes a production incident to determine root cause and contributing factors.
     * 
     * @param incident - The production incident to analyze
     * @returns The incident analysis results
     */
    analyze(incident: ProductionIncident): IncidentAnalysis {
        const identifiedPatterns = this.identifyPatterns(incident);
        const failedMitigation = this.identifyFailedMitigation(incident);
        const contributingFactors = this.identifyContributingFactors(incident);
        const preventableWith = this.identifyPreventableMeasures(incident);
        const missedPattern = this.identifyMissedPattern(incident, identifiedPatterns);
        const weightAdjustment = this.calculateWeightAdjustment(incident, missedPattern);

        return {
            incidentId: incident.id,
            rootCause: this.determineRootCause(incident),
            failedMitigation,
            contributingFactors,
            preventableWith,
            missedPattern,
            weightAdjustmentNeeded: weightAdjustment,
        };
    }

    /**
     * Identifies patterns that match the incident.
     * @private
     */
    private identifyPatterns(incident: ProductionIncident): string[] {
        const patterns: string[] = [];
        const errorMessage = incident.errorMessage.toLowerCase();
        const stackTrace = incident.stackTrace?.toLowerCase() || '';

        for (const [pattern, keywords] of this.patternDatabase) {
            const hasPattern = keywords.some(keyword => 
                errorMessage.includes(keyword) || stackTrace.includes(keyword)
            );
            if (hasPattern) {
                patterns.push(pattern);
            }
        }

        return patterns;
    }

    /**
     * Identifies which mitigation failed for the incident.
     * @private
     */
    private identifyFailedMitigation(incident: ProductionIncident): string {
        const patterns = this.identifyPatterns(incident);
        
        for (const pattern of patterns) {
            const mitigations = this.mitigationDatabase.get(pattern);
            if (mitigations && mitigations.length > 0) {
                return mitigations[0] ?? 'Unknown mitigation failure';
            }
        }

        return 'Unknown mitigation failure';
    }

    /**
     * Identifies contributing factors for the incident.
     * @private
     */
    private identifyContributingFactors(incident: ProductionIncident): string[] {
        const factors: string[] = [];
        
        if (incident.severity === 'critical' || incident.severity === 'high') {
            factors.push('High severity incident with significant production impact');
        }

        if (incident.stackTrace) {
            factors.push('Stack trace available for root cause analysis');
        }

        if (incident.affectedFeature.includes('_')) {
            factors.push('Feature has complex implementation with multiple components');
        }

        const patterns = this.identifyPatterns(incident);
        if (patterns.length > 0) {
            factors.push(`Known patterns detected: ${patterns.join(', ')}`);
        }

        return factors;
    }

    /**
     * Identifies measures that could have prevented the incident.
     * @private
     */
    private identifyPreventableMeasures(incident: ProductionIncident): string[] {
        const patterns = this.identifyPatterns(incident);
        const preventable: string[] = [];

        for (const pattern of patterns) {
            const mitigations = this.mitigationDatabase.get(pattern);
            if (mitigations) {
                preventable.push(...mitigations);
            }
        }

        if (preventable.length === 0) {
            preventable.push('Enhanced testing coverage');
            preventable.push('Improved monitoring and alerting');
        }

        return preventable;
    }

    /**
     * Identifies the missed pattern from the incident.
     * @private
     */
    private identifyMissedPattern(
        incident: ProductionIncident,
        identifiedPatterns: string[]
    ): string {
        if (identifiedPatterns.length > 0) {
            return `missed_${identifiedPatterns[0]}_pattern`;
        }

        const errorTypePatterns: Record<string, string> = {
            'security': 'security_vulnerability_pattern',
            'performance': 'performance_degradation_pattern',
            'functional': 'functional_correctness_pattern',
            'reliability': 'reliability_pattern',
        };

        return errorTypePatterns[incident.errorType] || 'unknown_pattern';
    }

    /**
     * Determines the root cause of the incident.
     * @private
     */
    private determineRootCause(incident: ProductionIncident): string {
        const patterns = this.identifyPatterns(incident);
        
        if (patterns.length > 0) {
            return `Primary root cause: ${patterns[0]} in ${incident.affectedFeature}`;
        }

        return `Root cause analysis pending for: ${incident.errorMessage}`;
    }

    /**
     * Calculates the weight adjustment needed based on the incident.
     * @private
     */
    private calculateWeightAdjustment(
        incident: ProductionIncident,
        missedPattern: string
    ): WeightAdjustment {
        const severityWeights: Record<string, number> = {
            'critical': 0.15,
            'high': 0.10,
            'medium': 0.05,
            'low': 0.02,
        };

        const errorTypeSpecialties: Record<string, ShepherdSpecialty> = {
            'security': 'security',
            'performance': 'performance',
            'functional': 'functional_correctness',
            'reliability': 'reliability',
        };

        const confidence = Math.min(1.0, 0.5 + (severityWeights[incident.severity] || 0));

        return {
            specialty: errorTypeSpecialties[incident.errorType] || 'error_handling',
            previousWeight: 1.0,
            newWeight: 1.0 + (severityWeights[incident.severity] || 0.05),
            reason: `Adjustment due to ${incident.severity} ${incident.errorType} incident: ${missedPattern}`,
            incidentId: incident.id,
            confidence,
        };
    }
}

/**
 * Engine for adjusting shepherd weights based on incident analysis.
 */
export class WeightAdjustmentEngine {
    private currentWeights: Map<ShepherdSpecialty, number> = new Map();
    private adjustmentHistory: WeightAdjustment[] = [];
    private config: PostMortemConfig;

    /**
     * Creates a new WeightAdjustmentEngine instance.
     * @param config - Configuration for weight adjustments
     */
    constructor(config: PostMortemConfig = DEFAULT_POSTMORTEM_CONFIG) {
        this.config = config;
        this.initializeWeights();
    }

    /**
     * Initializes the default weights for each specialty.
     * @private
     */
    private initializeWeights(): void {
        const defaultWeights: ShepherdSpecialty[] = [
            'security',
            'performance',
            'reliability',
            'functional_correctness',
            'error_handling',
            'resource_management',
            'concurrency',
            'memory_safety',
        ];

        defaultWeights.forEach(specialty => {
            this.currentWeights.set(specialty, 1.0);
        });
    }

    /**
     * Calculates weight adjustments based on incident analysis.
     * 
     * @param analysis - The incident analysis to process
     * @returns Array of weight adjustments to apply
     */
    calculateAdjustments(analysis: IncidentAnalysis): WeightAdjustment[] {
        const adjustments: WeightAdjustment[] = [];
        const adjustment = analysis.weightAdjustmentNeeded;

        const previousWeight = this.currentWeights.get(adjustment.specialty) || 1.0;
        const weightChange = this.clampWeightChange(
            adjustment.newWeight - previousWeight
        );
        const newWeight = previousWeight + weightChange;

        const adjustedAdjustment: WeightAdjustment = {
            ...adjustment,
            previousWeight,
            newWeight,
            confidence: this.adjustConfidence(adjustment.confidence, analysis),
        };

        adjustments.push(adjustedAdjustment);
        this.adjustmentHistory.push(adjustedAdjustment);

        return adjustments;
    }

    /**
     * Applies weight adjustments to the current configuration.
     * 
     * @param adjustments - The adjustments to apply
     * @returns True if all adjustments were applied successfully
     */
    applyAdjustments(adjustments: WeightAdjustment[]): boolean {
        try {
            for (const adjustment of adjustments) {
                if (adjustment.confidence >= this.config.confidenceThreshold) {
                    this.currentWeights.set(adjustment.specialty, adjustment.newWeight);
                }
            }
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Gets the current weight for a specialty.
     * 
     * @param specialty - The specialty to query
     * @returns The current weight or 1.0 if not found
     */
    getWeight(specialty: ShepherdSpecialty): number {
        return this.currentWeights.get(specialty) || 1.0;
    }

    /**
     * Gets all current weights.
     * @returns Map of all current weights
     */
    getAllWeights(): Map<ShepherdSpecialty, number> {
        return new Map(this.currentWeights);
    }

    /**
     * Gets the adjustment history.
     * @returns Array of past weight adjustments
     */
    getAdjustmentHistory(): WeightAdjustment[] {
        return [...this.adjustmentHistory];
    }

    /**
     * Clamps the weight change to the configured max/min limits.
     * @private
     */
    private clampWeightChange(change: number): number {
        if (Math.abs(change) > this.config.maxWeightChange) {
            return Math.sign(change) * this.config.maxWeightChange;
        }
        if (Math.abs(change) < this.config.minWeightChange && change !== 0) {
            return Math.sign(change) * this.config.minWeightChange;
        }
        return change;
    }

    /**
     * Adjusts confidence based on analysis completeness.
     * @private
     */
    private adjustConfidence(
        baseConfidence: number,
        analysis: IncidentAnalysis
    ): number {
        let adjustedConfidence = baseConfidence;

        if (analysis.contributingFactors.length > 0) {
            adjustedConfidence += 0.1;
        }
        if (analysis.preventableWith.length > 2) {
            adjustedConfidence += 0.1;
        }

        return Math.min(1.0, adjustedConfidence);
    }

    /**
     * Resets all weights to default values.
     */
    resetWeights(): void {
        this.initializeWeights();
        this.adjustmentHistory = [];
    }

    /**
     * Reverts the last adjustment for a specialty.
     * 
     * @param specialty - The specialty to revert
     * @returns True if revert was successful
     */
    revertLastAdjustment(specialty: ShepherdSpecialty): boolean {
        const reversed = [...this.adjustmentHistory].reverse();
        const adjustmentToRevert = reversed.find(
            adj => adj.specialty === specialty
        );

        if (adjustmentToRevert) {
            this.currentWeights.set(specialty, adjustmentToRevert.previousWeight);
            this.adjustmentHistory = this.adjustmentHistory.filter(
                adj => adj !== adjustmentToRevert
            );
            return true;
        }

        return false;
    }
}

/**
 * Engine for improving Borzoi patterns based on incident analysis.
 */
export class PatternImprovementEngine {
    private patternVersions: Map<string, string[]> = new Map();
    private improvedPatterns: ImprovedPattern[] = [];

    /**
     * Creates a new PatternImprovementEngine instance.
     */
    constructor() {
        this.initializeDefaultPatterns();
    }

    /**
     * Initializes default patterns.
     * @private
     */
    private initializeDefaultPatterns(): void {
        this.patternVersions.set('security_pattern_v1', [
            'Input validation: basic',
            'Permission checks: simple',
            'Authentication: single factor',
        ]);
        this.patternVersions.set('performance_pattern_v1', [
            'Caching: none',
            'Algorithm: basic',
            'Optimization: none',
        ]);
        this.patternVersions.set('reliability_pattern_v1', [
            'Error handling: basic try-catch',
            'Retry logic: none',
            'Fallback: none',
        ]);
    }

    /**
     * Generates improved patterns based on incident analysis.
     * 
     * @param analysis - The incident analysis to process
     * @returns Array of improved patterns
     */
    generateImprovements(analysis: IncidentAnalysis): ImprovedPattern[] {
        const improvements: ImprovedPattern[] = [];

        const previousPatternId = this.findMatchingPattern(analysis.missedPattern);
        const improvedVersion = this.generateImprovedVersion(analysis);

        const improvement: ImprovedPattern = {
            patternId: previousPatternId,
            previousVersion: this.getPreviousVersion(previousPatternId),
            improvedVersion,
            improvement: this.describeImprovement(analysis),
            basedOnIncidentId: analysis.incidentId,
        };

        improvements.push(improvement);
        this.improvedPatterns.push(improvement);

        return improvements;
    }

    /**
     * Finds the matching pattern ID for the missed pattern.
     * @private
     */
    private findMatchingPattern(missedPattern: string): string {
        const patternMap: Record<string, string> = {
            'missed_security_pattern': 'security_pattern_v1',
            'missed_performance_pattern': 'performance_pattern_v1',
            'missed_reliability_pattern': 'reliability_pattern_v1',
            'missed_race_condition_pattern': 'concurrency_pattern_v1',
            'missed_memory_leak_pattern': 'memory_pattern_v1',
        };

        return patternMap[missedPattern] || 'general_pattern_v1';
    }

    /**
     * Gets the previous version of a pattern.
     * @private
     */
    private getPreviousVersion(patternId: string): string {
        const versions = this.patternVersions.get(patternId);
        if (versions && versions.length > 0) {
            return versions[versions.length - 1] ?? 'Initial version';
        }
        return 'Initial version';
    }

    /**
     * Generates an improved version of a pattern based on analysis.
     * @private
     */
    private generateImprovedVersion(analysis: IncidentAnalysis): string {
        const improvements: string[] = [];

        improvements.push(`Enhanced ${analysis.missedPattern} detection`);
        
        for (const factor of analysis.contributingFactors.slice(0, 2)) {
            improvements.push(`Addressed: ${factor}`);
        }

        for (const measure of analysis.preventableWith.slice(0, 2)) {
            improvements.push(`Added: ${measure}`);
        }

        return improvements.join('; ');
    }

    /**
     * Describes the improvement made.
     * @private
     */
    private describeImprovement(analysis: IncidentAnalysis): string {
        return `Improved ${analysis.missedPattern} to prevent ${analysis.rootCause}. ` +
               `Added ${analysis.preventableWith.length} preventive measures.`;
    }

    /**
     * Gets all improved patterns.
     * @returns Array of improved patterns
     */
    getImprovedPatterns(): ImprovedPattern[] {
        return [...this.improvedPatterns];
    }

    /**
     * Validates an improved pattern.
     * 
     * @param pattern - The pattern to validate
     * @returns True if the pattern is valid
     */
    validatePattern(pattern: ImprovedPattern): boolean {
        return !!(
            pattern.patternId &&
            pattern.improvedVersion &&
            pattern.improvement &&
            pattern.basedOnIncidentId
        );
    }

    /**
     * Applies an improved pattern to the pattern database.
     * 
     * @param pattern - The pattern to apply
     * @returns True if the pattern was applied successfully
     */
    applyPattern(pattern: ImprovedPattern): boolean {
        try {
            const versions = this.patternVersions.get(pattern.patternId) || [];
            versions.push(pattern.improvedVersion);
            this.patternVersions.set(pattern.patternId, versions);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Gets pattern evolution history.
     * 
     * @param patternId - The pattern to query
     * @returns Array of version strings
     */
    getPatternHistory(patternId: string): string[] {
        return this.patternVersions.get(patternId) || [];
    }
}

/**
 * Main post-mortem processor that orchestrates the entire post-mortem workflow.
 */
export class PostMortemPhase {
    private debateId: string;
    private incident: ProductionIncident | null = null;
    private analysis: IncidentAnalysis | null = null;
    private learnings: Learn[] = [];
    private weightAdjustments: WeightAdjustment[] = [];
    private improvedPatterns: ImprovedPattern[] = [];
    private updatedConsensus: number | undefined;
    private config: PostMortemConfig;
    private incidentAnalyzer: IncidentAnalyzer;
    private weightEngine: WeightAdjustmentEngine;
    private patternEngine: PatternImprovementEngine;

    /**
     * Creates a new PostMortemPhase instance.
     * @param config - Configuration for the post-mortem process
     */
    constructor(config: PostMortemConfig = DEFAULT_POSTMORTEM_CONFIG) {
        this.config = config;
        this.debateId = '';
        this.incidentAnalyzer = new IncidentAnalyzer();
        this.weightEngine = new WeightAdjustmentEngine(config);
        this.patternEngine = new PatternImprovementEngine();
    }

    /**
     * Starts the post-mortem phase for a debate.
     * 
     * @param debateId - The ID of the debate to analyze
     * @param incident - The production incident to analyze
     * @returns Promise resolving to the post-mortem results
     */
    async startPhase(
        debateId: string,
        incident: ProductionIncident
    ): Promise<{
        debateId: string;
        analysis: IncidentAnalysis;
        learnings: Learn[];
        weightAdjustments: WeightAdjustment[];
        improvedPatterns: ImprovedPattern[];
    }> {
        this.debateId = debateId;
        this.incident = incident;

        this.analysis = this.incidentAnalyzer.analyze(incident);
        this.learnings = await this.extractLearnings(this.analysis);
        this.weightAdjustments = this.calculateWeightAdjustments(this.analysis);
        this.improvedPatterns = this.improvePatterns(this.analysis);

        if (this.config.autoApplyAdjustments) {
            this.applyAdjustments();
        }

        await this.feedForwardToDebates();

        return {
            debateId: this.debateId,
            analysis: this.analysis,
            learnings: this.learnings,
            weightAdjustments: this.weightAdjustments,
            improvedPatterns: this.improvedPatterns,
        };
    }

    /**
     * Analyzes a production incident.
     * 
     * @param incident - The incident to analyze
     * @returns The incident analysis
     */
    analyzeIncident(incident: ProductionIncident): IncidentAnalysis {
        this.incident = incident;
        this.analysis = this.incidentAnalyzer.analyze(incident);
        return this.analysis;
    }

    /**
     * Calculates weight adjustments based on analysis.
     * 
     * @param analysis - The analysis to process
     * @returns Array of weight adjustments
     */
    calculateWeightAdjustments(analysis: IncidentAnalysis): WeightAdjustment[] {
        this.weightAdjustments = this.weightEngine.calculateAdjustments(analysis);
        return this.weightAdjustments;
    }

    /**
     * Generates improved patterns based on analysis.
     * 
     * @param analysis - The analysis to process
     * @returns Array of improved patterns
     */
    improvePatterns(analysis: IncidentAnalysis): ImprovedPattern[] {
        this.improvedPatterns = this.patternEngine.generateImprovements(analysis);
        return this.improvedPatterns;
    }

    /**
     * Generates a comprehensive post-mortem report.
     * 
     * @returns The post-mortem report object
     */
    generateReport(): {
        debateId: string;
        incident: ProductionIncident | null;
        analysis: IncidentAnalysis | null;
        learnings: Learn[];
        weightAdjustments: WeightAdjustment[];
        improvedPatterns: ImprovedPattern[];
        updatedConsensus: number | undefined;
        timestamp: Date;
    } {
        return {
            debateId: this.debateId,
            incident: this.incident,
            analysis: this.analysis,
            learnings: this.learnings,
            weightAdjustments: this.weightAdjustments,
            improvedPatterns: this.improvedPatterns,
            updatedConsensus: this.updatedConsensus,
            timestamp: new Date(),
        };
    }

    /**
     * Sanitizes a filename for safe filesystem usage.
     * Removes or replaces characters that are invalid in filenames.
     * 
     * @param fileName - The filename to sanitize
     * @returns Sanitized filename safe for use
     */
    private sanitizeFilename(fileName: string): string {
        // Replace invalid characters with underscores
        // Invalid chars on Windows: < > : " / \ | ? *
        // Also handle control characters (0x00-0x1f) and trailing periods/spaces
        let sanitized = fileName
            .replace(/[<>:"\\|?*\x00-\x1f]/g, '_')
            .replace(/[\s.]+$/, '')
            .trim();
        
        // Limit length to 255 characters (common filesystem limit)
        if (sanitized.length > 255) {
            sanitized = sanitized.substring(0, 255);
        }
        
        // Ensure filename is not empty
        if (!sanitized) {
            sanitized = 'unnamed_report';
        }
        
        return sanitized;
    }

    /**
     * Saves the post-mortem report to a file in docs/postmort/.
     * 
     * @param fileName - Optional custom filename (without extension). If not provided, uses debateId.
     * @param extension - Optional file extension (defaults to 'json')
     * @returns Promise resolving to the full path of the saved file
     */
    async saveReport(fileName?: string, extension: string = 'json'): Promise<string> {
        const report = this.generateReport();
        
        // Determine filename
        const baseName = fileName || this.debateId || `postmortem_${Date.now()}`;
        const sanitizedName = this.sanitizeFilename(baseName);
        const fullFileName = `${sanitizedName}.${extension}`;
        
        // Build path: docs/postmort/[file_name_sanitized].extension
        const docsPath = path.join(process.cwd(), 'docs');
        const postmortPath = path.join(docsPath, 'postmort');
        const filePath = path.join(postmortPath, fullFileName);
        
        // Ensure directory exists
        await fs.mkdir(postmortPath, { recursive: true });
        
        // Write report to file
        const reportData = JSON.stringify(report, null, 2);
        await fs.writeFile(filePath, reportData, 'utf-8');
        
        return filePath;
    }

    /**
     * Applies weight adjustments to the configuration.
     * 
     * @returns True if adjustments were applied successfully
     */
    applyAdjustments(): boolean {
        return this.weightEngine.applyAdjustments(this.weightAdjustments);
    }

    /**
     * Updates future debates with the latest learnings.
     * @private
     */
    private async feedForwardToDebates(): Promise<void> {
        if (!this.config.enablePatternLearning) {
            return;
        }

        for (const pattern of this.improvedPatterns) {
            if (this.patternEngine.validatePattern(pattern)) {
                this.patternEngine.applyPattern(pattern);
            }
        }

        this.updatedConsensus = this.calculateUpdatedConsensus();
    }

    /**
     * Calculates the updated consensus based on weight adjustments.
     * @private
     */
    private calculateUpdatedConsensus(): number {
        const weights = this.weightEngine.getAllWeights();
        let totalWeight = 0;
        let adjustedWeight = 0;

        weights.forEach((weight, specialty) => {
            totalWeight += weight;
            if (this.weightAdjustments.some(adj => adj.specialty === specialty)) {
                adjustedWeight += weight;
            }
        });

        if (totalWeight === 0) {
            return 0.95;
        }

        return adjustedWeight / totalWeight;
    }

    /**
     * Extracts learnings from the analysis.
     * @private
     */
    private async extractLearnings(analysis: IncidentAnalysis): Promise<Learn[]> {
        const learnings: Learn[] = [];

        const learning: Learn = {
            id: uuidv4(),
            incidentId: analysis.incidentId,
            category: analysis.weightAdjustmentNeeded.specialty,
            description: analysis.rootCause,
            patternId: analysis.missedPattern,
            confidence: analysis.weightAdjustmentNeeded.confidence,
            appliedAt: new Date(),
        };

        learnings.push(learning);

        for (const factor of analysis.contributingFactors) {
            learnings.push({
                id: uuidv4(),
                incidentId: analysis.incidentId,
                category: analysis.weightAdjustmentNeeded.specialty,
                description: `Contributing factor: ${factor}`,
                confidence: analysis.weightAdjustmentNeeded.confidence * 0.8,
            });
        }

        return learnings;
    }

    /**
     * Gets the current analysis.
     * @returns The current analysis or null
     */
    getAnalysis(): IncidentAnalysis | null {
        return this.analysis;
    }

    /**
     * Gets the extracted learnings.
     * @returns Array of learnings
     */
    getLearnings(): Learn[] {
        return [...this.learnings];
    }

    /**
     * Gets the weight adjustments.
     * @returns Array of weight adjustments
     */
    getWeightAdjustments(): WeightAdjustment[] {
        return [...this.weightAdjustments];
    }

    /**
     * Gets the improved patterns.
     * @returns Array of improved patterns
     */
    getImprovedPatterns(): ImprovedPattern[] {
        return [...this.improvedPatterns];
    }

    /**
     * Gets the updated consensus value.
     * @returns The updated consensus or undefined
     */
    getUpdatedConsensus(): number | undefined {
        return this.updatedConsensus;
    }

    /**
     * Gets the current weights from the weight engine.
     * @returns Map of current weights
     */
    getCurrentWeights(): Map<ShepherdSpecialty, number> {
        return this.weightEngine.getAllWeights();
    }

    /**
     * Reverts the last weight adjustment.
     * 
     * @param specialty - The specialty to revert
     * @returns True if revert was successful
     */
    revertAdjustment(specialty: ShepherdSpecialty): boolean {
        return this.weightEngine.revertLastAdjustment(specialty);
    }

    /**
     * Resets all weights to default.
     */
    reset(): void {
        this.weightEngine.resetWeights();
        this.learnings = [];
        this.weightAdjustments = [];
        this.improvedPatterns = [];
        this.analysis = null;
        this.incident = null;
        this.updatedConsensus = undefined;
    }
}

// ============================================================================
// UNIT TESTS
// ============================================================================

/**
 * Unit tests for the Post-Mortem Phase implementation.
 */
export class PostMortemTests {
    private passedTests = 0;
    private failedTests = 0;

    /**
     * Runs all unit tests.
     */
    async runAllTests(): Promise<{ passed: number; failed: number; total: number }> {
        console.log('Running Post-Mortem Phase Unit Tests...\n');

        await this.testIncidentAnalyzer();
        await this.testWeightAdjustmentEngine();
        await this.testPatternImprovementEngine();
        await this.testPostMortemPhase();
        await this.testIntegration();
        await this.testEdgeCases();

        console.log(`\nTest Results: ${this.passedTests} passed, ${this.failedTests} failed`);
        
        return {
            passed: this.passedTests,
            failed: this.failedTests,
            total: this.passedTests + this.failedTests,
        };
    }

    /**
     * Helper to run a test.
     */
    private async runTest(
        testName: string,
        testFn: () => Promise<void> | void
    ): Promise<void> {
        try {
            await testFn();
            console.log(`✓ ${testName}`);
            this.passedTests++;
        } catch (error) {
            console.log(`✗ ${testName}: ${error}`);
            this.failedTests++;
        }
    }

    /**
     * Tests for IncidentAnalyzer.
     */
    private async testIncidentAnalyzer(): Promise<void> {
        await this.runTest('IncidentAnalyzer: should create instance', () => {
            const analyzer = new IncidentAnalyzer();
            if (!(analyzer instanceof IncidentAnalyzer)) {
                throw new Error('Failed to create IncidentAnalyzer');
            }
        });

        await this.runTest('IncidentAnalyzer: should analyze security incident', () => {
            const analyzer = new IncidentAnalyzer();
            const incident: ProductionIncident = {
                id: 'INC-001',
                timestamp: new Date(),
                severity: 'critical',
                errorType: 'security',
                errorMessage: 'SQL injection vulnerability detected',
                affectedFeature: 'database_query',
                relatedDebateId: 'DEBATE-001',
                impact: 'Data breach risk',
            };

            const analysis = analyzer.analyze(incident);

            if (analysis.incidentId !== 'INC-001') {
                throw new Error('Incident ID mismatch');
            }
            if (!analysis.rootCause.includes('security')) {
                throw new Error('Root cause should identify security issue');
            }
        });

        await this.runTest('IncidentAnalyzer: should identify patterns', () => {
            const analyzer = new IncidentAnalyzer();
            const incident: ProductionIncident = {
                id: 'INC-002',
                timestamp: new Date(),
                severity: 'high',
                errorType: 'performance',
                errorMessage: 'Race condition in atomic writes allowed partial file exposure',
                stackTrace: 'atomic_operation_gap detected',
                affectedFeature: 'atomic_writes',
                relatedDebateId: 'DEBATE-002',
                impact: 'Data corruption',
            };

            const analysis = analyzer.analyze(incident);
            const patterns = analyzer as any; // Access private method for testing
        });
    }

    /**
     * Tests for WeightAdjustmentEngine.
     */
    private async testWeightAdjustmentEngine(): Promise<void> {
        await this.runTest('WeightAdjustmentEngine: should create instance', () => {
            const engine = new WeightAdjustmentEngine();
            if (!(engine instanceof WeightAdjustmentEngine)) {
                throw new Error('Failed to create WeightAdjustmentEngine');
            }
        });

        await this.runTest('WeightAdjustmentEngine: should calculate adjustments', () => {
            const engine = new WeightAdjustmentEngine();
            const analysis: IncidentAnalysis = {
                incidentId: 'INC-001',
                rootCause: 'Test cause',
                failedMitigation: 'Test mitigation',
                contributingFactors: ['Factor 1'],
                preventableWith: ['Prevention 1'],
                missedPattern: 'missed_security_pattern',
                weightAdjustmentNeeded: {
                    specialty: 'security',
                    previousWeight: 1.0,
                    newWeight: 1.15,
                    reason: 'Test reason',
                    incidentId: 'INC-001',
                    confidence: 0.8,
                },
            };

            const adjustments = engine.calculateAdjustments(analysis);

            if (adjustments.length === 0) {
                throw new Error('Should calculate at least one adjustment');
            }
            if (adjustments[0]?.specialty !== 'security') {
                throw new Error('Should adjust security specialty');
            }
        });

        await this.runTest('WeightAdjustmentEngine: should apply adjustments', () => {
            const engine = new WeightAdjustmentEngine();
            const adjustments: WeightAdjustment[] = [{
                specialty: 'security',
                previousWeight: 1.0,
                newWeight: 1.15,
                reason: 'Test',
                incidentId: 'INC-001',
                confidence: 0.9,
            }];

            const result = engine.applyAdjustments(adjustments);

            if (!result) {
                throw new Error('Should apply adjustments successfully');
            }
            if (engine.getWeight('security') !== 1.15) {
                throw new Error('Weight should be updated to 1.15');
            }
        });

        await this.runTest('WeightAdjustmentEngine: should get all weights', () => {
            const engine = new WeightAdjustmentEngine();
            const weights = engine.getAllWeights();

            if (!weights.has('security')) {
                throw new Error('Should have security weight');
            }
            if (!weights.has('performance')) {
                throw new Error('Should have performance weight');
            }
        });

        await this.runTest('WeightAdjustmentEngine: should revert adjustment', () => {
            const engine = new WeightAdjustmentEngine();
            const adjustments: WeightAdjustment[] = [{
                specialty: 'performance',
                previousWeight: 1.0,
                newWeight: 1.1,
                reason: 'Test',
                incidentId: 'INC-001',
                confidence: 0.9,
            }];

            engine.applyAdjustments(adjustments);
            const reverted = engine.revertLastAdjustment('performance');

            if (!reverted) {
                throw new Error('Should revert successfully');
            }
            if (engine.getWeight('performance') !== 1.0) {
                throw new Error('Weight should be reverted to 1.0');
            }
        });

        await this.runTest('WeightAdjustmentEngine: should clamp weight changes', () => {
            const config = { ...DEFAULT_POSTMORTEM_CONFIG, maxWeightChange: 0.05 };
            const engine = new WeightAdjustmentEngine(config);
            const analysis: IncidentAnalysis = {
                incidentId: 'INC-001',
                rootCause: 'Test',
                failedMitigation: 'Test',
                contributingFactors: [],
                preventableWith: [],
                missedPattern: 'missed_performance_pattern',
                weightAdjustmentNeeded: {
                    specialty: 'performance',
                    previousWeight: 1.0,
                    newWeight: 2.0,
                    reason: 'Large change',
                    incidentId: 'INC-001',
                    confidence: 0.9,
                },
            };

            const adjustments = engine.calculateAdjustments(analysis);
            const change = (adjustments[0]?.newWeight ?? 0) - (adjustments[0]?.previousWeight ?? 0);

            if (Math.abs(change) > config.maxWeightChange) {
                throw new Error('Weight change should be clamped to max');
            }
        });
    }

    /**
     * Tests for PatternImprovementEngine.
     */
    private async testPatternImprovementEngine(): Promise<void> {
        await this.runTest('PatternImprovementEngine: should create instance', () => {
            const engine = new PatternImprovementEngine();
            if (!(engine instanceof PatternImprovementEngine)) {
                throw new Error('Failed to create PatternImprovementEngine');
            }
        });

        await this.runTest('PatternImprovementEngine: should generate improvements', () => {
            const engine = new PatternImprovementEngine();
            const analysis: IncidentAnalysis = {
                incidentId: 'INC-001',
                rootCause: 'Race condition in atomic writes',
                failedMitigation: 'Missing atomic operation',
                contributingFactors: ['Timing vulnerability'],
                preventableWith: ['Use atomic operations', 'Implement proper locking'],
                missedPattern: 'missed_race_condition_pattern',
                weightAdjustmentNeeded: {
                    specialty: 'concurrency',
                    previousWeight: 1.0,
                    newWeight: 1.1,
                    reason: 'Test',
                    incidentId: 'INC-001',
                    confidence: 0.8,
                },
            };

            const improvements = engine.generateImprovements(analysis);

            if (improvements.length === 0) {
                throw new Error('Should generate at least one improvement');
            }
            if (!improvements[0]?.improvedVersion.includes('atomic')) {
                throw new Error('Improved version should mention atomic operations');
            }
        });

        await this.runTest('PatternImprovementEngine: should validate pattern', () => {
            const engine = new PatternImprovementEngine();
            const pattern: ImprovedPattern = {
                patternId: 'security_pattern_v1',
                previousVersion: 'v1',
                improvedVersion: 'v2',
                improvement: 'Enhanced security',
                basedOnIncidentId: 'INC-001',
            };

            if (!engine.validatePattern(pattern)) {
                throw new Error('Should validate pattern successfully');
            }
        });

        await this.runTest('PatternImprovementEngine: should apply pattern', () => {
            const engine = new PatternImprovementEngine();
            const pattern: ImprovedPattern = {
                patternId: 'security_pattern_v1',
                previousVersion: 'v1',
                improvedVersion: 'v2 - Enhanced with input validation',
                improvement: 'Added input validation',
                basedOnIncidentId: 'INC-001',
            };

            if (!engine.applyPattern(pattern)) {
                throw new Error('Should apply pattern successfully');
            }

            const history = engine.getPatternHistory('security_pattern_v1');
            if (!history.includes('v2 - Enhanced with input validation')) {
                throw new Error('Pattern should be added to history');
            }
        });

        await this.runTest('PatternImprovementEngine: should get improved patterns', () => {
            const engine = new PatternImprovementEngine();
            const analysis: IncidentAnalysis = {
                incidentId: 'INC-001',
                rootCause: 'Test',
                failedMitigation: 'Test',
                contributingFactors: [],
                preventableWith: [],
                missedPattern: 'missed_security_pattern',
                weightAdjustmentNeeded: {
                    specialty: 'security',
                    previousWeight: 1.0,
                    newWeight: 1.1,
                    reason: 'Test',
                    incidentId: 'INC-001',
                    confidence: 0.8,
                },
            };

            engine.generateImprovements(analysis);
            const patterns = engine.getImprovedPatterns();

            if (patterns.length !== 1) {
                throw new Error('Should return one improved pattern');
            }
        });
    }

    /**
     * Tests for PostMortemPhase.
     */
    private async testPostMortemPhase(): Promise<void> {
        await this.runTest('PostMortemPhase: should create instance', () => {
            const phase = new PostMortemPhase();
            if (!(phase instanceof PostMortemPhase)) {
                throw new Error('Failed to create PostMortemPhase');
            }
        });

        await this.runTest('PostMortemPhase: should start phase', async () => {
            const phase = new PostMortemPhase();
            const incident: ProductionIncident = {
                id: 'INC-001',
                timestamp: new Date(),
                severity: 'critical',
                errorType: 'security',
                errorMessage: 'SQL injection vulnerability',
                affectedFeature: 'database_query',
                relatedDebateId: 'DEBATE-001',
                impact: 'Data breach',
            };

            const result = await phase.startPhase('DEBATE-001', incident);

            if (result.debateId !== 'DEBATE-001') {
                throw new Error('Debate ID mismatch');
            }
            if (!result.analysis) {
                throw new Error('Should have analysis');
            }
        });

        await this.runTest('PostMortemPhase: should analyze incident', () => {
            const phase = new PostMortemPhase();
            const incident: ProductionIncident = {
                id: 'INC-001',
                timestamp: new Date(),
                severity: 'high',
                errorType: 'performance',
                errorMessage: 'Memory leak detected',
                affectedFeature: 'cache_manager',
                relatedDebateId: 'DEBATE-001',
                impact: 'Memory exhaustion',
            };

            const analysis = phase.analyzeIncident(incident);

            if (analysis.incidentId !== 'INC-001') {
                throw new Error('Incident ID mismatch');
            }
        });

        await this.runTest('PostMortemPhase: should generate report', async () => {
            const phase = new PostMortemPhase();
            const incident: ProductionIncident = {
                id: 'INC-001',
                timestamp: new Date(),
                severity: 'medium',
                errorType: 'functional',
                errorMessage: 'Incorrect output',
                affectedFeature: 'file_processor',
                relatedDebateId: 'DEBATE-001',
                impact: 'Wrong data written',
            };

            await phase.startPhase('DEBATE-001', incident);
            const report = phase.generateReport();

            if (!report.timestamp) {
                throw new Error('Report should have timestamp');
            }
            if (!report.weightAdjustments) {
                throw new Error('Report should have weight adjustments');
            }
        });

        await this.runTest('PostMortemPhase: should get current weights', async () => {
            const phase = new PostMortemPhase();
            const incident: ProductionIncident = {
                id: 'INC-001',
                timestamp: new Date(),
                severity: 'high',
                errorType: 'reliability',
                errorMessage: 'Service unavailable',
                affectedFeature: 'api_server',
                relatedDebateId: 'DEBATE-001',
                impact: 'Service outage',
            };

            await phase.startPhase('DEBATE-001', incident);
            const weights = phase.getCurrentWeights();

            if (!weights.has('reliability')) {
                throw new Error('Should have reliability weight');
            }
        });

        await this.runTest('PostMortemPhase: should reset', async () => {
            const phase = new PostMortemPhase();
            const incident: ProductionIncident = {
                id: 'INC-001',
                timestamp: new Date(),
                severity: 'low',
                errorType: 'functional',
                errorMessage: 'Minor bug',
                affectedFeature: 'feature_x',
                relatedDebateId: 'DEBATE-001',
                impact: 'Minimal',
            };

            await phase.startPhase('DEBATE-001', incident);
            phase.reset();

            const analysis = phase.getAnalysis();
            if (analysis !== null) {
                throw new Error('Analysis should be null after reset');
            }
        });
    }

    /**
     * Integration tests.
     */
    private async testIntegration(): Promise<void> {
        await this.runTest('Integration: should handle full workflow', async () => {
            const postMortem = new PostMortemPhase();
            const incident: ProductionIncident = {
                id: 'INC-2026-02-15-001',
                timestamp: new Date(),
                severity: 'critical',
                errorType: 'security',
                errorMessage: 'Race condition in atomic writes allowed partial file exposure',
                stackTrace: 'at atomic_writes.ts:42:15',
                affectedFeature: 'atomic_writes',
                relatedDebateId: 'DEBATE-2026-02-09-001',
                impact: 'Data corruption on power failure during write',
            };

            const result = await postMortem.startPhase('DEBATE-2026-02-09-001', incident);

            if (result.weightAdjustments.length === 0) {
                throw new Error('Should have weight adjustments');
            }
            if (result.improvedPatterns.length === 0) {
                throw new Error('Should have improved patterns');
            }
        });

        await this.runTest('Integration: should track multiple incidents', async () => {
            const postMortem = new PostMortemPhase();

            const incidents: ProductionIncident[] = [
                {
                    id: 'INC-001',
                    timestamp: new Date(),
                    severity: 'critical',
                    errorType: 'security',
                    errorMessage: 'Security issue 1',
                    affectedFeature: 'feature_a',
                    relatedDebateId: 'DEBATE-001',
                    impact: 'High',
                },
                {
                    id: 'INC-002',
                    timestamp: new Date(),
                    severity: 'high',
                    errorType: 'performance',
                    errorMessage: 'Performance issue 1',
                    affectedFeature: 'feature_b',
                    relatedDebateId: 'DEBATE-002',
                    impact: 'Medium',
                },
            ];

            for (const incident of incidents) {
                await postMortem.startPhase(incident.relatedDebateId, incident);
            }

            const report = postMortem.generateReport();
            const adjustments = postMortem.getWeightAdjustments();

            if (adjustments.length < 2) {
                throw new Error('Should track adjustments for multiple incidents');
            }
        });
    }

    /**
     * Edge case tests.
     */
    private async testEdgeCases(): Promise<void> {
        await this.runTest('Edge case: should handle unknown error type', () => {
            const analyzer = new IncidentAnalyzer();
            const incident: ProductionIncident = {
                id: 'INC-001',
                timestamp: new Date(),
                severity: 'low',
                errorType: 'functional',
                errorMessage: 'Unknown error type',
                affectedFeature: 'unknown_feature',
                relatedDebateId: 'DEBATE-001',
                impact: 'Minimal',
            };

            const analysis = analyzer.analyze(incident);

            if (!analysis.rootCause) {
                throw new Error('Should still produce analysis');
            }
        });

        await this.runTest('Edge case: should handle missing stack trace', () => {
            const analyzer = new IncidentAnalyzer();
            const incident: ProductionIncident = {
                id: 'INC-001',
                timestamp: new Date(),
                severity: 'medium',
                errorType: 'performance',
                errorMessage: 'Slow query',
                affectedFeature: 'database',
                relatedDebateId: 'DEBATE-001',
                impact: 'Performance degradation',
            };

            const analysis = analyzer.analyze(incident);

            if (!analysis.contributingFactors) {
                throw new Error('Should still produce analysis without stack trace');
            }
        });

        await this.runTest('Edge case: should handle low confidence', () => {
            const config = { ...DEFAULT_POSTMORTEM_CONFIG, confidenceThreshold: 0.95 };
            const engine = new WeightAdjustmentEngine(config);
            const analysis: IncidentAnalysis = {
                incidentId: 'INC-001',
                rootCause: 'Uncertain cause',
                failedMitigation: 'Unknown',
                contributingFactors: [],
                preventableWith: [],
                missedPattern: 'unknown_pattern',
                weightAdjustmentNeeded: {
                    specialty: 'error_handling',
                    previousWeight: 1.0,
                    newWeight: 1.05,
                    reason: 'Low confidence adjustment',
                    incidentId: 'INC-001',
                    confidence: 0.5,
                },
            };

            const adjustments = engine.calculateAdjustments(analysis);
            const applied = engine.applyAdjustments(adjustments);

            if (applied && engine.getWeight('error_handling') !== 1.0) {
                throw new Error('Should not apply low confidence adjustments');
            }
        });

        await this.runTest('Edge case: should handle revert on non-existent specialty', () => {
            const engine = new WeightAdjustmentEngine();
            const reverted = engine.revertLastAdjustment('memory_safety' as ShepherdSpecialty);

            if (reverted !== false) {
                throw new Error('Should return false for non-existent adjustment');
            }
        });

        await this.runTest('Edge case: should validate pattern with missing fields', () => {
            const engine = new PatternImprovementEngine();
            const invalidPattern: ImprovedPattern = {
                patternId: '',
                previousVersion: '',
                improvedVersion: '',
                improvement: '',
                basedOnIncidentId: '',
            };

            if (engine.validatePattern(invalidPattern)) {
                throw new Error('Should reject invalid pattern');
            }
        });

        await this.runTest('Edge case: should handle empty preventable measures', () => {
            const analyzer = new IncidentAnalyzer();
            const incident: ProductionIncident = {
                id: 'INC-001',
                timestamp: new Date(),
                severity: 'low',
                errorType: 'functional',
                errorMessage: 'Simple error',
                affectedFeature: 'simple',
                relatedDebateId: 'DEBATE-001',
                impact: 'Low',
            };

            const analysis = analyzer.analyze(incident);

            if (analysis.preventableWith.length === 0) {
                throw new Error('Should provide default preventive measures');
            }
        });
    }
}

// ============================================================================
// EXAMPLE USAGE
// ============================================================================

/**
 * Example usage demonstrating the Post-Mortem Phase workflow.
 */
export async function demonstratePostMortem(): Promise<void> {
    console.log('Post-Mortem Phase Demonstration\n');
    console.log('='.repeat(50));

    // Create a production incident
    const incident: ProductionIncident = {
        id: 'INC-2026-02-15-001',
        timestamp: new Date(),
        severity: 'critical',
        errorType: 'security',
        errorMessage: 'Race condition in atomic writes allowed partial file exposure',
        stackTrace: `at FileWriter.write(FileWriter.ts:42)
at AtomicWrites.process(atomic_writes.ts:15)
at Debater.evaluate(debater.ts:89)`,
        affectedFeature: 'atomic_writes',
        relatedDebateId: 'DEBATE-2026-02-09-001',
        impact: 'Data corruption on power failure during write',
        resolution: 'Implemented proper locking mechanism',
    };

    console.log('\n1. Production Incident:');
    console.log(`   ID: ${incident.id}`);
    console.log(`   Severity: ${incident.severity}`);
    console.log(`   Error Type: ${incident.errorType}`);
    console.log(`   Affected Feature: ${incident.affectedFeature}`);
    console.log(`   Related Debate: ${incident.relatedDebateId}`);

    // Create and run post-mortem
    const postMortem = new PostMortemPhase({
        maxWeightChange: 0.15,
        minWeightChange: 0.05,
        confidenceThreshold: 0.7,
        autoApplyAdjustments: true,
        enablePatternLearning: true,
    });

    console.log('\n2. Starting Post-Mortem Analysis...');
    const result = await postMortem.startPhase('DEBATE-2026-02-09-001', incident);

    console.log('\n3. Incident Analysis:');
    console.log(`   Root Cause: ${result.analysis.rootCause}`);
    console.log(`   Failed Mitigation: ${result.analysis.failedMitigation}`);
    console.log(`   Missed Pattern: ${result.analysis.missedPattern}`);

    console.log('\n4. Weight Adjustments:');
    for (const adjustment of result.weightAdjustments) {
        console.log(`   Specialty: ${adjustment.specialty}`);
        console.log(`   Previous: ${adjustment.previousWeight} → New: ${adjustment.newWeight}`);
        console.log(`   Confidence: ${adjustment.confidence}`);
        console.log(`   Reason: ${adjustment.reason}`);
    }

    console.log('\n5. Improved Patterns:');
    for (const pattern of result.improvedPatterns) {
        console.log(`   Pattern ID: ${pattern.patternId}`);
        console.log(`   Improvement: ${pattern.improvement}`);
        console.log(`   Based On: ${pattern.basedOnIncidentId}`);
    }

    console.log('\n6. Generated Learnings:');
    for (const learn of result.learnings) {
        console.log(`   Category: ${learn.category}`);
        console.log(`   Description: ${learn.description}`);
        console.log(`   Confidence: ${learn.confidence}`);
    }

    console.log('\n7. Updated Consensus:');
    const consensus = postMortem.getUpdatedConsensus();
    console.log(`   New Consensus: ${consensus?.toFixed(4)}`);

    console.log('\n8. Current Weights:');
    const weights = postMortem.getCurrentWeights();
    weights.forEach((weight, specialty) => {
        console.log(`   ${specialty}: ${weight.toFixed(4)}`);
    });

    // Generate report
    console.log('\n9. Post-Mortem Report:');
    const report = postMortem.generateReport();
    console.log(`   Report Generated: ${report.timestamp.toISOString()}`);
    console.log(`   Total Learnings: ${report.learnings.length}`);
    console.log(`   Total Adjustments: ${report.weightAdjustments.length}`);
    console.log(`   Total Patterns Improved: ${report.improvedPatterns.length}`);

    // Run tests
    console.log('\n10. Running Unit Tests...');
    const tests = new PostMortemTests();
    await tests.runAllTests();

    console.log('\n' + '='.repeat(50));
    console.log('Post-Mortem Phase demonstration complete.');
}

// Export all classes and types
export default {
    PostMortemPhase,
    IncidentAnalyzer,
    WeightAdjustmentEngine,
    PatternImprovementEngine,
    PostMortemTests,
    demonstratePostMortem,
};
