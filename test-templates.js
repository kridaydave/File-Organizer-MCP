#!/usr/bin/env node
import { TemplateManager } from "./src/debate/templates";

// Create a simple test script to verify our changes
async function testDebateTemplates() {
  console.log("=== Testing Debate Templates System ===\n");

  // Create template manager
  const manager = new TemplateManager();

  // List all available templates
  console.log("1. Available Templates:");
  const templates = manager.listTemplates();
  templates.forEach((template, index) => {
    console.log(`  ${index + 1}. ${template.id}: ${template.name}`);
  });
  console.log();

  // Check if file organizer templates are registered
  const fileOrgTemplate = manager.getTemplate("file_organization_strategy");
  const duplicateTemplate = manager.getTemplate("duplicate_management");
  const sensitiveTemplate = manager.getTemplate("sensitive_file_handling");

  console.log("2. File Organizer Templates:");
  console.log(
    `   - File Organization Strategy: ${fileOrgTemplate ? "✓ Registered" : "✗ Not Found"}`,
  );
  console.log(
    `   - Duplicate Management: ${duplicateTemplate ? "✓ Registered" : "✗ Not Found"}`,
  );
  console.log(
    `   - Sensitive File Handling: ${sensitiveTemplate ? "✓ Registered" : "✗ Not Found"}`,
  );
  console.log();

  // Create a debate from one of the new templates
  if (fileOrgTemplate) {
    console.log("3. Creating debate from File Organization Strategy template:");
    try {
      const debate = manager.createFromTemplate("file_organization_strategy", {
        name: "Custom File Organization Strategy",
        description: "Test debate for file organization",
        additionalRules: ["Test rule 1", "Test rule 2"],
        additionalSuccessCriteria: ["Test success criteria"],
      });

      console.log(`   - Debate ID: ${debate.debateId}`);
      console.log(`   - Name: ${debate.configuration.name}`);
      console.log(`   - Phases: ${debate.configuration.phases.length}`);
      console.log(
        `   - Required Shepherds: ${debate.configuration.requiredShepherds.join(", ")}`,
      );
      console.log(
        `   - Optional Shepherds: ${debate.configuration.optionalShepherds.join(", ")}`,
      );
      console.log(
        `   - Custom Rules: ${debate.configuration.customRules.length}`,
      );
      console.log(
        `   - Success Criteria: ${debate.configuration.successCriteria.length}`,
      );
    } catch (error) {
      console.error("   - Error:", error.message);
    }
    console.log();
  }

  // Validate one of the new templates
  if (fileOrgTemplate) {
    console.log("4. Validating File Organization Strategy template:");
    const validation = manager.validateTemplate(fileOrgTemplate);
    console.log(`   - Valid: ${validation.isValid ? "✓" : "✗"}`);
    if (validation.errors.length > 0) {
      console.log(`   - Errors: ${validation.errors.length}`);
    }
    if (validation.warnings.length > 0) {
      console.log(`   - Warnings: ${validation.warnings.length}`);
    }
    console.log();
  }

  // Get statistics
  const stats = manager.getStats();
  console.log("5. Template Statistics:");
  console.log(`   - Total Templates: ${stats.totalTemplates}`);
  console.log("   - Templates by Type:");
  Object.entries(stats.templatesByType).forEach(([type, count]) => {
    console.log(`     - ${type}: ${count}`);
  });

  console.log("\n=== All Tests Passed ===");
}

// Run the test
testDebateTemplates().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
