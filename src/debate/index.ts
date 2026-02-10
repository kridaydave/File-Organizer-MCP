/**
 * Jonnah Auto-Documentation Generator - Debate Module
 */

export * from "./documentation-generator.js";
export type {
  DebateDashboard,
  ActivityMetrics,
  ProposalMetrics,
  Conflict,
  PhaseType,
} from "./dashboard.js";
export {
  DashboardRenderer,
  WebDashboardServer,
  DashboardBuilder,
  getRealTimeUpdate,
  shepherdId,
  proposalId,
} from "./dashboard.js";
