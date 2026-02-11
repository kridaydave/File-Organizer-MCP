/**
 * Jonnah Auto-Documentation Generator - Debate Templates System
 *
 * This module provides a comprehensive debate template system for managing
 * structured debate workflows with customizable phases, timeboxes, and
 * shepherd assignments.
 */

import { describe, it, expect, beforeEach, beforeAll } from "@jest/globals";

/**
 * Enumeration of available phase types in a debate workflow.
 */
export enum PhaseType {
  INITIALIZATION = "initialization",
  PROPOSAL = "proposal",
  DISCUSSION = "discussion",
  CLARIFICATION = "clarification",
  CRITIQUE = "critique",
  REFINEMENT = "refinement",
  VOTING = "voting",
  CONSENSUS_CHECK = "consensus_check",
  SECURITY_GATE = "security_gate",
  FINAL_REVIEW = "final_review",
  DOCUMENTATION = "documentation",
}

/**
 * Enumeration of shepherd specialties for matching shepherds to debate requirements.
 */
export enum ShepherdSpecialty {
  ARCHITECTURE = "architecture",
  SECURITY = "security",
  PERFORMANCE = "performance",
  API_DESIGN = "api_design",
  UX = "ux",
  TESTING = "testing",
  DOCUMENTATION = "documentation",
  DEVOPS = "devops",
  DOMAIN_EXPERT = "domain_expert",
  GENERAL = "general",
}

/**
 * Configuration for phase timeboxing.
 */
export interface PhaseTimeBox {
  initialization?: number;
  proposal?: number;
  discussion?: number;
  clarification?: number;
  critique?: number;
  refinement?: number;
  voting?: number;
  consensus_check?: number;
  security_gate?: number;
  final_review?: number;
  documentation?: number;
}

/**
 * Configuration for a single phase in the debate workflow.
 */
export interface PhaseConfig {
  type: PhaseType;
  order: number;
  duration?: { min: number; max: number };
  participation?: { required: boolean; minVotes: number };
  customBehavior?: Record<string, unknown>;
}

/**
 * Represents a complete debate template with all configuration options.
 */
export interface DebateTemplate {
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

/**
 * Customizations that can be applied when creating a debate from a template.
 */
export interface TemplateCustomization {
  name?: string;
  description?: string;
  phaseOverrides?: Partial<PhaseConfig>[];
  timeBoxAdjustments?: Partial<PhaseTimeBox>;
  additionalRules?: string[];
  additionalSuccessCriteria?: string[];
}

/**
 * Result of template validation.
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Result of creating a debate from a template.
 */
export interface DebateFromTemplate {
  templateId: string;
  debateId: string;
  configuration: DebateTemplate;
  appliedCustomizations: TemplateCustomization;
}

/**
 * Registry of available debate templates.
 */
export interface TemplateRegistry {
  templates: Map<string, DebateTemplate>;
  defaultTemplate: string;
}

/**
 * Default timeboxes for different template types (in minutes).
 */
const DEFAULT_TIMEBOXES: Record<string, PhaseTimeBox> = {
  feature_design: {
    initialization: 5,
    proposal: 15,
    discussion: 20,
    clarification: 10,
    critique: 15,
    refinement: 10,
    voting: 10,
    consensus_check: 5,
    final_review: 10,
  },
  security_review: {
    initialization: 5,
    proposal: 10,
    discussion: 15,
    clarification: 10,
    critique: 20,
    security_gate: 30,
    refinement: 10,
    voting: 10,
    consensus_check: 5,
    final_review: 10,
  },
  performance_optimization: {
    initialization: 5,
    proposal: 15,
    discussion: 15,
    clarification: 10,
    critique: 20,
    refinement: 15,
    voting: 10,
    consensus_check: 5,
    final_review: 10,
  },
  api_design: {
    initialization: 5,
    proposal: 15,
    discussion: 20,
    clarification: 15,
    critique: 15,
    refinement: 10,
    voting: 10,
    consensus_check: 5,
    documentation: 15,
    final_review: 10,
  },
  file_organization_strategy: {
    initialization: 5,
    proposal: 10,
    discussion: 15,
    clarification: 10,
    critique: 15,
    refinement: 10,
    voting: 10,
    consensus_check: 5,
    final_review: 10,
  },
  duplicate_management: {
    initialization: 5,
    proposal: 8,
    discussion: 12,
    clarification: 8,
    critique: 12,
    refinement: 8,
    voting: 8,
    consensus_check: 5,
    final_review: 8,
  },
  sensitive_file_handling: {
    initialization: 5,
    proposal: 10,
    discussion: 15,
    clarification: 10,
    security_gate: 25,
    refinement: 10,
    voting: 10,
    consensus_check: 5,
    final_review: 10,
  },
};

/**
 * Pre-defined feature design review template.
 */
const FEATURE_DESIGN_TEMPLATE: DebateTemplate = {
  id: "feature_design",
  name: "Feature Design Review",
  description:
    "Comprehensive template for evaluating and designing new features with full stakeholder input.",
  phases: [
    { type: PhaseType.INITIALIZATION, order: 1, duration: { min: 3, max: 5 } },
    { type: PhaseType.PROPOSAL, order: 2, duration: { min: 10, max: 15 } },
    { type: PhaseType.DISCUSSION, order: 3, duration: { min: 15, max: 20 } },
    { type: PhaseType.CLARIFICATION, order: 4, duration: { min: 5, max: 10 } },
    { type: PhaseType.CRITIQUE, order: 5, duration: { min: 10, max: 15 } },
    { type: PhaseType.REFINEMENT, order: 6, duration: { min: 5, max: 10 } },
    { type: PhaseType.VOTING, order: 7, duration: { min: 5, max: 10 } },
    { type: PhaseType.CONSENSUS_CHECK, order: 8, duration: { min: 3, max: 5 } },
    { type: PhaseType.FINAL_REVIEW, order: 9, duration: { min: 5, max: 10 } },
  ],
  requiredShepherds: [
    ShepherdSpecialty.ARCHITECTURE,
    ShepherdSpecialty.UX,
    ShepherdSpecialty.DOMAIN_EXPERT,
  ],
  optionalShepherds: [
    ShepherdSpecialty.TESTING,
    ShepherdSpecialty.DOCUMENTATION,
    ShepherdSpecialty.SECURITY,
  ],
  defaultTimeBoxes: DEFAULT_TIMEBOXES.feature_design!,
  customRules: [
    "All stakeholders must have opportunity to provide input during discussion phase",
    "Architecture review must be completed before critique phase begins",
    "UX considerations must be addressed before final review",
    "Minimum 3 shepherds must participate in voting phase",
  ],
  successCriteria: [
    "Achieve consensus (≥80% approval) from required shepherds",
    "Complete architecture review sign-off",
    "Complete UX review sign-off",
    "Address all critical concerns raised during critique",
  ],
};

/**
 * Pre-defined security review template with security-gate phase.
 */
const SECURITY_REVIEW_TEMPLATE: DebateTemplate = {
  id: "security_review",
  name: "Security Review",
  description:
    "Template designed for security-focused evaluations with mandatory security gate phase.",
  phases: [
    { type: PhaseType.INITIALIZATION, order: 1, duration: { min: 3, max: 5 } },
    { type: PhaseType.PROPOSAL, order: 2, duration: { min: 5, max: 10 } },
    { type: PhaseType.DISCUSSION, order: 3, duration: { min: 10, max: 15 } },
    { type: PhaseType.CLARIFICATION, order: 4, duration: { min: 5, max: 10 } },
    { type: PhaseType.CRITIQUE, order: 5, duration: { min: 15, max: 20 } },
    {
      type: PhaseType.SECURITY_GATE,
      order: 6,
      duration: { min: 20, max: 30 },
      participation: { required: true, minVotes: 3 },
    },
    { type: PhaseType.REFINEMENT, order: 7, duration: { min: 5, max: 10 } },
    { type: PhaseType.VOTING, order: 8, duration: { min: 5, max: 10 } },
    { type: PhaseType.CONSENSUS_CHECK, order: 9, duration: { min: 3, max: 5 } },
    { type: PhaseType.FINAL_REVIEW, order: 10, duration: { min: 5, max: 10 } },
  ],
  requiredShepherds: [
    ShepherdSpecialty.SECURITY,
    ShepherdSpecialty.ARCHITECTURE,
    ShepherdSpecialty.DEVOPS,
  ],
  optionalShepherds: [
    ShepherdSpecialty.DOMAIN_EXPERT,
    ShepherdSpecialty.TESTING,
  ],
  defaultTimeBoxes: DEFAULT_TIMEBOXES.security_review!,
  customRules: [
    "Security specialist must be present during security gate phase",
    "All security vulnerabilities must be documented and addressed",
    "Security gate requires unanimous approval from security shepherds",
    "No deployment until security review is complete",
    "Audit trail must be maintained for all security decisions",
  ],
  successCriteria: [
    "Pass security gate with ≥90% approval from security shepherds",
    "No critical vulnerabilities remain unaddressed",
    "Complete security documentation",
    "DevOps sign-off on security implementation",
  ],
};

/**
 * Pre-defined performance optimization template.
 */
const PERFORMANCE_OPTIMIZATION_TEMPLATE: DebateTemplate = {
  id: "performance_optimization",
  name: "Performance Optimization",
  description:
    "Template for evaluating and implementing performance improvements.",
  phases: [
    { type: PhaseType.INITIALIZATION, order: 1, duration: { min: 3, max: 5 } },
    { type: PhaseType.PROPOSAL, order: 2, duration: { min: 10, max: 15 } },
    { type: PhaseType.DISCUSSION, order: 3, duration: { min: 10, max: 15 } },
    { type: PhaseType.CLARIFICATION, order: 4, duration: { min: 5, max: 10 } },
    { type: PhaseType.CRITIQUE, order: 5, duration: { min: 15, max: 20 } },
    { type: PhaseType.REFINEMENT, order: 6, duration: { min: 10, max: 15 } },
    { type: PhaseType.VOTING, order: 7, duration: { min: 5, max: 10 } },
    { type: PhaseType.CONSENSUS_CHECK, order: 8, duration: { min: 3, max: 5 } },
    { type: PhaseType.FINAL_REVIEW, order: 9, duration: { min: 5, max: 10 } },
  ],
  requiredShepherds: [
    ShepherdSpecialty.PERFORMANCE,
    ShepherdSpecialty.ARCHITECTURE,
  ],
  optionalShepherds: [
    ShepherdSpecialty.DEVOPS,
    ShepherdSpecialty.TESTING,
    ShepherdSpecialty.DOMAIN_EXPERT,
  ],
  defaultTimeBoxes: DEFAULT_TIMEBOXES.performance_optimization!,
  customRules: [
    "Performance metrics must be established before proposal phase",
    "Benchmark results must be presented during proposal",
    "Impact analysis must cover all affected systems",
    "Performance testing plan must be approved before implementation",
    "Trade-offs between performance and other concerns must be documented",
  ],
  successCriteria: [
    "Achieve ≥20% improvement in targeted metrics",
    "Complete performance testing plan approval",
    "Address all performance concerns raised during critique",
    "Maintain backward compatibility where required",
  ],
};

/**
 * Pre-defined file organization strategy review template.
 */
const FILE_ORGANIZATION_STRATEGY_TEMPLATE: DebateTemplate = {
  id: "file_organization_strategy",
  name: "File Organization Strategy",
  description:
    "Template for evaluating and designing file organization strategies with categorization rules and security considerations.",
  phases: [
    { type: PhaseType.INITIALIZATION, order: 1, duration: { min: 3, max: 5 } },
    { type: PhaseType.PROPOSAL, order: 2, duration: { min: 8, max: 10 } },
    { type: PhaseType.DISCUSSION, order: 3, duration: { min: 10, max: 15 } },
    { type: PhaseType.CLARIFICATION, order: 4, duration: { min: 5, max: 10 } },
    { type: PhaseType.CRITIQUE, order: 5, duration: { min: 10, max: 15 } },
    { type: PhaseType.REFINEMENT, order: 6, duration: { min: 5, max: 10 } },
    { type: PhaseType.VOTING, order: 7, duration: { min: 5, max: 10 } },
    { type: PhaseType.CONSENSUS_CHECK, order: 8, duration: { min: 3, max: 5 } },
    { type: PhaseType.FINAL_REVIEW, order: 9, duration: { min: 5, max: 10 } },
  ],
  requiredShepherds: [
    ShepherdSpecialty.DOMAIN_EXPERT,
    ShepherdSpecialty.PERFORMANCE,
    ShepherdSpecialty.SECURITY,
  ],
  optionalShepherds: [
    ShepherdSpecialty.ARCHITECTURE,
    ShepherdSpecialty.UX,
    ShepherdSpecialty.DOCUMENTATION,
  ],
  defaultTimeBoxes: DEFAULT_TIMEBOXES.file_organization_strategy!,
  customRules: [
    "Categorization rules must be clear and maintainable",
    "Performance impact must be evaluated for large directories",
    "Security protocols for sensitive files must be established",
    "Minimum 3 shepherds must participate in voting phase",
    "Categorization accuracy must be validated against test data",
  ],
  successCriteria: [
    "Achieve consensus (≥80% approval) from required shepherds",
    "Complete categorization rule validation",
    "Security protocols for sensitive files approved",
    "Performance impact analysis completed",
    "Address all critical concerns raised during critique",
  ],
};

/**
 * Pre-defined duplicate management review template.
 */
const DUPLICATE_MANAGEMENT_TEMPLATE: DebateTemplate = {
  id: "duplicate_management",
  name: "Duplicate Management",
  description:
    "Template for evaluating duplicate detection and resolution strategies with accuracy and performance trade-offs.",
  phases: [
    { type: PhaseType.INITIALIZATION, order: 1, duration: { min: 3, max: 5 } },
    { type: PhaseType.PROPOSAL, order: 2, duration: { min: 6, max: 8 } },
    { type: PhaseType.DISCUSSION, order: 3, duration: { min: 8, max: 12 } },
    { type: PhaseType.CLARIFICATION, order: 4, duration: { min: 5, max: 8 } },
    { type: PhaseType.CRITIQUE, order: 5, duration: { min: 8, max: 12 } },
    { type: PhaseType.REFINEMENT, order: 6, duration: { min: 5, max: 8 } },
    { type: PhaseType.VOTING, order: 7, duration: { min: 5, max: 8 } },
    { type: PhaseType.CONSENSUS_CHECK, order: 8, duration: { min: 3, max: 5 } },
    { type: PhaseType.FINAL_REVIEW, order: 9, duration: { min: 5, max: 8 } },
  ],
  requiredShepherds: [
    ShepherdSpecialty.PERFORMANCE,
    ShepherdSpecialty.DOMAIN_EXPERT,
    ShepherdSpecialty.TESTING,
  ],
  optionalShepherds: [
    ShepherdSpecialty.ARCHITECTURE,
    ShepherdSpecialty.SECURITY,
    ShepherdSpecialty.DOCUMENTATION,
  ],
  defaultTimeBoxes: DEFAULT_TIMEBOXES.duplicate_management!,
  customRules: [
    "Duplicate detection accuracy must be ≥95%",
    "False positive rate must be <2%",
    "Performance impact must be evaluated for large file sets",
    "Recovery options must be documented",
    "Batch processing thresholds must be established",
  ],
  successCriteria: [
    "Achieve consensus (≥80% approval) from required shepherds",
    "Detection accuracy requirements met (≥95%)",
    "False positive rate acceptable (<2%)",
    "Performance testing plan approved",
    "Recovery and rollback procedures documented",
  ],
};

/**
 * Pre-defined sensitive file handling template with security-gate phase.
 */
const SENSITIVE_FILE_HANDLING_TEMPLATE: DebateTemplate = {
  id: "sensitive_file_handling",
  name: "Sensitive File Handling",
  description:
    "Template designed for evaluating security protocols and handling procedures for sensitive files.",
  phases: [
    { type: PhaseType.INITIALIZATION, order: 1, duration: { min: 3, max: 5 } },
    { type: PhaseType.PROPOSAL, order: 2, duration: { min: 8, max: 10 } },
    { type: PhaseType.DISCUSSION, order: 3, duration: { min: 10, max: 15 } },
    { type: PhaseType.CLARIFICATION, order: 4, duration: { min: 5, max: 10 } },
    {
      type: PhaseType.SECURITY_GATE,
      order: 5,
      duration: { min: 20, max: 25 },
      participation: { required: true, minVotes: 3 },
    },
    { type: PhaseType.REFINEMENT, order: 6, duration: { min: 5, max: 10 } },
    { type: PhaseType.VOTING, order: 7, duration: { min: 5, max: 10 } },
    { type: PhaseType.CONSENSUS_CHECK, order: 8, duration: { min: 3, max: 5 } },
    { type: PhaseType.FINAL_REVIEW, order: 9, duration: { min: 5, max: 10 } },
  ],
  requiredShepherds: [
    ShepherdSpecialty.SECURITY,
    ShepherdSpecialty.DOMAIN_EXPERT,
    ShepherdSpecialty.ARCHITECTURE,
  ],
  optionalShepherds: [
    ShepherdSpecialty.PERFORMANCE,
    ShepherdSpecialty.DOCUMENTATION,
  ],
  defaultTimeBoxes: DEFAULT_TIMEBOXES.sensitive_file_handling!,
  customRules: [
    "Security specialist must be present during security gate phase",
    "All sensitive content patterns must be documented",
    "Security gate requires unanimous approval from security shepherds",
    "Sensitive files must be encrypted at rest",
    "Access controls must be implemented and tested",
  ],
  successCriteria: [
    "Pass security gate with ≥90% approval from security shepherds",
    "All sensitive file patterns identified and documented",
    "Encryption and access control protocols approved",
    "Security testing plan complete",
    "No critical vulnerabilities remain unaddressed",
  ],
};

/**
 * Pre-defined API design review template.
 */
const API_DESIGN_TEMPLATE: DebateTemplate = {
  id: "api_design",
  name: "API Design Review",
  description:
    "Template for evaluating and designing API contracts and interfaces.",
  phases: [
    { type: PhaseType.INITIALIZATION, order: 1, duration: { min: 3, max: 5 } },
    { type: PhaseType.PROPOSAL, order: 2, duration: { min: 10, max: 15 } },
    { type: PhaseType.DISCUSSION, order: 3, duration: { min: 15, max: 20 } },
    { type: PhaseType.CLARIFICATION, order: 4, duration: { min: 10, max: 15 } },
    { type: PhaseType.CRITIQUE, order: 5, duration: { min: 10, max: 15 } },
    { type: PhaseType.REFINEMENT, order: 6, duration: { min: 5, max: 10 } },
    { type: PhaseType.VOTING, order: 7, duration: { min: 5, max: 10 } },
    { type: PhaseType.CONSENSUS_CHECK, order: 8, duration: { min: 3, max: 5 } },
    { type: PhaseType.DOCUMENTATION, order: 9, duration: { min: 10, max: 15 } },
    { type: PhaseType.FINAL_REVIEW, order: 10, duration: { min: 5, max: 10 } },
  ],
  requiredShepherds: [
    ShepherdSpecialty.API_DESIGN,
    ShepherdSpecialty.ARCHITECTURE,
  ],
  optionalShepherds: [
    ShepherdSpecialty.DOCUMENTATION,
    ShepherdSpecialty.SECURITY,
    ShepherdSpecialty.DOMAIN_EXPERT,
  ],
  defaultTimeBoxes: DEFAULT_TIMEBOXES.api_design!,
  customRules: [
    "API specification must be provided in standard format (OpenAPI/Swagger)",
    "Breaking changes must be clearly identified and documented",
    "Versioning strategy must be established",
    "Backward compatibility requirements must be defined",
    "Rate limiting and throttling considerations must be addressed",
  ],
  successCriteria: [
    "Complete API specification approval",
    "Documentation completeness verification",
    "Security review sign-off",
    "Consumer compatibility assessment complete",
  ],
};

/**
 * Manages debate templates with CRUD operations and validation.
 */
export class TemplateManager {
  private registry: TemplateRegistry;

  /**
   * Creates a new TemplateManager instance with default templates.
   */
  constructor() {
    this.registry = {
      templates: new Map<string, DebateTemplate>(),
      defaultTemplate: "feature_design",
    };
    this.registerDefaultTemplates();
  }

  /**
   * Registers all pre-defined templates.
   */
  private registerDefaultTemplates(): void {
    this.registry.templates.set(
      FEATURE_DESIGN_TEMPLATE.id,
      FEATURE_DESIGN_TEMPLATE,
    );
    this.registry.templates.set(
      SECURITY_REVIEW_TEMPLATE.id,
      SECURITY_REVIEW_TEMPLATE,
    );
    this.registry.templates.set(
      PERFORMANCE_OPTIMIZATION_TEMPLATE.id,
      PERFORMANCE_OPTIMIZATION_TEMPLATE,
    );
    this.registry.templates.set(API_DESIGN_TEMPLATE.id, API_DESIGN_TEMPLATE);
    this.registry.templates.set(
      FILE_ORGANIZATION_STRATEGY_TEMPLATE.id,
      FILE_ORGANIZATION_STRATEGY_TEMPLATE,
    );
    this.registry.templates.set(
      DUPLICATE_MANAGEMENT_TEMPLATE.id,
      DUPLICATE_MANAGEMENT_TEMPLATE,
    );
    this.registry.templates.set(
      SENSITIVE_FILE_HANDLING_TEMPLATE.id,
      SENSITIVE_FILE_HANDLING_TEMPLATE,
    );
  }

  /**
   * Retrieves a template by its ID.
   * @param id - The unique identifier of the template
   * @returns The template if found, undefined otherwise
   */
  getTemplate(id: string): DebateTemplate | undefined {
    return this.registry.templates.get(id);
  }

  /**
   * Lists all registered templates.
   * @returns Array of all registered templates
   */
  listTemplates(): DebateTemplate[] {
    return Array.from(this.registry.templates.values());
  }

  /**
   * Registers a new template.
   * @param template - The template to register
   * @returns ValidationResult indicating if registration was successful
   */
  registerTemplate(template: DebateTemplate): ValidationResult {
    const validation = this.validateTemplate(template);

    if (!validation.isValid) {
      return validation;
    }

    this.registry.templates.set(template.id, template);
    validation.warnings.push(
      `Template '${template.id}' registered successfully`,
    );

    return validation;
  }

  /**
   * Validates a template structure.
   * @param template - The template to validate
   * @returns ValidationResult with errors and warnings
   */
  validateTemplate(template: DebateTemplate): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!template.id || typeof template.id !== "string") {
      errors.push("Template must have a non-empty string id");
    }

    if (!template.name || typeof template.name !== "string") {
      errors.push("Template must have a non-empty string name");
    }

    if (!template.description || typeof template.description !== "string") {
      errors.push("Template must have a non-empty string description");
    }

    if (!Array.isArray(template.phases) || template.phases.length === 0) {
      errors.push("Template must have at least one phase");
    } else {
      const orderSet = new Set<number>();
      for (let i = 0; i < template.phases.length; i++) {
        const phase = template.phases[i];
        if (!phase) continue;

        if (!Object.values(PhaseType).includes(phase.type)) {
          errors.push(
            `Phase ${i} has invalid type: ${phase.type}. Must be one of: ${Object.values(PhaseType).join(", ")}`,
          );
        }

        if (typeof phase.order !== "number" || phase.order < 1) {
          errors.push(
            `Phase ${i} must have a valid order number greater than 0`,
          );
        }

        if (orderSet.has(phase.order)) {
          errors.push(`Duplicate phase order found: ${phase.order}`);
        }

        orderSet.add(phase.order);

        if (
          phase.duration &&
          (typeof phase.duration.min !== "number" ||
            typeof phase.duration.max !== "number" ||
            phase.duration.min < 0 ||
            phase.duration.max < phase.duration.min)
        ) {
          errors.push(
            `Phase ${i} has invalid duration configuration. min and max must be valid numbers with min ≤ max`,
          );
        }
      }
    }

    if (
      !Array.isArray(template.requiredShepherds) ||
      template.requiredShepherds.length === 0
    ) {
      warnings.push(
        "Template has no required shepherds specified. This may reduce debate quality.",
      );
    } else {
      const validSpecialties = Object.values(ShepherdSpecialty);
      for (const specialty of template.requiredShepherds) {
        if (!validSpecialties.includes(specialty)) {
          errors.push(
            `Invalid required shepherd specialty: ${specialty}. Must be one of: ${validSpecialties.join(", ")}`,
          );
        }
      }
    }

    if (template.optionalShepherds) {
      if (!Array.isArray(template.optionalShepherds)) {
        errors.push("optionalShepherds must be an array if provided");
      } else {
        const validSpecialties = Object.values(ShepherdSpecialty);
        for (const specialty of template.optionalShepherds) {
          if (!validSpecialties.includes(specialty)) {
            errors.push(
              `Invalid optional shepherd specialty: ${specialty}. Must be one of: ${validSpecialties.join(", ")}`,
            );
          }
        }
      }
    }

    if (
      template.defaultTimeBoxes &&
      typeof template.defaultTimeBoxes !== "object"
    ) {
      errors.push("defaultTimeBoxes must be an object if provided");
    }

    if (!Array.isArray(template.customRules)) {
      errors.push("customRules must be an array");
    }

    if (!Array.isArray(template.successCriteria)) {
      errors.push("successCriteria must be an array");
    }

    if (template.customRules.length === 0) {
      warnings.push("Template has no custom rules defined");
    }

    if (template.successCriteria.length === 0) {
      warnings.push("Template has no success criteria defined");
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Creates a new debate configuration from a template with optional customizations.
   * @param templateId - The ID of the template to use
   * @param customizations - Optional customizations to apply
   * @returns DebateFromTemplate result with the configured debate
   */
  createFromTemplate(
    templateId: string,
    customizations?: TemplateCustomization,
  ): DebateFromTemplate {
    const template = this.registry.templates.get(templateId);

    if (!template) {
      throw new Error(
        `Template with ID '${templateId}' not found. Available templates: ${this.listTemplates()
          .map((t) => t.id)
          .join(", ")}`,
      );
    }

    const appliedCustomizations: TemplateCustomization = {
      name: customizations?.name,
      description: customizations?.description,
      phaseOverrides: customizations?.phaseOverrides || [],
      timeBoxAdjustments: customizations?.timeBoxAdjustments,
      additionalRules: customizations?.additionalRules || [],
      additionalSuccessCriteria:
        customizations?.additionalSuccessCriteria || [],
    };

    const debateConfig: DebateTemplate = {
      ...template,
      id: `${template.id}_${Date.now()}`,
      name: customizations?.name || template.name,
      description: customizations?.description || template.description,
      customRules: [
        ...template.customRules,
        ...(appliedCustomizations.additionalRules || []),
      ],
      successCriteria: [
        ...template.successCriteria,
        ...(appliedCustomizations.additionalSuccessCriteria || []),
      ],
      defaultTimeBoxes: {
        ...template.defaultTimeBoxes,
        ...customizations?.timeBoxAdjustments,
      },
    };

    if (
      customizations?.phaseOverrides &&
      customizations.phaseOverrides.length > 0
    ) {
      debateConfig.phases = this.applyPhaseOverrides(
        template.phases,
        customizations.phaseOverrides,
      );
    }

    return {
      templateId,
      debateId: debateConfig.id,
      configuration: debateConfig,
      appliedCustomizations,
    };
  }

  /**
   * Applies phase overrides to template phases.
   */
  private applyPhaseOverrides(
    originalPhases: PhaseConfig[],
    overrides: Partial<PhaseConfig>[],
  ): PhaseConfig[] {
    return originalPhases.map((phase, index) => {
      const override = overrides[index];
      if (override) {
        return { ...phase, ...override };
      }
      return phase;
    });
  }

  /**
   * Gets the default template ID.
   * @returns The default template ID
   */
  getDefaultTemplateId(): string {
    return this.registry.defaultTemplate;
  }

  /**
   * Sets the default template.
   * @param templateId - The ID of the template to set as default
   * @returns true if successful, false if template not found
   */
  setDefaultTemplate(templateId: string): boolean {
    if (this.registry.templates.has(templateId)) {
      this.registry.defaultTemplate = templateId;
      return true;
    }
    return false;
  }

  /**
   * Unregisters a template.
   * @param templateId - The ID of the template to unregister
   * @returns true if removed, false if not found
   */
  unregisterTemplate(templateId: string): boolean {
    if (templateId === this.registry.defaultTemplate) {
      console.warn(
        `Cannot unregister default template '${templateId}'. Set a new default first.`,
      );
      return false;
    }
    return this.registry.templates.delete(templateId);
  }

  /**
   * Gets statistics about registered templates.
   * @returns Object with template statistics
   */
  getStats(): {
    totalTemplates: number;
    templatesByType: Record<string, number>;
  } {
    const templates = this.listTemplates();
    const templatesByType: Record<string, number> = {};

    for (const template of templates) {
      const type = template.id.split("_")[0] || "other";
      templatesByType[type] = (templatesByType[type] || 0) + 1;
    }

    return {
      totalTemplates: templates.length,
      templatesByType,
    };
  }
}

/**
 * Creates a new TemplateRegistry instance.
 * @returns Initialized TemplateRegistry with default templates
 */
export function createTemplateRegistry(): TemplateRegistry {
  const manager = new TemplateManager();
  return {
    templates: manager["registry"].templates,
    defaultTemplate: manager.getDefaultTemplateId(),
  };
}

// =============================================================================
// UNIT TESTS
// =============================================================================

describe("TemplateManager", () => {
  let templateManager: TemplateManager;

  beforeEach(() => {
    templateManager = new TemplateManager();
  });

  describe("getTemplate", () => {
    it("should return feature_design template", () => {
      const template = templateManager.getTemplate("feature_design");

      expect(template).toBeDefined();
      expect(template?.id).toBe("feature_design");
      expect(template?.name).toBe("Feature Design Review");
    });

    it("should return security_review template", () => {
      const template = templateManager.getTemplate("security_review");

      expect(template).toBeDefined();
      expect(template?.id).toBe("security_review");
      expect(template?.phases).toContainEqual(
        expect.objectContaining({ type: PhaseType.SECURITY_GATE }),
      );
    });

    it("should return performance_optimization template", () => {
      const template = templateManager.getTemplate("performance_optimization");

      expect(template).toBeDefined();
      expect(template?.id).toBe("performance_optimization");
    });

    it("should return api_design template", () => {
      const template = templateManager.getTemplate("api_design");

      expect(template).toBeDefined();
      expect(template?.id).toBe("api_design");
      expect(template?.phases).toContainEqual(
        expect.objectContaining({ type: PhaseType.DOCUMENTATION }),
      );
    });

    it("should return undefined for non-existent template", () => {
      const template = templateManager.getTemplate("non_existent");

      expect(template).toBeUndefined();
    });
  });

  describe("listTemplates", () => {
    it("should return all 4 default templates", () => {
      const templates = templateManager.listTemplates();

      expect(templates).toHaveLength(4);
    });

    it("should include all expected template IDs", () => {
      const templates = templateManager.listTemplates();
      const ids = templates.map((t) => t.id);

      expect(ids).toContain("feature_design");
      expect(ids).toContain("security_review");
      expect(ids).toContain("performance_optimization");
      expect(ids).toContain("api_design");
    });
  });

  describe("validateTemplate", () => {
    it("should validate a valid template successfully", () => {
      const validTemplate: DebateTemplate = {
        id: "test_template",
        name: "Test Template",
        description: "A test template",
        phases: [
          {
            type: PhaseType.INITIALIZATION,
            order: 1,
            duration: { min: 5, max: 10 },
          },
          { type: PhaseType.VOTING, order: 2 },
        ],
        requiredShepherds: [ShepherdSpecialty.ARCHITECTURE],
        optionalShepherds: [ShepherdSpecialty.SECURITY],
        defaultTimeBoxes: { initialization: 5, voting: 10 },
        customRules: ["Test rule"],
        successCriteria: ["Test success criteria"],
      };

      const result = templateManager.validateTemplate(validTemplate);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject template with missing id", () => {
      const invalidTemplate = {
        id: "",
        name: "Test",
        description: "Test description",
        phases: [{ type: PhaseType.VOTING, order: 1 }],
        requiredShepherds: [],
        optionalShepherds: [],
        defaultTimeBoxes: {},
        customRules: [],
        successCriteria: [],
      } as DebateTemplate;

      const result = templateManager.validateTemplate(invalidTemplate);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining("id"));
    });

    it("should reject template with invalid phase type", () => {
      const invalidTemplate: DebateTemplate = {
        id: "test",
        name: "Test",
        description: "Test",
        phases: [{ type: "invalid_phase" as PhaseType, order: 1 }],
        requiredShepherds: [],
        optionalShepherds: [],
        defaultTimeBoxes: {},
        customRules: [],
        successCriteria: [],
      };

      const result = templateManager.validateTemplate(invalidTemplate);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("invalid type"))).toBe(true);
    });

    it("should reject template with duplicate phase orders", () => {
      const invalidTemplate: DebateTemplate = {
        id: "test",
        name: "Test",
        description: "Test",
        phases: [
          { type: PhaseType.INITIALIZATION, order: 1 },
          { type: PhaseType.VOTING, order: 1 },
        ],
        requiredShepherds: [],
        optionalShepherds: [],
        defaultTimeBoxes: {},
        customRules: [],
        successCriteria: [],
      };

      const result = templateManager.validateTemplate(invalidTemplate);

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("Duplicate phase order")),
      ).toBe(true);
    });

    it("should reject template with invalid shepherd specialty", () => {
      const invalidTemplate: DebateTemplate = {
        id: "test",
        name: "Test",
        description: "Test",
        phases: [{ type: PhaseType.VOTING, order: 1 }],
        requiredShepherds: ["invalid_specialty" as ShepherdSpecialty],
        optionalShepherds: [],
        defaultTimeBoxes: {},
        customRules: [],
        successCriteria: [],
      };

      const result = templateManager.validateTemplate(invalidTemplate);

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("Invalid required shepherd")),
      ).toBe(true);
    });

    it("should warn about template without custom rules", () => {
      const templateWithoutRules: DebateTemplate = {
        id: "test",
        name: "Test",
        description: "Test",
        phases: [{ type: PhaseType.VOTING, order: 1 }],
        requiredShepherds: [],
        optionalShepherds: [],
        defaultTimeBoxes: {},
        customRules: [],
        successCriteria: [],
      };

      const result = templateManager.validateTemplate(templateWithoutRules);

      expect(result.warnings.some((w) => w.includes("no custom rules"))).toBe(
        true,
      );
    });
  });

  describe("registerTemplate", () => {
    it("should register a valid template", () => {
      const newTemplate: DebateTemplate = {
        id: "custom_template",
        name: "Custom Template",
        description: "A custom template",
        phases: [
          { type: PhaseType.INITIALIZATION, order: 1 },
          { type: PhaseType.VOTING, order: 2 },
        ],
        requiredShepherds: [ShepherdSpecialty.ARCHITECTURE],
        optionalShepherds: [],
        defaultTimeBoxes: { initialization: 5, voting: 10 },
        customRules: ["Custom rule"],
        successCriteria: ["Success criteria"],
      };

      const result = templateManager.registerTemplate(newTemplate);

      expect(result.isValid).toBe(true);
      expect(templateManager.getTemplate("custom_template")).toBeDefined();
    });

    it("should not register an invalid template", () => {
      const invalidTemplate: DebateTemplate = {
        id: "",
        name: "Invalid",
        description: "Invalid",
        phases: [],
        requiredShepherds: [],
        optionalShepherds: [],
        defaultTimeBoxes: {},
        customRules: [],
        successCriteria: [],
      };

      const result = templateManager.registerTemplate(invalidTemplate);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should not allow duplicate template IDs", () => {
      const duplicateTemplate: DebateTemplate = {
        id: "feature_design",
        name: "Duplicate",
        description: "Duplicate",
        phases: [{ type: PhaseType.VOTING, order: 1 }],
        requiredShepherds: [],
        optionalShepherds: [],
        defaultTimeBoxes: {},
        customRules: [],
        successCriteria: [],
      };

      const result = templateManager.registerTemplate(duplicateTemplate);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("duplicate"))).toBe(true);
    });
  });

  describe("createFromTemplate", () => {
    it("should create a debate from feature_design template", () => {
      const result = templateManager.createFromTemplate("feature_design");

      expect(result.templateId).toBe("feature_design");
      expect(result.debateId).toContain("feature_design");
      expect(result.configuration.phases).toHaveLength(
        templateManager.getTemplate("feature_design")!.phases.length,
      );
    });

    it("should apply name customization", () => {
      const result = templateManager.createFromTemplate("feature_design", {
        name: "Custom Feature Review",
      });

      expect(result.configuration.name).toBe("Custom Feature Review");
    });

    it("should apply description customization", () => {
      const result = templateManager.createFromTemplate("feature_design", {
        description: "Custom description",
      });

      expect(result.configuration.description).toBe("Custom description");
    });

    it("should apply additional rules", () => {
      const result = templateManager.createFromTemplate("feature_design", {
        additionalRules: ["Additional rule 1", "Additional rule 2"],
      });

      expect(result.configuration.customRules).toContain("Additional rule 1");
      expect(result.configuration.customRules).toContain("Additional rule 2");
    });

    it("should apply additional success criteria", () => {
      const result = templateManager.createFromTemplate("feature_design", {
        additionalSuccessCriteria: ["Additional criteria"],
      });

      expect(result.configuration.successCriteria).toContain(
        "Additional criteria",
      );
    });

    it("should apply timebox adjustments", () => {
      const result = templateManager.createFromTemplate("feature_design", {
        timeBoxAdjustments: { initialization: 10, discussion: 30 },
      });

      expect(result.configuration.defaultTimeBoxes.initialization).toBe(10);
      expect(result.configuration.defaultTimeBoxes.discussion).toBe(30);
    });

    it("should throw error for non-existent template", () => {
      expect(() => {
        templateManager.createFromTemplate("non_existent");
      }).toThrow("Template with ID 'non_existent' not found");
    });

    it("should preserve original template phases when no overrides provided", () => {
      const original = templateManager.getTemplate("feature_design")!;
      const result = templateManager.createFromTemplate("feature_design");

      expect(result.configuration.phases.length).toBe(original.phases.length);
      expect(result.configuration.phases[0]?.type).toBe(
        original.phases[0]?.type,
      );
    });

    it("should generate unique debate IDs", () => {
      const result1 = templateManager.createFromTemplate("feature_design");
      const result2 = templateManager.createFromTemplate("feature_design");

      expect(result1.debateId).not.toBe(result2.debateId);
    });
  });

  describe("getDefaultTemplateId", () => {
    it("should return feature_design as default", () => {
      const defaultId = templateManager.getDefaultTemplateId();

      expect(defaultId).toBe("feature_design");
    });
  });

  describe("setDefaultTemplate", () => {
    it("should set a new default template", () => {
      const result = templateManager.setDefaultTemplate("security_review");

      expect(result).toBe(true);
      expect(templateManager.getDefaultTemplateId()).toBe("security_review");
    });

    it("should return false for non-existent template", () => {
      const result = templateManager.setDefaultTemplate("non_existent");

      expect(result).toBe(false);
      expect(templateManager.getDefaultTemplateId()).toBe("feature_design");
    });
  });

  describe("unregisterTemplate", () => {
    it("should unregister a non-default template", () => {
      templateManager.registerTemplate({
        id: "temp_template",
        name: "Temp",
        description: "Temp",
        phases: [{ type: PhaseType.VOTING, order: 1 }],
        requiredShepherds: [],
        optionalShepherds: [],
        defaultTimeBoxes: {},
        customRules: [],
        successCriteria: [],
      });

      const result = templateManager.unregisterTemplate("temp_template");

      expect(result).toBe(true);
      expect(templateManager.getTemplate("temp_template")).toBeUndefined();
    });

    it("should not unregister default template", () => {
      const result = templateManager.unregisterTemplate("feature_design");

      expect(result).toBe(false);
      expect(templateManager.getTemplate("feature_design")).toBeDefined();
    });
  });

  describe("getStats", () => {
    it("should return correct statistics", () => {
      const stats = templateManager.getStats();

      expect(stats.totalTemplates).toBe(4);
      expect(stats.templatesByType.feature).toBe(1);
      expect(stats.templatesByType.security).toBe(1);
      expect(stats.templatesByType.performance).toBe(1);
      expect(stats.templatesByType.api).toBe(1);
    });
  });

  describe("PhaseType enum", () => {
    it("should contain all expected phase types", () => {
      expect(PhaseType.INITIALIZATION).toBe("initialization");
      expect(PhaseType.PROPOSAL).toBe("proposal");
      expect(PhaseType.DISCUSSION).toBe("discussion");
      expect(PhaseType.CLARIFICATION).toBe("clarification");
      expect(PhaseType.CRITIQUE).toBe("critique");
      expect(PhaseType.REFINEMENT).toBe("refinement");
      expect(PhaseType.VOTING).toBe("voting");
      expect(PhaseType.CONSENSUS_CHECK).toBe("consensus_check");
      expect(PhaseType.SECURITY_GATE).toBe("security_gate");
      expect(PhaseType.FINAL_REVIEW).toBe("final_review");
      expect(PhaseType.DOCUMENTATION).toBe("documentation");
    });
  });

  describe("ShepherdSpecialty enum", () => {
    it("should contain all expected specialties", () => {
      expect(ShepherdSpecialty.ARCHITECTURE).toBe("architecture");
      expect(ShepherdSpecialty.SECURITY).toBe("security");
      expect(ShepherdSpecialty.PERFORMANCE).toBe("performance");
      expect(ShepherdSpecialty.API_DESIGN).toBe("api_design");
      expect(ShepherdSpecialty.UX).toBe("ux");
      expect(ShepherdSpecialty.TESTING).toBe("testing");
      expect(ShepherdSpecialty.DOCUMENTATION).toBe("documentation");
      expect(ShepherdSpecialty.DEVOPS).toBe("devops");
      expect(ShepherdSpecialty.DOMAIN_EXPERT).toBe("domain_expert");
      expect(ShepherdSpecialty.GENERAL).toBe("general");
    });
  });

  describe("Pre-defined template configurations", () => {
    it("should have security_review with security_gate phase", () => {
      const securityTemplate = templateManager.getTemplate("security_review")!;

      expect(securityTemplate.phases).toContainEqual(
        expect.objectContaining({ type: PhaseType.SECURITY_GATE }),
      );
      expect(securityTemplate.phases).toContainEqual(
        expect.objectContaining({
          type: PhaseType.SECURITY_GATE,
          participation: { required: true, minVotes: 3 },
        }),
      );
    });

    it("should have api_design with documentation phase", () => {
      const apiTemplate = templateManager.getTemplate("api_design")!;

      expect(apiTemplate.phases).toContainEqual(
        expect.objectContaining({ type: PhaseType.DOCUMENTATION }),
      );
    });

    it("should have correct default timeboxes", () => {
      const featureTemplate = templateManager.getTemplate("feature_design")!;

      expect(featureTemplate.defaultTimeBoxes.initialization).toBe(5);
      expect(featureTemplate.defaultTimeBoxes.proposal).toBe(15);
      expect(featureTemplate.defaultTimeBoxes.discussion).toBe(20);
    });

    it("should have required shepherds for each template", () => {
      const templates = templateManager.listTemplates();

      for (const template of templates) {
        expect(template.requiredShepherds.length).toBeGreaterThan(0);
      }
    });
  });
});

describe("TemplateRegistry Interface", () => {
  let templateManager: TemplateManager;

  beforeEach(() => {
    templateManager = new TemplateManager();
  });

  it("should implement TemplateRegistry interface", () => {
    const registry: TemplateRegistry = {
      templates: templateManager["registry"].templates,
      defaultTemplate: templateManager.getDefaultTemplateId(),
    };

    expect(registry.templates).toBeInstanceOf(Map);
    expect(typeof registry.defaultTemplate).toBe("string");
  });

  it("should contain all templates in registry", () => {
    const registry = createTemplateRegistry();

    expect(registry.templates.size).toBe(4);
    expect(registry.templates.has("feature_design")).toBe(true);
    expect(registry.templates.has("security_review")).toBe(true);
    expect(registry.templates.has("performance_optimization")).toBe(true);
    expect(registry.templates.has("api_design")).toBe(true);
  });
});

describe("Edge Cases", () => {
  let templateManager: TemplateManager;

  beforeEach(() => {
    templateManager = new TemplateManager();
  });

  it("should handle template with phase duration of zero", () => {
    const template: DebateTemplate = {
      id: "edge_test",
      name: "Edge Test",
      description: "Test",
      phases: [
        {
          type: PhaseType.INITIALIZATION,
          order: 1,
          duration: { min: 0, max: 0 },
        },
      ],
      requiredShepherds: [],
      optionalShepherds: [],
      defaultTimeBoxes: {},
      customRules: [],
      successCriteria: [],
    };

    const result = templateManager.validateTemplate(template);

    expect(result.isValid).toBe(true);
  });

  it("should handle empty optionalShepherds array", () => {
    const template: DebateTemplate = {
      id: "edge_test",
      name: "Edge Test",
      description: "Test",
      phases: [{ type: PhaseType.VOTING, order: 1 }],
      requiredShepherds: [ShepherdSpecialty.ARCHITECTURE],
      optionalShepherds: [],
      defaultTimeBoxes: {},
      customRules: [],
      successCriteria: [],
    };

    const result = templateManager.validateTemplate(template);

    expect(result.isValid).toBe(true);
  });

  it("should handle empty customRules and successCriteria", () => {
    const template: DebateTemplate = {
      id: "edge_test",
      name: "Edge Test",
      description: "Test",
      phases: [{ type: PhaseType.VOTING, order: 1 }],
      requiredShepherds: [ShepherdSpecialty.ARCHITECTURE],
      optionalShepherds: [],
      defaultTimeBoxes: {},
      customRules: [],
      successCriteria: [],
    };

    const result = templateManager.validateTemplate(template);

    expect(result.isValid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("should preserve all applied customizations", () => {
    const result = templateManager.createFromTemplate("feature_design", {
      name: "Custom Name",
      description: "Custom Description",
      additionalRules: ["Rule 1", "Rule 2"],
      additionalSuccessCriteria: ["Criteria 1"],
      timeBoxAdjustments: { initialization: 15 },
    });

    expect(result.appliedCustomizations.name).toBe("Custom Name");
    expect(result.appliedCustomizations.description).toBe("Custom Description");
    expect(result.appliedCustomizations.additionalRules).toHaveLength(2);
    expect(result.appliedCustomizations.additionalSuccessCriteria).toHaveLength(
      1,
    );
    expect(
      result.appliedCustomizations.timeBoxAdjustments?.initialization,
    ).toBe(15);
  });

  it("should handle phase overrides correctly", () => {
    const result = templateManager.createFromTemplate("feature_design", {
      phaseOverrides: [
        { duration: { min: 10, max: 20 } },
        { participation: { required: true, minVotes: 2 } },
      ],
    });

    expect(result.configuration.phases[0]?.duration?.min).toBe(10);
    expect(result.configuration.phases[1]?.participation?.required).toBe(true);
  });
});

// =============================================================================
// EXAMPLE USAGE
// =============================================================================

/**
 * Example usage demonstrating the Debate Templates System.
 */
async function demonstrateTemplateSystem(): Promise<void> {
  console.log("=== Debate Templates System Demo ===\n");

  // Create template manager
  const manager = new TemplateManager();

  // List all available templates
  console.log("Available Templates:");
  const templates = manager.listTemplates();
  templates.forEach((template) => {
    console.log(`  - ${template.id}: ${template.name}`);
  });
  console.log();

  // Get specific template
  const featureTemplate = manager.getTemplate("feature_design");
  console.log("Feature Design Template:");
  console.log(`  Name: ${featureTemplate?.name}`);
  console.log(`  Phases: ${featureTemplate?.phases.length}`);
  console.log(
    `  Required Shepherds: ${featureTemplate?.requiredShepherds.join(", ")}`,
  );
  console.log();

  // Create debate from template with customizations
  const debate = manager.createFromTemplate("feature_design", {
    name: "New Feature: User Dashboard",
    description: "Comprehensive review of the new user dashboard feature",
    additionalRules: [
      "Mobile responsiveness must be considered",
      "Accessibility requirements must be met",
    ],
    additionalSuccessCriteria: ["Complete accessibility audit"],
    timeBoxAdjustments: {
      discussion: 25,
    },
  });

  console.log("Created Debate from Template:");
  console.log(`  Debate ID: ${debate.debateId}`);
  console.log(`  Name: ${debate.configuration.name}`);
  console.log(`  Custom Rules: ${debate.configuration.customRules.slice(-2)}`);
  console.log();

  // Validate a template
  const newTemplate: DebateTemplate = {
    id: "custom_review",
    name: "Custom Review",
    description: "A custom review template",
    phases: [
      {
        type: PhaseType.INITIALIZATION,
        order: 1,
        duration: { min: 5, max: 10 },
      },
      { type: PhaseType.DISCUSSION, order: 2 },
      { type: PhaseType.VOTING, order: 3 },
    ],
    requiredShepherds: [
      ShepherdSpecialty.ARCHITECTURE,
      ShepherdSpecialty.DOMAIN_EXPERT,
    ],
    optionalShepherds: [ShepherdSpecialty.SECURITY],
    defaultTimeBoxes: { initialization: 5, discussion: 20, voting: 10 },
    customRules: ["All shepherds must participate"],
    successCriteria: ["Consensus reached"],
  };

  const validation = manager.validateTemplate(newTemplate);
  console.log("Template Validation:");
  console.log(`  Is Valid: ${validation.isValid}`);
  console.log(`  Errors: ${validation.errors.length}`);
  console.log(`  Warnings: ${validation.warnings.length}`);
  console.log();

  // Register the validated template
  if (validation.isValid) {
    manager.registerTemplate(newTemplate);
    console.log("Custom template registered successfully!");
  }

  // Get template statistics
  const stats = manager.getStats();
  console.log("\nTemplate Statistics:");
  console.log(`  Total Templates: ${stats.totalTemplates}`);
  console.log(`  By Type: ${JSON.stringify(stats.templatesByType)}`);

  console.log("\n=== Demo Complete ===");
}

// Run example if this file is executed directly
demonstrateTemplateSystem().catch(console.error);

// Export for use in other modules
export {
  FEATURE_DESIGN_TEMPLATE,
  SECURITY_REVIEW_TEMPLATE,
  PERFORMANCE_OPTIMIZATION_TEMPLATE,
  API_DESIGN_TEMPLATE,
  FILE_ORGANIZATION_STRATEGY_TEMPLATE,
  DUPLICATE_MANAGEMENT_TEMPLATE,
  SENSITIVE_FILE_HANDLING_TEMPLATE,
};
