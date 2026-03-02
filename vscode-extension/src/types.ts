/**
 * Re-export AgentRC CLI types for use in the extension.
 */
export type {
  RepoAnalysis,
  AgentrcConfig,
  AgentrcConfigWorkspace,
  AgentrcConfigArea
} from "agentrc/services/analyzer.js";

export type {
  ReadinessReport,
  ReadinessPillarSummary,
  ReadinessCriterionResult,
  ReadinessLevelSummary
} from "agentrc/services/readiness.js";
