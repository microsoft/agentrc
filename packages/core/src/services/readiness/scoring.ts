import { PILLAR_GROUP_NAMES, PILLAR_GROUPS } from "./types";
import type {
  ReadinessCriterionResult,
  ReadinessPillar,
  ReadinessPillarSummary,
  ReadinessLevelSummary
} from "./types";
import type { PillarGroup } from "./types";

export function groupPillars(
  pillars: ReadinessPillarSummary[]
): Array<{ group: PillarGroup; label: string; pillars: ReadinessPillarSummary[] }> {
  const groups: PillarGroup[] = ["repo-health", "ai-setup"];
  return groups.map((group) => ({
    group,
    label: PILLAR_GROUP_NAMES[group],
    pillars: pillars.filter((p) => PILLAR_GROUPS[p.id] === group)
  }));
}

export function getLevelName(level: number): string {
  const names: Record<number, string> = {
    1: "Functional",
    2: "Documented",
    3: "Standardized",
    4: "Optimized",
    5: "Autonomous"
  };
  return names[level] || "Unknown";
}

export function getLevelDescription(level: number): string {
  const descriptions: Record<number, string> = {
    1: "Repo builds, tests run, and basic tooling (linter, lockfile) is in place. AI agents can clone and get started.",
    2: "README, CONTRIBUTING guide, and custom instructions exist. Agents understand project context and conventions.",
    3: "CI/CD, security policies, CODEOWNERS, and observability are configured. Agents operate within well-defined guardrails.",
    4: "MCP servers, custom agents, and AI skills are set up. Agents have deep integration with project-specific tools and workflows.",
    5: "Full AI-native development: agents can independently plan, implement, test, and ship changes with minimal human oversight."
  };
  return descriptions[level] || "";
}

export function summarizePillars(criteria: ReadinessCriterionResult[]): ReadinessPillarSummary[] {
  const pillarNames: Record<ReadinessPillar, string> = {
    "style-validation": "Style & Validation",
    "build-system": "Build System",
    testing: "Testing",
    documentation: "Documentation",
    "dev-environment": "Dev Environment",
    "code-quality": "Code Quality",
    observability: "Observability",
    "security-governance": "Security & Governance",
    "ai-tooling": "AI Tooling"
  };

  return (Object.keys(pillarNames) as ReadinessPillar[]).map((pillar) => {
    const items = criteria.filter((criterion) => criterion.pillar === pillar);
    const { passed, total } = countStatus(items);
    return {
      id: pillar,
      name: pillarNames[pillar],
      passed,
      total,
      passRate: total ? passed / total : 0
    };
  });
}

export function summarizeLevels(
  criteria: ReadinessCriterionResult[],
  passRateThreshold = 0.8
): ReadinessLevelSummary[] {
  const levelNames: Record<number, string> = {
    1: "Functional",
    2: "Documented",
    3: "Standardized",
    4: "Optimized",
    5: "Autonomous"
  };

  const summaries: ReadinessLevelSummary[] = [];
  for (let level = 1; level <= 5; level += 1) {
    const items = criteria.filter((criterion) => criterion.level === level);
    const { passed, total } = countStatus(items);
    const passRate = total ? passed / total : 0;
    summaries.push({
      level,
      name: levelNames[level],
      passed,
      total,
      passRate,
      achieved: false
    });
  }

  for (const summary of summaries) {
    const allPrior = summaries.filter((candidate) => candidate.level <= summary.level);
    const achieved = allPrior.every(
      (candidate) => candidate.total > 0 && candidate.passRate >= passRateThreshold
    );
    summary.achieved = achieved;
  }

  return summaries;
}

export function countStatus(items: ReadinessCriterionResult[]): { passed: number; total: number } {
  const relevant = items.filter((item) => item.status !== "skip");
  const passed = relevant.filter((item) => item.status === "pass").length;
  return { passed, total: relevant.length };
}
