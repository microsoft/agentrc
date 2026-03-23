import type { RepoApp, RepoAnalysis, Area } from "../analyzer";
import type { Recommendation, Signal, PolicyWarning, Grade } from "../policy/types";

export type ReadinessPillar =
  | "style-validation"
  | "build-system"
  | "testing"
  | "documentation"
  | "dev-environment"
  | "code-quality"
  | "observability"
  | "security-governance"
  | "workflow-automation"
  | "ai-tooling";

export type PillarGroup = "repo-health" | "ai-setup";

export const PILLAR_GROUPS: Record<ReadinessPillar, PillarGroup> = {
  "style-validation": "repo-health",
  "build-system": "repo-health",
  testing: "repo-health",
  documentation: "repo-health",
  "dev-environment": "repo-health",
  "code-quality": "repo-health",
  observability: "repo-health",
  "security-governance": "repo-health",
  "workflow-automation": "repo-health",
  "ai-tooling": "ai-setup"
};

export const PILLAR_GROUP_NAMES: Record<PillarGroup, string> = {
  "repo-health": "Repo Health",
  "ai-setup": "AI Setup"
};

export type ReadinessScope = "repo" | "app" | "area";

export type ReadinessStatus = "pass" | "fail" | "skip";

export type ReadinessCriterionResult = {
  id: string;
  title: string;
  pillar: ReadinessPillar;
  level: number;
  scope: ReadinessScope;
  impact: "high" | "medium" | "low";
  effort: "low" | "medium" | "high";
  status: ReadinessStatus;
  reason?: string;
  evidence?: string[];
  passRate?: number;
  appSummary?: { passed: number; total: number };
  appFailures?: string[];
  areaSummary?: { passed: number; total: number };
  areaFailures?: string[];
};

export type ReadinessExtraResult = {
  id: string;
  title: string;
  status: ReadinessStatus;
  reason?: string;
};

export type ReadinessPillarSummary = {
  id: ReadinessPillar;
  name: string;
  passed: number;
  total: number;
  passRate: number;
};

export type ReadinessLevelSummary = {
  level: number;
  name: string;
  passed: number;
  total: number;
  passRate: number;
  achieved: boolean;
};

export type AreaReadinessReport = {
  area: Area;
  criteria: ReadinessCriterionResult[];
  pillars: ReadinessPillarSummary[];
};

export type ReadinessReport = {
  repoPath: string;
  generatedAt: string;
  isMonorepo: boolean;
  apps: Array<{ name: string; path: string }>;
  pillars: ReadinessPillarSummary[];
  levels: ReadinessLevelSummary[];
  achievedLevel: number;
  criteria: ReadinessCriterionResult[];
  extras: ReadinessExtraResult[];
  areaReports?: AreaReadinessReport[];
  policies?: { chain: string[]; criteriaCount: number };
  /** New plugin engine data (populated when using the unified engine). */
  engine?: {
    signals: ReadonlyArray<Signal>;
    recommendations: ReadonlyArray<Recommendation>;
    policyWarnings: ReadonlyArray<PolicyWarning>;
    score: number;
    grade: Grade;
  };
};

export type ReadinessContext = {
  repoPath: string;
  analysis: RepoAnalysis;
  apps: RepoApp[];
  rootFiles: string[];
  rootPackageJson?: Record<string, unknown>;
  areaPath?: string;
  areaFiles?: string[];
};

export type ReadinessCriterion = {
  id: string;
  title: string;
  pillar: ReadinessPillar;
  level: number;
  scope: ReadinessScope;
  impact: "high" | "medium" | "low";
  effort: "low" | "medium" | "high";
  check: (context: ReadinessContext, app?: RepoApp, area?: Area) => Promise<CheckResult>;
};

export type CheckResult = {
  status: ReadinessStatus;
  reason?: string;
  evidence?: string[];
};

export type InstructionConsistencyResult = {
  unified: boolean;
  files: string[];
  similarity?: number;
};
